"""WebRTC gateway: DTLS-SRTP terminator that bridges browsers to the
plain-RTP world the rest of SMURF speaks.

Browsers will not negotiate plain RTP/AVP — they require DTLS-SRTP for
the media plane and a normalised SDP that uses ``RTP/SAVPF``.  We rely on
``aiortc`` purely as a low-level WebRTC stack (DTLS handshake, ICE,
SRTP).  The PBX logic, dial plan, B2BUA, registrar, etc. remain entirely
written from scratch in this repository.

Public surface:

* ``WebRTCBridge.handle_offer(sdp_offer)`` -> ``(answer_sdp, RtpEndpoint)``
  where ``RtpEndpoint`` exposes ``send_pcm`` / ``recv_queue`` / ``close``
  so the B2BUA can hand it the same way it does a regular ``RTPSession``.

* ``WebRTCBridge.handle_offer_for_uas(sdp_offer)`` is used when the
  browser is the callee — same interface but waits for the offer to come
  from the SIP side.
"""

from __future__ import annotations

import asyncio
import audioop
import fractions
from dataclasses import dataclass
from typing import Optional

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaStreamError
from aiortc.mediastreams import MediaStreamTrack
from av import AudioFrame  # bundled by aiortc

from ..core.log import get_logger
from ..rtp.session import RTPSession

log = get_logger("smurf.pbx.webrtc")
SAMPLES_PER_FRAME = 160  # 20 ms @ 8 kHz
FRAME_BYTES = SAMPLES_PER_FRAME * 2


class _BridgeAudioTrack(MediaStreamTrack):
    """Outbound track: forwards PCM frames pushed by the B2BUA to the browser.

    aiortc consumes frames at a steady cadence by calling ``recv()``; we
    keep a small queue and synthesise silence when starved so timing
    never drifts.
    """

    kind = "audio"

    def __init__(self) -> None:
        super().__init__()
        self.queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)
        self._pts = 0
        self._sample_rate = 8000

    async def recv(self) -> AudioFrame:
        try:
            pcm = self.queue.get_nowait()
        except asyncio.QueueEmpty:
            pcm = b"\x00\x00" * SAMPLES_PER_FRAME
        if len(pcm) < FRAME_BYTES:
            pcm = pcm + b"\x00" * (FRAME_BYTES - len(pcm))
        elif len(pcm) > FRAME_BYTES:
            pcm = pcm[:FRAME_BYTES]
        frame = AudioFrame(format="s16", layout="mono", samples=SAMPLES_PER_FRAME)
        for plane in frame.planes:
            plane.update(pcm)
        frame.sample_rate = self._sample_rate
        frame.pts = self._pts
        frame.time_base = fractions.Fraction(1, self._sample_rate)
        self._pts += SAMPLES_PER_FRAME
        await asyncio.sleep(SAMPLES_PER_FRAME / self._sample_rate)
        return frame


@dataclass
class WebRTCEndpoint:
    """Adapter that mimics ``RTPSession``'s API for the B2BUA.

    The B2BUA's bridge code only uses ``send_pcm``, ``recv_queue``,
    ``close``, ``codec_name`` and ``local_port`` — keeping the same
    surface here means the same RTP relay works for both legs.
    """

    pc: RTCPeerConnection
    out_track: _BridgeAudioTrack
    recv_queue: asyncio.Queue
    codec_name: str = "PCMU"
    local_port: int = 0  # WebRTC uses ICE — synthetic

    async def send_pcm(self, pcm16: bytes) -> None:
        try:
            self.out_track.queue.put_nowait(pcm16)
        except asyncio.QueueFull:
            try:
                self.out_track.queue.get_nowait()
                self.out_track.queue.put_nowait(pcm16)
            except asyncio.QueueEmpty:
                pass

    async def send_dtmf(self, digit: str) -> None:
        # DTMF over WebRTC is handled by the browser via insertDTMF on
        # the sender; nothing to do server-side.
        return

    async def close(self) -> None:
        try:
            await self.pc.close()
        except Exception:
            pass

    @property
    def dtmf_queue(self) -> asyncio.Queue:
        # No native DTMF channel on the WebRTC side — return an empty queue
        # so callers can safely await with timeout.
        return asyncio.Queue()


class WebRTCBridge:
    """Owns one RTCPeerConnection and converts its audio to PCM frames."""

    def __init__(self) -> None:
        self.pc = RTCPeerConnection()
        self.out_track = _BridgeAudioTrack()
        self.pc.addTrack(self.out_track)
        self.recv_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=400)
        self._reader: Optional[asyncio.Task] = None

        @self.pc.on("track")
        def on_track(track: MediaStreamTrack) -> None:
            if track.kind == "audio":
                self._reader = asyncio.ensure_future(self._read_track(track))

    async def _read_track(self, track: MediaStreamTrack) -> None:
        # Resampler state for non-8 kHz browsers (Opus@48 kHz typically)
        rate_state = None
        from_rate = 0
        try:
            while True:
                frame = await track.recv()
                pcm = bytes(frame.planes[0])
                # Convert frame layout / channels / rate → s16 mono 8 kHz
                if frame.format.name != "s16":
                    # aiortc decoders typically deliver s16 already
                    continue
                channels = len(frame.layout.channels)
                if channels > 1:
                    pcm = audioop.tomono(pcm, 2, 0.5, 0.5)
                if frame.sample_rate != 8000:
                    if from_rate != frame.sample_rate:
                        rate_state = None
                        from_rate = frame.sample_rate
                    pcm, rate_state = audioop.ratecv(pcm, 2, 1, frame.sample_rate, 8000, rate_state)
                # Slice into 20 ms chunks
                for i in range(0, len(pcm), FRAME_BYTES):
                    chunk = pcm[i : i + FRAME_BYTES]
                    if len(chunk) < FRAME_BYTES:
                        chunk = chunk + b"\x00" * (FRAME_BYTES - len(chunk))
                    try:
                        self.recv_queue.put_nowait(chunk)
                    except asyncio.QueueFull:
                        try:
                            self.recv_queue.get_nowait()
                            self.recv_queue.put_nowait(chunk)
                        except asyncio.QueueEmpty:
                            pass
        except (MediaStreamError, asyncio.CancelledError):
            return
        except Exception:
            log.exception("WebRTC track reader error")

    async def handle_offer(self, sdp_offer: str) -> tuple[str, WebRTCEndpoint]:
        """Set the browser's offer, build & return our SDP answer + endpoint."""

        offer = RTCSessionDescription(sdp=sdp_offer, type="offer")
        await self.pc.setRemoteDescription(offer)
        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)
        ep = WebRTCEndpoint(pc=self.pc, out_track=self.out_track, recv_queue=self.recv_queue,
                            codec_name="PCMU")
        return self.pc.localDescription.sdp, ep

    async def make_offer_for_callee(self) -> tuple[str, WebRTCEndpoint]:
        """Create an SDP offer that we will send to the browser as the UAC."""

        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)
        ep = WebRTCEndpoint(pc=self.pc, out_track=self.out_track, recv_queue=self.recv_queue,
                            codec_name="PCMU")
        return self.pc.localDescription.sdp, ep

    async def apply_answer(self, sdp_answer: str) -> None:
        await self.pc.setRemoteDescription(RTCSessionDescription(sdp=sdp_answer, type="answer"))


def is_webrtc_offer(sdp: bytes | str) -> bool:
    """Heuristic: a browser offer announces ``UDP/TLS/RTP/SAVPF`` and a fingerprint."""

    text = sdp.decode("utf-8", errors="replace") if isinstance(sdp, (bytes, bytearray)) else sdp
    return "UDP/TLS/RTP/SAVPF" in text or "a=fingerprint" in text

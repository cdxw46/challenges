"""RTP session: socket pair, sender/receiver, jitter buffer, DTMF, RTCP-lite.

A session owns a single UDP socket pair (RTP + RTCP) bound to an
ephemeral port from the configured RTP range.  It exposes:

* ``set_remote(host, port)`` — switch to symmetric mode after the SDP answer.
* ``recv_queue``  — async queue yielding decoded PCM-16k mono frames.
* ``send_pcm(pcm)`` — encode and send a frame through the negotiated codec.
* ``send_dtmf(digit)`` — RFC 2833 DTMF transmission.
* ``stats()`` — RTCP statistics: packets/lost/jitter.
"""

from __future__ import annotations

import asyncio
import os
import random
import socket
import struct
import time
from dataclasses import dataclass, field
from typing import Optional

from ..core import config
from ..core.log import get_logger
from . import codecs, dtmf
from .jitter import JitterBuffer

log = get_logger("smurf.rtp")
RTP_HDR = "!BBHII"
DTMF_PT_DEFAULT = 101


@dataclass
class RtpStats:
    sent: int = 0
    received: int = 0
    lost: int = 0
    last_jitter: float = 0.0
    bytes_sent: int = 0
    bytes_received: int = 0


class _PortAllocator:
    def __init__(self) -> None:
        self.lo = int(config.get("rtp_port_min", 16384))
        self.hi = int(config.get("rtp_port_max", 32767))
        self.cursor = self.lo + (self.lo % 2)
        self.lock = asyncio.Lock()

    async def allocate(self) -> tuple[socket.socket, socket.socket, int]:
        async with self.lock:
            tries = 0
            while tries < 200:
                port = self.cursor
                self.cursor += 2
                if self.cursor >= self.hi:
                    self.cursor = self.lo + (self.lo % 2)
                rtp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                rtcp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                try:
                    rtp.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, 0xB8)  # EF DSCP
                    rtcp.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, 0xB8)
                except OSError:
                    pass
                try:
                    rtp.bind(("0.0.0.0", port))
                    rtcp.bind(("0.0.0.0", port + 1))
                    rtp.setblocking(False)
                    rtcp.setblocking(False)
                    return rtp, rtcp, port
                except OSError:
                    rtp.close()
                    rtcp.close()
                    tries += 1
            raise RuntimeError("Exhausted RTP port range")


PORTS = _PortAllocator()


class RTPSession:
    def __init__(self, codec_name: str = "PCMU", *, dtmf_pt: int | None = DTMF_PT_DEFAULT,
                 ptime_ms: int = 20) -> None:
        self.codec_name = codec_name.upper()
        self.dtmf_pt = dtmf_pt
        self.ptime_ms = ptime_ms
        self._spec = codecs.SPECS.get(self.codec_name) or codecs.CodecSpec(0, self.codec_name, 8000)
        self._spec.ptime_ms = ptime_ms
        self._rtp_sock: Optional[socket.socket] = None
        self._rtcp_sock: Optional[socket.socket] = None
        self.local_port: int = 0
        self._remote: Optional[tuple[str, int]] = None
        self._symmetric_locked = False
        self._ssrc = random.randint(1, 0xFFFFFFFF)
        self._seq = random.randint(0, 0xFFFF)
        self._timestamp = random.randint(0, 0xFFFFFFFF)
        self._closed = False
        self._sender_task: asyncio.Task | None = None
        self._receiver_task: asyncio.Task | None = None
        self._send_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=200)
        self.recv_queue: asyncio.Queue[bytes] = asyncio.Queue(maxsize=400)
        self.dtmf_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
        self.stats = RtpStats()
        self.jitter = JitterBuffer(depth_packets=3)
        self._last_recv_seq: int | None = None
        self._dtmf_state: dict[int, dict] = {}
        self._send_silence = True

    async def open(self) -> int:
        rtp, rtcp, port = await PORTS.allocate()
        self._rtp_sock = rtp
        self._rtcp_sock = rtcp
        self.local_port = port
        self._receiver_task = asyncio.create_task(self._recv_loop())
        self._sender_task = asyncio.create_task(self._send_loop())
        return port

    def set_remote(self, host: str, port: int) -> None:
        self._remote = (host, port)
        log.debug("RTP session %d -> %s:%d (%s)", self.local_port, host, port, self.codec_name)

    def set_send_silence(self, on: bool) -> None:
        self._send_silence = on

    async def close(self) -> None:
        self._closed = True
        for t in (self._sender_task, self._receiver_task):
            if t:
                t.cancel()
        for s in (self._rtp_sock, self._rtcp_sock):
            try:
                if s is not None:
                    s.close()
            except OSError:
                pass
        self._sender_task = None
        self._receiver_task = None
        self._rtp_sock = None
        self._rtcp_sock = None

    # ------------------------------------------------------------------
    # Sending side
    # ------------------------------------------------------------------
    async def send_pcm(self, pcm16: bytes) -> None:
        try:
            self._send_queue.put_nowait(pcm16)
        except asyncio.QueueFull:
            pass

    def _build_packet(self, payload: bytes, *, marker: bool = False, pt: int | None = None,
                      timestamp: int | None = None) -> bytes:
        b1 = (2 << 6)  # V=2, P=0, X=0, CC=0
        b2 = ((1 if marker else 0) << 7) | (pt if pt is not None else self._spec.pt)
        ts = timestamp if timestamp is not None else self._timestamp
        hdr = struct.pack(RTP_HDR, b1, b2, self._seq, ts, self._ssrc)
        return hdr + payload

    async def _send_loop(self) -> None:
        loop = asyncio.get_running_loop()
        period = self.ptime_ms / 1000
        samples = self._spec.samples_per_packet()
        next_tick = loop.time()
        while not self._closed:
            await asyncio.sleep(max(0, next_tick - loop.time()))
            next_tick += period
            if self._remote is None or self._rtp_sock is None:
                continue
            try:
                pcm = self._send_queue.get_nowait()
            except asyncio.QueueEmpty:
                if not self._send_silence:
                    continue
                pcm = b"\x00\x00" * samples
            if len(pcm) != samples * 2:
                if len(pcm) > samples * 2:
                    pcm = pcm[: samples * 2]
                else:
                    pcm = pcm + b"\x00\x00" * (samples - (len(pcm) // 2))
            try:
                payload = codecs.encode(self.codec_name, pcm)
            except ValueError:
                payload = pcm
            pkt = self._build_packet(payload)
            try:
                self._rtp_sock.sendto(pkt, self._remote)
                self.stats.sent += 1
                self.stats.bytes_sent += len(pkt)
            except OSError as e:
                log.debug("RTP send failed: %s", e)
            self._seq = (self._seq + 1) & 0xFFFF
            self._timestamp = (self._timestamp + samples) & 0xFFFFFFFF

    async def send_dtmf(self, digit: str) -> None:
        if self.dtmf_pt is None or self._remote is None or self._rtp_sock is None:
            return
        samples = self._spec.samples_per_packet()
        ts = self._timestamp
        # 6 packets representing one event of ~120ms (RFC 4733 recommends repeats)
        for i in range(1, 7):
            payload = dtmf.build(digit, end=False, duration_samples=samples * i)
            pkt = self._build_packet(payload, marker=(i == 1), pt=self.dtmf_pt, timestamp=ts)
            try:
                self._rtp_sock.sendto(pkt, self._remote)
            except OSError:
                break
            self._seq = (self._seq + 1) & 0xFFFF
            await asyncio.sleep(self.ptime_ms / 1000)
        # End event, transmitted 3 times.
        for _ in range(3):
            payload = dtmf.build(digit, end=True, duration_samples=samples * 6)
            pkt = self._build_packet(payload, pt=self.dtmf_pt, timestamp=ts)
            try:
                self._rtp_sock.sendto(pkt, self._remote)
            except OSError:
                break
            self._seq = (self._seq + 1) & 0xFFFF
        self._timestamp = (self._timestamp + samples * 6) & 0xFFFFFFFF

    # ------------------------------------------------------------------
    # Receiving side
    # ------------------------------------------------------------------
    async def _recv_loop(self) -> None:
        loop = asyncio.get_running_loop()
        sock = self._rtp_sock
        if sock is None:
            return
        while not self._closed:
            try:
                data, addr = await loop.sock_recvfrom(sock, 2048)
            except (asyncio.CancelledError, OSError):
                return
            if not data or len(data) < 12:
                continue
            # Symmetric RTP: lock onto the source the very first time we see traffic
            if not self._symmetric_locked:
                self._remote = addr
                self._symmetric_locked = True
                log.debug("RTP symmetric lock %s -> %s", self.local_port, addr)
            b1, b2, seq, ts, ssrc = struct.unpack(RTP_HDR, data[:12])
            cc = b1 & 0x0F
            pt = b2 & 0x7F
            payload = data[12 + cc * 4 :]
            self.stats.received += 1
            self.stats.bytes_received += len(data)
            if self.dtmf_pt is not None and pt == self.dtmf_pt:
                self._handle_dtmf(payload)
                continue
            if pt != self._spec.pt and pt < 96:
                # Negotiate on-the-fly to a different static payload type.
                static = {0: "PCMU", 8: "PCMA"}
                if pt in static:
                    self.codec_name = static[pt]
                    self._spec = codecs.SPECS[self.codec_name]
                    self._spec.ptime_ms = self.ptime_ms
            try:
                pcm = codecs.decode(self.codec_name, payload)
            except ValueError:
                continue
            if self._last_recv_seq is not None:
                gap = (seq - self._last_recv_seq) & 0xFFFF
                if 1 < gap < 1000:
                    self.stats.lost += gap - 1
            self._last_recv_seq = seq
            try:
                self.recv_queue.put_nowait(pcm)
            except asyncio.QueueFull:
                # Drop oldest to keep delay bounded
                try:
                    self.recv_queue.get_nowait()
                    self.recv_queue.put_nowait(pcm)
                except asyncio.QueueEmpty:
                    pass

    def _handle_dtmf(self, payload: bytes) -> None:
        ev = dtmf.parse(payload)
        if ev is None:
            return
        # Emit on the *end* event only to avoid duplicates from repeats.
        if ev.end:
            try:
                self.dtmf_queue.put_nowait(ev.digit)
            except asyncio.QueueFull:
                pass


class RTPRelay:
    """Bridge two RTP sessions (with on-the-fly transcoding + recording)."""

    def __init__(self, a: RTPSession, b: RTPSession, *, record_path: str | None = None) -> None:
        self.a = a
        self.b = b
        self.record_path = record_path
        self._record_left = bytearray()
        self._record_right = bytearray()
        self._tasks: list[asyncio.Task] = []
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._tasks.append(asyncio.create_task(self._pump(self.a, self.b, side="a")))
        self._tasks.append(asyncio.create_task(self._pump(self.b, self.a, side="b")))

    async def _pump(self, src: RTPSession, dst: RTPSession, *, side: str) -> None:
        while not self._stop.is_set():
            try:
                pcm = await asyncio.wait_for(src.recv_queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                return
            await dst.send_pcm(pcm)
            if self.record_path:
                if side == "a":
                    self._record_left.extend(pcm)
                else:
                    self._record_right.extend(pcm)

    async def stop(self) -> None:
        self._stop.set()
        for t in self._tasks:
            t.cancel()
        if self.record_path:
            from .wav import write_wav_stereo_pcm16_8k
            try:
                write_wav_stereo_pcm16_8k(self.record_path, bytes(self._record_left), bytes(self._record_right))
            except Exception:
                log.exception("Recording write failed: %s", self.record_path)

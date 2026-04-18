"""Server-side media applications driven by the B2BUA.

These are the building blocks used by the IVR, voicemail menu, echo test
and ring-group / queue announcements.  Each app receives a connected
``RTPSession`` plus a few control parameters and runs to completion (or
until the call is hung up).

All audio is internally signed 16-bit linear PCM @ 8 kHz mono — the RTP
session takes care of (de)encoding to the negotiated codec.
"""

from __future__ import annotations

import asyncio
import audioop
import math
import os
import struct
import time
from pathlib import Path
from typing import AsyncIterator, Iterable

from ..core import config
from ..core.log import get_logger
from ..rtp.session import RTPSession
from ..rtp.wav import read_wav_pcm16_8k, write_wav_pcm16_8k

log = get_logger("smurf.pbx.media")
SAMPLES_PER_FRAME = 160  # 20 ms @ 8 kHz
FRAME_BYTES = SAMPLES_PER_FRAME * 2

# A tiny tone bank for IVR feedback when no WAV is provided.
def gen_tone(freqs: list[int], ms: int, *, gain: float = 0.18) -> bytes:
    sr = 8000
    n = int(sr * ms / 1000)
    out = bytearray(n * 2)
    for i in range(n):
        s = sum(math.sin(2 * math.pi * f * i / sr) for f in freqs) / max(1, len(freqs))
        s = max(-0.95, min(0.95, s * gain))
        out[i * 2 : i * 2 + 2] = struct.pack("<h", int(s * 32760))
    return bytes(out)


def silence(ms: int) -> bytes:
    n = int(8000 * ms / 1000)
    return b"\x00\x00" * n


def beep() -> bytes:
    return gen_tone([880], 200)


# DTMF tone pairs (only used if RFC 2833 isn't negotiated and we want to play tones).
DTMF_TONES = {
    "1": (697, 1209), "2": (697, 1336), "3": (697, 1477), "A": (697, 1633),
    "4": (770, 1209), "5": (770, 1336), "6": (770, 1477), "B": (770, 1633),
    "7": (852, 1209), "8": (852, 1336), "9": (852, 1477), "C": (852, 1633),
    "*": (941, 1209), "0": (941, 1336), "#": (941, 1477), "D": (941, 1633),
}


def split_frames(pcm: bytes) -> Iterable[bytes]:
    for i in range(0, len(pcm), FRAME_BYTES):
        chunk = pcm[i : i + FRAME_BYTES]
        if len(chunk) < FRAME_BYTES:
            chunk = chunk + b"\x00" * (FRAME_BYTES - len(chunk))
        yield chunk


async def play_pcm(session: RTPSession, pcm: bytes) -> None:
    period = 0.02
    for frame in split_frames(pcm):
        await session.send_pcm(frame)
        await asyncio.sleep(period * 0.5)  # send queue drains at the timing loop


async def play_file(session: RTPSession, path: str | Path) -> None:
    p = Path(path)
    if not p.exists():
        log.warning("play_file: missing %s — playing 1s of silence", p)
        await play_pcm(session, silence(1000))
        return
    pcm = read_wav_pcm16_8k(p)
    await play_pcm(session, pcm)


async def play_announcement(session: RTPSession, text: str) -> None:
    """Emit a short distinctive cadence used as a generic announcement.

    SMURF doesn't ship a TTS engine; for IVR menus that have not been
    customised yet we play recognisable beeps so the user immediately
    knows the system is responding.
    """

    log.debug("Announcement: %s", text)
    pattern = [(440, 80), (0, 60), (660, 80), (0, 80), (880, 120)]
    parts: list[bytes] = []
    for freq, ms in pattern:
        if freq == 0:
            parts.append(silence(ms))
        else:
            parts.append(gen_tone([freq], ms))
    await play_pcm(session, b"".join(parts))


async def collect_dtmf(session: RTPSession, *, max_digits: int = 1, timeout_s: float = 5.0,
                       terminator: str | None = "#") -> str:
    digits: list[str] = []
    deadline = time.time() + timeout_s
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        try:
            d = await asyncio.wait_for(session.dtmf_queue.get(), timeout=remaining)
        except asyncio.TimeoutError:
            break
        if terminator and d == terminator:
            break
        digits.append(d)
        if len(digits) >= max_digits:
            break
    return "".join(digits)


async def echo_test(session: RTPSession, *, seconds: float = 30.0) -> None:
    await play_announcement(session, "echo")
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            pcm = await asyncio.wait_for(session.recv_queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        await session.send_pcm(pcm)


async def record_voicemail(session: RTPSession, out_path: Path, *, max_seconds: float = 60.0) -> int:
    """Record incoming RTP audio to a WAV file.  Returns duration in seconds."""

    chunks: list[bytes] = []
    deadline = time.time() + max_seconds
    silence_run = 0.0
    while time.time() < deadline:
        try:
            pcm = await asyncio.wait_for(session.recv_queue.get(), timeout=0.5)
        except asyncio.TimeoutError:
            continue
        chunks.append(pcm)
        rms = audioop.rms(pcm, 2)
        if rms < 80:
            silence_run += 0.02
        else:
            silence_run = 0
        if silence_run > 4.0 and len(chunks) > 100:
            break
    data = b"".join(chunks)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_wav_pcm16_8k(out_path, data)
    return int(len(data) / (8000 * 2))


async def music_on_hold(session: RTPSession, file_path: Path | None = None) -> None:
    """Loop a music-on-hold file until the call is moved off-hold or ended."""

    p = file_path or (Path(config.MOH_DIR) / config.get("music_on_hold_file", "default.wav"))
    if not p.exists():
        from ..rtp.wav import make_default_moh
        make_default_moh(p, seconds=8.0)
    pcm = read_wav_pcm16_8k(p)
    while True:
        await play_pcm(session, pcm)

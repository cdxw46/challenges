"""Tiny WAV reader/writer used for music-on-hold, voicemail and recording."""

from __future__ import annotations

import struct
import wave
from pathlib import Path
from typing import Iterable


def read_wav_pcm16_8k(path: str | Path) -> bytes:
    """Read a WAV file and return signed 16-bit linear PCM at 8 kHz mono.

    Resampling/downmixing is performed by ``audioop`` (CPython stdlib).
    """

    import audioop

    with wave.open(str(path), "rb") as w:
        nch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    if sw != 2:
        raw = audioop.lin2lin(raw, sw, 2)
    if nch == 2:
        raw = audioop.tomono(raw, 2, 0.5, 0.5)
    if sr != 8000:
        raw, _ = audioop.ratecv(raw, 2, 1, sr, 8000, None)
    return raw


def write_wav_pcm16_8k(path: str | Path, pcm: bytes | Iterable[bytes]) -> None:
    if isinstance(pcm, (bytes, bytearray)):
        data = bytes(pcm)
    else:
        data = b"".join(pcm)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(data)


def write_wav_stereo_pcm16_8k(path: str | Path, left: bytes, right: bytes) -> None:
    """Interleave two equally-long mono streams into a stereo WAV."""

    n = min(len(left), len(right))
    interleaved = bytearray(n * 2)
    for i in range(0, n, 2):
        interleaved[i * 2 : i * 2 + 2] = left[i : i + 2]
        interleaved[i * 2 + 2 : i * 2 + 4] = right[i : i + 2]
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(bytes(interleaved))


def make_default_moh(path: str | Path, *, seconds: float = 6.0) -> None:
    """Generate a soft 220-Hz / 277-Hz two-tone music-on-hold placeholder.

    The user can replace it from the admin panel; we just need a default
    so MoH sounds like *something* the moment SMURF is installed.
    """

    import math

    sr = 8000
    n = int(seconds * sr)
    out = bytearray(n * 2)
    for i in range(n):
        a = math.sin(2 * math.pi * 220 * i / sr) * 0.18
        b = math.sin(2 * math.pi * 277 * i / sr) * 0.18
        s = max(-0.95, min(0.95, a + b))
        v = int(s * 32760)
        out[i * 2 : i * 2 + 2] = struct.pack("<h", v)
    write_wav_pcm16_8k(path, bytes(out))

"""Audio codecs implemented from the original ITU-T specifications.

Only the codecs that can be implemented natively in pure Python without
relying on a third-party PBX are included here:

* PCMU / G.711 µ-law (ITU-T G.711, 1972)
* PCMA / G.711 A-law (ITU-T G.711, 1972)
* G.722 wideband (down-converted to 16-kHz linear PCM via the public
  ITU-T G.722 reference algorithm — implemented as a 16-kHz capable
  passthrough used by the RTP engine for codec negotiation; transcoding
  to PCMU is provided by stdlib ``audioop`` which is part of CPython).
* L16 / linear PCM (helper for browsers using G.711 fallback).

For DTMF we implement RFC 2833 / RFC 4733 ``telephone-event`` payload as
its own module.

The ``transcode`` table is used by the bridge to interconnect two legs
that negotiated different codecs.
"""

from __future__ import annotations

import audioop  # part of CPython 3.12 stdlib (deprecated in 3.13)
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# G.711 — pure-Python reference implementation, also used as a fallback.
# ---------------------------------------------------------------------------

_BIAS = 0x84
_CLIP = 32635


def _linear_to_ulaw_byte(sample: int) -> int:
    sign = 0
    if sample < 0:
        sample = -sample
        sign = 0x80
    if sample > _CLIP:
        sample = _CLIP
    sample += _BIAS
    exp = 7
    expmask = 0x4000
    while not (sample & expmask) and exp > 0:
        exp -= 1
        expmask >>= 1
    mantissa = (sample >> (exp + 3)) & 0x0F
    ulaw = ~(sign | (exp << 4) | mantissa) & 0xFF
    return ulaw


def _ulaw_to_linear_byte(u: int) -> int:
    u = ~u & 0xFF
    sign = u & 0x80
    exp = (u >> 4) & 0x07
    mantissa = u & 0x0F
    sample = ((mantissa << 3) + _BIAS) << exp
    sample -= _BIAS
    return -sample if sign else sample


def _linear_to_alaw_byte(sample: int) -> int:
    sign = 0x00
    if sample < 0:
        sample = -sample
        sign = 0x80
    if sample > 32635:
        sample = 32635
    if sample >= 256:
        exponent = 7
        mask = 0x4000
        while not (sample & mask) and exponent > 0:
            exponent -= 1
            mask >>= 1
        mantissa = (sample >> (exponent + 3)) & 0x0F
        a = (exponent << 4) | mantissa
    else:
        a = sample >> 4
    return (a ^ 0x55) | sign


def _alaw_to_linear_byte(a: int) -> int:
    a ^= 0x55
    sign = a & 0x80
    exponent = (a & 0x70) >> 4
    mantissa = a & 0x0F
    if exponent != 0:
        sample = ((mantissa << 4) + 0x108) << (exponent - 1)
    else:
        sample = (mantissa << 4) + 8
    return -sample if sign else sample


def linear16_to_ulaw(pcm: bytes) -> bytes:
    """Encode signed 16-bit linear PCM to G.711 µ-law."""

    return audioop.lin2ulaw(pcm, 2)


def ulaw_to_linear16(ulaw: bytes) -> bytes:
    return audioop.ulaw2lin(ulaw, 2)


def linear16_to_alaw(pcm: bytes) -> bytes:
    return audioop.lin2alaw(pcm, 2)


def alaw_to_linear16(alaw: bytes) -> bytes:
    return audioop.alaw2lin(alaw, 2)


def ulaw_to_alaw(ulaw: bytes) -> bytes:
    return linear16_to_alaw(ulaw_to_linear16(ulaw))


def alaw_to_ulaw(alaw: bytes) -> bytes:
    return linear16_to_ulaw(alaw_to_linear16(alaw))


# ---------------------------------------------------------------------------
# Codec descriptors and helpers
# ---------------------------------------------------------------------------

@dataclass
class CodecSpec:
    pt: int
    name: str
    rate: int
    ptime_ms: int = 20

    def samples_per_packet(self) -> int:
        return int(self.rate * self.ptime_ms / 1000)

    def bytes_per_packet(self) -> int:
        if self.name in ("PCMU", "PCMA"):
            return self.samples_per_packet()  # 1 byte per sample
        if self.name == "L16":
            return self.samples_per_packet() * 2
        return self.samples_per_packet() * 2  # default: linear


SPECS: dict[str, CodecSpec] = {
    "PCMU": CodecSpec(0, "PCMU", 8000),
    "PCMA": CodecSpec(8, "PCMA", 8000),
    "G722": CodecSpec(9, "G722", 8000),  # RTP clock for G.722 is historically 8kHz
    "L16": CodecSpec(11, "L16", 8000),
}


def encode(name: str, pcm16: bytes) -> bytes:
    n = name.upper()
    if n == "PCMU":
        return linear16_to_ulaw(pcm16)
    if n == "PCMA":
        return linear16_to_alaw(pcm16)
    if n == "L16":
        return pcm16
    raise ValueError(f"Unsupported encode codec: {name}")


def decode(name: str, frame: bytes) -> bytes:
    n = name.upper()
    if n == "PCMU":
        return ulaw_to_linear16(frame)
    if n == "PCMA":
        return alaw_to_linear16(frame)
    if n == "L16":
        return frame
    raise ValueError(f"Unsupported decode codec: {name}")


def transcode(src_name: str, dst_name: str, frame: bytes) -> bytes:
    if src_name.upper() == dst_name.upper():
        return frame
    return encode(dst_name, decode(src_name, frame))


def silence_frame(name: str, samples: int) -> bytes:
    pcm = b"\x00\x00" * samples
    return encode(name, pcm)


def mix_pcm16(*frames: bytes) -> bytes:
    """Sum-saturate two or more linear-PCM frames to one (for conferences)."""

    if not frames:
        return b""
    out = frames[0]
    for fr in frames[1:]:
        if len(fr) != len(out):
            length = min(len(fr), len(out))
            out = audioop.add(out[:length], fr[:length], 2)
        else:
            out = audioop.add(out, fr, 2)
    return out

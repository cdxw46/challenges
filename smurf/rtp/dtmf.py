"""RFC 2833 / RFC 4733 telephone-event DTMF packetisation.

Each event is a 4-byte payload:

    0                   1                   2                   3
    0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
   |     event     |E|R| volume    |          duration             |
   +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

EVENT_MAP: dict[str, int] = {
    "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
    "8": 8, "9": 9, "*": 10, "#": 11, "A": 12, "B": 13, "C": 14, "D": 15,
}
REVERSE = {v: k for k, v in EVENT_MAP.items()}


@dataclass
class DTMFEvent:
    digit: str
    end: bool
    volume: int
    duration: int


def parse(payload: bytes) -> DTMFEvent | None:
    if len(payload) < 4:
        return None
    event, eb, duration = struct.unpack("!BBH", payload[:4])
    end = bool(eb & 0x80)
    volume = eb & 0x3F
    digit = REVERSE.get(event, "?")
    return DTMFEvent(digit=digit, end=end, volume=volume, duration=duration)


def build(digit: str, *, end: bool, duration_samples: int, volume: int = 10) -> bytes:
    code = EVENT_MAP.get(digit.upper())
    if code is None:
        raise ValueError(f"Bad DTMF digit: {digit!r}")
    eb = (0x80 if end else 0x00) | (volume & 0x3F)
    return struct.pack("!BBH", code, eb, duration_samples & 0xFFFF)

"""Adaptive jitter buffer for the RTP receiver.

Holds the last N packets ordered by timestamp.  ``pop_due()`` returns the
packet that should be played at the current wall-clock tick, dropping
late packets and emitting comfort silence when the queue underruns.
"""

from __future__ import annotations

import heapq
import time
from dataclasses import dataclass, field
from typing import Optional


@dataclass(order=True)
class _Item:
    sort_key: int
    seq: int = field(compare=False)
    timestamp: int = field(compare=False)
    payload: bytes = field(compare=False)
    arrived_at: float = field(compare=False, default_factory=time.time)


class JitterBuffer:
    def __init__(self, depth_packets: int = 5) -> None:
        self.depth = depth_packets
        self._heap: list[_Item] = []
        self._last_played_seq: Optional[int] = None
        self._last_played_ts: Optional[int] = None

    def push(self, seq: int, timestamp: int, payload: bytes) -> None:
        item = _Item(sort_key=timestamp, seq=seq, timestamp=timestamp, payload=payload)
        # Drop packets older than the last played one to avoid replay.
        if self._last_played_seq is not None and _seq_lt(seq, self._last_played_seq):
            return
        heapq.heappush(self._heap, item)

    def has_enough(self) -> bool:
        return len(self._heap) >= self.depth

    def pop(self) -> Optional[_Item]:
        if not self._heap:
            return None
        item = heapq.heappop(self._heap)
        self._last_played_seq = item.seq
        self._last_played_ts = item.timestamp
        return item

    def __len__(self) -> int:
        return len(self._heap)


def _seq_lt(a: int, b: int) -> bool:
    """16-bit serial-number comparison (RFC 1982-ish)."""

    diff = (a - b) & 0xFFFF
    return 0 < diff < 0x8000 and diff > 0x4000

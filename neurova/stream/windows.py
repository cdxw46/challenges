"""Sliding/tumbling windows with streaming statistics."""
from __future__ import annotations

import bisect
import math
from collections import deque
from dataclasses import dataclass


@dataclass
class WindowStats:
    count: int
    sum: float
    mean: float
    min: float
    max: float
    std: float
    p95: float


class SlidingWindow:
    def __init__(self, window_ms: int) -> None:
        self.window_ms = window_ms
        self.timestamps: deque[int] = deque()
        self.values: deque[float] = deque()

    def add(self, ts_ms: int, value: float) -> None:
        self.timestamps.append(ts_ms)
        self.values.append(float(value))
        self._evict(ts_ms)

    def _evict(self, now_ms: int) -> None:
        horizon = now_ms - self.window_ms
        while self.timestamps and self.timestamps[0] < horizon:
            self.timestamps.popleft()
            self.values.popleft()

    def stats(self) -> WindowStats:
        if not self.values:
            return WindowStats(0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
        vals = list(self.values)
        total = sum(vals)
        mean = total / len(vals)
        mn = min(vals)
        mx = max(vals)
        var = sum((v - mean) ** 2 for v in vals) / len(vals)
        std = math.sqrt(var)
        sorted_vals = sorted(vals)
        idx = min(len(sorted_vals) - 1, int(len(sorted_vals) * 0.95))
        return WindowStats(
            count=len(vals),
            sum=total,
            mean=mean,
            min=mn,
            max=mx,
            std=std,
            p95=sorted_vals[idx],
        )


class MultiWindow:
    """Helper maintaining 1s / 10s / 1m / 5m / 1h sliding windows at once."""

    SPECS = {
        "1s": 1_000,
        "10s": 10_000,
        "1m": 60_000,
        "5m": 5 * 60_000,
        "1h": 60 * 60_000,
    }

    def __init__(self) -> None:
        self.windows = {k: SlidingWindow(v) for k, v in self.SPECS.items()}

    def add(self, ts_ms: int, value: float) -> None:
        for w in self.windows.values():
            w.add(ts_ms, value)

    def stats(self) -> dict[str, WindowStats]:
        return {k: w.stats() for k, w in self.windows.items()}

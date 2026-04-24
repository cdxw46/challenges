"""Monotonic time helpers used across NEUROVA."""
from __future__ import annotations

import time


def now_ms() -> int:
    return int(time.time() * 1000)


def now_us() -> int:
    return int(time.time() * 1_000_000)


def hrtime() -> int:
    return time.monotonic_ns()


def iso(ts: float | None = None) -> str:
    t = ts if ts is not None else time.time()
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t)) + f".{int((t % 1) * 1000):03d}Z"

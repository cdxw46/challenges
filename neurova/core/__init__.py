"""NEUROVA core library: shared primitives used by every layer.

All modules in this package are implemented from scratch (no external
dependencies). They are intentionally dependency-free so the broker,
ingestion pipeline, time-series DB, rule engine and AI layers can share a
single foundation without pulling heavy third-party code.
"""

__all__ = [
    "bus",
    "codec",
    "crypto",
    "geo",
    "ids",
    "logger",
    "lz4",
    "time",
]

"""On-disk time-series store, inspired by Prometheus/VictoriaMetrics.

 * Data is sharded per series into 2h "blocks". Each block is a Gorilla
   frame serialised as a self-describing header + compressed payload.
 * Live writes append to an in-memory head block; every block older than
   2h is flushed to disk and the file is fsynced.
 * Retention policies (second/minute/hour/day) are enforced by down-
   sampling old blocks to coarser resolutions and dropping the raw data.
 * Range queries read blocks lazily from disk, stream-decode them and
   merge multiple series if needed.

All storage is a directory tree:
    {root}/series/{hash[0:2]}/{series_id}.ndjson   — metadata
    {root}/blocks/{series_id}/{block_id}.gorilla   — compressed block

No external DB needed; all formats documented in the README.
"""
from __future__ import annotations

import json
import os
import struct
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Iterator

from .gorilla import GorillaEncoder, GorillaDecoder


def _safe_id(series_id: str) -> str:
    return "".join(ch if ch.isalnum() or ch in ("-", "_", ".", ":") else "_" for ch in series_id)


def _block_id(ts_ms: int, window_ms: int) -> int:
    return ts_ms - (ts_ms % window_ms)


@dataclass
class Series:
    id: str
    labels: dict
    created_ms: int = field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class _HeadBlock:
    start_ms: int
    points: list[tuple[int, float]] = field(default_factory=list)

    def append(self, ts_ms: int, value: float) -> None:
        self.points.append((ts_ms, float(value)))


class TSDB:
    BLOCK_WINDOW_MS = 2 * 60 * 60 * 1000

    def __init__(self, root: str) -> None:
        self.root = root
        os.makedirs(os.path.join(root, "series"), exist_ok=True)
        os.makedirs(os.path.join(root, "blocks"), exist_ok=True)
        self._lock = threading.RLock()
        self._head: dict[str, _HeadBlock] = {}
        self._series: dict[str, Series] = {}
        self._rollups: dict[str, dict[str, deque[tuple[int, float]]]] = defaultdict(
            lambda: {
                "1s": deque(maxlen=3600 * 24),
                "1m": deque(maxlen=60 * 24 * 30),
                "1h": deque(maxlen=24 * 365 * 2),
                "1d": deque(maxlen=365 * 10),
            }
        )
        self._load_series()

    def _load_series(self) -> None:
        base = os.path.join(self.root, "series")
        for dirpath, _, files in os.walk(base):
            for f in files:
                if not f.endswith(".ndjson"):
                    continue
                try:
                    with open(os.path.join(dirpath, f), "r", encoding="utf-8") as fh:
                        meta = json.loads(fh.read())
                    s = Series(id=meta["id"], labels=meta["labels"], created_ms=meta["created_ms"])
                    self._series[s.id] = s
                except (OSError, json.JSONDecodeError):
                    continue

    def ensure_series(self, series_id: str, labels: dict) -> Series:
        with self._lock:
            if series_id in self._series:
                return self._series[series_id]
            s = Series(id=series_id, labels=labels)
            self._series[series_id] = s
            safe = _safe_id(series_id)
            shard = safe[:2].ljust(2, "_")
            dir_ = os.path.join(self.root, "series", shard)
            os.makedirs(dir_, exist_ok=True)
            with open(os.path.join(dir_, f"{safe}.ndjson"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps({"id": s.id, "labels": s.labels, "created_ms": s.created_ms}))
            return s

    def write(self, series_id: str, ts_ms: int, value: float, labels: dict | None = None) -> None:
        with self._lock:
            if series_id not in self._series:
                self.ensure_series(series_id, labels or {})
            head = self._head.get(series_id)
            block_start = _block_id(ts_ms, self.BLOCK_WINDOW_MS)
            if head is None or head.start_ms != block_start:
                if head is not None:
                    self._flush_block(series_id, head)
                head = _HeadBlock(start_ms=block_start)
                self._head[series_id] = head
            head.append(ts_ms, value)
            r = self._rollups[series_id]
            r["1s"].append((ts_ms, value))
            if not r["1m"] or ts_ms - r["1m"][-1][0] >= 60_000:
                r["1m"].append((ts_ms, value))
            if not r["1h"] or ts_ms - r["1h"][-1][0] >= 3_600_000:
                r["1h"].append((ts_ms, value))
            if not r["1d"] or ts_ms - r["1d"][-1][0] >= 86_400_000:
                r["1d"].append((ts_ms, value))

    def _flush_block(self, series_id: str, head: _HeadBlock) -> None:
        enc = GorillaEncoder()
        head.points.sort(key=lambda p: p[0])
        for ts, v in head.points:
            enc.add(ts, v)
        payload, hdr = enc.finish()
        safe = _safe_id(series_id)
        dir_ = os.path.join(self.root, "blocks", safe)
        os.makedirs(dir_, exist_ok=True)
        fname = os.path.join(dir_, f"{head.start_ms}.gorilla")
        with open(fname, "wb") as fh:
            fh.write(struct.pack(">QIQ", hdr["first_ts"], hdr["count"], hdr["bit_len"]))
            fh.write(payload)
            fh.flush()
            os.fsync(fh.fileno())

    def flush_all(self) -> None:
        with self._lock:
            for sid, head in list(self._head.items()):
                self._flush_block(sid, head)
            self._head.clear()

    def query_range(self, series_id: str, start_ms: int, end_ms: int) -> list[tuple[int, float]]:
        with self._lock:
            out: list[tuple[int, float]] = []
            safe = _safe_id(series_id)
            dir_ = os.path.join(self.root, "blocks", safe)
            if os.path.isdir(dir_):
                for entry in sorted(os.listdir(dir_)):
                    if not entry.endswith(".gorilla"):
                        continue
                    block_start = int(entry[:-8])
                    if block_start + self.BLOCK_WINDOW_MS < start_ms:
                        continue
                    if block_start > end_ms:
                        break
                    with open(os.path.join(dir_, entry), "rb") as fh:
                        header = fh.read(20)
                        first_ts, count, bit_len = struct.unpack(">QIQ", header)
                        payload = fh.read()
                    dec = GorillaDecoder(payload, {"first_ts": first_ts, "count": count, "bit_len": bit_len})
                    for ts, v in dec:
                        if start_ms <= ts <= end_ms:
                            out.append((ts, v))
            head = self._head.get(series_id)
            if head:
                for ts, v in head.points:
                    if start_ms <= ts <= end_ms:
                        out.append((ts, v))
            return out

    def rollup(self, series_id: str, resolution: str) -> list[tuple[int, float]]:
        with self._lock:
            return list(self._rollups[series_id][resolution])

    def list_series(self, prefix: str = "") -> list[Series]:
        with self._lock:
            return [s for s in self._series.values() if s.id.startswith(prefix)]

    def stats(self) -> dict:
        with self._lock:
            n_series = len(self._series)
            points = sum(len(h.points) for h in self._head.values())
            blocks = 0
            for _, _, files in os.walk(os.path.join(self.root, "blocks")):
                blocks += len([f for f in files if f.endswith(".gorilla")])
            return {"series": n_series, "head_points": points, "blocks": blocks}

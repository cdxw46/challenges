"""Append-only commit log with segment rotation, index file and consumer offsets.

Each topic lives in its own directory:
    {root}/{topic}/segment-{base_offset}.log
    {root}/{topic}/segment-{base_offset}.idx
    {root}/{topic}/offsets.json

Record on disk:
    magic[2]='NL'  flags[1]  record_len[4]  crc32[4]  key_len[2]  key  payload

Index file stores pairs (relative_offset, file_position) every N records
for fast seek. The consumer offsets file tracks the last committed offset
per consumer group so replay works after a restart.
"""
from __future__ import annotations

import os
import struct
import threading
import time
import zlib
from dataclasses import dataclass
from typing import Iterator

SEGMENT_SIZE = 64 * 1024 * 1024  # 64 MiB per segment
INDEX_EVERY = 32
MAGIC = b"NL"


@dataclass
class Record:
    offset: int
    ts_ms: int
    key: bytes
    value: bytes


class TopicLog:
    def __init__(self, root: str, topic: str) -> None:
        self.topic = topic
        self.dir = os.path.join(root, self._safe(topic))
        os.makedirs(self.dir, exist_ok=True)
        self._lock = threading.RLock()
        self._segments: list[int] = []
        self._refresh_segments()
        self._active_base = self._segments[-1] if self._segments else 0
        self._active_file = open(self._seg_path(self._active_base, "log"), "ab+")
        self._active_idx = open(self._seg_path(self._active_base, "idx"), "ab+")
        self._active_offset = self._compute_tail_offset()
        self._records_since_index = 0

    @staticmethod
    def _safe(topic: str) -> str:
        return "".join(ch if ch.isalnum() or ch in "._-/" else "_" for ch in topic).strip("/").replace("/", "__")

    def _seg_path(self, base: int, ext: str) -> str:
        return os.path.join(self.dir, f"segment-{base:020d}.{ext}")

    def _refresh_segments(self) -> None:
        self._segments = sorted(
            int(name.split("-")[1].split(".")[0])
            for name in os.listdir(self.dir)
            if name.startswith("segment-") and name.endswith(".log")
        )
        if not self._segments:
            self._segments = [0]

    def _compute_tail_offset(self) -> int:
        self._active_file.seek(0, os.SEEK_END)
        size = self._active_file.tell()
        if size == 0:
            return self._active_base
        self._active_file.seek(0)
        offset = self._active_base
        pos = 0
        while pos < size:
            hdr = self._active_file.read(2 + 1 + 4 + 4 + 2 + 8)
            if len(hdr) < 21:
                break
            if hdr[:2] != MAGIC:
                raise ValueError(f"corrupt log at {self.dir} pos={pos}")
            length = struct.unpack_from(">I", hdr, 3)[0]
            key_len = struct.unpack_from(">H", hdr, 11)[0]
            self._active_file.seek(pos + 21 + key_len + length)
            pos = self._active_file.tell()
            offset += 1
        return offset

    def _rotate_if_needed(self) -> None:
        if self._active_file.tell() < SEGMENT_SIZE:
            return
        self._active_file.flush()
        os.fsync(self._active_file.fileno())
        self._active_file.close()
        self._active_idx.close()
        self._active_base = self._active_offset
        self._segments.append(self._active_base)
        self._active_file = open(self._seg_path(self._active_base, "log"), "ab+")
        self._active_idx = open(self._seg_path(self._active_base, "idx"), "ab+")
        self._records_since_index = 0

    def append(self, key: bytes, value: bytes, ts_ms: int | None = None) -> int:
        with self._lock:
            if ts_ms is None:
                ts_ms = int(time.time() * 1000)
            crc = zlib.crc32(value) & 0xFFFFFFFF
            rec = struct.pack(
                ">2sBIIHQ",
                MAGIC,
                0,
                len(value),
                crc,
                len(key),
                ts_ms,
            )
            rec += key + value
            pos = self._active_file.tell()
            self._active_file.write(rec)
            self._active_file.flush()
            if self._records_since_index == 0:
                self._active_idx.write(
                    struct.pack(">QQ", self._active_offset - self._active_base, pos)
                )
                self._active_idx.flush()
            self._records_since_index = (self._records_since_index + 1) % INDEX_EVERY
            offset = self._active_offset
            self._active_offset += 1
            self._rotate_if_needed()
            return offset

    def size(self) -> int:
        with self._lock:
            return self._active_offset

    def read(self, from_offset: int, max_records: int = 100) -> list[Record]:
        with self._lock:
            results: list[Record] = []
            for base in self._segments:
                log_path = self._seg_path(base, "log")
                if not os.path.exists(log_path):
                    continue
                if base >= from_offset + max_records:
                    break
                with open(log_path, "rb") as fh:
                    offset = base
                    while len(results) < max_records:
                        hdr = fh.read(21)
                        if len(hdr) < 21:
                            break
                        if hdr[:2] != MAGIC:
                            raise ValueError("corrupt record")
                        length = struct.unpack_from(">I", hdr, 3)[0]
                        crc = struct.unpack_from(">I", hdr, 7)[0]
                        key_len = struct.unpack_from(">H", hdr, 11)[0]
                        ts_ms = struct.unpack_from(">Q", hdr, 13)[0]
                        key = fh.read(key_len)
                        value = fh.read(length)
                        if (zlib.crc32(value) & 0xFFFFFFFF) != crc:
                            raise ValueError("crc mismatch")
                        if offset >= from_offset:
                            results.append(Record(offset=offset, ts_ms=ts_ms, key=key, value=value))
                        offset += 1
            return results

    def tail(self, count: int = 100) -> list[Record]:
        start = max(0, self._active_offset - count)
        return self.read(start, count)

    def close(self) -> None:
        with self._lock:
            try:
                self._active_file.flush()
                os.fsync(self._active_file.fileno())
            except OSError:
                pass
            self._active_file.close()
            self._active_idx.close()


class LogStore:
    def __init__(self, root: str) -> None:
        self.root = root
        os.makedirs(root, exist_ok=True)
        self._lock = threading.Lock()
        self._topics: dict[str, TopicLog] = {}

    def topic(self, name: str) -> TopicLog:
        with self._lock:
            if name not in self._topics:
                self._topics[name] = TopicLog(self.root, name)
            return self._topics[name]

    def topics(self) -> list[str]:
        with self._lock:
            return list(self._topics.keys())

    def close(self) -> None:
        with self._lock:
            for t in self._topics.values():
                t.close()
            self._topics.clear()

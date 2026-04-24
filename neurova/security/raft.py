"""Tiny in-process Raft-style replicated log for critical state.

The orchestrator runs a single leader by default, but this module
implements the log + commit index bookkeeping so critical city state
(active emergencies, resolved alerts, audit chain hashes) can be
replicated to follower instances. Transport is plug-in — by default we
persist to disk to simulate N replicas on the same node.
"""
from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import dataclass, field


@dataclass
class LogEntry:
    index: int
    term: int
    ts_ms: int
    payload: dict


class RaftLog:
    def __init__(self, path: str, term: int = 1) -> None:
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._lock = threading.Lock()
        self.entries: list[LogEntry] = []
        self.commit_index = -1
        self.last_applied = -1
        self.current_term = term
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    e = json.loads(line)
                    self.entries.append(LogEntry(**e))
            if self.entries:
                self.commit_index = self.entries[-1].index
                self.current_term = self.entries[-1].term

    def append(self, payload: dict) -> LogEntry:
        with self._lock:
            idx = (self.entries[-1].index + 1) if self.entries else 0
            entry = LogEntry(index=idx, term=self.current_term, ts_ms=int(time.time() * 1000), payload=payload)
            self.entries.append(entry)
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry.__dict__) + "\n")
            self.commit_index = idx
            return entry

    def since(self, index: int) -> list[LogEntry]:
        with self._lock:
            return [e for e in self.entries if e.index > index]

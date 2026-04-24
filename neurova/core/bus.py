"""In-process pub/sub bus shared between microservices in the same host.

This is a lightweight companion to the network broker: subcomponents of
the same service publish events here to avoid re-encoding every frame.
"""
from __future__ import annotations

import queue
import threading
from collections import defaultdict
from typing import Callable


class InProcBus:
    def __init__(self) -> None:
        self._subs: dict[str, list[queue.Queue]] = defaultdict(list)
        self._lock = threading.Lock()

    def subscribe(self, topic: str, maxsize: int = 10_000) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=maxsize)
        with self._lock:
            self._subs[topic].append(q)
        return q

    def publish(self, topic: str, event: dict) -> None:
        with self._lock:
            listeners = list(self._subs.get(topic, []))
        for q in listeners:
            try:
                q.put_nowait(event)
            except queue.Full:
                try:
                    q.get_nowait()
                    q.put_nowait(event)
                except queue.Empty:
                    pass

    def drain(self, q: queue.Queue, max_items: int = 1_000) -> list[dict]:
        out: list[dict] = []
        while len(out) < max_items:
            try:
                out.append(q.get_nowait())
            except queue.Empty:
                break
        return out


GLOBAL_BUS = InProcBus()

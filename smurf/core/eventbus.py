"""In-process publish/subscribe event bus.

The bus is the single authoritative channel through which the SIP stack,
RTP engine, PBX core and HTTP layers exchange runtime events (call started,
registration created, voicemail recorded, ...).  It is asyncio-native and
lock-free at the consumer side: each subscriber owns a private queue.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Event:
    topic: str
    payload: dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=time.time)


class EventBus:
    def __init__(self, history: int = 500) -> None:
        self._subs: dict[str, list[asyncio.Queue[Event]]] = {}
        self._history: deque[Event] = deque(maxlen=history)

    def history(self, topic_prefix: str | None = None) -> list[Event]:
        if topic_prefix is None:
            return list(self._history)
        return [e for e in self._history if e.topic.startswith(topic_prefix)]

    def subscribe(self, topic: str = "*") -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1024)
        self._subs.setdefault(topic, []).append(q)
        return q

    def unsubscribe(self, topic: str, q: asyncio.Queue[Event]) -> None:
        if topic in self._subs and q in self._subs[topic]:
            self._subs[topic].remove(q)

    def publish(self, topic: str, payload: dict[str, Any] | None = None) -> None:
        ev = Event(topic=topic, payload=payload or {})
        self._history.append(ev)
        for sub_topic, qs in self._subs.items():
            if sub_topic == "*" or topic == sub_topic or topic.startswith(sub_topic + "."):
                for q in qs:
                    try:
                        q.put_nowait(ev)
                    except asyncio.QueueFull:
                        pass


BUS = EventBus()

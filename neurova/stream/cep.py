"""Complex Event Processing — pattern rules on streams of events.

The CEP layer is distinct from the rule engine (Capa 3). CEP detects
patterns over raw event streams (e.g. "3 CO2 sensors within 200 m spike
above 800 ppm in 30 s"); the rule engine runs user-defined rules on top
of aggregated metrics produced by this layer.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from neurova.core.geo import haversine_m


@dataclass
class Pattern:
    """A 'X events matching predicate P within time T inside radius R'."""

    name: str
    predicate: Callable[[dict], bool]
    count: int
    within_ms: int
    radius_m: float | None = None
    severity: str = "medium"
    description: str = ""
    cooldown_ms: int = 30_000


class PatternDetector:
    def __init__(self, patterns: Iterable[Pattern]) -> None:
        self.patterns = list(patterns)
        self.events: dict[str, deque[dict]] = defaultdict(lambda: deque(maxlen=2048))
        self.last_fired: dict[str, float] = {}

    def add_event(self, event: dict) -> list[dict]:
        """Feed a new event (must contain ts_ms, lat, lon and payload)."""
        fired: list[dict] = []
        ts_ms = event["ts_ms"]
        for pattern in self.patterns:
            if not pattern.predicate(event):
                continue
            self.events[pattern.name].append(event)
            horizon = ts_ms - pattern.within_ms
            while self.events[pattern.name] and self.events[pattern.name][0]["ts_ms"] < horizon:
                self.events[pattern.name].popleft()
            matching: list[dict] = []
            for e in self.events[pattern.name]:
                if pattern.radius_m is None or haversine_m(event["lat"], event["lon"], e["lat"], e["lon"]) <= pattern.radius_m:
                    matching.append(e)
            if len(matching) >= pattern.count:
                last = self.last_fired.get(pattern.name, 0)
                if (ts_ms - last) >= pattern.cooldown_ms:
                    self.last_fired[pattern.name] = ts_ms
                    fired.append(
                        {
                            "ts_ms": ts_ms,
                            "pattern": pattern.name,
                            "severity": pattern.severity,
                            "description": pattern.description,
                            "count": len(matching),
                            "events": matching[-pattern.count :],
                            "center": {"lat": event["lat"], "lon": event["lon"]},
                        }
                    )
        return fired

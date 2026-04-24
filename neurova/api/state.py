"""Authoritative in-memory state for the orchestrator.

Collects the latest sensor value per series, aggregated metrics (mean,
p95 per kind), active alerts, emergency incidents, and cached AI
outputs. Access is guarded by a single RLock; fast readers (the API
handlers) copy the state snapshot they need before returning it.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any

from neurova.core import ids


@dataclass
class Alert:
    id: str
    ts_ms: int
    severity: str
    kind: str
    message: str
    zone: str | None = None
    source: str = "system"
    status: str = "new"
    related: list[dict] = field(default_factory=list)
    acknowledged_by: str | None = None
    resolved_at: int | None = None


@dataclass
class CitizenReport:
    id: str
    ts_ms: int
    type: str
    zone: str
    description: str
    photo_b64: str | None = None
    lat: float = 0.0
    lon: float = 0.0
    status: str = "open"


@dataclass
class Emergency:
    id: str
    ts_ms: int
    kind: str
    zone: str
    lat: float
    lon: float
    severity: str
    description: str
    status: str = "active"
    timeline: list[dict] = field(default_factory=list)
    assigned_units: list[str] = field(default_factory=list)


@dataclass
class DecisionEntry:
    ts_ms: int
    rule: str
    actions: list[dict]
    actor: str


class NeurovaState:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.latest: dict[str, dict] = {}
        self.metrics: dict[str, dict] = defaultdict(lambda: defaultdict(lambda: {"values": deque(maxlen=300), "p95": 0.0, "mean": 0.0, "max": 0.0, "min": 0.0, "sum": 0.0}))
        self.alerts: dict[str, Alert] = {}
        self.reports: dict[str, CitizenReport] = {}
        self.emergencies: dict[str, Emergency] = {}
        self.decisions: deque[DecisionEntry] = deque(maxlen=500)
        self.traffic_lights: dict[str, dict] = {}
        self.pumps: dict[str, dict] = {}
        self.street_lights_level: int = 0
        self.emergency_corridor: bool = False
        self.energy_reserve_active: bool = False
        self.waste_dispatch: dict[str, list[list[int]]] = {}
        self.anomaly_scores: deque[dict] = deque(maxlen=500)
        self.event_stream: deque[dict] = deque(maxlen=1000)
        self.stats = {"events_in": 0, "events_out": 0, "decisions": 0, "alerts": 0}
        self.city_meta: dict = {}

    def lock(self):
        return self._lock

    def record_sample(self, topic: str, payload: dict, ts_ms: int) -> None:
        with self._lock:
            self.latest[topic] = {"ts_ms": ts_ms, "payload": payload}
            self.stats["events_in"] += 1
            kind = topic.split("/")[1] if "/" in topic else "unknown"
            for metric_name, value in payload.items():
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    continue
                bucket = self.metrics[kind][metric_name]
                bucket["values"].append(float(value))
                vals = bucket["values"]
                bucket["mean"] = sum(vals) / len(vals)
                bucket["min"] = min(vals)
                bucket["max"] = max(vals)
                bucket["sum"] = sum(vals)
                ordered = sorted(vals)
                bucket["p95"] = ordered[min(len(ordered) - 1, int(0.95 * len(ordered)))]

    def metrics_snapshot(self) -> dict:
        with self._lock:
            out: dict[str, dict] = {}
            for kind, metric_map in self.metrics.items():
                out[kind] = {}
                for name, bucket in metric_map.items():
                    out[kind][name] = {
                        "mean": bucket["mean"],
                        "min": bucket["min"],
                        "max": bucket["max"],
                        "p95": bucket["p95"],
                        "sum": bucket["sum"],
                    }
            return out

    def add_alert(self, severity: str, kind: str, message: str, zone: str | None = None, related: list[dict] | None = None) -> Alert:
        with self._lock:
            alert = Alert(
                id=ids.ulid(),
                ts_ms=int(time.time() * 1000),
                severity=severity,
                kind=kind,
                message=message,
                zone=zone,
                related=related or [],
            )
            self.alerts[alert.id] = alert
            self.stats["alerts"] += 1
            self.event_stream.appendleft(
                {
                    "id": alert.id,
                    "ts_ms": alert.ts_ms,
                    "severity": severity,
                    "kind": kind,
                    "message": message,
                    "zone": zone,
                }
            )
            return alert

    def add_emergency(self, kind: str, zone: str, lat: float, lon: float, severity: str, description: str) -> Emergency:
        with self._lock:
            em = Emergency(
                id=ids.ulid(),
                ts_ms=int(time.time() * 1000),
                kind=kind,
                zone=zone,
                lat=lat,
                lon=lon,
                severity=severity,
                description=description,
            )
            em.timeline.append({"ts_ms": em.ts_ms, "event": "detected", "actor": "ai"})
            self.emergencies[em.id] = em
            return em

    def set_city_meta(self, meta: dict) -> None:
        with self._lock:
            self.city_meta = meta

    def add_decision(self, entry: DecisionEntry) -> None:
        with self._lock:
            self.decisions.appendleft(entry)
            self.stats["decisions"] += 1

"""Intrusion detection system for NEUROVA sensor and API traffic.

Detects, per client/IP:
 - port scans (many distinct destination ports in a short window)
 - replay attacks (identical payload from same sensor in < 1s window)
 - credential stuffing (many failed logins per source)
 - data manipulation (sensor sending value outside calibrated range)

Findings are emitted as events to the in-process bus so the rule engine
can decide whether to raise alerts, revoke a key or dispatch operators.
"""
from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Iterable


@dataclass
class IDSEvent:
    ts_ms: int
    kind: str
    source: str
    detail: dict


class IntrusionDetector:
    def __init__(self) -> None:
        self.ports: dict[str, deque] = defaultdict(lambda: deque(maxlen=128))
        self.payload_hash: dict[str, tuple[int, str]] = {}
        self.failed_logins: dict[str, deque] = defaultdict(lambda: deque(maxlen=64))
        self.sensor_ranges: dict[str, tuple[float, float]] = {
            "co2_ppm": (300, 5000),
            "no2_ugm3": (0, 600),
            "pm25_ugm3": (0, 800),
            "noise_db": (20, 140),
            "pressure_bar": (0.5, 10),
            "voltage_v": (80, 260),
            "frequency_hz": (45, 55),
        }

    def observe_port(self, source: str, port: int) -> IDSEvent | None:
        bucket = self.ports[source]
        now = time.time() * 1000
        bucket.append((now, port))
        while bucket and now - bucket[0][0] > 10_000:
            bucket.popleft()
        distinct = len({p for _, p in bucket})
        if distinct >= 15:
            return IDSEvent(int(now), "port_scan", source, {"distinct_ports": distinct})
        return None

    def observe_payload(self, source: str, sensor_id: str, payload_bytes: bytes) -> IDSEvent | None:
        now = int(time.time() * 1000)
        h = hashlib.sha1(payload_bytes).hexdigest()
        key = f"{source}:{sensor_id}"
        prev = self.payload_hash.get(key)
        self.payload_hash[key] = (now, h)
        if prev and prev[1] == h and now - prev[0] < 1000:
            return IDSEvent(now, "replay", source, {"sensor": sensor_id})
        return None

    def observe_login(self, source: str, ok: bool) -> IDSEvent | None:
        if ok:
            self.failed_logins[source].clear()
            return None
        now = time.time() * 1000
        bucket = self.failed_logins[source]
        bucket.append(now)
        while bucket and now - bucket[0] > 60_000:
            bucket.popleft()
        if len(bucket) >= 5:
            return IDSEvent(int(now), "credential_stuffing", source, {"failures": len(bucket)})
        return None

    def validate_sensor(self, sensor_id: str, sample: dict) -> IDSEvent | None:
        for metric, (lo, hi) in self.sensor_ranges.items():
            v = sample.get(metric)
            if v is None:
                continue
            if not (lo <= v <= hi):
                return IDSEvent(int(time.time() * 1000), "sensor_outlier", sensor_id, {"metric": metric, "value": v, "bound": [lo, hi]})
        return None

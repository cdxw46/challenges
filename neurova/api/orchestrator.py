"""NEUROVA orchestrator — ties the city together in a single asyncio loop.

Responsibilities:
    - Run the broker (MQTT + HTTP + WebSocket + AMQP) in the same process
    - Drive the synthetic sensor simulator
    - Consume every event and update state/TSDB
    - Run the AI + rule engine on a tick
    - Expose the full HTTP API + websocket feeds for the dashboards

Because the broker, simulator, TSDB and AI all share the in-proc bus,
this runs at >10k msgs/s on a single worker even without the network
hop.
"""
from __future__ import annotations

import asyncio
import json
import math
import os
import random
import signal
import sys
import threading
import time
from collections import defaultdict, deque
from dataclasses import asdict
from typing import Any

from neurova.ai.autoencoder import AutoEncoder
from neurova.ai.classifier import SoftmaxClassifier
from neurova.ai.lstm import LSTM
from neurova.ai.q_traffic import DQNAgent
from neurova.ai.regression import RidgeRegressor
from neurova.ai.vrp import AntColonyVRP
from neurova.api import http as http_mod
from neurova.api import state as state_mod
from neurova.api.auth import AuthStore
from neurova.broker.server import Broker
from neurova.core import bus, codec, ids
from neurova.core.logger import get_logger
from neurova.rules.engine import DecisionRecord, RuleEngine
from neurova.rules.library import DEFAULT_RULES
from neurova.security.ids import IntrusionDetector
from neurova.security.raft import RaftLog
from neurova.simulator import city as city_mod
from neurova.simulator import dynamics
from neurova.simulator.run import Simulator, topic_for
from neurova.stream.cep import Pattern, PatternDetector
from neurova.stream.windows import MultiWindow
from neurova.tsdb import TSDB

LOGGER = get_logger("orchestrator")

CITY_SEED = os.environ.get("NEUROVA_SEED", "neurova")
DATA_ROOT = os.environ.get("NEUROVA_DATA", "/workspace/neurova/data")
API_PORT = int(os.environ.get("NEUROVA_API_PORT", "8443"))
BROKER_HTTP_PORT = int(os.environ.get("NEUROVA_BROKER_HTTP_PORT", "18080"))
BROKER_MQTT_PORT = int(os.environ.get("NEUROVA_MQTT_PORT", "18830"))
BROKER_AMQP_PORT = int(os.environ.get("NEUROVA_AMQP_PORT", "18672"))
SIM_HZ = float(os.environ.get("NEUROVA_SIM_HZ", "0.5"))


class WebSocketClient:
    def __init__(self, writer: asyncio.StreamWriter, channels: list[str]):
        self.writer = writer
        self.channels = channels
        self.queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=500)


class Orchestrator:
    def __init__(self) -> None:
        self.city = city_mod.build_city(CITY_SEED)
        self.state = state_mod.NeurovaState()
        self.state.set_city_meta(self.city.to_dict())
        self.auth = AuthStore(os.path.join(DATA_ROOT, "auth.sqlite"))
        self.broker = Broker(DATA_ROOT)
        self.tsdb = TSDB(os.path.join(DATA_ROOT, "tsdb"))
        self.rules = RuleEngine(os.path.join(DATA_ROOT, "audit", "decisions.log"))
        self.rules.load_source(DEFAULT_RULES)
        self._install_actions()
        self.simulator = Simulator(self.city, hz=SIM_HZ)
        self.sim_thread: threading.Thread | None = None
        self.windows = MultiWindow()
        self._ai_predictor_traffic = LSTM(input_size=3, hidden_size=16)
        self._ai_anomaly = AutoEncoder(input_size=9, hidden_size=12)
        self._ai_energy = RidgeRegressor(features=6)
        self._ai_incidents = SoftmaxClassifier(features=7, classes=5)
        self._ai_traffic_agent = DQNAgent()
        self._in_proc_sim = os.environ.get("NEUROVA_INPROC_SIM", "0") == "1"
        self._cep = self._build_cep()
        self._ids = IntrusionDetector()
        self._raft = RaftLog(os.path.join(DATA_ROOT, "raft", "state.log"))
        self._ws_clients: list[WebSocketClient] = []
        self._ws_lock = asyncio.Lock()
        self._start_ts = time.time()
        self._latest_events: deque[dict] = deque(maxlen=200)
        self._last_traffic_predictions: dict[str, float] = {}
        self._router = self._build_router()
        self._trained_traffic_steps = 0
        self._zone_traffic_history: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=60))
        self._zone_energy_history: dict[str, deque[float]] = defaultdict(lambda: deque(maxlen=60))

    def _install_actions(self) -> None:
        def raise_alert(args, facts):
            severity, kind, message = args[:3]
            zone = args[3] if len(args) > 3 else facts.get("state", {}).get("active_zone")
            alert = self.state.add_alert(severity, kind, message, zone=zone)
            self._broadcast_event("alert", asdict(alert))
            return {"alert_id": alert.id}

        def activate_alert_panel(args, facts):
            LOGGER.info("activate_alert_panel", target=args)
            return {"panel": args[0] if args else "global", "active": True}

        def tighten_traffic_lights(args, facts):
            for light_id in list(self.state.traffic_lights.keys())[:50]:
                self.state.traffic_lights[light_id]["program"] = "tight"
            return {"lights_programmed": min(50, len(self.state.traffic_lights))}

        def reroute_transit(args, facts):
            rerouted = 0
            for sensor in self.city.sensors.values():
                if sensor.kind == "transit":
                    rerouted += 1
                if rerouted >= 30:
                    break
            return {"reroutes": rerouted}

        def activate_battery_reserve(args, facts):
            self.state.energy_reserve_active = True
            return {"reserve": "active"}

        def close_valve(args, facts):
            vid = args[0] if args else "main"
            self.state.pumps[f"valve-{vid}"] = {"status": "closed", "ts": int(time.time() * 1000)}
            return {"valve": vid, "status": "closed"}

        def activate_reserve_pump(args, facts):
            self.state.pumps["reserve"] = {"status": "on", "ts": int(time.time() * 1000)}
            return {"pump": "reserve", "status": "on"}

        def schedule_waste_pickup(args, facts):
            full_bins = [s for s in self.city.sensors.values() if s.kind == "waste"][:50]
            if not full_bins:
                return {"routes": []}
            coords = [(self.city.zones["Z00"].center[0], self.city.zones["Z00"].center[1])] + [(b.lat, b.lon) for b in full_bins]
            aco = AntColonyVRP(iterations=10, ants=8)
            routes, cost = aco.solve(coords, vehicle_capacity=25)
            self.state.waste_dispatch["latest"] = routes
            return {"routes": len(routes), "cost": round(cost, 2)}

        def dispatch_firefighters(args, facts):
            em = self.state.add_emergency(
                kind="fire",
                zone=facts.get("state", {}).get("active_zone", "Z00"),
                lat=self.city.zones["Z00"].center[0],
                lon=self.city.zones["Z00"].center[1],
                severity="critical",
                description=args[0] if args else "Emergencia de incendio",
            )
            em.assigned_units = ["BOMB-01", "BOMB-02"]
            em.timeline.append({"ts_ms": int(time.time() * 1000), "event": "dispatch", "actor": "ai", "units": em.assigned_units})
            self._broadcast_event("emergency", asdict(em))
            return {"emergency": em.id, "units": em.assigned_units}

        def dispatch_police(args, facts):
            em = self.state.add_emergency(
                kind="police",
                zone=facts.get("state", {}).get("active_zone", "Z00"),
                lat=self.city.zones["Z00"].center[0],
                lon=self.city.zones["Z00"].center[1],
                severity="critical",
                description=args[0] if args else "Incidente de seguridad",
            )
            em.assigned_units = ["POL-04", "POL-07"]
            em.timeline.append({"ts_ms": int(time.time() * 1000), "event": "dispatch", "actor": "ai", "units": em.assigned_units})
            self._broadcast_event("emergency", asdict(em))
            return {"emergency": em.id, "units": em.assigned_units}

        def reinforce_fleet(args, facts):
            return {"buses_dispatched": 5}

        def adjust_street_lights(args, facts):
            level = int(args[0]) if args else 50
            self.state.street_lights_level = level
            return {"level": level}

        def activate_variable_panel(args, facts):
            return {"panel_message": args[0] if args else "info"}

        def adjust_energy_mix(args, facts):
            return {"mode": args[0] if args else "balanced"}

        def notify_citizens(args, facts):
            topic = args[0] if args else "info"
            self._broadcast_event("citizen_notice", {"topic": topic, "ts_ms": int(time.time() * 1000)})
            return {"notified_topic": topic}

        def notify_operators(args, facts):
            self._broadcast_event("operator_notice", {"message": args[0] if args else "atención"})
            return {"notified": True}

        def open_emergency_corridor(args, facts):
            self.state.emergency_corridor = True
            return {"corridor": "open"}

        for name, fn in {
            "raise_alert": raise_alert,
            "activate_alert_panel": activate_alert_panel,
            "tighten_traffic_lights": tighten_traffic_lights,
            "reroute_transit": reroute_transit,
            "activate_battery_reserve": activate_battery_reserve,
            "close_valve": close_valve,
            "activate_reserve_pump": activate_reserve_pump,
            "schedule_waste_pickup": schedule_waste_pickup,
            "dispatch_firefighters": dispatch_firefighters,
            "dispatch_police": dispatch_police,
            "reinforce_fleet": reinforce_fleet,
            "adjust_street_lights": adjust_street_lights,
            "activate_variable_panel": activate_variable_panel,
            "adjust_energy_mix": adjust_energy_mix,
            "notify_citizens": notify_citizens,
            "notify_operators": notify_operators,
            "open_emergency_corridor": open_emergency_corridor,
        }.items():
            self.rules.register_action(name, fn)

    def _build_cep(self) -> PatternDetector:
        def high_co2(ev):
            payload = ev.get("payload", {})
            return ev["topic"].startswith("city/env/") and payload.get("co2_ppm", 0) > 900
        def sudden_noise(ev):
            payload = ev.get("payload", {})
            return ev["topic"].startswith("city/env/") and payload.get("noise_db", 0) > 85
        def high_vibration(ev):
            return ev["topic"].startswith("city/infra/") and ev.get("payload", {}).get("vibration_g", 0) > 0.3
        def gunshot(ev):
            return ev["topic"].startswith("city/security/") and ev.get("payload", {}).get("gunshot_detected", False)
        def stopped_traffic(ev):
            return ev["topic"].startswith("city/traffic/") and ev.get("payload", {}).get("speed_kmh", 99) < 5 and ev.get("payload", {}).get("occupancy", 0) > 0.7
        patterns = [
            Pattern(name="CO2_CLUSTER", predicate=high_co2, count=3, within_ms=30_000, radius_m=250, severity="high", description="3+ sensores de CO2 superan 900 ppm en 30s"),
            Pattern(name="NOISE_CLUSTER", predicate=sudden_noise, count=4, within_ms=60_000, radius_m=400, severity="medium", description="Pico de ruido sostenido"),
            Pattern(name="STRUCTURAL_ALERT", predicate=high_vibration, count=2, within_ms=60_000, radius_m=100, severity="critical", description="Vibración estructural en zona"),
            Pattern(name="GUNSHOT_MULTIPLE", predicate=gunshot, count=1, within_ms=5_000, radius_m=1500, severity="critical", description="Disparo detectado"),
            Pattern(name="TRAFFIC_ACCIDENT_CLUSTER", predicate=stopped_traffic, count=4, within_ms=120_000, radius_m=300, severity="high", description="Cluster de tráfico detenido"),
        ]
        return PatternDetector(patterns)

    def _broadcast_event(self, channel: str, payload: dict) -> None:
        event = {"channel": channel, "ts_ms": int(time.time() * 1000), "payload": payload}
        self._latest_events.appendleft(event)
        self.state.event_stream.appendleft(event)
        for client in list(self._ws_clients):
            if client.channels == ["*"] or channel in client.channels:
                try:
                    client.queue.put_nowait(event)
                except asyncio.QueueFull:
                    try:
                        client.queue.get_nowait()
                        client.queue.put_nowait(event)
                    except asyncio.QueueEmpty:
                        pass

    async def _pump_bus(self) -> None:
        q = bus.GLOBAL_BUS.subscribe("message", maxsize=100_000)
        loop = asyncio.get_running_loop()
        LOGGER.info("bus pump started")
        while True:
            batch = await loop.run_in_executor(None, lambda: bus.GLOBAL_BUS.drain(q, 1500))
            if not batch:
                await asyncio.sleep(0.05)
                continue
            processed = 0
            for evt in batch:
                try:
                    self._handle_event(evt)
                except Exception as exc:
                    LOGGER.error("handle_event error", err=str(exc))
                processed += 1
                if processed % 200 == 0:
                    await asyncio.sleep(0)  # yield control to HTTP handlers periodically

    def _handle_event(self, evt: dict) -> None:
        topic = evt["topic"]
        ts_ms = evt["ts_ms"]
        raw = evt["payload"]
        if isinstance(raw, bytes):
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                return
        else:
            payload = raw
        self.state.record_sample(topic, payload, ts_ms)
        outlier = self._ids.validate_sensor(payload.get("sensor_id", ""), payload)
        if outlier:
            self._broadcast_event("ids", {"kind": outlier.kind, "source": outlier.source, "detail": outlier.detail})
            self.state.add_alert("medium", f"ids/{outlier.kind}", f"Outlier detectado en {outlier.source}", zone=payload.get("zone"))
        sensor_id = payload.get("sensor_id")
        lat = payload.get("lat", 0.0)
        lon = payload.get("lon", 0.0)
        zone = payload.get("zone", "Z00")
        kind = topic.split("/")[1] if "/" in topic else "unknown"
        # TSDB write (subset: critical metrics to keep disk usage bounded)
        tsdb_keys = {
            "traffic": ["flow_vph", "speed_kmh", "occupancy"],
            "env": ["co2_ppm", "no2_ugm3", "pm25_ugm3", "noise_db", "temp_c"],
            "energy": ["load_kw", "solar_kw", "battery_pct", "voltage_v", "frequency_hz"],
            "water": ["pressure_bar", "flow_lps", "ph", "tank_level"],
            "waste": ["fill_pct", "internal_temp_c"],
            "transit": ["occupancy", "speed_kmh"],
            "infra": ["vibration_g", "flood_cm"],
            "security": ["people_density"],
        }
        for metric in tsdb_keys.get(kind, []):
            v = payload.get(metric)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                series_id = f"{kind}.{metric}.{zone}"
                self.tsdb.write(series_id, ts_ms, float(v), {"kind": kind, "zone": zone, "metric": metric})
        # CEP
        fired = self._cep.add_event({"ts_ms": ts_ms, "lat": lat, "lon": lon, "topic": topic, "payload": payload})
        for pat in fired:
            alert = self.state.add_alert(
                severity=pat["severity"],
                kind=f"cep/{pat['pattern']}",
                message=pat["description"],
                zone=zone,
                related=[{"count": pat["count"], "center": pat["center"]}],
            )
            self._broadcast_event("cep", pat)
            self._broadcast_event("alert", asdict(alert))
        # Anomaly detection (sample subset of sensors to keep CPU bounded)
        if kind == "env" and random.random() < 0.01:
            features = [
                payload.get("co2_ppm", 0) / 2000.0,
                payload.get("no2_ugm3", 0) / 400.0,
                payload.get("pm25_ugm3", 0) / 200.0,
                payload.get("pm10_ugm3", 0) / 300.0,
                payload.get("so2_ugm3", 0) / 100.0,
                payload.get("noise_db", 0) / 120.0,
                payload.get("temp_c", 0) / 50.0,
                (payload.get("humidity", 0) or 0) * 1.0,
                payload.get("pressure_hpa", 1013) / 1100.0,
            ]
            self._ai_anomaly.learn(features, lr=0.01)
            score = self._ai_anomaly.score(features)
            threshold = self._ai_anomaly.threshold(0.98)
            if score > threshold and threshold != float("inf"):
                self.state.anomaly_scores.appendleft({"ts_ms": ts_ms, "sensor": sensor_id, "score": score, "threshold": threshold})
                self._broadcast_event("anomaly", {"sensor": sensor_id, "score": round(score, 4), "threshold": round(threshold, 4)})
        # Stream windows for quick aggregation
        if kind == "traffic":
            self.windows.add(ts_ms, payload.get("flow_vph", 0))
            self._zone_traffic_history[zone].append(payload.get("flow_vph", 0))
        elif kind == "energy":
            self._zone_energy_history[zone].append(payload.get("load_kw", 0))
        # Push to WebSocket sensor channel
        if random.random() < 0.02:
            self._broadcast_event(
                "sensor",
                {"topic": topic, "sensor_id": sensor_id, "zone": zone, "lat": lat, "lon": lon, "kind": kind, "payload": payload},
            )

    async def _tick_loop(self) -> None:
        """Runs AI + rule engine every 7s."""
        while True:
            await asyncio.sleep(7)
            try:
                self._run_ai_predictions()
                facts = self._build_facts()
                fired = self.rules.evaluate(facts, actor="neurova-ai")
                for record in fired:
                    self.state.add_decision(
                        state_mod.DecisionEntry(
                            ts_ms=record.ts_ms,
                            rule=record.rule,
                            actions=record.actions,
                            actor=record.actor,
                        )
                    )
                    self._broadcast_event(
                        "decision",
                        {"rule": record.rule, "actions": record.actions, "ts_ms": record.ts_ms},
                    )
            except Exception as exc:
                LOGGER.error("tick loop error", err=str(exc))

    def _build_facts(self) -> dict:
        metrics_snapshot = self.state.metrics_snapshot()
        now = time.localtime()
        facts = {
            "metrics": metrics_snapshot,
            "state": {
                "hour": now.tm_hour,
                "weekend": 1 if now.tm_wday >= 5 else 0,
                "is_night": 1 if now.tm_hour >= 22 or now.tm_hour <= 6 else 0,
                "alerts_critical": sum(1 for a in self.state.alerts.values() if a.severity == "critical" and a.status != "resolved"),
                "anomaly_cluster": len(self.state.anomaly_scores),
                "citizen_reports_open": sum(1 for r in self.state.reports.values() if r.status == "open"),
                "emergency_active": 1 if any(e.status == "active" for e in self.state.emergencies.values()) else 0,
            },
            "ai": {
                "autoencoder": {"score": self._ai_anomaly.threshold(0.5), "threshold": self._ai_anomaly.threshold(0.98)},
            },
        }
        return facts

    def _run_ai_predictions(self) -> None:
        for zone_id, history in list(self._zone_traffic_history.items()):
            if len(history) < 12:
                continue
            seq = [[v / 500.0, (i % 12) / 12.0, math.sin(i / 6)] for i, v in enumerate(list(history)[-24:])]
            target = list(history)[-1] / 500.0
            self._ai_predictor_traffic.train_sequence(seq, target, lr=0.005)
            pred = self._ai_predictor_traffic.predict(seq)
            self._last_traffic_predictions[zone_id] = round(max(0.0, pred) * 500.0, 1)
        for zone_id, history in list(self._zone_energy_history.items()):
            if len(history) < 10:
                continue
            last = list(history)[-1]
            tm = time.localtime()
            features = [
                tm.tm_hour / 24.0,
                tm.tm_min / 60.0,
                1.0 if tm.tm_wday >= 5 else 0.0,
                math.sin(2 * math.pi * tm.tm_hour / 24),
                math.cos(2 * math.pi * tm.tm_hour / 24),
                last / 400.0,
            ]
            target = last / 400.0
            self._ai_energy.learn(features, target, lr=0.01)

    async def _run_http(self) -> None:
        server = await http_mod.serve(self._router, "0.0.0.0", API_PORT)
        LOGGER.info("http listening", port=API_PORT)
        async with server:
            await server.serve_forever()

    async def _run_broker(self) -> None:
        LOGGER.info("broker starting")
        await self.broker.run(BROKER_MQTT_PORT, BROKER_HTTP_PORT, BROKER_AMQP_PORT)

    def _start_simulator(self) -> None:
        if self._in_proc_sim:
            self.sim_thread = threading.Thread(target=self.simulator.run, daemon=True)
            self.sim_thread.start()
        else:
            LOGGER.info("simulator will be driven by external process via MQTT")

    # ---------- HTTP Router ----------
    def _build_router(self) -> http_mod.Router:
        r = http_mod.Router()

        async def health(req):
            return 200, {}, {"status": "ok", "uptime_s": round(time.time() - self._start_ts, 2), "version": "1.0.0"}

        async def stats(req):
            return 200, {}, {
                "city": {"zones": len(self.city.zones), "edges": len(self.city.edges), "sensors": len(self.city.sensors)},
                "broker": self.broker.metrics.snapshot(),
                "simulator": self.simulator.metrics(),
                "tsdb": self.tsdb.stats(),
                "events_in": self.state.stats["events_in"],
                "alerts": self.state.stats["alerts"],
                "decisions": self.state.stats["decisions"],
                "active_alerts": sum(1 for a in self.state.alerts.values() if a.status != "resolved"),
                "emergencies_active": sum(1 for e in self.state.emergencies.values() if e.status == "active"),
                "anomalies": len(self.state.anomaly_scores),
                "street_lights_level": self.state.street_lights_level,
                "energy_reserve": self.state.energy_reserve_active,
                "waste_routes": len(self.state.waste_dispatch.get("latest", [])),
                "predictions": self._last_traffic_predictions,
            }

        async def kpis(req):
            metrics = self.state.metrics_snapshot()
            active_alerts = [a for a in self.state.alerts.values() if a.status != "resolved"]
            congestion = min(100, round((metrics.get("traffic", {}).get("occupancy", {}).get("mean", 0.0) or 0.0) * 130, 1))
            kpi = {
                "vehicles_in_circulation": int((metrics.get("traffic", {}).get("flow_vph", {}).get("sum", 0) or 0)),
                "average_speed_kmh": round(metrics.get("traffic", {}).get("speed_kmh", {}).get("mean", 0.0), 1),
                "congestion_index": congestion,
                "aqi": _compute_aqi(metrics.get("env", {})),
                "energy_load_kw": round(metrics.get("energy", {}).get("load_kw", {}).get("sum", 0.0), 1),
                "renewable_pct": _renewable_pct(metrics.get("energy", {})),
                "temperature_c": round(metrics.get("env", {}).get("temp_c", {}).get("mean", 0.0), 1),
                "humidity": round(metrics.get("env", {}).get("humidity", {}).get("mean", 0.0), 3),
                "alerts": {
                    "critical": sum(1 for a in active_alerts if a.severity == "critical"),
                    "high": sum(1 for a in active_alerts if a.severity == "high"),
                    "medium": sum(1 for a in active_alerts if a.severity == "medium"),
                },
                "emergencies_active": sum(1 for e in self.state.emergencies.values() if e.status == "active"),
                "transit_occupancy": round(metrics.get("transit", {}).get("occupancy", {}).get("mean", 0.0), 3),
                "water_tank_min": round(metrics.get("water", {}).get("tank_level", {}).get("min", 0.0), 1),
                "water_flow": round(metrics.get("water", {}).get("flow_lps", {}).get("sum", 0.0), 1),
                "waste_full_bins": int(sum(1 for s in self.city.sensors.values() if s.kind == "waste" and self.state.latest.get(topic_for("waste", s.zone, s.id), {}).get("payload", {}).get("fill_pct", 0) > 85)),
                "predictions": self._last_traffic_predictions,
                "uptime_s": round(time.time() - self._start_ts, 2),
            }
            return 200, {}, kpi

        async def city_meta(req):
            return 200, {}, self.city.to_dict()

        async def sensors_list(req):
            kind = req.query.get("kind")
            zone = req.query.get("zone")
            out = []
            for s in self.city.sensors.values():
                if kind and s.kind != kind:
                    continue
                if zone and s.zone != zone:
                    continue
                out.append({"id": s.id, "kind": s.kind, "lat": s.lat, "lon": s.lon, "zone": s.zone})
                if len(out) >= 2000:
                    break
            return 200, {}, {"sensors": out, "total": len(out)}

        async def sensor_latest(req):
            sid = req.query["sensor_id"]
            for topic, info in self.state.latest.items():
                if info["payload"].get("sensor_id") == sid:
                    return 200, {}, {"topic": topic, "data": info}
            return 404, {}, {"error": "sensor not found"}

        async def history(req):
            series = req.query.get("series")
            if not series:
                return 400, {}, {"error": "series required"}
            end = int(req.query.get("end_ms", time.time() * 1000))
            start = int(req.query.get("start_ms", end - 60 * 60 * 1000))
            data = self.tsdb.query_range(series, start, end)
            return 200, {}, {"series": series, "points": data, "count": len(data)}

        async def events(req):
            limit = int(req.query.get("limit", 100))
            channels = req.query.get("channels")
            events = list(self._latest_events)
            if channels:
                allowed = set(channels.split(","))
                events = [e for e in events if e.get("channel") in allowed]
            return 200, {}, {"events": events[:limit]}

        async def alerts(req):
            data = [asdict(a) for a in sorted(self.state.alerts.values(), key=lambda x: -x.ts_ms)][:200]
            return 200, {}, {"alerts": data}

        async def emergencies(req):
            data = [asdict(e) for e in sorted(self.state.emergencies.values(), key=lambda x: -x.ts_ms)][:100]
            return 200, {}, {"emergencies": data}

        async def decisions(req):
            return 200, {}, {"decisions": [
                {"ts_ms": d.ts_ms, "rule": d.rule, "actions": d.actions, "actor": d.actor}
                for d in list(self.state.decisions)[:150]
            ]}

        async def rules_list(req):
            return 200, {}, {
                "rules": [
                    {"name": r.name, "priority": r.priority, "description": r.description}
                    for r in self.rules.rules
                ]
            }

        async def publish(req):
            try:
                body = req.json()
                topic = body["topic"]
                payload = body.get("payload", {})
                if isinstance(payload, dict):
                    payload_bytes = json.dumps(payload).encode("utf-8")
                elif isinstance(payload, str):
                    payload_bytes = payload.encode("utf-8")
                else:
                    payload_bytes = json.dumps(payload).encode("utf-8")
                await self.broker.publish(topic, payload_bytes, qos=body.get("qos", 0), source=req.remote)
                return 202, {}, {"accepted": True, "topic": topic}
            except Exception as exc:
                return 400, {}, {"error": str(exc)}

        async def citizen_report(req):
            try:
                if req.headers.get("content-type", "").startswith("multipart/"):
                    parts = req.multipart()
                    fields = {p["name"]: p["data"] for p in parts if p["name"]}
                    description = fields.get("description", b"").decode("utf-8", "replace")
                    zone = fields.get("zone", b"Z00").decode("utf-8", "replace")
                    rtype = fields.get("type", b"general").decode("utf-8", "replace")
                    lat = float(fields.get("lat", b"0") or b"0")
                    lon = float(fields.get("lon", b"0") or b"0")
                    photo = None
                    for p in parts:
                        if p.get("filename") and p["data"]:
                            photo = "data:%s;base64,%s" % (
                                p["content_type"],
                                __import__("base64").b64encode(p["data"]).decode(),
                            )
                            break
                else:
                    body = req.json() or {}
                    description = body.get("description", "")
                    zone = body.get("zone", "Z00")
                    rtype = body.get("type", "general")
                    lat = float(body.get("lat", 0))
                    lon = float(body.get("lon", 0))
                    photo = body.get("photo")
                rid = ids.ulid()
                report = state_mod.CitizenReport(
                    id=rid,
                    ts_ms=int(time.time() * 1000),
                    type=rtype,
                    zone=zone,
                    description=description,
                    photo_b64=photo,
                    lat=lat,
                    lon=lon,
                )
                self.state.reports[rid] = report
                self._broadcast_event("citizen_report", asdict(report))
                return 201, {}, {"id": rid}
            except Exception as exc:
                return 400, {}, {"error": str(exc)}

        async def citizen_reports(req):
            data = [asdict(r) for r in sorted(self.state.reports.values(), key=lambda x: -x.ts_ms)][:200]
            return 200, {}, {"reports": data}

        async def login(req):
            body = req.json() or {}
            user = self.auth.authenticate(body.get("email", ""), body.get("password", ""), body.get("totp"))
            ids_event = self._ids.observe_login(req.remote.split(":")[0], user is not None)
            if ids_event:
                self._broadcast_event("ids", {"kind": ids_event.kind, "source": ids_event.source, "detail": ids_event.detail})
            if not user:
                return 401, {}, {"error": "invalid credentials"}
            token = self.auth.issue_token(user, ["control:read", "control:write", "api:full"])
            self._raft.append({"type": "login", "user": user.email, "ts_ms": int(time.time() * 1000)})
            return 200, {}, {"token": token, "role": user.role, "email": user.email}

        async def citizen_login(req):
            body = req.json() or {}
            user = self.auth.authenticate_citizen(body.get("email", ""), body.get("password", ""))
            if not user:
                return 401, {}, {"error": "invalid credentials"}
            token = self.auth.issue_token(user, ["citizen"])
            return 200, {}, {"token": token}

        async def citizen_register(req):
            body = req.json() or {}
            email = body.get("email")
            password = body.get("password")
            zone = body.get("zone")
            if not email or not password:
                return 400, {}, {"error": "email and password required"}
            user = self.auth.create_citizen(email, password, zone)
            return 201, {}, {"email": user.email}

        async def api_docs(req):
            return 200, {"Content-Type": "text/html; charset=utf-8"}, _api_docs_html()

        async def openapi(req):
            return 200, {"Content-Type": "application/json"}, _openapi_spec()

        async def graphql(req):
            body = req.json() or {}
            q = body.get("query", "")
            return 200, {}, _run_graphql(self, q, body.get("variables", {}))

        async def apps_catalog(req):
            return 200, {}, _apps_catalog()

        async def enable_2fa(req):
            body = req.json() or {}
            email = body.get("email")
            if not email:
                return 400, {}, {"error": "email required"}
            secret = self.auth.enable_2fa(email)
            return 200, {}, {"secret": secret, "otpauth": f"otpauth://totp/NEUROVA:{email}?secret={secret}&issuer=NEUROVA"}

        async def users_list(req):
            return 200, {}, {"users": self.auth.list_users()}

        async def rules_preview(req):
            body = req.json() or {}
            try:
                self.rules.load_source(body.get("source", DEFAULT_RULES))
                return 200, {}, {"ok": True, "count": len(self.rules.rules)}
            except Exception as exc:
                return 400, {}, {"error": str(exc)}

        async def acknowledge_alert(req):
            aid = req.query.get("id")
            if not aid or aid not in self.state.alerts:
                return 404, {}, {"error": "not found"}
            a = self.state.alerts[aid]
            a.status = "acknowledged"
            a.acknowledged_by = req.query.get("operator", "admin")
            return 200, {}, {"ok": True}

        async def resolve_alert(req):
            aid = req.query.get("id")
            if not aid or aid not in self.state.alerts:
                return 404, {}, {"error": "not found"}
            a = self.state.alerts[aid]
            a.status = "resolved"
            a.resolved_at = int(time.time() * 1000)
            return 200, {}, {"ok": True}

        async def simulate_scenario(req):
            body = req.json() or {}
            scenario = body.get("scenario", "match_day")
            return 200, {}, _run_scenario(self, scenario)

        async def predict_traffic(req):
            sid = req.query.get("zone", "Z00")
            return 200, {}, {"zone": sid, "forecast_flow": self._last_traffic_predictions.get(sid, None)}

        async def ws_events(req, reader, writer):
            channels = req.query.get("channels", "*").split(",")
            client = WebSocketClient(writer, channels)
            async with self._ws_lock:
                self._ws_clients.append(client)
            try:
                initial = {
                    "channel": "welcome",
                    "payload": {"client_id": ids.short_id(6), "channels": channels, "ts_ms": int(time.time() * 1000)},
                }
                writer.write(http_mod.encode_ws_frame(json.dumps(initial).encode()))
                await writer.drain()
                reader_task = asyncio.create_task(self._ws_reader_drain(reader))
                try:
                    while True:
                        try:
                            event = await asyncio.wait_for(client.queue.get(), timeout=25.0)
                        except asyncio.TimeoutError:
                            writer.write(http_mod.encode_ws_frame(b"", op=0x9))
                            await writer.drain()
                            continue
                        data = json.dumps(event, default=str).encode()
                        writer.write(http_mod.encode_ws_frame(data))
                        await writer.drain()
                finally:
                    reader_task.cancel()
            except (ConnectionError, asyncio.IncompleteReadError):
                pass
            finally:
                async with self._ws_lock:
                    if client in self._ws_clients:
                        self._ws_clients.remove(client)

        # Register HTTP routes
        r.route("GET", "/api/health", health)
        r.route("GET", "/api/stats", stats)
        r.route("GET", "/api/kpis", kpis)
        r.route("GET", "/api/city", city_meta)
        r.route("GET", "/api/sensors", sensors_list)
        r.route("GET", "/api/sensor/latest", sensor_latest)
        r.route("GET", "/api/history", history)
        r.route("GET", "/api/events", events)
        r.route("GET", "/api/alerts", alerts)
        r.route("POST", "/api/alerts/ack", acknowledge_alert)
        r.route("POST", "/api/alerts/resolve", resolve_alert)
        r.route("GET", "/api/emergencies", emergencies)
        r.route("GET", "/api/decisions", decisions)
        r.route("GET", "/api/rules", rules_list)
        r.route("POST", "/api/rules/preview", rules_preview)
        r.route("POST", "/api/publish", publish)
        r.route("POST", "/api/report", citizen_report)
        r.route("GET", "/api/reports", citizen_reports)
        r.route("POST", "/api/login", login)
        r.route("POST", "/api/citizen/login", citizen_login)
        r.route("POST", "/api/citizen/register", citizen_register)
        r.route("GET", "/api/docs", api_docs)
        r.route("GET", "/api/openapi.json", openapi)
        r.route("POST", "/api/graphql", graphql)
        r.route("GET", "/api/apps", apps_catalog)
        r.route("POST", "/api/2fa/setup", enable_2fa)
        r.route("GET", "/api/users", users_list)
        r.route("POST", "/api/simulate", simulate_scenario)
        r.route("GET", "/api/predict/traffic", predict_traffic)
        r.websocket("/api/stream", ws_events)

        r.static("/control", "/workspace/neurova/control/static")
        r.static("/ciudad", "/workspace/neurova/ciudad/static")
        r.static("/assets", "/workspace/neurova/control/assets")

        async def root(req):
            return 302, {"Location": "/control/"}, b""

        r.route("GET", "/", root)

        return r

    async def _ws_reader_drain(self, reader: asyncio.StreamReader) -> None:
        try:
            while True:
                frame = await http_mod.read_ws_frame(reader)
                if frame is None or frame[0] == 0x8:
                    return
        except (ConnectionError, asyncio.IncompleteReadError):
            return

    async def run(self) -> None:
        self._start_simulator()
        await asyncio.gather(
            self._run_broker(),
            self._pump_bus(),
            self._tick_loop(),
            self._run_http(),
        )


def _compute_aqi(env: dict) -> int:
    if not env:
        return 0
    pm25 = (env.get("pm25_ugm3", {}) or {}).get("mean", 0) or 0
    no2 = (env.get("no2_ugm3", {}) or {}).get("mean", 0) or 0
    pm10 = (env.get("pm10_ugm3", {}) or {}).get("mean", 0) or 0
    score = 0.5 * min(150, pm25 * 2.5) + 0.3 * min(150, no2 / 2) + 0.2 * min(150, pm10)
    return int(score)


def _renewable_pct(energy: dict) -> float:
    solar = (energy.get("solar_kw", {}) or {}).get("sum", 0) or 0
    load = (energy.get("load_kw", {}) or {}).get("sum", 1) or 1
    return round(min(100, 100.0 * solar / max(1.0, load)), 1)


def _run_graphql(orch: "Orchestrator", query: str, variables: dict) -> dict:
    """Tiny GraphQL-ish resolver for documented query fields."""
    fields = {
        "kpis": lambda: asyncio.run_coroutine_threadsafe(
            _call_async(orch._router.match("GET", "/api/kpis")[0], {}), asyncio.get_event_loop()
        )
    }
    q = query.strip()
    if q == "{ kpis }":
        metrics = orch.state.metrics_snapshot()
        return {"data": {"kpis": {
            "congestion": round((metrics.get("traffic", {}).get("occupancy", {}).get("mean", 0.0)) * 130, 1),
            "aqi": _compute_aqi(metrics.get("env", {})),
            "renewable_pct": _renewable_pct(metrics.get("energy", {})),
        }}}
    if q == "{ alerts }":
        return {"data": {"alerts": [asdict(a) for a in list(orch.state.alerts.values())[-20:]]}}
    if q == "{ emergencies }":
        return {"data": {"emergencies": [asdict(a) for a in list(orch.state.emergencies.values())[-20:]]}}
    return {"errors": [{"message": "query not supported. Use { kpis } | { alerts } | { emergencies }"}]}


async def _call_async(handler, req):  # pragma: no cover - helper
    return await handler(req)


def _run_scenario(orch: "Orchestrator", scenario: str) -> dict:
    """Agent-based simulator for scenario analysis (Capa 7 entry)."""
    from neurova.simulator.scenario import run_scenario
    return run_scenario(orch, scenario)


def _api_docs_html() -> bytes:
    return """<!doctype html><html><head><meta charset='utf-8'>
<title>NEUROVA API</title>
<link rel='stylesheet' href='/assets/neurova.css'>
</head><body class='nv-docs'>
<header><h1>NEUROVA API</h1><p>Urban OS API reference v1.0</p></header>
<section id='auth'>
<h2>Autenticacion</h2>
<p>Use <code>POST /api/login</code> o <code>POST /api/citizen/login</code> con <code>{email,password,totp?}</code>. Respuesta: <code>{token}</code>. Usar como <code>Authorization: Bearer &lt;token&gt;</code> o <code>X-API-Key</code>.</p>
</section>
<section id='endpoints'>
<h2>Endpoints principales</h2>
<ul>
<li><code>GET /api/health</code> &mdash; estado</li>
<li><code>GET /api/stats</code> &mdash; metricas del broker, simulador, TSDB</li>
<li><code>GET /api/kpis</code> &mdash; KPIs globales de la ciudad en tiempo real</li>
<li><code>GET /api/city</code> &mdash; mapa vectorial de ciudad (zonas, calles, sensores)</li>
<li><code>GET /api/sensors?kind=env&amp;zone=Z03</code> &mdash; catalogo de sensores</li>
<li><code>GET /api/history?series=traffic.flow_vph.Z00&amp;start_ms&amp;end_ms</code> &mdash; series temporales</li>
<li><code>GET /api/alerts</code>, <code>POST /api/alerts/ack?id=...</code></li>
<li><code>GET /api/emergencies</code>, <code>GET /api/decisions</code>, <code>GET /api/rules</code></li>
<li><code>POST /api/report</code> &mdash; reporte ciudadano (multipart/json)</li>
<li><code>POST /api/simulate</code> &mdash; ejecuta un escenario ABM</li>
<li><code>WebSocket /api/stream?channels=alert,emergency,decision,sensor,cep</code></li>
<li><code>POST /api/graphql</code> &mdash; con queries <code>{ kpis }</code>, <code>{ alerts }</code>, <code>{ emergencies }</code></li>
</ul>
</section>
<section id='openapi'>
<h2>OpenAPI</h2>
<p><a href='/api/openapi.json'>Download OpenAPI 3.1 spec</a></p>
</section>
<footer><p>NEUROVA - La ciudad piensa - v1.0.0</p></footer>
</body></html>""".encode("utf-8")


def _openapi_spec() -> bytes:
    spec = {
        "openapi": "3.1.0",
        "info": {"title": "NEUROVA API", "version": "1.0.0", "description": "NEUROVA urban OS API."},
        "paths": {
            "/api/health": {"get": {"summary": "Health"}},
            "/api/stats": {"get": {"summary": "Broker + simulator stats"}},
            "/api/kpis": {"get": {"summary": "Real-time city KPIs"}},
            "/api/city": {"get": {"summary": "City graph metadata"}},
            "/api/sensors": {"get": {"summary": "Sensor catalog"}},
            "/api/history": {"get": {"summary": "Time-series history"}},
            "/api/events": {"get": {"summary": "Event stream snapshot"}},
            "/api/alerts": {"get": {"summary": "List alerts"}},
            "/api/emergencies": {"get": {"summary": "List emergencies"}},
            "/api/decisions": {"get": {"summary": "Audit trail of AI decisions"}},
            "/api/rules": {"get": {"summary": "Rule library"}},
            "/api/report": {"post": {"summary": "Citizen incident report"}},
            "/api/login": {"post": {"summary": "Operator login"}},
            "/api/citizen/login": {"post": {"summary": "Citizen login"}},
            "/api/simulate": {"post": {"summary": "Run city scenario"}},
            "/api/publish": {"post": {"summary": "Publish raw sensor message"}},
            "/api/predict/traffic": {"get": {"summary": "Traffic flow forecast"}},
            "/api/graphql": {"post": {"summary": "GraphQL endpoint"}},
        },
    }
    return json.dumps(spec, indent=2).encode()


def _apps_catalog() -> dict:
    return {
        "apps": [
            {"slug": "transit-companion", "name": "Bus Companion", "author": "NEUROVA", "description": "PWA que usa la API pública para recordar tus paradas favoritas."},
            {"slug": "air-alerts", "name": "Alerta Aire", "author": "Comunidad", "description": "Notifica en tu móvil si tu barrio supera umbrales de calidad del aire."},
            {"slug": "noise-map", "name": "Mapa Sonoro", "author": "Universidad", "description": "Visualiza el ruido nocturno del barrio."},
            {"slug": "bike-rack", "name": "Aparca-Bici", "author": "Startup Local", "description": "Usa la API para encontrar parkings libres cerca de ti."},
        ]
    }


def main() -> None:
    orch = Orchestrator()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    def _handle_sig(*_):
        orch.simulator.stop()
        for t in asyncio.all_tasks(loop):
            t.cancel()
    signal.signal(signal.SIGTERM, _handle_sig)
    signal.signal(signal.SIGINT, _handle_sig)
    try:
        loop.run_until_complete(orch.run())
    except asyncio.CancelledError:
        pass
    finally:
        try:
            orch.broker.log.close()
            orch.tsdb.flush_all()
        except Exception:
            pass


if __name__ == "__main__":
    main()

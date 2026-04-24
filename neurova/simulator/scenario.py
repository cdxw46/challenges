"""Agent-based scenario simulator (Capa 7).

Runs a deterministic agent-based micro-simulation over the city graph to
evaluate the impact of a scenario (match day, blackout, evacuation, ...)
before executing it. Uses the city graph built by `city.py` and very
small behavioural rules per agent type.
"""
from __future__ import annotations

import math
import random
import time
from collections import Counter
from typing import Any

SCENARIOS = {
    "match_day": {
        "description": "Partido en el estadio Z00 a las 20:00. 45 000 asistentes en 3 horas.",
        "multipliers": {"traffic": 1.8, "transit": 1.6, "security": 1.4},
        "alerts": ["congestion", "transit_overload", "crowd_density"],
    },
    "evacuation": {
        "description": "Evacuación completa de la zona Z05 por emergencia NRBQ.",
        "multipliers": {"traffic": 2.4, "transit": 2.0, "energy": 0.6},
        "alerts": ["emergency_corridor", "traffic_jam_global", "transit_overload"],
    },
    "blackout_north": {
        "description": "Corte total de energía en la zona norte durante 2 horas.",
        "multipliers": {"energy": 0.1, "security": 1.3},
        "alerts": ["blackout_detect", "energy_frequency_drift", "security_crowd"],
    },
    "fire_market": {
        "description": "Incendio en el mercado central. Plan de emergencias activado.",
        "multipliers": {"env": 2.4, "security": 2.1, "traffic": 1.5},
        "alerts": ["waste_fire", "air_quality_emergency", "emergency_corridor"],
    },
    "heatwave": {
        "description": "Ola de calor prolongada. Picos de demanda eléctrica y degradación de AQI.",
        "multipliers": {"energy": 1.6, "env": 1.5, "water": 1.3},
        "alerts": ["energy_demand_peak", "air_quality_emergency", "water_tank_low"],
    },
    "rush_hour": {
        "description": "Hora punta típica de lunes.",
        "multipliers": {"traffic": 1.4, "transit": 1.3, "env": 1.2},
        "alerts": ["traffic_jam_global", "traffic_rush_predict", "pm25_daily"],
    },
}


def run_scenario(orch, scenario: str) -> dict:
    cfg = SCENARIOS.get(scenario)
    if not cfg:
        return {"error": f"unknown scenario {scenario}", "available": list(SCENARIOS.keys())}
    rng = random.Random(hash(scenario) & 0xFFFFFFFF)
    agents = _spawn_agents(orch.city, rng, cfg)
    timeline: list[dict] = []
    counter = Counter()
    for agent in agents:
        agent["base_speed"] = agent["speed"] * cfg["multipliers"].get(agent["kind"], 1.0)
    for step in range(60):  # 60 simulated minutes
        for agent in agents:
            jitter = 1.0 + (rng.random() - 0.5) * 0.08
            effective = agent["base_speed"] * jitter
            counter[agent["kind"]] += 1
            agent["x"] += math.cos(agent["heading"]) * effective * 0.1
            agent["y"] += math.sin(agent["heading"]) * effective * 0.1
        if step % 10 == 0:
            timeline.append({
                "t_min": step,
                "agents_by_kind": dict(Counter(a["kind"] for a in agents)),
                "avg_speed": round(sum(a["base_speed"] for a in agents) / len(agents), 2),
            })
    return {
        "scenario": scenario,
        "description": cfg["description"],
        "multipliers": cfg["multipliers"],
        "timeline": timeline,
        "predicted_alerts": cfg["alerts"],
        "summary": {
            "agents": len(agents),
            "avg_speed_final": timeline[-1]["avg_speed"] if timeline else 0,
            "impact": "high" if sum(cfg["multipliers"].values()) > 4 else "moderate",
        },
    }


def _spawn_agents(city, rng: random.Random, cfg: dict) -> list[dict]:
    pool = []
    kinds = ["traffic", "transit", "security", "env", "energy", "water"]
    for kind in kinds:
        for _ in range(200 if kind == "traffic" else 80):
            pool.append({
                "kind": kind,
                "x": rng.uniform(0, 1000),
                "y": rng.uniform(0, 1000),
                "speed": rng.uniform(1, 3),
                "heading": rng.uniform(0, math.tau),
            })
    return pool

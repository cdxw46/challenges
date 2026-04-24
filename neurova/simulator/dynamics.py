"""Realistic sample generators per sensor kind.

Patterns encoded:
 * Daily rhythm (rush hours 07-09 & 17-20 on weekdays)
 * Weekly rhythm (weekends: ~65% of weekday traffic, shifted peaks)
 * Seasonal rhythm (temperature / humidity slow oscillation)
 * Weather events (random rain windows modulating traffic + air quality)
 * Random incidents (accidents, broken bins, leaks) with realistic
   probabilities that trigger downstream rules later.

All distributions are simple enough to run for thousands of sensors at
once without external math libraries.
"""
from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass
from typing import Iterable

from .city import Sensor


def _rush_factor(now: float) -> float:
    lt = time.localtime(now)
    minutes = lt.tm_hour * 60 + lt.tm_min
    weekend = lt.tm_wday >= 5
    morning = math.exp(-((minutes - 8 * 60) ** 2) / (2 * 45 ** 2))
    evening = math.exp(-((minutes - 18.5 * 60) ** 2) / (2 * 55 ** 2))
    midday = math.exp(-((minutes - 13 * 60) ** 2) / (2 * 90 ** 2))
    base = 0.3 + 0.25 * midday + 0.7 * (morning + evening)
    if weekend:
        base *= 0.55
        base += 0.15 * math.exp(-((minutes - 13 * 60) ** 2) / (2 * 180 ** 2))
    return max(0.15, min(1.2, base))


def _temp_profile(now: float) -> float:
    lt = time.localtime(now)
    minutes = lt.tm_hour * 60 + lt.tm_min
    day_of_year = lt.tm_yday
    seasonal = 18 + 8 * math.sin(2 * math.pi * (day_of_year - 81) / 365)
    daily = 4 * math.sin(2 * math.pi * (minutes - 6 * 60) / 1440)
    return seasonal + daily


def _weather(now: float, rng: random.Random) -> dict:
    slot = int(now // 900)  # 15-min buckets for weather stability
    local_rng = random.Random(slot)
    rain = 1 if local_rng.random() < 0.08 else 0
    humidity = 0.45 + 0.3 * rain + local_rng.uniform(-0.1, 0.1)
    return {"rain": rain, "humidity": round(max(0.1, min(1.0, humidity)), 2)}


@dataclass
class SampleContext:
    now: float
    rng: random.Random


def traffic_sample(s: Sensor, ctx: SampleContext) -> dict:
    base = _rush_factor(ctx.now)
    zone_mod = 1.1 if s.zone in ("Z00", "Z04") else 0.9
    noise = ctx.rng.gauss(0, 0.08)
    flow = max(0, int(300 * base * zone_mod * (1 + noise)))
    speed_nominal = 50 if s.props.get("lanes", 2) > 1 else 30
    speed = max(3, speed_nominal * (1.1 - 0.6 * base) + ctx.rng.gauss(0, 2))
    plates = [f"{chr(65+ctx.rng.randint(0,25))}{chr(65+ctx.rng.randint(0,25))}{ctx.rng.randint(100,999)}" for _ in range(min(4, flow // 25))]
    return {
        "flow_vph": flow,
        "speed_kmh": round(speed, 1),
        "occupancy": round(min(0.95, 0.1 + 0.85 * base + ctx.rng.uniform(-0.05, 0.05)), 3),
        "plates_ocr": plates,
    }


def env_sample(s: Sensor, ctx: SampleContext) -> dict:
    temp = _temp_profile(ctx.now) + ctx.rng.gauss(0, 0.5)
    w = _weather(ctx.now, ctx.rng)
    traffic_bias = _rush_factor(ctx.now)
    no2 = 20 + 80 * traffic_bias + ctx.rng.gauss(0, 6) - 20 * w["rain"]
    co2 = 410 + 180 * traffic_bias + ctx.rng.gauss(0, 18)
    pm25 = max(2, 8 + 35 * traffic_bias + ctx.rng.gauss(0, 4) - 4 * w["rain"])
    pm10 = pm25 * 1.6 + ctx.rng.gauss(0, 3)
    so2 = max(0.5, 5 + 15 * traffic_bias + ctx.rng.gauss(0, 1.5))
    noise = 45 + 25 * traffic_bias + ctx.rng.gauss(0, 2)
    return {
        "temp_c": round(temp, 2),
        "humidity": w["humidity"],
        "pressure_hpa": round(1013 + ctx.rng.gauss(0, 2), 1),
        "co2_ppm": round(co2, 1),
        "no2_ugm3": round(max(5, no2), 1),
        "so2_ugm3": round(so2, 2),
        "pm25_ugm3": round(pm25, 1),
        "pm10_ugm3": round(pm10, 1),
        "noise_db": round(noise, 1),
        "rain": w["rain"],
    }


def energy_sample(s: Sensor, ctx: SampleContext) -> dict:
    lt = time.localtime(ctx.now)
    minutes = lt.tm_hour * 60 + lt.tm_min
    base_load_kw = s.props.get("rated_kw", 100) * (0.3 + 0.5 * (1 if 7 <= lt.tm_hour <= 23 else 0))
    cooling = 0.15 * max(0, _temp_profile(ctx.now) - 22)
    heating = 0.12 * max(0, 14 - _temp_profile(ctx.now))
    load = base_load_kw * (1 + cooling + heating) + ctx.rng.gauss(0, 3)
    solar = max(0, math.sin((minutes - 420) / 720 * math.pi)) * base_load_kw * 0.6
    battery = max(0, min(100, 45 + 30 * math.sin(ctx.now / 3600) + ctx.rng.gauss(0, 5)))
    return {
        "load_kw": round(load, 2),
        "solar_kw": round(solar, 2),
        "battery_pct": round(battery, 1),
        "voltage_v": round(230 + ctx.rng.gauss(0, 2), 2),
        "frequency_hz": round(50 + ctx.rng.gauss(0, 0.02), 3),
    }


def water_sample(s: Sensor, ctx: SampleContext) -> dict:
    pressure = 5.2 + ctx.rng.gauss(0, 0.15)
    if ctx.rng.random() < 0.002:
        pressure -= ctx.rng.uniform(1.5, 2.5)
    flow = max(0, 30 + 15 * _rush_factor(ctx.now) + ctx.rng.gauss(0, 2))
    return {
        "pressure_bar": round(pressure, 2),
        "flow_lps": round(flow, 2),
        "ph": round(7.2 + ctx.rng.gauss(0, 0.1), 2),
        "turbidity_ntu": round(max(0, 0.3 + ctx.rng.gauss(0, 0.1)), 2),
        "cloro_mgl": round(max(0, 0.6 + ctx.rng.gauss(0, 0.05)), 2),
        "tank_level": round(max(5, min(98, 60 + 20 * math.sin(ctx.now / 10800) + ctx.rng.gauss(0, 2))), 1),
    }


def waste_sample(s: Sensor, ctx: SampleContext) -> dict:
    phase = (ctx.now / 86400) % 1
    fill = min(100, max(0, 100 * phase + ctx.rng.gauss(0, 4)))
    return {
        "fill_pct": round(fill, 1),
        "internal_temp_c": round(_temp_profile(ctx.now) + ctx.rng.gauss(0, 0.8), 1),
        "opened_count": ctx.rng.randint(0, 5),
    }


def transit_sample(s: Sensor, ctx: SampleContext) -> dict:
    occupancy = min(1.0, max(0.1, 0.35 + 0.55 * _rush_factor(ctx.now) + ctx.rng.gauss(0, 0.05)))
    return {
        "occupancy": round(occupancy, 2),
        "doors_open": ctx.rng.random() < 0.05,
        "temp_interior_c": round(22 + ctx.rng.gauss(0, 1.2), 1),
        "speed_kmh": round(max(0, 18 + ctx.rng.gauss(0, 4) - 12 * _rush_factor(ctx.now)), 1),
    }


def infra_sample(s: Sensor, ctx: SampleContext) -> dict:
    vibration = max(0, 0.12 + ctx.rng.gauss(0, 0.02))
    if ctx.rng.random() < 0.0005:
        vibration += ctx.rng.uniform(0.2, 0.5)
    flood = 0
    if ctx.rng.random() < 0.001:
        flood = ctx.rng.uniform(5, 20)
    return {
        "vibration_g": round(vibration, 4),
        "flood_cm": round(flood, 1),
        "status": "nominal" if flood == 0 and vibration < 0.2 else "alert",
    }


def security_sample(s: Sensor, ctx: SampleContext) -> dict:
    density = max(0, 0.15 + 0.6 * _rush_factor(ctx.now) + ctx.rng.gauss(0, 0.03))
    gunshot = ctx.rng.random() < 0.00002
    smoke = ctx.rng.random() < 0.0001
    return {
        "people_density": round(density, 3),
        "motion_events": ctx.rng.randint(0, 8),
        "gunshot_detected": gunshot,
        "smoke_detected": smoke,
    }


DISPATCH = {
    "traffic": traffic_sample,
    "env": env_sample,
    "energy": energy_sample,
    "water": water_sample,
    "waste": waste_sample,
    "transit": transit_sample,
    "infra": infra_sample,
    "security": security_sample,
}

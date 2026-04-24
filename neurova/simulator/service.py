"""Simulator as a dedicated process. Publishes MQTT to the broker port.

Running the simulator as a subprocess (or separate daemon) keeps the
orchestrator's event loop free to serve HTTP, WebSocket and AI tick
work without being starved by the heavy sensor generation.
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import struct
import sys
import time
from typing import Iterable

from neurova.broker import mqtt
from neurova.core.logger import get_logger
from neurova.simulator import city as city_mod
from neurova.simulator import dynamics
from neurova.simulator.run import topic_for

LOGGER = get_logger("sim-service")


async def run(mqtt_host: str, mqtt_port: int, hz: float, seed: str) -> None:
    city = city_mod.build_city(seed)
    sensors = list(city.sensors.values())
    LOGGER.info("simulator-service starting", sensors=len(sensors), hz=hz, mqtt=f"{mqtt_host}:{mqtt_port}")
    reader = writer = None
    period = 1.0 / hz
    async def connect() -> tuple[asyncio.StreamReader, asyncio.StreamWriter]:
        r, w = await asyncio.open_connection(mqtt_host, mqtt_port)
        payload = mqtt._encode_str("MQTT") + bytes([4, 0x02, 0, 60]) + mqtt._encode_str(f"neurova-sim")
        w.write(mqtt.encode_packet(mqtt.CONNECT, 0, payload))
        await w.drain()
        await mqtt.read_packet(r)
        return r, w
    while True:
        try:
            reader, writer = await connect()
            break
        except ConnectionError:
            LOGGER.warn("broker not up yet, retrying")
            await asyncio.sleep(1.0)
    try:
        chunk = 600
        while True:
            tick_start = time.time()
            ctx = dynamics.SampleContext(now=tick_start, rng=__import__("random").Random(1337 + int(tick_start)))
            for i in range(0, len(sensors), chunk):
                for s in sensors[i : i + chunk]:
                    func = dynamics.DISPATCH.get(s.kind)
                    if not func:
                        continue
                    sample = func(s, ctx)
                    sample.update({"sensor_id": s.id, "lat": s.lat, "lon": s.lon, "zone": s.zone})
                    topic = topic_for(s.kind, s.zone, s.id)
                    body = json.dumps(sample, separators=(",", ":")).encode("utf-8")
                    payload = mqtt._encode_str(topic) + body
                    writer.write(mqtt.encode_packet(mqtt.PUBLISH, 0, payload))
                await writer.drain()
            elapsed = time.time() - tick_start
            sleep_for = max(0.1, period - elapsed)
            LOGGER.info("sim tick", sent=len(sensors), elapsed=round(elapsed,2), sleep=round(sleep_for,2))
            await asyncio.sleep(sleep_for)
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


def main() -> None:
    mqtt_host = os.environ.get("NEUROVA_MQTT_HOST", "127.0.0.1")
    mqtt_port = int(os.environ.get("NEUROVA_MQTT_PORT", "18830"))
    hz = float(os.environ.get("NEUROVA_SIM_HZ", "0.2"))
    seed = os.environ.get("NEUROVA_SEED", "neurova")
    asyncio.run(run(mqtt_host, mqtt_port, hz, seed))


if __name__ == "__main__":
    main()

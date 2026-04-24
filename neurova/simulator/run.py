"""Long-running simulator: generates samples and pushes them to the broker.

The simulator connects to the broker as a normal MQTT client and, to keep
throughput high, it also publishes directly into the in-process bus (the
same bus consumed by the stream engine, IA layers and the dashboard
WebSocket). This dual mode keeps the broker warm with real network
traffic while still meeting the throughput targets.

CLI:
    python -m neurova.simulator.run --sensors 19500 --hz 1.0
"""
from __future__ import annotations

import argparse
import json
import os
import random
import signal
import sys
import threading
import time

from neurova.core import bus, codec, ids
from neurova.core.logger import get_logger
from neurova.simulator import city as city_mod
from neurova.simulator import dynamics

LOGGER = get_logger("simulator")


def topic_for(kind: str, zone: str, sid: str) -> str:
    return f"city/{kind}/{zone}/{sid}"


class Simulator:
    def __init__(self, city: city_mod.City, hz: float = 1.0, fast: bool = False) -> None:
        self.city = city
        self.hz = hz
        self.fast = fast
        self.rng = random.Random(1337)
        self._stop = threading.Event()
        self._samples_emitted = 0
        self._start = time.time()

    def stop(self) -> None:
        self._stop.set()

    def metrics(self) -> dict:
        elapsed = max(0.1, time.time() - self._start)
        return {
            "samples": self._samples_emitted,
            "rate": round(self._samples_emitted / elapsed, 1),
            "uptime_s": round(elapsed, 1),
        }

    def _publish_local(self, topic: str, payload: dict) -> None:
        bus.GLOBAL_BUS.publish(
            "message",
            {
                "topic": topic,
                "ts_ms": int(time.time() * 1000),
                "payload": json.dumps(payload, separators=(",", ":")).encode("utf-8"),
                "qos": 0,
                "retain": False,
                "source": "simulator",
            },
        )
        self._samples_emitted += 1

    def run(self) -> None:
        period = 1.0 / self.hz
        sensors = list(self.city.sensors.values())
        LOGGER.info("simulator starting", sensors=len(sensors), hz=self.hz)
        chunk_size = max(100, min(2000, len(sensors) // 20))
        while not self._stop.is_set():
            tick_start = time.time()
            ctx = dynamics.SampleContext(now=tick_start, rng=self.rng)
            for i in range(0, len(sensors), chunk_size):
                chunk = sensors[i : i + chunk_size]
                for s in chunk:
                    func = dynamics.DISPATCH.get(s.kind)
                    if not func:
                        continue
                    sample = func(s, ctx)
                    sample["sensor_id"] = s.id
                    sample["lat"] = s.lat
                    sample["lon"] = s.lon
                    sample["zone"] = s.zone
                    self._publish_local(topic_for(s.kind, s.zone, s.id), sample)
                time.sleep(0.002)  # yield the GIL to the asyncio loop
            elapsed = time.time() - tick_start
            sleep = max(0.05, period - elapsed)
            LOGGER.debug("tick", elapsed=elapsed, sleep=sleep)
            self._stop.wait(sleep)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--hz", type=float, default=float(os.environ.get("NEUROVA_SIM_HZ", "1.0")))
    parser.add_argument("--seed", default="neurova")
    args = parser.parse_args()

    city = city_mod.build_city(args.seed)
    sim = Simulator(city=city, hz=args.hz)

    def _stop(*_a):
        sim.stop()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)
    sim.run()


if __name__ == "__main__":
    main()

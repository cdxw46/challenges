"""Broker throughput benchmark: uses real MQTT clients for realism.

The test spins up the broker in-process, creates 10 MQTT subscribers
listening on city/# and then 20 publisher clients that push QoS0
messages as fast as possible for 5 seconds. Measured end-to-end (publish
-> broker -> subscriber receive -> bytes counted).
"""
from __future__ import annotations

import asyncio
import json
import os
import struct
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from neurova.broker import mqtt
from neurova.broker.server import Broker


async def subscriber(port: int, filt: str, counter: dict, done: asyncio.Event) -> None:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    payload = mqtt._encode_str("MQTT") + bytes([4, 0x02, 0, 60]) + mqtt._encode_str(f"sub-{counter['id']}")
    counter["id"] += 1
    writer.write(mqtt.encode_packet(mqtt.CONNECT, 0, payload))
    await writer.drain()
    await mqtt.read_packet(reader)
    sub_payload = struct.pack(">H", 1) + mqtt._encode_str(filt) + bytes([0])
    writer.write(mqtt.encode_packet(mqtt.SUBSCRIBE, 2, sub_payload))
    await writer.drain()
    await mqtt.read_packet(reader)
    local = 0
    while not done.is_set():
        try:
            pkt = await asyncio.wait_for(mqtt.read_packet(reader), timeout=2.0)
        except asyncio.TimeoutError:
            continue
        if pkt is None:
            break
        local += 1
    counter["received"] += local
    writer.close()
    try:
        await writer.wait_closed()
    except Exception:
        pass


async def publisher(port: int, pub_id: int, counter: dict, done: asyncio.Event) -> None:
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    payload = mqtt._encode_str("MQTT") + bytes([4, 0x02, 0, 60]) + mqtt._encode_str(f"pub-{pub_id}")
    writer.write(mqtt.encode_packet(mqtt.CONNECT, 0, payload))
    await writer.drain()
    await mqtt.read_packet(reader)
    msg = json.dumps({"v": 1, "sensor": pub_id, "t": time.time()}).encode()
    while not done.is_set():
        pub_payload = mqtt._encode_str(f"city/bench/pub{pub_id}") + msg
        writer.write(mqtt.encode_packet(mqtt.PUBLISH, 0, pub_payload))
        try:
            await writer.drain()
        except (ConnectionError, asyncio.CancelledError):
            break
        counter["sent"] += 1
        if counter["sent"] % 50 == 0:
            await asyncio.sleep(0)  # yield to event loop
    writer.close()
    try:
        await writer.wait_closed()
    except Exception:
        pass


async def bench(duration: float = 5.0, subs: int = 10, pubs: int = 20) -> dict:
    broker = Broker("/tmp/nv-bench")
    server = await asyncio.start_server(broker.handle_mqtt, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    counter = {"sent": 0, "received": 0, "id": 0}
    done = asyncio.Event()

    async def run():
        tasks = [asyncio.create_task(subscriber(port, "city/#", counter, done)) for _ in range(subs)]
        await asyncio.sleep(0.2)
        tasks += [asyncio.create_task(publisher(port, i, counter, done)) for i in range(pubs)]
        await asyncio.sleep(duration)
        done.set()
        await asyncio.gather(*tasks, return_exceptions=True)

    start = time.time()
    async with server:
        try:
            await run()
        finally:
            server.close()
            await server.wait_closed()
            broker.log.close()
    elapsed = time.time() - start
    return {
        "duration_s": round(elapsed, 2),
        "publishers": pubs,
        "subscribers": subs,
        "sent": counter["sent"],
        "received": counter["received"],
        "rate_sent": round(counter["sent"] / elapsed, 1),
        "rate_delivered": round(counter["received"] / elapsed, 1),
    }


def main():
    result = asyncio.run(bench())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

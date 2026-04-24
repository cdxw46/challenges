"""NEUROVA broker: MQTT + HTTP ingest + WebSocket + append-only log.

This is the heart of Capa 1. A single asyncio event loop runs four
listeners simultaneously and routes every message to:
 * the durable append-only log (partitioned per topic),
 * all matching MQTT subscribers,
 * every WebSocket observer,
 * the in-process bus so other Python components (stream engine, IA,
   rule engine, dashboards) receive messages without a network hop.

We expose an HTTP control plane (stats, health, publish via REST) and an
HTTP/2 ingest endpoint for legacy/lightweight sensors. The broker is
self-contained: no external libraries are used for MQTT, WebSocket
framing, JSON, or binary encoding.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import os
import struct
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from neurova.broker import amqp, log as _log, mqtt
from neurova.core import bus, codec, ids
from neurova.core.logger import get_logger

LOGGER = get_logger("broker")
WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


@dataclass
class BrokerMetrics:
    messages_in: int = 0
    messages_out: int = 0
    bytes_in: int = 0
    bytes_out: int = 0
    mqtt_clients: int = 0
    ws_clients: int = 0
    amqp_clients: int = 0
    started_at: float = field(default_factory=time.time)
    last_rate_ts: float = field(default_factory=time.time)
    last_rate_msgs: int = 0

    def snapshot(self) -> dict:
        now = time.time()
        dt = max(0.1, now - self.last_rate_ts)
        rate = (self.messages_in - self.last_rate_msgs) / dt
        self.last_rate_ts = now
        self.last_rate_msgs = self.messages_in
        uptime = now - self.started_at
        return {
            "messages_in": self.messages_in,
            "messages_out": self.messages_out,
            "bytes_in": self.bytes_in,
            "bytes_out": self.bytes_out,
            "mqtt_clients": self.mqtt_clients,
            "ws_clients": self.ws_clients,
            "amqp_clients": self.amqp_clients,
            "rate_in": round(rate, 2),
            "uptime_s": round(uptime, 2),
        }


class TopicTree:
    """Subscription dispatcher with + / # wildcards."""

    def __init__(self) -> None:
        self.subs: dict[str, set[tuple[str, int]]] = defaultdict(set)

    def add(self, filt: str, client_id: str, qos: int) -> None:
        self.subs[filt].add((client_id, qos))

    def remove(self, filt: str, client_id: str) -> None:
        entries = self.subs.get(filt)
        if entries:
            self.subs[filt] = {(c, q) for c, q in entries if c != client_id}

    def drop_client(self, client_id: str) -> None:
        for filt in list(self.subs.keys()):
            self.subs[filt] = {(c, q) for c, q in self.subs[filt] if c != client_id}

    def matches(self, topic: str) -> list[tuple[str, str, int]]:
        out = []
        for filt, entries in self.subs.items():
            if mqtt.topic_matches(filt, topic):
                for cid, qos in entries:
                    out.append((filt, cid, qos))
        return out


class Broker:
    def __init__(self, root: str) -> None:
        self.log = _log.LogStore(os.path.join(root, "log"))
        self.metrics = BrokerMetrics()
        self.mqtt_clients: dict[str, mqtt.ClientSession] = {}
        self.ws_clients: dict[str, tuple[asyncio.StreamWriter, list[str]]] = {}
        self.subs = TopicTree()
        self._lock = asyncio.Lock()
        self._pending_qos2: dict[tuple[str, int], bytes] = {}

    async def publish(self, topic: str, payload: bytes, qos: int = 0, retain: bool = False, source: str = "broker") -> None:
        self.log.topic(topic).append(source.encode(), payload)
        self.metrics.messages_in += 1
        self.metrics.bytes_in += len(payload)
        bus.GLOBAL_BUS.publish(
            "message",
            {"topic": topic, "payload": payload, "qos": qos, "retain": retain, "source": source, "ts_ms": int(time.time() * 1000)},
        )
        for _filt, cid, sub_qos in self.subs.matches(topic):
            sess = self.mqtt_clients.get(cid)
            if not sess:
                continue
            effective_qos = min(qos, sub_qos)
            pid = sess.next_pid() if effective_qos > 0 else None
            pkt = mqtt.build_publish(topic, payload, qos=effective_qos, pid=pid, retain=retain)
            try:
                sess.writer.write(pkt)
                await sess.writer.drain()
                self.metrics.messages_out += 1
                self.metrics.bytes_out += len(pkt)
            except (ConnectionError, asyncio.CancelledError):
                pass
        for cid, (writer, filters) in list(self.ws_clients.items()):
            if any(mqtt.topic_matches(f, topic) for f in filters):
                try:
                    msg = json.dumps({
                        "topic": topic,
                        "ts_ms": int(time.time() * 1000),
                        "payload": _decode_payload(payload),
                    })
                    frame = _encode_ws_frame(msg.encode("utf-8"))
                    writer.write(frame)
                    await writer.drain()
                    self.metrics.messages_out += 1
                    self.metrics.bytes_out += len(frame)
                except (ConnectionError, asyncio.CancelledError):
                    pass

    async def handle_mqtt(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        self.metrics.mqtt_clients += 1
        client_id = f"anon-{ids.short_id(6)}"
        try:
            pkt = await mqtt.read_packet(reader)
            if not pkt or pkt[0] != mqtt.CONNECT:
                return
            conn = mqtt.parse_connect(pkt[2])
            client_id = conn["client_id"] or client_id
            session = mqtt.ClientSession(client_id=client_id, writer=writer, keepalive=conn.get("keepalive", 60))
            self.mqtt_clients[client_id] = session
            writer.write(mqtt.build_connack(False, 0))
            await writer.drain()
            LOGGER.info("mqtt connect", client_id=client_id, peer=peer)
            while True:
                pkt = await mqtt.read_packet(reader)
                if pkt is None:
                    break
                ptype, flags, payload = pkt
                session.last_seen = time.time()
                if ptype == mqtt.PUBLISH:
                    info = mqtt.parse_publish(payload, flags)
                    await self.publish(info["topic"], info["payload"], qos=info["qos"], retain=info["retain"], source=client_id)
                    if info["qos"] == 1 and info["pid"]:
                        writer.write(mqtt.build_puback(info["pid"]))
                        await writer.drain()
                    elif info["qos"] == 2 and info["pid"]:
                        self._pending_qos2[(client_id, info["pid"])] = info["payload"]
                        writer.write(mqtt.build_pubrec(info["pid"]))
                        await writer.drain()
                elif ptype == mqtt.PUBREL:
                    pid = struct.unpack(">H", payload)[0]
                    self._pending_qos2.pop((client_id, pid), None)
                    writer.write(mqtt.build_pubcomp(pid))
                    await writer.drain()
                elif ptype == mqtt.PUBACK:
                    pass
                elif ptype == mqtt.SUBSCRIBE:
                    info = mqtt.parse_subscribe(payload)
                    qos_list = []
                    for filt, q in info["filters"]:
                        self.subs.add(filt, client_id, q)
                        session.subscriptions[filt] = q
                        qos_list.append(min(2, q))
                    writer.write(mqtt.build_suback(info["pid"], qos_list))
                    await writer.drain()
                    LOGGER.info("mqtt subscribe", client_id=client_id, filters=[f for f, _ in info["filters"]])
                elif ptype == mqtt.UNSUBSCRIBE:
                    pid = struct.unpack(">H", payload[:2])[0]
                    pos = 2
                    while pos < len(payload):
                        flen = struct.unpack(">H", payload[pos : pos + 2])[0]
                        pos += 2
                        filt = payload[pos : pos + flen].decode("utf-8")
                        pos += flen
                        self.subs.remove(filt, client_id)
                        session.subscriptions.pop(filt, None)
                    writer.write(mqtt.encode_packet(mqtt.UNSUBACK, 0, struct.pack(">H", pid)))
                    await writer.drain()
                elif ptype == mqtt.PINGREQ:
                    writer.write(mqtt.build_pingresp())
                    await writer.drain()
                elif ptype == mqtt.DISCONNECT:
                    break
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.error("mqtt error", err=str(exc), client_id=client_id)
        finally:
            self.subs.drop_client(client_id)
            self.mqtt_clients.pop(client_id, None)
            self.metrics.mqtt_clients = len(self.mqtt_clients)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def handle_ws(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """HTTP server that speaks REST + WebSocket + HTTP/2-style ingest on the same port."""
        try:
            req_line = await reader.readline()
            if not req_line:
                return
            method, path, _ = req_line.decode("utf-8", "replace").strip().split(" ", 2)
            headers = {}
            while True:
                line = await reader.readline()
                if not line or line == b"\r\n":
                    break
                k, _, v = line.decode("utf-8", "replace").strip().partition(":")
                headers[k.strip().lower()] = v.strip()
            if headers.get("upgrade", "").lower() == "websocket":
                await self._websocket_handshake(reader, writer, headers, path)
                return
            body = b""
            if "content-length" in headers:
                body = await reader.readexactly(int(headers["content-length"]))
            await self._handle_http(method, path, headers, body, writer)
        except (ConnectionError, asyncio.IncompleteReadError, ValueError):
            pass
        except Exception as exc:  # pragma: no cover - defensive
            LOGGER.error("http error", err=str(exc))
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _handle_http(self, method: str, path: str, headers: dict, body: bytes, writer: asyncio.StreamWriter) -> None:
        if path == "/health":
            return _http_json(writer, 200, {"status": "ok", "uptime_s": round(time.time() - self.metrics.started_at, 2)})
        if path == "/stats":
            return _http_json(writer, 200, self.metrics.snapshot())
        if path == "/topics":
            return _http_json(writer, 200, {"topics": self.log.topics()})
        if path.startswith("/publish") and method == "POST":
            try:
                payload = json.loads(body)
                topic = payload["topic"]
                data = payload["payload"]
                raw = data.encode("utf-8") if isinstance(data, str) else json.dumps(data).encode("utf-8")
                await self.publish(topic, raw, qos=payload.get("qos", 0), source="rest")
                return _http_json(writer, 202, {"accepted": True})
            except Exception as exc:
                return _http_json(writer, 400, {"error": str(exc)})
        if path.startswith("/replay") and method == "GET":
            qs = path.split("?", 1)[1] if "?" in path else ""
            params = dict(kv.split("=") for kv in qs.split("&") if "=" in kv)
            topic = params.get("topic")
            start = int(params.get("offset", 0))
            limit = int(params.get("limit", 100))
            if not topic:
                return _http_json(writer, 400, {"error": "topic required"})
            records = self.log.topic(topic).read(start, limit)
            return _http_json(
                writer,
                200,
                {
                    "topic": topic,
                    "records": [
                        {"offset": r.offset, "ts_ms": r.ts_ms, "key": r.key.decode("utf-8", "replace"), "value": _decode_payload(r.value)}
                        for r in records
                    ],
                },
            )
        _http_json(writer, 404, {"error": "not found", "path": path})

    async def _websocket_handshake(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, headers: dict, path: str) -> None:
        key = headers.get("sec-websocket-key", "")
        accept = base64.b64encode(hashlib.sha1((key + WS_GUID.decode()).encode()).digest()).decode()
        writer.write(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
        )
        await writer.drain()
        qs = path.split("?", 1)[1] if "?" in path else ""
        params = dict(kv.split("=") for kv in qs.split("&") if "=" in kv)
        topic_filters = params.get("topics", "#").split(",")
        cid = f"ws-{ids.short_id(6)}"
        self.ws_clients[cid] = (writer, topic_filters)
        self.metrics.ws_clients = len(self.ws_clients)
        LOGGER.info("ws connect", cid=cid, filters=topic_filters)
        try:
            while True:
                frame = await _read_ws_frame(reader)
                if frame is None:
                    break
                op, payload = frame
                if op == 0x8:
                    break
                if op == 0x1:
                    try:
                        msg = json.loads(payload.decode("utf-8"))
                        if "publish" in msg:
                            p = msg["publish"]
                            raw = p["payload"]
                            raw_bytes = raw.encode("utf-8") if isinstance(raw, str) else json.dumps(raw).encode("utf-8")
                            await self.publish(p["topic"], raw_bytes, source=cid)
                        elif "subscribe" in msg:
                            self.ws_clients[cid] = (writer, msg["subscribe"])
                    except Exception:
                        pass
        finally:
            self.ws_clients.pop(cid, None)
            self.metrics.ws_clients = len(self.ws_clients)

    async def handle_amqp(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            header = await reader.readexactly(8)
            if header != amqp.PROTOCOL_HEADER:
                writer.write(amqp.PROTOCOL_HEADER)
                await writer.drain()
                return
            writer.write(amqp.build_connection_start())
            await writer.drain()
            frame = await amqp.read_frame(reader)
            if frame is None:
                return
            writer.write(amqp.build_connection_tune())
            await writer.drain()
            frame = await amqp.read_frame(reader)
            await amqp.read_frame(reader)  # connection.tune-ok
            writer.write(amqp.build_connection_open_ok())
            await writer.drain()
            self.metrics.amqp_clients += 1
            while True:
                frame = await amqp.read_frame(reader)
                if frame is None:
                    break
                ftype, channel, payload = frame
                if ftype == amqp.FRAME_METHOD:
                    class_id = struct.unpack_from(">H", payload, 0)[0]
                    method_id = struct.unpack_from(">H", payload, 2)[0]
                    if class_id == 20 and method_id == 10:
                        writer.write(amqp.build_channel_open_ok())
                    elif class_id == 50 and method_id == 10:
                        pos = 4 + 2
                        qname_len = payload[pos]
                        qname = payload[pos + 1 : pos + 1 + qname_len].decode("utf-8")
                        writer.write(amqp.build_queue_declare_ok(qname))
                    elif class_id == 60 and method_id == 40:
                        exchange, routing = amqp.parse_basic_publish(payload)
                        header_frame = await amqp.read_frame(reader)
                        body_frame = await amqp.read_frame(reader)
                        await self.publish(routing or exchange, body_frame[2], source="amqp")
                    elif class_id == 10 and method_id == 50:
                        break
                    await writer.drain()
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        except Exception as exc:
            LOGGER.error("amqp error", err=str(exc))
        finally:
            self.metrics.amqp_clients = max(0, self.metrics.amqp_clients - 1)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def run(self, mqtt_port: int, http_port: int, amqp_port: int) -> None:
        mqtt_srv = await asyncio.start_server(self.handle_mqtt, "0.0.0.0", mqtt_port)
        http_srv = await asyncio.start_server(self.handle_ws, "0.0.0.0", http_port)
        amqp_srv = await asyncio.start_server(self.handle_amqp, "0.0.0.0", amqp_port)
        LOGGER.info("broker listening", mqtt=mqtt_port, http=http_port, amqp=amqp_port)
        async with mqtt_srv, http_srv, amqp_srv:
            await asyncio.gather(mqtt_srv.serve_forever(), http_srv.serve_forever(), amqp_srv.serve_forever())


def _http_json(writer: asyncio.StreamWriter, status: int, body: dict) -> None:
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    writer.write(
        f"HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {len(payload)}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n".encode()
        + payload
    )


def _encode_ws_frame(data: bytes, op: int = 0x1) -> bytes:
    out = bytearray([0x80 | op])
    length = len(data)
    if length < 126:
        out.append(length)
    elif length < 65536:
        out.append(126)
        out += struct.pack(">H", length)
    else:
        out.append(127)
        out += struct.pack(">Q", length)
    out += data
    return bytes(out)


async def _read_ws_frame(reader: asyncio.StreamReader) -> tuple[int, bytes] | None:
    hdr = await reader.readexactly(2)
    op = hdr[0] & 0x0F
    masked = hdr[1] & 0x80
    length = hdr[1] & 0x7F
    if length == 126:
        length = struct.unpack(">H", await reader.readexactly(2))[0]
    elif length == 127:
        length = struct.unpack(">Q", await reader.readexactly(8))[0]
    mask = b""
    if masked:
        mask = await reader.readexactly(4)
    payload = await reader.readexactly(length)
    if masked:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return op, payload


def _decode_payload(raw: bytes) -> Any:
    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return base64.b64encode(raw).decode("ascii")


def main() -> None:
    root = os.environ.get("NEUROVA_DATA", "/workspace/neurova/data")
    mqtt_port = int(os.environ.get("NEUROVA_MQTT_PORT", "18830"))
    http_port = int(os.environ.get("NEUROVA_HTTP_PORT", "18080"))
    amqp_port = int(os.environ.get("NEUROVA_AMQP_PORT", "18672"))
    broker = Broker(root)
    try:
        asyncio.run(broker.run(mqtt_port, http_port, amqp_port))
    except KeyboardInterrupt:
        broker.log.close()


if __name__ == "__main__":
    main()

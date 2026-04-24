"""MQTT 3.1.1 broker implemented from scratch (RFC: OASIS MQTT v3.1.1).

Supported packets:
    CONNECT / CONNACK
    PUBLISH (QoS 0 / 1 / 2)
    PUBACK / PUBREC / PUBREL / PUBCOMP
    SUBSCRIBE / SUBACK
    UNSUBSCRIBE / UNSUBACK
    PINGREQ / PINGRESP
    DISCONNECT

It speaks a single-threaded asyncio loop, writing each received message to
the append-only log and broadcasting it to every matching subscriber. The
dispatcher is topic-tree based (with + and # wildcards).
"""
from __future__ import annotations

import asyncio
import struct
import time
from dataclasses import dataclass, field
from typing import Callable

from neurova.core.logger import get_logger

log = get_logger("mqtt")

CONNECT = 1
CONNACK = 2
PUBLISH = 3
PUBACK = 4
PUBREC = 5
PUBREL = 6
PUBCOMP = 7
SUBSCRIBE = 8
SUBACK = 9
UNSUBSCRIBE = 10
UNSUBACK = 11
PINGREQ = 12
PINGRESP = 13
DISCONNECT = 14


def _encode_varlen(n: int) -> bytes:
    if n < 0 or n > 0xFFFFFFF:
        raise ValueError("mqtt length out of range")
    out = bytearray()
    while True:
        digit = n % 128
        n //= 128
        if n > 0:
            out.append(digit | 0x80)
        else:
            out.append(digit)
            break
    return bytes(out)


def _decode_varlen(data: bytes, pos: int) -> tuple[int, int]:
    multiplier = 1
    value = 0
    p = pos
    while True:
        if p >= len(data):
            raise ValueError("truncated varlen")
        b = data[p]
        p += 1
        value += (b & 0x7F) * multiplier
        if b & 0x80 == 0:
            break
        multiplier *= 128
        if multiplier > 128 * 128 * 128 * 128:
            raise ValueError("varlen too long")
    return value, p - pos


def encode_packet(ptype: int, flags: int, payload: bytes) -> bytes:
    header = bytes([((ptype & 0xF) << 4) | (flags & 0xF)])
    return header + _encode_varlen(len(payload)) + payload


async def read_packet(reader: asyncio.StreamReader) -> tuple[int, int, bytes] | None:
    byte1 = await reader.read(1)
    if not byte1:
        return None
    b = byte1[0]
    ptype = (b >> 4) & 0xF
    flags = b & 0xF
    multiplier = 1
    length = 0
    for _ in range(4):
        lb = await reader.read(1)
        if not lb:
            return None
        length += (lb[0] & 0x7F) * multiplier
        if lb[0] & 0x80 == 0:
            break
        multiplier *= 128
    payload = b""
    remaining = length
    while remaining > 0:
        chunk = await reader.read(remaining)
        if not chunk:
            return None
        payload += chunk
        remaining -= len(chunk)
    return ptype, flags, payload


def _encode_str(s: str) -> bytes:
    data = s.encode("utf-8")
    return struct.pack(">H", len(data)) + data


def _decode_str(data: bytes, pos: int) -> tuple[str, int]:
    length = struct.unpack_from(">H", data, pos)[0]
    s = data[pos + 2 : pos + 2 + length].decode("utf-8")
    return s, 2 + length


def parse_connect(payload: bytes) -> dict:
    proto, used = _decode_str(payload, 0)
    pos = used
    level = payload[pos]
    pos += 1
    flags = payload[pos]
    pos += 1
    keepalive = struct.unpack_from(">H", payload, pos)[0]
    pos += 2
    client_id, used = _decode_str(payload, pos)
    pos += used
    will_topic = will_msg = None
    username = password = None
    if flags & 0x04:
        will_topic, used = _decode_str(payload, pos)
        pos += used
        wm_len = struct.unpack_from(">H", payload, pos)[0]
        pos += 2
        will_msg = payload[pos : pos + wm_len]
        pos += wm_len
    if flags & 0x80:
        username, used = _decode_str(payload, pos)
        pos += used
    if flags & 0x40:
        pw_len = struct.unpack_from(">H", payload, pos)[0]
        pos += 2
        password = payload[pos : pos + pw_len]
        pos += pw_len
    return {
        "protocol": proto,
        "level": level,
        "flags": flags,
        "keepalive": keepalive,
        "client_id": client_id,
        "will_topic": will_topic,
        "will_msg": will_msg,
        "username": username,
        "password": password,
    }


def build_connack(session_present: bool, return_code: int) -> bytes:
    payload = bytes([1 if session_present else 0, return_code])
    return encode_packet(CONNACK, 0, payload)


def parse_publish(payload: bytes, flags: int) -> dict:
    qos = (flags >> 1) & 0x3
    retain = flags & 0x1
    dup = (flags >> 3) & 0x1
    topic, used = _decode_str(payload, 0)
    pos = used
    pid = None
    if qos > 0:
        pid = struct.unpack_from(">H", payload, pos)[0]
        pos += 2
    msg = payload[pos:]
    return {"qos": qos, "retain": bool(retain), "dup": bool(dup), "topic": topic, "pid": pid, "payload": msg}


def build_publish(topic: str, payload: bytes, qos: int = 0, pid: int | None = None, retain: bool = False, dup: bool = False) -> bytes:
    flags = (qos << 1) | (1 if retain else 0) | (1 if dup else 0) << 3
    body = _encode_str(topic)
    if qos > 0:
        if pid is None:
            raise ValueError("pid required for QoS > 0")
        body += struct.pack(">H", pid)
    body += payload
    return encode_packet(PUBLISH, flags, body)


def parse_subscribe(payload: bytes) -> dict:
    pid = struct.unpack_from(">H", payload, 0)[0]
    pos = 2
    filters = []
    while pos < len(payload):
        topic, used = _decode_str(payload, pos)
        pos += used
        qos = payload[pos] & 0x3
        pos += 1
        filters.append((topic, qos))
    return {"pid": pid, "filters": filters}


def build_suback(pid: int, qos_list: list[int]) -> bytes:
    body = struct.pack(">H", pid) + bytes(qos_list)
    return encode_packet(SUBACK, 0, body)


def build_puback(pid: int) -> bytes:
    return encode_packet(PUBACK, 0, struct.pack(">H", pid))


def build_pubrec(pid: int) -> bytes:
    return encode_packet(PUBREC, 0, struct.pack(">H", pid))


def build_pubrel(pid: int) -> bytes:
    return encode_packet(PUBREL, 2, struct.pack(">H", pid))


def build_pubcomp(pid: int) -> bytes:
    return encode_packet(PUBCOMP, 0, struct.pack(">H", pid))


def build_pingresp() -> bytes:
    return encode_packet(PINGRESP, 0, b"")


def topic_matches(filt: str, topic: str) -> bool:
    f_parts = filt.split("/")
    t_parts = topic.split("/")
    for i, fp in enumerate(f_parts):
        if fp == "#":
            return True
        if i >= len(t_parts):
            return False
        if fp == "+":
            continue
        if fp != t_parts[i]:
            return False
    return len(f_parts) == len(t_parts)


@dataclass
class Subscription:
    client_id: str
    topic_filter: str
    qos: int


@dataclass
class ClientSession:
    client_id: str
    writer: asyncio.StreamWriter
    subscriptions: dict[str, int] = field(default_factory=dict)
    last_pid: int = 0
    connected_at: float = field(default_factory=time.time)
    keepalive: int = 60
    last_seen: float = field(default_factory=time.time)

    def next_pid(self) -> int:
        self.last_pid = (self.last_pid + 1) & 0xFFFF
        if self.last_pid == 0:
            self.last_pid = 1
        return self.last_pid

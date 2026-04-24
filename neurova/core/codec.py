"""Compact binary codec for sensor samples and broker frames.

Each encoded sensor frame is:
    version(1) | topic_len(2) | topic(bytes) | ts_ms(8) | sensor_id(8) |
    payload_len(4) | payload(bytes)

Payload is a length-prefixed JSON object after optional LZ4 compression.
"""

from __future__ import annotations

import json
import struct
from typing import Any

from . import lz4

_VERSION = 1


def encode_frame(topic: str, ts_ms: int, sensor_id: str, payload: dict[str, Any], compress: bool = True) -> bytes:
    topic_bytes = topic.encode("utf-8")
    if len(topic_bytes) > 65535:
        raise ValueError("topic too long")
    sid = sensor_id.encode("utf-8").ljust(8, b"\x00")[:8]
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    flags = 0
    if compress and len(payload_bytes) > 64:
        payload_bytes = lz4.compress(payload_bytes)
        flags |= 1
    header = struct.pack(
        ">BHQ8sBI",
        _VERSION,
        len(topic_bytes),
        ts_ms,
        sid,
        flags,
        len(payload_bytes),
    )
    return header + topic_bytes + payload_bytes


def decode_frame(data: bytes) -> dict[str, Any]:
    version, topic_len, ts_ms, sid, flags, payload_len = struct.unpack_from(">BHQ8sBI", data, 0)
    if version != _VERSION:
        raise ValueError(f"unsupported frame version {version}")
    offset = struct.calcsize(">BHQ8sBI")
    topic = data[offset : offset + topic_len].decode("utf-8")
    offset += topic_len
    payload = data[offset : offset + payload_len]
    if flags & 1:
        payload = lz4.decompress(payload)
    return {
        "ts_ms": ts_ms,
        "topic": topic,
        "sensor_id": sid.rstrip(b"\x00").decode("utf-8"),
        "payload": json.loads(payload.decode("utf-8")),
    }


def encode_varint(n: int) -> bytes:
    """Variable-length unsigned integer, MQTT-style."""
    if n < 0:
        raise ValueError("varint must be non-negative")
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            byte |= 0x80
        out.append(byte)
        if not n:
            break
    return bytes(out)


def decode_varint(data: bytes, offset: int = 0) -> tuple[int, int]:
    mult = 1
    value = 0
    idx = offset
    while True:
        if idx >= len(data):
            raise ValueError("truncated varint")
        b = data[idx]
        idx += 1
        value += (b & 0x7F) * mult
        if b & 0x80 == 0:
            break
        mult <<= 7
        if mult > 128 * 128 * 128 * 128:
            raise ValueError("varint too long")
    return value, idx - offset

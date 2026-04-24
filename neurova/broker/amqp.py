"""Minimal AMQP 0-9-1 broker: connection, channel, basic.publish, basic.consume.

We implement the subset needed for industrial sensor ingestion: protocol
header (AMQP\\0\\0\\9\\1), connection.start/tune/open, channel.open,
queue.declare, basic.publish, basic.consume and basic.deliver. Each
published frame is forwarded to the shared broker dispatcher so MQTT and
AMQP consumers share the same topic space.
"""
from __future__ import annotations

import asyncio
import struct
from dataclasses import dataclass

FRAME_METHOD = 1
FRAME_HEADER = 2
FRAME_BODY = 3
FRAME_HEARTBEAT = 8
FRAME_END = 0xCE

PROTOCOL_HEADER = b"AMQP\x00\x00\x09\x01"


def _short(data: bytes, pos: int) -> tuple[int, int]:
    return struct.unpack_from(">H", data, pos)[0], pos + 2


def _long(data: bytes, pos: int) -> tuple[int, int]:
    return struct.unpack_from(">I", data, pos)[0], pos + 4


def _shortstr(data: bytes, pos: int) -> tuple[str, int]:
    length = data[pos]
    return data[pos + 1 : pos + 1 + length].decode("utf-8"), pos + 1 + length


def _longstr(data: bytes, pos: int) -> tuple[bytes, int]:
    length = struct.unpack_from(">I", data, pos)[0]
    return data[pos + 4 : pos + 4 + length], pos + 4 + length


def _encode_shortstr(s: str) -> bytes:
    data = s.encode("utf-8")
    return bytes([len(data)]) + data


def _encode_longstr(b: bytes) -> bytes:
    return struct.pack(">I", len(b)) + b


def encode_frame(ftype: int, channel: int, payload: bytes) -> bytes:
    return struct.pack(">BHI", ftype, channel, len(payload)) + payload + bytes([FRAME_END])


async def read_frame(reader: asyncio.StreamReader) -> tuple[int, int, bytes] | None:
    header = await reader.readexactly(7)
    ftype, channel, size = struct.unpack(">BHI", header)
    payload = await reader.readexactly(size)
    end = await reader.readexactly(1)
    if end[0] != FRAME_END:
        raise ValueError("bad AMQP frame end")
    return ftype, channel, payload


def build_connection_start() -> bytes:
    mechanisms = b"PLAIN"
    locales = b"en_US"
    server_props = _encode_shortstr("")  # empty field table via 0 length
    payload = (
        struct.pack(">HH", 10, 10)  # class.method
        + bytes([0, 9])  # version major/minor as octets
        + struct.pack(">I", 0)  # server properties (empty table)
        + _encode_longstr(mechanisms)
        + _encode_longstr(locales)
    )
    return encode_frame(FRAME_METHOD, 0, payload)


def build_connection_tune() -> bytes:
    payload = struct.pack(">HHHHI", 10, 30, 65535, 131072, 60)
    return encode_frame(FRAME_METHOD, 0, payload)


def build_connection_open_ok() -> bytes:
    payload = struct.pack(">HH", 10, 41) + _encode_shortstr("")
    return encode_frame(FRAME_METHOD, 0, payload)


def build_channel_open_ok() -> bytes:
    payload = struct.pack(">HH", 20, 11) + _encode_longstr(b"")
    return encode_frame(FRAME_METHOD, 1, payload)


def build_queue_declare_ok(queue: str) -> bytes:
    payload = struct.pack(">HH", 50, 11) + _encode_shortstr(queue) + struct.pack(">II", 0, 0)
    return encode_frame(FRAME_METHOD, 1, payload)


def parse_basic_publish(payload: bytes) -> tuple[str, str]:
    pos = 4  # skip class/method
    pos += 2  # reserved short
    exchange, pos = _shortstr(payload, pos)
    routing_key, pos = _shortstr(payload, pos)
    return exchange, routing_key


def build_basic_deliver(ctag: str, delivery_tag: int, routing_key: str) -> bytes:
    payload = (
        struct.pack(">HH", 60, 60)
        + _encode_shortstr(ctag)
        + struct.pack(">Q", delivery_tag)
        + bytes([0])
        + _encode_shortstr("amq.topic")
        + _encode_shortstr(routing_key)
    )
    return encode_frame(FRAME_METHOD, 1, payload)


def build_content_header(body_size: int) -> bytes:
    payload = struct.pack(">HHQH", 60, 0, body_size, 0)
    return encode_frame(FRAME_HEADER, 1, payload)


def build_content_body(body: bytes) -> bytes:
    return encode_frame(FRAME_BODY, 1, body)

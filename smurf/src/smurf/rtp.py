from __future__ import annotations

import asyncio
import os
import random
import socket
import struct
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Callable

from .logging_utils import StructuredLogger


RTP_VERSION = 2
PAYLOAD_PCMU = 0
PAYLOAD_PCMA = 8
PAYLOAD_G722 = 9
PAYLOAD_OPUS = 111
PAYLOAD_DTMF = 101


@dataclass(slots=True)
class RtpStats:
    ssrc: int
    packets_sent: int = 0
    packets_received: int = 0
    octets_sent: int = 0
    jitter: float = 0.0
    last_transit: float | None = None
    last_arrival: float | None = None
    last_sequence: int | None = None


@dataclass(slots=True)
class MediaEndpoint:
    host: str
    port: int
    payload_type: int
    codec: str


@dataclass(slots=True)
class MediaSession:
    call_id: str
    left: MediaEndpoint
    right: MediaEndpoint
    left_remote: MediaEndpoint
    right_remote: MediaEndpoint
    left_ssrc: int = field(default_factory=lambda: random.getrandbits(32))
    right_ssrc: int = field(default_factory=lambda: random.getrandbits(32))
    created_at: float = field(default_factory=time.time)
    left_stats: RtpStats = field(init=False)
    right_stats: RtpStats = field(init=False)

    def __post_init__(self) -> None:
        self.left_stats = RtpStats(ssrc=self.left_ssrc)
        self.right_stats = RtpStats(ssrc=self.right_ssrc)


class RtpRelayProtocol(asyncio.DatagramProtocol):
    def __init__(self, port: int, on_packet: Callable[[bytes, tuple[str, int], int], None]):
        self.port = port
        self.on_packet = on_packet
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        self.on_packet(data, addr, self.port)

    def send(self, data: bytes, addr: tuple[str, int]) -> None:
        if self.transport is not None:
            self.transport.sendto(data, addr)


class JitterBuffer:
    def __init__(self, max_packets: int = 32):
        self.queue: deque[bytes] = deque(maxlen=max_packets)

    def push(self, packet: bytes) -> bytes:
        self.queue.append(packet)
        return packet


class RtpEngine:
    def __init__(self, host: str, port_start: int, port_end: int, logger: StructuredLogger):
        self.host = host
        self.port_start = port_start
        self.port_end = port_end
        self.logger = logger
        self._ports: dict[int, RtpRelayProtocol] = {}
        self._allocated: set[int] = set()
        self._sessions: dict[str, MediaSession] = {}
        self._by_port: dict[int, tuple[str, str]] = {}
        self._buffers: dict[tuple[str, str], JitterBuffer] = {}

    async def allocate_port(self) -> int:
        loop = asyncio.get_running_loop()
        for port in range(self.port_start, self.port_end + 1, 2):
            if port in self._allocated:
                continue
            protocol = RtpRelayProtocol(port, self._on_packet)
            transport, _ = await loop.create_datagram_endpoint(
                lambda: protocol,
                local_addr=(self.host, port),
                family=socket.AF_INET,
            )
            sock = transport.get_extra_info("socket")
            if sock is not None:
                sock.setsockopt(socket.IPPROTO_IP, socket.IP_TOS, 46 << 2)
            self._ports[port] = protocol
            self._allocated.add(port)
            self.logger.info("rtp_port_allocated", port=port)
            return port
        raise RuntimeError("No RTP ports available")

    async def create_session(self, call_id: str, left: MediaEndpoint, right: MediaEndpoint) -> MediaSession:
        relay_left_port = await self.allocate_port()
        relay_right_port = await self.allocate_port()
        relay_left = MediaEndpoint(self.host, relay_left_port, left.payload_type, left.codec)
        relay_right = MediaEndpoint(self.host, relay_right_port, right.payload_type, right.codec)
        session = MediaSession(
            call_id=call_id,
            left=relay_left,
            right=relay_right,
            left_remote=MediaEndpoint(left.host, left.port, left.payload_type, left.codec),
            right_remote=MediaEndpoint(right.host, right.port, right.payload_type, right.codec),
        )
        self._sessions[call_id] = session
        self._by_port[relay_left_port] = (call_id, "left")
        self._by_port[relay_right_port] = (call_id, "right")
        self._buffers[(call_id, "left")] = JitterBuffer()
        self._buffers[(call_id, "right")] = JitterBuffer()
        self.logger.info(
            "rtp_session_created",
            call_id=call_id,
            left_relay=relay_left_port,
            right_relay=relay_right_port,
            left_remote=f"{left.host}:{left.port}",
            right_remote=f"{right.host}:{right.port}",
        )
        return session

    def update_remote(
        self,
        call_id: str,
        side: str,
        host: str,
        port: int,
        payload_type: int | None = None,
        codec: str | None = None,
    ) -> None:
        session = self._sessions.get(call_id)
        if session is None:
            return
        target = session.left_remote if side == "left" else session.right_remote
        target.host = host
        target.port = port
        if payload_type is not None:
            target.payload_type = payload_type
        if codec is not None:
            target.codec = codec
        self.logger.info(
            "rtp_remote_set",
            call_id=call_id,
            side=side,
            host=host,
            port=port,
            payload_type=payload_type,
            codec=codec,
        )

    def get_session(self, call_id: str) -> MediaSession | None:
        return self._sessions.get(call_id)

    def destroy_session(self, call_id: str) -> None:
        session = self._sessions.pop(call_id, None)
        if session is None:
            return
        for endpoint in (session.left, session.right):
            self._by_port.pop(endpoint.port, None)
            protocol = self._ports.pop(endpoint.port, None)
            if protocol and protocol.transport:
                protocol.transport.close()
            self._allocated.discard(endpoint.port)
        self._buffers.pop((call_id, "left"), None)
        self._buffers.pop((call_id, "right"), None)
        self.logger.info("rtp_session_destroyed", call_id=call_id)

    def _on_packet(self, data: bytes, addr: tuple[str, int], port: int) -> None:
        binding = self._by_port.get(port)
        if binding is None:
            return
        call_id, side = binding
        session = self._sessions.get(call_id)
        if session is None:
            return
        source_remote = getattr(session, f"{side}_remote")
        other_side = "right" if side == "left" else "left"
        target_remote = getattr(session, f"{other_side}_remote")
        stats = session.left_stats if side == "left" else session.right_stats
        if addr != (source_remote.host, source_remote.port):
            self.logger.info(
                "rtp_remote_updated",
                call_id=call_id,
                side=side,
                previous=f"{source_remote.host}:{source_remote.port}",
                current=f"{addr[0]}:{addr[1]}",
            )
            source_remote.host = addr[0]
            source_remote.port = addr[1]
        self._update_stats(stats, data)
        buffered = self._buffers[(call_id, side)].push(data)
        target_port = session.right.port if side == "left" else session.left.port
        target_protocol = self._ports.get(target_port)
        if target_protocol is not None and target_remote.port > 0 and target_remote.host not in {"", "0.0.0.0"}:
            target_protocol.send(buffered, (target_remote.host, target_remote.port))

    def _update_stats(self, stats: RtpStats, packet: bytes) -> None:
        if len(packet) < 12:
            return
        header = struct.unpack("!BBHII", packet[:12])
        sequence = header[2]
        timestamp = header[3]
        arrival = time.time() * 8000
        transit = arrival - timestamp
        if stats.last_transit is not None:
            delta = abs(transit - stats.last_transit)
            stats.jitter += (delta - stats.jitter) / 16.0
        stats.last_transit = transit
        stats.last_arrival = arrival
        stats.last_sequence = sequence
        stats.packets_received += 1
        stats.octets_sent += max(0, len(packet) - 12)

    def build_rtp_packet(
        self,
        payload: bytes,
        payload_type: int,
        sequence: int,
        timestamp: int,
        ssrc: int,
        marker: bool = False,
    ) -> bytes:
        b0 = (RTP_VERSION << 6)
        b1 = payload_type & 0x7F
        if marker:
            b1 |= 0x80
        return struct.pack("!BBHII", b0, b1, sequence & 0xFFFF, timestamp & 0xFFFFFFFF, ssrc) + payload

    def generate_silence_frame(self, codec: str) -> bytes:
        if codec.lower() in {"pcmu", "g711u", "ulaw"}:
            return bytes([0xFF] * 160)
        if codec.lower() in {"pcma", "g711a", "alaw"}:
            return bytes([0xD5] * 160)
        return os.urandom(160)

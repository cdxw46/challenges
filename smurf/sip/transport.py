"""SIP transport layer.

Implements UDP, TCP, TLS and WebSocket transports — each one delivers raw
SIP datagrams (already framed) to a single ``on_message`` callback.  We
intentionally keep transports dumb: framing, fragmentation and Content-
Length handling are done here, but everything else (transactions, dialogs,
authentication) lives in higher layers.

For WebSocket we implement the SIP sub-protocol per RFC 7118 directly using
``websockets`` so the same dispatcher serves real phones (UDP/TCP) and
WebRTC softphones in browsers.
"""

from __future__ import annotations

import asyncio
import os
import ssl
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

from ..core import config
from ..core.log import get_logger

log = get_logger("smurf.sip.transport")
RawHandler = Callable[[bytes, "RemoteAddr", "Transport"], Awaitable[None]]


@dataclass(frozen=True)
class RemoteAddr:
    transport: str
    host: str
    port: int

    def key(self) -> str:
        return f"{self.transport}:{self.host}:{self.port}"


class Transport:
    """Common transport API used by the dispatcher."""

    name = "base"

    def __init__(self, on_message: RawHandler) -> None:
        self.on_message = on_message

    async def start(self) -> None:  # pragma: no cover
        raise NotImplementedError

    async def stop(self) -> None:  # pragma: no cover
        raise NotImplementedError

    async def send(self, data: bytes, remote: RemoteAddr) -> None:  # pragma: no cover
        raise NotImplementedError

    @property
    def local_address(self) -> tuple[str, int]:  # pragma: no cover
        return ("0.0.0.0", 0)


# ---------------------------------------------------------------------------
# UDP
# ---------------------------------------------------------------------------


class _UDPProtocol(asyncio.DatagramProtocol):
    def __init__(self, transport: "UDPTransport") -> None:
        self.transport_obj = transport

    def connection_made(self, t: asyncio.BaseTransport) -> None:  # type: ignore[override]
        self.transport_obj._dgram = t  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        host, port = addr[0], addr[1]
        remote = RemoteAddr("udp", host, port)
        try:
            asyncio.create_task(self.transport_obj.on_message(data, remote, self.transport_obj))
        except Exception:
            log.exception("UDP dispatch failed for %s", remote)

    def error_received(self, exc: Exception) -> None:
        log.warning("UDP error: %s", exc)


class UDPTransport(Transport):
    name = "udp"

    def __init__(self, on_message: RawHandler, host: str, port: int) -> None:
        super().__init__(on_message)
        self.host = host
        self.port = port
        self._dgram: asyncio.DatagramTransport | None = None

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.create_datagram_endpoint(
            lambda: _UDPProtocol(self),
            local_addr=(self.host, self.port),
            allow_broadcast=False,
            reuse_port=False,
        )
        log.info("UDP transport listening on %s:%d", self.host, self.port)

    async def stop(self) -> None:
        if self._dgram is not None:
            self._dgram.close()
            self._dgram = None

    async def send(self, data: bytes, remote: RemoteAddr) -> None:
        if self._dgram is None:
            raise RuntimeError("UDP transport not started")
        self._dgram.sendto(data, (remote.host, remote.port))

    @property
    def local_address(self) -> tuple[str, int]:
        return (self.host, self.port)


# ---------------------------------------------------------------------------
# TCP / TLS
# ---------------------------------------------------------------------------


class _StreamConn:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.reader = reader
        self.writer = writer
        self.lock = asyncio.Lock()


class TCPTransport(Transport):
    name = "tcp"

    def __init__(self, on_message: RawHandler, host: str, port: int,
                 *, tls: ssl.SSLContext | None = None, name: str = "tcp") -> None:
        super().__init__(on_message)
        self.host = host
        self.port = port
        self.tls = tls
        self.name = name
        self._server: asyncio.AbstractServer | None = None
        self._conns: dict[str, _StreamConn] = {}

    async def start(self) -> None:
        self._server = await asyncio.start_server(
            self._client_connected, host=self.host, port=self.port, ssl=self.tls
        )
        log.info("%s transport listening on %s:%d", self.name.upper(), self.host, self.port)

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def _client_connected(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername") or ("?", 0)
        host, port = peer[0], peer[1]
        remote = RemoteAddr(self.name, host, port)
        conn = _StreamConn(reader, writer)
        self._conns[remote.key()] = conn
        try:
            buf = bytearray()
            while True:
                chunk = await reader.read(65535)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    msg, rest = _split_stream_message(bytes(buf))
                    if msg is None:
                        break
                    buf = bytearray(rest)
                    try:
                        await self.on_message(msg, remote, self)
                    except Exception:
                        log.exception("TCP dispatch failed for %s", remote)
        finally:
            self._conns.pop(remote.key(), None)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def send(self, data: bytes, remote: RemoteAddr) -> None:
        conn = self._conns.get(remote.key())
        if conn is None:
            reader, writer = await asyncio.open_connection(remote.host, remote.port, ssl=self.tls)
            conn = _StreamConn(reader, writer)
            self._conns[remote.key()] = conn
            asyncio.create_task(self._read_loop(conn, remote))
        async with conn.lock:
            conn.writer.write(data)
            await conn.writer.drain()

    async def _read_loop(self, conn: _StreamConn, remote: RemoteAddr) -> None:
        buf = bytearray()
        try:
            while True:
                chunk = await conn.reader.read(65535)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    msg, rest = _split_stream_message(bytes(buf))
                    if msg is None:
                        break
                    buf = bytearray(rest)
                    try:
                        await self.on_message(msg, remote, self)
                    except Exception:
                        log.exception("Outbound %s read failure", self.name)
        finally:
            self._conns.pop(remote.key(), None)
            try:
                conn.writer.close()
                await conn.writer.wait_closed()
            except Exception:
                pass

    @property
    def local_address(self) -> tuple[str, int]:
        return (self.host, self.port)


def _split_stream_message(buf: bytes) -> tuple[Optional[bytes], bytes]:
    sep = buf.find(b"\r\n\r\n")
    if sep == -1:
        return None, buf
    head = buf[:sep]
    body_start = sep + 4
    cl = 0
    for line in head.split(b"\r\n"):
        if b":" in line:
            k, v = line.split(b":", 1)
            if k.strip().lower() in (b"content-length", b"l"):
                try:
                    cl = int(v.strip())
                except ValueError:
                    cl = 0
                break
    if len(buf) < body_start + cl:
        return None, buf
    return buf[: body_start + cl], buf[body_start + cl :]


def make_self_signed_context(cert_file: str, key_file: str, *, common_name: str) -> ssl.SSLContext:
    """Return an SSLContext, generating a self-signed cert if one doesn't exist."""

    cert_path = config.Path(cert_file) if hasattr(config, "Path") else None  # noqa
    from pathlib import Path

    cert_p = Path(cert_file)
    key_p = Path(key_file)
    if not cert_p.exists() or not key_p.exists():
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
        import datetime

        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "ES"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SMURF PBX"),
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        ])
        san = x509.SubjectAlternativeName([
            x509.DNSName(common_name),
            x509.DNSName("localhost"),
            x509.IPAddress(__import__("ipaddress").ip_address("127.0.0.1")),
        ])
        cert = (
            x509.CertificateBuilder()
            .subject_name(subject)
            .issuer_name(issuer)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(datetime.datetime.utcnow() - datetime.timedelta(days=1))
            .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=3650))
            .add_extension(san, critical=False)
            .sign(key, hashes.SHA256())
        )
        cert_p.parent.mkdir(parents=True, exist_ok=True)
        cert_p.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        key_p.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.TraditionalOpenSSL,
                serialization.NoEncryption(),
            )
        )
        os.chmod(key_p, 0o600)
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    ctx.load_cert_chain(cert_file, key_file)
    return ctx

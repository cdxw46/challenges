from __future__ import annotations

import asyncio
import re
import secrets
import ssl
from dataclasses import dataclass
from typing import Callable

from .logging_utils import StructuredLogger
from .models import SipMessage, SipUri


TOKEN_SPLIT_RE = re.compile(r""",(?=(?:[^"]*"[^"]*")*[^"]*$)""")
PARAM_SPLIT_RE = re.compile(r""";(?=(?:[^"]*"[^"]*")*[^"]*$)""")


@dataclass(slots=True)
class SipEndpoint:
    transport: str
    host: str
    port: int
    connection_id: str = ""

    def key(self) -> str:
        if self.connection_id:
            return self.connection_id
        return f"{self.transport}:{self.host}:{self.port}"


@dataclass(slots=True)
class SipEnvelope:
    message: SipMessage
    endpoint: SipEndpoint


def parse_sip_message(payload: bytes) -> SipMessage:
    if b"\r\n\r\n" in payload:
        header_part, body = payload.split(b"\r\n\r\n", 1)
    elif b"\n\n" in payload:
        header_part, body = payload.split(b"\n\n", 1)
    else:
        header_part, body = payload, b""
    lines = header_part.decode("utf-8", errors="replace").replace("\r\n", "\n").split("\n")
    if not lines or not lines[0].strip():
        raise ValueError("Empty SIP message")
    start_line = lines[0].strip()
    headers: list[tuple[str, str]] = []
    current_name = ""
    current_value = ""
    for raw_line in lines[1:]:
        if not raw_line:
            continue
        if raw_line.startswith((" ", "\t")) and current_name:
            current_value += " " + raw_line.strip()
            continue
        if current_name:
            headers.append((current_name, current_value.strip()))
        if ":" not in raw_line:
            continue
        current_name, current_value = raw_line.split(":", 1)
        current_name = current_name.strip()
        current_value = current_value.strip()
    if current_name:
        headers.append((current_name, current_value.strip()))
    content_length = 0
    for name, value in headers:
        if name.lower() == "content-length":
            try:
                content_length = int(value.strip())
            except ValueError:
                content_length = 0
            break
    if content_length > 0:
        body = body[:content_length]
    else:
        body = b""
    return SipMessage(start_line=start_line, headers=headers, body=body)


def _split_params(value: str) -> tuple[str, dict[str, str]]:
    items = PARAM_SPLIT_RE.split(value)
    main = items[0].strip()
    params: dict[str, str] = {}
    for item in items[1:]:
        item = item.strip()
        if not item:
            continue
        if "=" in item:
            key, val = item.split("=", 1)
            params[key.strip().lower()] = val.strip().strip('"')
        else:
            params[item.strip().lower()] = ""
    return main, params


def parse_uri(uri_text: str) -> SipUri:
    uri_text = uri_text.strip().strip("<>").strip()
    headers: dict[str, str] = {}
    if "?" in uri_text:
        uri_text, header_text = uri_text.split("?", 1)
        for item in header_text.split("&"):
            if "=" in item:
                key, val = item.split("=", 1)
                headers[key] = val
    main, params = _split_params(uri_text)
    if ":" not in main:
        raise ValueError(f"Invalid SIP URI: {uri_text}")
    scheme, address = main.split(":", 1)
    user = ""
    hostport = address
    if "@" in address:
        user, hostport = address.split("@", 1)
    host = hostport
    port: int | None = None
    if ":" in hostport and hostport.count(":") == 1:
        host, port_text = hostport.rsplit(":", 1)
        if port_text.isdigit():
            port = int(port_text)
        else:
            host = hostport
    return SipUri(
        scheme=scheme.lower(),
        user=user,
        host=host,
        port=port,
        params=params,
        headers=headers,
    )


def parse_name_addr(value: str) -> tuple[str, SipUri, dict[str, str]]:
    value = value.strip()
    if "<" in value and ">" in value:
        prefix, remainder = value.split("<", 1)
        uri_text, suffix = remainder.split(">", 1)
        display_name = prefix.strip().strip('"')
        uri = parse_uri(uri_text)
        _, params = _split_params("dummy" + suffix)
        return display_name, uri, params
    main, params = _split_params(value)
    uri = parse_uri(main)
    return "", uri, params


def format_name_addr(uri: SipUri, display_name: str = "", params: dict[str, str] | None = None) -> str:
    value = f"<{uri.to_uri()}>"
    if display_name:
        value = f'"{display_name}" {value}'
    for key, item in (params or {}).items():
        if item:
            value += f";{key}={item}"
        else:
            value += f";{key}"
    return value


def parse_header_params(value: str) -> dict[str, str]:
    _, params = _split_params(value)
    return params


def parse_auth_header(value: str) -> dict[str, str]:
    value = value.strip()
    if " " in value:
        scheme, rest = value.split(" ", 1)
        if scheme.lower() != "digest":
            return {}
    else:
        rest = value
    fields: dict[str, str] = {}
    for item in TOKEN_SPLIT_RE.split(rest):
        if "=" not in item:
            continue
        key, field_value = item.split("=", 1)
        fields[key.strip().lower()] = field_value.strip().strip('"')
    return fields


def format_digest_challenge(realm: str, nonce: str, algorithm: str) -> str:
    return (
        f'Digest realm="{realm}", nonce="{nonce}", algorithm={algorithm}, '
        'qop="auth"'
    )


def make_response(
    request: SipMessage,
    status_code: int,
    reason: str,
    headers: list[tuple[str, str]] | None = None,
    body: bytes = b"",
    to_tag: str | None = None,
) -> SipMessage:
    response_headers: list[tuple[str, str]] = []
    for header_name in ("Via", "From", "To", "Call-ID", "CSeq"):
        values = request.headers_named(header_name)
        for value in values:
            if header_name.lower() == "to" and to_tag and "tag=" not in value:
                if ";" in value:
                    value = f"{value};tag={to_tag}"
                else:
                    value = f"{value};tag={to_tag}"
            response_headers.append((header_name, value))
    response_headers.append(("Server", "SMURF"))
    for name, value in headers or []:
        response_headers.append((name, value))
    if body and not any(name.lower() == "content-type" for name, _ in response_headers):
        response_headers.append(("Content-Type", "application/sdp"))
    return SipMessage(
        start_line=f"SIP/2.0 {status_code} {reason}",
        headers=response_headers,
        body=body,
    )


def make_request(
    method: str,
    uri: str,
    headers: list[tuple[str, str]],
    body: bytes = b"",
) -> SipMessage:
    if body and not any(name.lower() == "content-type" for name, _ in headers):
        headers = [*headers, ("Content-Type", "application/sdp")]
    return SipMessage(start_line=f"{method} {uri} SIP/2.0", headers=headers, body=body)


def create_branch() -> str:
    return f"z9hG4bK{secrets.token_hex(8)}"


def create_tag() -> str:
    return secrets.token_hex(6)


def extract_messages_from_stream(buffer: bytearray) -> list[bytes]:
    messages: list[bytes] = []
    while True:
        marker = buffer.find(b"\r\n\r\n")
        marker_len = 4
        if marker < 0:
            marker = buffer.find(b"\n\n")
            marker_len = 2
        if marker < 0:
            break
        header_block = bytes(buffer[:marker + marker_len])
        header_text = header_block.decode("utf-8", errors="replace")
        content_length = 0
        for raw_line in header_text.replace("\r\n", "\n").split("\n")[1:]:
            if raw_line.lower().startswith("content-length:"):
                try:
                    content_length = int(raw_line.split(":", 1)[1].strip())
                except ValueError:
                    content_length = 0
                break
        total_length = marker + marker_len + content_length
        if len(buffer) < total_length:
            break
        messages.append(bytes(buffer[:total_length]))
        del buffer[:total_length]
    return messages


class _SipUdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, server: "SipServer"):
        self.server = server
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]
        self.server._udp_transport = self.transport

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        asyncio.create_task(self.server._on_datagram(data, addr))


class SipServer:
    def __init__(
        self,
        host: str,
        udp_port: int,
        tls_port: int,
        tls_context: ssl.SSLContext,
        handler: Callable[[SipEnvelope], asyncio.Future | asyncio.Task | asyncio.coroutines],
        logger: StructuredLogger,
    ) -> None:
        self.host = host
        self.udp_port = udp_port
        self.tls_port = tls_port
        self.tls_context = tls_context
        self.handler = handler
        self.logger = logger
        self._udp_transport: asyncio.DatagramTransport | None = None
        self._tcp_server: asyncio.AbstractServer | None = None
        self._tls_server: asyncio.AbstractServer | None = None
        self._connections: dict[str, asyncio.StreamWriter] = {}

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        await loop.create_datagram_endpoint(
            lambda: _SipUdpProtocol(self),
            local_addr=(self.host, self.udp_port),
        )
        self._tcp_server = await asyncio.start_server(
            lambda reader, writer: self._handle_stream(reader, writer, "tcp"),
            host=self.host,
            port=self.udp_port,
        )
        self._tls_server = await asyncio.start_server(
            lambda reader, writer: self._handle_stream(reader, writer, "tls"),
            host=self.host,
            port=self.tls_port,
            ssl=self.tls_context,
        )
        self.logger.info(
            "sip_server_started",
            udp_port=self.udp_port,
            tcp_port=self.udp_port,
            tls_port=self.tls_port,
        )

    async def stop(self) -> None:
        if self._udp_transport is not None:
            self._udp_transport.close()
        for server in (self._tcp_server, self._tls_server):
            if server is not None:
                server.close()
                await server.wait_closed()
        for writer in list(self._connections.values()):
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
        self._connections.clear()

    async def send(self, endpoint: SipEndpoint, message: SipMessage) -> None:
        payload = message.to_bytes()
        if endpoint.transport == "udp":
            if self._udp_transport is None:
                raise RuntimeError("UDP transport is not ready")
            self._udp_transport.sendto(payload, (endpoint.host, endpoint.port))
            return
        writer = self._connections.get(endpoint.connection_id)
        if writer is None:
            raise RuntimeError(f"Missing live stream connection for {endpoint.connection_id}")
        writer.write(payload)
        await writer.drain()

    async def _on_datagram(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            message = parse_sip_message(data)
        except Exception as exc:
            self.logger.warning("sip_udp_parse_failed", addr=f"{addr[0]}:{addr[1]}", error=str(exc))
            return
        await self.handler(
            SipEnvelope(message=message, endpoint=SipEndpoint("udp", addr[0], addr[1]))
        )

    async def _handle_stream(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        transport_name: str,
    ) -> None:
        peer = writer.get_extra_info("peername")
        if not peer:
            writer.close()
            await writer.wait_closed()
            return
        connection_id = f"{transport_name}-{secrets.token_hex(6)}"
        self._connections[connection_id] = writer
        endpoint = SipEndpoint(transport_name, peer[0], peer[1], connection_id)
        buffer = bytearray()
        self.logger.info("sip_stream_connected", transport=transport_name, connection_id=connection_id)
        try:
            while not reader.at_eof():
                chunk = await reader.read(8192)
                if not chunk:
                    break
                buffer.extend(chunk)
                for raw_message in extract_messages_from_stream(buffer):
                    try:
                        message = parse_sip_message(raw_message)
                    except Exception as exc:
                        self.logger.warning(
                            "sip_stream_parse_failed",
                            transport=transport_name,
                            connection_id=connection_id,
                            error=str(exc),
                        )
                        continue
                    await self.handler(SipEnvelope(message=message, endpoint=endpoint))
        finally:
            self._connections.pop(connection_id, None)
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
            self.logger.info(
                "sip_stream_disconnected",
                transport=transport_name,
                connection_id=connection_id,
            )

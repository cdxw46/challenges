"""Minimal async HTTP/WebSocket server used by the orchestrator.

Implements only what NEUROVA needs: HTTP/1.1 keep-alive (optional), JSON
responses, multipart form parsing for citizen report uploads, WebSocket
frame handling and static file serving. No external web framework.
"""
from __future__ import annotations

import asyncio
import base64
import email.parser
import email.policy
import gzip
import hashlib
import json
import os
import struct
import time
import traceback
import urllib.parse
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from neurova.core.logger import get_logger

LOGGER = get_logger("http")
WS_GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

STATUS_TEXT = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Payload Too Large",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable",
}


@dataclass
class Request:
    method: str
    path: str
    query: dict
    headers: dict
    body: bytes
    writer: asyncio.StreamWriter
    remote: str

    def json(self) -> Any:
        if not self.body:
            return None
        return json.loads(self.body.decode("utf-8"))

    def form(self) -> dict:
        return dict(urllib.parse.parse_qsl(self.body.decode("utf-8")))

    def multipart(self) -> list[dict]:
        ctype = self.headers.get("content-type", "")
        if not ctype.startswith("multipart/form-data"):
            return []
        parser = email.parser.BytesParser(policy=email.policy.default)
        msg = parser.parsebytes(b"Content-Type: " + ctype.encode() + b"\r\n\r\n" + self.body)
        parts: list[dict] = []
        for part in msg.iter_parts():
            cd = part.get("Content-Disposition", "")
            name = None
            filename = None
            for token in cd.split(";"):
                token = token.strip()
                if token.startswith("name="):
                    name = token.split("=", 1)[1].strip().strip('"')
                elif token.startswith("filename="):
                    filename = token.split("=", 1)[1].strip().strip('"')
            parts.append({
                "name": name,
                "filename": filename,
                "content_type": part.get_content_type(),
                "data": part.get_payload(decode=True),
            })
        return parts


Handler = Callable[[Request], Awaitable[tuple[int, dict, bytes | str | dict]]]
WSHandler = Callable[[Request, asyncio.StreamReader, asyncio.StreamWriter], Awaitable[None]]


class Router:
    def __init__(self) -> None:
        self._routes: list[tuple[str, str, Handler]] = []
        self._ws_routes: list[tuple[str, WSHandler]] = []
        self._static: list[tuple[str, str]] = []

    def route(self, method: str, pattern: str, handler: Handler) -> None:
        self._routes.append((method.upper(), pattern, handler))

    def websocket(self, pattern: str, handler: WSHandler) -> None:
        self._ws_routes.append((pattern, handler))

    def static(self, prefix: str, directory: str) -> None:
        self._static.append((prefix.rstrip("/") + "/", directory))

    def match(self, method: str, path: str) -> tuple[Handler, dict] | None:
        candidates = [path]
        if path.endswith("/") and path != "/":
            candidates.append(path[:-1])
        else:
            candidates.append(path + "/")
        for candidate in candidates:
            for m, pattern, handler in self._routes:
                if m != method:
                    continue
                params = _match_pattern(pattern, candidate)
                if params is not None:
                    return handler, params
        return None

    def match_ws(self, path: str) -> tuple[WSHandler, dict] | None:
        for pattern, handler in self._ws_routes:
            params = _match_pattern(pattern, path)
            if params is not None:
                return handler, params
        return None

    def match_static(self, path: str) -> str | None:
        for prefix, directory in self._static:
            target = prefix
            base = target.rstrip("/")
            if path == base or path == target:
                return os.path.join(directory, "index.html")
            if path.startswith(target):
                rel = path[len(target):]
                if not rel or rel.endswith("/"):
                    return os.path.join(directory, rel, "index.html")
                abs_path = os.path.realpath(os.path.join(directory, rel))
                if abs_path.startswith(os.path.realpath(directory)):
                    return abs_path
        return None


def _match_pattern(pattern: str, path: str) -> dict | None:
    parts_p = pattern.split("/")
    parts_x = path.split("?", 1)[0].split("/")
    if len(parts_p) != len(parts_x):
        return None
    params: dict[str, str] = {}
    for pp, xp in zip(parts_p, parts_x):
        if pp.startswith(":"):
            params[pp[1:]] = urllib.parse.unquote(xp)
        elif pp == "*":
            params["_rest"] = urllib.parse.unquote(xp)
        elif pp != xp:
            return None
    return params


def build_response(status: int, headers: dict, body: bytes, gzip_accepted: bool = False) -> bytes:
    hdrs = {
        "Content-Type": "application/json",
        "Server": "NEUROVA/1.0",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Cache-Control": "no-store",
    }
    hdrs.update({k: str(v) for k, v in headers.items()})
    if gzip_accepted and len(body) > 1024 and "Content-Encoding" not in hdrs:
        body = gzip.compress(body)
        hdrs["Content-Encoding"] = "gzip"
    hdrs["Content-Length"] = str(len(body))
    text = f"HTTP/1.1 {status} {STATUS_TEXT.get(status, '')}\r\n"
    for k, v in hdrs.items():
        text += f"{k}: {v}\r\n"
    text += "\r\n"
    return text.encode("utf-8") + body


async def read_request(reader: asyncio.StreamReader) -> Request | None:
    try:
        line = await reader.readline()
    except (ConnectionError, asyncio.IncompleteReadError):
        return None
    if not line:
        return None
    try:
        method, raw_path, _ = line.decode("iso-8859-1").rstrip().split(" ", 2)
    except ValueError:
        return None
    headers: dict[str, str] = {}
    while True:
        header_line = await reader.readline()
        if not header_line or header_line == b"\r\n":
            break
        k, _, v = header_line.decode("iso-8859-1").strip().partition(":")
        headers[k.strip().lower()] = v.strip()
    body = b""
    if "content-length" in headers:
        length = int(headers["content-length"])
        if length > 64 * 1024 * 1024:
            return None
        body = await reader.readexactly(length)
    path, _, query_raw = raw_path.partition("?")
    query = dict(urllib.parse.parse_qsl(query_raw))
    return Request(method=method.upper(), path=path, query=query, headers=headers, body=body, writer=None, remote="")


def encode_ws_frame(payload: bytes, op: int = 0x1) -> bytes:
    first = 0x80 | op
    length = len(payload)
    if length < 126:
        header = bytes([first, length])
    elif length < 65536:
        header = bytes([first, 126]) + struct.pack(">H", length)
    else:
        header = bytes([first, 127]) + struct.pack(">Q", length)
    return header + payload


async def read_ws_frame(reader: asyncio.StreamReader) -> tuple[int, bytes] | None:
    try:
        hdr = await reader.readexactly(2)
    except asyncio.IncompleteReadError:
        return None
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


async def websocket_accept(writer: asyncio.StreamWriter, key: str) -> None:
    accept = base64.b64encode(
        hashlib.sha1((key + WS_GUID.decode()).encode()).digest()
    ).decode()
    writer.write(
        (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
        ).encode()
    )
    await writer.drain()


def serve_static(path: str) -> tuple[int, dict, bytes]:
    if not os.path.isfile(path):
        return 404, {}, b"not found"
    with open(path, "rb") as f:
        data = f.read()
    ct = "application/octet-stream"
    if path.endswith(".html"):
        ct = "text/html; charset=utf-8"
    elif path.endswith(".js"):
        ct = "application/javascript; charset=utf-8"
    elif path.endswith(".css"):
        ct = "text/css; charset=utf-8"
    elif path.endswith(".json"):
        ct = "application/json"
    elif path.endswith(".svg"):
        ct = "image/svg+xml"
    elif path.endswith(".png"):
        ct = "image/png"
    elif path.endswith(".ico"):
        ct = "image/x-icon"
    elif path.endswith(".webmanifest") or path.endswith(".manifest"):
        ct = "application/manifest+json"
    return 200, {"Content-Type": ct, "Cache-Control": "public, max-age=60"}, data


async def serve(router: Router, host: str, port: int) -> asyncio.AbstractServer:
    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        remote = f"{peer[0]}:{peer[1]}" if peer else "?"
        keep_alive = True
        try:
            while keep_alive:
                try:
                    req = await asyncio.wait_for(read_request(reader), timeout=60.0)
                except asyncio.TimeoutError:
                    return
                if req is None:
                    return
                req.writer = writer
                req.remote = remote
                connection = req.headers.get("connection", "").lower()
                if connection == "close":
                    keep_alive = False
                elif connection == "keep-alive":
                    keep_alive = True
                if req.headers.get("upgrade", "").lower() == "websocket":
                    match = router.match_ws(req.path)
                    if not match:
                        writer.write(build_response(404, {"Connection": "close"}, b"ws route not found"))
                        await writer.drain()
                        return
                    handler, params = match
                    req.query.update(params)
                    await websocket_accept(writer, req.headers.get("sec-websocket-key", ""))
                    try:
                        await handler(req, reader, writer)
                    except (ConnectionError, asyncio.IncompleteReadError):
                        pass
                    return  # WS connection handled; don't loop
                if req.method == "OPTIONS":
                    writer.write(build_response(204, {"Connection": "keep-alive" if keep_alive else "close"}, b""))
                    await writer.drain()
                    continue
                gzip_ok = "gzip" in req.headers.get("accept-encoding", "")
                handler_body: tuple[int, dict, Any] | None = None
                match = router.match(req.method, req.path)
                if match:
                    handler, params = match
                    req.query.update(params)
                    try:
                        handler_body = await handler(req)
                    except Exception as exc:  # pragma: no cover - defensive
                        LOGGER.error("handler error", err=str(exc), tb=traceback.format_exc()[:500])
                        handler_body = 500, {}, {"error": str(exc)}
                else:
                    static_path = router.match_static(req.path)
                    if static_path:
                        handler_body = serve_static(static_path)
                    else:
                        handler_body = 404, {"Content-Type": "application/json"}, {"error": "not found", "path": req.path}
                status, hdrs, body = handler_body
                if isinstance(body, dict) or isinstance(body, list):
                    body = json.dumps(body, ensure_ascii=False).encode("utf-8")
                elif isinstance(body, str):
                    body = body.encode("utf-8")
                response_headers = {"Connection": "keep-alive" if keep_alive else "close"}
                response_headers.update(hdrs)
                try:
                    writer.write(build_response(status, response_headers, body, gzip_ok))
                    await writer.drain()
                except (ConnectionError, BrokenPipeError):
                    return
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    return await asyncio.start_server(handle, host, port)

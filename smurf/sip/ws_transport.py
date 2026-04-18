"""SIP-over-WebSocket transport (RFC 7118) for WebRTC softphones.

Handles both ``ws`` and ``wss`` schemes.  The WebSocket sub-protocol is
``sip``.  Messages are exchanged as text frames, one full SIP message per
frame.  We integrate with our generic dispatcher by re-using ``RemoteAddr``
keyed by ``ws:host:port`` so responses route back over the same socket.
"""

from __future__ import annotations

import asyncio
import ssl
from typing import Awaitable, Callable, Optional

import websockets
from websockets.asyncio.server import ServerConnection, serve

from ..core.log import get_logger
from .transport import RawHandler, RemoteAddr, Transport

log = get_logger("smurf.sip.ws")


class WSTransport(Transport):
    name = "ws"

    def __init__(self, on_message: RawHandler, host: str, port: int,
                 *, tls: ssl.SSLContext | None = None) -> None:
        super().__init__(on_message)
        self.host = host
        self.port = port
        self.tls = tls
        if tls is not None:
            self.name = "wss"
        self._server: websockets.asyncio.server.Server | None = None
        self._conns: dict[str, ServerConnection] = {}

    async def start(self) -> None:
        self._server = await serve(
            self._handler,
            self.host,
            self.port,
            ssl=self.tls,
            subprotocols=["sip"],
            ping_interval=30,
            ping_timeout=20,
            max_size=2**20,
        )
        log.info("%s transport listening on %s:%d", self.name.upper(), self.host, self.port)

    async def stop(self) -> None:
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()
            self._server = None

    async def _handler(self, ws: ServerConnection) -> None:
        peer = ws.remote_address or ("?", 0)
        host, port = peer[0], peer[1]
        remote = RemoteAddr(self.name, host, port)
        self._conns[remote.key()] = ws
        log.info("WebSocket SIP client connected: %s", remote)
        try:
            async for message in ws:
                if isinstance(message, str):
                    raw = message.encode("utf-8")
                else:
                    raw = message
                # Browsers sometimes send keepalive CRLFs.
                if not raw.strip():
                    continue
                try:
                    await self.on_message(raw, remote, self)
                except Exception:
                    log.exception("WS dispatch failed for %s", remote)
        except websockets.ConnectionClosed:
            pass
        finally:
            self._conns.pop(remote.key(), None)
            log.info("WebSocket SIP client disconnected: %s", remote)

    async def send(self, data: bytes, remote: RemoteAddr) -> None:
        ws = self._conns.get(remote.key())
        if ws is None:
            log.warning("No WS connection for %s — dropping %d bytes", remote, len(data))
            return
        try:
            await ws.send(data.decode("utf-8", errors="replace"))
        except websockets.ConnectionClosed:
            self._conns.pop(remote.key(), None)

    @property
    def local_address(self) -> tuple[str, int]:
        return (self.host, self.port)

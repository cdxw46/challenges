"""SIP message dispatcher: where every transport ends up.

The dispatcher exposes a single ``handle(raw, remote, transport)`` entry
point used by every transport.  It owns the transaction & dialog tables
and delegates application logic (REGISTER, INVITE, OPTIONS, BYE, ...) to
the PBX core through pluggable handlers.
"""

from __future__ import annotations

import asyncio
import time
from typing import Awaitable, Callable, Optional

from ..core.eventbus import BUS
from ..core.log import get_logger
from .dialog import DialogTable, make_branch, make_tag
from .message import (
    SipMessage,
    SipParseError,
    SipURI,
    canonical,
    make_response,
    parse_message,
    split_addr_uri,
)
from .transaction import (
    ClientTransaction,
    ServerTransaction,
    TransactionTable,
    tx_key,
)
from .transport import RemoteAddr, Transport

log = get_logger("smurf.sip.dispatcher")
RequestHandler = Callable[[SipMessage, RemoteAddr, Transport, "Dispatcher"], Awaitable[None]]
ResponseHandler = Callable[[SipMessage, RemoteAddr, Transport, "Dispatcher"], Awaitable[None]]


class Dispatcher:
    def __init__(self, *, user_agent: str = "SMURF/0.1") -> None:
        self.user_agent = user_agent
        self.transports: list[Transport] = []
        self.tx = TransactionTable()
        self.dialogs = DialogTable()
        self.request_handlers: dict[str, RequestHandler] = {}
        self.fallback_handler: Optional[RequestHandler] = None
        self.banned_ips: set[str] = set()
        self._gc_task: asyncio.Task | None = None
        self._failed_attempts: dict[str, list[float]] = {}

    def register_transport(self, t: Transport) -> None:
        self.transports.append(t)

    def on(self, method: str) -> Callable[[RequestHandler], RequestHandler]:
        def deco(fn: RequestHandler) -> RequestHandler:
            self.request_handlers[method.upper()] = fn
            return fn
        return deco

    async def start(self) -> None:
        for t in self.transports:
            await t.start()
        self._gc_task = asyncio.create_task(self._gc_loop())

    async def stop(self) -> None:
        if self._gc_task:
            self._gc_task.cancel()
        for t in self.transports:
            await t.stop()

    async def _gc_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(15)
                self.tx.gc()
            except asyncio.CancelledError:
                return

    # ------------------------------------------------------------------
    # Inbound dispatch
    # ------------------------------------------------------------------
    async def handle(self, raw: bytes, remote: RemoteAddr, transport: Transport) -> None:
        if not raw or raw == b"\r\n\r\n" or raw == b"\r\n":
            # Stream keep-alive — RFC 5626 §3.5.1.  Echo a single CRLF back.
            try:
                await transport.send(b"\r\n", remote)
            except Exception:
                pass
            return
        if remote.host in self.banned_ips:
            return
        try:
            msg = parse_message(raw)
        except SipParseError as exc:
            log.warning("Bad SIP message from %s: %s", remote, exc)
            return
        try:
            if msg.is_request:
                await self._handle_request(msg, remote, transport)
            else:
                await self._handle_response(msg, remote, transport)
        except Exception:
            log.exception("Dispatcher handler crashed (%s)", "request" if msg.is_request else "response")

    async def _handle_request(self, req: SipMessage, remote: RemoteAddr, transport: Transport) -> None:
        BUS.publish("sip.in.request", {
            "method": req.method,
            "from": remote.host,
            "transport": remote.transport,
        })
        # ACK is a special beast — no response, may match a pending INVITE server tx.
        if req.method == "ACK":
            BUS.publish("sip.in.ack", {"call_id": req.call_id})
            handler = self.request_handlers.get("ACK") or self.fallback_handler
            if handler:
                await handler(req, remote, transport, self)
            return
        # CANCEL has its own transaction matching rule (RFC 3261 §9.2).
        existing = self.tx.find_server(req)
        if existing and req.method != "CANCEL":
            if existing.absorb_retransmit():
                return
        if req.method == "CANCEL":
            handler = self.request_handlers.get("CANCEL") or self.fallback_handler
            if handler:
                await handler(req, remote, transport, self)
            return
        st = ServerTransaction(method=req.method, branch=req.branch(), request=req,
                               remote=remote, transport=transport)
        self.tx.add_server(st)
        # Send 100 Trying for INVITE at once (RFC 3261 §17.2.1).
        if req.method == "INVITE":
            trying = make_response(req, 100, "Trying", user_agent=self.user_agent)
            await st.respond(trying)
        handler = self.request_handlers.get(req.method) or self.fallback_handler
        if handler is None:
            resp = make_response(req, 405, "Method Not Allowed", user_agent=self.user_agent,
                                 extra=[("Allow", "INVITE,ACK,BYE,CANCEL,OPTIONS,REGISTER,SUBSCRIBE,NOTIFY,REFER,UPDATE,INFO,MESSAGE")])
            await st.respond(resp)
            return
        try:
            await handler(req, remote, transport, self)
        except Exception:
            log.exception("Handler for %s crashed", req.method)
            try:
                err = make_response(req, 500, "Server Internal Error", user_agent=self.user_agent)
                await st.respond(err)
            except Exception:
                pass

    async def _handle_response(self, resp: SipMessage, remote: RemoteAddr, transport: Transport) -> None:
        BUS.publish("sip.in.response", {"code": resp.status_code, "from": remote.host})
        ct = self.tx.find_client(resp)
        if ct is None:
            log.debug("Unmatched response %d %s", resp.status_code, resp.reason)
            return
        await ct.feed_response(resp)

    # ------------------------------------------------------------------
    # Outbound helpers
    # ------------------------------------------------------------------
    def transport_for(self, kind: str) -> Optional[Transport]:
        for t in self.transports:
            if t.name == kind:
                return t
        return None

    async def send_request(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                           on_response: Callable[[SipMessage], Awaitable[None]]) -> ClientTransaction:
        ct = ClientTransaction(method=req.method, branch=req.branch(), request=req,
                               remote=remote, transport=transport, on_response=on_response)
        self.tx.add_client(ct)
        await ct.start()
        return ct

    def server_tx_for(self, req: SipMessage) -> Optional[ServerTransaction]:
        return self.tx.find_server(req)

    # ------------------------------------------------------------------
    # Fail2ban-ish hooks
    # ------------------------------------------------------------------
    def record_auth_failure(self, ip: str, *, max_attempts: int, window: float, ban_seconds: float) -> bool:
        now = time.time()
        bucket = self._failed_attempts.setdefault(ip, [])
        bucket.append(now)
        bucket[:] = [t for t in bucket if now - t < window]
        if len(bucket) >= max_attempts:
            self.banned_ips.add(ip)
            BUS.publish("security.ban", {"ip": ip, "until": now + ban_seconds})
            asyncio.get_event_loop().call_later(ban_seconds, self._unban, ip)
            return True
        return False

    def _unban(self, ip: str) -> None:
        self.banned_ips.discard(ip)
        self._failed_attempts.pop(ip, None)
        BUS.publish("security.unban", {"ip": ip})

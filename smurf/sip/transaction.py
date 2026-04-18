"""SIP transaction layer (RFC 3261 §17).

Implements both client and server transactions for INVITE and non-INVITE
methods using asyncio timers.  Retransmissions follow §17.1.1 / §17.1.2
(T1=500ms, T2=4s, T4=5s) for unreliable transports, while reliable
transports (TCP/TLS/WS) skip retransmission per §17.2.4.

The transaction map is keyed by branch + method (RFC 3261 §17.2.3) so we
can match responses back to the right client transaction and absorb
retransmitted requests at the server side.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Awaitable, Callable, Optional

from ..core.log import get_logger
from .message import SipMessage
from .transport import RemoteAddr, Transport

log = get_logger("smurf.sip.tx")

T1 = 0.5
T2 = 4.0
T4 = 5.0
TIMER_B = 64 * T1  # INVITE client transaction timeout
TIMER_F = 64 * T1  # non-INVITE client transaction timeout
TIMER_H = 64 * T1  # wait for ACK at server side


class State(Enum):
    CALLING = "calling"
    PROCEEDING = "proceeding"
    COMPLETED = "completed"
    CONFIRMED = "confirmed"
    TERMINATED = "terminated"
    TRYING = "trying"


SendFn = Callable[[bytes, RemoteAddr], Awaitable[None]]
ResponseHandler = Callable[[SipMessage], Awaitable[None]]


def tx_key(method: str, branch: str, sent_by: str = "") -> str:
    return f"{method.upper()}|{branch}|{sent_by}"


@dataclass
class ClientTransaction:
    method: str
    branch: str
    request: SipMessage
    remote: RemoteAddr
    transport: Transport
    on_response: ResponseHandler
    state: State = State.CALLING
    last_response: Optional[SipMessage] = None
    timer: Optional[asyncio.TimerHandle] = None
    deadline: Optional[asyncio.TimerHandle] = None
    started: float = field(default_factory=time.time)
    _retx_interval: float = T1
    _retx_count: int = 0

    @property
    def reliable(self) -> bool:
        return self.remote.transport in ("tcp", "tls", "ws", "wss")

    async def start(self) -> None:
        await self.transport.send(self.request.to_bytes(), self.remote)
        loop = asyncio.get_running_loop()
        if not self.reliable:
            self.timer = loop.call_later(self._retx_interval, self._on_retransmit)
        timeout = TIMER_B if self.method == "INVITE" else TIMER_F
        self.deadline = loop.call_later(timeout, self._on_timeout)

    def _on_retransmit(self) -> None:
        if self.state in (State.CALLING, State.TRYING):
            self._retx_count += 1
            self._retx_interval = min(self._retx_interval * 2, T2)
            asyncio.create_task(self._retransmit())
            loop = asyncio.get_running_loop()
            self.timer = loop.call_later(self._retx_interval, self._on_retransmit)

    async def _retransmit(self) -> None:
        try:
            await self.transport.send(self.request.to_bytes(), self.remote)
        except Exception:
            log.exception("Client transaction retransmit failed")

    def _on_timeout(self) -> None:
        if self.state in (State.CALLING, State.TRYING, State.PROCEEDING):
            log.warning("Client transaction %s timed out (%s)", self.branch, self.method)
            self.state = State.TERMINATED
            asyncio.create_task(self._notify_timeout())

    async def _notify_timeout(self) -> None:
        fake = SipMessage(is_request=False, status_code=408, reason="Request Timeout")
        await self.on_response(fake)

    async def feed_response(self, msg: SipMessage) -> None:
        self.last_response = msg
        code = msg.status_code
        if code < 200:
            self.state = State.PROCEEDING
            await self.on_response(msg)
            return
        if self.timer:
            self.timer.cancel()
            self.timer = None
        if self.method == "INVITE":
            if code >= 300:
                # ACK must be sent for non-2xx final responses by the txn.
                ack = self._build_ack_for_final(msg)
                try:
                    await self.transport.send(ack.to_bytes(), self.remote)
                except Exception:
                    log.exception("Failed to send ACK for non-2xx")
            self.state = State.COMPLETED
            await self.on_response(msg)
            self.state = State.TERMINATED
        else:
            self.state = State.COMPLETED
            await self.on_response(msg)
            self.state = State.TERMINATED
        if self.deadline:
            self.deadline.cancel()
            self.deadline = None

    def _build_ack_for_final(self, resp: SipMessage) -> SipMessage:
        ack = SipMessage(
            is_request=True,
            method="ACK",
            request_uri=self.request.request_uri,
        )
        ack.headers.add("Via", self.request.first_via())
        ack.headers.add("From", self.request.headers.get("From", ""))
        # To header from the response (with its tag) per RFC 3261 §17.1.1.3.
        ack.headers.add("To", resp.headers.get("To", self.request.headers.get("To", "")))
        ack.headers.add("Call-ID", self.request.headers.get("Call-ID", ""))
        cseq_n, _ = self.request.cseq
        ack.headers.add("CSeq", f"{cseq_n} ACK")
        ack.headers.add("Max-Forwards", "70")
        ack.headers.add("Content-Length", "0")
        return ack


@dataclass
class ServerTransaction:
    method: str
    branch: str
    request: SipMessage
    remote: RemoteAddr
    transport: Transport
    state: State = State.TRYING
    last_response: Optional[SipMessage] = None
    timer: Optional[asyncio.TimerHandle] = None
    deadline: Optional[asyncio.TimerHandle] = None
    _retx_interval: float = T1

    @property
    def reliable(self) -> bool:
        return self.remote.transport in ("tcp", "tls", "ws", "wss")

    async def respond(self, msg: SipMessage) -> None:
        self.last_response = msg
        code = msg.status_code
        if code < 200:
            self.state = State.PROCEEDING
        elif self.method == "INVITE" and code >= 300:
            self.state = State.COMPLETED
            self._arm_retx_invite()
        elif self.method == "INVITE":
            self.state = State.TERMINATED  # 2xx UAS layer handles ACK
        else:
            self.state = State.COMPLETED
            if not self.reliable:
                loop = asyncio.get_running_loop()
                self.deadline = loop.call_later(T4, self._terminate)
            else:
                self.state = State.TERMINATED
        await self.transport.send(msg.to_bytes(), self.remote)

    def _arm_retx_invite(self) -> None:
        if self.reliable:
            return
        loop = asyncio.get_running_loop()
        self.timer = loop.call_later(self._retx_interval, self._retx_invite)
        self.deadline = loop.call_later(TIMER_H, self._terminate)

    def _retx_invite(self) -> None:
        if self.state == State.COMPLETED and self.last_response is not None:
            asyncio.create_task(self.transport.send(self.last_response.to_bytes(), self.remote))
            self._retx_interval = min(self._retx_interval * 2, T2)
            loop = asyncio.get_running_loop()
            self.timer = loop.call_later(self._retx_interval, self._retx_invite)

    def _terminate(self) -> None:
        self.state = State.TERMINATED
        if self.timer:
            self.timer.cancel()
        if self.deadline:
            self.deadline.cancel()

    def absorb_retransmit(self) -> bool:
        """Return True if we replied — i.e. nothing more to do."""

        if self.last_response is not None and self.state in (State.PROCEEDING, State.COMPLETED):
            asyncio.create_task(self.transport.send(self.last_response.to_bytes(), self.remote))
            return True
        return False


class TransactionTable:
    def __init__(self) -> None:
        self.client: dict[str, ClientTransaction] = {}
        self.server: dict[str, ServerTransaction] = {}

    def find_client(self, msg: SipMessage) -> Optional[ClientTransaction]:
        cseq_method = msg.cseq_method() or msg.method
        return self.client.get(tx_key(cseq_method, msg.branch()))

    def find_server(self, msg: SipMessage) -> Optional[ServerTransaction]:
        return self.server.get(tx_key(msg.method, msg.branch()))

    def add_client(self, tx: ClientTransaction) -> None:
        self.client[tx_key(tx.method, tx.branch)] = tx

    def add_server(self, tx: ServerTransaction) -> None:
        self.server[tx_key(tx.method, tx.branch)] = tx

    def gc(self) -> None:
        self.client = {k: v for k, v in self.client.items() if v.state != State.TERMINATED}
        self.server = {k: v for k, v in self.server.items() if v.state != State.TERMINATED}

"""Active call registry and CallLeg/CallSession primitives.

A *call leg* represents one signalling/RTP path with one party (UAC or UAS
side of one SIP dialog).  A *call session* binds two or more legs together
(one A-leg, one or more B-legs).  This module is consumed by the B2BUA.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from ..rtp.session import RTPSession
from ..sip.dialog import Dialog
from ..sip.message import SipMessage
from ..sip.transport import RemoteAddr, Transport


@dataclass
class CallLeg:
    leg_id: str
    role: str  # "A" or "B"
    transport: Transport
    remote: RemoteAddr
    dialog: Optional[Dialog] = None
    rtp: Any = None  # RTPSession or WebRTCEndpoint (duck-typed)
    extension: str = ""
    display: str = ""
    invite: Optional[SipMessage] = None
    server_tx: Any = None
    client_tx: Any = None
    answered: bool = False
    cancelled: bool = False
    on_hold: bool = False
    state: str = "init"  # init|trying|ringing|answered|ended
    notes: dict[str, Any] = field(default_factory=dict)

    def remote_uri(self) -> str:
        return self.dialog.remote_uri if self.dialog else ""


@dataclass
class CallSession:
    call_id: str
    a: CallLeg
    b: Optional[CallLeg] = None
    started_at: float = field(default_factory=time.time)
    answered_at: float = 0.0
    ended_at: float = 0.0
    record_path: Optional[str] = None
    relay: Any = None
    pickup_groups: set[str] = field(default_factory=set)
    direction: str = "internal"
    src_number: str = ""
    dst_number: str = ""
    cdr_id: int = 0
    notes: dict[str, Any] = field(default_factory=dict)


class CallRegistry:
    def __init__(self) -> None:
        self.sessions: dict[str, CallSession] = {}
        self.by_dialog: dict[str, CallSession] = {}
        self.parking: dict[str, CallSession] = {}
        self.lock = asyncio.Lock()

    def add(self, session: CallSession) -> None:
        self.sessions[session.call_id] = session
        if session.a.dialog:
            self.by_dialog[session.a.dialog.key()] = session
        if session.b and session.b.dialog:
            self.by_dialog[session.b.dialog.key()] = session

    def remove(self, session: CallSession) -> None:
        self.sessions.pop(session.call_id, None)
        if session.a.dialog:
            self.by_dialog.pop(session.a.dialog.key(), None)
        if session.b and session.b.dialog:
            self.by_dialog.pop(session.b.dialog.key(), None)

    def by_callid(self, call_id: str) -> Optional[CallSession]:
        return self.sessions.get(call_id)

    def find_by_dialog(self, msg: SipMessage) -> Optional[CallSession]:
        for s in self.sessions.values():
            for leg in (s.a, s.b):
                if not leg or not leg.dialog:
                    continue
                d = leg.dialog
                if d.call_id == msg.call_id and (
                    {msg.from_tag(), msg.to_tag()} == {d.local_tag, d.remote_tag}
                ):
                    return s
        return None

    def all_active(self) -> list[CallSession]:
        return list(self.sessions.values())


def make_leg_id() -> str:
    return secrets.token_hex(6)

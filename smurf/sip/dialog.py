"""SIP dialog state per RFC 3261 §12.

Tracks the local/remote tags, target URI, route set, CSeq counters and
contact for established dialogs so that subsequent in-dialog requests
(re-INVITE, BYE, REFER, INFO, NOTIFY, UPDATE) can be matched and routed
correctly.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from typing import Optional

from .message import SipMessage, split_addr_uri


def make_tag() -> str:
    return secrets.token_hex(6)


def make_call_id(domain: str = "smurf") -> str:
    return f"{secrets.token_hex(12)}@{domain}"


def make_branch() -> str:
    return f"z9hG4bK-{secrets.token_hex(8)}"


@dataclass
class Dialog:
    call_id: str
    local_tag: str
    remote_tag: str
    local_uri: str
    remote_uri: str
    remote_target: str
    route_set: list[str] = field(default_factory=list)
    local_cseq: int = 1
    remote_cseq: int = 0
    secure: bool = False
    local_contact: str = ""
    role: str = "uas"
    state: str = "early"  # early -> confirmed -> terminated
    # Bookkeeping
    extension: str = ""
    direction: str = "internal"

    def key(self) -> str:
        return f"{self.call_id}|{self.local_tag}|{self.remote_tag}"

    @classmethod
    def from_invite_uas(cls, req: SipMessage, local_tag: str, local_contact: str) -> "Dialog":
        from_h = req.headers.get("From", "")
        to_h = req.headers.get("To", "")
        _, from_uri, from_params = split_addr_uri(from_h)
        _, to_uri, _ = split_addr_uri(to_h)
        contact = req.headers.get("Contact", from_uri)
        _, contact_uri, _ = split_addr_uri(contact)
        rr = req.headers.get_all("Record-Route")
        return cls(
            call_id=req.call_id,
            local_tag=local_tag,
            remote_tag=from_params.get("tag", ""),
            local_uri=to_uri,
            remote_uri=from_uri,
            remote_target=contact_uri or from_uri,
            route_set=rr,  # As received order — UAS reverses when sending
            local_cseq=1,
            remote_cseq=req.cseq_number(),
            local_contact=local_contact,
            role="uas",
            state="confirmed",
        )

    @classmethod
    def from_invite_uac(cls, req: SipMessage, response: SipMessage, local_contact: str) -> "Dialog":
        to_h = response.headers.get("To", "")
        from_h = req.headers.get("From", "")
        _, to_uri, to_params = split_addr_uri(to_h)
        _, from_uri, from_params = split_addr_uri(from_h)
        contact = response.headers.get("Contact", to_uri)
        _, contact_uri, _ = split_addr_uri(contact)
        rr = list(reversed(response.headers.get_all("Record-Route")))
        return cls(
            call_id=req.call_id,
            local_tag=from_params.get("tag", ""),
            remote_tag=to_params.get("tag", ""),
            local_uri=from_uri,
            remote_uri=to_uri,
            remote_target=contact_uri or to_uri,
            route_set=rr,
            local_cseq=req.cseq_number() + 1,
            remote_cseq=0,
            local_contact=local_contact,
            role="uac",
            state="confirmed",
        )


class DialogTable:
    def __init__(self) -> None:
        self.dialogs: dict[str, Dialog] = {}

    def add(self, d: Dialog) -> None:
        self.dialogs[d.key()] = d

    def find(self, msg: SipMessage) -> Optional[Dialog]:
        call_id = msg.call_id
        from_tag = msg.from_tag()
        to_tag = msg.to_tag()
        # First try (call_id, local=to_tag, remote=from_tag) — UAS POV
        for tag_pair in ((to_tag, from_tag), (from_tag, to_tag)):
            key = f"{call_id}|{tag_pair[0]}|{tag_pair[1]}"
            d = self.dialogs.get(key)
            if d:
                return d
        return None

    def remove(self, d: Dialog) -> None:
        self.dialogs.pop(d.key(), None)

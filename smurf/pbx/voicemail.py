"""Voicemail support service: MWI NOTIFY + e-mail with WAV attachment."""

from __future__ import annotations

import asyncio
import email.utils
import smtplib
from email.message import EmailMessage
from pathlib import Path

from ..core import config
from ..core.eventbus import BUS
from ..core.log import get_logger
from ..sip.dialog import make_branch, make_call_id, make_tag
from ..sip.dispatcher import Dispatcher
from ..sip.message import SipMessage, SipURI
from ..sip.transport import RemoteAddr
from . import repo

log = get_logger("smurf.pbx.vm")


class VoicemailService:
    def __init__(self) -> None:
        self.dispatcher: Dispatcher | None = None
        BUS.subscribe("voicemail.received")  # ensure history captured

    async def email_voicemail(self, extension: str, file_path: str, caller: str, duration: int) -> None:
        ext_row = await repo.get_extension(extension)
        if not ext_row or not ext_row.get("email"):
            return
        host = config.get("smtp_host")
        if not host:
            log.info("Skipping voicemail email — no SMTP configured")
            return
        msg = EmailMessage()
        msg["From"] = config.get("smtp_from")
        msg["To"] = ext_row["email"]
        msg["Subject"] = f"Voicemail from {caller} ({duration}s)"
        msg["Date"] = email.utils.formatdate(localtime=True)
        msg.set_content(
            f"Hello,\n\nYou have a new voicemail from {caller} on extension {extension}.\n"
            f"Duration: {duration} seconds.\n"
        )
        try:
            data = Path(file_path).read_bytes()
            msg.add_attachment(data, maintype="audio", subtype="wav", filename=Path(file_path).name)
        except OSError:
            log.warning("Voicemail file missing: %s", file_path)
        try:
            await asyncio.to_thread(self._smtp_send, msg)
        except Exception:
            log.exception("Voicemail email send failed")

    def _smtp_send(self, msg: EmailMessage) -> None:
        host = config.get("smtp_host")
        port = int(config.get("smtp_port", 587))
        user = config.get("smtp_user", "")
        pwd = config.get("smtp_pass", "")
        with smtplib.SMTP(host, port, timeout=15) as s:
            try:
                s.starttls()
            except smtplib.SMTPException:
                pass
            if user:
                s.login(user, pwd)
            s.send_message(msg)

    async def notify_mwi(self, extension: str, dispatcher: Dispatcher) -> None:
        """Send a NOTIFY message-summary to all active registrations of ``extension``."""

        regs = await repo.active_registrations(extension)
        if not regs:
            return
        unread = await repo.vm_unread_count(extension)
        body = (
            f"Messages-Waiting: {'yes' if unread else 'no'}\r\n"
            f"Message-Account: sip:{extension}@{config.get('domain')}\r\n"
            f"Voice-Message: {unread}/0 (0/0)\r\n"
        ).encode()
        for reg in regs:
            await self._send_notify_unsolicited(extension, reg, body, dispatcher)

    async def _send_notify_unsolicited(self, extension: str, reg: dict, body: bytes,
                                       dispatcher: Dispatcher) -> None:
        kind = reg["transport"]
        transport = dispatcher.transport_for(kind) or dispatcher.transport_for("udp")
        if transport is None:
            return
        contact_uri = SipURI.parse(reg["contact"])
        host = contact_uri.host or reg["source_ip"]
        port = contact_uri.port or reg["source_port"] or (5061 if kind == "tls" else 5060)
        remote = RemoteAddr(kind, host, int(port))

        notify = SipMessage(is_request=True, method="NOTIFY", request_uri=str(contact_uri))
        local_addr = transport.local_address
        local_ip = config.get("external_ip") or config.get("domain") or local_addr[0]
        notify.headers.add("Via", f"SIP/2.0/{kind.upper()} {local_ip}:{local_addr[1]};branch={make_branch()};rport")
        notify.headers.add("Max-Forwards", "70")
        notify.headers.add("From", f"<sip:smurf@{config.get('domain')}>;tag={make_tag()}")
        notify.headers.add("To", f"<sip:{extension}@{config.get('domain')}>")
        notify.headers.add("Call-ID", make_call_id(config.get("domain", "smurf")))
        notify.headers.add("CSeq", "1 NOTIFY")
        notify.headers.add("Event", "message-summary")
        notify.headers.add("Subscription-State", "active;expires=3600")
        notify.headers.add("Content-Type", "application/simple-message-summary")
        notify.body = body

        async def on_resp(_: SipMessage) -> None:
            return

        try:
            await dispatcher.send_request(notify, remote, transport, on_response=on_resp)
        except Exception:
            log.exception("MWI NOTIFY send failed")


async def voicemail_email_listener(svc: VoicemailService) -> None:
    """Background task — wait for ``voicemail.received`` events and email."""

    sub = BUS.subscribe("voicemail.received")
    while True:
        ev = await sub.get()
        try:
            await svc.email_voicemail(
                ev.payload["extension"], ev.payload["file"],
                ev.payload.get("caller", ""), ev.payload.get("duration", 0),
            )
        except Exception:
            log.exception("VM email listener loop")

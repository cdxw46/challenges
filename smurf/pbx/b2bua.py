"""B2BUA — the heart of SMURF.

A Back-to-Back User Agent terminates the incoming call (A-leg), creates a
new outgoing call towards the destination (B-leg) and bridges their RTP
streams.  Unlike a stateless proxy, the B2BUA is in full control of both
dialogs, which is what enables PBX features such as transfer, hold,
recording, IVR, voicemail and conference.

Public surface is ``B2BUA.attach(dispatcher)`` plus the request handlers
it installs (``INVITE``, ``ACK``, ``BYE``, ``CANCEL``, ``OPTIONS``,
``INFO``, ``REFER``, ``MESSAGE``, ``SUBSCRIBE``, ``NOTIFY``, ``UPDATE``).
"""

from __future__ import annotations

import asyncio
import secrets
import time
from pathlib import Path
from typing import Any, Optional

from ..core import config
from ..core.eventbus import BUS
from ..core.log import get_logger
from ..rtp import codecs as rtpcodecs
from ..rtp.session import RTPRelay, RTPSession
from ..sip import sdp as sdp_mod
from ..sip.dialog import Dialog, make_branch, make_call_id, make_tag
from ..sip.dispatcher import Dispatcher
from ..sip.message import (
    Headers,
    SipMessage,
    SipURI,
    canonical,
    make_response,
    parse_message,
    split_addr_uri,
)
from ..sip.transaction import ClientTransaction, ServerTransaction
from ..sip.transport import RemoteAddr, Transport
from . import dialplan, media_apps, repo
from .calls import CallLeg, CallRegistry, CallSession, make_leg_id
from .conference import ConferenceManager
from .voicemail import VoicemailService
from .webrtc_gateway import WebRTCBridge, is_webrtc_offer

log = get_logger("smurf.pbx.b2bua")
REGISTRY = CallRegistry()


def _our_codecs() -> list[str]:
    return [c for c in config.get("default_codec_order", ["PCMU", "PCMA"]) if c.upper() in rtpcodecs.SPECS]


def _negotiate(offer_body: bytes) -> tuple[str, int, str, int | None] | None:
    """Return (codec_name, remote_rtp_port, remote_ip, dtmf_pt) or None."""

    if not offer_body:
        return None
    try:
        offer = sdp_mod.parse(offer_body)
    except Exception:
        return None
    pick = sdp_mod.negotiate(offer, _our_codecs())
    if pick is None:
        return None
    codec, dtmf_pt = pick
    audio = next((m for m in offer.media if m.media == "audio"), None)
    if audio is None:
        return None
    remote_ip = offer.conn_addr or "0.0.0.0"
    return codec.name, audio.port, remote_ip, dtmf_pt


def _build_answer_sdp(local_ip: str, local_port: int, codec_name: str,
                      *, dtmf_pt: int | None = 101) -> bytes:
    spec = rtpcodecs.SPECS.get(codec_name.upper())
    if spec is None:
        spec = rtpcodecs.CodecSpec(0, codec_name.upper(), 8000)
    media = sdp_mod.MediaDescription(
        media="audio", port=local_port, proto="RTP/AVP",
        codecs=[sdp_mod.CodecInfo(pt=spec.pt, name=spec.name, rate=spec.rate)],
        direction="sendrecv",
        ptime=20,
        dtmf_pt=dtmf_pt,
    )
    if dtmf_pt is not None:
        media.codecs.append(sdp_mod.CodecInfo(pt=dtmf_pt, name="telephone-event", rate=8000, fmtp="0-16"))
    return sdp_mod.build(
        sess_id=int(time.time()), sess_version=1, ip=local_ip, media=[media]
    )


def _build_offer_sdp(local_ip: str, local_port: int, codec_pref: list[str],
                     *, dtmf_pt: int | None = 101) -> bytes:
    media_codecs = []
    for n in codec_pref:
        spec = rtpcodecs.SPECS.get(n.upper())
        if spec is None:
            continue
        media_codecs.append(sdp_mod.CodecInfo(pt=spec.pt, name=spec.name, rate=spec.rate))
    if dtmf_pt is not None:
        media_codecs.append(sdp_mod.CodecInfo(pt=dtmf_pt, name="telephone-event", rate=8000, fmtp="0-16"))
    media = sdp_mod.MediaDescription(
        media="audio", port=local_port, proto="RTP/AVP",
        codecs=media_codecs, direction="sendrecv", ptime=20, dtmf_pt=dtmf_pt,
    )
    return sdp_mod.build(
        sess_id=int(time.time()), sess_version=1, ip=local_ip, media=[media]
    )


def _local_contact(transport: Transport, ext_or_user: str) -> str:
    host, port = transport.local_address
    proto = transport.name
    if not host or host == "0.0.0.0":
        host = config.get("external_ip") or config.get("domain")
    if proto == "udp":
        return f"<sip:{ext_or_user}@{host}:{port}>"
    if proto == "tcp":
        return f"<sip:{ext_or_user}@{host}:{port};transport=tcp>"
    if proto in ("ws", "wss"):
        return f"<sip:{ext_or_user}@{host}:{port};transport={proto}>"
    if proto == "tls":
        return f"<sips:{ext_or_user}@{host}:{port};transport=tls>"
    return f"<sip:{ext_or_user}@{host}:{port}>"


def _our_external_ip(remote_host: str) -> str:
    """Return the IP we advertise in SDP/Contact for the given peer."""

    if remote_host in ("127.0.0.1", "::1"):
        return "127.0.0.1"
    return str(config.get("external_ip") or config.get("domain") or remote_host)


class B2BUA:
    def __init__(self, *, conference: ConferenceManager, voicemail: VoicemailService) -> None:
        self.conference = conference
        self.voicemail = voicemail
        self.dispatcher: Optional[Dispatcher] = None

    def attach(self, dispatcher: Dispatcher) -> None:
        self.dispatcher = dispatcher
        dispatcher.on("INVITE")(self.on_invite)
        dispatcher.on("ACK")(self.on_ack)
        dispatcher.on("BYE")(self.on_bye)
        dispatcher.on("CANCEL")(self.on_cancel)
        dispatcher.on("OPTIONS")(self.on_options)
        dispatcher.on("INFO")(self.on_info)
        dispatcher.on("REFER")(self.on_refer)
        dispatcher.on("MESSAGE")(self.on_message_method)
        dispatcher.on("SUBSCRIBE")(self.on_subscribe)
        dispatcher.on("NOTIFY")(self.on_notify)
        dispatcher.on("UPDATE")(self.on_update)
        dispatcher.on("PRACK")(self.on_prack)

    # ------------------------------------------------------------------
    # OPTIONS — keep-alive used by phones
    # ------------------------------------------------------------------
    async def on_options(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                         dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        resp = make_response(req, 200, "OK", to_tag=make_tag(),
                             user_agent=dispatcher.user_agent,
                             extra=[
                                 ("Allow", "INVITE,ACK,BYE,CANCEL,OPTIONS,REGISTER,SUBSCRIBE,NOTIFY,REFER,UPDATE,INFO,MESSAGE,PRACK"),
                                 ("Accept", "application/sdp"),
                                 ("Supported", "replaces, timer"),
                             ])
        await st.respond(resp)

    # ------------------------------------------------------------------
    # MESSAGE (RFC 3428) — used for chat-over-SIP
    # ------------------------------------------------------------------
    async def on_message_method(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                                dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        body = req.body.decode("utf-8", errors="replace")
        from_h = req.headers.get("From", "")
        _, from_uri, _ = split_addr_uri(from_h)
        to_h = req.headers.get("To", "")
        _, to_uri, _ = split_addr_uri(to_h)
        sender = SipURI.parse(from_uri).user
        recipient = SipURI.parse(to_uri).user
        if sender and recipient:
            await repo.chat_send(sender, recipient, body)
            BUS.publish("chat.message", {"from": sender, "to": recipient, "body": body})
        await st.respond(make_response(req, 200, "OK", to_tag=make_tag(), user_agent=dispatcher.user_agent))

    # ------------------------------------------------------------------
    # SUBSCRIBE / NOTIFY (RFC 6665) — basic MWI + presence support
    # ------------------------------------------------------------------
    async def on_subscribe(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                           dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        event = req.headers.get("Event", "")
        await st.respond(make_response(req, 200, "OK", to_tag=make_tag(),
                                       user_agent=dispatcher.user_agent,
                                       extra=[("Expires", req.headers.get("Expires", "3600"))]))
        # Send NOTIFY immediately — for message-summary we report unread VM count.
        if event.startswith("message-summary"):
            from_h = req.headers.get("From", "")
            _, from_uri, _ = split_addr_uri(from_h)
            ext = SipURI.parse(from_uri).user
            unread = await repo.vm_unread_count(ext)
            new = unread
            old = 0
            body = (
                f"Messages-Waiting: {'yes' if new else 'no'}\r\n"
                f"Message-Account: sip:{ext}@{config.get('domain')}\r\n"
                f"Voice-Message: {new}/{old} (0/0)\r\n"
            ).encode()
            await self._send_notify(req, remote, transport, "message-summary",
                                    body, "application/simple-message-summary")

    async def on_notify(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                        dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 200, "OK", to_tag=make_tag(),
                                           user_agent=dispatcher.user_agent))

    async def _send_notify(self, in_req: SipMessage, remote: RemoteAddr, transport: Transport,
                           event: str, body: bytes, content_type: str) -> None:
        notify = SipMessage(is_request=True, method="NOTIFY",
                            request_uri=in_req.headers.get("Contact", "") or "")
        if not notify.request_uri:
            from_h = in_req.headers.get("From", "")
            _, from_uri, _ = split_addr_uri(from_h)
            notify.request_uri = from_uri
        from_h = in_req.headers.get("To", "") + ";tag=" + make_tag()
        notify.headers.add("Via", f"SIP/2.0/{remote.transport.upper()} "
                                  f"{transport.local_address[0]}:{transport.local_address[1]};branch={make_branch()}")
        notify.headers.add("Max-Forwards", "70")
        notify.headers.add("From", from_h)
        notify.headers.add("To", in_req.headers.get("From", ""))
        notify.headers.add("Call-ID", make_call_id(config.get("domain", "smurf")))
        notify.headers.add("CSeq", "1 NOTIFY")
        notify.headers.add("Event", event)
        notify.headers.add("Subscription-State", "active;expires=3600")
        notify.headers.add("Contact", _local_contact(transport, "smurf"))
        notify.headers.add("Content-Type", content_type)
        notify.body = body
        try:
            await transport.send(notify.to_bytes(), remote)
        except Exception:
            log.exception("NOTIFY send failed")

    # ------------------------------------------------------------------
    # PRACK / UPDATE / INFO — basic 200 OK behaviours
    # ------------------------------------------------------------------
    async def on_prack(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                       dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 200, "OK", user_agent=dispatcher.user_agent))

    async def on_update(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                        dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 200, "OK", user_agent=dispatcher.user_agent))

    async def on_info(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                      dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 200, "OK", user_agent=dispatcher.user_agent))
        # SIP INFO DTMF (some phones)
        ctype = req.headers.get("Content-Type", "")
        if "dtmf" in ctype.lower():
            session = REGISTRY.find_by_dialog(req)
            if session and session.a.rtp:
                # We don't have to do anything with it; bridge already passes audio.
                pass

    # ------------------------------------------------------------------
    # REFER (blind / attended transfer)
    # ------------------------------------------------------------------
    async def on_refer(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                       dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        await st.respond(make_response(req, 202, "Accepted", user_agent=dispatcher.user_agent))
        refer_to = req.headers.get("Refer-To", "")
        _, refer_uri, _ = split_addr_uri(refer_to)
        target = SipURI.parse(refer_uri).user
        session = REGISTRY.find_by_dialog(req)
        if not session:
            return
        BUS.publish("call.transfer", {"call_id": session.call_id, "target": target})
        # Bridge-aware blind transfer: tear down current B-leg, dial new target.
        await self._blind_transfer(session, target)

    async def _blind_transfer(self, session: CallSession, target: str) -> None:
        # End B-leg cleanly
        if session.b:
            await self._send_bye(session.b)
        # Re-route from A-leg to target
        resolved = await dialplan.resolve(target, direction="outbound")
        if not resolved:
            await self._send_bye(session.a)
            return
        await self._dispatch_application(session, resolved)

    # ------------------------------------------------------------------
    # ACK
    # ------------------------------------------------------------------
    async def on_ack(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                     dispatcher: Dispatcher) -> None:
        session = REGISTRY.find_by_dialog(req)
        if not session:
            return
        # Confirm dialog state if needed
        if session.a.dialog and session.a.dialog.state == "early":
            session.a.dialog.state = "confirmed"
        BUS.publish("call.confirmed", {"call_id": session.call_id})

    # ------------------------------------------------------------------
    # CANCEL
    # ------------------------------------------------------------------
    async def on_cancel(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                        dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 200, "OK", user_agent=dispatcher.user_agent))
        session = None
        for s in REGISTRY.all_active():
            if s.a.invite and s.a.invite.call_id == req.call_id and s.a.invite.branch() == req.branch():
                session = s
                break
        if session is None:
            return
        BUS.publish("call.cancelled", {"call_id": session.call_id})
        # Send 487 to A-leg INVITE
        if session.a.server_tx:
            try:
                resp = make_response(session.a.invite, 487, "Request Terminated",
                                     to_tag=session.a.dialog.local_tag if session.a.dialog else make_tag(),
                                     user_agent=dispatcher.user_agent)
                await session.a.server_tx.respond(resp)
            except Exception:
                log.exception("Failed to send 487 on CANCEL")
        # Tear down B-leg if any
        if session.b:
            await self._send_cancel_or_bye(session.b)
        await self._cleanup_session(session, hangup_cause="CANCELLED")

    # ------------------------------------------------------------------
    # BYE
    # ------------------------------------------------------------------
    async def on_bye(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                     dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        session = REGISTRY.find_by_dialog(req)
        if st:
            if session is None:
                await st.respond(make_response(req, 481, "Call/Transaction Does Not Exist",
                                               user_agent=dispatcher.user_agent))
                return
            await st.respond(make_response(req, 200, "OK", user_agent=dispatcher.user_agent))
        if session is None:
            return
        BUS.publish("call.ended", {"call_id": session.call_id, "by": "remote"})
        # Forward BYE to the other leg
        other = session.b if (session.a.dialog and session.a.dialog.call_id == req.call_id and
                              session.a.dialog.local_tag in (req.to_tag(), req.from_tag())) else session.a
        # Simpler: identify leg by dialog tag membership
        other = self._opposite_leg(session, req)
        if other:
            await self._send_bye(other)
        await self._cleanup_session(session, hangup_cause="NORMAL_CLEARING")

    def _opposite_leg(self, session: CallSession, req: SipMessage) -> Optional[CallLeg]:
        for leg in (session.a, session.b):
            if leg is None or leg.dialog is None:
                continue
            tags = {leg.dialog.local_tag, leg.dialog.remote_tag}
            req_tags = {req.from_tag(), req.to_tag()}
            if tags == req_tags:
                # This is the leg the BYE arrived on -> opposite is the other.
                return session.b if leg is session.a else session.a
        return None

    async def _send_bye(self, leg: CallLeg) -> None:
        if not leg.dialog:
            return
        bye = self._in_dialog_request("BYE", leg)
        try:
            await self.dispatcher.send_request(  # type: ignore[union-attr]
                bye, leg.remote, leg.transport, on_response=self._noop_response,
            )
        except Exception:
            log.exception("BYE send failed")

    async def _send_cancel_or_bye(self, leg: CallLeg) -> None:
        if leg.answered and leg.dialog:
            await self._send_bye(leg)
            return
        # CANCEL only if the original INVITE has not yet received a final response
        if leg.client_tx is not None:
            inv = leg.client_tx.request
            cancel = SipMessage(is_request=True, method="CANCEL", request_uri=inv.request_uri)
            cancel.headers.add("Via", inv.first_via())
            cancel.headers.add("From", inv.headers.get("From", ""))
            cancel.headers.add("To", inv.headers.get("To", ""))
            cancel.headers.add("Call-ID", inv.headers.get("Call-ID", ""))
            cseq_n = inv.cseq_number()
            cancel.headers.add("CSeq", f"{cseq_n} CANCEL")
            cancel.headers.add("Max-Forwards", "70")
            cancel.headers.add("Content-Length", "0")
            try:
                await self.dispatcher.send_request(  # type: ignore[union-attr]
                    cancel, leg.remote, leg.transport, on_response=self._noop_response,
                )
            except Exception:
                log.exception("CANCEL send failed")

    async def _noop_response(self, msg: SipMessage) -> None:
        return

    def _in_dialog_request(self, method: str, leg: CallLeg) -> SipMessage:
        d = leg.dialog
        assert d is not None
        req = SipMessage(is_request=True, method=method, request_uri=d.remote_target)
        host, port = leg.transport.local_address
        if not host or host == "0.0.0.0":
            host = _our_external_ip(leg.remote.host)
        req.headers.add(
            "Via",
            f"SIP/2.0/{leg.remote.transport.upper()} {host}:{port};branch={make_branch()};rport",
        )
        req.headers.add("Max-Forwards", "70")
        req.headers.add("From", f"<{d.local_uri}>;tag={d.local_tag}")
        req.headers.add("To", f"<{d.remote_uri}>;tag={d.remote_tag}")
        req.headers.add("Call-ID", d.call_id)
        req.headers.add("CSeq", f"{d.local_cseq} {method}")
        d.local_cseq += 1
        if d.route_set:
            for r in d.route_set:
                req.headers.add("Route", r)
        req.headers.add("Contact", d.local_contact or _local_contact(leg.transport, d.local_uri.split(":", 1)[-1].split("@")[0]))
        req.headers.add("User-Agent", "SMURF/0.1")
        req.headers.add("Content-Length", "0")
        return req

    # ------------------------------------------------------------------
    # INVITE — main entry point for new calls
    # ------------------------------------------------------------------
    async def on_invite(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                        dispatcher: Dispatcher) -> None:
        # Re-INVITE within an established dialog: identified by To-tag presence.
        # We must NOT re-authenticate inside an established dialog (RFC 3261 §22.1).
        if req.to_tag():
            await self._handle_reinvite(req, remote, transport, dispatcher)
            return
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        # Identify caller / callee
        from_h = req.headers.get("From", "")
        to_h = req.headers.get("To", "")
        _, from_uri, from_params = split_addr_uri(from_h)
        _, to_uri, _ = split_addr_uri(to_h)
        caller_uri = SipURI.parse(from_uri)
        callee_uri = SipURI.parse(req.request_uri or to_uri)
        src_number = caller_uri.user or "anonymous"
        dst_number = callee_uri.user or ""
        # Authenticate caller (only when caller pretends to be a local extension)
        ext_row = await repo.get_extension(src_number)
        if ext_row is not None:
            ok = await self._authenticate(req, remote, transport, dispatcher, ext_row, st)
            if not ok:
                return
        else:
            # External caller — accept (DID handling)
            pass

        BUS.publish("call.new", {
            "call_id": req.call_id, "src": src_number, "dst": dst_number,
            "transport": remote.transport, "ip": remote.host,
        })
        # Build A-leg
        local_tag = make_tag()
        a_dialog = Dialog.from_invite_uas(req, local_tag,
                                          local_contact=_local_contact(transport, dst_number or "smurf"))
        a_dialog.extension = src_number
        a_leg = CallLeg(
            leg_id=make_leg_id(), role="A", transport=transport, remote=remote,
            dialog=a_dialog, extension=src_number, display=src_number,
            invite=req, server_tx=st,
        )
        # If the offer is WebRTC (DTLS-SRTP), terminate it through the
        # WebRTC bridge, otherwise open a plain RTP session.
        if is_webrtc_offer(req.body):
            bridge = WebRTCBridge()
            try:
                answer_sdp, ep = await bridge.handle_offer(req.body.decode("utf-8", "replace"))
            except Exception:
                log.exception("WebRTC offer handling failed")
                await st.respond(make_response(req, 488, "Not Acceptable Here",
                                               user_agent=dispatcher.user_agent, to_tag=local_tag))
                return
            a_leg.rtp = ep
            a_leg.notes = {"webrtc": True, "webrtc_answer_sdp": answer_sdp, "webrtc_bridge": bridge}
        else:
            neg = _negotiate(req.body)
            if neg is None:
                await st.respond(make_response(req, 488, "Not Acceptable Here",
                                               user_agent=dispatcher.user_agent,
                                               to_tag=local_tag))
                return
            a_codec, a_rport, a_rip, a_dtmf_pt = neg
            a_rtp = RTPSession(codec_name=a_codec, dtmf_pt=a_dtmf_pt or 101)
            await a_rtp.open()
            a_rtp.set_remote(a_rip, a_rport)
            a_leg.rtp = a_rtp

        cdr_id = await repo.cdr_open(
            call_id=req.call_id, direction="inbound" if ext_row is None else "internal",
            src=src_number, dst=dst_number, src_name=caller_uri.user or "",
            src_ip=remote.host,
        )
        session = CallSession(
            call_id=req.call_id, a=a_leg, started_at=time.time(),
            direction="inbound" if ext_row is None else "internal",
            src_number=src_number, dst_number=dst_number, cdr_id=cdr_id,
        )
        REGISTRY.add(session)

        # Send 180 Ringing immediately to give feedback.
        ringing = make_response(req, 180, "Ringing", to_tag=local_tag,
                                user_agent=dispatcher.user_agent)
        ringing.headers.add("Contact", a_dialog.local_contact)
        await st.respond(ringing)

        # Resolve destination through the dial plan and dispatch the right app.
        resolved = await dialplan.resolve(dst_number, direction="outbound")
        if resolved is None:
            await self._answer_with_announcement(session, "404", final_status=(404, "Not Found"))
            return
        await self._dispatch_application(session, resolved)

    async def _authenticate(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                            dispatcher: Dispatcher, ext_row: dict, st: ServerTransaction) -> bool:
        from ..sip import auth
        secret_for_nonces = config.get("jwt_secret")
        auth_h = req.headers.get("Proxy-Authorization") or req.headers.get("Authorization")
        creds = auth.DigestCredentials.parse(auth_h) if auth_h else None
        if creds is None or not auth.nonce_valid(secret_for_nonces, creds.nonce):
            nonce = auth.make_nonce(secret_for_nonces)
            chal = auth.build_challenge(config.get("domain", "smurf"), nonce)
            resp = make_response(req, 407, "Proxy Authentication Required",
                                 to_tag=make_tag(),
                                 user_agent=dispatcher.user_agent,
                                 extra=[("Proxy-Authenticate", chal)])
            await st.respond(resp)
            return False
        if not auth.verify(req.method, ext_row["secret"], creds):
            await st.respond(make_response(req, 403, "Forbidden", user_agent=dispatcher.user_agent))
            f2b = config.all_settings()
            dispatcher.record_auth_failure(
                remote.host,
                max_attempts=int(f2b.get("fail2ban_max_attempts", 8)),
                window=float(f2b.get("fail2ban_window_seconds", 60)),
                ban_seconds=float(f2b.get("fail2ban_ban_seconds", 600)),
            )
            return False
        return True

    # ------------------------------------------------------------------
    # Application dispatcher
    # ------------------------------------------------------------------
    async def _dispatch_application(self, session: CallSession, resolved) -> None:
        action = resolved.action
        target = resolved.target
        try:
            if action == "extension":
                await self._app_dial_extension(session, target)
            elif action == "ring_group":
                await self._app_ring_group(session, target)
            elif action == "queue":
                await self._app_queue(session, target)
            elif action == "ivr":
                await self._app_ivr(session, target)
            elif action == "voicemail-self":
                await self._app_voicemail_self(session)
            elif action == "voicemail-menu":
                await self._app_voicemail_menu(session)
            elif action == "voicemail":
                await self._app_voicemail(session, target)
            elif action == "echo":
                await self._app_echo(session)
            elif action == "conference":
                await self._app_conference(session, target)
            elif action == "parking":
                await self._app_parking(session, target)
            elif action == "parking-retrieve":
                await self._app_parking_retrieve(session, target)
            elif action == "trunk":
                await self._app_trunk_dial(session, target, resolved.rewritten_number)
            elif action == "hangup":
                await self._answer_with_announcement(session, "hangup", final_status=(486, "Busy Here"))
            else:
                await self._answer_with_announcement(session, action, final_status=(404, "Not Found"))
        except Exception:
            log.exception("Application %s failed", action)
            await self._cleanup_session(session, hangup_cause="APPLICATION_FAILURE")

    # ------------------------------------------------------------------
    # Apps: extension dial (B-leg)
    # ------------------------------------------------------------------
    async def _app_dial_extension(self, session: CallSession, ext_number: str) -> None:
        regs = await repo.active_registrations(ext_number)
        ext_row = await repo.get_extension(ext_number)
        if not regs or not ext_row:
            BUS.publish("call.no_target", {"call_id": session.call_id, "ext": ext_number})
            await self._maybe_voicemail_or_announce(session, ext_number, "no_registration")
            return
        if ext_row.get("do_not_disturb"):
            await self._maybe_voicemail_or_announce(session, ext_number, "dnd")
            return
        # Try first contact (in real-life a forking proxy would parallel-fork).
        for reg in regs:
            ok = await self._dial_b_leg(session, ext_number, reg)
            if ok:
                return
        await self._maybe_voicemail_or_announce(session, ext_number, "no_answer")

    async def _dial_b_leg(self, session: CallSession, dest_user: str, reg: dict, *,
                          ring_timeout: float = 30.0) -> bool:
        assert self.dispatcher is not None
        contact_uri = SipURI.parse(reg["contact"])
        kind = reg["transport"]
        transport = self.dispatcher.transport_for(kind) or self.dispatcher.transport_for("udp")
        if transport is None:
            return False
        if kind in ("ws", "wss"):
            host = reg["source_ip"]
            port = reg["source_port"]
        else:
            host = contact_uri.host or reg["source_ip"]
            port = contact_uri.port or reg["source_port"] or (5061 if kind == "tls" else 5060)
        remote = RemoteAddr(kind, host, int(port))
        local_ip_for_phone = _our_external_ip(host)
        # Build the B-leg media endpoint.  Browsers (registered over WS/WSS)
        # need DTLS-SRTP, so we route them through the WebRTC bridge.  All
        # other phones get a normal RTP session.
        webrtc_b = kind in ("ws", "wss")
        b_bridge: WebRTCBridge | None = None
        if webrtc_b:
            b_bridge = WebRTCBridge()
            offer_sdp_str, b_rtp = await b_bridge.make_offer_for_callee()
            offer_sdp = offer_sdp_str.encode()
        else:
            b_rtp = RTPSession(
                codec_name=session.a.rtp.codec_name if session.a.rtp else "PCMU",
                dtmf_pt=101,
            )
            await b_rtp.open()
            offer_sdp = _build_offer_sdp(local_ip_for_phone, b_rtp.local_port, _our_codecs())
        # Compose INVITE
        call_id = make_call_id(config.get("domain", "smurf"))
        from_tag = make_tag()
        local_user = session.src_number or "smurf"
        local_uri_str = f"sip:{local_user}@{config.get('domain')}"
        # Build a target URI that is actually routable.  For WS/WSS, the Contact
        # uses ``xyz.invalid`` placeholders — we replace host/port with the real
        # source address recorded at registration time.
        if kind in ("ws", "wss"):
            target_uri = SipURI(scheme=contact_uri.scheme, user=contact_uri.user or dest_user,
                                host=host, port=int(port),
                                parameters={"transport": kind})
        else:
            target_uri = contact_uri
            if not target_uri.host or target_uri.host.endswith(".invalid"):
                target_uri = SipURI(scheme=target_uri.scheme, user=target_uri.user or dest_user,
                                    host=host, port=int(port))
        target_uri_str = str(target_uri)
        invite = SipMessage(is_request=True, method="INVITE", request_uri=target_uri_str)
        local_addr = transport.local_address
        invite.headers.add("Via", f"SIP/2.0/{kind.upper()} "
                                  f"{local_ip_for_phone}:{local_addr[1]};branch={make_branch()};rport")
        invite.headers.add("Max-Forwards", "70")
        invite.headers.add("From", f"\"{session.src_number}\" <{local_uri_str}>;tag={from_tag}")
        invite.headers.add("To", f"<sip:{dest_user}@{host}>")
        invite.headers.add("Call-ID", call_id)
        invite.headers.add("CSeq", "1 INVITE")
        invite.headers.add("Contact", _local_contact(transport, local_user))
        invite.headers.add("User-Agent", "SMURF/0.1")
        invite.headers.add("Allow", "INVITE,ACK,BYE,CANCEL,OPTIONS,REFER,UPDATE,INFO,MESSAGE,PRACK,NOTIFY")
        invite.headers.add("Supported", "replaces, timer")
        invite.headers.add("Content-Type", "application/sdp")
        invite.body = offer_sdp

        b_leg = CallLeg(
            leg_id=make_leg_id(), role="B", transport=transport, remote=remote,
            extension=dest_user, display=dest_user, invite=invite, rtp=b_rtp,
        )
        if webrtc_b:
            b_leg.notes = {"webrtc": True, "webrtc_bridge": b_bridge}
        session.b = b_leg
        REGISTRY.add(session)  # update by_dialog index later when dialog is built
        BUS.publish("call.dialing", {"call_id": session.call_id, "dest": dest_user, "via": kind})

        result_event = asyncio.Event()
        result: dict[str, Any] = {"answered": False, "code": 0}

        async def on_response(resp: SipMessage) -> None:
            code = resp.status_code
            log.debug("B-leg got %s %s", code, resp.reason)
            if code == 100:
                return
            if 180 <= code < 200:
                # Forward 180 to A-leg if not already
                if not session.a.dialog:
                    return
                ringing = make_response(session.a.invite, 180, "Ringing",
                                        to_tag=session.a.dialog.local_tag,
                                        user_agent="SMURF/0.1")
                ringing.headers.add("Contact", session.a.dialog.local_contact)
                try:
                    await session.a.server_tx.respond(ringing)
                except Exception:
                    pass
                return
            if 200 <= code < 300:
                b_leg.dialog = Dialog.from_invite_uac(invite, resp,
                                                     local_contact=_local_contact(transport, local_user))
                b_leg.answered = True
                if webrtc_b and b_bridge is not None:
                    try:
                        await b_bridge.apply_answer(resp.body.decode("utf-8", "replace"))
                    except Exception:
                        log.exception("Apply WebRTC answer failed")
                else:
                    neg = _negotiate(resp.body)
                    if neg:
                        bcodec, brport, brip, bdtmf = neg
                        b_rtp.codec_name = bcodec
                        b_rtp._spec = rtpcodecs.SPECS.get(bcodec.upper(), b_rtp._spec)
                        b_rtp._spec.ptime_ms = 20
                        b_rtp.set_remote(brip, brport)
                # Send ACK for B-leg
                ack = self._build_ack_for_2xx(invite, resp, transport, kind, local_ip_for_phone)
                try:
                    await transport.send(ack.to_bytes(), remote)
                except Exception:
                    log.exception("ACK send failed")
                # Now answer A-leg with 200 OK + our SDP back to A.  If A is
                # a WebRTC peer, we already prepared the DTLS-SRTP answer
                # when the offer arrived; just echo it.
                if session.a.invite is not None and session.a.dialog and session.a.rtp:
                    if session.a.notes.get("webrtc"):
                        answer_body = session.a.notes["webrtc_answer_sdp"].encode()
                    else:
                        a_local_ip = _our_external_ip(session.a.remote.host)
                        answer_body = _build_answer_sdp(a_local_ip, session.a.rtp.local_port,
                                                        session.a.rtp.codec_name)
                    ok_resp = make_response(session.a.invite, 200, "OK",
                                            to_tag=session.a.dialog.local_tag,
                                            body=answer_body,
                                            content_type="application/sdp",
                                            user_agent="SMURF/0.1")
                    ok_resp.headers.add("Contact", session.a.dialog.local_contact)
                    try:
                        await session.a.server_tx.respond(ok_resp)
                    except Exception:
                        log.exception("A-leg 200 OK send failed")
                session.answered_at = time.time()
                session.a.answered = True
                await repo.cdr_answered(session.call_id)
                # Start RTP relay
                rec_path = None
                ext_db = await repo.get_extension(session.dst_number)
                if (ext_db and ext_db.get("record_calls")) or (await repo.get_extension(session.src_number) or {}).get("record_calls"):
                    rec_path = str(Path(config.RECORDINGS_DIR) /
                                   f"{int(time.time())}_{session.call_id.replace('@', '_')}.wav")
                    session.record_path = rec_path
                relay = RTPRelay(session.a.rtp, session.b.rtp, record_path=rec_path)
                await relay.start()
                session.relay = relay
                BUS.publish("call.answered", {
                    "call_id": session.call_id, "src": session.src_number, "dst": session.dst_number,
                })
                REGISTRY.add(session)
                result["answered"] = True
                result["code"] = code
                result_event.set()
                return
            if code >= 300:
                result["code"] = code
                result_event.set()

        ct = await self.dispatcher.send_request(invite, remote, transport, on_response=on_response)  # type: ignore[union-attr]
        b_leg.client_tx = ct
        try:
            await asyncio.wait_for(result_event.wait(), timeout=ring_timeout)
        except asyncio.TimeoutError:
            await self._send_cancel_or_bye(b_leg)
            await b_rtp.close()
            session.b = None
            return False
        if not result["answered"]:
            await b_rtp.close()
            session.b = None
            return False
        return True

    def _build_ack_for_2xx(self, invite: SipMessage, resp: SipMessage, transport: Transport,
                           kind: str, local_ip: str) -> SipMessage:
        # Per RFC 3261 §13.2.2.4, ACK for 2xx is a new transaction within the dialog.
        contact = resp.headers.get("Contact", "")
        _, contact_uri, _ = split_addr_uri(contact)
        ack = SipMessage(is_request=True, method="ACK", request_uri=contact_uri or invite.request_uri)
        local_addr = transport.local_address
        ack.headers.add("Via", f"SIP/2.0/{kind.upper()} {local_ip}:{local_addr[1]};branch={make_branch()};rport")
        ack.headers.add("Max-Forwards", "70")
        ack.headers.add("From", invite.headers.get("From", ""))
        ack.headers.add("To", resp.headers.get("To", invite.headers.get("To", "")))
        ack.headers.add("Call-ID", invite.headers.get("Call-ID", ""))
        cseq_n = invite.cseq_number()
        ack.headers.add("CSeq", f"{cseq_n} ACK")
        ack.headers.add("Content-Length", "0")
        return ack

    async def _maybe_voicemail_or_announce(self, session: CallSession, ext_number: str, reason: str) -> None:
        ext_row = await repo.get_extension(ext_number)
        if ext_row and ext_row.get("voicemail_enabled"):
            await self._app_voicemail(session, ext_number)
            return
        await self._answer_with_announcement(session, reason, final_status=(486, "Busy Here"))

    # ------------------------------------------------------------------
    # Apps: ring group
    # ------------------------------------------------------------------
    async def _app_ring_group(self, session: CallSession, target: str) -> None:
        rg = await repo.get_ring_group(target)
        if not rg:
            await self._answer_with_announcement(session, "rg-missing", final_status=(404, "Not Found"))
            return
        members = rg["members"] or []
        strategy = rg.get("strategy", "ringall")
        timeout = rg.get("timeout", 30)
        for m in members if strategy != "random" else __import__("random").sample(members, len(members)):
            ok = await self._app_dial_member(session, m, timeout=timeout)
            if ok:
                return
        if rg.get("fail_target"):
            r = await dialplan.resolve(rg["fail_target"], direction="outbound")
            if r:
                await self._dispatch_application(session, r)
                return
        await self._maybe_voicemail_or_announce(session, members[0] if members else "0", "rg_no_answer")

    async def _app_dial_member(self, session: CallSession, member: str, *, timeout: float) -> bool:
        regs = await repo.active_registrations(member)
        if not regs:
            return False
        for reg in regs:
            ok = await self._dial_b_leg(session, member, reg, ring_timeout=timeout)
            if ok:
                return True
        return False

    # ------------------------------------------------------------------
    # Apps: queue
    # ------------------------------------------------------------------
    async def _app_queue(self, session: CallSession, target: str) -> None:
        q = await repo.get_queue(target)
        if not q:
            await self._answer_with_announcement(session, "queue-missing", final_status=(404, "Not Found"))
            return
        # Answer A-leg now and play MoH
        await self._early_answer_with_moh(session)
        members = list(q.get("members") or [])
        strategy = q.get("strategy", "roundrobin")
        max_wait = int(q.get("max_wait", 300))
        deadline = time.time() + max_wait
        idx = 0
        while time.time() < deadline:
            if not members:
                await asyncio.sleep(2)
                continue
            if strategy == "roundrobin":
                member = members[idx % len(members)]
                idx += 1
            elif strategy == "random":
                import random
                member = random.choice(members)
            elif strategy == "least-busy":
                # Pick the member with fewest active calls right now
                counts = {m: sum(1 for s in REGISTRY.all_active() if s.b and s.b.extension == m) for m in members}
                member = min(counts, key=counts.get)  # type: ignore[arg-type]
            else:
                member = members[0]
            ok = await self._app_dial_member(session, member, timeout=20)
            if ok:
                return
        # Timed out
        await self._answer_with_announcement(session, "queue-timeout", final_status=(486, "Busy Here"))

    async def _early_answer_with_moh(self, session: CallSession) -> None:
        if session.a.answered:
            return
        if not (session.a.invite and session.a.dialog and session.a.rtp):
            return
        if session.a.notes.get("webrtc"):
            body = session.a.notes["webrtc_answer_sdp"].encode()
        else:
            local_ip = _our_external_ip(session.a.remote.host)
            body = _build_answer_sdp(local_ip, session.a.rtp.local_port, session.a.rtp.codec_name)
        ok_resp = make_response(session.a.invite, 200, "OK",
                                to_tag=session.a.dialog.local_tag, body=body,
                                content_type="application/sdp", user_agent="SMURF/0.1")
        ok_resp.headers.add("Contact", session.a.dialog.local_contact)
        try:
            await session.a.server_tx.respond(ok_resp)
        except Exception:
            log.exception("Early answer failed")
        session.a.answered = True
        await repo.cdr_answered(session.call_id)
        asyncio.create_task(media_apps.music_on_hold(session.a.rtp))

    # ------------------------------------------------------------------
    # Apps: IVR
    # ------------------------------------------------------------------
    async def _app_ivr(self, session: CallSession, target: str) -> None:
        ivr = await repo.get_ivr(target)
        if not ivr:
            await self._answer_with_announcement(session, "ivr-missing", final_status=(404, "Not Found"))
            return
        await self._early_answer(session)
        if not session.a.rtp:
            return
        # Stop MoH/silence — just drive the IVR
        for _ in range(3):
            if ivr.get("greeting"):
                p = Path(config.MOH_DIR) / ivr["greeting"]
                if p.exists():
                    await media_apps.play_file(session.a.rtp, p)
                else:
                    await media_apps.play_announcement(session.a.rtp, "ivr-greeting")
            else:
                await media_apps.play_announcement(session.a.rtp, "ivr-greeting")
            digit = await media_apps.collect_dtmf(session.a.rtp, max_digits=1,
                                                  timeout_s=ivr.get("timeout", 5),
                                                  terminator=None)
            options = ivr.get("options") or {}
            if digit and digit in options:
                target_route = options[digit]
                resolved = await dialplan.resolve(target_route, direction="outbound")
                if resolved:
                    await self._dispatch_application(session, resolved)
                    return
            elif not digit and ivr.get("timeout_target"):
                resolved = await dialplan.resolve(ivr["timeout_target"], direction="outbound")
                if resolved:
                    await self._dispatch_application(session, resolved)
                    return
        # Final invalid → hang up
        await self._cleanup_session(session, hangup_cause="IVR_INVALID")

    async def _early_answer(self, session: CallSession) -> None:
        await self._early_answer_with_moh(session)

    # ------------------------------------------------------------------
    # Apps: voicemail
    # ------------------------------------------------------------------
    async def _app_voicemail(self, session: CallSession, ext_number: str) -> None:
        await self._early_answer(session)
        if not session.a.rtp:
            return
        # Beep, then record up to 60s, save metadata
        await media_apps.play_pcm(session.a.rtp, media_apps.beep())
        await media_apps.play_pcm(session.a.rtp, media_apps.silence(300))
        out_dir = Path(config.VOICEMAIL_DIR) / ext_number
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"vm_{int(time.time())}_{session.call_id.replace('@', '_')}.wav"
        duration = await media_apps.record_voicemail(session.a.rtp, out_path, max_seconds=60)
        await repo.vm_save(extension=ext_number, caller=session.src_number,
                           file_path=str(out_path), duration=duration)
        BUS.publish("voicemail.received", {"extension": ext_number, "caller": session.src_number,
                                           "duration": duration, "file": str(out_path)})
        await self.voicemail.notify_mwi(ext_number, self.dispatcher)  # type: ignore[arg-type]
        await self._cleanup_session(session, hangup_cause="VOICEMAIL_RECORDED")

    async def _app_voicemail_self(self, session: CallSession) -> None:
        await self._app_voicemail(session, session.src_number)

    async def _app_voicemail_menu(self, session: CallSession) -> None:
        await self._early_answer(session)
        if not session.a.rtp:
            return
        await media_apps.play_announcement(session.a.rtp, "vm-login")
        ext = await media_apps.collect_dtmf(session.a.rtp, max_digits=4, timeout_s=8, terminator="#")
        if not ext:
            await self._cleanup_session(session, hangup_cause="VM_MENU_TIMEOUT")
            return
        await media_apps.play_announcement(session.a.rtp, "vm-pin")
        pin = await media_apps.collect_dtmf(session.a.rtp, max_digits=8, timeout_s=8, terminator="#")
        ext_row = await repo.get_extension(ext)
        if not ext_row or pin != ext_row.get("voicemail_pin"):
            await media_apps.play_announcement(session.a.rtp, "vm-bad-credentials")
            await self._cleanup_session(session, hangup_cause="VM_AUTH_FAILED")
            return
        msgs = await repo.vm_list(ext)
        for m in msgs[:5]:
            await media_apps.play_announcement(session.a.rtp, "vm-message")
            try:
                await media_apps.play_file(session.a.rtp, m["file_path"])
            except Exception:
                continue
        await self._cleanup_session(session, hangup_cause="VM_MENU_DONE")

    # ------------------------------------------------------------------
    # Apps: echo
    # ------------------------------------------------------------------
    async def _app_echo(self, session: CallSession) -> None:
        await self._early_answer(session)
        if session.a.rtp:
            await media_apps.echo_test(session.a.rtp, seconds=120.0)
        await self._cleanup_session(session, hangup_cause="ECHO_DONE")

    # ------------------------------------------------------------------
    # Apps: conference
    # ------------------------------------------------------------------
    async def _app_conference(self, session: CallSession, room: str) -> None:
        await self._early_answer(session)
        if not session.a.rtp:
            return
        await self.conference.join(room, session.a.rtp, session.src_number, session.call_id)
        # join() blocks until participant leaves
        await self._cleanup_session(session, hangup_cause="CONFERENCE_LEFT")

    # ------------------------------------------------------------------
    # Apps: parking
    # ------------------------------------------------------------------
    async def _app_parking(self, session: CallSession, lot: str) -> None:
        await self._early_answer(session)
        # Pick first free slot 7000-7019
        slot = next((str(7000 + i) for i in range(20) if str(7000 + i) not in REGISTRY.parking), None)
        if not slot:
            await self._answer_with_announcement(session, "park-full", final_status=(486, "Busy Here"))
            return
        REGISTRY.parking[slot] = session
        if session.a.rtp:
            asyncio.create_task(media_apps.music_on_hold(session.a.rtp))
        BUS.publish("call.parked", {"call_id": session.call_id, "slot": slot})
        # The call lives here until someone retrieves it via 7XXX

    async def _app_parking_retrieve(self, session: CallSession, slot: str) -> None:
        parked = REGISTRY.parking.pop(slot, None)
        if parked is None:
            await self._answer_with_announcement(session, "park-empty", final_status=(404, "Not Found"))
            return
        # Bridge the retriever's A-leg with parked's A-leg by swapping legs.
        # For simplicity, hang up parked and dial the retriever's extension to the parked source.
        await self._cleanup_session(parked, hangup_cause="UNPARKED")
        await self._answer_with_announcement(session, "unparked", final_status=(200, "OK"))

    # ------------------------------------------------------------------
    # Apps: trunk dial
    # ------------------------------------------------------------------
    async def _app_trunk_dial(self, session: CallSession, trunk_name: str, dialled: str) -> None:
        trunks = [t for t in await repo.list_trunks() if t["name"] == trunk_name and t.get("enabled")]
        if not trunks:
            await self._answer_with_announcement(session, "trunk-missing", final_status=(503, "Service Unavailable"))
            return
        trunk = trunks[0]
        kind = trunk.get("transport", "udp")
        transport = self.dispatcher.transport_for(kind) or self.dispatcher.transport_for("udp")  # type: ignore[union-attr]
        if transport is None:
            await self._answer_with_announcement(session, "trunk-no-transport", final_status=(503, "Service Unavailable"))
            return
        host = trunk["host"]
        port = trunk.get("port", 5060)
        remote = RemoteAddr(kind, host, int(port))
        b_rtp = RTPSession(codec_name=session.a.rtp.codec_name if session.a.rtp else "PCMU", dtmf_pt=101)  # type: ignore[union-attr]
        await b_rtp.open()
        local_ip = _our_external_ip(host)
        offer = _build_offer_sdp(local_ip, b_rtp.local_port, _our_codecs())
        from_user = trunk.get("from_user") or trunk.get("username") or session.src_number or "smurf"
        from_domain = trunk.get("from_domain") or trunk["host"]
        invite = SipMessage(is_request=True, method="INVITE",
                            request_uri=f"sip:{dialled}@{host}")
        invite.headers.add("Via", f"SIP/2.0/{kind.upper()} {local_ip}:{transport.local_address[1]};branch={make_branch()};rport")
        invite.headers.add("Max-Forwards", "70")
        invite.headers.add("From", f"\"{trunk.get('caller_id') or from_user}\" <sip:{from_user}@{from_domain}>;tag={make_tag()}")
        invite.headers.add("To", f"<sip:{dialled}@{host}>")
        invite.headers.add("Call-ID", make_call_id(config.get("domain", "smurf")))
        invite.headers.add("CSeq", "1 INVITE")
        invite.headers.add("Contact", _local_contact(transport, from_user))
        invite.headers.add("User-Agent", "SMURF/0.1")
        invite.headers.add("Allow", "INVITE,ACK,BYE,CANCEL,OPTIONS,REFER,UPDATE,INFO,MESSAGE,PRACK,NOTIFY")
        invite.headers.add("Content-Type", "application/sdp")
        invite.body = offer

        # The rest mirrors _dial_b_leg; for brevity we re-route via that path.
        fake_reg = {
            "contact": str(SipURI(scheme="sip", user=dialled, host=host, port=int(port))),
            "transport": kind, "source_ip": host, "source_port": int(port),
        }
        ok = await self._dial_b_leg(session, dialled, fake_reg, ring_timeout=30)
        await b_rtp.close()
        if not ok:
            # Failover to next trunk by priority
            others = [t for t in await repo.list_trunks() if t.get("enabled") and t["name"] != trunk_name]
            for t in others:
                fake = {"contact": f"sip:{dialled}@{t['host']}",
                        "transport": t.get("transport", "udp"),
                        "source_ip": t["host"], "source_port": t.get("port", 5060)}
                if await self._dial_b_leg(session, dialled, fake, ring_timeout=30):
                    return
            await self._answer_with_announcement(session, "trunk-failover", final_status=(503, "Service Unavailable"))

    # ------------------------------------------------------------------
    # Re-INVITE (hold/resume/transfer)
    # ------------------------------------------------------------------
    async def _handle_reinvite(self, req: SipMessage, remote: RemoteAddr, transport: Transport,
                               dispatcher: Dispatcher) -> None:
        st = dispatcher.server_tx_for(req)
        if not st:
            return
        session = REGISTRY.find_by_dialog(req)
        if not session:
            await st.respond(make_response(req, 481, "Call/Transaction Does Not Exist",
                                           user_agent=dispatcher.user_agent))
            return
        # Just answer 200 OK with same SDP (very simplified hold)
        leg = session.a if session.a.dialog and session.a.dialog.call_id == req.call_id else session.b
        if leg is None or leg.dialog is None or leg.rtp is None:
            await st.respond(make_response(req, 488, "Not Acceptable Here", user_agent=dispatcher.user_agent))
            return
        if leg.notes.get("webrtc") and leg.notes.get("webrtc_answer_sdp"):
            body = leg.notes["webrtc_answer_sdp"].encode()
        else:
            local_ip = _our_external_ip(remote.host)
            body = _build_answer_sdp(local_ip, leg.rtp.local_port, leg.rtp.codec_name)
        ok = make_response(req, 200, "OK", to_tag=leg.dialog.local_tag,
                           body=body, content_type="application/sdp",
                           user_agent=dispatcher.user_agent)
        ok.headers.add("Contact", leg.dialog.local_contact)
        await st.respond(ok)

    # ------------------------------------------------------------------
    # Generic announcement-then-hangup flow
    # ------------------------------------------------------------------
    async def _answer_with_announcement(self, session: CallSession, reason: str,
                                        *, final_status: tuple[int, str] = (404, "Not Found")) -> None:
        if not session.a.answered and session.a.invite and session.a.server_tx and session.a.dialog:
            try:
                code, msg = final_status
                if code >= 300:
                    resp = make_response(session.a.invite, code, msg,
                                         to_tag=session.a.dialog.local_tag,
                                         user_agent="SMURF/0.1")
                    await session.a.server_tx.respond(resp)
                else:
                    await self._early_answer(session)
                    if session.a.rtp:
                        await media_apps.play_announcement(session.a.rtp, reason)
            except Exception:
                log.exception("Announcement final response failed")
        await self._cleanup_session(session, hangup_cause=reason.upper())

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------
    async def _cleanup_session(self, session: CallSession, *, hangup_cause: str) -> None:
        if session.relay is not None:
            try:
                await session.relay.stop()
            except Exception:
                pass
            session.relay = None
        for leg in (session.a, session.b):
            if leg and leg.rtp:
                try:
                    await leg.rtp.close()
                except Exception:
                    pass
        REGISTRY.remove(session)
        try:
            rec_path = session.record_path
            if rec_path and Path(rec_path).exists():
                duration = int(time.time() - (session.answered_at or session.started_at))
                await repo.rec_save(call_id=session.call_id, file_path=rec_path,
                                    duration=duration, src=session.src_number, dst=session.dst_number)
            await repo.cdr_close(session.call_id, hangup_cause=hangup_cause, recording_path=rec_path)
        except Exception:
            log.exception("CDR close failed")
        BUS.publish("call.cleanup", {"call_id": session.call_id, "cause": hangup_cause})

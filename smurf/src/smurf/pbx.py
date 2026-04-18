from __future__ import annotations

import asyncio
import json
import ssl
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .config import SmurfConfig
from .logging_utils import StructuredLogger, configure_logging, get_logger
from .models import ActiveCall, CallRecord, Registration, SipMessage, SipUri
from .rtp import MediaEndpoint, RtpEngine, PAYLOAD_PCMU
from .sdp import MediaDescription, SessionDescription, parse_sdp
from .security import compute_digest_response_from_ha1, verify_password
from .sip import (
    SipEndpoint,
    SipEnvelope,
    SipServer,
    create_branch,
    create_tag,
    format_digest_challenge,
    format_name_addr,
    make_request,
    make_response,
    parse_auth_header,
    parse_header_params,
    parse_name_addr,
    parse_uri,
)
from .store import SmurfStore


class PbxEngine:
    def __init__(self, config: SmurfConfig, store: SmurfStore, logger: StructuredLogger) -> None:
        self.config = config
        self.store = store
        self.logger = logger
        self.rtp = RtpEngine(config.bind_host, config.media_port_start, config.media_port_end, logger)
        self.sip: SipServer | None = None
        self._calls: dict[str, ActiveCall] = {}
        self._nonces: dict[str, tuple[str, float, str]] = {}
        self._event_listeners: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    @classmethod
    async def build(cls, root: Path) -> "PbxEngine":
        config = SmurfConfig.from_env(root)
        configure_logging(config.log_path)
        logger = get_logger("smurf")
        store = SmurfStore(config)
        store.initialize()
        engine = cls(config, store, logger)
        await engine.ensure_tls_material()
        tls_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        tls_context.load_cert_chain(config.tls_cert_path, config.tls_key_path)
        engine.sip = SipServer(
            host=config.bind_host,
            udp_port=config.sip_port,
            tls_port=config.sip_tls_port,
            tls_context=tls_context,
            handler=engine.handle_sip_envelope,
            logger=logger,
        )
        return engine

    async def start(self) -> None:
        if self.sip is None:
            raise RuntimeError("SIP server not configured")
        await self.sip.start()
        self.logger.info(
            "pbx_started",
            bind_host=self.config.bind_host,
            sip_port=self.config.sip_port,
            sip_tls_port=self.config.sip_tls_port,
            web_port=self.config.web_port,
        )

    async def stop(self) -> None:
        if self.sip is not None:
            await self.sip.stop()
        for call_id in list(self._calls):
            self.rtp.destroy_session(call_id)
        self.store.close()
        self.logger.info("pbx_stopped")

    async def ensure_tls_material(self) -> None:
        if self.config.tls_cert_path.exists() and self.config.tls_key_path.exists():
            return
        from subprocess import run

        subject = "/CN=smurf.local"
        command = [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(self.config.tls_key_path),
            "-out",
            str(self.config.tls_cert_path),
            "-days",
            "3650",
            "-subj",
            subject,
        ]
        result = await asyncio.to_thread(run, command, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"openssl failed: {result.stderr.strip()}")

    def subscribe_events(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._event_listeners.add(queue)
        return queue

    def unsubscribe_events(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._event_listeners.discard(queue)

    async def publish_event(self, category: str, message: str, payload: dict[str, Any]) -> None:
        event = {
            "ts": time.time(),
            "category": category,
            "message": message,
            "payload": payload,
        }
        self.store.log_event("INFO", category, message, payload)
        for queue in list(self._event_listeners):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass

    async def handle_sip_envelope(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        if not message.is_request:
            await self._handle_response(envelope)
            return
        method = message.method.upper()
        handlers = {
            "REGISTER": self._handle_register,
            "OPTIONS": self._handle_options,
            "INFO": self._handle_info,
            "INVITE": self._handle_invite,
            "ACK": self._handle_ack,
            "BYE": self._handle_bye,
            "CANCEL": self._handle_cancel,
        }
        handler = handlers.get(method)
        if handler is None:
            await self._send_response(envelope.endpoint, make_response(message, 501, "Not Implemented"))
            return
        await handler(envelope)

    async def _handle_response(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        call_id = message.header("Call-ID")
        call = self._calls.get(call_id)
        if call is None:
            return
        caller_endpoint = self._deserialize_endpoint(call.metadata.get("caller_endpoint"))
        cseq = message.header("CSeq").upper()
        if "INVITE" in cseq:
            if message.status_code == 180:
                call.state = "ringing"
                call.updated_at = time.time()
                self.store.upsert_call(self._to_call_record(call))
                if caller_endpoint is not None:
                    await self._send_response(caller_endpoint, self._forward_response(message))
                await self.publish_event("call", "ringing", {"call_id": call_id})
            elif 200 <= message.status_code < 300:
                call.state = "answered"
                call.updated_at = time.time()
                call.to_tag = parse_name_addr(message.header("To"))[2].get("tag", call.to_tag or create_tag())
                call.callee_sdp = message.body.decode("utf-8", errors="replace") if message.body else call.callee_sdp
                if call.callee_sdp:
                    self._update_media_from_sdp(call, call.callee_sdp, caller=False)
                await self._ensure_media_session(call)
                if caller_endpoint is not None:
                    await self._send_response(caller_endpoint, self._forward_response(message))
                call.state = "active"
                record = self._to_call_record(call)
                record.answered_at = time.time()
                self.store.upsert_call(record)
                await self.publish_event("call", "active", {"call_id": call_id})
            elif message.status_code >= 300:
                call.state = "failed"
                call.updated_at = time.time()
                self.store.upsert_call(self._to_call_record(call))
                self.rtp.destroy_session(call.call_id)
                if caller_endpoint is not None:
                    await self._send_response(caller_endpoint, self._forward_response(message))
                await self.publish_event("call", "failed", {"call_id": call_id, "status": message.status_code})

    async def _handle_options(self, envelope: SipEnvelope) -> None:
        headers = [
            ("Allow", "INVITE, ACK, BYE, CANCEL, INFO, OPTIONS, REGISTER"),
            ("Accept", "application/sdp"),
            ("Supported", "timer, replaces, path"),
        ]
        await self._send_response(
            envelope.endpoint,
            make_response(envelope.message, 200, "OK", headers=headers),
        )

    async def _handle_info(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        call = self._calls.get(message.header("Call-ID"))
        if call is None:
            await self._send_response(envelope.endpoint, make_response(message, 481, "Call/Transaction Does Not Exist"))
            return
        content_type = message.header("Content-Type", "").lower()
        if "application/dtmf-relay" in content_type:
            body_text = message.body.decode("utf-8", errors="replace")
            await self.publish_event("dtmf", "info", {"call_id": call.call_id, "payload": body_text})
        await self._send_response(envelope.endpoint, make_response(message, 200, "OK"))

    async def _handle_register(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        auth = parse_auth_header(message.header("Authorization"))
        if not auth:
            await self._challenge_registration(envelope.endpoint, message, "MD5")
            return
        username = auth.get("username", "")
        extension = self.store.fetch_extension(username)
        if extension is None:
            await self._send_response(envelope.endpoint, make_response(message, 403, "Forbidden"))
            return
        if not self._validate_auth(message, auth, extension):
            await self._challenge_registration(envelope.endpoint, message, auth.get("algorithm", "MD5"))
            return
        contact_header = message.header("Contact")
        if not contact_header:
            await self._send_response(envelope.endpoint, make_response(message, 400, "Bad Request"))
            return
        contact_uri = parse_name_addr(contact_header)[1].to_uri()
        via_params = parse_header_params(message.header("Via"))
        expires = self._registration_expiry(message, contact_header)
        source_addr = f"{envelope.endpoint.host}:{envelope.endpoint.port}"
        registration = Registration(
            extension=extension.extension,
            contact_uri=contact_uri,
            transport=envelope.endpoint.transport,
            source_addr=source_addr,
            connection_id=envelope.endpoint.connection_id,
            expires_at=time.time() + expires,
            user_agent=message.header("User-Agent"),
            instance_id=parse_name_addr(contact_header)[1].params.get("+sip.instance", ""),
            via_branch=via_params.get("branch", ""),
        )
        self.store.create_or_update_registration(registration)
        self.store.set_presence(extension.extension, "available")
        headers = [
            ("Contact", f"<{contact_uri}>;expires={expires}"),
            ("Date", self._http_date()),
        ]
        response = make_response(message, 200, "OK", headers=headers, to_tag=create_tag())
        await self._send_response(envelope.endpoint, response)
        await self.publish_event(
            "registration",
            "registered",
            {
                "extension": extension.extension,
                "transport": envelope.endpoint.transport,
                "source": source_addr,
            },
        )

    async def _handle_invite(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        auth = parse_auth_header(message.header("Authorization"))
        caller_from = parse_name_addr(message.header("From"))
        caller_extension = caller_from[1].user
        extension = self.store.fetch_extension(caller_extension)
        if extension is None:
            await self._send_response(envelope.endpoint, make_response(message, 403, "Forbidden"))
            return
        if not auth:
            await self._challenge_request(envelope.endpoint, message, "MD5")
            return
        if not self._validate_auth(message, auth, extension):
            await self._challenge_request(envelope.endpoint, message, auth.get("algorithm", "MD5"))
            return
        request_uri = parse_uri(message.request_uri)
        target_extension = request_uri.user
        registrations = self.store.list_live_registrations(target_extension)
        if not registrations:
            await self._send_response(envelope.endpoint, make_response(message, 404, "Not Found"))
            return
        call_id = message.header("Call-ID")
        async with self._lock:
            call = self._calls.get(call_id)
            if call is None:
                _, caller_uri, from_params = parse_name_addr(message.header("From"))
                _, callee_uri, _ = parse_name_addr(message.header("To"))
                call = ActiveCall(
                    call_id=call_id,
                    from_extension=caller_extension,
                    to_extension=target_extension,
                    state="trying",
                    created_at=time.time(),
                    updated_at=time.time(),
                    caller_uri=caller_uri,
                    callee_uri=callee_uri,
                    from_tag=from_params.get("tag", create_tag()),
                    invite_cseq=self._extract_cseq_number(message),
                    caller_contact=message.header("Contact"),
                    caller_transport=envelope.endpoint.transport,
                    caller_sdp=message.body.decode("utf-8", errors="replace") if message.body else None,
                )
                call.metadata["caller_endpoint"] = self._serialize_endpoint(envelope.endpoint)
                if call.caller_sdp:
                    self._update_media_from_sdp(call, call.caller_sdp, caller=True)
                self._calls[call_id] = call
                self.store.upsert_call(self._to_call_record(call))
        trying = make_response(message, 100, "Trying", to_tag=call.to_tag or create_tag())
        await self._send_response(envelope.endpoint, trying)
        callee_reg = self._select_registration(registrations)
        target_endpoint = self._registration_to_endpoint(callee_reg)
        call.callee_transport = target_endpoint.transport
        call.callee_contact = callee_reg.contact_uri
        call.metadata["callee_endpoint"] = self._serialize_endpoint(target_endpoint)
        call.state = "ringing"
        call.updated_at = time.time()
        call.to_tag = call.to_tag or create_tag()
        forwarded = self._build_forked_invite(call, message, target_endpoint, callee_reg)
        await self._send_request(target_endpoint, forwarded)
        self.store.upsert_call(self._to_call_record(call))
        await self.publish_event(
            "call",
            "invite_forwarded",
            {"call_id": call_id, "target_extension": target_extension},
        )

    async def _handle_ack(self, envelope: SipEnvelope) -> None:
        call = self._calls.get(envelope.message.header("Call-ID"))
        if call is None:
            return
        sender_endpoint = envelope.endpoint
        caller_endpoint = self._deserialize_endpoint(call.metadata.get("caller_endpoint"))
        callee_endpoint = self._deserialize_endpoint(call.metadata.get("callee_endpoint"))
        if caller_endpoint is not None and self._same_endpoint(sender_endpoint, caller_endpoint) and callee_endpoint is not None:
            ack = self._build_in_dialog_request("ACK", envelope.message, callee_endpoint, call)
            await self._send_request(callee_endpoint, ack)
        if call.state in {"answered", "active"}:
            call.state = "active"
            call.updated_at = time.time()
            self.store.upsert_call(self._to_call_record(call))

    async def _handle_bye(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        call = self._calls.get(message.header("Call-ID"))
        if call is None:
            await self._send_response(envelope.endpoint, make_response(message, 481, "Call/Transaction Does Not Exist"))
            return
        await self._send_response(envelope.endpoint, make_response(message, 200, "OK", to_tag=call.to_tag))
        peer_endpoint = await self._peer_endpoint_for_bye(call, envelope.endpoint)
        if peer_endpoint is not None:
            bye_request = self._clone_in_dialog_request(message, peer_endpoint, call)
            await self._send_request(peer_endpoint, bye_request)
        call.state = "terminated"
        call.updated_at = time.time()
        record = self._to_call_record(call)
        record.ended_at = time.time()
        if record.answered_at:
            record.duration_seconds = max(0, int(record.ended_at - record.answered_at))
        self.store.upsert_call(record)
        self.rtp.destroy_session(call.call_id)
        await self.publish_event("call", "terminated", {"call_id": call.call_id})

    async def _handle_cancel(self, envelope: SipEnvelope) -> None:
        message = envelope.message
        call = self._calls.get(message.header("Call-ID"))
        await self._send_response(envelope.endpoint, make_response(message, 200, "OK"))
        if call is None:
            return
        call.state = "cancelled"
        call.updated_at = time.time()
        self.store.upsert_call(self._to_call_record(call))
        await self.publish_event("call", "cancelled", {"call_id": call.call_id})

    async def _challenge_registration(self, endpoint: SipEndpoint, request: SipMessage, algorithm: str) -> None:
        nonce = self._issue_nonce("registration", algorithm)
        headers = [("WWW-Authenticate", format_digest_challenge(self.config.default_realm, nonce, algorithm))]
        response = make_response(request, 401, "Unauthorized", headers=headers)
        await self._send_response(endpoint, response)

    async def _challenge_request(self, endpoint: SipEndpoint, request: SipMessage, algorithm: str) -> None:
        nonce = self._issue_nonce("invite", algorithm)
        headers = [("WWW-Authenticate", format_digest_challenge(self.config.default_realm, nonce, algorithm))]
        response = make_response(request, 401, "Unauthorized", headers=headers)
        await self._send_response(endpoint, response)

    def _issue_nonce(self, purpose: str, algorithm: str) -> str:
        from .security import issue_nonce

        nonce = issue_nonce()
        self._nonces[nonce] = (purpose, time.time() + 300, algorithm.upper())
        return nonce

    def _validate_auth(self, message: SipMessage, auth: dict[str, str], extension) -> bool:
        nonce = auth.get("nonce", "")
        entry = self._nonces.get(nonce)
        if entry is None:
            return False
        _, expires_at, algorithm = entry
        if expires_at < time.time():
            return False
        response = auth.get("response", "")
        if not response:
            return False
        ha1 = extension.digest_sha256 if algorithm == "SHA-256" else extension.digest_md5
        expected = compute_digest_response_from_ha1(
            ha1=ha1,
            nonce=nonce,
            method=message.method,
            uri=auth.get("uri", message.request_uri),
            algorithm=algorithm,
            qop=auth.get("qop", ""),
            nc=auth.get("nc", ""),
            cnonce=auth.get("cnonce", ""),
        )
        return expected.lower() == response.lower()

    def _registration_expiry(self, message: SipMessage, contact_header: str) -> int:
        expires = self.config.registration_ttl
        contact_params = parse_name_addr(contact_header)[1].params
        if "expires" in contact_params and contact_params["expires"].isdigit():
            expires = int(contact_params["expires"])
        elif message.header("Expires").isdigit():
            expires = int(message.header("Expires"))
        return max(60, min(expires, 3600))

    def _extract_cseq_number(self, message: SipMessage) -> int:
        value = message.header("CSeq").strip().split()
        if not value:
            return 1
        try:
            return int(value[0])
        except ValueError:
            return 1

    def _build_forked_invite(
        self,
        call: ActiveCall,
        original: SipMessage,
        target_endpoint: SipEndpoint,
        registration: Registration,
    ) -> SipMessage:
        request_uri = registration.contact_uri
        via = f"SIP/2.0/{target_endpoint.transport.upper()} {self.config.public_host}:{self.config.sip_port};branch={create_branch()}"
        headers = [("Via", via)]
        for name, value in original.headers:
            lower = name.lower()
            if lower == "via":
                headers.append((name, value))
            elif lower in {"route", "record-route"}:
                continue
            else:
                headers.append((name, value))
        headers.append(("Record-Route", f"<sip:{self.config.public_host}:{self.config.sip_port};lr>"))
        return make_request("INVITE", request_uri, headers, original.body)

    def _build_in_dialog_request(
        self,
        method: str,
        original: SipMessage,
        endpoint: SipEndpoint,
        call: ActiveCall,
    ) -> SipMessage:
        request_uri = call.callee_contact if method == "ACK" else (call.callee_contact or call.caller_contact)
        headers = [
            ("Via", f"SIP/2.0/{endpoint.transport.upper()} {self.config.public_host}:{self.config.sip_port};branch={create_branch()}"),
            ("From", format_name_addr(call.caller_uri, params={"tag": call.from_tag})),
            ("To", format_name_addr(call.callee_uri, params={"tag": call.to_tag or create_tag()})),
            ("Call-ID", call.call_id),
            ("CSeq", f"{call.invite_cseq} {method}"),
            ("Max-Forwards", "70"),
            ("Contact", call.caller_contact or f"<sip:{call.from_extension}@{self.config.public_host}:{self.config.sip_port}>"),
        ]
        return make_request(method, request_uri, headers)

    def _clone_in_dialog_request(self, original: SipMessage, peer_endpoint: SipEndpoint, call: ActiveCall) -> SipMessage:
        headers = [
            ("Via", f"SIP/2.0/{peer_endpoint.transport.upper()} {self.config.public_host}:{self.config.sip_port};branch={create_branch()}"),
            ("From", original.header("From")),
            ("To", original.header("To")),
            ("Call-ID", original.header("Call-ID")),
            ("CSeq", original.header("CSeq")),
            ("Max-Forwards", "69"),
        ]
        if call.record_route:
            headers.append(("Route", call.record_route))
        return make_request(original.method, call.callee_contact or call.caller_contact, headers)

    def _select_registration(self, registrations: list[Registration]) -> Registration:
        registrations.sort(key=lambda item: item.expires_at, reverse=True)
        return registrations[0]

    def _registration_to_endpoint(self, registration: Registration) -> SipEndpoint:
        host, _, port_text = registration.source_addr.partition(":")
        port = int(port_text or "0")
        uri = parse_uri(registration.contact_uri)
        host = uri.host or host
        if uri.port is not None:
            port = uri.port
        return SipEndpoint(
            transport=registration.transport,
            host=host,
            port=port,
            connection_id=registration.connection_id,
        )

    def _update_media_from_sdp(self, call: ActiveCall, sdp_text: str, caller: bool) -> None:
        try:
            session = parse_sdp(sdp_text)
        except Exception:
            return
        if not session.media:
            return
        audio = next((item for item in session.media if item.media == "audio"), session.media[0])
        host = session.connection.split()[-1]
        codec = "PCMU"
        payload = PAYLOAD_PCMU
        rtpmap = audio.attributes.get("rtpmap", [])
        for line in rtpmap:
            parts = line.split(None, 1)
            if len(parts) != 2:
                continue
            pt_text, value = parts
            if value.upper().startswith("PCMU/8000"):
                codec = "PCMU"
                try:
                    payload = int(pt_text)
                except ValueError:
                    payload = PAYLOAD_PCMU
                break
        if caller:
            call.caller_media_host = host
            call.caller_media_port = audio.port
        else:
            call.callee_media_host = host
            call.callee_media_port = audio.port
        call.metadata["codec"] = codec
        call.metadata["payload_type"] = payload

    async def _ensure_media_session(self, call: ActiveCall) -> None:
        if not (call.caller_media_host and call.caller_media_port and call.callee_media_host and call.callee_media_port):
            return
        if call.relay_port_a and call.relay_port_b:
            return
        payload_type = int(call.metadata.get("payload_type", PAYLOAD_PCMU))
        codec = str(call.metadata.get("codec", "PCMU"))
        session = await self.rtp.create_session(
            call.call_id,
            MediaEndpoint(call.caller_media_host, call.caller_media_port, payload_type, codec),
            MediaEndpoint(call.callee_media_host, call.callee_media_port, payload_type, codec),
        )
        call.relay_port_a = session.left.port
        call.relay_port_b = session.right.port
        record = self._to_call_record(call)
        self.store.upsert_call(record)

    def _to_call_record(self, call: ActiveCall) -> CallRecord:
        record = self.store.fetch_call(call.call_id)
        answered_at = record.answered_at if record else None
        return CallRecord(
            call_id=call.call_id,
            from_extension=call.from_extension,
            to_extension=call.to_extension,
            state=call.state,
            started_at=record.started_at if record else call.created_at,
            answered_at=answered_at,
            ended_at=record.ended_at if record else None,
            duration_seconds=record.duration_seconds if record else 0,
            rtp_a_port=call.relay_port_a or 0,
            rtp_b_port=call.relay_port_b or 0,
            recording_path=record.recording_path if record else "",
        )

    async def _peer_endpoint_for_bye(self, call: ActiveCall, sender: SipEndpoint) -> SipEndpoint | None:
        caller_regs = self.store.list_live_registrations(call.from_extension)
        callee_regs = self.store.list_live_registrations(call.to_extension)
        if sender.connection_id and any(item.connection_id == sender.connection_id for item in caller_regs):
            if callee_regs:
                return self._registration_to_endpoint(self._select_registration(callee_regs))
        elif sender.connection_id and any(item.connection_id == sender.connection_id for item in callee_regs):
            if caller_regs:
                return self._registration_to_endpoint(self._select_registration(caller_regs))
        else:
            sender_hostport = f"{sender.host}:{sender.port}"
            if any(item.source_addr == sender_hostport for item in caller_regs):
                if callee_regs:
                    return self._registration_to_endpoint(self._select_registration(callee_regs))
            elif any(item.source_addr == sender_hostport for item in callee_regs):
                if caller_regs:
                    return self._registration_to_endpoint(self._select_registration(caller_regs))
        return None

    def _forward_response(self, message: SipMessage) -> SipMessage:
        headers = list(message.headers)
        via_index = next((index for index, (name, _) in enumerate(headers) if name.lower() == "via"), None)
        if via_index is not None:
            del headers[via_index]
        return SipMessage(message.start_line, headers, message.body)

    def _serialize_endpoint(self, endpoint: SipEndpoint) -> dict[str, Any]:
        return {
            "transport": endpoint.transport,
            "host": endpoint.host,
            "port": endpoint.port,
            "connection_id": endpoint.connection_id,
        }

    def _deserialize_endpoint(self, payload: Any) -> SipEndpoint | None:
        if not isinstance(payload, dict):
            return None
        try:
            return SipEndpoint(
                transport=str(payload["transport"]),
                host=str(payload["host"]),
                port=int(payload["port"]),
                connection_id=str(payload.get("connection_id", "")),
            )
        except Exception:
            return None

    def _same_endpoint(self, left: SipEndpoint, right: SipEndpoint) -> bool:
        if left.connection_id and right.connection_id:
            return left.connection_id == right.connection_id
        return (
            left.transport == right.transport
            and left.host == right.host
            and left.port == right.port
        )

    async def _send_response(self, endpoint: SipEndpoint, response: SipMessage) -> None:
        if self.sip is None:
            raise RuntimeError("SIP server unavailable")
        await self.sip.send(endpoint, response)

    async def _send_request(self, endpoint: SipEndpoint, request: SipMessage) -> None:
        if self.sip is None:
            raise RuntimeError("SIP server unavailable")
        await self.sip.send(endpoint, request)

    def _http_date(self) -> str:
        from email.utils import formatdate

        return formatdate(usegmt=True)

    def dashboard_snapshot(self) -> dict[str, Any]:
        return {
            "kpis": self.store.kpis(),
            "extensions": [asdict(ext) for ext in self.store.list_extensions()],
            "registrations": [asdict(item) for item in self.store.list_registrations()],
            "calls": [asdict(call) for call in self.store.list_calls()],
            "messages": self.store.list_messages(limit=50),
            "events": self.store.list_events(limit=50),
        }

    def authenticate_admin(self, username: str, password: str) -> dict[str, Any] | None:
        admin = self.store.authenticate_admin(username)
        if admin is None:
            return None
        if not verify_password(password, admin["password_hash"]):
            return None
        return dict(admin)

    def create_extension(self, payload: dict[str, Any]) -> dict[str, Any]:
        extension = str(payload["extension"])
        display_name = str(payload.get("display_name", extension))
        password = str(payload["password"])
        pin = str(payload.get("pin", extension))
        email = str(payload.get("email", ""))
        role = str(payload.get("role", "user"))
        self.store.create_extension(extension, display_name, password, pin, email, role)
        created = self.store.fetch_extension(extension)
        return asdict(created) if created else {}

    def set_presence(self, extension: str, presence: str) -> None:
        self.store.set_presence(extension, presence)

    def send_message(self, source_extension: str, target_extension: str, body: str) -> None:
        self.store.store_message(source_extension, target_extension, body)


"""SIP Registrar — RFC 3261 §10 + §22 digest authentication.

Stores active registrations in SQLite so that the routing layer (B2BUA)
can find the contact URI/transport for any extension.
"""

from __future__ import annotations

import time
from typing import Optional

from ..core import config
from ..core.eventbus import BUS
from ..core.log import get_logger
from ..sip import auth
from ..sip.dispatcher import Dispatcher
from ..sip.message import SipMessage, SipURI, make_response, parse_params, split_addr_uri
from ..sip.transport import RemoteAddr, Transport
from . import repo

log = get_logger("smurf.pbx.registrar")


def _challenge(req: SipMessage, transport: Transport, remote: RemoteAddr,
               *, realm: str, secret: str, algorithm: str = "MD5", stale: bool = False) -> SipMessage:
    nonce = auth.make_nonce(secret)
    chal = auth.build_challenge(realm, nonce, algorithm=algorithm, stale=stale)
    resp = make_response(req, 401, "Unauthorized",
                         to_tag="smurf-" + nonce[:8],
                         extra=[("WWW-Authenticate", chal)])
    return resp


async def handle_register(req: SipMessage, remote: RemoteAddr, transport: Transport,
                          dispatcher: Dispatcher) -> None:
    realm = config.get("domain", "smurf")
    secret_for_nonces = config.get("jwt_secret")  # reuse for nonce HMAC
    to_h = req.headers.get("To", "")
    _, to_uri, _ = split_addr_uri(to_h)
    aor_uri = SipURI.parse(to_uri)
    extension = aor_uri.user
    if not extension:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 400, "Missing AOR user", user_agent=dispatcher.user_agent))
        return
    ext_row = await repo.get_extension(extension)
    if not ext_row:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 404, "Extension not found", user_agent=dispatcher.user_agent))
        BUS.publish("sip.register.failed", {"extension": extension, "reason": "unknown", "ip": remote.host})
        return

    # Check Authorization
    auth_header = req.headers.get("Authorization")
    creds = auth.DigestCredentials.parse(auth_header) if auth_header else None
    if creds is None:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(_challenge(req, transport, remote, realm=realm, secret=secret_for_nonces))
        return
    if not auth.nonce_valid(secret_for_nonces, creds.nonce):
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(_challenge(req, transport, remote, realm=realm, secret=secret_for_nonces, stale=True))
        return
    ok = auth.verify(req.method, ext_row["secret"], creds)
    if not ok:
        st = dispatcher.server_tx_for(req)
        if st:
            await st.respond(make_response(req, 403, "Forbidden", user_agent=dispatcher.user_agent))
        BUS.publish("sip.register.failed", {"extension": extension, "reason": "bad_credentials", "ip": remote.host})
        f2b = config.all_settings()
        dispatcher.record_auth_failure(
            remote.host,
            max_attempts=int(f2b.get("fail2ban_max_attempts", 8)),
            window=float(f2b.get("fail2ban_window_seconds", 60)),
            ban_seconds=float(f2b.get("fail2ban_ban_seconds", 600)),
        )
        return

    contacts = req.headers.get_all("Contact")
    expires_default = req.headers.get("Expires")
    try:
        expires_default_n = int(expires_default) if expires_default else int(config.get("registration_default_expiry", 3600))
    except ValueError:
        expires_default_n = int(config.get("registration_default_expiry", 3600))
    min_e = int(config.get("registration_min_expiry", 60))
    max_e = int(config.get("registration_max_expiry", 7200))
    user_agent = req.headers.get("User-Agent", "")
    accepted_contacts: list[tuple[str, int]] = []
    if contacts and contacts[0].strip() == "*":
        # Unregister all
        await repo.remove_registration(extension)
        BUS.publish("sip.unregistered", {"extension": extension, "ip": remote.host})
    else:
        for c in contacts:
            display, uri, params = split_addr_uri(c)
            exp_raw = params.get("expires", str(expires_default_n))
            try:
                exp = int(exp_raw)
            except ValueError:
                exp = expires_default_n
            if exp == 0:
                await repo.remove_registration(extension, contact=uri)
                accepted_contacts.append((uri, 0))
                continue
            exp = max(min_e, min(max_e, exp))
            await repo.upsert_registration(
                extension=extension,
                contact=uri,
                transport=remote.transport,
                source_ip=remote.host,
                source_port=remote.port,
                user_agent=user_agent,
                expires_in=exp,
                call_id=req.call_id,
                cseq=req.cseq_number(),
            )
            accepted_contacts.append((uri, exp))
        BUS.publish("sip.registered", {"extension": extension, "ip": remote.host, "transport": remote.transport})

    # Build 200 OK echoing accepted contacts with their granted expirations.
    resp = make_response(req, 200, "OK",
                         to_tag="smurf-" + str(int(time.time()))[-8:],
                         user_agent=dispatcher.user_agent)
    for c, exp in accepted_contacts:
        resp.headers.add("Contact", f"<{c}>;expires={exp}")
    resp.headers.add("Date", time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime()))
    st = dispatcher.server_tx_for(req)
    if st:
        await st.respond(resp)

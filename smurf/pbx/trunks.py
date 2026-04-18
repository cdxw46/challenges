"""Outbound trunk registration loop.

For every enabled trunk with ``register=1`` and ``credentials`` auth mode,
SMURF periodically sends a SIP REGISTER towards the upstream provider.
This module implements the loop and digest authentication for outgoing
REGISTERs.  IP-authenticated trunks just need outbound INVITEs to come
from the right source IP — no registration is performed for those.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from ..core import config
from ..core.eventbus import BUS
from ..core.log import get_logger
from ..sip import auth
from ..sip.dialog import make_branch, make_call_id, make_tag
from ..sip.dispatcher import Dispatcher
from ..sip.message import SipMessage, SipURI
from ..sip.transport import RemoteAddr
from . import repo

log = get_logger("smurf.pbx.trunks")


class TrunkRegistrar:
    def __init__(self, dispatcher: Dispatcher) -> None:
        self.dispatcher = dispatcher
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                trunks = await repo.list_trunks()
                for t in trunks:
                    if not t.get("enabled"):
                        continue
                    if not t.get("register"):
                        continue
                    if t.get("auth_mode") != "credentials":
                        continue
                    try:
                        await self._register_one(t)
                    except Exception:
                        log.exception("Trunk %s register failed", t.get("name"))
            except asyncio.CancelledError:
                return
            except Exception:
                log.exception("Trunk loop tick")
            await asyncio.sleep(60)

    async def _register_one(self, trunk: dict[str, Any]) -> None:
        kind = trunk.get("transport", "udp")
        transport = self.dispatcher.transport_for(kind) or self.dispatcher.transport_for("udp")
        if transport is None:
            return
        host = trunk["host"]
        port = int(trunk.get("port", 5060))
        remote = RemoteAddr(kind, host, port)
        local_addr = transport.local_address
        local_ip = config.get("external_ip") or config.get("domain") or local_addr[0]
        from_user = trunk.get("from_user") or trunk.get("username") or "smurf"
        from_domain = trunk.get("from_domain") or host
        register = SipMessage(is_request=True, method="REGISTER", request_uri=f"sip:{host}")
        call_id = make_call_id(local_ip)
        register.headers.add("Via", f"SIP/2.0/{kind.upper()} {local_ip}:{local_addr[1]};branch={make_branch()};rport")
        register.headers.add("Max-Forwards", "70")
        register.headers.add("From", f"<sip:{from_user}@{from_domain}>;tag={make_tag()}")
        register.headers.add("To", f"<sip:{from_user}@{from_domain}>")
        register.headers.add("Call-ID", call_id)
        register.headers.add("CSeq", "1 REGISTER")
        register.headers.add("Contact", f"<sip:{from_user}@{local_ip}:{local_addr[1]};transport={kind}>")
        register.headers.add("Expires", "3600")
        register.headers.add("User-Agent", "SMURF/0.1")
        register.headers.add("Content-Length", "0")

        cseq = 1

        async def handler(resp: SipMessage) -> None:
            nonlocal cseq
            if resp.status_code in (401, 407):
                www = resp.headers.get("WWW-Authenticate") or resp.headers.get("Proxy-Authenticate")
                if not www:
                    log.warning("Trunk %s 401 without challenge", trunk["name"])
                    return
                creds = auth.DigestCredentials(
                    username=trunk.get("username", from_user),
                    realm="",
                    nonce="",
                    uri=f"sip:{host}",
                    response="",
                )
                # Parse challenge
                params = auth._parse_digest_params(www[6:].strip()) if www.lower().startswith("digest") else {}
                creds.realm = params.get("realm", "")
                creds.nonce = params.get("nonce", "")
                creds.algorithm = params.get("algorithm", "MD5")
                if params.get("qop"):
                    creds.qop = "auth"
                    creds.nc = "00000001"
                    creds.cnonce = "smurf-cnonce"
                creds.response = auth.expected_response("REGISTER", trunk.get("secret", ""), creds)
                cseq += 1
                register.headers.set("CSeq", f"{cseq} REGISTER")
                hdr = (
                    f'Digest username="{creds.username}", realm="{creds.realm}", nonce="{creds.nonce}", '
                    f'uri="{creds.uri}", response="{creds.response}", algorithm={creds.algorithm}'
                )
                if creds.qop:
                    hdr += f', qop=auth, nc={creds.nc}, cnonce="{creds.cnonce}"'
                register.headers.set("Authorization", hdr)
                # Update branch for new transaction
                via = register.first_via().split(";branch=")[0] + ";branch=" + make_branch() + ";rport"
                register.headers.set("Via", via)
                await self.dispatcher.send_request(register, remote, transport, on_response=handler)
                return
            if 200 <= resp.status_code < 300:
                BUS.publish("trunk.registered", {"name": trunk["name"], "host": host})
            else:
                BUS.publish("trunk.failed", {"name": trunk["name"], "host": host, "code": resp.status_code})

        await self.dispatcher.send_request(register, remote, transport, on_response=handler)

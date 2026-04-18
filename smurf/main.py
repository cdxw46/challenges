"""SMURF entry point — boots all subsystems and the HTTP/HTTPS admin server.

Subsystems started:
  * SQLite database
  * SIP dispatcher with UDP, TCP, TLS and WS/WSS transports
  * SIP registrar + B2BUA
  * Trunk registration loop
  * Conference manager
  * Voicemail service (+ MWI listener, email listener)
  * FastAPI admin/REST/WS server (HTTP + HTTPS) with provisioning router
  * Watchdog: periodic GC of stale registrations and transactions
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import signal
from pathlib import Path
from typing import Any

import uvicorn

from .api.server import app as fastapi_app
from .core import config
from .core.eventbus import BUS
from .core.log import get_logger
from .db.store import get_db
from .pbx import repo
from .pbx.b2bua import B2BUA
from .pbx.conference import ConferenceManager
from .pbx.registrar import handle_register
from .pbx.trunks import TrunkRegistrar
from .pbx.voicemail import VoicemailService, voicemail_email_listener
from .provisioning.server import router as provisioning_router
from .rtp.wav import make_default_moh
from .sip.dispatcher import Dispatcher
from .sip.transport import RemoteAddr, Transport, TCPTransport, UDPTransport, make_self_signed_context
from .sip.ws_transport import WSTransport

log = get_logger("smurf.main")


async def _gc_loop() -> None:
    while True:
        try:
            await asyncio.sleep(30)
            await repo.gc_registrations()
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("GC loop tick")


async def _seed_demo_data() -> None:
    """Make SMURF immediately useful out of the box.

    Creates two extensions (1001/1002) with predictable secrets so the user
    can register a real softphone without first opening the admin panel.
    """

    if not await repo.list_extensions():
        await repo.create_extension(number="1001", display_name="Demo Phone 1",
                                    secret="smurf1001", voicemail_pin="1001")
        await repo.create_extension(number="1002", display_name="Demo Phone 2",
                                    secret="smurf1002", voicemail_pin="1002")
        await repo.create_extension(number="1003", display_name="Demo Phone 3",
                                    secret="smurf1003", voicemail_pin="1003")
        log.info("Seeded demo extensions 1001/1002/1003")


async def boot() -> dict[str, Any]:
    db = await get_db()
    await repo.ensure_default_admin()
    await _seed_demo_data()
    # MoH default
    moh_default = Path(config.MOH_DIR) / "default.wav"
    if not moh_default.exists():
        make_default_moh(moh_default, seconds=8.0)

    dispatcher = Dispatcher(user_agent="SMURF/0.1")

    udp = UDPTransport(dispatcher.handle, "0.0.0.0", int(config.get("sip_udp_port", 5060)))
    tcp = TCPTransport(dispatcher.handle, "0.0.0.0", int(config.get("sip_tcp_port", 5060)), name="tcp")
    dispatcher.register_transport(udp)
    dispatcher.register_transport(tcp)

    # TLS / WSS — generate cert if missing
    tls_ctx = make_self_signed_context(
        config.get("tls_cert_file"), config.get("tls_key_file"),
        common_name=str(config.get("domain", "smurf")),
    )
    try:
        tls = TCPTransport(dispatcher.handle, "0.0.0.0",
                           int(config.get("sip_tls_port", 5061)),
                           tls=tls_ctx, name="tls")
        dispatcher.register_transport(tls)
    except Exception:
        log.exception("TLS transport setup failed (continuing without)")
    try:
        ws = WSTransport(dispatcher.handle, "0.0.0.0", int(config.get("sip_ws_port", 8088)))
        dispatcher.register_transport(ws)
    except Exception:
        log.exception("WS transport setup failed")
    try:
        wss = WSTransport(dispatcher.handle, "0.0.0.0", int(config.get("sip_wss_port", 8089)),
                          tls=tls_ctx)
        dispatcher.register_transport(wss)
    except Exception:
        log.exception("WSS transport setup failed")

    # Wire SIP application
    conference = ConferenceManager()
    voicemail = VoicemailService()
    voicemail.dispatcher = dispatcher
    b2bua = B2BUA(conference=conference, voicemail=voicemail)
    b2bua.attach(dispatcher)

    # Registrar handler
    dispatcher.on("REGISTER")(handle_register)

    await dispatcher.start()
    trunks = TrunkRegistrar(dispatcher)
    await trunks.start()

    # Background tasks
    bg_tasks = [
        asyncio.create_task(_gc_loop(), name="gc"),
        asyncio.create_task(voicemail_email_listener(voicemail), name="vm-email"),
    ]

    # Mount provisioning router on the FastAPI app
    fastapi_app.include_router(provisioning_router, prefix="/prov")

    return {
        "dispatcher": dispatcher,
        "b2bua": b2bua,
        "trunks": trunks,
        "bg_tasks": bg_tasks,
        "tls_ctx": tls_ctx,
    }


async def _serve_uvicorn(host: str, http_port: int, https_port: int, tls_ctx_path: tuple[str, str]) -> None:
    cert, key = tls_ctx_path
    cfg_http = uvicorn.Config(fastapi_app, host=host, port=http_port, log_level="warning",
                              proxy_headers=True, forwarded_allow_ips="*")
    cfg_https = uvicorn.Config(fastapi_app, host=host, port=https_port, log_level="warning",
                               ssl_certfile=cert, ssl_keyfile=key,
                               proxy_headers=True, forwarded_allow_ips="*")
    s_http = uvicorn.Server(cfg_http)
    s_https = uvicorn.Server(cfg_https)
    await asyncio.gather(s_http.serve(), s_https.serve())


async def amain() -> None:
    state = await boot()
    log.info("SMURF booted — http://0.0.0.0:%s  https://0.0.0.0:%s",
             config.get("admin_http_port"), config.get("admin_https_port"))
    BUS.publish("smurf.boot", {"version": "0.1.0"})
    cert = config.get("tls_cert_file")
    key = config.get("tls_key_file")
    server_task = asyncio.create_task(_serve_uvicorn(
        "0.0.0.0", int(config.get("admin_http_port", 5000)),
        int(config.get("admin_https_port", 5001)), (cert, key),
    ), name="api-servers")
    stop_event = asyncio.Event()

    def _signal(sig: int, _frame: Any | None = None) -> None:
        log.info("Got signal %s — shutting down", sig)
        stop_event.set()

    loop = asyncio.get_running_loop()
    for s in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(s, _signal, s)
        except NotImplementedError:
            signal.signal(s, _signal)

    await stop_event.wait()
    server_task.cancel()
    for t in state["bg_tasks"]:
        t.cancel()
    with contextlib.suppress(Exception):
        await state["dispatcher"].stop()


def main() -> None:
    try:
        asyncio.run(amain())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

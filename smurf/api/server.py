"""FastAPI app: admin REST + WS events + softphone signaling endpoints.

The signaling for browser softphones is plain SIP-over-WebSocket — that
runs on its own port (``sip_ws_port`` / ``sip_wss_port``) handled by the
SIP dispatcher.  This server exposes the management API and the static
web app (admin SPA + softphone UI).
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any, Optional

import pyotp
import qrcode
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    Request,
    UploadFile,
    File,
    Form,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    PlainTextResponse,
    Response,
    StreamingResponse,
)
from fastapi.staticfiles import StaticFiles
from passlib.hash import bcrypt
from pydantic import BaseModel, Field

from ..core import config
from ..core.eventbus import BUS
from ..core.log import get_logger
from ..pbx import dialplan as dialplan_mod
from ..pbx import repo
from ..pbx.b2bua import REGISTRY
from . import auth as api_auth

log = get_logger("smurf.api")
app = FastAPI(title="SMURF PBX", version="0.1.0", docs_url="/api/docs", redoc_url="/api/redoc",
              openapi_url="/api/openapi.json")


@app.on_event("startup")
async def _startup() -> None:
    await repo.ensure_default_admin()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginIn(BaseModel):
    username: str
    password: str
    totp: str | None = None


@app.post("/api/auth/login")
async def login(body: LoginIn):
    user = await repo.find_user(body.username)
    if not user or not bcrypt.verify(body.password, user["password_hash"]):
        raise HTTPException(401, detail="bad credentials")
    if user.get("totp_enabled") and user.get("totp_secret"):
        if not body.totp or not pyotp.TOTP(user["totp_secret"]).verify(body.totp, valid_window=1):
            raise HTTPException(401, detail="bad totp")
    token = api_auth.issue_token(user["username"], user["role"])
    BUS.publish("admin.login", {"user": user["username"]})
    resp = JSONResponse({"token": token, "role": user["role"], "username": user["username"]})
    resp.set_cookie("smurf_token", token, httponly=True, samesite="lax")
    return resp


@app.post("/api/auth/logout")
async def logout(_: dict = Depends(api_auth.current_user)):
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("smurf_token")
    return resp


@app.get("/api/auth/me")
async def whoami(user: dict = Depends(api_auth.current_user)):
    return user


@app.post("/api/auth/2fa/enable")
async def enable_2fa(user: dict = Depends(api_auth.current_user)):
    secret = pyotp.random_base32()
    from ..db.store import get_db
    db = await get_db()
    await db.execute("UPDATE users SET totp_secret=?, totp_enabled=1 WHERE username=?",
                     (secret, user["username"]))
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["username"], issuer_name="SMURF PBX")
    img = qrcode.make(uri)
    buf = __import__("io").BytesIO()
    img.save(buf, format="PNG")
    return Response(buf.getvalue(), media_type="image/png")


@app.post("/api/auth/2fa/disable")
async def disable_2fa(user: dict = Depends(api_auth.current_user)):
    from ..db.store import get_db
    db = await get_db()
    await db.execute("UPDATE users SET totp_secret=NULL, totp_enabled=0 WHERE username=?",
                     (user["username"],))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health / info
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"ok": True, "ts": int(time.time())}


@app.get("/api/info")
async def info(_user: dict = Depends(api_auth.current_user)):
    return {
        "version": "0.1.0",
        "domain": config.get("domain"),
        "external_ip": config.get("external_ip"),
        "ports": {
            "sip_udp": config.get("sip_udp_port"),
            "sip_tcp": config.get("sip_tcp_port"),
            "sip_tls": config.get("sip_tls_port"),
            "sip_ws": config.get("sip_ws_port"),
            "sip_wss": config.get("sip_wss_port"),
            "rtp_min": config.get("rtp_port_min"),
            "rtp_max": config.get("rtp_port_max"),
            "admin_https": config.get("admin_https_port"),
            "admin_http": config.get("admin_http_port"),
            "provisioning": config.get("provisioning_port"),
        },
    }


# ---------------------------------------------------------------------------
# Extensions
# ---------------------------------------------------------------------------

class ExtensionIn(BaseModel):
    number: str
    display_name: str
    secret: Optional[str] = None
    email: Optional[str] = None
    voicemail_pin: Optional[str] = None
    record_calls: bool = False
    max_concurrent: int = 2


@app.get("/api/extensions")
async def list_extensions(_user: dict = Depends(api_auth.current_user)):
    rows = await repo.list_extensions()
    regs = await repo.all_registrations()
    by_ext: dict[str, list[dict]] = {}
    for r in regs:
        by_ext.setdefault(r["extension"], []).append(r)
    for r in rows:
        r["registrations"] = by_ext.get(r["number"], [])
        r["online"] = bool(r["registrations"])
    return rows


@app.post("/api/extensions")
async def create_extension(body: ExtensionIn, user=Depends(api_auth.require_role("admin"))):
    existing = await repo.get_extension(body.number)
    if existing:
        raise HTTPException(409, "exists")
    row = await repo.create_extension(**body.model_dump())
    await repo.audit(user["username"], "ext.create", body.number)
    BUS.publish("ext.created", {"number": body.number})
    return row


@app.put("/api/extensions/{number}")
async def update_extension(number: str, body: dict, user=Depends(api_auth.require_role("admin"))):
    body.pop("id", None)
    body.pop("created_at", None)
    body.pop("number", None)
    if "secret" in body and not body["secret"]:
        body.pop("secret")
    await repo.update_extension(number, **body)
    await repo.audit(user["username"], "ext.update", number)
    BUS.publish("ext.updated", {"number": number})
    return await repo.get_extension(number)


@app.delete("/api/extensions/{number}")
async def delete_extension(number: str, user=Depends(api_auth.require_role("admin"))):
    await repo.delete_extension(number)
    await repo.audit(user["username"], "ext.delete", number)
    BUS.publish("ext.deleted", {"number": number})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

@app.get("/api/registrations")
async def list_regs(_user=Depends(api_auth.current_user)):
    return await repo.all_registrations()


# ---------------------------------------------------------------------------
# Trunks
# ---------------------------------------------------------------------------

import warnings as _warnings
_warnings.filterwarnings("ignore", message=r"Field name \"register\".*", category=UserWarning)


class TrunkIn(BaseModel):
    name: str
    host: str
    port: int = 5060
    transport: str = "udp"
    username: Optional[str] = None
    secret: Optional[str] = None
    auth_mode: str = "credentials"
    do_register: bool = Field(True, alias="register", serialization_alias="register")
    enabled: bool = True
    priority: int = 10
    caller_id: Optional[str] = None
    from_user: Optional[str] = None
    from_domain: Optional[str] = None
    model_config = {"populate_by_name": True}


@app.get("/api/trunks")
async def list_trunks(_user=Depends(api_auth.current_user)):
    return await repo.list_trunks()


@app.post("/api/trunks")
async def create_trunk(body: TrunkIn, user=Depends(api_auth.require_role("admin"))):
    data = body.model_dump(by_alias=False)
    if "do_register" in data:
        data["register"] = int(bool(data.pop("do_register")))
    if "enabled" in data:
        data["enabled"] = int(bool(data["enabled"]))
    return await repo.create_trunk(**{k: v for k, v in data.items() if v is not None})


@app.delete("/api/trunks/{trunk_id}")
async def delete_trunk(trunk_id: int, user=Depends(api_auth.require_role("admin"))):
    await repo.delete_trunk(trunk_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dial plan
# ---------------------------------------------------------------------------

class DialPlanIn(BaseModel):
    name: str
    direction: str = "outbound"
    pattern: str
    action: str
    target: str
    strip: int = 0
    prepend: Optional[str] = None
    priority: int = 10
    enabled: bool = True


@app.get("/api/dialplan")
async def list_dp(_user=Depends(api_auth.current_user)):
    return await repo.list_dialplan()


@app.post("/api/dialplan")
async def create_dp(body: DialPlanIn, user=Depends(api_auth.require_role("admin"))):
    return await repo.create_dialplan(**body.model_dump())


@app.delete("/api/dialplan/{rule_id}")
async def del_dp(rule_id: int, user=Depends(api_auth.require_role("admin"))):
    await repo.delete_dialplan(rule_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Ring groups, queues, IVRs
# ---------------------------------------------------------------------------

class RingGroupIn(BaseModel):
    number: str
    name: str
    strategy: str = "ringall"
    members: list[str] = Field(default_factory=list)
    timeout: int = 30
    fail_target: Optional[str] = None


@app.get("/api/ring-groups")
async def list_rg(_user=Depends(api_auth.current_user)):
    return await repo.list_ring_groups()


@app.post("/api/ring-groups")
async def upsert_rg(body: RingGroupIn, user=Depends(api_auth.require_role("admin"))):
    await repo.upsert_ring_group(**body.model_dump())
    return await repo.get_ring_group(body.number)


class QueueIn(BaseModel):
    number: str
    name: str
    strategy: str = "roundrobin"
    members: list[str] = Field(default_factory=list)
    max_wait: int = 300
    moh: Optional[str] = None
    timeout: Optional[str] = None
    announce_position: bool = True


@app.get("/api/queues")
async def list_q(_user=Depends(api_auth.current_user)):
    return await repo.list_queues()


@app.post("/api/queues")
async def upsert_q(body: QueueIn, user=Depends(api_auth.require_role("admin"))):
    await repo.upsert_queue(**body.model_dump())
    return await repo.get_queue(body.number)


class IVROptionIn(BaseModel):
    number: str
    name: str
    greeting: Optional[str] = None
    timeout: int = 5
    invalid_target: Optional[str] = None
    timeout_target: Optional[str] = None
    options: dict[str, str] = Field(default_factory=dict)


@app.get("/api/ivrs")
async def list_ivr(_user=Depends(api_auth.current_user)):
    return await repo.list_ivrs()


@app.post("/api/ivrs")
async def upsert_ivr(body: IVROptionIn, user=Depends(api_auth.require_role("admin"))):
    await repo.upsert_ivr(**body.model_dump())
    return await repo.get_ivr(body.number)


# ---------------------------------------------------------------------------
# CDR / recordings / voicemail / chat
# ---------------------------------------------------------------------------

@app.get("/api/cdr")
async def cdr(_user=Depends(api_auth.current_user), limit: int = 200):
    return await repo.cdr_recent(limit=limit)


@app.get("/api/cdr.csv")
async def cdr_csv(_user=Depends(api_auth.current_user), limit: int = 5000):
    rows = await repo.cdr_recent(limit=limit)
    cols = ["id", "call_id", "direction", "src", "dst", "started_at", "answered_at", "ended_at",
            "duration", "billsec", "disposition", "hangup_cause", "trunk", "recording_path"]

    def gen():
        yield ",".join(cols).encode() + b"\n"
        for r in rows:
            yield (",".join(str(r.get(c, "") or "") for c in cols)).encode() + b"\n"

    return StreamingResponse(gen(), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=cdr.csv"})


@app.get("/api/recordings")
async def list_rec(_user=Depends(api_auth.current_user)):
    return await repo.rec_list()


@app.get("/api/recordings/{rec_id}/download")
async def download_rec(rec_id: int, _user=Depends(api_auth.current_user)):
    rows = await repo.rec_list(limit=10000)
    rec = next((r for r in rows if r["id"] == rec_id), None)
    if not rec:
        raise HTTPException(404)
    return FileResponse(rec["file_path"], filename=Path(rec["file_path"]).name)


@app.get("/api/voicemail/{ext}")
async def list_vm(ext: str, _user=Depends(api_auth.current_user)):
    return await repo.vm_list(ext)


@app.get("/api/voicemail/{ext}/{vm_id}/audio")
async def vm_audio(ext: str, vm_id: int, _user=Depends(api_auth.current_user)):
    msgs = await repo.vm_list(ext)
    m = next((x for x in msgs if x["id"] == vm_id), None)
    if not m:
        raise HTTPException(404)
    return FileResponse(m["file_path"], media_type="audio/wav")


@app.post("/api/voicemail/{ext}/{vm_id}/seen")
async def vm_seen(ext: str, vm_id: int, _user=Depends(api_auth.current_user)):
    await repo.vm_mark_seen(vm_id)
    return {"ok": True}


@app.delete("/api/voicemail/{ext}/{vm_id}")
async def vm_delete(ext: str, vm_id: int, _user=Depends(api_auth.current_user)):
    await repo.vm_delete(vm_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class ChatMsg(BaseModel):
    sender: str
    recipient: str
    body: str


@app.post("/api/chat/send")
async def chat_send(msg: ChatMsg, _user=Depends(api_auth.current_user)):
    mid = await repo.chat_send(msg.sender, msg.recipient, msg.body)
    BUS.publish("chat.message", {"from": msg.sender, "to": msg.recipient, "body": msg.body, "id": mid})
    return {"id": mid}


@app.get("/api/chat/history")
async def chat_history(a: str, b: str, _user=Depends(api_auth.current_user), limit: int = 200):
    return list(reversed(await repo.chat_history(a, b, limit=limit)))


# ---------------------------------------------------------------------------
# Active calls (real-time monitor)
# ---------------------------------------------------------------------------

@app.get("/api/calls/active")
async def calls_active(_user=Depends(api_auth.current_user)):
    out = []
    for s in REGISTRY.all_active():
        out.append({
            "call_id": s.call_id,
            "src": s.src_number,
            "dst": s.dst_number,
            "started_at": s.started_at,
            "answered_at": s.answered_at,
            "direction": s.direction,
            "a_codec": s.a.rtp.codec_name if s.a.rtp else None,
            "b_codec": s.b.rtp.codec_name if s.b and s.b.rtp else None,
        })
    return out


@app.post("/api/calls/{call_id}/hangup")
async def hangup_call(call_id: str, user=Depends(api_auth.require_role("admin"))):
    s = REGISTRY.by_callid(call_id)
    if not s:
        raise HTTPException(404)
    from ..pbx.b2bua import B2BUA  # noqa
    # Use any leg's transport
    for leg in (s.a, s.b):
        if leg and leg.dialog:
            from ..pbx import b2bua as _b2
            # We don't have B2BUA instance here — schedule cleanup via event
    BUS.publish("call.admin_hangup", {"call_id": call_id, "by": user["username"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

@app.get("/api/settings")
async def settings_get(_user=Depends(api_auth.require_role("admin"))):
    return config.all_settings()


@app.put("/api/settings")
async def settings_put(body: dict, user=Depends(api_auth.require_role("admin"))):
    for k, v in body.items():
        config.set(k, v)
    await repo.audit(user["username"], "settings.update", json.dumps(list(body.keys())))
    return config.all_settings()


# ---------------------------------------------------------------------------
# Music on hold
# ---------------------------------------------------------------------------

@app.get("/api/moh")
async def moh_list(_user=Depends(api_auth.current_user)):
    return [p.name for p in Path(config.MOH_DIR).glob("*.wav")]


@app.post("/api/moh/upload")
async def moh_upload(file: UploadFile = File(...), _user=Depends(api_auth.require_role("admin"))):
    out = Path(config.MOH_DIR) / file.filename
    out.write_bytes(await file.read())
    return {"name": file.filename}


# ---------------------------------------------------------------------------
# Webhooks
# ---------------------------------------------------------------------------

@app.get("/api/webhooks")
async def webhooks_list(_user=Depends(api_auth.require_role("admin"))):
    from ..db.store import get_db
    db = await get_db()
    return await db.fetchall("SELECT * FROM webhooks ORDER BY id")


# ---------------------------------------------------------------------------
# Real-time WebSocket events
# ---------------------------------------------------------------------------

@app.websocket("/api/ws/events")
async def ws_events(ws: WebSocket):
    await ws.accept()
    # Optional auth: ?token=...
    token = ws.query_params.get("token")
    if token:
        try:
            api_auth.decode_token(token)
        except Exception:
            await ws.close(code=4401)
            return
    sub = BUS.subscribe("*")
    try:
        # Send a hello with recent events
        for ev in BUS.history()[-50:]:
            await ws.send_json({"topic": ev.topic, "payload": ev.payload, "ts": ev.ts})
        while True:
            ev = await sub.get()
            await ws.send_json({"topic": ev.topic, "payload": ev.payload, "ts": ev.ts})
    except WebSocketDisconnect:
        return
    finally:
        BUS.unsubscribe("*", sub)


# ---------------------------------------------------------------------------
# Static SPA
# ---------------------------------------------------------------------------

STATIC = Path(__file__).resolve().parents[1] / "web" / "static"
TEMPLATES = Path(__file__).resolve().parents[1] / "web" / "templates"

app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/manifest.webmanifest")
async def manifest():
    return JSONResponse({
        "name": "SMURF PBX",
        "short_name": "SMURF",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0d1117",
        "theme_color": "#1f6feb",
        "icons": [{"src": "/static/icon-192.png", "sizes": "192x192", "type": "image/png"},
                   {"src": "/static/icon-512.png", "sizes": "512x512", "type": "image/png"}],
    })


@app.get("/sw.js")
async def service_worker():
    sw = STATIC / "sw.js"
    if sw.exists():
        return FileResponse(sw, media_type="application/javascript")
    return PlainTextResponse("", media_type="application/javascript")


@app.get("/", response_class=HTMLResponse)
async def root_index():
    return FileResponse(TEMPLATES / "index.html")


@app.get("/softphone", response_class=HTMLResponse)
async def softphone_page():
    return FileResponse(TEMPLATES / "softphone.html")


@app.get("/login", response_class=HTMLResponse)
async def login_page():
    return FileResponse(TEMPLATES / "login.html")


@app.get("/admin", response_class=HTMLResponse)
async def admin_page():
    return FileResponse(TEMPLATES / "admin.html")

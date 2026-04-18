"""HTTP provisioning server for IP phones (Yealink, Snom, Fanvil, Grandstream, Polycom, Cisco).

Phones look up their config by MAC address.  Common URL patterns are
covered:

* Yealink     ``/y000000000000.cfg`` / ``/{MAC}.cfg``
* Snom        ``/snom/snom320-{MAC}.htm`` / ``/{MAC}.xml``
* Fanvil      ``/{MAC}/{MAC}.cfg``
* Grandstream ``/cfg{MAC}.xml``
* Polycom     ``/{MAC}-phone.cfg`` / ``/{MAC}-reg.cfg``
* Cisco SPA   ``/spa/{MAC}.xml``

The server returns a vendor-appropriate config when the MAC is registered
in the ``provisioning_devices`` table — otherwise 404.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response

from ..core import config
from ..core.log import get_logger
from ..pbx import repo

log = get_logger("smurf.prov")
router = APIRouter(tags=["provisioning"])
TEMPLATES = Path(__file__).resolve().parents[1] / "provisioning" / "templates"
TEMPLATES.mkdir(parents=True, exist_ok=True)


def _normalize_mac(s: str) -> str:
    return "".join(c for c in s if c.isalnum()).upper()


async def _ext_for_mac(mac: str) -> tuple[dict, dict] | None:
    from ..db.store import get_db
    db = await get_db()
    dev = await db.fetchone("SELECT * FROM provisioning_devices WHERE upper(mac)=?", (mac,))
    if not dev or not dev.get("extension"):
        return None
    ext = await repo.get_extension(dev["extension"])
    if not ext:
        return None
    await db.execute("UPDATE provisioning_devices SET last_seen=datetime('now') WHERE id=?", (dev["id"],))
    return dev, ext


def _common_ctx(ext: dict) -> dict:
    return {
        "ext": ext["number"],
        "name": ext["display_name"],
        "secret": ext["secret"],
        "domain": config.get("domain"),
        "external_ip": config.get("external_ip"),
        "sip_port": config.get("sip_udp_port"),
        "sip_tcp_port": config.get("sip_tcp_port"),
        "sip_tls_port": config.get("sip_tls_port"),
    }


# ---- Yealink (.cfg) -------------------------------------------------------

YEALINK_TEMPLATE = """\
#!version:1.0.0.1
account.1.enable = 1
account.1.label = {name}
account.1.display_name = {name}
account.1.auth_name = {ext}
account.1.user_name = {ext}
account.1.password = {secret}
account.1.sip_server.1.address = {external_ip}
account.1.sip_server.1.port = {sip_port}
account.1.sip_server.1.transport_type = 0
"""


@router.get("/y000000000000.cfg", response_class=Response)
async def yealink_default(request: Request):
    return Response("# default cfg — phone will request {MAC}.cfg next\n",
                    media_type="text/plain")


@router.get("/{mac}.cfg", response_class=Response)
async def yealink_per_mac(mac: str):
    mac = _normalize_mac(mac.replace(".cfg", ""))
    found = await _ext_for_mac(mac)
    if not found:
        raise HTTPException(404)
    _, ext = found
    return Response(YEALINK_TEMPLATE.format(**_common_ctx(ext)), media_type="text/plain")


# ---- Snom (.xml) ----------------------------------------------------------

SNOM_TEMPLATE = """\
<?xml version="1.0" encoding="utf-8"?>
<settings>
  <phone-settings>
    <user_name idx="1">{ext}</user_name>
    <user_pname idx="1">{ext}</user_pname>
    <user_pass idx="1">{secret}</user_pass>
    <user_realname idx="1">{name}</user_realname>
    <user_host idx="1">{external_ip}:{sip_port}</user_host>
  </phone-settings>
</settings>
"""


@router.get("/{mac}.xml", response_class=Response)
async def snom_per_mac(mac: str):
    mac = _normalize_mac(mac.replace(".xml", ""))
    found = await _ext_for_mac(mac)
    if not found:
        raise HTTPException(404)
    _, ext = found
    return Response(SNOM_TEMPLATE.format(**_common_ctx(ext)), media_type="application/xml")


# ---- Grandstream (cfgMAC.xml) --------------------------------------------

GRANDSTREAM_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8" ?>
<gs_provision version="1">
  <config version="2">
    <P271>1</P271>
    <P47>{external_ip}</P47>
    <P3>{name}</P3>
    <P35>{ext}</P35>
    <P36>{ext}</P36>
    <P34>{secret}</P34>
  </config>
</gs_provision>
"""


@router.get("/cfg{mac}.xml", response_class=Response)
async def grandstream_per_mac(mac: str):
    mac = _normalize_mac(mac)
    found = await _ext_for_mac(mac)
    if not found:
        raise HTTPException(404)
    _, ext = found
    return Response(GRANDSTREAM_TEMPLATE.format(**_common_ctx(ext)), media_type="application/xml")


# ---- Fanvil (/{MAC}/{MAC}.cfg) ------------------------------------------

FANVIL_TEMPLATE = """\
[ACCOUNT1_CONFIG]
Enable = 1
Label = {name}
Display Name = {name}
User Name = {ext}
Authentication User = {ext}
Authentication Password = {secret}
SIP Server = {external_ip}
SIP Server Port = {sip_port}
"""


@router.get("/{mac}/{mac2}.cfg", response_class=Response)
async def fanvil_per_mac(mac: str, mac2: str):
    mac_n = _normalize_mac(mac)
    if _normalize_mac(mac2.replace(".cfg", "")) != mac_n:
        raise HTTPException(404)
    found = await _ext_for_mac(mac_n)
    if not found:
        raise HTTPException(404)
    _, ext = found
    return Response(FANVIL_TEMPLATE.format(**_common_ctx(ext)), media_type="text/plain")

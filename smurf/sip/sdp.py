"""Minimal but real RFC 4566 SDP parser/builder geared at PBX usage.

We only need to negotiate audio codecs, RTP ports, ptime, telephone-event
(DTMF) and direction (sendrecv/sendonly/recvonly/inactive).  The model
preserves the original payload-type IDs so we can echo what an offerer
asked for in answers — which keeps Linphone, MicroSIP, Yealink, Polycom,
softphones embedded in browsers, etc., happy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

CRLF = "\r\n"


@dataclass
class CodecInfo:
    pt: int
    name: str
    rate: int = 8000
    channels: int = 1
    fmtp: str = ""


@dataclass
class MediaDescription:
    media: str = "audio"
    port: int = 0
    proto: str = "RTP/AVP"
    codecs: list[CodecInfo] = field(default_factory=list)
    direction: str = "sendrecv"
    ptime: int = 20
    dtmf_pt: int | None = None
    crypto: list[str] = field(default_factory=list)


@dataclass
class SDP:
    origin: str = "- 0 0 IN IP4 0.0.0.0"
    name: str = "SMURF"
    conn_addr: str = "0.0.0.0"
    sess_id: int = 0
    media: list[MediaDescription] = field(default_factory=list)


def parse(text: bytes | str) -> SDP:
    if isinstance(text, bytes):
        text = text.decode("utf-8", errors="replace")
    sdp = SDP()
    cur: MediaDescription | None = None
    for raw_line in text.splitlines():
        if not raw_line or "=" not in raw_line:
            continue
        k, v = raw_line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if k == "o":
            sdp.origin = v
            parts = v.split()
            if len(parts) >= 2:
                try:
                    sdp.sess_id = int(parts[1])
                except ValueError:
                    pass
        elif k == "s":
            sdp.name = v
        elif k == "c":
            parts = v.split()
            if len(parts) >= 3:
                sdp.conn_addr = parts[2].split("/")[0]
                if cur is not None:
                    cur.__dict__.setdefault("conn_addr", sdp.conn_addr)
        elif k == "m":
            parts = v.split()
            cur = MediaDescription()
            cur.media = parts[0]
            cur.port = int(parts[1].split("/")[0])
            cur.proto = parts[2] if len(parts) > 2 else "RTP/AVP"
            for pt_s in parts[3:]:
                try:
                    pt = int(pt_s)
                except ValueError:
                    continue
                cur.codecs.append(_default_for_pt(pt))
            sdp.media.append(cur)
        elif k == "a" and cur is not None:
            _apply_attr(cur, v)
    return sdp


def _default_for_pt(pt: int) -> CodecInfo:
    static = {
        0: ("PCMU", 8000, 1),
        3: ("GSM", 8000, 1),
        8: ("PCMA", 8000, 1),
        9: ("G722", 8000, 1),
        18: ("G729", 8000, 1),
    }
    if pt in static:
        name, rate, ch = static[pt]
        return CodecInfo(pt=pt, name=name, rate=rate, channels=ch)
    return CodecInfo(pt=pt, name="dynamic", rate=0, channels=1)


def _apply_attr(media: MediaDescription, attr: str) -> None:
    if attr in ("sendrecv", "sendonly", "recvonly", "inactive"):
        media.direction = attr
        return
    if attr.startswith("rtpmap:"):
        rest = attr[7:]
        try:
            pt_s, payload = rest.split(" ", 1)
            pt = int(pt_s)
            name, *rate_part = payload.split("/")
            rate = int(rate_part[0]) if rate_part else 8000
            channels = int(rate_part[1]) if len(rate_part) > 1 else 1
        except (ValueError, IndexError):
            return
        for c in media.codecs:
            if c.pt == pt:
                c.name = name
                c.rate = rate
                c.channels = channels
                if name.lower() == "telephone-event":
                    media.dtmf_pt = pt
                break
        else:
            media.codecs.append(CodecInfo(pt=pt, name=name, rate=rate, channels=channels))
    elif attr.startswith("fmtp:"):
        rest = attr[5:]
        try:
            pt_s, payload = rest.split(" ", 1)
            pt = int(pt_s)
        except ValueError:
            return
        for c in media.codecs:
            if c.pt == pt:
                c.fmtp = payload
                break
    elif attr.startswith("ptime:"):
        try:
            media.ptime = int(attr[6:])
        except ValueError:
            pass
    elif attr.startswith("crypto:"):
        media.crypto.append(attr[7:])


def build(*, sess_id: int, sess_version: int, ip: str, media: list[MediaDescription]) -> bytes:
    lines = [
        "v=0",
        f"o=- {sess_id} {sess_version} IN IP4 {ip}",
        "s=SMURF",
        f"c=IN IP4 {ip}",
        "t=0 0",
    ]
    for m in media:
        pts = " ".join(str(c.pt) for c in m.codecs)
        lines.append(f"m={m.media} {m.port} {m.proto} {pts}")
        for c in m.codecs:
            lines.append(f"a=rtpmap:{c.pt} {c.name}/{c.rate}" + (f"/{c.channels}" if c.channels > 1 else ""))
            if c.fmtp:
                lines.append(f"a=fmtp:{c.pt} {c.fmtp}")
        lines.append(f"a=ptime:{m.ptime}")
        lines.append(f"a={m.direction}")
    return (CRLF.join(lines) + CRLF).encode("utf-8")


def negotiate(offer: SDP, our_codecs: Iterable[str]) -> tuple[CodecInfo, int | None] | None:
    """Pick the first codec from ``our_codecs`` that the offer also lists.

    Returns ``(codec, dtmf_pt)`` or ``None`` if nothing matched.
    """

    if not offer.media:
        return None
    audio = next((m for m in offer.media if m.media == "audio"), None)
    if audio is None:
        return None
    our_norm = [c.upper() for c in our_codecs]
    pick: CodecInfo | None = None
    for c in audio.codecs:
        if c.name and c.name.upper() in our_norm:
            pick = c
            break
    if pick is None:
        return None
    return pick, audio.dtmf_pt

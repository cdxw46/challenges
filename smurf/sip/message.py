"""SIP message model and parser/serializer.

Implements enough of RFC 3261 to be a usable SIP stack: request-line and
status-line parsing, header folding, multi-value header preservation,
case-insensitive name matching with compact-form aliases, Via/From/To/CSeq/
Contact helpers, body handling and a robust serializer that always emits a
correct ``Content-Length``.

This file deliberately avoids any third-party SIP library.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Iterable, Optional

CRLF = "\r\n"

# RFC 3261 §7.3.3 — short header forms.
SHORT_FORMS: dict[str, str] = {
    "i": "Call-ID",
    "m": "Contact",
    "e": "Content-Encoding",
    "l": "Content-Length",
    "c": "Content-Type",
    "f": "From",
    "s": "Subject",
    "k": "Supported",
    "t": "To",
    "v": "Via",
    "u": "Allow-Events",
    "o": "Event",
    "r": "Refer-To",
    "b": "Referred-By",
    "x": "Session-Expires",
    "j": "Reject-Contact",
    "d": "Request-Disposition",
    "a": "Accept-Contact",
}

CANONICAL: dict[str, str] = {h.lower(): h for h in {
    "Via", "From", "To", "Call-ID", "CSeq", "Contact", "Content-Length",
    "Content-Type", "Max-Forwards", "User-Agent", "Server", "Allow",
    "Authorization", "WWW-Authenticate", "Proxy-Authenticate",
    "Proxy-Authorization", "Expires", "Route", "Record-Route", "Supported",
    "Require", "Allow-Events", "Event", "Subscription-State", "Refer-To",
    "Referred-By", "Session-Expires", "Min-SE", "Subject", "Reason",
    "P-Asserted-Identity", "Diversion", "Authentication-Info",
    "X-SMURF-Tag", "Accept", "Content-Disposition",
}}

MULTI_HEADERS = {"via", "route", "record-route", "contact"}


def canonical(name: str) -> str:
    """Return the canonical capitalisation for a header name."""

    low = name.lower()
    if len(name) == 1 and low in SHORT_FORMS:
        return SHORT_FORMS[low]
    return CANONICAL.get(low, "-".join(p.capitalize() for p in name.split("-")))


@dataclass
class Headers:
    """Case-insensitive, multi-value preserving header map."""

    items: list[tuple[str, str]] = field(default_factory=list)

    def add(self, name: str, value: str) -> None:
        self.items.append((canonical(name), value))

    def set(self, name: str, value: str) -> None:
        n = canonical(name)
        new = [(k, v) for (k, v) in self.items if k.lower() != n.lower()]
        new.append((n, value))
        self.items = new

    def remove(self, name: str) -> None:
        n = name.lower()
        self.items = [(k, v) for (k, v) in self.items if k.lower() != n]

    def get(self, name: str, default: Optional[str] = None) -> Optional[str]:
        n = name.lower()
        for k, v in self.items:
            if k.lower() == n:
                return v
        return default

    def get_all(self, name: str) -> list[str]:
        n = name.lower()
        return [v for k, v in self.items if k.lower() == n]

    def __contains__(self, name: str) -> bool:
        return self.get(name) is not None

    def __iter__(self) -> Iterable[tuple[str, str]]:
        return iter(self.items)


@dataclass
class SipMessage:
    is_request: bool
    method: str = ""
    request_uri: str = ""
    status_code: int = 0
    reason: str = ""
    version: str = "SIP/2.0"
    headers: Headers = field(default_factory=Headers)
    body: bytes = b""

    # Convenience accessors -------------------------------------------------
    @property
    def call_id(self) -> str:
        return self.headers.get("Call-ID", "") or ""

    @property
    def cseq(self) -> tuple[int, str]:
        raw = self.headers.get("CSeq", "0 ").split(None, 1)
        try:
            return int(raw[0]), (raw[1] if len(raw) > 1 else "").strip()
        except ValueError:
            return 0, ""

    def cseq_number(self) -> int:
        return self.cseq[0]

    def cseq_method(self) -> str:
        return self.cseq[1]

    def first_via(self) -> str:
        return self.headers.get("Via", "") or ""

    def to_tag(self) -> str:
        return _param(self.headers.get("To", "") or "", "tag", "")

    def from_tag(self) -> str:
        return _param(self.headers.get("From", "") or "", "tag", "")

    def branch(self) -> str:
        return _param(self.first_via(), "branch", "")

    # Serialisation ---------------------------------------------------------
    def to_bytes(self) -> bytes:
        if self.is_request:
            line = f"{self.method} {self.request_uri} {self.version}"
        else:
            line = f"{self.version} {self.status_code} {self.reason}"
        # Always recompute Content-Length to avoid drift.
        self.headers.set("Content-Length", str(len(self.body)))
        out = [line]
        for k, v in self.headers.items:
            out.append(f"{k}: {v}")
        head = (CRLF.join(out) + CRLF + CRLF).encode("utf-8", errors="replace")
        return head + self.body


# ---------------------------------------------------------------------------
# URI / parameter helpers
# ---------------------------------------------------------------------------

_PARAM_RE = re.compile(r";\s*([A-Za-z0-9\-_.+%~]+)(?:=((?:\"[^\"]*\")|[^;,?\s]+))?")


def parse_params(s: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for m in _PARAM_RE.finditer(s):
        k = m.group(1).lower()
        v = m.group(2) or ""
        if v.startswith('"') and v.endswith('"'):
            v = v[1:-1]
        out[k] = v
    return out


def _param(header: str, name: str, default: str = "") -> str:
    return parse_params(header).get(name.lower(), default)


def split_addr_uri(value: str) -> tuple[str, str, dict[str, str]]:
    """Parse ``"Display" <sip:user@host;params>;hparams`` into pieces."""

    s = value.strip()
    display = ""
    if s.startswith('"'):
        end = s.find('"', 1)
        if end != -1:
            display = s[1:end]
            s = s[end + 1 :].lstrip()
    if "<" in s and ">" in s:
        if not display:
            display = s.split("<", 1)[0].strip()
        uri = s[s.index("<") + 1 : s.index(">")]
        rest = s[s.index(">") + 1 :]
    else:
        uri = s.split(";", 1)[0].strip()
        rest = s[len(uri):]
    return display, uri.strip(), parse_params(rest)


@dataclass
class SipURI:
    scheme: str = "sip"
    user: str = ""
    password: str = ""
    host: str = ""
    port: int = 0
    parameters: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)

    @classmethod
    def parse(cls, raw: str) -> "SipURI":
        s = raw.strip()
        scheme = "sip"
        if s.lower().startswith("sips:"):
            scheme = "sips"
            s = s[5:]
        elif s.lower().startswith("sip:"):
            s = s[4:]
        elif s.lower().startswith("tel:"):
            scheme = "tel"
            s = s[4:]
        hdr_part = ""
        if "?" in s:
            s, hdr_part = s.split("?", 1)
        param_part = ""
        if ";" in s:
            s, param_part = s.split(";", 1)
        userpw = ""
        hostport = s
        if "@" in s:
            userpw, hostport = s.rsplit("@", 1)
        user = userpw
        password = ""
        if ":" in userpw:
            user, password = userpw.split(":", 1)
        host = hostport
        port = 0
        if hostport.startswith("["):
            end = hostport.find("]")
            host = hostport[1:end]
            if end + 1 < len(hostport) and hostport[end + 1] == ":":
                port = int(hostport[end + 2 :])
        elif ":" in hostport:
            host, port_s = hostport.rsplit(":", 1)
            try:
                port = int(port_s)
            except ValueError:
                port = 0
        params = {}
        if param_part:
            for pair in param_part.split(";"):
                if not pair:
                    continue
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    params[k.lower()] = v
                else:
                    params[pair.lower()] = ""
        headers = {}
        if hdr_part:
            for pair in hdr_part.split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    headers[k] = v
        return cls(scheme, user, password, host, port, params, headers)

    def host_port(self, default_port: int = 5060) -> tuple[str, int]:
        return self.host, self.port or default_port

    def __str__(self) -> str:
        s = f"{self.scheme}:"
        if self.user:
            s += self.user
            if self.password:
                s += f":{self.password}"
            s += "@"
        if ":" in self.host:
            s += f"[{self.host}]"
        else:
            s += self.host
        if self.port:
            s += f":{self.port}"
        for k, v in self.parameters.items():
            s += f";{k}={v}" if v else f";{k}"
        if self.headers:
            s += "?" + "&".join(f"{k}={v}" for k, v in self.headers.items())
        return s


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

class SipParseError(ValueError):
    pass


def _split_head_body(data: bytes) -> tuple[bytes, bytes]:
    sep = data.find(b"\r\n\r\n")
    if sep == -1:
        sep = data.find(b"\n\n")
        if sep == -1:
            raise SipParseError("incomplete SIP message — no header/body separator")
        return data[:sep], data[sep + 2 :]
    return data[:sep], data[sep + 4 :]


def _unfold(lines: list[str]) -> list[str]:
    out: list[str] = []
    for line in lines:
        if not line:
            continue
        if line[:1] in (" ", "\t") and out:
            out[-1] += " " + line.strip()
        else:
            out.append(line)
    return out


def parse_message(data: bytes) -> SipMessage:
    head, body = _split_head_body(data)
    text = head.decode("utf-8", errors="replace")
    raw_lines = re.split(r"\r?\n", text)
    if not raw_lines:
        raise SipParseError("empty message")
    start_line = raw_lines[0]
    header_lines = _unfold(raw_lines[1:])
    headers = Headers()
    for line in header_lines:
        if ":" not in line:
            continue
        k, v = line.split(":", 1)
        # Multiple comma-separated values for non-Authorization-style headers.
        name = k.strip()
        val = v.strip()
        if name.lower() in MULTI_HEADERS and "," in val:
            for piece in _split_csv_top_level(val):
                headers.add(name, piece.strip())
        else:
            headers.add(name, val)
    if start_line.upper().startswith("SIP/"):
        try:
            version, code, *reason = start_line.split(" ", 2)
            return SipMessage(
                is_request=False,
                version=version,
                status_code=int(code),
                reason=" ".join(reason),
                headers=headers,
                body=body,
            )
        except (ValueError, IndexError) as exc:
            raise SipParseError(f"bad status line: {start_line!r}") from exc
    parts = start_line.split(" ", 2)
    if len(parts) < 3:
        raise SipParseError(f"bad request line: {start_line!r}")
    method, ruri, version = parts
    msg = SipMessage(
        is_request=True,
        method=method.upper(),
        request_uri=ruri,
        version=version,
        headers=headers,
        body=body,
    )
    declared = msg.headers.get("Content-Length")
    if declared is not None:
        try:
            n = int(declared)
            if 0 < n < len(body):
                msg.body = body[:n]
        except ValueError:
            pass
    return msg


def _split_csv_top_level(value: str) -> list[str]:
    """Split on commas that are not inside angle brackets or quotes."""

    out: list[str] = []
    buf: list[str] = []
    depth = 0
    in_q = False
    for ch in value:
        if ch == '"':
            in_q = not in_q
        elif ch == "<" and not in_q:
            depth += 1
        elif ch == ">" and not in_q:
            depth -= 1
        elif ch == "," and depth == 0 and not in_q:
            out.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if buf:
        out.append("".join(buf))
    return out


def make_response(req: SipMessage, status: int, reason: str, *, to_tag: str | None = None,
                  body: bytes = b"", content_type: str | None = None,
                  extra: list[tuple[str, str]] | None = None,
                  user_agent: str = "SMURF/0.1") -> SipMessage:
    """Build a response that mirrors the request per RFC 3261 §8.2.6."""

    resp = SipMessage(is_request=False, status_code=status, reason=reason, body=body)
    for via in req.headers.get_all("Via"):
        resp.headers.add("Via", via)
    resp.headers.add("From", req.headers.get("From", ""))
    to = req.headers.get("To", "")
    if status >= 200 and to and ";tag=" not in to and to_tag:
        to = f"{to};tag={to_tag}"
    resp.headers.add("To", to)
    resp.headers.add("Call-ID", req.headers.get("Call-ID", ""))
    resp.headers.add("CSeq", req.headers.get("CSeq", ""))
    if status >= 200 and req.method == "INVITE":
        for rr in req.headers.get_all("Record-Route"):
            resp.headers.add("Record-Route", rr)
    resp.headers.add("Server", user_agent)
    if extra:
        for k, v in extra:
            resp.headers.add(k, v)
    if body:
        resp.headers.set("Content-Type", content_type or "application/sdp")
    return resp

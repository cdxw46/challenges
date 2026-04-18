"""HTTP Digest authentication for SIP (RFC 3261 §22 / RFC 7616).

Supports both MD5 and SHA-256 algorithms, ``qop=auth``, opaque tokens and
nonce reuse with a sliding TTL.  Nonces are HMAC tokens — they can be
verified statelessly across processes.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import Iterable

from .message import parse_params

NONCE_TTL = 300  # seconds


def _hash(algo: str, *parts: str) -> str:
    h = hashlib.new("sha256" if algo.lower().startswith("sha") else "md5")
    h.update(":".join(parts).encode("utf-8"))
    return h.hexdigest()


def make_nonce(secret: str) -> str:
    ts = str(int(time.time()))
    rnd = secrets.token_hex(8)
    body = f"{ts}:{rnd}"
    sig = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{body}:{sig}"


def nonce_valid(secret: str, nonce: str, ttl: int = NONCE_TTL) -> bool:
    try:
        ts_s, rnd, sig = nonce.split(":")
        body = f"{ts_s}:{rnd}"
        expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()[:16]
        if not hmac.compare_digest(sig, expected):
            return False
        return abs(time.time() - int(ts_s)) <= ttl
    except (ValueError, TypeError):
        return False


def build_challenge(realm: str, nonce: str, *, algorithm: str = "MD5",
                    qop: str = "auth", stale: bool = False) -> str:
    parts = [
        f'Digest realm="{realm}"',
        f'nonce="{nonce}"',
        f'algorithm={algorithm}',
        f'qop="{qop}"',
        'opaque="smurf"',
    ]
    if stale:
        parts.append("stale=true")
    return ", ".join(parts)


@dataclass
class DigestCredentials:
    username: str
    realm: str
    nonce: str
    uri: str
    response: str
    algorithm: str = "MD5"
    qop: str = ""
    nc: str = ""
    cnonce: str = ""
    opaque: str = ""

    @classmethod
    def parse(cls, header: str) -> "DigestCredentials | None":
        if not header or not header.lower().startswith("digest"):
            return None
        params = _parse_digest_params(header[6:].strip())
        return cls(
            username=params.get("username", ""),
            realm=params.get("realm", ""),
            nonce=params.get("nonce", ""),
            uri=params.get("uri", ""),
            response=params.get("response", ""),
            algorithm=params.get("algorithm", "MD5"),
            qop=params.get("qop", ""),
            nc=params.get("nc", ""),
            cnonce=params.get("cnonce", ""),
            opaque=params.get("opaque", ""),
        )


def _parse_digest_params(s: str) -> dict[str, str]:
    """Parse comma-separated ``key=value`` pairs honouring quoted strings.

    Used to read both Authorization request headers and WWW-Authenticate
    challenges; quoted values may contain commas, colons, equals and so on.
    """

    out: dict[str, str] = {}
    i = 0
    n = len(s)
    while i < n:
        while i < n and s[i] in " \t,":
            i += 1
        # key
        start = i
        while i < n and s[i] not in "= \t":
            i += 1
        key = s[start:i].lower()
        if not key:
            break
        while i < n and s[i] in " \t":
            i += 1
        if i >= n or s[i] != "=":
            out[key] = ""
            continue
        i += 1
        while i < n and s[i] in " \t":
            i += 1
        if i < n and s[i] == '"':
            i += 1
            buf: list[str] = []
            while i < n and s[i] != '"':
                if s[i] == "\\" and i + 1 < n:
                    buf.append(s[i + 1])
                    i += 2
                else:
                    buf.append(s[i])
                    i += 1
            if i < n:
                i += 1  # skip closing quote
            out[key] = "".join(buf)
        else:
            start = i
            while i < n and s[i] not in ", \t":
                i += 1
            out[key] = s[start:i]
    return out


def expected_response(method: str, password: str, creds: DigestCredentials) -> str:
    algo = creds.algorithm or "MD5"
    ha1 = _hash(algo, creds.username, creds.realm, password)
    ha2 = _hash(algo, method, creds.uri)
    if creds.qop:
        return _hash(algo, ha1, creds.nonce, creds.nc, creds.cnonce, creds.qop, ha2)
    return _hash(algo, ha1, creds.nonce, ha2)


def verify(method: str, password: str, creds: DigestCredentials,
           allowed_uris: Iterable[str] | None = None) -> bool:
    if allowed_uris is not None and creds.uri not in allowed_uris:
        # Some UAs use sip:domain, others sip:user@domain — accept both.
        if not any(creds.uri.endswith(u) or u.endswith(creds.uri) for u in allowed_uris):
            return False
    expected = expected_response(method, password, creds)
    return hmac.compare_digest(expected.lower(), (creds.response or "").lower())

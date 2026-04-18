from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import asdict, dataclass
from typing import Any


PBKDF2_ITERATIONS = 150_000


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - (len(data) % 4)) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _hotp(secret_b32: str, counter: int, digits: int = 6) -> str:
    key = base64.b32decode(secret_b32, casefold=True)
    msg = counter.to_bytes(8, "big")
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = int.from_bytes(digest[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(code % (10 ** digits)).zfill(digits)


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def verify_totp(secret_b32: str, token: str, period_seconds: int = 30, window: int = 1) -> bool:
    token = token.strip()
    if not token.isdigit():
        return False
    current_counter = int(time.time() // period_seconds)
    padded_secret = secret_b32 + ("=" * ((8 - len(secret_b32) % 8) % 8))
    for delta in range(-window, window + 1):
        if _hotp(padded_secret, current_counter + delta) == token:
            return True
    return False


def current_totp(secret_b32: str, period_seconds: int = 30) -> str:
    padded_secret = secret_b32 + ("=" * ((8 - len(secret_b32) % 8) % 8))
    current_counter = int(time.time() // period_seconds)
    return _hotp(padded_secret, current_counter)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("ascii"),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_text, salt, digest_hex = encoded.split("$", 3)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("ascii"),
        int(iterations_text),
    )
    return hmac.compare_digest(digest.hex(), digest_hex)


def digest_hash(username: str, realm: str, password: str, algorithm: str = "MD5") -> str:
    algo = algorithm.upper()
    payload = f"{username}:{realm}:{password}".encode("utf-8")
    if algo == "MD5":
        return hashlib.md5(payload).hexdigest()
    if algo in {"SHA-256", "SHA256"}:
        return hashlib.sha256(payload).hexdigest()
    raise ValueError(f"Unsupported digest algorithm: {algorithm}")


def compute_digest_response(
    username: str,
    realm: str,
    password: str,
    nonce: str,
    method: str,
    uri: str,
    algorithm: str = "MD5",
    qop: str = "",
    nc: str = "",
    cnonce: str = "",
) -> str:
    algo = algorithm.upper()
    ha1 = digest_hash(username, realm, password, algo)
    return compute_digest_response_from_ha1(
        ha1=ha1,
        nonce=nonce,
        method=method,
        uri=uri,
        algorithm=algo,
        qop=qop,
        nc=nc,
        cnonce=cnonce,
    )


def compute_digest_response_from_ha1(
    ha1: str,
    nonce: str,
    method: str,
    uri: str,
    algorithm: str = "MD5",
    qop: str = "",
    nc: str = "",
    cnonce: str = "",
) -> str:
    algo = algorithm.upper()
    if algo == "MD5":
        ha2 = hashlib.md5(f"{method}:{uri}".encode("utf-8")).hexdigest()
        base = f"{ha1}:{nonce}:"
        if qop:
            base += f"{nc}:{cnonce}:{qop}:"
        base += ha2
        return hashlib.md5(base.encode("utf-8")).hexdigest()
    if algo in {"SHA-256", "SHA256"}:
        ha2 = hashlib.sha256(f"{method}:{uri}".encode("utf-8")).hexdigest()
        base = f"{ha1}:{nonce}:"
        if qop:
            base += f"{nc}:{cnonce}:{qop}:"
        base += ha2
        return hashlib.sha256(base.encode("utf-8")).hexdigest()
    raise ValueError(f"Unsupported digest algorithm: {algorithm}")


def issue_nonce() -> str:
    return secrets.token_hex(16)


@dataclass(slots=True)
class JwtClaims:
    sub: str
    role: str
    exp: int
    iat: int


def encode_jwt(payload: dict[str, Any], secret: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_b64 = _b64url_encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature = hmac.new(
        secret.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def decode_jwt(token: str, secret: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Malformed JWT")
    header_b64, payload_b64, signature_b64 = parts
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{header_b64}.{payload_b64}".encode("ascii"),
        hashlib.sha256,
    ).digest()
    provided = _b64url_decode(signature_b64)
    if not hmac.compare_digest(expected, provided):
        raise ValueError("Invalid JWT signature")
    payload = json.loads(_b64url_decode(payload_b64))
    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("JWT expired")
    return payload


def issue_jwt(subject: str, role: str, secret: str, ttl_seconds: int = 3600) -> str:
    now = int(time.time())
    claims = JwtClaims(sub=subject, role=role, iat=now, exp=now + ttl_seconds)
    return encode_jwt(asdict(claims), secret)

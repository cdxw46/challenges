"""Cryptographic primitives: PBKDF2 + HMAC-SHA256 + HOTP/TOTP.

Uses only Python's standard library (hashlib, hmac, os, struct) so NEUROVA
can hash credentials, sign audit entries and generate 2FA codes without
depending on external crypto libraries beyond what ships with Python.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import struct
import time


def hash_password(password: str, salt: bytes | None = None, iterations: int = 240000) -> str:
    if salt is None:
        salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iter_s, salt_s, digest_s = encoded.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    try:
        iterations = int(iter_s)
        salt = base64.b64decode(salt_s)
        digest = base64.b64decode(digest_s)
    except (ValueError, TypeError):
        return False
    calc = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(calc, digest)


def hmac_sign(key: bytes, payload: bytes) -> str:
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def random_token(n: int = 32) -> str:
    return secrets.token_urlsafe(n)


def _base32_decode(key: str) -> bytes:
    pad = (-len(key)) % 8
    return base64.b32decode(key.upper() + "=" * pad)


def totp(secret: str, now: float | None = None, step: int = 30, digits: int = 6) -> str:
    t = int((now if now is not None else time.time()) // step)
    key = _base32_decode(secret)
    msg = struct.pack(">Q", t)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    o = h[-1] & 0x0F
    code = (
        ((h[o] & 0x7F) << 24)
        | ((h[o + 1] & 0xFF) << 16)
        | ((h[o + 2] & 0xFF) << 8)
        | (h[o + 3] & 0xFF)
    )
    return str(code % (10 ** digits)).zfill(digits)


def totp_secret() -> str:
    return base64.b32encode(os.urandom(20)).decode().rstrip("=")


def sign_audit_chain(prev_hash: str, record: bytes, key: bytes) -> str:
    mac = hmac.new(key, prev_hash.encode() + record, hashlib.sha256)
    return mac.hexdigest()

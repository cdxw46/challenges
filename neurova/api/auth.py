"""Lightweight OAuth2-like auth: users, API keys, bearer tokens, 2FA."""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from dataclasses import dataclass

from neurova.core import crypto, ids

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    totp_secret TEXT,
    created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    scopes TEXT NOT NULL,
    expires_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
    key TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    scopes TEXT NOT NULL,
    rate_limit INTEGER DEFAULT 60,
    created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rules_inbox (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS citizens (
    email TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    zone TEXT,
    created_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    email TEXT,
    message TEXT,
    created_ms INTEGER
);
"""


@dataclass
class User:
    email: str
    role: str
    totp_secret: str | None


class AuthStore:
    def __init__(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(
            self.path,
            check_same_thread=False,
            isolation_level=None,  # autocommit mode
            timeout=30.0,
        )
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.executescript(SCHEMA)
        self._seed()

    def _seed(self) -> None:
        with self._lock:
            cur = self._conn.execute("SELECT COUNT(*) FROM users WHERE email=?", ("admin@neurova.city",))
            count = cur.fetchone()[0]
            if count == 0:
                self._conn.execute(
                    "INSERT INTO users VALUES (?,?,?,?,?)",
                    (
                        "admin@neurova.city",
                        crypto.hash_password("Neurova2025!"),
                        "operator",
                        None,  # 2FA opt-in via /api/2fa/setup after first login
                        int(time.time() * 1000),
                    ),
                )
                self._conn.execute(
                    "INSERT INTO users VALUES (?,?,?,?,?)",
                    (
                        "observer@neurova.city",
                        crypto.hash_password("Observer2025!"),
                        "observer",
                        None,
                        int(time.time() * 1000),
                    ),
                )
                self._conn.execute(
                    "INSERT INTO api_keys VALUES (?,?,?,?,?)",
                    (
                        "nvp_" + crypto.random_token(24),
                        "system",
                        "read:all",
                        1200,
                        int(time.time() * 1000),
                    ),
                )
                self._conn.commit()

    def authenticate(self, email: str, password: str, totp: str | None = None) -> User | None:
        with self._lock:
            cur = self._conn.execute("SELECT email, password_hash, role, totp_secret FROM users WHERE email=?", (email,))
            row = cur.fetchone()
        if not row:
            return None
        if not crypto.verify_password(password, row[1]):
            return None
        if row[3]:
            if not totp or totp != crypto.totp(row[3]):
                return None
        return User(email=row[0], role=row[2], totp_secret=row[3])

    def issue_token(self, user: User, scopes: list[str], ttl_s: int = 3600) -> str:
        token = crypto.random_token(32)
        expires = int((time.time() + ttl_s) * 1000)
        with self._lock:
            self._conn.execute(
                "INSERT INTO tokens VALUES (?,?,?,?)",
                (token, user.email, json.dumps(scopes), expires),
            )
            self._conn.commit()
        return token

    def validate_token(self, token: str) -> tuple[User, list[str]] | None:
        with self._lock:
            cur = self._conn.execute(
                "SELECT email, scopes, expires_ms FROM tokens WHERE token=?", (token,)
            )
            row = cur.fetchone()
        if not row or row[2] < int(time.time() * 1000):
            return None
        email = row[0]
        with self._lock:
            cur = self._conn.execute("SELECT email, role, totp_secret FROM users WHERE email=?", (email,))
            urow = cur.fetchone()
        if not urow:
            return None
        return User(email=urow[0], role=urow[1], totp_secret=urow[2]), json.loads(row[1])

    def validate_api_key(self, key: str) -> tuple[str, list[str]] | None:
        with self._lock:
            cur = self._conn.execute("SELECT owner, scopes FROM api_keys WHERE key=?", (key,))
            row = cur.fetchone()
        if not row:
            return None
        return row[0], row[1].split(",")

    def list_api_keys(self) -> list[dict]:
        with self._lock:
            cur = self._conn.execute("SELECT key, owner, scopes, rate_limit FROM api_keys")
            return [{"key": r[0], "owner": r[1], "scopes": r[2], "rate_limit": r[3]} for r in cur.fetchall()]

    def create_citizen(self, email: str, password: str, zone: str | None) -> User:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO citizens VALUES (?,?,?,?)",
                (email, crypto.hash_password(password), zone, int(time.time() * 1000)),
            )
            self._conn.commit()
        return User(email=email, role="citizen", totp_secret=None)

    def authenticate_citizen(self, email: str, password: str) -> User | None:
        with self._lock:
            cur = self._conn.execute("SELECT email, password_hash FROM citizens WHERE email=?", (email,))
            row = cur.fetchone()
        if not row or not crypto.verify_password(password, row[1]):
            return None
        return User(email=row[0], role="citizen", totp_secret=None)

    def enable_2fa(self, email: str) -> str:
        secret = crypto.totp_secret()
        with self._lock:
            self._conn.execute("UPDATE users SET totp_secret=? WHERE email=?", (secret, email))
            self._conn.commit()
        return secret

    def list_users(self) -> list[dict]:
        with self._lock:
            cur = self._conn.execute("SELECT email, role, CASE WHEN totp_secret IS NULL THEN 0 ELSE 1 END FROM users")
            return [{"email": r[0], "role": r[1], "totp": bool(r[2])} for r in cur.fetchall()]

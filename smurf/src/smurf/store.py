from __future__ import annotations

import json
import sqlite3
import threading
import time
from typing import Any

from .config import SmurfConfig
from .models import CallRecord, Extension, Registration
from .security import digest_hash, hash_password


SCHEMA = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS extensions (
    extension TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    digest_md5 TEXT NOT NULL,
    digest_sha256 TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    enabled INTEGER NOT NULL DEFAULT 1,
    email TEXT DEFAULT '',
    call_limit INTEGER NOT NULL DEFAULT 2,
    voicemail_enabled INTEGER NOT NULL DEFAULT 1,
    presence TEXT NOT NULL DEFAULT 'available',
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'superadmin',
    totp_secret TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
    extension TEXT NOT NULL,
    contact_uri TEXT NOT NULL,
    transport TEXT NOT NULL,
    source_addr TEXT NOT NULL,
    connection_id TEXT DEFAULT '',
    expires_at REAL NOT NULL,
    user_agent TEXT DEFAULT '',
    instance_id TEXT DEFAULT '',
    via_branch TEXT DEFAULT '',
    UNIQUE(extension, contact_uri)
);

CREATE TABLE IF NOT EXISTS calls (
    call_id TEXT PRIMARY KEY,
    from_extension TEXT NOT NULL,
    to_extension TEXT NOT NULL,
    state TEXT NOT NULL,
    started_at REAL NOT NULL,
    answered_at REAL,
    ended_at REAL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    rtp_a_port INTEGER DEFAULT 0,
    rtp_b_port INTEGER DEFAULT 0,
    recording_path TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    source_extension TEXT NOT NULL,
    target_extension TEXT NOT NULL,
    body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts REAL NOT NULL,
    level TEXT NOT NULL,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    payload_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class SmurfStore:
    def __init__(self, config: SmurfConfig) -> None:
        self.config = config
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(config.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

    def initialize(self) -> None:
        with self._lock:
            self._conn.executescript(SCHEMA)
            self._seed_defaults()
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _seed_defaults(self) -> None:
        now = time.time()
        admin = self._conn.execute(
            "SELECT username FROM admins WHERE username = ?",
            (self.config.admin_username,),
        ).fetchone()
        if admin is None:
            self._conn.execute(
                """
                INSERT INTO admins(username, password_hash, role, totp_secret, created_at)
                VALUES (?, ?, 'superadmin', ?, ?)
                """,
                (
                    self.config.admin_username,
                    hash_password(self.config.admin_password),
                    self.config.admin_totp_secret,
                    now,
                ),
            )

        if self._conn.execute("SELECT COUNT(*) AS count FROM extensions").fetchone()["count"] == 0:
            self.create_extension("1000", "Alice", "alicepass", "1000", "alice@smurf.local")
            self.create_extension("1001", "Bob", "bobpass", "1001", "bob@smurf.local")

        defaults = {
            "dialplan.default_prefix": "",
            "network.public_host": self.config.public_host,
            "tls.required": "false",
            "media.qos_dscp": "46",
            "routing.outbound_prefix": "9",
        }
        for key, value in defaults.items():
            self._conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                (key, value),
            )

    def fetch_extension(self, extension: str) -> Extension | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM extensions WHERE extension = ? AND enabled = 1",
                (extension,),
            ).fetchone()
        return self._row_to_extension(row)

    def list_extensions(self) -> list[Extension]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM extensions ORDER BY extension"
            ).fetchall()
        return [self._row_to_extension(row) for row in rows if row is not None]

    def _row_to_extension(self, row: sqlite3.Row | None) -> Extension | None:
        if row is None:
            return None
        return Extension(
            extension=row["extension"],
            display_name=row["display_name"],
            password_hash=row["password_hash"],
            pin_hash=row["pin_hash"],
            digest_md5=row["digest_md5"],
            digest_sha256=row["digest_sha256"],
            enabled=bool(row["enabled"]),
            presence=row["presence"],
            call_limit=int(row["call_limit"]),
            voicemail_enabled=bool(row["voicemail_enabled"]),
            role=row["role"],
            email=row["email"] or "",
        )

    def create_extension(
        self,
        extension: str,
        display_name: str,
        password: str,
        pin: str,
        email: str = "",
        role: str = "user",
    ) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO extensions(
                    extension, display_name, password_hash, pin_hash,
                    digest_md5, digest_sha256, role, email, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    extension,
                    display_name,
                    hash_password(password),
                    hash_password(pin),
                    digest_hash(extension, self.config.default_realm, password, "MD5"),
                    digest_hash(extension, self.config.default_realm, password, "SHA-256"),
                    role,
                    email,
                    time.time(),
                ),
            )
            self._conn.commit()

    def set_presence(self, extension: str, presence: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE extensions SET presence = ? WHERE extension = ?",
                (presence, extension),
            )
            self._conn.commit()

    def authenticate_admin(self, username: str) -> sqlite3.Row | None:
        with self._lock:
            return self._conn.execute(
                "SELECT * FROM admins WHERE username = ?",
                (username,),
            ).fetchone()

    def create_or_update_registration(self, registration: Registration) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO registrations(
                    extension, contact_uri, transport, source_addr, connection_id,
                    expires_at, user_agent, instance_id, via_branch
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(extension, contact_uri) DO UPDATE SET
                    transport=excluded.transport,
                    source_addr=excluded.source_addr,
                    connection_id=excluded.connection_id,
                    expires_at=excluded.expires_at,
                    user_agent=excluded.user_agent,
                    instance_id=excluded.instance_id,
                    via_branch=excluded.via_branch
                """,
                (
                    registration.extension,
                    registration.contact_uri,
                    registration.transport,
                    registration.source_addr,
                    registration.connection_id,
                    registration.expires_at,
                    registration.user_agent,
                    registration.instance_id,
                    registration.via_branch,
                ),
            )
            self._conn.commit()

    def remove_registration(self, extension: str, contact_uri: str | None = None) -> None:
        with self._lock:
            if contact_uri:
                self._conn.execute(
                    "DELETE FROM registrations WHERE extension = ? AND contact_uri = ?",
                    (extension, contact_uri),
                )
            else:
                self._conn.execute(
                    "DELETE FROM registrations WHERE extension = ?",
                    (extension,),
                )
            self._conn.commit()

    def list_registrations(self, extension: str | None = None) -> list[Registration]:
        with self._lock:
            now = time.time()
            self._conn.execute("DELETE FROM registrations WHERE expires_at <= ?", (now,))
            if extension is None:
                rows = self._conn.execute(
                    "SELECT * FROM registrations ORDER BY extension, contact_uri"
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM registrations WHERE extension = ? ORDER BY contact_uri",
                    (extension,),
                ).fetchall()
            self._conn.commit()
        return [
            Registration(
                extension=row["extension"],
                contact_uri=row["contact_uri"],
                transport=row["transport"],
                source_addr=row["source_addr"],
                connection_id=row["connection_id"] or "",
                expires_at=float(row["expires_at"]),
                user_agent=row["user_agent"] or "",
                instance_id=row["instance_id"] or "",
                via_branch=row["via_branch"] or "",
            )
            for row in rows
        ]

    def list_live_registrations(self, extension: str) -> list[Registration]:
        now = time.time()
        return [item for item in self.list_registrations(extension) if item.expires_at > now]

    def upsert_call(self, record: CallRecord) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO calls(
                    call_id, from_extension, to_extension, state, started_at, answered_at,
                    ended_at, duration_seconds, rtp_a_port, rtp_b_port, recording_path
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(call_id) DO UPDATE SET
                    state=excluded.state,
                    answered_at=excluded.answered_at,
                    ended_at=excluded.ended_at,
                    duration_seconds=excluded.duration_seconds,
                    rtp_a_port=excluded.rtp_a_port,
                    rtp_b_port=excluded.rtp_b_port,
                    recording_path=excluded.recording_path
                """,
                (
                    record.call_id,
                    record.from_extension,
                    record.to_extension,
                    record.state,
                    record.started_at,
                    record.answered_at,
                    record.ended_at,
                    record.duration_seconds,
                    record.rtp_a_port,
                    record.rtp_b_port,
                    record.recording_path,
                ),
            )
            self._conn.commit()

    def fetch_call(self, call_id: str) -> CallRecord | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM calls WHERE call_id = ?",
                (call_id,),
            ).fetchone()
        if row is None:
            return None
        return CallRecord(
            call_id=row["call_id"],
            from_extension=row["from_extension"],
            to_extension=row["to_extension"],
            state=row["state"],
            started_at=float(row["started_at"]),
            answered_at=float(row["answered_at"]) if row["answered_at"] is not None else None,
            ended_at=float(row["ended_at"]) if row["ended_at"] is not None else None,
            duration_seconds=int(row["duration_seconds"]),
            rtp_a_port=int(row["rtp_a_port"]),
            rtp_b_port=int(row["rtp_b_port"]),
            recording_path=row["recording_path"] or "",
        )

    def list_calls(self) -> list[CallRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM calls ORDER BY started_at DESC"
            ).fetchall()
        return [
            CallRecord(
                call_id=row["call_id"],
                from_extension=row["from_extension"],
                to_extension=row["to_extension"],
                state=row["state"],
                started_at=float(row["started_at"]),
                answered_at=float(row["answered_at"]) if row["answered_at"] is not None else None,
                ended_at=float(row["ended_at"]) if row["ended_at"] is not None else None,
                duration_seconds=int(row["duration_seconds"]),
                rtp_a_port=int(row["rtp_a_port"]),
                rtp_b_port=int(row["rtp_b_port"]),
                recording_path=row["recording_path"] or "",
            )
            for row in rows
        ]

    def store_message(self, source_extension: str, target_extension: str, body: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO messages(ts, source_extension, target_extension, body) VALUES (?, ?, ?, ?)",
                (time.time(), source_extension, target_extension, body),
            )
            self._conn.commit()

    def list_messages(self, extension: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            if extension is None:
                rows = self._conn.execute(
                    "SELECT * FROM messages ORDER BY id DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM messages
                    WHERE source_extension = ? OR target_extension = ?
                    ORDER BY id DESC LIMIT ?
                    """,
                    (extension, extension, limit),
                ).fetchall()
        return [dict(row) for row in rows]

    def log_event(
        self,
        level: str,
        category: str,
        message: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO events(ts, level, category, message, payload_json) VALUES (?, ?, ?, ?, ?)",
                (time.time(), level, category, message, json.dumps(payload or {}, separators=(",", ":"))),
            )
            self._conn.commit()

    def list_events(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM events ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_setting(self, key: str, default: str = "") -> str:
        with self._lock:
            row = self._conn.execute(
                "SELECT value FROM settings WHERE key = ?",
                (key,),
            ).fetchone()
        return default if row is None else str(row["value"])

    def set_setting(self, key: str, value: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO settings(key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (key, value),
            )
            self._conn.commit()

    def kpis(self) -> dict[str, Any]:
        with self._lock:
            active_calls = self._conn.execute(
                "SELECT COUNT(*) AS count FROM calls WHERE state IN ('ringing', 'active', 'answered')"
            ).fetchone()["count"]
            registered = self._conn.execute(
                "SELECT COUNT(DISTINCT extension) AS count FROM registrations WHERE expires_at > ?",
                (time.time(),),
            ).fetchone()["count"]
            calls_today = self._conn.execute(
                "SELECT COUNT(*) AS count FROM calls WHERE started_at >= ?",
                (time.time() - 86400,),
            ).fetchone()["count"]
            extensions = self._conn.execute(
                "SELECT COUNT(*) AS count FROM extensions WHERE enabled = 1"
            ).fetchone()["count"]
        return {
            "active_calls": int(active_calls),
            "registered_extensions": int(registered),
            "calls_today": int(calls_today),
            "enabled_extensions": int(extensions),
            "trunks_active": 0,
        }

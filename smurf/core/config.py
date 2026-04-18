"""Centralized configuration with hot-reload support.

Configuration is layered:

  1. Built-in defaults (this file).
  2. Environment overrides (``SMURF_*``).
  3. Persistent JSON file (``data/runtime.json``) updated by the admin panel.

Subsystems read values via ``get(key, default)``; mutations made through
``set(key, value)`` are persisted and broadcast to in-process observers
through the ``subscribe`` API.  This is what enables changes from the admin
UI to take effect without restarting the daemons.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import threading
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
SMURF_HOME = Path(os.environ.get("SMURF_HOME", str(ROOT / "smurf")))
DATA_DIR = Path(os.environ.get("SMURF_DATA", str(SMURF_HOME / "data")))
LOG_DIR = Path(os.environ.get("SMURF_LOGS", str(SMURF_HOME / "logs")))
RECORDINGS_DIR = Path(os.environ.get("SMURF_RECORDINGS", str(SMURF_HOME / "recordings")))
VOICEMAIL_DIR = Path(os.environ.get("SMURF_VOICEMAIL", str(SMURF_HOME / "voicemail")))
MOH_DIR = Path(os.environ.get("SMURF_MOH", str(SMURF_HOME / "moh")))
CERTS_DIR = Path(os.environ.get("SMURF_CERTS", str(SMURF_HOME / "certs")))
TEMPLATES_DIR = SMURF_HOME / "web" / "templates"
STATIC_DIR = SMURF_HOME / "web" / "static"

for d in (DATA_DIR, LOG_DIR, RECORDINGS_DIR, VOICEMAIL_DIR, MOH_DIR, CERTS_DIR):
    d.mkdir(parents=True, exist_ok=True)

DB_PATH = Path(os.environ.get("SMURF_DB", str(DATA_DIR / "smurf.sqlite3")))
RUNTIME_FILE = DATA_DIR / "runtime.json"


def _detect_lan_ip() -> str:
    """Best-effort LAN IP discovery; falls back to 127.0.0.1."""

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(("1.1.1.1", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


_LAN_IP = _detect_lan_ip()

DEFAULTS: dict[str, Any] = {
    "domain": _LAN_IP,
    "external_ip": _LAN_IP,
    "sip_udp_port": 5060,
    "sip_tcp_port": 5060,
    "sip_tls_port": 5061,
    "sip_ws_port": 8088,
    "sip_wss_port": 8089,
    "rtp_port_min": 16384,
    "rtp_port_max": 32767,
    "admin_http_port": 5000,
    "admin_https_port": 5001,
    "provisioning_port": 5080,
    "max_concurrent_calls": 500,
    "default_codec_order": ["PCMU", "PCMA", "opus", "G722"],
    "registration_min_expiry": 60,
    "registration_default_expiry": 3600,
    "registration_max_expiry": 7200,
    "fail2ban_max_attempts": 8,
    "fail2ban_window_seconds": 60,
    "fail2ban_ban_seconds": 600,
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_pass": "",
    "smtp_from": "smurf@localhost",
    "recording_enabled_default": False,
    "music_on_hold_file": "default.wav",
    "default_voicemail_pin": "1234",
    "log_level": "INFO",
    "tls_cert_file": str(CERTS_DIR / "smurf.crt"),
    "tls_key_file": str(CERTS_DIR / "smurf.key"),
    "jwt_secret": secrets.token_urlsafe(48),
    "jwt_ttl_seconds": 28800,
    "ws_event_url": "/api/ws/events",
    "default_admin_user": "admin",
    "default_admin_password": "smurf-admin",
}

_lock = threading.RLock()
_observers: list[Callable[[str, Any], None]] = []
_runtime: dict[str, Any] = {}


def _load_runtime() -> None:
    global _runtime
    if RUNTIME_FILE.exists():
        try:
            _runtime = json.loads(RUNTIME_FILE.read_text())
        except (OSError, json.JSONDecodeError):
            _runtime = {}
    else:
        _runtime = {}


def _save_runtime() -> None:
    tmp = RUNTIME_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(_runtime, indent=2, sort_keys=True))
    os.replace(tmp, RUNTIME_FILE)


def get(key: str, default: Any = None) -> Any:
    with _lock:
        if key in _runtime:
            return _runtime[key]
        env_key = f"SMURF_{key.upper()}"
        if env_key in os.environ:
            return _coerce(env_key, os.environ[env_key], DEFAULTS.get(key, default))
        return DEFAULTS.get(key, default)


def _coerce(env_key: str, raw: str, current: Any) -> Any:
    if isinstance(current, bool):
        return raw.lower() in ("1", "true", "yes", "on")
    if isinstance(current, int):
        try:
            return int(raw)
        except ValueError:
            return current
    if isinstance(current, list):
        return [item.strip() for item in raw.split(",") if item.strip()]
    return raw


def set(key: str, value: Any) -> None:  # noqa: A001 — intentional API
    with _lock:
        _runtime[key] = value
        _save_runtime()
    for cb in list(_observers):
        try:
            cb(key, value)
        except Exception:  # observers must not break the writer
            pass


def subscribe(callback: Callable[[str, Any], None]) -> None:
    _observers.append(callback)


def all_settings() -> dict[str, Any]:
    """Return effective configuration (defaults merged with overrides)."""

    with _lock:
        out = dict(DEFAULTS)
        for env_key, raw in os.environ.items():
            if not env_key.startswith("SMURF_"):
                continue
            key = env_key[6:].lower()
            if key in DEFAULTS:
                out[key] = _coerce(env_key, raw, DEFAULTS[key])
        out.update(_runtime)
        return out


_load_runtime()

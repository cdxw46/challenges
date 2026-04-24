"""Structured JSON logger with ANSI color output and rotation.

Implemented from scratch so every NEUROVA component writes logs in the
same format: one JSON document per line (for machines) plus a coloured
human line printed to stderr.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any

_LEVELS = {"debug": 10, "info": 20, "warn": 30, "error": 40, "critical": 50}
_COLORS = {
    "debug": "\x1b[38;5;244m",
    "info": "\x1b[38;5;48m",
    "warn": "\x1b[38;5;214m",
    "error": "\x1b[38;5;203m",
    "critical": "\x1b[48;5;160m\x1b[38;5;231m",
}
_RESET = "\x1b[0m"
_DEFAULT_LEVEL = os.environ.get("NEUROVA_LOG_LEVEL", "info").lower()
_ROOT_LOG_DIR = os.environ.get("NEUROVA_LOG_DIR", "/workspace/neurova/logs")
_LOG_LOCK = threading.Lock()


def _ensure_dir(path: str) -> None:
    try:
        os.makedirs(path, exist_ok=True)
    except OSError:
        pass


def _rotate_if_needed(path: str, max_bytes: int = 25 * 1024 * 1024, keep: int = 5) -> None:
    try:
        if os.path.exists(path) and os.path.getsize(path) > max_bytes:
            for i in range(keep - 1, 0, -1):
                src = f"{path}.{i}"
                dst = f"{path}.{i + 1}"
                if os.path.exists(src):
                    os.replace(src, dst)
            os.replace(path, f"{path}.1")
    except OSError:
        pass


@dataclass
class Logger:
    component: str
    level: int = _LEVELS[_DEFAULT_LEVEL]
    log_dir: str = _ROOT_LOG_DIR

    def __post_init__(self) -> None:
        _ensure_dir(self.log_dir)
        self._path = os.path.join(self.log_dir, f"{self.component}.log")

    def _emit(self, level: str, msg: str, **fields: Any) -> None:
        lvl = _LEVELS.get(level, 20)
        if lvl < self.level:
            return
        record = {
            "ts": round(time.time(), 6),
            "lvl": level,
            "cmp": self.component,
            "msg": msg,
        }
        if fields:
            record["ctx"] = fields
        line = json.dumps(record, separators=(",", ":"), ensure_ascii=False)
        color = _COLORS.get(level, "")
        human = (
            f"{color}[{record['ts']:.3f}] {level.upper():<5} "
            f"{self.component:<16} {msg}{_RESET}"
        )
        if fields:
            human += f" {json.dumps(fields, ensure_ascii=False)}"
        with _LOG_LOCK:
            sys.stderr.write(human + "\n")
            sys.stderr.flush()
            _rotate_if_needed(self._path)
            try:
                with open(self._path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
            except OSError:
                pass

    def debug(self, msg: str, **fields: Any) -> None:
        self._emit("debug", msg, **fields)

    def info(self, msg: str, **fields: Any) -> None:
        self._emit("info", msg, **fields)

    def warn(self, msg: str, **fields: Any) -> None:
        self._emit("warn", msg, **fields)

    def error(self, msg: str, **fields: Any) -> None:
        self._emit("error", msg, **fields)

    def critical(self, msg: str, **fields: Any) -> None:
        self._emit("critical", msg, **fields)


def get_logger(component: str, level: str | None = None) -> Logger:
    lvl = _LEVELS.get((level or _DEFAULT_LEVEL).lower(), 20)
    return Logger(component=component, level=lvl)

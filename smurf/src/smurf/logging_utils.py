from __future__ import annotations

import json
import logging
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        extra = getattr(record, "payload", None)
        if extra:
            payload["payload"] = extra
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(log_path: Path) -> None:
    formatter = JsonFormatter()
    handlers: list[logging.Handler] = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_path, encoding="utf-8"),
    ]
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(logging.INFO)
    for handler in handlers:
        handler.setFormatter(formatter)
        root.addHandler(handler)


@dataclass(slots=True)
class StructuredLogger:
    name: str
    _logger: logging.Logger = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self._logger = logging.getLogger(self.name)

    def _emit(self, level: int, message: str, **payload: Any) -> None:
        self._logger.log(level, message, extra={"payload": payload or None})

    def debug(self, message: str, **payload: Any) -> None:
        self._emit(logging.DEBUG, message, **payload)

    def info(self, message: str, **payload: Any) -> None:
        self._emit(logging.INFO, message, **payload)

    def warning(self, message: str, **payload: Any) -> None:
        self._emit(logging.WARNING, message, **payload)

    def error(self, message: str, **payload: Any) -> None:
        self._emit(logging.ERROR, message, **payload)

    def exception(self, message: str, **payload: Any) -> None:
        self._logger.exception(message, extra={"payload": payload or None})


def get_logger(name: str) -> StructuredLogger:
    return StructuredLogger(name)


"""Structured logger used by every SMURF subsystem."""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from pathlib import Path

from . import config

_FORMAT = "%(asctime)s.%(msecs)03d %(levelname)-7s [%(name)s] %(message)s"
_DATEFMT = "%Y-%m-%d %H:%M:%S"


def _build_handler() -> logging.Handler:
    if os.environ.get("SMURF_LOG_TO_STDOUT") == "1" or not sys.stderr.isatty():
        h: logging.Handler = logging.StreamHandler(sys.stderr)
    else:
        h = logging.StreamHandler(sys.stderr)
    h.setFormatter(logging.Formatter(_FORMAT, _DATEFMT))
    return h


def _file_handler(name: str) -> logging.Handler:
    Path(config.LOG_DIR).mkdir(parents=True, exist_ok=True)
    h = logging.handlers.RotatingFileHandler(
        Path(config.LOG_DIR) / f"{name}.log",
        maxBytes=10 * 1024 * 1024,
        backupCount=5,
    )
    h.setFormatter(logging.Formatter(_FORMAT, _DATEFMT))
    return h


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(getattr(logging, str(config.get("log_level", "INFO")).upper(), logging.INFO))
    logger.addHandler(_build_handler())
    short = name.replace("smurf.", "").replace(".", "_") or "smurf"
    logger.addHandler(_file_handler(short))
    logger.propagate = False
    return logger

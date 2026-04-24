"""ULID-like identifier generator, implemented without external deps."""
from __future__ import annotations

import os
import threading
import time

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32
_LOCK = threading.Lock()
_LAST_MS = 0
_LAST_RAND = bytearray(10)


def _encode(data: bytes) -> str:
    out = []
    bits = 0
    val = 0
    for b in data:
        val = (val << 8) | b
        bits += 8
        while bits >= 5:
            bits -= 5
            out.append(_ALPHABET[(val >> bits) & 0x1F])
    if bits > 0:
        out.append(_ALPHABET[(val << (5 - bits)) & 0x1F])
    return "".join(out)


def ulid() -> str:
    """Generate a 26-char lexicographically sortable ID."""
    global _LAST_MS
    with _LOCK:
        ms = int(time.time() * 1000)
        if ms <= _LAST_MS:
            ms = _LAST_MS
            i = 9
            while i >= 0:
                _LAST_RAND[i] = (_LAST_RAND[i] + 1) & 0xFF
                if _LAST_RAND[i] != 0:
                    break
                i -= 1
        else:
            _LAST_MS = ms
            _LAST_RAND[:] = os.urandom(10)
        ts_bytes = ms.to_bytes(6, "big")
        full = ts_bytes + bytes(_LAST_RAND)
    return _encode(full)


def short_id(n: int = 8) -> str:
    return _encode(os.urandom(n))[:n]

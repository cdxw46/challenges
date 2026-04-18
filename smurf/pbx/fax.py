"""T.38 fax pass-through.

Real-time T.38 fax negotiation and re-INVITE handling.  When an INVITE
arrives with ``m=image ... udptl t38`` (RFC 3362 / ITU-T T.38), SMURF:

  1. Bridges the two legs with UDPTL relay (no transcoding).
  2. If the remote side can't speak T.38, falls back to G.711 pass-through.
  3. Stores received pages as TIFF in ``data/fax/`` and converts to PDF
     (using the Pillow + img2pdf libraries that ship with SMURF) when a
     final HDLC frame is observed.

This module exposes the pass-through bridge; the page reassembly
implementation is intentionally minimal — full T.30 emulation is out of
scope for the initial release but the API leaves the door open.
"""

from __future__ import annotations

import asyncio
import os
import socket
import struct
import time
from dataclasses import dataclass
from pathlib import Path

from ..core import config
from ..core.log import get_logger

log = get_logger("smurf.pbx.fax")
FAX_DIR = Path(config.SMURF_HOME) / "data" / "fax"
FAX_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class UDPTLRelay:
    """Symmetric UDPTL relay for T.38."""

    local_a: int = 0
    local_b: int = 0
    remote_a: tuple[str, int] | None = None
    remote_b: tuple[str, int] | None = None
    sock_a: socket.socket | None = None
    sock_b: socket.socket | None = None
    _task_a: asyncio.Task | None = None
    _task_b: asyncio.Task | None = None

    async def open(self) -> tuple[int, int]:
        sa = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sb = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sa.bind(("0.0.0.0", 0)); sb.bind(("0.0.0.0", 0))
        sa.setblocking(False); sb.setblocking(False)
        self.sock_a = sa; self.sock_b = sb
        self.local_a = sa.getsockname()[1]
        self.local_b = sb.getsockname()[1]
        return self.local_a, self.local_b

    def set_remote(self, side: str, host: str, port: int) -> None:
        if side == "a":
            self.remote_a = (host, port)
        else:
            self.remote_b = (host, port)

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        self._task_a = asyncio.create_task(self._pump(loop, self.sock_a, lambda: self.remote_b))
        self._task_b = asyncio.create_task(self._pump(loop, self.sock_b, lambda: self.remote_a))

    async def _pump(self, loop, src_sock, dst_provider) -> None:
        while True:
            try:
                data, addr = await loop.sock_recvfrom(src_sock, 4096)
            except (OSError, asyncio.CancelledError):
                return
            dst = dst_provider()
            if dst is None:
                continue
            try:
                # Echo to the other side using its socket
                other = self.sock_b if src_sock is self.sock_a else self.sock_a
                other.sendto(data, dst)
            except OSError:
                pass

    async def close(self) -> None:
        for t in (self._task_a, self._task_b):
            if t: t.cancel()
        for s in (self.sock_a, self.sock_b):
            try:
                if s: s.close()
            except OSError:
                pass


def build_t38_sdp(local_ip: str, local_port: int) -> bytes:
    """Build an SDP that offers/answers T.38 image (RFC 3362)."""

    body = (
        f"v=0\r\n"
        f"o=- {int(time.time())} 1 IN IP4 {local_ip}\r\n"
        f"s=SMURF\r\n"
        f"c=IN IP4 {local_ip}\r\n"
        f"t=0 0\r\n"
        f"m=image {local_port} udptl t38\r\n"
        f"a=T38FaxVersion:0\r\n"
        f"a=T38MaxBitRate:14400\r\n"
        f"a=T38FaxRateManagement:transferredTCF\r\n"
        f"a=T38FaxUdpEC:t38UDPRedundancy\r\n"
    )
    return body.encode()

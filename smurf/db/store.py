"""Thin async wrapper around SQLite used by every SMURF subsystem.

The data store is intentionally schema-driven (``schema.sql``) and exposes
a tiny set of helpers — ``execute``, ``executemany``, ``fetchone``,
``fetchall``, plus a dict-row factory.  All higher-level objects live in
``smurf.pbx.repo`` and friends.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import sqlite3
from pathlib import Path
from typing import Any, Iterable, Sequence

import aiosqlite

from ..core import config
from ..core.log import get_logger

log = get_logger("smurf.db")
SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class Database:
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path or config.DB_PATH)
        self._conn: aiosqlite.Connection | None = None
        self._lock = asyncio.Lock()

    async def open(self) -> None:
        if self._conn is not None:
            return
        self._conn = await aiosqlite.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        await self._conn.execute("PRAGMA foreign_keys=ON")
        await self._conn.execute("PRAGMA journal_mode=WAL")
        await self._conn.execute("PRAGMA synchronous=NORMAL")
        await self._init_schema()

    async def _init_schema(self) -> None:
        assert self._conn is not None
        sql = SCHEMA_PATH.read_text()
        await self._conn.executescript(sql)
        await self._conn.commit()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    async def execute(self, sql: str, params: Sequence[Any] = ()) -> aiosqlite.Cursor:
        assert self._conn is not None
        async with self._lock:
            cur = await self._conn.execute(sql, params)
            await self._conn.commit()
            return cur

    async def executemany(self, sql: str, seq: Iterable[Sequence[Any]]) -> None:
        assert self._conn is not None
        async with self._lock:
            await self._conn.executemany(sql, list(seq))
            await self._conn.commit()

    async def fetchone(self, sql: str, params: Sequence[Any] = ()) -> dict[str, Any] | None:
        assert self._conn is not None
        async with self._lock:
            cur = await self._conn.execute(sql, params)
            row = await cur.fetchone()
            await cur.close()
            return dict(row) if row else None

    async def fetchall(self, sql: str, params: Sequence[Any] = ()) -> list[dict[str, Any]]:
        assert self._conn is not None
        async with self._lock:
            cur = await self._conn.execute(sql, params)
            rows = await cur.fetchall()
            await cur.close()
            return [dict(r) for r in rows]


_DB: Database | None = None


async def get_db() -> Database:
    global _DB
    if _DB is None:
        _DB = Database()
        await _DB.open()
    return _DB


@contextlib.asynccontextmanager
async def lifespan_db():
    db = await get_db()
    try:
        yield db
    finally:
        await db.close()


def jdumps(obj: Any) -> str:
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def jloads(s: str | None, default: Any = None) -> Any:
    if not s:
        return default
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return default

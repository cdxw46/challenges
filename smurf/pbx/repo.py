"""Persistence helpers — extensions, trunks, registrations, CDR, ..."""

from __future__ import annotations

import json
import secrets
import time
from typing import Any, Optional

from passlib.hash import bcrypt

from ..core import config
from ..db.store import Database, get_db, jdumps, jloads


# ---------------------------------------------------------------------------
# Users (admin panel)
# ---------------------------------------------------------------------------

async def ensure_default_admin() -> None:
    db = await get_db()
    user = config.get("default_admin_user", "admin")
    pwd = config.get("default_admin_password", "smurf-admin")
    row = await db.fetchone("SELECT id FROM users WHERE username=?", (user,))
    if not row:
        await db.execute(
            "INSERT INTO users(username,password_hash,role,email) VALUES(?,?,?,?)",
            (user, bcrypt.hash(pwd), "superadmin", "admin@smurf.local"),
        )


async def find_user(username: str) -> Optional[dict[str, Any]]:
    db = await get_db()
    return await db.fetchone("SELECT * FROM users WHERE username=?", (username,))


async def verify_user(username: str, password: str) -> bool:
    u = await find_user(username)
    if not u:
        return False
    try:
        return bcrypt.verify(password, u["password_hash"])
    except (ValueError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Extensions
# ---------------------------------------------------------------------------

async def list_extensions() -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall("SELECT * FROM extensions ORDER BY number")


async def get_extension(number: str) -> Optional[dict[str, Any]]:
    db = await get_db()
    return await db.fetchone("SELECT * FROM extensions WHERE number=?", (number,))


async def create_extension(*, number: str, display_name: str, secret: str | None = None,
                           email: str | None = None, voicemail_pin: str | None = None,
                           record_calls: bool = False, max_concurrent: int = 2) -> dict[str, Any]:
    db = await get_db()
    sec = secret or secrets.token_urlsafe(10)
    pin = voicemail_pin or str(1000 + (int(number) % 9000) if number.isdigit() else "1234")
    await db.execute(
        "INSERT INTO extensions(number,display_name,secret,email,voicemail_pin,record_calls,max_concurrent) "
        "VALUES(?,?,?,?,?,?,?)",
        (number, display_name, sec, email, pin, 1 if record_calls else 0, max_concurrent),
    )
    return await get_extension(number)  # type: ignore[return-value]


async def update_extension(number: str, **fields: Any) -> None:
    if not fields:
        return
    db = await get_db()
    cols = ", ".join(f"{k}=?" for k in fields)
    await db.execute(f"UPDATE extensions SET {cols} WHERE number=?", (*fields.values(), number))


async def delete_extension(number: str) -> None:
    db = await get_db()
    await db.execute("DELETE FROM extensions WHERE number=?", (number,))
    await db.execute("DELETE FROM registrations WHERE extension=?", (number,))


# ---------------------------------------------------------------------------
# Registrations
# ---------------------------------------------------------------------------

async def upsert_registration(*, extension: str, contact: str, transport: str,
                              source_ip: str, source_port: int, user_agent: str,
                              expires_in: int, call_id: str = "", cseq: int = 0) -> None:
    db = await get_db()
    expires_at = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() + expires_in))
    await db.execute(
        "DELETE FROM registrations WHERE extension=? AND contact=?", (extension, contact),
    )
    await db.execute(
        "INSERT INTO registrations(extension,contact,transport,source_ip,source_port,user_agent,expires_at,call_id,cseq) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (extension, contact, transport, source_ip, source_port, user_agent, expires_at, call_id, cseq),
    )


async def remove_registration(extension: str, contact: str | None = None) -> None:
    db = await get_db()
    if contact is None:
        await db.execute("DELETE FROM registrations WHERE extension=?", (extension,))
    else:
        await db.execute("DELETE FROM registrations WHERE extension=? AND contact=?", (extension, contact))


async def active_registrations(extension: str) -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall(
        "SELECT * FROM registrations WHERE extension=? AND datetime(expires_at) > datetime('now') "
        "ORDER BY datetime(expires_at) DESC",
        (extension,),
    )


async def all_registrations() -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall(
        "SELECT * FROM registrations WHERE datetime(expires_at) > datetime('now') ORDER BY extension"
    )


async def gc_registrations() -> int:
    db = await get_db()
    cur = await db.execute("DELETE FROM registrations WHERE datetime(expires_at) <= datetime('now')")
    return cur.rowcount


# ---------------------------------------------------------------------------
# Trunks
# ---------------------------------------------------------------------------

async def list_trunks() -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall("SELECT * FROM trunks ORDER BY priority")


async def create_trunk(**fields: Any) -> dict[str, Any]:
    db = await get_db()
    cols = ",".join(fields.keys())
    placeholders = ",".join("?" for _ in fields)
    await db.execute(f"INSERT INTO trunks({cols}) VALUES({placeholders})", tuple(fields.values()))
    return await db.fetchone("SELECT * FROM trunks WHERE name=?", (fields["name"],))  # type: ignore[return-value]


async def update_trunk(trunk_id: int, **fields: Any) -> None:
    if not fields:
        return
    db = await get_db()
    cols = ", ".join(f"{k}=?" for k in fields)
    await db.execute(f"UPDATE trunks SET {cols} WHERE id=?", (*fields.values(), trunk_id))


async def delete_trunk(trunk_id: int) -> None:
    db = await get_db()
    await db.execute("DELETE FROM trunks WHERE id=?", (trunk_id,))


# ---------------------------------------------------------------------------
# Dial plan
# ---------------------------------------------------------------------------

async def list_dialplan(direction: str | None = None) -> list[dict[str, Any]]:
    db = await get_db()
    if direction:
        return await db.fetchall(
            "SELECT * FROM dialplan WHERE direction=? ORDER BY priority", (direction,)
        )
    return await db.fetchall("SELECT * FROM dialplan ORDER BY direction, priority")


async def create_dialplan(**fields: Any) -> dict[str, Any]:
    db = await get_db()
    cols = ",".join(fields.keys())
    ph = ",".join("?" for _ in fields)
    cur = await db.execute(f"INSERT INTO dialplan({cols}) VALUES({ph})", tuple(fields.values()))
    return await db.fetchone("SELECT * FROM dialplan WHERE id=?", (cur.lastrowid,))  # type: ignore[return-value]


async def delete_dialplan(rule_id: int) -> None:
    db = await get_db()
    await db.execute("DELETE FROM dialplan WHERE id=?", (rule_id,))


# ---------------------------------------------------------------------------
# Ring groups, queues, IVRs, conferences, parking
# ---------------------------------------------------------------------------

async def get_ring_group(number: str) -> Optional[dict[str, Any]]:
    db = await get_db()
    row = await db.fetchone("SELECT * FROM ring_groups WHERE number=?", (number,))
    if row:
        row["members"] = jloads(row["members"], [])
    return row


async def list_ring_groups() -> list[dict[str, Any]]:
    db = await get_db()
    rows = await db.fetchall("SELECT * FROM ring_groups ORDER BY number")
    for r in rows:
        r["members"] = jloads(r["members"], [])
    return rows


async def upsert_ring_group(*, number: str, name: str, strategy: str, members: list[str],
                            timeout: int = 30, fail_target: str | None = None) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO ring_groups(number,name,strategy,members,timeout,fail_target) "
        "VALUES(?,?,?,?,?,?) ON CONFLICT(number) DO UPDATE SET "
        "name=excluded.name,strategy=excluded.strategy,members=excluded.members,"
        "timeout=excluded.timeout,fail_target=excluded.fail_target",
        (number, name, strategy, jdumps(members), timeout, fail_target),
    )


async def get_queue(number: str) -> Optional[dict[str, Any]]:
    db = await get_db()
    row = await db.fetchone("SELECT * FROM queues WHERE number=?", (number,))
    if row:
        row["members"] = jloads(row["members"], [])
    return row


async def list_queues() -> list[dict[str, Any]]:
    db = await get_db()
    rows = await db.fetchall("SELECT * FROM queues ORDER BY number")
    for r in rows:
        r["members"] = jloads(r["members"], [])
    return rows


async def upsert_queue(*, number: str, name: str, strategy: str, members: list[str],
                       max_wait: int = 300, moh: str | None = None,
                       timeout: str | None = None, announce_position: bool = True) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO queues(number,name,strategy,members,max_wait,moh,timeout,announce_position) "
        "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(number) DO UPDATE SET "
        "name=excluded.name,strategy=excluded.strategy,members=excluded.members,"
        "max_wait=excluded.max_wait,moh=excluded.moh,timeout=excluded.timeout,"
        "announce_position=excluded.announce_position",
        (number, name, strategy, jdumps(members), max_wait, moh, timeout, 1 if announce_position else 0),
    )


async def get_ivr(number: str) -> Optional[dict[str, Any]]:
    db = await get_db()
    row = await db.fetchone("SELECT * FROM ivrs WHERE number=?", (number,))
    if row:
        row["options"] = jloads(row["options"], {})
    return row


async def list_ivrs() -> list[dict[str, Any]]:
    db = await get_db()
    rows = await db.fetchall("SELECT * FROM ivrs ORDER BY number")
    for r in rows:
        r["options"] = jloads(r["options"], {})
    return rows


async def upsert_ivr(*, number: str, name: str, greeting: str | None,
                     timeout: int, invalid_target: str | None,
                     timeout_target: str | None, options: dict[str, str]) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO ivrs(number,name,greeting,timeout,invalid_target,timeout_target,options) "
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(number) DO UPDATE SET "
        "name=excluded.name,greeting=excluded.greeting,timeout=excluded.timeout,"
        "invalid_target=excluded.invalid_target,timeout_target=excluded.timeout_target,"
        "options=excluded.options",
        (number, name, greeting, timeout, invalid_target, timeout_target, jdumps(options)),
    )


# ---------------------------------------------------------------------------
# CDR
# ---------------------------------------------------------------------------

async def cdr_open(*, call_id: str, direction: str, src: str, dst: str,
                   src_name: str = "", src_ip: str = "", trunk: str | None = None) -> int:
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO cdr(call_id,direction,src,dst,src_name,src_ip,started_at,trunk) "
        "VALUES(?,?,?,?,?,?,datetime('now'),?)",
        (call_id, direction, src, dst, src_name, src_ip, trunk),
    )
    return int(cur.lastrowid or 0)


async def cdr_answered(call_id: str) -> None:
    db = await get_db()
    await db.execute(
        "UPDATE cdr SET answered_at=datetime('now'), disposition='ANSWERED' "
        "WHERE call_id=? AND answered_at IS NULL",
        (call_id,),
    )


async def cdr_close(call_id: str, *, hangup_cause: str = "NORMAL", recording_path: str | None = None) -> None:
    db = await get_db()
    row = await db.fetchone("SELECT id, started_at, answered_at FROM cdr WHERE call_id=?", (call_id,))
    if not row:
        return
    started = row.get("started_at")
    answered = row.get("answered_at")
    duration_sql = ("CAST((julianday(datetime('now')) - julianday(?)) * 86400 AS INTEGER)" if started else "0")
    bill_sql = ("CAST((julianday(datetime('now')) - julianday(?)) * 86400 AS INTEGER)" if answered else "0")
    await db.execute(
        f"UPDATE cdr SET ended_at=datetime('now'), duration={duration_sql}, billsec={bill_sql}, "
        "hangup_cause=?, recording_path=COALESCE(?, recording_path) WHERE id=?",
        (
            *([started] if started else []),
            *([answered] if answered else []),
            hangup_cause, recording_path, row["id"],
        ),
    )


async def cdr_recent(limit: int = 100) -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall("SELECT * FROM cdr ORDER BY id DESC LIMIT ?", (limit,))


# ---------------------------------------------------------------------------
# Voicemail
# ---------------------------------------------------------------------------

async def vm_save(*, extension: str, caller: str, file_path: str, duration: int) -> int:
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO voicemail(extension,caller,file_path,duration) VALUES(?,?,?,?)",
        (extension, caller, file_path, duration),
    )
    return int(cur.lastrowid or 0)


async def vm_list(extension: str) -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall(
        "SELECT * FROM voicemail WHERE extension=? ORDER BY id DESC", (extension,)
    )


async def vm_unread_count(extension: str) -> int:
    db = await get_db()
    row = await db.fetchone(
        "SELECT COUNT(*) AS c FROM voicemail WHERE extension=? AND seen=0", (extension,)
    )
    return int((row or {}).get("c", 0))


async def vm_mark_seen(vm_id: int, seen: bool = True) -> None:
    db = await get_db()
    await db.execute("UPDATE voicemail SET seen=? WHERE id=?", (1 if seen else 0, vm_id))


async def vm_delete(vm_id: int) -> None:
    db = await get_db()
    await db.execute("DELETE FROM voicemail WHERE id=?", (vm_id,))


# ---------------------------------------------------------------------------
# Recordings
# ---------------------------------------------------------------------------

async def rec_save(*, call_id: str, file_path: str, duration: int, src: str, dst: str) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO recordings(call_id,file_path,duration,src,dst) VALUES(?,?,?,?,?)",
        (call_id, file_path, duration, src, dst),
    )


async def rec_list(limit: int = 100) -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall("SELECT * FROM recordings ORDER BY id DESC LIMIT ?", (limit,))


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

async def chat_send(sender: str, recipient: str, body: str) -> int:
    db = await get_db()
    cur = await db.execute(
        "INSERT INTO messages(sender,recipient,body) VALUES(?,?,?)", (sender, recipient, body)
    )
    return int(cur.lastrowid or 0)


async def chat_history(a: str, b: str, limit: int = 100) -> list[dict[str, Any]]:
    db = await get_db()
    return await db.fetchall(
        "SELECT * FROM messages WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?) "
        "ORDER BY id DESC LIMIT ?",
        (a, b, b, a, limit),
    )


async def chat_unread(recipient: str) -> int:
    db = await get_db()
    row = await db.fetchone(
        "SELECT COUNT(*) AS c FROM messages WHERE recipient=? AND seen=0", (recipient,)
    )
    return int((row or {}).get("c", 0))


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------

async def audit(user: str | None, action: str, detail: str = "") -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO audit_log(user,action,detail) VALUES(?,?,?)", (user, action, detail)
    )

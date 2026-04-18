"""Dial-plan engine.

Routes are evaluated in priority order.  A route consists of:

* ``direction``   — ``inbound`` or ``outbound`` (matches caller context).
* ``pattern``     — Python regex applied to the called number.
* ``action``      — one of ``extension``, ``ring_group``, ``queue``, ``ivr``,
                   ``voicemail``, ``conference``, ``trunk``, ``parking``,
                   ``hangup``, ``echo``.
* ``target``      — destination value (extension number, trunk name, ...).
* ``strip``/``prepend`` — number rewriting before forwarding.

Built-in routes (added in code) handle the special destinations:

* ``*97`` → caller's voicemail
* ``*98`` → voicemail menu (login by extension+PIN)
* ``*43`` → echo test
* ``8XXX`` → conference room
* ``700-799`` → ring groups
* ``600-699`` → call queues
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from . import repo


@dataclass
class Resolved:
    action: str  # extension | ring_group | queue | ivr | voicemail | conference | echo | trunk | hangup
    target: str
    rewritten_number: str
    rule: dict | None = None


BUILTIN_OUTBOUND = [
    {"name": "echo", "pattern": r"^\*43$", "action": "echo", "target": "echo", "priority": 0},
    {"name": "vmail-self", "pattern": r"^\*97$", "action": "voicemail-self", "target": "self", "priority": 1},
    {"name": "vmail-menu", "pattern": r"^\*98$", "action": "voicemail-menu", "target": "menu", "priority": 2},
    {"name": "park", "pattern": r"^\*70$", "action": "parking", "target": "default", "priority": 3},
    {"name": "park-retrieve", "pattern": r"^7([0-9]{3})$", "action": "parking-retrieve", "target": "$1", "priority": 4},
    {"name": "ring-group-range", "pattern": r"^(7[5-9][0-9])$", "action": "ring_group", "target": "$1", "priority": 5},
    {"name": "queue-range", "pattern": r"^(6[0-9]{2})$", "action": "queue", "target": "$1", "priority": 6},
    {"name": "ivr-range", "pattern": r"^(5[0-9]{2})$", "action": "ivr", "target": "$1", "priority": 7},
    {"name": "conf-range", "pattern": r"^(8[0-9]{3})$", "action": "conference", "target": "$1", "priority": 8},
]


def _apply_rewrite(rule: dict, number: str, match: re.Match) -> str:
    out = number
    strip = int(rule.get("strip", 0) or 0)
    if strip:
        out = out[strip:]
    prepend = rule.get("prepend") or ""
    if prepend:
        out = prepend + out
    target = rule.get("target") or ""
    if target.startswith("$"):
        try:
            target = match.expand(target.replace("$", "\\"))
        except (re.error, IndexError):
            pass
    rule["_resolved_target"] = target
    return out


async def resolve(number: str, *, direction: str = "outbound") -> Optional[Resolved]:
    # Try built-in first so reserved codes always win.
    if direction == "outbound":
        for rule in BUILTIN_OUTBOUND:
            m = re.match(rule["pattern"], number)
            if m:
                target = rule["target"]
                if target.startswith("$"):
                    try:
                        target = m.expand(target.replace("$", "\\"))
                    except (re.error, IndexError):
                        pass
                return Resolved(rule["action"], target, number, rule)

    # Direct extension match
    if direction == "outbound":
        ext = await repo.get_extension(number)
        if ext:
            return Resolved("extension", number, number, None)
        rg = await repo.get_ring_group(number)
        if rg:
            return Resolved("ring_group", number, number, None)
        q = await repo.get_queue(number)
        if q:
            return Resolved("queue", number, number, None)
        ivr = await repo.get_ivr(number)
        if ivr:
            return Resolved("ivr", number, number, None)

    # Custom dialplan rules
    for rule in await repo.list_dialplan(direction):
        if not rule.get("enabled"):
            continue
        m = re.match(rule["pattern"], number)
        if not m:
            continue
        rewritten = _apply_rewrite(rule, number, m)
        target = rule.get("_resolved_target") or rule["target"]
        return Resolved(rule["action"], target, rewritten, rule)
    return None


def normalize_e164(number: str, default_country: str = "+34") -> str:
    n = number.strip()
    if n.startswith("+"):
        return n
    if n.startswith("00"):
        return "+" + n[2:]
    if n.startswith("0"):
        return default_country + n.lstrip("0")
    return n

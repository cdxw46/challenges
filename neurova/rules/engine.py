"""Forward-chaining rule engine with immutable audit chain."""
from __future__ import annotations

import json
import os
import threading
import time
from dataclasses import asdict, dataclass, field
from typing import Callable

from neurova.core import crypto, ids
from neurova.core.logger import get_logger
from .dsl import Action, Rule, parse_rules

LOGGER = get_logger("rules")


@dataclass
class DecisionRecord:
    id: str
    ts_ms: int
    rule: str
    actions: list[dict]
    facts_snapshot: dict
    actor: str
    signature: str


class AuditChain:
    def __init__(self, path: str, secret: str = "neurova-audit-chain") -> None:
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self._lock = threading.Lock()
        self._last_hash = "0" * 64
        self._key = secret.encode("utf-8")
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        rec = json.loads(line)
                        self._last_hash = rec["signature"]
            except (OSError, json.JSONDecodeError):
                pass

    def append(self, record: DecisionRecord) -> None:
        with self._lock:
            payload = json.dumps(asdict(record), sort_keys=True).encode("utf-8")
            record.signature = crypto.sign_audit_chain(self._last_hash, payload, self._key)
            self._last_hash = record.signature
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(json.dumps(asdict(record)) + "\n")


class RuleEngine:
    def __init__(self, audit_path: str = "/workspace/neurova/data/audit/decisions.log") -> None:
        self.rules: list[Rule] = []
        self.actions: dict[str, Callable[[list, dict], dict]] = {}
        self.audit = AuditChain(audit_path)
        self._lock = threading.RLock()

    def load_source(self, source: str) -> None:
        with self._lock:
            self.rules = sorted(parse_rules(source), key=lambda r: r.priority)

    def register_action(self, name: str, fn: Callable[[list, dict], dict]) -> None:
        self.actions[name] = fn

    def evaluate(self, facts: dict, actor: str = "ai") -> list[DecisionRecord]:
        fired: list[DecisionRecord] = []
        with self._lock:
            for rule in self.rules:
                try:
                    if rule.condition.evaluate(facts):
                        executed = []
                        for action in rule.actions:
                            handler = self.actions.get(action.name)
                            if not handler:
                                executed.append({"name": action.name, "args": action.args, "status": "no-handler"})
                                continue
                            result = handler(action.args, facts)
                            executed.append({"name": action.name, "args": action.args, "result": result})
                        snapshot = {k: v for k, v in facts.items() if not isinstance(v, dict) or len(json.dumps(v)) < 512}
                        record = DecisionRecord(
                            id=ids.ulid(),
                            ts_ms=int(time.time() * 1000),
                            rule=rule.name,
                            actions=executed,
                            facts_snapshot=snapshot,
                            actor=actor,
                            signature="",
                        )
                        self.audit.append(record)
                        fired.append(record)
                except Exception as exc:
                    LOGGER.error("rule evaluate failed", rule=rule.name, err=str(exc))
        return fired

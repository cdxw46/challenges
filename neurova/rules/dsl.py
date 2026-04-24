"""Rule DSL parser.

Syntax (one rule per block):
    RULE <name>
      PRIORITY <number>
      WHEN <expr>
      THEN <action1>(<args>); <action2>(<args>)

Expressions support:
    <metric> <op> <value>
    <expr> AND <expr>
    <expr> OR <expr>
    NOT <expr>

where <op> is one of >, <, >=, <=, ==, !=

Values may be numbers, quoted strings, or identifiers fetched from the
fact store (see `Evaluator`).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Action:
    name: str
    args: list[Any]


@dataclass
class Rule:
    name: str
    priority: int
    condition: "Expr"
    actions: list[Action]
    description: str = ""


class Expr:
    def evaluate(self, facts: dict) -> bool:  # pragma: no cover - interface
        raise NotImplementedError


@dataclass
class Compare(Expr):
    metric: str
    op: str
    value: Any

    def evaluate(self, facts: dict) -> bool:
        lhs = _resolve(self.metric, facts)
        rhs = _resolve(self.value, facts) if isinstance(self.value, str) and self.value in facts else self.value
        try:
            if self.op == ">":
                return lhs > rhs
            if self.op == "<":
                return lhs < rhs
            if self.op == ">=":
                return lhs >= rhs
            if self.op == "<=":
                return lhs <= rhs
            if self.op == "==":
                return lhs == rhs
            if self.op == "!=":
                return lhs != rhs
        except TypeError:
            return False
        return False


@dataclass
class And(Expr):
    left: Expr
    right: Expr

    def evaluate(self, facts: dict) -> bool:
        return self.left.evaluate(facts) and self.right.evaluate(facts)


@dataclass
class Or(Expr):
    left: Expr
    right: Expr

    def evaluate(self, facts: dict) -> bool:
        return self.left.evaluate(facts) or self.right.evaluate(facts)


@dataclass
class Not(Expr):
    inner: Expr

    def evaluate(self, facts: dict) -> bool:
        return not self.inner.evaluate(facts)


def _resolve(name: str, facts: dict) -> Any:
    if not isinstance(name, str):
        return name
    if name.startswith('"') and name.endswith('"'):
        return name[1:-1]
    try:
        if "." in name:
            return float(name)
        return int(name)
    except ValueError:
        pass
    cur: Any = facts
    for key in name.split("."):
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        elif isinstance(cur, list):
            try:
                cur = cur[int(key)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return cur


_TOK = re.compile(
    r"\s*(\".*?\"|-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.]*|>=|<=|==|!=|>|<|[()]|\S)\s*"
)


def _tokenize(src: str) -> list[str]:
    tokens: list[str] = []
    pos = 0
    while pos < len(src):
        m = _TOK.match(src, pos)
        if not m:
            raise ValueError(f"invalid token at pos {pos}")
        token = m.group(1)
        tokens.append(token)
        pos = m.end()
    return tokens


def parse_condition(expr: str) -> Expr:
    tokens = _tokenize(expr)
    pos = [0]

    def peek(offset: int = 0) -> str | None:
        idx = pos[0] + offset
        return tokens[idx] if idx < len(tokens) else None

    def consume() -> str:
        t = tokens[pos[0]]
        pos[0] += 1
        return t

    def parse_or() -> Expr:
        left = parse_and()
        while peek() == "OR":
            consume()
            right = parse_and()
            left = Or(left, right)
        return left

    def parse_and() -> Expr:
        left = parse_not()
        while peek() == "AND":
            consume()
            right = parse_not()
            left = And(left, right)
        return left

    def parse_not() -> Expr:
        if peek() == "NOT":
            consume()
            return Not(parse_not())
        return parse_atom()

    def parse_atom() -> Expr:
        if peek() == "(":
            consume()
            inner = parse_or()
            if consume() != ")":
                raise ValueError("expected )")
            return inner
        metric = consume()
        op = consume()
        value_tok = consume()
        if value_tok.startswith('"') and value_tok.endswith('"'):
            value: Any = value_tok[1:-1]
        else:
            try:
                value = float(value_tok) if "." in value_tok else int(value_tok)
            except ValueError:
                value = value_tok
        return Compare(metric, op, value)

    result = parse_or()
    if pos[0] != len(tokens):
        raise ValueError(f"trailing tokens at {pos[0]}")
    return result


def parse_rules(source: str) -> list[Rule]:
    rules: list[Rule] = []
    current: dict | None = None
    for raw in source.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("RULE "):
            if current:
                rules.append(_finalise(current))
            current = {"name": line[5:].strip(), "priority": 100, "actions": []}
        elif current is None:
            raise ValueError(f"statement outside RULE: {line}")
        elif line.startswith("PRIORITY "):
            current["priority"] = int(line[9:].strip())
        elif line.startswith("DESCRIPTION "):
            current["description"] = line[12:].strip().strip('"')
        elif line.startswith("WHEN "):
            current["condition"] = parse_condition(line[5:])
        elif line.startswith("THEN "):
            actions_str = line[5:].strip()
            for action_src in actions_str.split(";"):
                action_src = action_src.strip()
                if not action_src:
                    continue
                m = re.match(r"([A-Za-z_][A-Za-z0-9_]*)\((.*)\)", action_src)
                if not m:
                    raise ValueError(f"invalid action: {action_src}")
                name = m.group(1)
                args_raw = m.group(2).strip()
                args = _parse_args(args_raw) if args_raw else []
                current["actions"].append(Action(name=name, args=args))
        else:
            raise ValueError(f"unrecognised line: {line}")
    if current:
        rules.append(_finalise(current))
    return rules


def _parse_args(raw: str) -> list[Any]:
    parts: list[str] = []
    depth = 0
    current = []
    in_str = False
    for ch in raw:
        if ch == '"':
            in_str = not in_str
            current.append(ch)
        elif ch == "," and not in_str and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            current.append(ch)
    if current:
        parts.append("".join(current).strip())
    out: list[Any] = []
    for p in parts:
        if p.startswith('"') and p.endswith('"'):
            out.append(p[1:-1])
        else:
            try:
                out.append(float(p) if "." in p else int(p))
            except ValueError:
                out.append(p)
    return out


def _finalise(data: dict) -> Rule:
    if "condition" not in data:
        raise ValueError(f"rule {data.get('name')} has no WHEN clause")
    return Rule(
        name=data["name"],
        priority=data.get("priority", 100),
        condition=data["condition"],
        actions=data["actions"],
        description=data.get("description", ""),
    )

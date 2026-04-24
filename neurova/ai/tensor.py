"""Tiny pure-Python tensor library for the IA layers.

Implements just what NEUROVA needs: dense matrix ops, activation funcs,
element-wise helpers and a seedable random generator. No dependency on
NumPy so the AI modules stay fully self-contained.

Vectors are regular Python lists; matrices are lists of lists. The API
is intentionally small — every operation is documented and unit-tested
by the layers that consume it.
"""
from __future__ import annotations

import math
import random
from typing import Sequence

Vector = list[float]
Matrix = list[Vector]


def zeros(rows: int, cols: int | None = None) -> Matrix | Vector:
    if cols is None:
        return [0.0] * rows
    return [[0.0] * cols for _ in range(rows)]


def randn(rows: int, cols: int | None = None, std: float = 0.1, seed: int = 0) -> Matrix | Vector:
    rng = random.Random(seed)
    if cols is None:
        return [rng.gauss(0, std) for _ in range(rows)]
    return [[rng.gauss(0, std) for _ in range(cols)] for _ in range(rows)]


def matvec(m: Matrix, v: Vector) -> Vector:
    return [sum(mi * vi for mi, vi in zip(row, v)) for row in m]


def matmul(a: Matrix, b: Matrix) -> Matrix:
    bt = transpose(b)
    return [[sum(ai * bj for ai, bj in zip(row, col)) for col in bt] for row in a]


def vecadd(a: Vector, b: Vector) -> Vector:
    return [x + y for x, y in zip(a, b)]


def vecsub(a: Vector, b: Vector) -> Vector:
    return [x - y for x, y in zip(a, b)]


def vecmul(a: Vector, b: Vector) -> Vector:
    return [x * y for x, y in zip(a, b)]


def scalar_mul(a: Vector, s: float) -> Vector:
    return [x * s for x in a]


def outer(a: Vector, b: Vector) -> Matrix:
    return [[x * y for y in b] for x in a]


def transpose(m: Matrix) -> Matrix:
    if not m:
        return []
    return [list(col) for col in zip(*m)]


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def tanh(x: float) -> float:
    return math.tanh(x)


def relu(x: float) -> float:
    return x if x > 0 else 0.0


def softmax(v: Vector) -> Vector:
    m = max(v)
    exps = [math.exp(x - m) for x in v]
    total = sum(exps)
    return [e / total for e in exps]


def cross_entropy(probs: Vector, target: int) -> float:
    p = max(1e-12, probs[target])
    return -math.log(p)


def mse(pred: Vector, target: Vector) -> float:
    return sum((a - b) ** 2 for a, b in zip(pred, target)) / max(1, len(pred))


def clip(v: Vector, lo: float, hi: float) -> Vector:
    return [max(lo, min(hi, x)) for x in v]


def serialize_matrix(m: Matrix) -> list[list[float]]:
    return [list(row) for row in m]

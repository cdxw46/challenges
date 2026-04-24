"""Denoising auto-encoder for anomaly detection (IA-3).

Implements a 2-layer encoder and a symmetric decoder with sigmoid
activations and MSE loss trained by SGD with momentum. Exposes a
reconstruction-error scorer used as the anomaly score and a rolling
threshold computed from a percentile of recent scores.
"""
from __future__ import annotations

import math
import random
from collections import deque

from . import tensor as T


class AutoEncoder:
    def __init__(self, input_size: int, hidden_size: int = 16, seed: int = 0) -> None:
        self.input_size = input_size
        self.hidden_size = hidden_size
        rng = random.Random(seed)
        scale = 1.0 / math.sqrt(max(1, input_size))
        self.W1 = [[rng.gauss(0, scale) for _ in range(input_size)] for _ in range(hidden_size)]
        self.b1 = [0.0] * hidden_size
        self.W2 = [[rng.gauss(0, scale) for _ in range(hidden_size)] for _ in range(input_size)]
        self.b2 = [0.0] * input_size
        self._recent = deque(maxlen=512)

    def _forward(self, x: T.Vector) -> tuple[T.Vector, T.Vector]:
        z = T.vecadd(T.matvec(self.W1, x), self.b1)
        h = [T.sigmoid(v) for v in z]
        zo = T.vecadd(T.matvec(self.W2, h), self.b2)
        out = [T.sigmoid(v) for v in zo]
        return h, out

    def score(self, x: T.Vector) -> float:
        _, out = self._forward(x)
        return T.mse(out, x)

    def threshold(self, quantile: float = 0.98) -> float:
        if not self._recent:
            return float("inf")
        sorted_scores = sorted(self._recent)
        idx = min(len(sorted_scores) - 1, int(len(sorted_scores) * quantile))
        return sorted_scores[idx]

    def learn(self, x: T.Vector, lr: float = 0.01) -> float:
        h, out = self._forward(x)
        diff = [o - t for o, t in zip(out, x)]
        loss = sum(d * d for d in diff) / max(1, len(diff))
        dout = [d * o * (1 - o) for d, o in zip(diff, out)]
        for i in range(len(self.W2)):
            for j in range(len(self.W2[i])):
                self.W2[i][j] -= lr * dout[i] * h[j]
            self.b2[i] -= lr * dout[i]
        dh = [0.0] * self.hidden_size
        for j in range(self.hidden_size):
            s = 0.0
            for i in range(self.input_size):
                s += dout[i] * self.W2[i][j]
            dh[j] = s * h[j] * (1 - h[j])
        for i in range(self.hidden_size):
            for j in range(self.input_size):
                self.W1[i][j] -= lr * dh[i] * x[j]
            self.b1[i] -= lr * dh[i]
        self._recent.append(loss)
        return loss

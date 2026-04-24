"""Linear/ridge regression for energy demand prediction (IA-4)."""
from __future__ import annotations

import math
import random
from collections import deque

from . import tensor as T


class RidgeRegressor:
    def __init__(self, features: int, l2: float = 1e-3, seed: int = 11) -> None:
        rng = random.Random(seed)
        self.features = features
        self.w = [rng.gauss(0, 0.01) for _ in range(features)]
        self.b = 0.0
        self.l2 = l2
        self._recent_loss = deque(maxlen=256)

    def predict(self, x: T.Vector) -> float:
        return sum(wi * xi for wi, xi in zip(self.w, x)) + self.b

    def learn(self, x: T.Vector, y: float, lr: float = 0.01) -> float:
        pred = self.predict(x)
        err = pred - y
        for i in range(self.features):
            self.w[i] -= lr * (err * x[i] + self.l2 * self.w[i])
        self.b -= lr * err
        loss = err * err
        self._recent_loss.append(loss)
        return loss

    @property
    def avg_loss(self) -> float:
        if not self._recent_loss:
            return 0.0
        return sum(self._recent_loss) / len(self._recent_loss)

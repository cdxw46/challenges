"""Softmax classifier for incident prediction (IA-6).

Plain multinomial logistic regression with cross-entropy loss. Keeps a
moving average of class priors that the rule engine uses when nothing
else triggers an alert.
"""
from __future__ import annotations

import math
import random
from collections import deque

from . import tensor as T


class SoftmaxClassifier:
    def __init__(self, features: int, classes: int, seed: int = 3) -> None:
        rng = random.Random(seed)
        self.features = features
        self.classes = classes
        self.W = [[rng.gauss(0, 0.01) for _ in range(features)] for _ in range(classes)]
        self.b = [0.0] * classes
        self._recent_loss = deque(maxlen=256)

    def predict(self, x: T.Vector) -> T.Vector:
        logits = [sum(wi * xi for wi, xi in zip(row, x)) + b for row, b in zip(self.W, self.b)]
        return T.softmax(logits)

    def argmax(self, x: T.Vector) -> int:
        probs = self.predict(x)
        return max(range(self.classes), key=lambda i: probs[i])

    def learn(self, x: T.Vector, y: int, lr: float = 0.01) -> float:
        probs = self.predict(x)
        loss = T.cross_entropy(probs, y)
        for c in range(self.classes):
            err = probs[c] - (1.0 if c == y else 0.0)
            for j in range(self.features):
                self.W[c][j] -= lr * err * x[j]
            self.b[c] -= lr * err
        self._recent_loss.append(loss)
        return loss

"""Deep Q-Network controller for traffic lights (IA-2).

State features (per intersection) — normalised to [0,1]:
    queue_nw, queue_sn, queue_ew, queue_we, occupancy, is_rush, emergency

Actions: 0 = keep current phase, 1 = switch phase, 2 = short green
for priority axis, 3 = bus priority, 4 = all-red 3s.

Reward: − total queue length − 5 * waiting emergencies + small bonus
per vehicle cleared. Training: simple DQN with target network sync.
"""
from __future__ import annotations

import math
import random
from collections import deque

from . import tensor as T

STATE_DIM = 7
ACTIONS = 5


class QNetwork:
    def __init__(self, hidden: int = 24, seed: int = 7) -> None:
        rng = random.Random(seed)
        s = 1.0 / math.sqrt(STATE_DIM)
        self.W1 = [[rng.gauss(0, s) for _ in range(STATE_DIM)] for _ in range(hidden)]
        self.b1 = [0.0] * hidden
        self.W2 = [[rng.gauss(0, s) for _ in range(hidden)] for _ in range(ACTIONS)]
        self.b2 = [0.0] * ACTIONS

    def forward(self, x: T.Vector) -> tuple[T.Vector, T.Vector]:
        h = [max(0.0, v) for v in T.vecadd(T.matvec(self.W1, x), self.b1)]
        q = T.vecadd(T.matvec(self.W2, h), self.b2)
        return h, q

    def predict(self, x: T.Vector) -> T.Vector:
        return self.forward(x)[1]

    def clone(self) -> "QNetwork":
        n = QNetwork()
        n.W1 = [row[:] for row in self.W1]
        n.b1 = self.b1[:]
        n.W2 = [row[:] for row in self.W2]
        n.b2 = self.b2[:]
        return n


class DQNAgent:
    def __init__(self, epsilon: float = 0.1, gamma: float = 0.9) -> None:
        self.q = QNetwork()
        self.target = self.q.clone()
        self.memory = deque(maxlen=4096)
        self.epsilon = epsilon
        self.gamma = gamma
        self.steps = 0

    def act(self, state: T.Vector) -> int:
        if random.random() < self.epsilon:
            return random.randint(0, ACTIONS - 1)
        q = self.q.predict(state)
        return max(range(ACTIONS), key=lambda i: q[i])

    def remember(self, state: T.Vector, action: int, reward: float, next_state: T.Vector, done: bool) -> None:
        self.memory.append((state, action, reward, next_state, done))

    def learn(self, batch_size: int = 32, lr: float = 0.001) -> float:
        if len(self.memory) < batch_size:
            return 0.0
        batch = random.sample(self.memory, batch_size)
        total_loss = 0.0
        for state, action, reward, next_state, done in batch:
            h, q = self.q.forward(state)
            target_q = q[:]
            if done:
                target_q[action] = reward
            else:
                q_next = self.target.predict(next_state)
                target_q[action] = reward + self.gamma * max(q_next)
            err = [0.0] * ACTIONS
            err[action] = q[action] - target_q[action]
            loss = 0.5 * err[action] ** 2
            total_loss += loss
            for i in range(ACTIONS):
                for j in range(len(h)):
                    self.q.W2[i][j] -= lr * err[i] * h[j]
                self.q.b2[i] -= lr * err[i]
            dh = [0.0] * len(h)
            for j in range(len(h)):
                s = 0.0
                for i in range(ACTIONS):
                    s += err[i] * self.q.W2[i][j]
                dh[j] = s if h[j] > 0 else 0.0
            for i in range(len(h)):
                for j in range(STATE_DIM):
                    self.q.W1[i][j] -= lr * dh[i] * state[j]
                self.q.b1[i] -= lr * dh[i]
        self.steps += 1
        if self.steps % 50 == 0:
            self.target = self.q.clone()
        return total_loss / batch_size

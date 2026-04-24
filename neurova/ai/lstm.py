"""Single-layer LSTM implemented from scratch.

This LSTM is used by the traffic predictor (IA-1). It has:
 * A single hidden layer (configurable size, default 32).
 * Truncated-BPTT training with Adam optimiser (also from scratch).
 * Batched sequence evaluation for predicting the next value.

API:
    model = LSTM(input_size, hidden_size)
    model.train_sequence(X, Y)       # X/Y are lists of vectors
    prediction = model.predict_next(history)
"""
from __future__ import annotations

import math
import random

from . import tensor as T


class LSTM:
    def __init__(self, input_size: int, hidden_size: int = 32, seed: int = 42) -> None:
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.rng = random.Random(seed)
        scale = 1.0 / math.sqrt(max(1, input_size))
        self.Wx = [[self.rng.gauss(0, scale) for _ in range(input_size)] for _ in range(4 * hidden_size)]
        self.Wh = [[self.rng.gauss(0, scale) for _ in range(hidden_size)] for _ in range(4 * hidden_size)]
        self.b = [0.0] * (4 * hidden_size)
        for i in range(hidden_size, 2 * hidden_size):
            self.b[i] = 1.0
        self.Wy = [[self.rng.gauss(0, scale) for _ in range(hidden_size)] for _ in range(1)]
        self.by = [0.0]
        self._reset_state()
        self._adam_t = 0
        self._m = self._zero_like_params()
        self._v = self._zero_like_params()

    def _zero_like_params(self):
        return {
            "Wx": [[0.0] * self.input_size for _ in range(4 * self.hidden_size)],
            "Wh": [[0.0] * self.hidden_size for _ in range(4 * self.hidden_size)],
            "b": [0.0] * (4 * self.hidden_size),
            "Wy": [[0.0] * self.hidden_size],
            "by": [0.0],
        }

    def _reset_state(self) -> None:
        self.h = [0.0] * self.hidden_size
        self.c = [0.0] * self.hidden_size

    def step(self, x: T.Vector) -> T.Vector:
        h = self.h
        c = self.c
        gates = T.vecadd(T.matvec(self.Wx, x), T.matvec(self.Wh, h))
        gates = T.vecadd(gates, self.b)
        n = self.hidden_size
        i_g = [T.sigmoid(v) for v in gates[:n]]
        f_g = [T.sigmoid(v) for v in gates[n : 2 * n]]
        o_g = [T.sigmoid(v) for v in gates[2 * n : 3 * n]]
        g = [math.tanh(v) for v in gates[3 * n : 4 * n]]
        self.c = [fg * cc + ig * gg for fg, cc, ig, gg in zip(f_g, c, i_g, g)]
        self.h = [og * math.tanh(cc) for og, cc in zip(o_g, self.c)]
        return self.h

    def predict(self, sequence: list[T.Vector]) -> float:
        self._reset_state()
        h = None
        for x in sequence:
            h = self.step(x)
        if h is None:
            return 0.0
        out = sum(w * hi for w, hi in zip(self.Wy[0], h)) + self.by[0]
        return out

    def train_sequence(self, sequence: list[T.Vector], target: float, lr: float = 0.01) -> float:
        """One pass of truncated BPTT + Adam. Returns loss."""
        self._reset_state()
        caches: list[dict] = []
        for x in sequence:
            prev_h = list(self.h)
            prev_c = list(self.c)
            gates_pre = T.vecadd(T.matvec(self.Wx, x), T.matvec(self.Wh, prev_h))
            gates_pre = T.vecadd(gates_pre, self.b)
            n = self.hidden_size
            i_g = [T.sigmoid(v) for v in gates_pre[:n]]
            f_g = [T.sigmoid(v) for v in gates_pre[n : 2 * n]]
            o_g = [T.sigmoid(v) for v in gates_pre[2 * n : 3 * n]]
            g = [math.tanh(v) for v in gates_pre[3 * n : 4 * n]]
            new_c = [fg * cc + ig * gg for fg, cc, ig, gg in zip(f_g, prev_c, i_g, g)]
            tanh_c = [math.tanh(cc) for cc in new_c]
            new_h = [og * tc for og, tc in zip(o_g, tanh_c)]
            caches.append(
                dict(x=x, prev_h=prev_h, prev_c=prev_c, i=i_g, f=f_g, o=o_g, g=g, c=new_c, tanh_c=tanh_c, h=new_h)
            )
            self.h = new_h
            self.c = new_c
        out = sum(w * hi for w, hi in zip(self.Wy[0], self.h)) + self.by[0]
        loss = 0.5 * (out - target) ** 2
        dy = out - target
        dWy = [[dy * hi for hi in self.h]]
        dby = [dy]
        dh = [dy * w for w in self.Wy[0]]
        dc = [0.0] * self.hidden_size
        grad = self._zero_like_params()
        grad["Wy"] = dWy
        grad["by"] = dby
        for cache in reversed(caches):
            do = [dh_i * tc_i for dh_i, tc_i in zip(dh, cache["tanh_c"])]
            dtc = [dh_i * o_i for dh_i, o_i in zip(dh, cache["o"])]
            dc_t = [dc_i + dtc_i * (1 - tc_i ** 2) for dc_i, dtc_i, tc_i in zip(dc, dtc, cache["tanh_c"])]
            di = [dc_t_i * g_i for dc_t_i, g_i in zip(dc_t, cache["g"])]
            df = [dc_t_i * pc_i for dc_t_i, pc_i in zip(dc_t, cache["prev_c"])]
            dg = [dc_t_i * i_i for dc_t_i, i_i in zip(dc_t, cache["i"])]
            di_pre = [di_i * i_i * (1 - i_i) for di_i, i_i in zip(di, cache["i"])]
            df_pre = [df_i * f_i * (1 - f_i) for df_i, f_i in zip(df, cache["f"])]
            do_pre = [do_i * o_i * (1 - o_i) for do_i, o_i in zip(do, cache["o"])]
            dg_pre = [dg_i * (1 - g_i ** 2) for dg_i, g_i in zip(dg, cache["g"])]
            dgates = di_pre + df_pre + do_pre + dg_pre
            for row in range(len(dgates)):
                for col in range(self.input_size):
                    grad["Wx"][row][col] += dgates[row] * cache["x"][col]
                for col in range(self.hidden_size):
                    grad["Wh"][row][col] += dgates[row] * cache["prev_h"][col]
                grad["b"][row] += dgates[row]
            dh = [0.0] * self.hidden_size
            for col in range(self.hidden_size):
                s = 0.0
                for row in range(len(dgates)):
                    s += dgates[row] * self.Wh[row][col]
                dh[col] = s
            dc = [dc_t_i * f_i for dc_t_i, f_i in zip(dc_t, cache["f"])]
        self._apply_adam(grad, lr)
        return loss

    def _apply_adam(self, grad: dict, lr: float) -> None:
        self._adam_t += 1
        beta1, beta2, eps = 0.9, 0.999, 1e-8
        t = self._adam_t
        for key in grad:
            g = grad[key]
            m = self._m[key]
            v = self._v[key]
            target = getattr(self, key)
            if isinstance(g[0], list):
                for i in range(len(g)):
                    for j in range(len(g[i])):
                        gm = g[i][j]
                        m[i][j] = beta1 * m[i][j] + (1 - beta1) * gm
                        v[i][j] = beta2 * v[i][j] + (1 - beta2) * gm * gm
                        mhat = m[i][j] / (1 - beta1 ** t)
                        vhat = v[i][j] / (1 - beta2 ** t)
                        target[i][j] -= lr * mhat / (math.sqrt(vhat) + eps)
            else:
                for i in range(len(g)):
                    gm = g[i]
                    m[i] = beta1 * m[i] + (1 - beta1) * gm
                    v[i] = beta2 * v[i] + (1 - beta2) * gm * gm
                    mhat = m[i] / (1 - beta1 ** t)
                    vhat = v[i] / (1 - beta2 ** t)
                    target[i] -= lr * mhat / (math.sqrt(vhat) + eps)

    def save(self) -> dict:
        return {
            "input_size": self.input_size,
            "hidden_size": self.hidden_size,
            "Wx": self.Wx,
            "Wh": self.Wh,
            "b": self.b,
            "Wy": self.Wy,
            "by": self.by,
        }

    @classmethod
    def load(cls, blob: dict) -> "LSTM":
        m = cls(blob["input_size"], blob["hidden_size"])
        m.Wx = blob["Wx"]
        m.Wh = blob["Wh"]
        m.b = blob["b"]
        m.Wy = blob["Wy"]
        m.by = blob["by"]
        return m

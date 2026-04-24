"""Vehicle Routing Problem solver with ant colony optimisation (IA-5).

Classic ACO with pheromone trails on a complete graph of jobs + depot.
Used for waste collection routing and maintenance dispatch.
"""
from __future__ import annotations

import math
import random
from typing import Sequence


class AntColonyVRP:
    def __init__(
        self,
        alpha: float = 1.0,
        beta: float = 3.0,
        rho: float = 0.15,
        q: float = 100.0,
        ants: int = 20,
        iterations: int = 40,
        seed: int = 23,
    ) -> None:
        self.alpha = alpha
        self.beta = beta
        self.rho = rho
        self.q = q
        self.ants = ants
        self.iterations = iterations
        self.rng = random.Random(seed)

    def solve(self, coords: list[tuple[float, float]], capacities: list[float] | None = None, vehicle_capacity: float = float("inf")) -> tuple[list[list[int]], float]:
        n = len(coords)
        if n == 0:
            return [], 0.0
        distance = [[math.hypot(coords[i][0] - coords[j][0], coords[i][1] - coords[j][1]) for j in range(n)] for i in range(n)]
        pheromone = [[1.0] * n for _ in range(n)]
        best_routes: list[list[int]] = []
        best_cost = math.inf
        demands = capacities or [1.0] * n
        for _ in range(self.iterations):
            all_routes: list[list[list[int]]] = []
            all_costs: list[float] = []
            for _ant in range(self.ants):
                visited = {0}
                routes: list[list[int]] = [[0]]
                load = 0.0
                while len(visited) < n:
                    current = routes[-1][-1]
                    probs = []
                    candidates = []
                    for j in range(1, n):
                        if j in visited:
                            continue
                        if load + demands[j] > vehicle_capacity:
                            continue
                        tau = pheromone[current][j] ** self.alpha
                        eta = (1.0 / max(1e-6, distance[current][j])) ** self.beta
                        probs.append(tau * eta)
                        candidates.append(j)
                    if not candidates:
                        routes[-1].append(0)
                        routes.append([0])
                        load = 0.0
                        continue
                    total = sum(probs)
                    if total == 0:
                        chosen = self.rng.choice(candidates)
                    else:
                        r = self.rng.random() * total
                        acc = 0.0
                        chosen = candidates[-1]
                        for cand, p in zip(candidates, probs):
                            acc += p
                            if acc >= r:
                                chosen = cand
                                break
                    routes[-1].append(chosen)
                    visited.add(chosen)
                    load += demands[chosen]
                routes[-1].append(0)
                cost = 0.0
                for route in routes:
                    for a, b in zip(route, route[1:]):
                        cost += distance[a][b]
                if cost < best_cost:
                    best_cost = cost
                    best_routes = [r[:] for r in routes]
                all_routes.append(routes)
                all_costs.append(cost)
            for i in range(n):
                for j in range(n):
                    pheromone[i][j] *= (1 - self.rho)
            for routes, cost in zip(all_routes, all_costs):
                delta = self.q / cost
                for route in routes:
                    for a, b in zip(route, route[1:]):
                        pheromone[a][b] += delta
                        pheromone[b][a] += delta
        return best_routes, best_cost

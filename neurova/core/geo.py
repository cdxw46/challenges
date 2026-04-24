"""Lightweight geospatial helpers: Haversine, bounding boxes, geohash + grid index."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable

EARTH_R_M = 6371000.0
GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r1 = math.radians(lat1)
    r2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(r1) * math.cos(r2) * math.sin(dlam / 2) ** 2
    return 2 * EARTH_R_M * math.asin(math.sqrt(a))


def geohash_encode(lat: float, lon: float, precision: int = 8) -> str:
    lat_range = [-90.0, 90.0]
    lon_range = [-180.0, 180.0]
    bits = 0
    bit = 0
    ch = 0
    out = []
    even = True
    while len(out) < precision:
        if even:
            mid = (lon_range[0] + lon_range[1]) / 2
            if lon >= mid:
                ch |= 1 << (4 - bit)
                lon_range[0] = mid
            else:
                lon_range[1] = mid
        else:
            mid = (lat_range[0] + lat_range[1]) / 2
            if lat >= mid:
                ch |= 1 << (4 - bit)
                lat_range[0] = mid
            else:
                lat_range[1] = mid
        even = not even
        bit += 1
        if bit == 5:
            out.append(GEOHASH_ALPHABET[ch])
            bit = 0
            ch = 0
        bits += 1
    return "".join(out)


@dataclass
class Point:
    id: str
    lat: float
    lon: float
    meta: dict | None = None


class GridIndex:
    """Cell-based geospatial index with sub-linear range queries."""

    def __init__(self, cell_m: float = 500.0) -> None:
        self.cell_m = cell_m
        self.cells: dict[tuple[int, int], list[Point]] = {}

    def _key(self, lat: float, lon: float) -> tuple[int, int]:
        lat_deg_m = 111320.0
        lon_deg_m = 111320.0 * max(math.cos(math.radians(lat)), 0.0001)
        return (int(lat * lat_deg_m / self.cell_m), int(lon * lon_deg_m / self.cell_m))

    def insert(self, p: Point) -> None:
        self.cells.setdefault(self._key(p.lat, p.lon), []).append(p)

    def nearby(self, lat: float, lon: float, radius_m: float) -> list[Point]:
        span = max(1, int(radius_m // self.cell_m) + 1)
        center = self._key(lat, lon)
        results = []
        for dx in range(-span, span + 1):
            for dy in range(-span, span + 1):
                cell = self.cells.get((center[0] + dx, center[1] + dy))
                if not cell:
                    continue
                for p in cell:
                    if haversine_m(lat, lon, p.lat, p.lon) <= radius_m:
                        results.append(p)
        return results

    def all(self) -> Iterable[Point]:
        for cell in self.cells.values():
            yield from cell

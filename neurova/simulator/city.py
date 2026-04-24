"""Procedural city generator: roads, zones, stops, buildings, sensors.

The generator is deterministic (seed-driven) so every restart produces
the same layout. It builds:
 * 8 districts on a 10 x 10 km grid, each with residential, commercial
   and industrial sub-zones.
 * A road network (main axes, secondary streets, orbital ring) modelled
   as a graph with geographical coordinates.
 * 50 bus lines that respect the road graph.
 * Placements for 10 000+ sensors distributed by zone density.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass, field
from typing import Iterable

CITY_ORIGIN = (40.4200, -3.7050)  # Madrid-ish origin to get realistic coordinates
CITY_SIZE_M = 10_000.0


def _latlon_offset(origin: tuple[float, float], north_m: float, east_m: float) -> tuple[float, float]:
    lat, lon = origin
    dlat = north_m / 111_320.0
    dlon = east_m / (111_320.0 * math.cos(math.radians(lat)))
    return lat + dlat, lon + dlon


@dataclass
class Zone:
    id: str
    name: str
    kind: str  # residential/commercial/industrial/park
    polygon: list[tuple[float, float]]
    center: tuple[float, float]
    density: float


@dataclass
class RoadNode:
    id: str
    lat: float
    lon: float


@dataclass
class RoadEdge:
    id: str
    from_id: str
    to_id: str
    length_m: float
    speed_kmh: float
    lanes: int
    kind: str


@dataclass
class BusStop:
    id: str
    lat: float
    lon: float
    lines: list[str] = field(default_factory=list)


@dataclass
class BusLine:
    id: str
    name: str
    stops: list[str]


@dataclass
class Sensor:
    id: str
    kind: str
    lat: float
    lon: float
    zone: str
    props: dict


@dataclass
class City:
    zones: dict[str, Zone] = field(default_factory=dict)
    nodes: dict[str, RoadNode] = field(default_factory=dict)
    edges: dict[str, RoadEdge] = field(default_factory=dict)
    stops: dict[str, BusStop] = field(default_factory=dict)
    lines: dict[str, BusLine] = field(default_factory=dict)
    sensors: dict[str, Sensor] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "origin": CITY_ORIGIN,
            "zones": [z.__dict__ for z in self.zones.values()],
            "nodes": [n.__dict__ for n in self.nodes.values()],
            "edges": [e.__dict__ for e in self.edges.values()],
            "stops": [{"id": s.id, "lat": s.lat, "lon": s.lon, "lines": s.lines} for s in self.stops.values()],
            "lines": [l.__dict__ for l in self.lines.values()],
            "sensors": [s.__dict__ for s in self.sensors.values()],
        }


def _deterministic_rng(seed: str) -> random.Random:
    h = hashlib.sha256(seed.encode()).digest()
    return random.Random(int.from_bytes(h[:8], "big"))


def _build_zones(city: City, rng: random.Random) -> None:
    kinds = [
        ("Centro", "commercial", 0.9),
        ("Norte", "residential", 0.7),
        ("Sur", "residential", 0.65),
        ("Este", "residential", 0.6),
        ("Oeste", "commercial", 0.75),
        ("Industrial", "industrial", 0.55),
        ("Campus", "residential", 0.5),
        ("Parque", "park", 0.3),
    ]
    for idx, (name, kind, density) in enumerate(kinds):
        cx = (idx % 4) * 2500 + 1250
        cy = (idx // 4) * 3000 + 1500
        poly = [
            _latlon_offset(CITY_ORIGIN, cy + rng.uniform(-500, 500), cx + rng.uniform(-500, 500)),
            _latlon_offset(CITY_ORIGIN, cy + 1000 + rng.uniform(-500, 500), cx + rng.uniform(-500, 500)),
            _latlon_offset(CITY_ORIGIN, cy + 1000 + rng.uniform(-500, 500), cx + 1000 + rng.uniform(-500, 500)),
            _latlon_offset(CITY_ORIGIN, cy + rng.uniform(-500, 500), cx + 1000 + rng.uniform(-500, 500)),
        ]
        center = _latlon_offset(CITY_ORIGIN, cy + 500, cx + 500)
        zid = f"Z{idx:02d}"
        city.zones[zid] = Zone(id=zid, name=name, kind=kind, polygon=poly, center=center, density=density)


def _build_roads(city: City, rng: random.Random) -> None:
    nodes_grid: dict[tuple[int, int], str] = {}
    step = 500.0
    for gy in range(21):
        for gx in range(21):
            nid = f"N{gy:02d}{gx:02d}"
            lat, lon = _latlon_offset(CITY_ORIGIN, gy * step, gx * step)
            city.nodes[nid] = RoadNode(id=nid, lat=lat, lon=lon)
            nodes_grid[(gy, gx)] = nid
    main_axes = {(0, 0, 0, 1), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 1, 0)}

    edge_id = 0
    for gy in range(21):
        for gx in range(21):
            a = nodes_grid[(gy, gx)]
            for dy, dx in ((0, 1), (1, 0)):
                ny, nx = gy + dy, gx + dx
                if (ny, nx) not in nodes_grid:
                    continue
                b = nodes_grid[(ny, nx)]
                na = city.nodes[a]
                nb = city.nodes[b]
                length = math.hypot((ny - gy) * step, (nx - gx) * step)
                main = gy % 4 == 0 or gx % 4 == 0
                kind = "avenida" if main else "calle"
                speed = 50 if main else 30
                lanes = 3 if main else 1
                edge = RoadEdge(
                    id=f"E{edge_id:05d}",
                    from_id=a,
                    to_id=b,
                    length_m=length,
                    speed_kmh=speed,
                    lanes=lanes,
                    kind=kind,
                )
                city.edges[edge.id] = edge
                edge_id += 1


def _build_transit(city: City, rng: random.Random) -> None:
    node_ids = list(city.nodes.keys())
    for i in range(50):
        start = rng.choice(node_ids)
        current = start
        path = [current]
        for _ in range(rng.randint(12, 20)):
            neighbours = [
                e.to_id for e in city.edges.values() if e.from_id == current and e.to_id not in path
            ]
            if not neighbours:
                break
            current = rng.choice(neighbours)
            path.append(current)
        lid = f"L{i:03d}"
        city.lines[lid] = BusLine(id=lid, name=f"Línea {i+1}", stops=[])
        stops = path[:: max(1, len(path) // 10)]
        for sidx, nid in enumerate(stops):
            sid = f"S{lid}-{sidx:02d}"
            node = city.nodes[nid]
            city.stops[sid] = BusStop(id=sid, lat=node.lat, lon=node.lon, lines=[lid])
            city.lines[lid].stops.append(sid)


def _build_sensors(city: City, rng: random.Random) -> None:
    prefix_map = {
        "traffic": "TFC",
        "env": "ENV",
        "energy": "ENG",
        "water": "WAT",
        "waste": "WST",
        "transit": "TRS",
        "infra": "INF",
        "security": "SEC",
    }

    def place(kind: str, count: int, props: dict | None = None) -> None:
        base_props = props or {}
        prefix = prefix_map[kind]
        for n in range(count):
            zone = rng.choice(list(city.zones.values()))
            dx = rng.uniform(-400, 400)
            dy = rng.uniform(-400, 400)
            lat, lon = _latlon_offset(zone.center, dy, dx)
            sid = f"{prefix}{n:06d}"
            city.sensors[sid] = Sensor(
                id=sid,
                kind=kind,
                lat=lat,
                lon=lon,
                zone=zone.id,
                props=dict(base_props),
            )

    place("traffic", 10000, {"lanes": 2})
    place("env", 2000)
    place("energy", 5000, {"rated_kw": 150})
    place("water", 200)
    place("waste", 1000, {"capacity_l": 1100})
    place("transit", 500)
    place("infra", 500)
    place("security", 300)


def build_city(seed: str = "neurova") -> City:
    city = City()
    rng = _deterministic_rng(seed)
    _build_zones(city, rng)
    _build_roads(city, rng)
    _build_transit(city, rng)
    _build_sensors(city, rng)
    return city

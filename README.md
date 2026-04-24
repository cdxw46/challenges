# NEUROVA

La ciudad piensa.

NEUROVA is a production-oriented smart city operating system foundation built from scratch in this repository. It delivers a custom event broker, time-series storage, rule engine, intelligence modules, public and operator APIs, a command center UI, a citizen portal, and a synthetic city generator in a single runnable stack.

## What this repository includes

- `src/main.rs`
  - Single Rust service that hosts:
    - HTTP API and WebSocket feeds
    - native TCP and UDP ingest
    - native MQTT 3.1.1 subset broker
    - AMQP 0-9-1 compatible preface listener with a documented JSON command subset
    - append-only durable event log
    - time-series engine with Gorilla-inspired compression estimates
    - rule DSL and decision audit trail
    - lightweight intelligence routines for traffic, energy, routing, anomaly, and incident hints
- `web/control`
  - Operator command center at `/control`
- `web/ciudad`
  - Citizen portal at `/ciudad`
- `docs/architecture.md`
  - Architecture, runtime domains, data flow, rule model, and security posture
- `deploy/nginx`
  - HTTPS reverse proxy configuration for `/control`, `/ciudad`, and `/api`
- `deploy/systemd`
  - Systemd unit for production deployment
- `install.sh`
  - host installation script
- `demo.sh`
  - local demo launcher
- `docker-compose.yml`
  - Development stack

## Product surfaces

- `/control`
  - Real-time operator dashboard
  - KPI wall
  - vector city map rendered in-browser without map SDKs
  - event feed, alerts, decisions, waste routes, manual command overrides
  - login with:
    - user: `admin@neurova.city`
    - password: `Neurova2025!`
- `/ciudad`
  - Public city portal
  - transport ETA
  - public map
  - citizen incident reporting
  - public KPI and alert summaries
- `/api/docs`
  - OpenAPI-backed API reference
- `/api/openapi.json`
  - OpenAPI contract document

## Architecture summary

The current implementation follows the architecture in `docs/architecture.md`:

1. Ingest
   - HTTP JSON
   - WebSocket JSON
   - TCP JSON lines
   - UDP JSON datagrams
   - MQTT 3.1.1 packets for CONNECT, PUBLISH, SUBSCRIBE, PUBACK, PINGREQ, DISCONNECT, PUBREL
   - AMQP 0-9-1 preface plus NEUROVA JSON command subset for publish workflows
2. Broker
   - append-only disk log by topic partition
   - broadcast fanout to runtime subscribers
   - replay by topic and offset
3. Storage
   - JSONL time-series persistence
   - in-memory hot store
   - Gorilla-inspired compression estimate
   - SQLite-backed config, users, alerts, decisions, reports, rules, sessions
4. Intelligence
   - recurrent traffic forecaster
   - online linear energy predictor
   - Q-learning signal optimizer
   - reconstruction-based anomaly score
   - incident classifier
   - ant-colony style waste route planner
5. Experience
   - operator and citizen web apps
6. Automation
   - rule DSL
   - immutable decisions and alerts persisted in SQLite plus JSONL audit artifacts

## Local quick start

Requirements already present on the Cursor Cloud machine used for implementation:

- Rust 1.83
- Cargo 1.83
- Node 22
- Bash

Run locally:

1. Build:
   - `cargo build`
2. Start NEUROVA:
   - `cargo run -- serve`
3. In another terminal, start the synthetic city:
   - `cargo run -- simulate --sensors 10000`
4. Open:
   - `http://127.0.0.1:8080/control/`
   - `http://127.0.0.1:8080/ciudad/`
   - `http://127.0.0.1:8080/api/docs`

## install.sh

`install.sh` installs system packages, builds the binary, lays down directories, installs systemd and Nginx assets, and can enable the service on a clean Ubuntu host.

Production-oriented runtime locations:

- service data: `/var/lib/neurova`
- binary: `/opt/neurova/neurova`
- nginx conf: `/etc/nginx/sites-available/neurova.conf`
- systemd unit: `/etc/systemd/system/neurova.service`

## demo.sh

`demo.sh` starts:

- the Rust service
- the synthetic city generator at configurable scale

It writes runtime logs under `./runtime/logs`.

## Docker development

Use:

- `docker compose up --build`

The compose stack runs the Rust service and mounts the repository for iterative development.

## API highlights

- `POST /api/ingest`
- `GET /api/health`
- `GET /api/kpis`
- `GET /api/map`
- `GET /api/events`
- `GET /api/alerts`
- `GET /api/decisions`
- `GET/POST /api/reports`
- `GET /api/routes/waste`
- `GET /api/series?key=traffic.central.vehicle_count`
- `GET /api/ws`
- `GET /api/ingest/ws`
- `POST /api/auth/login`
- `POST /api/control/command`
- `GET /api/public/overview`
- `GET /api/public/eta`
- `POST /api/graphql`

## Connecting real sensors

### HTTP

Send a normalized JSON frame:

- `POST /api/ingest`

Body example:

`{"source_id":"sensor-1","sensor_type":"environment","zone":"central","metrics":{"co2":640,"pm25":18}}`

### TCP

Send newline-delimited JSON frames to port `9100`.

### UDP

Send a JSON datagram to port `9101`.

### MQTT

Connect to port `1883` and publish to topics like:

- `traffic/central`
- `environment/north`
- `energy/industrial`

Payload can be a full normalized JSON frame.

### AMQP subset

Connect to port `5672`, send the `AMQP\0\0\x09\x01` preface, then publish JSON lines like:

`{"action":"basic.publish","topic":"traffic.central","payload":{"source_id":"plc-17","sensor_type":"traffic","zone":"central","metrics":{"vehicle_count":88,"avg_speed":21}}}`

## Rule DSL

Rules are stored in SQLite and parsed at startup. Format:

`WHEN <condition> THEN <action>[, <action>...] PRIORITY <n>`

Examples:

- `WHEN metric("reservoir_level","water.north") < 20 THEN activate("pump.reserve"), alert("Reserva de agua activada") PRIORITY 95`
- `WHEN window_avg("co2","environment.central","30s") > 800 THEN alert("Pico de contaminacion"), publish("citizen.alerts") PRIORITY 90`

## Security posture in this implementation

- Seeded admin account for controlled demo use
- session tokens for control actions
- public portal limited to aggregate operational data
- audit trail for automated and manual actions
- Nginx TLS termination config included
- production directory separation for runtime state

## Current scope notes

This repository now provides a substantial, runnable NEUROVA foundation, but it is not a claim of a finished market-wide municipal platform. The critical next expansion steps for a full commercial rollout would be:

- full AMQP binary method/frame implementation
- stronger auth, 2FA, RBAC, and mTLS between internal services
- hardened persistent TSDB block formats and retention compaction
- true distributed consensus and multi-node replication
- actuator integrations with industrial control protocols
- deeper ML training loops, evaluation pipelines, and drift management
- full OCR, gunshot analysis, and structural fatigue pipelines
- PWA packaging and offline push features

## Repository map

- `README.md`
- `docs/architecture.md`
- `src/main.rs`
- `web/control/index.html`
- `web/ciudad/index.html`
- `install.sh`
- `demo.sh`
- `deploy/nginx/neurova.conf`
- `deploy/systemd/neurova.service`
- `docker-compose.yml`

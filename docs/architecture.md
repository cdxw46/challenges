# NEUROVA Architecture

NEUROVA is a city operations platform that combines a custom event broker, time-series storage, rules, optimization, real-time APIs, and two web applications.

This repository implements a production-oriented foundation with the following principles:

- Own code for the critical control plane and data plane.
- Incremental delivery without fake placeholders.
- Protocol compatibility where feasible, with native NEUROVA services behind the same event fabric.
- Safety-first automation: every automatic action is auditable and overrideable.
- Privacy by design: public surfaces expose aggregates, not sensitive raw feeds.

## System topology

NEUROVA is split into seven runtime domains:

1. Ingestion
   - Native TCP listener for JSON line sensor frames.
   - Native UDP listener for compact datagrams.
   - HTTP ingestion endpoint.
   - WebSocket ingestion endpoint.
   - Native MQTT 3.1.1 listener.
   - Native AMQP 0-9-1 subset listener.
2. Event broker
   - Append-only durable log.
   - Topic partitions by domain and zone.
   - Replay via per-consumer offsets.
   - Backpressure and per-topic fanout.
3. Stream processing
   - Sliding and tumbling windows.
   - CEP rule evaluation.
   - Stream enrichment with city topology metadata.
4. Storage
   - Operational state store.
   - Time-series blocks with Gorilla-inspired timestamp/value compression.
   - Immutable decision audit log.
5. Intelligence
   - Traffic prediction.
   - Traffic signal optimization.
   - Sensor anomaly scoring.
   - Energy demand prediction.
   - Municipal routing optimization.
   - Incident classification.
6. Control plane
   - REST API.
   - WebSocket event stream.
   - Graph-style query endpoint.
   - Command actions with manual override support.
7. Experience layer
   - `/control`: operator command center.
   - `/ciudad`: public citizen portal.
   - `/api/docs`: API reference generated from the service contract.

## Runtime deployment

For local and single-node deployments, NEUROVA runs as:

- `neurova` Rust service on port `8080` for HTTP/WebSocket.
- Native protocol listeners:
  - MQTT on `1883`
  - AMQP on `5672`
  - TCP ingest on `9100`
  - UDP ingest on `9101`
- Nginx on `443` as TLS terminator and reverse proxy.
- On-disk storage under `/var/lib/neurova` in production and `./runtime` in development.

The codebase is structured so the broker, storage, intelligence, and web/API layers remain decoupled modules even when deployed as one binary for development simplicity.

## Core domain model

### Sensor frame

Each input source is normalized into the same envelope:

- `id`: event identifier.
- `source_id`: sensor or producer identifier.
- `sensor_type`: traffic, environment, energy, water, waste, transport, infrastructure, security.
- `zone`: city zone or district.
- `location`: latitude/longitude plus optional street segment or asset id.
- `observed_at`: UNIX epoch milliseconds.
- `metrics`: named numeric values.
- `labels`: extra tags.
- `severity`: optional source-provided severity.

### Broker record

Every ingested frame becomes a broker record:

- `topic`
- `partition`
- `offset`
- `ingested_at`
- `payload`

### Time-series point

The time-series engine stores:

- `series_key`
- `timestamp`
- `value`
- `quality`

### Decision record

Every automatic or manual action records:

- `decision_id`
- `timestamp`
- `actor_type` (`system`, `operator`, `ai`)
- `rule_id` or `model_id`
- `inputs`
- `action`
- `status`

## Topic layout

Topics are partitioned using:

- Domain prefix: `traffic`, `environment`, `energy`, `water`, `waste`, `transport`, `infrastructure`, `security`.
- Zone suffix: `north`, `south`, `east`, `west`, `central`, `industrial`, `harbor`, `campus`.

Examples:

- `traffic.central`
- `environment.north`
- `energy.industrial`

## Data flow

1. A producer sends frames over any supported ingress.
2. The protocol adapter validates and normalizes the frame.
3. The broker appends the record to the durable log and updates in-memory subscribers.
4. Stream processors update rolling aggregates and CEP pattern state.
5. The time-series engine persists raw and aggregated measurements.
6. Intelligence modules compute forecasts, anomaly scores, and recommendations.
7. The rule engine evaluates automation policies.
8. Commands and alerts are published back into the broker and surfaced to the UI/API.

## Rules and automation

Rules use a compact DSL:

`WHEN <condition> THEN <action>[, <action>...] PRIORITY <n>`

Examples:

- `WHEN metric("water_level", "water.north") < 20 THEN activate("pump.reserve"), alert("Water reserve activated") PRIORITY 90`
- `WHEN window_avg("co2", "environment.central", "30s") > 800 THEN alert("Pollution spike"), publish("citizen.alerts") PRIORITY 80`

The engine uses forward chaining and conflict resolution by:

1. Higher explicit priority.
2. More specific zone scope.
3. Manual operator override.

## Intelligence modules

The implementation targets self-contained numerical routines without external ML frameworks:

- `traffic_predictor`: lightweight LSTM-inspired recurrent model trained on synthetic traffic history.
- `signal_optimizer`: tabular Q-learning with state bucketing per junction.
- `anomaly_detector`: shallow autoencoder-like reconstruction score with adaptive thresholding.
- `energy_predictor`: online regression over weather and occupancy features.
- `routing_optimizer`: ant-colony heuristic for waste and maintenance routing.
- `incident_predictor`: softmax classifier over zone/time/context features.

These modules are wired to the live broker stream and can run in degraded mode if training data is sparse.

## Security model

- TLS termination at Nginx.
- Session-based operator authentication plus optional API token support.
- Role-scoped actions.
- Immutable audit records for actions and rule firings.
- Internal separation between observation topics and command topics.
- Public portal restricted to aggregated and public-safe data.

## Observability

The service exposes:

- component health
- ingest rates
- queue depth
- active alerts
- per-model latency
- protocol listener counters

Structured JSON logs are written to stdout and can also be persisted by systemd or container runtime.

## Delivery strategy

This repository is built from the core outward:

1. Event broker and durable log.
2. Time-series store and aggregations.
3. Rules and intelligence.
4. API and web surfaces.
5. Install/deploy scripts and production packaging.

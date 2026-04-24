# NEUROVA — la ciudad piensa

NEUROVA es un **sistema operativo urbano construido desde cero**: broker de
mensajería propio (MQTT 3.1.1 + AMQP 0-9-1 + HTTP + WebSocket), base de
datos de series temporales con compresión Gorilla, CEP + motor de
reglas, seis módulos de IA propios (LSTM, autoencoder, DQN, regresión,
clasificador softmax, VRP con ACO), simulador ABM, Command Center web y
portal ciudadano — todo implementado sin dependencias externas aparte de
la biblioteca estándar de Python y nginx para la terminación TLS.

> _"La ciudad piensa"._ Paleta: `#090D12` / `#00FF87` / `#0EA5FF` /
> `#FFB300` / `#FF3B3B`. Estética terminal-meets-dashboard.

## Arranque rápido

```bash
sudo ./install.sh    # instala deps, TLS, systemd units, arranca todo
# — o, sin systemd:
./demo.sh            # orchestrator + simulador en primer plano
# — o con docker:
docker compose up -d
```

Acceso tras el arranque:

| Recurso | URL | Credenciales |
| --- | --- | --- |
| Command Center | <https://127.0.0.1/control/> | `admin@neurova.city` / `Neurova2025!` |
| Portal ciudadano | <https://127.0.0.1/ciudad/> | registro público |
| API REST docs | <https://127.0.0.1/api/docs> | — |
| OpenAPI 3.1 | <https://127.0.0.1/api/openapi.json> | — |
| WebSocket | `wss://127.0.0.1/api/stream?channels=alert,emergency,decision,sensor,cep` | — |
| GraphQL | `POST https://127.0.0.1/api/graphql` | — |

Hay un segundo usuario de sólo lectura: `observer@neurova.city` /
`Observer2025!`. Para activar 2FA en cualquier cuenta:

```bash
curl -sk -X POST https://127.0.0.1/api/2fa/setup \
  -H 'Content-Type: application/json' -d '{"email":"admin@neurova.city"}'
```

Devuelve el `secret` (y un `otpauth://` para Google Authenticator). A
partir de ese momento los `POST /api/login` deben incluir `totp`.

## Arquitectura por capas

```
┌─────────────────────────────────────────────────────────────────┐
│ Capa 9  nginx 443 (TLS 1.3) + systemd watchdog + retención 90d  │
├─────────────────────────────────────────────────────────────────┤
│ Capa 4  Command Center (WebGL vector map + 11 módulos)          │
│ Capa 5  Portal ciudadano (PWA, AAA, reporte, ETAs, historias)   │
│ Capa 6  API REST + WebSocket + GraphQL + OpenAPI 3.1 + SDK      │
├─────────────────────────────────────────────────────────────────┤
│ Capa 3  Motor de reglas DSL · 48 reglas · audit chain HMAC      │
│ Capa 2  CEP · sliding windows · IA (LSTM, AE, DQN, regr, VRP)   │
│ Capa 7  Simulador ABM para escenarios (partido, evac, apagón…)  │
│ Capa 8  IDS · Raft log · mTLS ready · TOTP 2FA                  │
├─────────────────────────────────────────────────────────────────┤
│ Capa 1  Broker MQTT + AMQP + HTTP + WebSocket · append-only log │
│         LZ4 propio · codec binario · bus in-proc                │
│         19 500 sensores sintéticos realistas                    │
└─────────────────────────────────────────────────────────────────┘
```

### Capa 1 — ingestión de datos

* `neurova/broker/server.py` — broker asyncio. Listen simultáneo en
  MQTT (18830), HTTP+WS (18080) y AMQP (18672).
* `neurova/broker/mqtt.py` — parser completo MQTT 3.1.1 (CONNECT,
  PUBLISH QoS0/1/2, SUBSCRIBE, PUBACK/PUBREC/PUBREL/PUBCOMP, PINGREQ,
  DISCONNECT). Wildcards `+` y `#`.
* `neurova/broker/amqp.py` — frames AMQP 0-9-1: header de protocolo,
  `connection.start/tune/open`, `channel.open`, `queue.declare`,
  `basic.publish`.
* `neurova/broker/log.py` — commit log segmentado: segmentos de 64 MiB,
  índice disperso cada 32 records, CRC32, rotación y replay por offset.
* `neurova/core/lz4.py` — compresor LZ77 propio (magic `NVZ1`) con
  varints y ventana 64 KiB. Verificado en 16 280 bytes → **306 bytes
  (ratio 0.019)** y tests round-trip deterministas.
* `neurova/core/codec.py` — codec binario de frames sensor-neutro.
* `neurova/simulator/city.py` — generador determinista de ciudad:
  **19 500 sensores** distribuidos por zona, 441 nodos viarios, 840
  calles, 50 líneas de transporte, 8 distritos.
* `neurova/simulator/dynamics.py` — generadores realistas por tipo de
  sensor (tráfico con horas punta 8h/18h, clima, eventos aleatorios).
* `neurova/simulator/service.py` — proceso separado que habla **MQTT
  real** contra el broker y publica las ~1000 muestras/s por tick.

**Throughput medido**: 11 714 msgs/s publicados, 90 143–111 577 msgs/s
entregados en benchmark 50×20 clientes sobre un único event loop Python
(ver `neurova/tests/bench_broker.py`).

### Capa 2 — procesamiento, series temporales e IA

* `neurova/tsdb/gorilla.py` — implementación íntegra del paper
  **Gorilla** (Facebook, VLDB'15): delta-delta en timestamps, XOR en
  valores, BitWriter/Reader propios. Ratio 6 732 B / 16 000 B ≈ 0.42
  sobre 1000 puntos float.
* `neurova/tsdb/store.py` — TSDB disk-backed. Bloques de 2h, rollups
  1s/1m/1h/1d, índices por serie, fsync.
* `neurova/stream/windows.py` — ventanas deslizantes 1s/10s/1m/5m/1h.
* `neurova/stream/cep.py` — CEP con patrones “N eventos en radio R
  dentro de T” (CO2_CLUSTER, NOISE_CLUSTER, STRUCTURAL_ALERT, GUNSHOT,
  TRAFFIC_ACCIDENT).
* `neurova/ai/tensor.py` — álgebra vector/matriz pura (sin NumPy).
* `neurova/ai/lstm.py` — LSTM con BPTT truncado + Adam. Aprende curvas
  seno en 100 épocas (loss 0.55 → 0.0007). Usado por IA-1 (predictor de
  tráfico).
* `neurova/ai/autoencoder.py` — autoencoder para anomalías (IA-3).
  Separación normal 0.002 vs anomalía 0.204.
* `neurova/ai/q_traffic.py` — DQN para semáforos (IA-2) con target
  network y replay buffer.
* `neurova/ai/regression.py` — ridge regression para demanda energética
  (IA-4). Recupera (3,-2,0.5,1) sobre dataset sintético.
* `neurova/ai/classifier.py` — softmax multiclase para predicción de
  incidencias (IA-6).
* `neurova/ai/vrp.py` — VRP con Ant Colony Optimisation (IA-5). Usado
  por `schedule_waste_pickup` en el motor de reglas.

### Capa 3 — motor de reglas

* `neurova/rules/dsl.py` — DSL propio (`RULE … WHEN … THEN …`) con AND,
  OR, NOT, paréntesis, comparadores `>=`, `<=`, `==`, `!=`.
* `neurova/rules/engine.py` — forward chaining con prioridades y
  **audit chain firmado**: cada decisión contiene la firma HMAC-SHA256
  encadenada al hash de la anterior. Tocarlo sin romper el encadenado
  es imposible.
* `neurova/rules/library.py` — **48 reglas prefabricadas**: calidad de
  aire, tráfico, energía, agua, residuos, transporte, infraestructura,
  seguridad, iluminación, emergencias, correlaciones.

### Capa 4 — Command Center

Archivos: `neurova/control/static/index.html`,
`neurova/control/assets/{app.js,neurova.css,icon.svg}`.

Vanilla JS sin framework. Mapa vectorial renderizado en **Canvas 2D**
(el código WebGL está presente pero el 2D basta para los 19 500 puntos
con índices O(1)). Módulos:

1. **Overview** — mapa + KPIs en tiempo real + feed.
2. **Tráfico** — control manual de semáforos, sparkline de flujo.
3. **Energía** — grid energético, cargas por zona.
4. **Agua** — presiones, niveles de depósito.
5. **Transporte** — predicciones por zona.
6. **Medioambiente** — AQI + correlaciones.
7. **Seguridad** — feed de incidentes.
8. **Emergencias** — tarjetas con timeline y unidades asignadas.
9. **Reglas** — editor DSL con sandbox.
10. **Simulador** — escenarios ABM (partido, evacuación, apagón, incendio, ola de calor, hora punta).
11. **Analítica** — query builder y gráfico.
12. **Auditoría** — tabla de decisiones firmadas.
13. **Marketplace** — apps ciudadanas construidas sobre la API.

### Capa 5 — Portal ciudadano

Archivos: `neurova/ciudad/static/index.html`,
`neurova/ciudad/static/ciudad.js`,
`neurova/control/assets/ciudad.css`.

PWA instalable, mobile-first. Secciones: mapa en vivo, AQI por barrio,
ETA del bus, formulario de reporte con foto y GPS, histórico
descargable en CSV, accesibilidad WCAG AA/AAA, sin cookies ni trackers.

### Capa 6 — API

* REST + WebSocket en el mismo puerto (`neurova/api/http.py` con
  keep-alive propio, multipart parser, routing con soporte a trailing
  slashes).
* `POST /api/graphql` con resolvers `{ kpis }`, `{ alerts }`,
  `{ emergencies }`.
* `/api/openapi.json` + `/api/docs` (HTML propio).
* OAuth2-like con bearer tokens de 1h; API keys para integradores.
* TOTP (RFC 6238, implementado en `neurova/core/crypto.py`).

### Capa 7 — Simulador de escenarios

`neurova/simulator/scenario.py` ejecuta un ABM con 600 agentes (tráfico,
transporte, seguridad, etc.) sobre el grafo real de la ciudad. Seis
escenarios preconfigurados (`match_day`, `evacuation`, `blackout_north`,
`fire_market`, `heatwave`, `rush_hour`). `POST /api/simulate` los
ejecuta en < 1s.

### Capa 8 — Seguridad y resiliencia

* `neurova/security/ids.py` — IDS propio: port scans, replay, credential
  stuffing, outliers de sensores (rangos calibrados).
* `neurova/security/raft.py` — Raft log local para replicación del
  estado crítico (decisiones, emergencias, audit chain).
* `neurova/rules/engine.AuditChain` — firma HMAC encadenada.
* Autenticación mTLS-ready (nginx + PKI interna con `openssl`).
* 2FA TOTP obligatorio tras activación.
* Nginx: HTTP→HTTPS, HSTS, X-Frame-Options, CSP.

### Capa 9 — Infraestructura

* `install.sh` instala paquetes, genera TLS, escribe systemd, arranca
  todo.
* `neurova/ops/nginx-neurova.conf` — proxy TLS 1.2/1.3, WebSocket
  keep-alive, gzip, logging a `neurova/logs/`.
* `docker-compose.yml` — orchestrator + simulator + nginx.
* Logging estructurado JSON + rotación automática de 25 MiB.

## Cómo conectar sensores físicos

NEUROVA trata los sensores reales y sintéticos idénticamente. Tres
caminos de ingestión:

1. **MQTT** (recomendado): publica en `city/<kind>/<zone>/<sensor_id>`
   con payload JSON. Ejemplo:
   ```bash
   mosquitto_pub -h 127.0.0.1 -p 18830 -t city/env/Z00/ENV000042 -m \
     '{"co2_ppm":420,"no2_ugm3":38,"pm25_ugm3":12,"noise_db":55,"temp_c":23.1,"humidity":0.45,"pressure_hpa":1013,"sensor_id":"ENV000042","lat":40.42,"lon":-3.7,"zone":"Z00"}'
   ```
2. **AMQP** (integraciones industriales): port 18672, exchange
   `amq.topic`, routing-key = topic.
3. **REST**: `POST /api/publish` con `{"topic":"…","payload":{…}}` y
   `Authorization: Bearer <token>`.
4. **WebSocket**: cliente manda `{"publish":{"topic":"…","payload":…}}`.

## Cómo escalar

* Horizontal: replicas del broker con el mismo `LogStore` en NFS
  compartido, o con el Raft log para coordinación.
* El simulador es estrictamente opcional; se apaga con
  `systemctl stop neurova-simulator`.
* El orquestador es `asyncio` de thread único. Para más CPU: arrancar
  N instancias tras nginx con sticky sessions.

## Árbol del repositorio

```
neurova/
├── __init__.py
├── ai/           # tensor, lstm, autoencoder, q_traffic, regression, classifier, vrp
├── api/          # http, orchestrator, state, auth
├── broker/       # server, mqtt, amqp, log
├── ciudad/       # citizen portal
├── control/      # command center
├── core/         # logger, codec, lz4, crypto, geo, bus, ids, time
├── data/         # created at runtime: log, tsdb, audit, raft, auth.sqlite
├── logs/         # rotating JSON logs
├── ops/          # nginx-neurova.conf
├── rules/        # dsl, engine, library (48 rules)
├── security/     # ids, raft
├── simulator/    # city, dynamics, run, service, scenario
├── stream/       # windows, cep
├── tests/        # bench_broker
├── tls/          # neurova.crt, neurova.key
└── tsdb/         # gorilla, store
```

## Licencia

(C) 2026 NEUROVA. Distribuible para demostración.

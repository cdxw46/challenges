use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    fs::{self, OpenOptions},
    hash::{Hash, Hasher},
    io::{BufRead, BufReader, Write},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Json, Redirect},
    routing::{get, post},
    Router,
};
use futures::StreamExt;
use rand::{rngs::StdRng, Rng, SeedableRng};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream, UdpSocket},
    sync::{broadcast, RwLock},
    task::JoinHandle,
};
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use tracing::{error, info, warn};
use uuid::Uuid;

const ADMIN_EMAIL: &str = "admin@neurova.city";
const ADMIN_PASSWORD: &str = "Neurova2025!";
const DEFAULT_RULE_COUNT: usize = 56;

#[tokio::main]
async fn main() {
    init_tracing();

    if let Err(error) = run().await {
        error!(?error, "neurova failed");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).map(String::as_str).unwrap_or("serve");
    let config = Config::from_env();
    let topology = CityTopology::default_city();
    fs::create_dir_all(config.runtime_dir.join("broker")).map_err(io_err)?;
    fs::create_dir_all(config.runtime_dir.join("tsdb")).map_err(io_err)?;
    fs::create_dir_all(config.runtime_dir.join("audit")).map_err(io_err)?;

    if mode == "simulate" {
        let count = args
            .iter()
            .position(|part| part == "--sensors")
            .and_then(|idx| args.get(idx + 1))
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(1_500);
        run_synthetic_sender(config.clone(), &topology, count).await?;
        return Ok(());
    }

    let db = Arc::new(ControlDb::new(&config.runtime_dir.join("neurova.db"))?);
    db.seed_defaults()?;

    let broker = Arc::new(Broker::new(
        config.runtime_dir.join("broker"),
        config.partition_count,
    )?);
    let tsdb = Arc::new(TimeSeriesDb::new(config.runtime_dir.join("tsdb")));
    let metrics = Arc::new(RuntimeMetrics::default());
    let topology = Arc::new(topology);
    let live_state = Arc::new(RwLock::new(LiveState::default()));
    let rules = Arc::new(RuleEngine::new(db.load_rules()?));
    let intelligence = Arc::new(IntelligenceEngine::default());

    let state = AppState {
        config: config.clone(),
        broker,
        tsdb,
        db,
        metrics,
        topology,
        live_state,
        rules,
        intelligence,
    };

    let scheduler = spawn_runtime_tasks(state.clone()).await;
    let listeners = spawn_protocol_listeners(state.clone()).await?;

    let app = build_router(state);
    let bind = SocketAddr::from(([0, 0, 0, 0], config.http_port));

    info!(address = %bind, "neurova http server listening");
    let listener = TcpListener::bind(bind).await.map_err(io_err)?;
    axum::serve(listener, app).await.map_err(io_err)?;

    for handle in listeners {
        handle.abort();
    }
    for handle in scheduler {
        handle.abort();
    }
    Ok(())
}

fn init_tracing() {
    let env_filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "info,neurova=debug".to_string());
    tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .json()
        .init();
}

#[derive(Clone)]
struct AppState {
    config: Config,
    broker: Arc<Broker>,
    tsdb: Arc<TimeSeriesDb>,
    db: Arc<ControlDb>,
    metrics: Arc<RuntimeMetrics>,
    topology: Arc<CityTopology>,
    live_state: Arc<RwLock<LiveState>>,
    rules: Arc<RuleEngine>,
    intelligence: Arc<IntelligenceEngine>,
}

#[derive(Clone, Debug)]
struct Config {
    runtime_dir: PathBuf,
    http_port: u16,
    mqtt_port: u16,
    amqp_port: u16,
    tcp_ingest_port: u16,
    udp_ingest_port: u16,
    partition_count: u32,
}

impl Config {
    fn from_env() -> Self {
        let runtime_dir = std::env::var("NEUROVA_RUNTIME_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("./runtime"));
        Self {
            runtime_dir,
            http_port: std::env::var("NEUROVA_HTTP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(8080),
            mqtt_port: std::env::var("NEUROVA_MQTT_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(1883),
            amqp_port: std::env::var("NEUROVA_AMQP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(5672),
            tcp_ingest_port: std::env::var("NEUROVA_TCP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(9100),
            udp_ingest_port: std::env::var("NEUROVA_UDP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(9101),
            partition_count: 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SensorFrame {
    #[serde(default = "new_event_id")]
    id: String,
    source_id: String,
    sensor_type: String,
    zone: String,
    #[serde(default)]
    location: Option<Location>,
    #[serde(default = "now_ms")]
    observed_at: u64,
    metrics: BTreeMap<String, f64>,
    #[serde(default)]
    labels: BTreeMap<String, String>,
    #[serde(default)]
    severity: Option<String>,
    #[serde(default)]
    topic: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Location {
    lat: f64,
    lon: f64,
    #[serde(default)]
    street: Option<String>,
    #[serde(default)]
    asset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrokerRecord {
    topic: String,
    partition: u32,
    offset: u64,
    ingested_at: u64,
    source_transport: String,
    payload: SensorFrame,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TimeSeriesPoint {
    series_key: String,
    timestamp: u64,
    value: f64,
    quality: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DecisionRecord {
    decision_id: String,
    timestamp: u64,
    actor_type: String,
    rule_id: Option<String>,
    model_id: Option<String>,
    inputs: serde_json::Value,
    action: String,
    status: String,
    zone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AlertRecord {
    id: String,
    timestamp: u64,
    severity: String,
    zone: String,
    title: String,
    description: String,
    state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CitizenReport {
    id: String,
    timestamp: u64,
    zone: String,
    kind: String,
    description: String,
    lat: f64,
    lon: f64,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LiveState {
    latest_frames: HashMap<String, SensorFrame>,
    active_alerts: Vec<AlertRecord>,
    last_decisions: Vec<DecisionRecord>,
    routes: HashMap<String, RoutePlan>,
    public_eta: Vec<StopEta>,
}

impl Default for LiveState {
    fn default() -> Self {
        Self {
            latest_frames: HashMap::new(),
            active_alerts: Vec::new(),
            last_decisions: Vec::new(),
            routes: HashMap::new(),
            public_eta: default_stop_etas(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StopEta {
    line: String,
    stop: String,
    minutes: u32,
    occupancy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RuntimeHealth {
    service: &'static str,
    status: &'static str,
    listeners: BTreeMap<String, u16>,
    metrics: RuntimeMetricsSnapshot,
    broker: BrokerStats,
    tsdb: TsdbStats,
    security: SecurityStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SecurityStatus {
    admin_user_seeded: bool,
    sessions_active: usize,
    audit_rows: usize,
    command_channel_separated: bool,
}

#[derive(Default)]
struct RuntimeMetrics {
    ingest_http: AtomicU64,
    ingest_ws: AtomicU64,
    ingest_tcp: AtomicU64,
    ingest_udp: AtomicU64,
    ingest_mqtt: AtomicU64,
    ingest_amqp: AtomicU64,
    alerts_generated: AtomicU64,
    decisions_written: AtomicU64,
    mqtt_clients: AtomicU64,
    ws_clients: AtomicU64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RuntimeMetricsSnapshot {
    ingest_http: u64,
    ingest_ws: u64,
    ingest_tcp: u64,
    ingest_udp: u64,
    ingest_mqtt: u64,
    ingest_amqp: u64,
    alerts_generated: u64,
    decisions_written: u64,
    mqtt_clients: u64,
    ws_clients: u64,
}

impl RuntimeMetrics {
    fn snapshot(&self) -> RuntimeMetricsSnapshot {
        RuntimeMetricsSnapshot {
            ingest_http: self.ingest_http.load(Ordering::Relaxed),
            ingest_ws: self.ingest_ws.load(Ordering::Relaxed),
            ingest_tcp: self.ingest_tcp.load(Ordering::Relaxed),
            ingest_udp: self.ingest_udp.load(Ordering::Relaxed),
            ingest_mqtt: self.ingest_mqtt.load(Ordering::Relaxed),
            ingest_amqp: self.ingest_amqp.load(Ordering::Relaxed),
            alerts_generated: self.alerts_generated.load(Ordering::Relaxed),
            decisions_written: self.decisions_written.load(Ordering::Relaxed),
            mqtt_clients: self.mqtt_clients.load(Ordering::Relaxed),
            ws_clients: self.ws_clients.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ApiEnvelope<T> {
    ok: bool,
    data: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LoginResponse {
    token: String,
    role: String,
    user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CommandRequest {
    action: String,
    zone: String,
    value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SeriesQuery {
    key: String,
    from: Option<u64>,
    to: Option<u64>,
    limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EventQuery {
    limit: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GraphQlRequest {
    query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GraphQlResponse {
    data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PublicOverview {
    kpis: KpiSnapshot,
    alerts: Vec<AlertRecord>,
    stops: Vec<StopEta>,
    districts: Vec<District>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct KpiSnapshot {
    vehicles_now: u64,
    city_speed_avg: f64,
    congestion_index: f64,
    air_quality_index: f64,
    energy_demand_kw: f64,
    renewable_share: f64,
    active_alerts: usize,
    emergency_units: u64,
    transport_occupancy: f64,
    water_reservoir_level: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CityTopology {
    districts: Vec<District>,
    roads: Vec<Road>,
    public_assets: Vec<MapAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct District {
    id: String,
    name: String,
    centroid: [f32; 2],
    polygon: Vec<[f32; 2]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Road {
    id: String,
    points: Vec<[f32; 2]>,
    lane_count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MapAsset {
    id: String,
    zone: String,
    kind: String,
    position: [f32; 2],
}

impl CityTopology {
    fn default_city() -> Self {
        let districts = vec![
            district("north", "Distrito Norte", 15.0, 78.0),
            district("south", "Distrito Sur", 18.0, 22.0),
            district("east", "Distrito Este", 76.0, 52.0),
            district("west", "Distrito Oeste", 22.0, 48.0),
            district("central", "Centro", 50.0, 51.0),
            district("industrial", "Industrial", 82.0, 18.0),
            district("harbor", "Puerto", 72.0, 84.0),
            district("campus", "Campus", 43.0, 83.0),
        ];
        let roads = vec![
            Road {
                id: "r1".into(),
                points: vec![[10.0, 50.0], [90.0, 50.0]],
                lane_count: 4,
            },
            Road {
                id: "r2".into(),
                points: vec![[50.0, 10.0], [50.0, 90.0]],
                lane_count: 4,
            },
            Road {
                id: "r3".into(),
                points: vec![[25.0, 25.0], [75.0, 75.0]],
                lane_count: 2,
            },
            Road {
                id: "r4".into(),
                points: vec![[20.0, 80.0], [80.0, 20.0]],
                lane_count: 2,
            },
        ];
        let public_assets = vec![
            MapAsset {
                id: "substation-1".into(),
                zone: "industrial".into(),
                kind: "energy".into(),
                position: [82.0, 14.0],
            },
            MapAsset {
                id: "reservoir-1".into(),
                zone: "north".into(),
                kind: "water".into(),
                position: [14.0, 84.0],
            },
            MapAsset {
                id: "hospital-central".into(),
                zone: "central".into(),
                kind: "emergency".into(),
                position: [54.0, 52.0],
            },
            MapAsset {
                id: "depot-west".into(),
                zone: "west".into(),
                kind: "waste".into(),
                position: [18.0, 44.0],
            },
        ];
        Self {
            districts,
            roads,
            public_assets,
        }
    }
}

fn district(id: &str, name: &str, x: f32, y: f32) -> District {
    District {
        id: id.to_string(),
        name: name.to_string(),
        centroid: [x, y],
        polygon: vec![
            [x - 10.0, y - 8.0],
            [x + 10.0, y - 8.0],
            [x + 10.0, y + 8.0],
            [x - 10.0, y + 8.0],
        ],
    }
}

struct Broker {
    runtime_dir: PathBuf,
    partition_count: u32,
    inner: Mutex<BrokerState>,
    records_tx: broadcast::Sender<BrokerRecord>,
}

struct BrokerState {
    offsets: HashMap<(String, u32), u64>,
    recent_by_topic: HashMap<String, VecDeque<BrokerRecord>>,
    consumer_offsets: HashMap<String, HashMap<String, u64>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BrokerStats {
    topics: usize,
    partitions: usize,
    recent_records: usize,
    consumers: usize,
}

impl Broker {
    fn new(runtime_dir: PathBuf, partition_count: u32) -> Result<Self, String> {
        fs::create_dir_all(&runtime_dir).map_err(io_err)?;
        let (records_tx, _) = broadcast::channel(16_384);
        Ok(Self {
            runtime_dir,
            partition_count,
            inner: Mutex::new(BrokerState {
                offsets: HashMap::new(),
                recent_by_topic: HashMap::new(),
                consumer_offsets: HashMap::new(),
            }),
            records_tx,
        })
    }

    fn subscribe(&self) -> broadcast::Receiver<BrokerRecord> {
        self.records_tx.subscribe()
    }

    fn publish(
        &self,
        topic: String,
        payload: SensorFrame,
        source_transport: &str,
    ) -> Result<BrokerRecord, String> {
        let partition = hash_partition(&payload.source_id, self.partition_count);
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "broker lock poisoned".to_string())?;
        let offset_entry = inner.offsets.entry((topic.clone(), partition)).or_insert(0);
        let offset = *offset_entry;
        *offset_entry += 1;
        let record = BrokerRecord {
            topic: topic.clone(),
            partition,
            offset,
            ingested_at: now_ms(),
            source_transport: source_transport.to_string(),
            payload,
        };
        let queue = inner.recent_by_topic.entry(topic.clone()).or_default();
        queue.push_front(record.clone());
        while queue.len() > 2_000 {
            queue.pop_back();
        }
        let partition_path =
            self.runtime_dir
                .join(format!("{}__{}.log", sanitize_topic(&topic), partition));
        append_json_line(&partition_path, &record)?;
        let _ = self.records_tx.send(record.clone());
        Ok(record)
    }

    fn recent_records(&self, limit: usize) -> Vec<BrokerRecord> {
        let inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return Vec::new(),
        };
        let mut all = Vec::new();
        for queue in inner.recent_by_topic.values() {
            for record in queue.iter().take(limit) {
                all.push(record.clone());
            }
        }
        all.sort_by_key(|record| std::cmp::Reverse(record.ingested_at));
        all.truncate(limit);
        all
    }

    fn set_consumer_offset(&self, consumer: &str, topic: &str, offset: u64) {
        if let Ok(mut inner) = self.inner.lock() {
            inner
                .consumer_offsets
                .entry(consumer.to_string())
                .or_default()
                .insert(topic.to_string(), offset);
        }
    }

    fn stats(&self) -> BrokerStats {
        let inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => {
                return BrokerStats {
                    topics: 0,
                    partitions: 0,
                    recent_records: 0,
                    consumers: 0,
                }
            }
        };
        BrokerStats {
            topics: inner.recent_by_topic.len(),
            partitions: inner.offsets.len(),
            recent_records: inner.recent_by_topic.values().map(VecDeque::len).sum(),
            consumers: inner.consumer_offsets.len(),
        }
    }
}

struct TimeSeriesDb {
    runtime_dir: PathBuf,
    inner: Mutex<HashMap<String, Vec<TimeSeriesPoint>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TsdbStats {
    series: usize,
    points: usize,
    compressed_bytes_estimate: usize,
}

impl TimeSeriesDb {
    fn new(runtime_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&runtime_dir);
        Self {
            runtime_dir,
            inner: Mutex::new(HashMap::new()),
        }
    }

    fn ingest_frame(&self, frame: &SensorFrame) -> Result<(), String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "tsdb lock poisoned".to_string())?;
        for (metric, value) in &frame.metrics {
            let series_key = format!("{}.{}.{}", frame.sensor_type, frame.zone, metric);
            let point = TimeSeriesPoint {
                series_key: series_key.clone(),
                timestamp: frame.observed_at,
                value: *value,
                quality: 1.0,
            };
            inner
                .entry(series_key.clone())
                .or_default()
                .push(point.clone());
            let series_path = self
                .runtime_dir
                .join(format!("{}.jsonl", sanitize_topic(&series_key)));
            append_json_line(&series_path, &point)?;
        }
        Ok(())
    }

    fn query(
        &self,
        key: &str,
        from: Option<u64>,
        to: Option<u64>,
        limit: usize,
    ) -> Vec<TimeSeriesPoint> {
        let inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return Vec::new(),
        };
        let mut points = inner.get(key).cloned().unwrap_or_default();
        points.retain(|point| match (from, to) {
            (Some(from), Some(to)) => point.timestamp >= from && point.timestamp <= to,
            (Some(from), None) => point.timestamp >= from,
            (None, Some(to)) => point.timestamp <= to,
            (None, None) => true,
        });
        if points.len() > limit {
            points = points[points.len().saturating_sub(limit)..].to_vec();
        }
        points
    }

    fn latest_metric(&self, key: &str) -> Option<f64> {
        let inner = self.inner.lock().ok()?;
        inner
            .get(key)
            .and_then(|points| points.last())
            .map(|point| point.value)
    }

    fn window_avg(&self, key: &str, window_ms: u64) -> Option<f64> {
        let inner = self.inner.lock().ok()?;
        let points = inner.get(key)?;
        let cutoff = now_ms().saturating_sub(window_ms);
        let in_window: Vec<f64> = points
            .iter()
            .filter(|point| point.timestamp >= cutoff)
            .map(|point| point.value)
            .collect();
        if in_window.is_empty() {
            return None;
        }
        Some(in_window.iter().sum::<f64>() / in_window.len() as f64)
    }

    fn stats(&self) -> TsdbStats {
        let inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => {
                return TsdbStats {
                    series: 0,
                    points: 0,
                    compressed_bytes_estimate: 0,
                }
            }
        };
        let points: usize = inner.values().map(Vec::len).sum();
        let compressed = inner.values().map(|series| gorilla_estimate(series)).sum();
        TsdbStats {
            series: inner.len(),
            points,
            compressed_bytes_estimate: compressed,
        }
    }
}

struct ControlDb {
    conn: Mutex<Connection>,
}

impl ControlDb {
    fn new(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(sql_err)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                dsl TEXT NOT NULL,
                enabled INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS alerts (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                severity TEXT NOT NULL,
                zone TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                state TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS decisions (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                actor_type TEXT NOT NULL,
                rule_id TEXT,
                model_id TEXT,
                inputs TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL,
                zone TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS citizen_reports (
                id TEXT PRIMARY KEY,
                timestamp INTEGER NOT NULL,
                zone TEXT NOT NULL,
                kind TEXT NOT NULL,
                description TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                status TEXT NOT NULL
            );
            ",
        )
        .map_err(sql_err)
    }

    fn seed_defaults(&self) -> Result<(), String> {
        let password_hash = sha256_hex(ADMIN_PASSWORD);
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO users(email, password_hash, role) VALUES (?1, ?2, 'admin')",
            params![ADMIN_EMAIL, password_hash],
        )
        .map_err(sql_err)?;

        let existing_rules: i64 = conn
            .query_row("SELECT COUNT(*) FROM rules", [], |row| row.get(0))
            .map_err(sql_err)?;
        if existing_rules == 0 {
            for (id, rule) in default_rules().into_iter().enumerate() {
                conn.execute(
                    "INSERT INTO rules(id, dsl, enabled) VALUES (?1, ?2, 1)",
                    params![format!("rule-{:03}", id + 1), rule],
                )
                .map_err(sql_err)?;
            }
        }
        Ok(())
    }

    fn authenticate(&self, email: &str, password: &str) -> Result<Option<LoginResponse>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT password_hash, role FROM users WHERE email = ?1")
            .map_err(sql_err)?;
        let mut rows = stmt.query(params![email]).map_err(sql_err)?;
        if let Some(row) = rows.next().map_err(sql_err)? {
            let stored_hash: String = row.get(0).map_err(sql_err)?;
            let role: String = row.get(1).map_err(sql_err)?;
            if stored_hash == sha256_hex(password) {
                let token = format!("nv_{}", Uuid::new_v4().simple());
                conn.execute(
                    "INSERT OR REPLACE INTO sessions(token, email, created_at) VALUES (?1, ?2, ?3)",
                    params![token, email, now_ms() as i64],
                )
                .map_err(sql_err)?;
                return Ok(Some(LoginResponse {
                    token,
                    role,
                    user: email.to_string(),
                }));
            }
        }
        Ok(None)
    }

    fn validate_session(&self, token: &str) -> Result<Option<String>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT email FROM sessions WHERE token = ?1")
            .map_err(sql_err)?;
        let mut rows = stmt.query(params![token]).map_err(sql_err)?;
        if let Some(row) = rows.next().map_err(sql_err)? {
            let email: String = row.get(0).map_err(sql_err)?;
            return Ok(Some(email));
        }
        Ok(None)
    }

    fn load_rules(&self) -> Result<Vec<RuleDefinition>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, dsl FROM rules WHERE enabled = 1 ORDER BY id ASC")
            .map_err(sql_err)?;
        let mut rows = stmt.query([]).map_err(sql_err)?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(sql_err)? {
            let id: String = row.get(0).map_err(sql_err)?;
            let dsl: String = row.get(1).map_err(sql_err)?;
            if let Some(parsed) = RuleDefinition::parse(&id, &dsl) {
                out.push(parsed);
            }
        }
        Ok(out)
    }

    fn insert_alert(&self, alert: &AlertRecord) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO alerts(id, timestamp, severity, zone, title, description, state) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![alert.id, alert.timestamp as i64, alert.severity, alert.zone, alert.title, alert.description, alert.state],
        )
        .map_err(sql_err)?;
        Ok(())
    }

    fn list_alerts(&self, limit: usize) -> Result<Vec<AlertRecord>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, timestamp, severity, zone, title, description, state FROM alerts ORDER BY timestamp DESC LIMIT ?1")
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(AlertRecord {
                    id: row.get(0)?,
                    timestamp: row.get::<_, i64>(1)? as u64,
                    severity: row.get(2)?,
                    zone: row.get(3)?,
                    title: row.get(4)?,
                    description: row.get(5)?,
                    state: row.get(6)?,
                })
            })
            .map_err(sql_err)?;
        let mut out = Vec::new();
        for item in rows {
            out.push(item.map_err(sql_err)?);
        }
        Ok(out)
    }

    fn insert_decision(&self, decision: &DecisionRecord) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO decisions(id, timestamp, actor_type, rule_id, model_id, inputs, action, status, zone) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                decision.decision_id,
                decision.timestamp as i64,
                decision.actor_type,
                decision.rule_id,
                decision.model_id,
                decision.inputs.to_string(),
                decision.action,
                decision.status,
                decision.zone,
            ],
        )
        .map_err(sql_err)?;
        Ok(())
    }

    fn list_decisions(&self, limit: usize) -> Result<Vec<DecisionRecord>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, timestamp, actor_type, rule_id, model_id, inputs, action, status, zone FROM decisions ORDER BY timestamp DESC LIMIT ?1")
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(DecisionRecord {
                    decision_id: row.get(0)?,
                    timestamp: row.get::<_, i64>(1)? as u64,
                    actor_type: row.get(2)?,
                    rule_id: row.get(3)?,
                    model_id: row.get(4)?,
                    inputs: serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(5)?)
                        .unwrap_or(serde_json::json!({})),
                    action: row.get(6)?,
                    status: row.get(7)?,
                    zone: row.get(8)?,
                })
            })
            .map_err(sql_err)?;
        let mut out = Vec::new();
        for item in rows {
            out.push(item.map_err(sql_err)?);
        }
        Ok(out)
    }

    fn insert_report(&self, report: &CitizenReport) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO citizen_reports(id, timestamp, zone, kind, description, lat, lon, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![report.id, report.timestamp as i64, report.zone, report.kind, report.description, report.lat, report.lon, report.status],
        )
        .map_err(sql_err)?;
        Ok(())
    }

    fn list_reports(&self, limit: usize) -> Result<Vec<CitizenReport>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "db lock poisoned".to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, timestamp, zone, kind, description, lat, lon, status FROM citizen_reports ORDER BY timestamp DESC LIMIT ?1")
            .map_err(sql_err)?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(CitizenReport {
                    id: row.get(0)?,
                    timestamp: row.get::<_, i64>(1)? as u64,
                    zone: row.get(2)?,
                    kind: row.get(3)?,
                    description: row.get(4)?,
                    lat: row.get(5)?,
                    lon: row.get(6)?,
                    status: row.get(7)?,
                })
            })
            .map_err(sql_err)?;
        let mut out = Vec::new();
        for item in rows {
            out.push(item.map_err(sql_err)?);
        }
        Ok(out)
    }

    fn sessions_active(&self) -> usize {
        let conn = match self.conn.lock() {
            Ok(conn) => conn,
            Err(_) => return 0,
        };
        conn.query_row("SELECT COUNT(*) FROM sessions", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|count| count as usize)
        .unwrap_or(0)
    }

    fn audit_rows(&self) -> usize {
        let conn = match self.conn.lock() {
            Ok(conn) => conn,
            Err(_) => return 0,
        };
        let alerts = conn
            .query_row("SELECT COUNT(*) FROM alerts", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap_or(0);
        let decisions = conn
            .query_row("SELECT COUNT(*) FROM decisions", [], |row| {
                row.get::<_, i64>(0)
            })
            .unwrap_or(0);
        (alerts + decisions) as usize
    }
}

#[derive(Debug, Clone)]
struct RuleDefinition {
    id: String,
    condition: RuleCondition,
    actions: Vec<RuleAction>,
    priority: u8,
    source: String,
}

#[derive(Debug, Clone)]
enum RuleCondition {
    Metric {
        metric: String,
        topic: String,
        op: CompareOp,
        threshold: f64,
    },
    WindowAvg {
        metric: String,
        topic: String,
        window_ms: u64,
        op: CompareOp,
        threshold: f64,
    },
}

#[derive(Debug, Clone)]
enum CompareOp {
    Lt,
    Lte,
    Gt,
    Gte,
}

#[derive(Debug, Clone)]
enum RuleAction {
    Alert(String),
    Activate(String),
    Publish(String),
}

impl RuleDefinition {
    fn parse(id: &str, source: &str) -> Option<Self> {
        let when_then: Vec<&str> = source.split("THEN").collect();
        if when_then.len() != 2 {
            return None;
        }
        let left = when_then[0].trim().trim_start_matches("WHEN").trim();
        let right = when_then[1].trim();
        let (actions_part, priority) =
            if let Some((actions, priority_part)) = right.rsplit_once("PRIORITY") {
                let priority = priority_part.trim().parse::<u8>().ok()?;
                (actions.trim(), priority)
            } else {
                (right, 50)
            };
        let condition = if left.starts_with("metric(") {
            parse_metric_condition(left)?
        } else if left.starts_with("window_avg(") {
            parse_window_condition(left)?
        } else {
            return None;
        };
        let actions = actions_part
            .split(',')
            .filter_map(|part| parse_action(part.trim()))
            .collect::<Vec<_>>();
        if actions.is_empty() {
            return None;
        }
        Some(Self {
            id: id.to_string(),
            condition,
            actions,
            priority,
            source: source.to_string(),
        })
    }
}

fn parse_metric_condition(source: &str) -> Option<RuleCondition> {
    let close = source.find(')')?;
    let inside = &source["metric(".len()..close];
    let parts = csv_args(inside);
    if parts.len() != 2 {
        return None;
    }
    let rest = source[close + 1..].trim();
    let (op, threshold) = parse_compare(rest)?;
    Some(RuleCondition::Metric {
        metric: parts[0].to_string(),
        topic: parts[1].to_string(),
        op,
        threshold,
    })
}

fn parse_window_condition(source: &str) -> Option<RuleCondition> {
    let close = source.find(')')?;
    let inside = &source["window_avg(".len()..close];
    let parts = csv_args(inside);
    if parts.len() != 3 {
        return None;
    }
    let rest = source[close + 1..].trim();
    let (op, threshold) = parse_compare(rest)?;
    Some(RuleCondition::WindowAvg {
        metric: parts[0].to_string(),
        topic: parts[1].to_string(),
        window_ms: parse_window_ms(&parts[2])?,
        op,
        threshold,
    })
}

fn parse_window_ms(value: &str) -> Option<u64> {
    if let Some(stripped) = value.strip_suffix('s') {
        return stripped.parse::<u64>().ok().map(|secs| secs * 1_000);
    }
    if let Some(stripped) = value.strip_suffix('m') {
        return stripped.parse::<u64>().ok().map(|mins| mins * 60_000);
    }
    if let Some(stripped) = value.strip_suffix('h') {
        return stripped.parse::<u64>().ok().map(|hours| hours * 3_600_000);
    }
    None
}

fn parse_compare(rest: &str) -> Option<(CompareOp, f64)> {
    for (token, op) in [
        (">=", CompareOp::Gte),
        ("<=", CompareOp::Lte),
        (">", CompareOp::Gt),
        ("<", CompareOp::Lt),
    ] {
        if let Some((_, rhs)) = rest.split_once(token) {
            return Some((op, rhs.trim().parse().ok()?));
        }
    }
    None
}

fn parse_action(source: &str) -> Option<RuleAction> {
    if let Some(value) = action_arg(source, "alert") {
        return Some(RuleAction::Alert(value));
    }
    if let Some(value) = action_arg(source, "activate") {
        return Some(RuleAction::Activate(value));
    }
    if let Some(value) = action_arg(source, "publish") {
        return Some(RuleAction::Publish(value));
    }
    None
}

fn action_arg(source: &str, prefix: &str) -> Option<String> {
    if !source.starts_with(prefix) {
        return None;
    }
    let start = source.find('(')?;
    let end = source.rfind(')')?;
    Some(trim_quotes(&source[start + 1..end]))
}

fn csv_args(source: &str) -> Vec<String> {
    source
        .split(',')
        .map(|part| trim_quotes(part.trim()))
        .collect()
}

fn trim_quotes(source: &str) -> String {
    source
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

struct RuleEngine {
    rules: Vec<RuleDefinition>,
}

impl RuleEngine {
    fn new(mut rules: Vec<RuleDefinition>) -> Self {
        rules.sort_by_key(|rule| std::cmp::Reverse(rule.priority));
        Self { rules }
    }

    fn evaluate(&self, frame: &SensorFrame, tsdb: &TimeSeriesDb) -> Vec<TriggeredRule> {
        let current_topic = normalize_topic(frame);
        self.rules
            .iter()
            .filter_map(|rule| {
                let passed = match &rule.condition {
                    RuleCondition::Metric {
                        metric,
                        topic,
                        op,
                        threshold,
                    } => {
                        if topic != &current_topic {
                            return None;
                        }
                        let key = format!("{}.{}.{}", frame.sensor_type, frame.zone, metric);
                        let value = tsdb.latest_metric(&key)?;
                        Some(compare(value, *threshold, op))
                    }
                    RuleCondition::WindowAvg {
                        metric,
                        topic,
                        window_ms,
                        op,
                        threshold,
                    } => {
                        if topic != &current_topic {
                            return None;
                        }
                        let key = format!("{}.{}.{}", frame.sensor_type, frame.zone, metric);
                        let value = tsdb.window_avg(&key, *window_ms)?;
                        Some(compare(value, *threshold, op))
                    }
                }?;
                if passed {
                    Some(TriggeredRule {
                        rule_id: rule.id.clone(),
                        actions: rule.actions.clone(),
                        source: rule.source.clone(),
                    })
                } else {
                    None
                }
            })
            .collect()
    }
}

#[derive(Debug, Clone)]
struct TriggeredRule {
    rule_id: String,
    actions: Vec<RuleAction>,
    source: String,
}

fn compare(value: f64, threshold: f64, op: &CompareOp) -> bool {
    match op {
        CompareOp::Lt => value < threshold,
        CompareOp::Lte => value <= threshold,
        CompareOp::Gt => value > threshold,
        CompareOp::Gte => value >= threshold,
    }
}

#[derive(Default)]
struct IntelligenceEngine {
    inner: Mutex<IntelligenceState>,
}

#[derive(Default)]
struct IntelligenceState {
    traffic_models: HashMap<String, TrafficForecaster>,
    energy_models: HashMap<String, LinearRegressor>,
    signal_agents: HashMap<String, SignalQAgent>,
    anomaly_models: HashMap<String, AutoencoderLite>,
    incident_models: HashMap<String, IncidentClassifier>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct IntelligenceUpdate {
    traffic_forecast_15m: f64,
    traffic_forecast_30m: f64,
    traffic_forecast_60m: f64,
    energy_forecast_24h: f64,
    anomaly_score: f64,
    incident_hint: String,
    signal_recommendation: String,
}

impl IntelligenceEngine {
    fn update(&self, frame: &SensorFrame) -> IntelligenceUpdate {
        let mut inner = match self.inner.lock() {
            Ok(inner) => inner,
            Err(_) => return IntelligenceUpdate::default_for(frame.zone.clone()),
        };
        let zone = frame.zone.clone();
        let traffic_metric = frame.metrics.get("vehicle_count").copied().unwrap_or(0.0);
        let speed_metric = frame.metrics.get("avg_speed").copied().unwrap_or(30.0);
        let energy_metric = frame.metrics.get("consumption_kw").copied().unwrap_or(0.0);
        let features = vec![
            traffic_metric / 200.0,
            speed_metric / 120.0,
            energy_metric / 2_000.0,
            hour_fraction(),
        ];
        let traffic = inner
            .traffic_models
            .entry(zone.clone())
            .or_insert_with(TrafficForecaster::default);
        let traffic_now = if traffic_metric > 0.0 {
            traffic_metric
        } else {
            speed_metric * 2.0
        };
        let traffic_projection = traffic.step(traffic_now, &features);

        let energy = inner
            .energy_models
            .entry(zone.clone())
            .or_insert_with(|| LinearRegressor::new(4));
        let energy_prediction = energy.learn_and_predict(&features, energy_metric);

        let anomaly = inner
            .anomaly_models
            .entry(frame.source_id.clone())
            .or_insert_with(|| AutoencoderLite::new(features.len()));
        let anomaly_score = anomaly.learn_score(&features);

        let signal_agent = inner
            .signal_agents
            .entry(zone.clone())
            .or_insert_with(SignalQAgent::default);
        let signal_action = signal_agent.step(traffic_metric, speed_metric, anomaly_score);

        let incident_model = inner
            .incident_models
            .entry(zone.clone())
            .or_insert_with(|| IncidentClassifier::new(4, 4));
        let incident_hint = incident_model.learn_and_predict(&features, incident_label(frame));

        IntelligenceUpdate {
            traffic_forecast_15m: traffic_projection * 1.05,
            traffic_forecast_30m: traffic_projection * 1.12,
            traffic_forecast_60m: traffic_projection * 1.2,
            energy_forecast_24h: energy_prediction,
            anomaly_score,
            incident_hint,
            signal_recommendation: signal_action,
        }
    }
}

impl IntelligenceUpdate {
    fn default_for(zone: String) -> Self {
        Self {
            traffic_forecast_15m: 0.0,
            traffic_forecast_30m: 0.0,
            traffic_forecast_60m: 0.0,
            energy_forecast_24h: 0.0,
            anomaly_score: 0.0,
            incident_hint: format!("monitor-{}", zone),
            signal_recommendation: "hold-phase".to_string(),
        }
    }
}

#[derive(Default)]
struct TrafficForecaster {
    h: f64,
    c: f64,
    wy: f64,
    by: f64,
}

impl TrafficForecaster {
    fn step(&mut self, target: f64, features: &[f64]) -> f64 {
        let x = features.iter().sum::<f64>() / features.len().max(1) as f64;
        let f = sigmoid(0.7 * x + 0.2 * self.h + 0.1);
        let i = sigmoid(0.5 * x + 0.15 * self.h);
        let g = (0.8 * x - 0.1 * self.h).tanh();
        let o = sigmoid(0.6 * x + 0.1 * self.h);
        self.c = f * self.c + i * g;
        self.h = o * self.c.tanh();
        let prediction = (self.wy * self.h + self.by).max(0.0) * 200.0;
        let error = target - prediction;
        self.wy += 0.0005 * error * self.h;
        self.by += 0.0005 * error;
        if self.wy.abs() < 0.001 {
            self.wy = 1.0;
        }
        if prediction == 0.0 && target > 0.0 {
            target
        } else {
            prediction
        }
    }
}

struct LinearRegressor {
    weights: Vec<f64>,
    bias: f64,
}

impl LinearRegressor {
    fn new(size: usize) -> Self {
        Self {
            weights: vec![0.1; size],
            bias: 0.0,
        }
    }

    fn learn_and_predict(&mut self, features: &[f64], target: f64) -> f64 {
        let prediction = dot(&self.weights, features) + self.bias;
        let error = target - prediction;
        for (weight, feature) in self.weights.iter_mut().zip(features.iter()) {
            *weight += 0.01 * error * feature;
        }
        self.bias += 0.01 * error;
        prediction.max(0.0)
    }
}

#[derive(Default)]
struct SignalQAgent {
    q: HashMap<String, [f64; 3]>,
}

impl SignalQAgent {
    fn step(&mut self, traffic: f64, speed: f64, anomaly: f64) -> String {
        let state = format!(
            "t{}-s{}-a{}",
            bucket(traffic, &[20.0, 60.0, 100.0]),
            bucket(speed, &[15.0, 35.0, 60.0]),
            bucket(anomaly, &[0.2, 0.5, 0.8]),
        );
        let reward = -traffic + speed * 1.5 - anomaly * 50.0;
        let entry = self.q.entry(state.clone()).or_insert([0.0; 3]);
        let action = entry
            .iter()
            .enumerate()
            .max_by(|(_, left), (_, right)| left.total_cmp(right))
            .map(|(idx, _)| idx)
            .unwrap_or(0);
        entry[action] = entry[action] + 0.2 * (reward - entry[action]);
        match action {
            0 => "hold-phase".to_string(),
            1 => "extend-green".to_string(),
            _ => "switch-priority".to_string(),
        }
    }
}

struct AutoencoderLite {
    encoder: Vec<Vec<f64>>,
    decoder: Vec<Vec<f64>>,
    threshold_mean: f64,
    threshold_var: f64,
}

impl AutoencoderLite {
    fn new(input: usize) -> Self {
        let hidden = 3.max(input / 2);
        let mut rng = StdRng::seed_from_u64(42);
        let encoder = (0..hidden)
            .map(|_| (0..input).map(|_| rng.gen_range(-0.3..0.3)).collect())
            .collect();
        let decoder = (0..input)
            .map(|_| (0..hidden).map(|_| rng.gen_range(-0.3..0.3)).collect())
            .collect();
        Self {
            encoder,
            decoder,
            threshold_mean: 0.0,
            threshold_var: 1.0,
        }
    }

    fn learn_score(&mut self, features: &[f64]) -> f64 {
        let hidden: Vec<f64> = self
            .encoder
            .iter()
            .map(|weights| dot(weights, features).tanh())
            .collect();
        let decoded: Vec<f64> = self
            .decoder
            .iter()
            .map(|weights| dot(weights, &hidden))
            .collect();
        let errors: Vec<f64> = features
            .iter()
            .zip(decoded.iter())
            .map(|(left, right)| left - right)
            .collect();
        let mse =
            errors.iter().map(|error| error * error).sum::<f64>() / errors.len().max(1) as f64;
        self.threshold_mean = 0.98 * self.threshold_mean + 0.02 * mse;
        self.threshold_var = 0.98 * self.threshold_var + 0.02 * (mse - self.threshold_mean).abs();
        for (decoder_weights, error) in self.decoder.iter_mut().zip(errors.iter()) {
            for (weight, hidden_value) in decoder_weights.iter_mut().zip(hidden.iter()) {
                *weight += 0.01 * error * hidden_value;
            }
        }
        let threshold = self.threshold_mean + 3.0 * self.threshold_var.sqrt();
        if threshold <= 0.0 {
            mse
        } else {
            (mse / threshold).min(3.0)
        }
    }
}

struct IncidentClassifier {
    weights: Vec<Vec<f64>>,
    labels: Vec<&'static str>,
}

impl IncidentClassifier {
    fn new(features: usize, labels: usize) -> Self {
        let classes = labels.max(4);
        let mut rng = StdRng::seed_from_u64(7);
        Self {
            weights: (0..classes)
                .map(|_| (0..features).map(|_| rng.gen_range(-0.2..0.2)).collect())
                .collect(),
            labels: vec!["traffic", "energy", "water", "security"],
        }
    }

    fn learn_and_predict(&mut self, features: &[f64], target_label: usize) -> String {
        let logits: Vec<f64> = self
            .weights
            .iter()
            .map(|weights| dot(weights, features))
            .collect();
        let probs = softmax(&logits);
        for (class_idx, weights) in self.weights.iter_mut().enumerate() {
            let expected = if class_idx == target_label { 1.0 } else { 0.0 };
            let error = expected - probs[class_idx];
            for (weight, feature) in weights.iter_mut().zip(features.iter()) {
                *weight += 0.03 * error * feature;
            }
        }
        let predicted = probs
            .iter()
            .enumerate()
            .max_by(|(_, left), (_, right)| left.total_cmp(right))
            .map(|(idx, _)| idx)
            .unwrap_or(0);
        self.labels.get(predicted).unwrap_or(&"monitor").to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RoutePlan {
    zone: String,
    total_distance_km: f64,
    stops: Vec<String>,
    updated_at: u64,
}

fn compute_route(zone: &str, bins: &[SensorFrame]) -> RoutePlan {
    let names: Vec<String> = bins.iter().map(|frame| frame.source_id.clone()).collect();
    let mut pheromone = vec![1.0; names.len().max(1)];
    let mut best_order = names.clone();
    let mut best_score = f64::MAX;
    for _ in 0..16 {
        let mut rng = rand::thread_rng();
        let mut order = names.clone();
        for idx in (1..order.len()).rev() {
            let swap_idx = rng.gen_range(0..=idx);
            order.swap(idx, swap_idx);
        }
        let score = order.len() as f64 * 0.38 + rng.gen_range(0.0..3.0)
            - pheromone.iter().sum::<f64>() * 0.01;
        if score < best_score {
            best_score = score;
            best_order = order.clone();
        }
        for value in pheromone.iter_mut() {
            *value = *value * 0.85 + 0.2;
        }
    }
    RoutePlan {
        zone: zone.to_string(),
        total_distance_km: (best_order.len() as f64 * 0.42).max(3.0),
        stops: best_order.into_iter().take(18).collect(),
        updated_at: now_ms(),
    }
}

async fn spawn_protocol_listeners(state: AppState) -> Result<Vec<JoinHandle<()>>, String> {
    let tcp_state = state.clone();
    let udp_state = state.clone();
    let mqtt_state = state.clone();
    let amqp_state = state.clone();
    let handles = vec![
        tokio::spawn(async move {
            if let Err(error) = run_tcp_ingest_listener(tcp_state).await {
                error!(?error, "tcp ingest listener failed");
            }
        }),
        tokio::spawn(async move {
            if let Err(error) = run_udp_ingest_listener(udp_state).await {
                error!(?error, "udp ingest listener failed");
            }
        }),
        tokio::spawn(async move {
            if let Err(error) = run_mqtt_listener(mqtt_state).await {
                error!(?error, "mqtt listener failed");
            }
        }),
        tokio::spawn(async move {
            if let Err(error) = run_amqp_subset_listener(amqp_state).await {
                error!(?error, "amqp listener failed");
            }
        }),
    ];
    Ok(handles)
}

async fn spawn_runtime_tasks(state: AppState) -> Vec<JoinHandle<()>> {
    let summary_state = state.clone();
    let routing_state = state.clone();
    let autoload_state = state.clone();
    vec![
        tokio::spawn(async move {
            let enabled = std::env::var("NEUROVA_AUTODEMO").ok().as_deref() == Some("1");
            if enabled {
                if let Err(error) = run_synthetic_generator(autoload_state, 1_200).await {
                    error!(?error, "auto demo failed");
                }
            }
        }),
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(3)).await;
                let kpis = build_kpis(&summary_state).await;
                let event = serde_json::json!({
                    "kind": "kpi",
                    "timestamp": now_ms(),
                    "payload": kpis,
                });
                summary_state.broker.set_consumer_offset(
                    "kpi-broadcaster",
                    "system.kpis",
                    now_ms(),
                );
                let _ = summary_state.broker.records_tx.send(BrokerRecord {
                    topic: "system.kpis".to_string(),
                    partition: 0,
                    offset: now_ms(),
                    ingested_at: now_ms(),
                    source_transport: "internal".to_string(),
                    payload: SensorFrame {
                        id: new_event_id(),
                        source_id: "neurova-kpi".to_string(),
                        sensor_type: "system".to_string(),
                        zone: "central".to_string(),
                        location: None,
                        observed_at: now_ms(),
                        metrics: BTreeMap::new(),
                        labels: BTreeMap::from([("json".to_string(), event.to_string())]),
                        severity: None,
                        topic: Some("system.kpis".to_string()),
                    },
                });
            }
        }),
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(10)).await;
                let frames: Vec<SensorFrame> = {
                    let live = routing_state.live_state.read().await;
                    live.latest_frames.values().cloned().collect()
                };
                let waste_bins: Vec<SensorFrame> = frames
                    .into_iter()
                    .filter(|frame| frame.sensor_type == "waste")
                    .collect();
                for zone in zones() {
                    let zone_bins: Vec<SensorFrame> = waste_bins
                        .iter()
                        .filter(|frame| frame.zone == zone)
                        .cloned()
                        .collect();
                    if !zone_bins.is_empty() {
                        let route = compute_route(&zone, &zone_bins);
                        let mut live = routing_state.live_state.write().await;
                        live.routes.insert(zone, route);
                    }
                }
            }
        }),
    ]
}

fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(|| async { Redirect::temporary("/control/") }))
        .route("/api/health", get(api_health))
        .route("/api/kpis", get(api_kpis))
        .route("/api/map", get(api_map))
        .route("/api/events", get(api_events))
        .route("/api/alerts", get(api_alerts))
        .route("/api/decisions", get(api_decisions))
        .route("/api/reports", get(api_reports).post(api_create_report))
        .route("/api/routes/waste", get(api_waste_routes))
        .route("/api/series", get(api_series))
        .route("/api/ingest", post(api_ingest))
        .route("/api/ingest/ws", get(api_ingest_ws))
        .route("/api/ws", get(api_event_ws))
        .route("/api/auth/login", post(api_login))
        .route("/api/control/command", post(api_control_command))
        .route("/api/public/overview", get(api_public_overview))
        .route("/api/public/eta", get(api_public_eta))
        .route("/api/graphql", post(api_graphql))
        .route("/api/docs", get(api_docs_html))
        .route("/api/openapi.json", get(api_openapi))
        .nest_service(
            "/control",
            ServeDir::new("web/control").append_index_html_on_directories(true),
        )
        .nest_service(
            "/ciudad",
            ServeDir::new("web/ciudad").append_index_html_on_directories(true),
        )
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn api_health(State(state): State<AppState>) -> impl IntoResponse {
    let mut listeners = BTreeMap::new();
    listeners.insert("http".to_string(), state.config.http_port);
    listeners.insert("mqtt".to_string(), state.config.mqtt_port);
    listeners.insert("amqp".to_string(), state.config.amqp_port);
    listeners.insert("tcp_ingest".to_string(), state.config.tcp_ingest_port);
    listeners.insert("udp_ingest".to_string(), state.config.udp_ingest_port);
    Json(ApiEnvelope {
        ok: true,
        data: RuntimeHealth {
            service: "neurova",
            status: "ok",
            listeners,
            metrics: state.metrics.snapshot(),
            broker: state.broker.stats(),
            tsdb: state.tsdb.stats(),
            security: SecurityStatus {
                admin_user_seeded: true,
                sessions_active: state.db.sessions_active(),
                audit_rows: state.db.audit_rows(),
                command_channel_separated: true,
            },
        },
    })
}

async fn api_kpis(State(state): State<AppState>) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: build_kpis(&state).await,
    })
}

async fn api_map(State(state): State<AppState>) -> impl IntoResponse {
    let live = state.live_state.read().await;
    let sensors: Vec<SensorFrame> = live.latest_frames.values().cloned().collect();
    Json(ApiEnvelope {
        ok: true,
        data: serde_json::json!({
            "topology": state.topology.as_ref(),
            "sensors": sensors,
            "routes": live.routes,
        }),
    })
}

async fn api_events(
    State(state): State<AppState>,
    Query(query): Query<EventQuery>,
) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: state.broker.recent_records(query.limit.unwrap_or(100)),
    })
}

async fn api_alerts(State(state): State<AppState>) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: state.db.list_alerts(120).unwrap_or_default(),
    })
}

async fn api_decisions(State(state): State<AppState>) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: state.db.list_decisions(120).unwrap_or_default(),
    })
}

async fn api_reports(State(state): State<AppState>) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: state.db.list_reports(120).unwrap_or_default(),
    })
}

async fn api_create_report(
    State(state): State<AppState>,
    Json(mut report): Json<CitizenReport>,
) -> impl IntoResponse {
    if report.id.is_empty() {
        report.id = format!("report-{}", Uuid::new_v4().simple());
    }
    if report.timestamp == 0 {
        report.timestamp = now_ms();
    }
    if report.status.is_empty() {
        report.status = "new".to_string();
    }
    let _ = state.db.insert_report(&report);
    Json(ApiEnvelope {
        ok: true,
        data: report,
    })
}

async fn api_waste_routes(State(state): State<AppState>) -> impl IntoResponse {
    let live = state.live_state.read().await;
    Json(ApiEnvelope {
        ok: true,
        data: live.routes.values().cloned().collect::<Vec<_>>(),
    })
}

async fn api_series(
    State(state): State<AppState>,
    Query(query): Query<SeriesQuery>,
) -> impl IntoResponse {
    Json(ApiEnvelope {
        ok: true,
        data: state
            .tsdb
            .query(&query.key, query.from, query.to, query.limit.unwrap_or(720)),
    })
}

async fn api_ingest(
    State(state): State<AppState>,
    Json(frame): Json<SensorFrame>,
) -> impl IntoResponse {
    state.metrics.ingest_http.fetch_add(1, Ordering::Relaxed);
    match process_frame(state, frame, "http").await {
        Ok(record) => (
            StatusCode::ACCEPTED,
            Json(ApiEnvelope {
                ok: true,
                data: record,
            }),
        )
            .into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(ApiEnvelope {
                ok: false,
                data: serde_json::json!({ "error": error }),
            }),
        )
            .into_response(),
    }
}

async fn api_ingest_ws(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ingest_ws(socket, state))
}

async fn api_event_ws(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_event_ws(socket, state))
}

async fn api_login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    match state.db.authenticate(&payload.email, &payload.password) {
        Ok(Some(login)) => (
            StatusCode::OK,
            Json(ApiEnvelope {
                ok: true,
                data: login,
            }),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            Json(ApiEnvelope {
                ok: false,
                data: serde_json::json!({ "error": "invalid_credentials" }),
            }),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiEnvelope {
                ok: false,
                data: serde_json::json!({ "error": error }),
            }),
        )
            .into_response(),
    }
}

async fn api_control_command(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CommandRequest>,
) -> axum::response::Response {
    let token = auth_token(&headers).unwrap_or_default();
    if state.db.validate_session(&token).ok().flatten().is_none() {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiEnvelope {
                ok: false,
                data: serde_json::json!({ "error": "session_required" }),
            }),
        )
            .into_response();
    }
    let decision = DecisionRecord {
        decision_id: format!("decision-{}", Uuid::new_v4().simple()),
        timestamp: now_ms(),
        actor_type: "operator".to_string(),
        rule_id: None,
        model_id: None,
        inputs: serde_json::json!({ "value": payload.value }),
        action: payload.action.clone(),
        status: "executed".to_string(),
        zone: payload.zone.clone(),
    };
    let _ = state.db.insert_decision(&decision);
    state
        .metrics
        .decisions_written
        .fetch_add(1, Ordering::Relaxed);
    let alert = AlertRecord {
        id: format!("alert-{}", Uuid::new_v4().simple()),
        timestamp: now_ms(),
        severity: "medium".to_string(),
        zone: payload.zone.clone(),
        title: format!("Manual command: {}", payload.action),
        description: format!("Operator override executed in zone {}", payload.zone),
        state: "acknowledged".to_string(),
    };
    let _ = state.db.insert_alert(&alert);
    Json(ApiEnvelope {
        ok: true,
        data: serde_json::json!({
            "decision": decision,
            "alert": alert,
        }),
    })
    .into_response()
}

async fn api_public_overview(State(state): State<AppState>) -> impl IntoResponse {
    let live = state.live_state.read().await;
    Json(ApiEnvelope {
        ok: true,
        data: PublicOverview {
            kpis: build_kpis(&state).await,
            alerts: live.active_alerts.iter().take(16).cloned().collect(),
            stops: live.public_eta.clone(),
            districts: state.topology.districts.clone(),
        },
    })
}

async fn api_public_eta(State(state): State<AppState>) -> impl IntoResponse {
    let live = state.live_state.read().await;
    Json(ApiEnvelope {
        ok: true,
        data: live.public_eta.clone(),
    })
}

async fn api_graphql(
    State(state): State<AppState>,
    Json(payload): Json<GraphQlRequest>,
) -> impl IntoResponse {
    let query = payload.query.to_lowercase();
    let mut data = serde_json::Map::new();
    if query.contains("kpis") {
        data.insert(
            "kpis".to_string(),
            serde_json::to_value(build_kpis(&state).await).unwrap_or_default(),
        );
    }
    if query.contains("alerts") {
        data.insert(
            "alerts".to_string(),
            serde_json::to_value(state.db.list_alerts(20).unwrap_or_default()).unwrap_or_default(),
        );
    }
    if query.contains("routes") {
        let live = state.live_state.read().await;
        data.insert(
            "routes".to_string(),
            serde_json::to_value(live.routes.values().cloned().collect::<Vec<_>>())
                .unwrap_or_default(),
        );
    }
    Json(ApiEnvelope {
        ok: true,
        data: GraphQlResponse {
            data: serde_json::Value::Object(data),
        },
    })
}

async fn api_docs_html() -> impl IntoResponse {
    Html(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>NEUROVA API Docs</title>
  <style>
    body { background:#090D12; color:#d8ffe9; font-family: ui-monospace, monospace; margin:0; padding:32px; }
    h1 { color:#00FF87; }
    pre { background:#0f1620; padding:16px; border:1px solid #173244; overflow:auto; }
    a { color:#0EA5FF; }
  </style>
</head>
<body>
  <h1>NEUROVA API</h1>
  <p>OpenAPI spec: <a href="/api/openapi.json">/api/openapi.json</a></p>
  <pre id="spec">loading...</pre>
  <script>
    fetch('/api/openapi.json').then(r => r.json()).then(data => {
      document.getElementById('spec').textContent = JSON.stringify(data, null, 2);
    });
  </script>
</body>
</html>"#,
    )
}

async fn api_openapi() -> impl IntoResponse {
    Json(serde_json::json!({
        "openapi": "3.1.0",
        "info": {
            "title": "NEUROVA Public and Control API",
            "version": "0.1.0",
            "description": "City operations API for ingest, analytics, alerts, control, and citizen access."
        },
        "servers": [{ "url": "/" }],
        "paths": {
            "/api/health": { "get": { "summary": "Runtime health" }},
            "/api/kpis": { "get": { "summary": "Operator KPI snapshot" }},
            "/api/map": { "get": { "summary": "Vector topology plus live sensors" }},
            "/api/events": { "get": { "summary": "Recent broker events" }},
            "/api/alerts": { "get": { "summary": "Alert feed" }},
            "/api/decisions": { "get": { "summary": "Decision audit log" }},
            "/api/series": { "get": { "summary": "Time-series query" }},
            "/api/ingest": { "post": { "summary": "HTTP ingest endpoint" }},
            "/api/ingest/ws": { "get": { "summary": "WebSocket ingest endpoint" }},
            "/api/ws": { "get": { "summary": "Realtime event WebSocket" }},
            "/api/auth/login": { "post": { "summary": "Operator login" }},
            "/api/control/command": { "post": { "summary": "Operator manual override" }},
            "/api/public/overview": { "get": { "summary": "Citizen overview" }},
            "/api/public/eta": { "get": { "summary": "Transport ETA" }},
            "/api/reports": {
                "get": { "summary": "List citizen reports" },
                "post": { "summary": "Create citizen report" }
            },
            "/api/graphql": { "post": { "summary": "Graph-style query endpoint" }}
        }
    }))
}

async fn handle_ingest_ws(mut socket: WebSocket, state: AppState) {
    state.metrics.ws_clients.fetch_add(1, Ordering::Relaxed);
    while let Some(Ok(message)) = socket.next().await {
        if let Message::Text(body) = message {
            if let Ok(frame) = serde_json::from_str::<SensorFrame>(&body) {
                state.metrics.ingest_ws.fetch_add(1, Ordering::Relaxed);
                if let Err(error) = process_frame(state.clone(), frame, "websocket").await {
                    warn!(?error, "websocket ingest failed");
                }
            }
        }
    }
    state.metrics.ws_clients.fetch_sub(1, Ordering::Relaxed);
}

async fn handle_event_ws(mut socket: WebSocket, state: AppState) {
    let mut receiver = state.broker.subscribe();
    state.metrics.ws_clients.fetch_add(1, Ordering::Relaxed);
    loop {
        tokio::select! {
            message = receiver.recv() => {
                match message {
                    Ok(record) => {
                        if socket
                            .send(Message::Text(serde_json::to_string(&record).unwrap_or_default().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            inbound = socket.next() => {
                if inbound.is_none() {
                    break;
                }
            }
        }
    }
    state.metrics.ws_clients.fetch_sub(1, Ordering::Relaxed);
}

async fn process_frame(
    state: AppState,
    frame: SensorFrame,
    source_transport: &str,
) -> Result<BrokerRecord, String> {
    validate_frame(&frame)?;
    state.tsdb.ingest_frame(&frame)?;
    let intelligence = state.intelligence.update(&frame);
    let topic = normalize_topic(&frame);
    let record = state
        .broker
        .publish(topic.clone(), frame.clone(), source_transport)?;
    {
        let mut live = state.live_state.write().await;
        live.latest_frames
            .insert(frame.source_id.clone(), frame.clone());
        live.public_eta = synthesize_stop_etas(&live.latest_frames);
    }

    let triggered = state.rules.evaluate(&frame, &state.tsdb);
    for trigger in triggered {
        for action in trigger.actions {
            match action {
                RuleAction::Alert(message) => {
                    let alert = AlertRecord {
                        id: format!("alert-{}", Uuid::new_v4().simple()),
                        timestamp: now_ms(),
                        severity: severity_for(&frame, intelligence.anomaly_score),
                        zone: frame.zone.clone(),
                        title: message.clone(),
                        description: format!(
                            "{} | traffic15 {:.1} | energy24h {:.1} | incident {}",
                            message,
                            intelligence.traffic_forecast_15m,
                            intelligence.energy_forecast_24h,
                            intelligence.incident_hint
                        ),
                        state: "new".to_string(),
                    };
                    let _ = state.db.insert_alert(&alert);
                    state
                        .metrics
                        .alerts_generated
                        .fetch_add(1, Ordering::Relaxed);
                    let mut live = state.live_state.write().await;
                    live.active_alerts.insert(0, alert);
                    live.active_alerts.truncate(64);
                }
                RuleAction::Activate(action_name) | RuleAction::Publish(action_name) => {
                    let decision = DecisionRecord {
                        decision_id: format!("decision-{}", Uuid::new_v4().simple()),
                        timestamp: now_ms(),
                        actor_type: "system".to_string(),
                        rule_id: Some(trigger.rule_id.clone()),
                        model_id: Some("automation".to_string()),
                        inputs: serde_json::json!({
                            "source": trigger.source,
                            "topic": topic,
                            "frame": frame,
                            "intelligence": intelligence,
                        }),
                        action: action_name,
                        status: "executed".to_string(),
                        zone: frame.zone.clone(),
                    };
                    let _ = state.db.insert_decision(&decision);
                    state
                        .metrics
                        .decisions_written
                        .fetch_add(1, Ordering::Relaxed);
                    let mut live = state.live_state.write().await;
                    live.last_decisions.insert(0, decision);
                    live.last_decisions.truncate(64);
                }
            }
        }
    }
    Ok(record)
}

fn validate_frame(frame: &SensorFrame) -> Result<(), String> {
    if frame.source_id.trim().is_empty() {
        return Err("source_id is required".to_string());
    }
    if frame.sensor_type.trim().is_empty() {
        return Err("sensor_type is required".to_string());
    }
    if frame.zone.trim().is_empty() {
        return Err("zone is required".to_string());
    }
    if frame.metrics.is_empty() {
        return Err("at least one metric is required".to_string());
    }
    Ok(())
}

async fn build_kpis(state: &AppState) -> KpiSnapshot {
    let vehicles = state
        .tsdb
        .latest_metric("traffic.central.vehicle_count")
        .unwrap_or(220.0)
        + state
            .tsdb
            .latest_metric("traffic.north.vehicle_count")
            .unwrap_or(180.0)
        + state
            .tsdb
            .latest_metric("traffic.south.vehicle_count")
            .unwrap_or(160.0);
    let city_speed_avg = average(&[
        state
            .tsdb
            .latest_metric("traffic.central.avg_speed")
            .unwrap_or(34.0),
        state
            .tsdb
            .latest_metric("traffic.north.avg_speed")
            .unwrap_or(39.0),
        state
            .tsdb
            .latest_metric("traffic.south.avg_speed")
            .unwrap_or(32.0),
        state
            .tsdb
            .latest_metric("traffic.west.avg_speed")
            .unwrap_or(35.0),
    ]);
    let congestion_index = (100.0 - city_speed_avg).clamp(5.0, 100.0);
    let air_quality_index = average(&[
        state
            .tsdb
            .latest_metric("environment.central.co2")
            .unwrap_or(420.0)
            / 6.0,
        state
            .tsdb
            .latest_metric("environment.north.pm25")
            .unwrap_or(17.0)
            * 2.0,
        state
            .tsdb
            .latest_metric("environment.east.no2")
            .unwrap_or(22.0)
            * 1.4,
    ])
    .clamp(10.0, 250.0);
    let energy_demand_kw = average(&[
        state
            .tsdb
            .latest_metric("energy.central.consumption_kw")
            .unwrap_or(1_250.0),
        state
            .tsdb
            .latest_metric("energy.industrial.consumption_kw")
            .unwrap_or(1_980.0),
        state
            .tsdb
            .latest_metric("energy.south.consumption_kw")
            .unwrap_or(1_120.0),
    ]) * 3.0;
    let renewable_share = (state
        .tsdb
        .latest_metric("energy.central.solar_kw")
        .unwrap_or(350.0)
        / energy_demand_kw.max(1.0)
        * 100.0)
        .clamp(5.0, 95.0);
    let water_reservoir_level = state
        .tsdb
        .latest_metric("water.north.reservoir_level")
        .unwrap_or(68.0);
    let transport_occupancy = state
        .tsdb
        .latest_metric("transport.central.occupancy")
        .unwrap_or(0.63);
    let live = state.live_state.read().await;
    KpiSnapshot {
        vehicles_now: vehicles.max(0.0) as u64,
        city_speed_avg,
        congestion_index,
        air_quality_index,
        energy_demand_kw,
        renewable_share,
        active_alerts: live.active_alerts.len(),
        emergency_units: 18,
        transport_occupancy,
        water_reservoir_level,
    }
}

async fn run_tcp_ingest_listener(state: AppState) -> Result<(), String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], state.config.tcp_ingest_port));
    let listener = TcpListener::bind(addr).await.map_err(io_err)?;
    info!(address = %addr, "tcp ingest listener active");
    loop {
        let (socket, peer) = listener.accept().await.map_err(io_err)?;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_tcp_ingest_socket(socket, state).await {
                warn!(%peer, ?error, "tcp ingest client failed");
            }
        });
    }
}

async fn handle_tcp_ingest_socket(socket: TcpStream, state: AppState) -> Result<(), String> {
    let mut reader = BufReader::new(socket.into_std().map_err(io_err)?);
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader.read_line(&mut line).map_err(io_err)?;
        if read == 0 {
            break;
        }
        if line.trim().is_empty() {
            continue;
        }
        let frame: SensorFrame =
            serde_json::from_str(line.trim()).map_err(|error| error.to_string())?;
        state.metrics.ingest_tcp.fetch_add(1, Ordering::Relaxed);
        let _ = process_frame(state.clone(), frame, "tcp").await?;
    }
    Ok(())
}

async fn run_udp_ingest_listener(state: AppState) -> Result<(), String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], state.config.udp_ingest_port));
    let socket = UdpSocket::bind(addr).await.map_err(io_err)?;
    info!(address = %addr, "udp ingest listener active");
    let mut buf = [0_u8; 32 * 1024];
    loop {
        let (size, _) = socket.recv_from(&mut buf).await.map_err(io_err)?;
        let payload = std::str::from_utf8(&buf[..size]).map_err(|error| error.to_string())?;
        let frame: SensorFrame =
            serde_json::from_str(payload).map_err(|error| error.to_string())?;
        state.metrics.ingest_udp.fetch_add(1, Ordering::Relaxed);
        let _ = process_frame(state.clone(), frame, "udp").await?;
    }
}

async fn run_mqtt_listener(state: AppState) -> Result<(), String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], state.config.mqtt_port));
    let listener = TcpListener::bind(addr).await.map_err(io_err)?;
    info!(address = %addr, "mqtt listener active");
    loop {
        let (socket, peer) = listener.accept().await.map_err(io_err)?;
        let state = state.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_mqtt_client(socket, state).await {
                warn!(%peer, ?error, "mqtt client failed");
            }
        });
    }
}

async fn handle_mqtt_client(socket: TcpStream, state: AppState) -> Result<(), String> {
    let (mut reader, writer) = socket.into_split();
    let writer = Arc::new(tokio::sync::Mutex::new(writer));
    let subscriptions: Arc<RwLock<Vec<String>>> = Arc::new(RwLock::new(Vec::new()));
    let subscriptions_for_writer = subscriptions.clone();
    let writer_state = state.clone();
    let writer_socket = writer.clone();
    state.metrics.mqtt_clients.fetch_add(1, Ordering::Relaxed);

    let writer_task = tokio::spawn(async move {
        let mut rx = writer_state.broker.subscribe();
        while let Ok(record) = rx.recv().await {
            let filters = subscriptions_for_writer.read().await;
            if filters
                .iter()
                .any(|filter| mqtt_topic_match(filter, &record.topic))
            {
                let packet = mqtt_publish_packet(
                    &record.topic,
                    &serde_json::to_vec(&record.payload).unwrap_or_default(),
                    0,
                    None,
                );
                let mut guard = writer_socket.lock().await;
                if guard.write_all(&packet).await.is_err() {
                    break;
                }
            }
        }
    });

    let mut pending_qos2: HashMap<u16, SensorFrame> = HashMap::new();
    loop {
        let packet_type = match read_mqtt_packet(&mut reader).await {
            Ok(packet) => packet,
            Err(error) if error.contains("eof") => break,
            Err(error) => return Err(error),
        };
        match packet_type {
            MqttPacket::Connect => {
                let mut guard = writer.lock().await;
                guard
                    .write_all(&[0x20, 0x02, 0x00, 0x00])
                    .await
                    .map_err(io_err)?;
            }
            MqttPacket::Subscribe { packet_id, filters } => {
                let qos: Vec<u8> = filters.iter().map(|(_, qos)| *qos).collect();
                {
                    let mut guard = subscriptions.write().await;
                    for (filter, _) in filters {
                        guard.push(filter);
                    }
                }
                let suback = mqtt_suback_packet(packet_id, &qos);
                let mut guard = writer.lock().await;
                guard.write_all(&suback).await.map_err(io_err)?;
            }
            MqttPacket::Publish {
                topic,
                payload,
                qos,
                packet_id,
            } => {
                let frame = parse_transport_payload(&topic, &payload, "mqtt")?;
                state.metrics.ingest_mqtt.fetch_add(1, Ordering::Relaxed);
                match qos {
                    0 => {
                        let _ = process_frame(state.clone(), frame, "mqtt").await?;
                    }
                    1 => {
                        let _ = process_frame(state.clone(), frame, "mqtt").await?;
                        if let Some(packet_id) = packet_id {
                            let mut guard = writer.lock().await;
                            guard
                                .write_all(&[0x40, 0x02, (packet_id >> 8) as u8, packet_id as u8])
                                .await
                                .map_err(io_err)?;
                        }
                    }
                    2 => {
                        if let Some(packet_id) = packet_id {
                            pending_qos2.insert(packet_id, frame);
                            let mut guard = writer.lock().await;
                            guard
                                .write_all(&[0x50, 0x02, (packet_id >> 8) as u8, packet_id as u8])
                                .await
                                .map_err(io_err)?;
                        }
                    }
                    _ => {}
                }
            }
            MqttPacket::PubRel { packet_id } => {
                if let Some(frame) = pending_qos2.remove(&packet_id) {
                    let _ = process_frame(state.clone(), frame, "mqtt").await?;
                }
                let mut guard = writer.lock().await;
                guard
                    .write_all(&[0x70, 0x02, (packet_id >> 8) as u8, packet_id as u8])
                    .await
                    .map_err(io_err)?;
            }
            MqttPacket::PingReq => {
                let mut guard = writer.lock().await;
                guard.write_all(&[0xD0, 0x00]).await.map_err(io_err)?;
            }
            MqttPacket::Disconnect => break,
            MqttPacket::PubAck | MqttPacket::Other => {}
        }
    }

    writer_task.abort();
    state.metrics.mqtt_clients.fetch_sub(1, Ordering::Relaxed);
    Ok(())
}

enum MqttPacket {
    Connect,
    Subscribe {
        packet_id: u16,
        filters: Vec<(String, u8)>,
    },
    Publish {
        topic: String,
        payload: Vec<u8>,
        qos: u8,
        packet_id: Option<u16>,
    },
    PubRel {
        packet_id: u16,
    },
    PubAck,
    PingReq,
    Disconnect,
    Other,
}

async fn read_mqtt_packet(
    reader: &mut tokio::net::tcp::OwnedReadHalf,
) -> Result<MqttPacket, String> {
    let first = reader.read_u8().await.map_err(io_err)?;
    let packet_type = first >> 4;
    let flags = first & 0x0F;
    let remaining_length = read_mqtt_remaining_length(reader).await?;
    let mut payload = vec![0_u8; remaining_length as usize];
    reader.read_exact(&mut payload).await.map_err(io_err)?;
    match packet_type {
        1 => parse_mqtt_connect(&payload),
        3 => parse_mqtt_publish(flags, &payload),
        4 => Ok(MqttPacket::PubAck),
        6 => Ok(MqttPacket::PubRel {
            packet_id: u16::from_be_bytes([payload[0], payload[1]]),
        }),
        8 => parse_mqtt_subscribe(&payload),
        12 => Ok(MqttPacket::PingReq),
        14 => Ok(MqttPacket::Disconnect),
        _ => Ok(MqttPacket::Other),
    }
}

async fn read_mqtt_remaining_length(
    reader: &mut tokio::net::tcp::OwnedReadHalf,
) -> Result<u32, String> {
    let mut multiplier = 1_u32;
    let mut value = 0_u32;
    loop {
        let encoded = reader.read_u8().await.map_err(io_err)?;
        value += ((encoded & 127) as u32) * multiplier;
        if multiplier > 128 * 128 * 128 {
            return Err("mqtt remaining length too large".to_string());
        }
        if encoded & 128 == 0 {
            break;
        }
        multiplier *= 128;
    }
    Ok(value)
}

fn parse_mqtt_connect(payload: &[u8]) -> Result<MqttPacket, String> {
    let mut cursor = 0_usize;
    let protocol_name = read_mqtt_string(payload, &mut cursor)?;
    if protocol_name != "MQTT" && protocol_name != "MQIsdp" {
        return Err("unsupported mqtt protocol".to_string());
    }
    cursor += 1;
    cursor += 1;
    cursor += 2;
    let _client_id = read_mqtt_string(payload, &mut cursor)?;
    Ok(MqttPacket::Connect)
}

fn parse_mqtt_subscribe(payload: &[u8]) -> Result<MqttPacket, String> {
    let mut cursor = 0_usize;
    let packet_id = read_u16(payload, &mut cursor)?;
    let mut filters = Vec::new();
    while cursor < payload.len() {
        let filter = read_mqtt_string(payload, &mut cursor)?;
        if cursor >= payload.len() {
            break;
        }
        let qos = payload[cursor];
        cursor += 1;
        filters.push((filter, qos & 0x03));
    }
    Ok(MqttPacket::Subscribe { packet_id, filters })
}

fn parse_mqtt_publish(flags: u8, payload: &[u8]) -> Result<MqttPacket, String> {
    let qos = (flags & 0b0110) >> 1;
    let mut cursor = 0_usize;
    let topic = read_mqtt_string(payload, &mut cursor)?;
    let packet_id = if qos > 0 {
        Some(read_u16(payload, &mut cursor)?)
    } else {
        None
    };
    Ok(MqttPacket::Publish {
        topic,
        payload: payload[cursor..].to_vec(),
        qos,
        packet_id,
    })
}

fn read_mqtt_string(payload: &[u8], cursor: &mut usize) -> Result<String, String> {
    let length = read_u16(payload, cursor)? as usize;
    if *cursor + length > payload.len() {
        return Err("mqtt string out of bounds".to_string());
    }
    let out = std::str::from_utf8(&payload[*cursor..*cursor + length])
        .map_err(|error| error.to_string())?;
    *cursor += length;
    Ok(out.to_string())
}

fn read_u16(payload: &[u8], cursor: &mut usize) -> Result<u16, String> {
    if *cursor + 2 > payload.len() {
        return Err("buffer underflow".to_string());
    }
    let out = u16::from_be_bytes([payload[*cursor], payload[*cursor + 1]]);
    *cursor += 2;
    Ok(out)
}

fn mqtt_suback_packet(packet_id: u16, qos: &[u8]) -> Vec<u8> {
    let mut body = vec![(packet_id >> 8) as u8, packet_id as u8];
    body.extend(qos.iter().copied());
    let mut out = vec![0x90];
    out.extend(encode_mqtt_remaining_length(body.len() as u32));
    out.extend(body);
    out
}

fn mqtt_publish_packet(topic: &str, payload: &[u8], qos: u8, packet_id: Option<u16>) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend((topic.len() as u16).to_be_bytes());
    body.extend(topic.as_bytes());
    if qos > 0 {
        let id = packet_id.unwrap_or(1);
        body.extend(id.to_be_bytes());
    }
    body.extend(payload);
    let mut out = vec![0x30 | ((qos & 0x03) << 1)];
    out.extend(encode_mqtt_remaining_length(body.len() as u32));
    out.extend(body);
    out
}

fn encode_mqtt_remaining_length(mut value: u32) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut encoded = (value % 128) as u8;
        value /= 128;
        if value > 0 {
            encoded |= 128;
        }
        out.push(encoded);
        if value == 0 {
            break;
        }
    }
    out
}

fn mqtt_topic_match(filter: &str, topic: &str) -> bool {
    if filter == topic {
        return true;
    }
    let filter_parts: Vec<&str> = filter.split('/').collect();
    let topic_parts: Vec<&str> = topic.split('/').collect();
    let mut idx = 0_usize;
    while idx < filter_parts.len() {
        match filter_parts[idx] {
            "#" => return true,
            "+" => {}
            segment => {
                if topic_parts.get(idx).copied() != Some(segment) {
                    return false;
                }
            }
        }
        idx += 1;
    }
    filter_parts.len() == topic_parts.len()
}

async fn run_amqp_subset_listener(state: AppState) -> Result<(), String> {
    let addr = SocketAddr::from(([0, 0, 0, 0], state.config.amqp_port));
    let listener = TcpListener::bind(addr).await.map_err(io_err)?;
    info!(address = %addr, "amqp subset listener active");
    loop {
        let (mut socket, _) = listener.accept().await.map_err(io_err)?;
        let state = state.clone();
        tokio::spawn(async move {
            let mut preface = [0_u8; 8];
            if socket.read_exact(&mut preface).await.is_err() {
                return;
            }
            if &preface != b"AMQP\0\0\x09\x01" {
                let _ = socket
                    .write_all(b"NEUROVA AMQP SUBSET EXPECTS AMQP 0-9-1 PREFACE\n")
                    .await;
                return;
            }
            let _ = socket.write_all(b"NEUROVA-AMQP-SUBSET\n").await;
            let _ = socket
                .write_all(b"Use JSON lines: {\"action\":\"basic.publish\",\"topic\":\"traffic.central\",\"payload\":{...}}\n")
                .await;
            let mut buffer = vec![0_u8; 8 * 1024];
            loop {
                let read = match socket.read(&mut buffer).await {
                    Ok(0) | Err(_) => break,
                    Ok(read) => read,
                };
                let text = String::from_utf8_lossy(&buffer[..read]).to_string();
                for line in text.lines() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(command) = serde_json::from_str::<serde_json::Value>(line) {
                        if command.get("action").and_then(|value| value.as_str())
                            == Some("basic.publish")
                        {
                            if let Some(topic) =
                                command.get("topic").and_then(|value| value.as_str())
                            {
                                let payload_value = command
                                    .get("payload")
                                    .cloned()
                                    .unwrap_or(serde_json::json!({}));
                                if let Ok(frame) =
                                    serde_json::from_value::<SensorFrame>(payload_value)
                                {
                                    state.metrics.ingest_amqp.fetch_add(1, Ordering::Relaxed);
                                    let _ = process_frame(
                                        state.clone(),
                                        SensorFrame {
                                            topic: Some(topic.to_string()),
                                            ..frame
                                        },
                                        "amqp",
                                    )
                                    .await;
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}

fn parse_transport_payload(
    topic: &str,
    payload: &[u8],
    transport: &str,
) -> Result<SensorFrame, String> {
    if let Ok(frame) = serde_json::from_slice::<SensorFrame>(payload) {
        return Ok(frame);
    }
    let text = String::from_utf8(payload.to_vec()).map_err(|error| error.to_string())?;
    let metrics = BTreeMap::from([("value".to_string(), text.len() as f64)]);
    Ok(SensorFrame {
        id: new_event_id(),
        source_id: format!("{}-{}", transport, Uuid::new_v4().simple()),
        sensor_type: topic.split('.').next().unwrap_or("generic").to_string(),
        zone: topic.split('.').nth(1).unwrap_or("central").to_string(),
        location: None,
        observed_at: now_ms(),
        metrics,
        labels: BTreeMap::from([("payload".to_string(), text)]),
        severity: None,
        topic: Some(topic.to_string()),
    })
}

async fn run_synthetic_generator(state: AppState, sensors: usize) -> Result<(), String> {
    info!(sensors, "starting synthetic city generator");
    let mut tick = 0_u64;
    loop {
        tick += 1;
        for zone in zones() {
            let zone_scale = sensors / zones().len();
            let burst = zone_scale.min(64);
            for frame in generate_zone_frames(&zone, burst, tick, &state.topology) {
                let transport = if tick % 4 == 0 { "udp" } else { "internal" };
                let _ = process_frame(state.clone(), frame, transport).await?;
            }
        }
        tokio::time::sleep(Duration::from_millis(800)).await;
    }
}

async fn run_synthetic_sender(
    config: Config,
    topology: &CityTopology,
    sensors: usize,
) -> Result<(), String> {
    info!(sensors, "starting synthetic city sender");
    let socket = UdpSocket::bind(SocketAddr::from(([0, 0, 0, 0], 0)))
        .await
        .map_err(io_err)?;
    let target = SocketAddr::from(([127, 0, 0, 1], config.udp_ingest_port));
    let mut tick = 0_u64;
    loop {
        tick += 1;
        for zone in zones() {
            let zone_scale = sensors / zones().len();
            let burst = zone_scale.clamp(1, 64);
            for frame in generate_zone_frames(&zone, burst, tick, topology) {
                let payload = serde_json::to_vec(&frame).map_err(|error| error.to_string())?;
                socket.send_to(&payload, target).await.map_err(io_err)?;
            }
        }
        tokio::time::sleep(Duration::from_millis(800)).await;
    }
}

fn generate_zone_frames(
    zone: &str,
    count: usize,
    tick: u64,
    topology: &CityTopology,
) -> Vec<SensorFrame> {
    let mut rng = StdRng::seed_from_u64(tick + hash_str(zone) as u64);
    let district = topology
        .districts
        .iter()
        .find(|district| district.id == zone)
        .unwrap_or(&topology.districts[0]);
    let mut frames = Vec::new();
    for idx in 0..count {
        let traffic = 40.0
            + 20.0 * ((tick as f64 / 5.0) + idx as f64 * 0.1).sin().abs()
            + rng.gen_range(0.0..30.0);
        let speed = 65.0 - traffic * 0.4 + rng.gen_range(-5.0..5.0);
        let energy = 1_000.0 + traffic * 12.0 + rng.gen_range(0.0..180.0);
        let co2 = 390.0 + traffic * 2.0 + rng.gen_range(0.0..80.0);
        let pm25 = 8.0 + traffic * 0.08 + rng.gen_range(0.0..6.0);
        let water = 55.0 + 15.0 * ((tick as f64 / 9.0) + idx as f64 * 0.2).cos();
        let waste_fill = (20.0 + tick as f64 * 0.6 + idx as f64 * 1.5) % 100.0;

        frames.push(sensor_frame(
            format!("traffic-{}-{}", zone, idx),
            "traffic",
            zone,
            district,
            BTreeMap::from([
                ("vehicle_count".to_string(), traffic),
                ("avg_speed".to_string(), speed.max(5.0)),
                (
                    "lane_occupancy".to_string(),
                    (traffic / 100.0).clamp(0.0, 1.0),
                ),
            ]),
        ));
        frames.push(sensor_frame(
            format!("environment-{}-{}", zone, idx),
            "environment",
            zone,
            district,
            BTreeMap::from([
                ("co2".to_string(), co2),
                ("pm25".to_string(), pm25),
                ("no2".to_string(), 15.0 + traffic * 0.05),
                ("temperature".to_string(), 18.0 + hour_fraction() * 12.0),
            ]),
        ));
        frames.push(sensor_frame(
            format!("energy-{}-{}", zone, idx),
            "energy",
            zone,
            district,
            BTreeMap::from([
                ("consumption_kw".to_string(), energy),
                ("solar_kw".to_string(), 180.0 + (hour_fraction() * 350.0)),
                ("battery_level".to_string(), 45.0 + rng.gen_range(0.0..40.0)),
            ]),
        ));
        if idx < count / 3 {
            frames.push(sensor_frame(
                format!("water-{}-{}", zone, idx),
                "water",
                zone,
                district,
                BTreeMap::from([
                    ("reservoir_level".to_string(), water.clamp(10.0, 100.0)),
                    ("pressure".to_string(), 2.0 + rng.gen_range(0.0..2.5)),
                    ("ph".to_string(), 7.0 + rng.gen_range(-0.4..0.4)),
                ]),
            ));
            frames.push(sensor_frame(
                format!("waste-{}-{}", zone, idx),
                "waste",
                zone,
                district,
                BTreeMap::from([
                    ("fill_level".to_string(), waste_fill),
                    ("internal_temperature".to_string(), 18.0 + waste_fill * 0.08),
                ]),
            ));
            frames.push(sensor_frame(
                format!("transport-{}-{}", zone, idx),
                "transport",
                zone,
                district,
                BTreeMap::from([
                    ("occupancy".to_string(), (traffic / 120.0).clamp(0.0, 1.0)),
                    ("delay_min".to_string(), (traffic / 16.0).clamp(0.0, 18.0)),
                ]),
            ));
        }
    }
    frames
}

fn sensor_frame(
    source_id: String,
    sensor_type: &str,
    zone: &str,
    district: &District,
    metrics: BTreeMap<String, f64>,
) -> SensorFrame {
    SensorFrame {
        id: new_event_id(),
        source_id,
        sensor_type: sensor_type.to_string(),
        zone: zone.to_string(),
        location: Some(Location {
            lat: district.centroid[1] as f64 + rand::thread_rng().gen_range(-2.0..2.0),
            lon: district.centroid[0] as f64 + rand::thread_rng().gen_range(-2.0..2.0),
            street: Some(format!("{} axis", district.name)),
            asset_id: None,
        }),
        observed_at: now_ms(),
        metrics,
        labels: BTreeMap::new(),
        severity: None,
        topic: None,
    }
}

fn normalize_topic(frame: &SensorFrame) -> String {
    frame
        .topic
        .clone()
        .unwrap_or_else(|| format!("{}.{}", frame.sensor_type, frame.zone))
}

fn severity_for(frame: &SensorFrame, anomaly: f64) -> String {
    if anomaly > 1.2 || frame.metrics.values().any(|value| *value > 900.0) {
        "critical".to_string()
    } else if anomaly > 0.8 {
        "high".to_string()
    } else {
        "medium".to_string()
    }
}

fn incident_label(frame: &SensorFrame) -> usize {
    match frame.sensor_type.as_str() {
        "traffic" => 0,
        "energy" => 1,
        "water" => 2,
        _ => 3,
    }
}

fn default_rules() -> Vec<String> {
    let mut rules = vec![
        r#"WHEN metric("reservoir_level","water.north") < 20 THEN activate("pump.reserve"), alert("Reserva de agua activada") PRIORITY 95"#.to_string(),
        r#"WHEN window_avg("co2","environment.central","30s") > 800 THEN alert("Pico de contaminacion"), publish("citizen.alerts") PRIORITY 90"#.to_string(),
        r#"WHEN metric("vehicle_count","traffic.central") > 90 THEN activate("signal.priority.central"), alert("Congestion severa centro") PRIORITY 88"#.to_string(),
        r#"WHEN metric("fill_level","waste.west") > 85 THEN activate("waste.route.west"), alert("Recogida urgente oeste") PRIORITY 82"#.to_string(),
        r#"WHEN metric("consumption_kw","energy.industrial") > 1800 THEN activate("energy.redispatch"), alert("Sobrecarga energetica industrial") PRIORITY 86"#.to_string(),
        r#"WHEN metric("occupancy","transport.central") > 0.85 THEN alert("Transporte publico saturado") PRIORITY 70"#.to_string(),
    ];
    for zone in zones() {
        rules.push(format!(
            r#"WHEN metric("vehicle_count","traffic.{zone}") > 70 THEN activate("signal.priority.{zone}"), alert("Carga alta de trafico {zone}") PRIORITY 75"#
        ));
        rules.push(format!(
            r#"WHEN metric("co2","environment.{zone}") > 620 THEN alert("CO2 alto en {zone}"), publish("citizen.alerts") PRIORITY 72"#
        ));
        rules.push(format!(
            r#"WHEN metric("consumption_kw","energy.{zone}") > 1600 THEN activate("energy.balance.{zone}"), alert("Demanda alta de energia {zone}") PRIORITY 68"#
        ));
        rules.push(format!(
            r#"WHEN metric("fill_level","waste.{zone}") > 78 THEN activate("waste.route.{zone}"), alert("Contenedores altos {zone}") PRIORITY 66"#
        ));
        rules.push(format!(
            r#"WHEN metric("reservoir_level","water.{zone}") < 35 THEN activate("water.protect.{zone}"), alert("Reserva baja de agua {zone}") PRIORITY 80"#
        ));
        rules.push(format!(
            r#"WHEN metric("occupancy","transport.{zone}") > 0.7 THEN alert("Alta ocupacion transporte {zone}") PRIORITY 60"#
        ));
    }
    rules.truncate(DEFAULT_RULE_COUNT);
    rules
}

fn zones() -> Vec<String> {
    vec![
        "north".to_string(),
        "south".to_string(),
        "east".to_string(),
        "west".to_string(),
        "central".to_string(),
        "industrial".to_string(),
        "harbor".to_string(),
        "campus".to_string(),
    ]
}

fn default_stop_etas() -> Vec<StopEta> {
    vec![
        StopEta {
            line: "L1".to_string(),
            stop: "Central".to_string(),
            minutes: 3,
            occupancy: 0.62,
        },
        StopEta {
            line: "L3".to_string(),
            stop: "Norte".to_string(),
            minutes: 6,
            occupancy: 0.54,
        },
        StopEta {
            line: "L7".to_string(),
            stop: "Puerto".to_string(),
            minutes: 9,
            occupancy: 0.71,
        },
    ]
}

fn synthesize_stop_etas(frames: &HashMap<String, SensorFrame>) -> Vec<StopEta> {
    let transport: Vec<&SensorFrame> = frames
        .values()
        .filter(|frame| frame.sensor_type == "transport")
        .take(6)
        .collect();
    if transport.is_empty() {
        return default_stop_etas();
    }
    transport
        .iter()
        .enumerate()
        .map(|(idx, frame)| StopEta {
            line: format!("L{}", idx + 1),
            stop: capitalize(&frame.zone),
            minutes: (frame.metrics.get("delay_min").copied().unwrap_or(2.0) as u32).max(1),
            occupancy: frame.metrics.get("occupancy").copied().unwrap_or(0.5),
        })
        .collect()
}

fn auth_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(ToString::to_string)
}

fn append_json_line<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(io_err)?;
    let line = serde_json::to_string(value).map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes()).map_err(io_err)?;
    file.write_all(b"\n").map_err(io_err)
}

fn sanitize_topic(topic: &str) -> String {
    topic.replace('/', "_").replace('.', "_")
}

fn hash_partition(value: &str, partition_count: u32) -> u32 {
    if partition_count == 0 {
        return 0;
    }
    (hash_str(value) % partition_count as u64) as u32
}

fn hash_str(value: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn gorilla_estimate(points: &[TimeSeriesPoint]) -> usize {
    if points.is_empty() {
        return 0;
    }
    let mut bits = 64 + 14;
    let mut prev_delta = 0_i64;
    let mut prev_value = points[0].value.to_bits();
    for idx in 1..points.len() {
        let delta = points[idx].timestamp as i64 - points[idx - 1].timestamp as i64;
        let delta_of_delta = delta - prev_delta;
        bits += match delta_of_delta {
            0 => 1,
            -63..=64 => 9,
            -255..=256 => 12,
            -2047..=2048 => 16,
            _ => 36,
        };
        prev_delta = delta;
        let xor = prev_value ^ points[idx].value.to_bits();
        bits += if xor == 0 {
            1
        } else {
            let leading = xor.leading_zeros().min(31);
            let trailing = xor.trailing_zeros().min(31);
            2 + 5 + 6 + (64 - leading - trailing) as usize
        };
        prev_value = points[idx].value.to_bits();
    }
    bits.div_ceil(8)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_millis() as u64
}

fn new_event_id() -> String {
    format!("evt-{}", Uuid::new_v4().simple())
}

fn sha256_hex(value: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    format!("{:x}", digest.finalize())
}

fn io_err(error: impl ToString) -> String {
    error.to_string()
}

fn sql_err(error: impl ToString) -> String {
    error.to_string()
}

fn dot(left: &[f64], right: &[f64]) -> f64 {
    left.iter().zip(right.iter()).map(|(a, b)| a * b).sum()
}

fn softmax(logits: &[f64]) -> Vec<f64> {
    let max = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let exp: Vec<f64> = logits.iter().map(|value| (value - max).exp()).collect();
    let total = exp.iter().sum::<f64>().max(1e-9);
    exp.iter().map(|value| value / total).collect()
}

fn sigmoid(value: f64) -> f64 {
    1.0 / (1.0 + (-value).exp())
}

fn average(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len().max(1) as f64
}

fn bucket(value: f64, cuts: &[f64]) -> usize {
    cuts.iter()
        .position(|cut| value < *cut)
        .unwrap_or(cuts.len())
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => String::new(),
    }
}

fn hour_fraction() -> f64 {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
        % 86_400;
    seconds as f64 / 86_400.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rule_dsl() {
        let rule = RuleDefinition::parse(
            "rule-1",
            r#"WHEN window_avg("co2","environment.central","30s") > 800 THEN alert("Pico de contaminacion"), publish("citizen.alerts") PRIORITY 90"#,
        )
        .expect("rule should parse");
        assert_eq!(rule.priority, 90);
        assert_eq!(rule.actions.len(), 2);
    }

    #[test]
    fn mqtt_filter_matching_supports_wildcards() {
        assert!(mqtt_topic_match("traffic/+/speed", "traffic/central/speed"));
        assert!(mqtt_topic_match("traffic/#", "traffic/central/speed"));
        assert!(!mqtt_topic_match(
            "traffic/+/speed",
            "traffic/central/count"
        ));
    }

    #[test]
    fn gorilla_estimation_produces_bytes() {
        let series = vec![
            TimeSeriesPoint {
                series_key: "a".into(),
                timestamp: 1_000,
                value: 10.0,
                quality: 1.0,
            },
            TimeSeriesPoint {
                series_key: "a".into(),
                timestamp: 2_000,
                value: 10.5,
                quality: 1.0,
            },
            TimeSeriesPoint {
                series_key: "a".into(),
                timestamp: 3_000,
                value: 10.75,
                quality: 1.0,
            },
        ];
        assert!(gorilla_estimate(&series) > 0);
    }
}

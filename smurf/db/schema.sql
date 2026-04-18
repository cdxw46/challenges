PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    email TEXT,
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS extensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    secret TEXT NOT NULL,
    email TEXT,
    voicemail_pin TEXT,
    voicemail_enabled INTEGER NOT NULL DEFAULT 1,
    forward_busy TEXT,
    forward_no_answer TEXT,
    forward_unconditional TEXT,
    do_not_disturb INTEGER NOT NULL DEFAULT 0,
    record_calls INTEGER NOT NULL DEFAULT 0,
    max_concurrent INTEGER NOT NULL DEFAULT 2,
    presence TEXT NOT NULL DEFAULT 'available',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension TEXT NOT NULL,
    contact TEXT NOT NULL,
    transport TEXT NOT NULL,
    source_ip TEXT NOT NULL,
    source_port INTEGER NOT NULL,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    call_id TEXT,
    cseq INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_extension ON registrations(extension);

CREATE TABLE IF NOT EXISTS trunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    host TEXT NOT NULL,
    port INTEGER NOT NULL DEFAULT 5060,
    transport TEXT NOT NULL DEFAULT 'udp',
    username TEXT,
    secret TEXT,
    auth_mode TEXT NOT NULL DEFAULT 'credentials',
    register INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 10,
    caller_id TEXT,
    from_user TEXT,
    from_domain TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dialplan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'outbound',
    pattern TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    strip INTEGER NOT NULL DEFAULT 0,
    prepend TEXT,
    priority INTEGER NOT NULL DEFAULT 10,
    enabled INTEGER NOT NULL DEFAULT 1,
    schedule_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dialplan_direction ON dialplan(direction, priority);

CREATE TABLE IF NOT EXISTS ring_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT 'ringall',
    members TEXT NOT NULL DEFAULT '[]',
    timeout INTEGER NOT NULL DEFAULT 30,
    fail_target TEXT
);

CREATE TABLE IF NOT EXISTS queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    strategy TEXT NOT NULL DEFAULT 'roundrobin',
    members TEXT NOT NULL DEFAULT '[]',
    max_wait INTEGER NOT NULL DEFAULT 300,
    moh TEXT,
    timeout TEXT,
    announce_position INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ivrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    greeting TEXT,
    timeout INTEGER NOT NULL DEFAULT 5,
    invalid_target TEXT,
    timeout_target TEXT,
    options TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    rules TEXT NOT NULL,
    in_hours_action TEXT,
    in_hours_target TEXT,
    out_of_hours_action TEXT,
    out_of_hours_target TEXT
);

CREATE TABLE IF NOT EXISTS dids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    description TEXT,
    target_action TEXT NOT NULL DEFAULT 'extension',
    target_value TEXT NOT NULL,
    schedule_id INTEGER
);

CREATE TABLE IF NOT EXISTS cdr (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    direction TEXT NOT NULL,
    src TEXT NOT NULL,
    dst TEXT NOT NULL,
    src_name TEXT,
    src_ip TEXT,
    started_at TEXT NOT NULL,
    answered_at TEXT,
    ended_at TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    billsec INTEGER NOT NULL DEFAULT 0,
    disposition TEXT NOT NULL DEFAULT 'NO ANSWER',
    hangup_cause TEXT,
    trunk TEXT,
    recording_path TEXT
);
CREATE INDEX IF NOT EXISTS idx_cdr_started ON cdr(started_at);
CREATE INDEX IF NOT EXISTS idx_cdr_callid ON cdr(call_id);

CREATE TABLE IF NOT EXISTS voicemail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    extension TEXT NOT NULL,
    caller TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vm_ext ON voicemail(extension);

CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 0,
    src TEXT,
    dst TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    body TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient);

CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE NOT NULL,
    reason TEXT,
    until TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conference_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    pin TEXT,
    moderator_pin TEXT,
    record INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parking_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT UNIQUE NOT NULL,
    slot_start INTEGER NOT NULL DEFAULT 7000,
    slot_end INTEGER NOT NULL DEFAULT 7019,
    timeout INTEGER NOT NULL DEFAULT 60,
    fallback TEXT
);

CREATE TABLE IF NOT EXISTS provisioning_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT UNIQUE NOT NULL,
    vendor TEXT NOT NULL,
    model TEXT,
    extension TEXT,
    description TEXT,
    last_seen TEXT,
    template TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    action TEXT NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL,
    secret TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
);

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class SmurfConfig:
    app_name: str = "SMURF"
    domain: str = "smurf.local"
    bind_host: str = "127.0.0.1"
    public_host: str = "127.0.0.1"
    sip_port: int = 5060
    sip_tls_port: int = 5061
    web_port: int = 5001
    media_port_start: int = 30000
    media_port_end: int = 30100
    runtime_dir: Path = Path("runtime")
    static_dir: Path = Path("src/smurf/static")
    db_path: Path = Path("runtime/smurf.db")
    log_path: Path = Path("runtime/smurf.log")
    tls_cert_path: Path = Path("runtime/tls/server.crt")
    tls_key_path: Path = Path("runtime/tls/server.key")
    admin_username: str = "admin"
    admin_password: str = "admin123!"
    admin_totp_secret: str = "JBSWY3DPEHPK3PXP"
    default_realm: str = "smurf.local"
    jwt_secret: str = "smurf-dev-secret"
    registration_ttl: int = 300
    event_snapshot_interval: float = 2.0

    @classmethod
    def from_env(cls, root: Path) -> "SmurfConfig":
        runtime_dir = Path(os.getenv("SMURF_RUNTIME_DIR", str(root / "runtime")))
        static_dir = Path(os.getenv("SMURF_STATIC_DIR", str(root / "src/smurf/static")))
        db_path = Path(os.getenv("SMURF_DB_PATH", str(runtime_dir / "smurf.db")))
        log_path = Path(os.getenv("SMURF_LOG_PATH", str(runtime_dir / "smurf.log")))
        tls_dir = runtime_dir / "tls"
        cfg = cls(
            domain=os.getenv("SMURF_DOMAIN", "smurf.local"),
            bind_host=os.getenv("SMURF_BIND_HOST", "127.0.0.1"),
            public_host=os.getenv("SMURF_PUBLIC_HOST", os.getenv("SMURF_BIND_HOST", "127.0.0.1")),
            sip_port=int(os.getenv("SMURF_SIP_PORT", "5060")),
            sip_tls_port=int(os.getenv("SMURF_SIP_TLS_PORT", "5061")),
            web_port=int(os.getenv("SMURF_WEB_PORT", "5001")),
            media_port_start=int(os.getenv("SMURF_MEDIA_START", "30000")),
            media_port_end=int(os.getenv("SMURF_MEDIA_END", "30100")),
            runtime_dir=runtime_dir,
            static_dir=static_dir,
            db_path=db_path,
            log_path=log_path,
            tls_cert_path=Path(os.getenv("SMURF_TLS_CERT", str(tls_dir / "server.crt"))),
            tls_key_path=Path(os.getenv("SMURF_TLS_KEY", str(tls_dir / "server.key"))),
            admin_username=os.getenv("SMURF_ADMIN_USER", "admin"),
            admin_password=os.getenv("SMURF_ADMIN_PASS", "admin123!"),
            admin_totp_secret=os.getenv("SMURF_ADMIN_TOTP_SECRET", "JBSWY3DPEHPK3PXP"),
            default_realm=os.getenv("SMURF_REALM", os.getenv("SMURF_DOMAIN", "smurf.local")),
            jwt_secret=os.getenv("SMURF_JWT_SECRET", "smurf-dev-secret"),
            registration_ttl=int(os.getenv("SMURF_REGISTRATION_TTL", "300")),
            event_snapshot_interval=float(os.getenv("SMURF_SNAPSHOT_INTERVAL", "2.0")),
        )
        cfg.ensure_paths()
        return cfg

    def ensure_paths(self) -> None:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.tls_cert_path.parent.mkdir(parents=True, exist_ok=True)
        self.static_dir.mkdir(parents=True, exist_ok=True)


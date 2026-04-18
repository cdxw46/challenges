from __future__ import annotations

import asyncio
import json
import ssl
from http import HTTPStatus
from urllib.parse import parse_qs, urlparse

from .pbx import PbxEngine
from .security import current_totp, decode_jwt, issue_jwt, verify_totp


INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SMURF Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; }
    .hidden { display: none; }
    input, button, select, textarea { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0b1220; color: #e2e8f0; }
    button { background: #2563eb; border-color: #2563eb; cursor: pointer; font-weight: bold; }
    h1, h2, h3 { margin-top: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #1f2937; }
    pre { white-space: pre-wrap; word-break: break-word; background: #020617; padding: 12px; border-radius: 8px; }
    .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrap">
    <div id="login-card" class="card">
      <h1>SMURF Admin</h1>
      <p class="muted">PBX control plane over HTTPS with 2FA.</p>
      <div class="row">
        <div><label>Username</label><input id="username" value="admin" /></div>
        <div><label>Password</label><input id="password" type="password" value="admin123!" /></div>
        <div><label>TOTP</label><input id="totp" placeholder="6 digits" /></div>
      </div>
      <p class="muted">Default test TOTP secret: <code>JBSWY3DPEHPK3PXP</code>.</p>
      <button id="login-btn">Login</button>
      <pre id="login-status"></pre>
    </div>

    <div id="app" class="hidden">
      <h1>SMURF Dashboard</h1>
      <div class="grid" id="kpi-grid"></div>

      <div class="card">
        <h2>Create extension</h2>
        <div class="row">
          <div><input id="new-ext" placeholder="Extension" /></div>
          <div><input id="new-name" placeholder="Display name" /></div>
          <div><input id="new-pass" placeholder="Password" /></div>
          <div><input id="new-pin" placeholder="PIN" /></div>
        </div>
        <button id="create-ext-btn">Create</button>
      </div>

      <div class="card">
        <h2>Extensions</h2>
        <table id="extensions-table"></table>
      </div>

      <div class="card">
        <h2>Registrations</h2>
        <table id="registrations-table"></table>
      </div>

      <div class="card">
        <h2>Calls</h2>
        <table id="calls-table"></table>
      </div>

      <div class="card">
        <h2>Send chat message</h2>
        <div class="row">
          <div><input id="msg-src" value="1000" /></div>
          <div><input id="msg-dst" value="1001" /></div>
          <div><input id="msg-body" value="Hola desde SMURF" /></div>
        </div>
        <button id="send-msg-btn">Send message</button>
      </div>

      <div class="card">
        <h2>Recent events</h2>
        <pre id="events"></pre>
      </div>
    </div>
  </div>

  <script>
    let token = "";

    async function api(path, options = {}) {
      const headers = options.headers || {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
      const response = await fetch(path, { ...options, headers });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
      if (!response.ok) throw new Error(payload.error || response.statusText || "Request failed");
      return payload;
    }

    function renderTable(el, rows, columns) {
      let html = "<tr>" + columns.map(c => `<th>${c}</th>`).join("") + "</tr>";
      for (const row of rows) {
        html += "<tr>" + columns.map(c => `<td>${row[c] ?? ""}</td>`).join("") + "</tr>";
      }
      el.innerHTML = html;
    }

    function renderKpis(kpis) {
      const grid = document.getElementById("kpi-grid");
      grid.innerHTML = Object.entries(kpis).map(([k, v]) => `<div class="card"><h3>${k}</h3><div>${v}</div></div>`).join("");
    }

    async function refresh() {
      const snapshot = await api("/api/dashboard");
      renderKpis(snapshot.kpis);
      renderTable(document.getElementById("extensions-table"), snapshot.extensions, ["extension","display_name","presence","role","call_limit"]);
      renderTable(document.getElementById("registrations-table"), snapshot.registrations, ["extension","transport","source_addr","contact_uri","connection_id"]);
      renderTable(document.getElementById("calls-table"), snapshot.calls, ["call_id","from_extension","to_extension","state","rtp_a_port","rtp_b_port"]);
      document.getElementById("events").textContent = JSON.stringify(snapshot.events, null, 2);
    }

    function startEvents() {
      const source = new EventSource("/events");
      source.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const el = document.getElementById("events");
        const current = el.textContent ? JSON.parse(el.textContent) : [];
        current.unshift(data);
        el.textContent = JSON.stringify(current.slice(0, 50), null, 2);
        refresh().catch(console.error);
      };
    }

    document.getElementById("login-btn").onclick = async () => {
      const payload = {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
        totp: document.getElementById("totp").value,
      };
      try {
        const result = await api("/api/login", { method: "POST", body: JSON.stringify(payload) });
        token = result.token;
        document.getElementById("login-status").textContent = "Login OK";
        document.getElementById("login-card").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        await refresh();
        startEvents();
      } catch (error) {
        document.getElementById("login-status").textContent = String(error);
      }
    };

    document.getElementById("create-ext-btn").onclick = async () => {
      const payload = {
        extension: document.getElementById("new-ext").value,
        display_name: document.getElementById("new-name").value,
        password: document.getElementById("new-pass").value,
        pin: document.getElementById("new-pin").value,
      };
      await api("/api/extensions", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
    };

    document.getElementById("send-msg-btn").onclick = async () => {
      const payload = {
        source_extension: document.getElementById("msg-src").value,
        target_extension: document.getElementById("msg-dst").value,
        body: document.getElementById("msg-body").value,
      };
      await api("/api/messages", { method: "POST", body: JSON.stringify(payload) });
      await refresh();
    };
  </script>
</body>
</html>
"""


class WebApp:
    def __init__(self, engine: PbxEngine) -> None:
        self.engine = engine
        self.server: asyncio.AbstractServer | None = None
        self.ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        self.ssl_context.load_cert_chain(
            engine.config.tls_cert_path,
            engine.config.tls_key_path,
        )

    async def start(self) -> None:
        self.server = await asyncio.start_server(
            self._handle_client,
            host=self.engine.config.bind_host,
            port=self.engine.config.web_port,
            ssl=self.ssl_context,
        )
        self.engine.logger.info(
            "web_started",
            web_port=self.engine.config.web_port,
        )

    async def stop(self) -> None:
        if self.server is not None:
            self.server.close()
            await self.server.wait_closed()

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        try:
            request = await self._read_request(reader)
            if request is None:
                writer.close()
                await writer.wait_closed()
                return
            response = await self._dispatch(request)
            writer.write(response)
            await writer.drain()
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def _read_request(self, reader: asyncio.StreamReader) -> dict[str, object] | None:
        header_data = await reader.readuntil(b"\r\n\r\n")
        header_text = header_data.decode("utf-8", errors="replace")
        lines = header_text.split("\r\n")
        if not lines or not lines[0]:
            return None
        method, target, version = lines[0].split(" ", 2)
        headers: dict[str, str] = {}
        for line in lines[1:]:
            if not line:
                continue
            if ":" not in line:
                continue
            name, value = line.split(":", 1)
            headers[name.strip().lower()] = value.strip()
        body = b""
        content_length = int(headers.get("content-length", "0") or "0")
        if content_length:
            body = await reader.readexactly(content_length)
        return {
            "method": method,
            "target": target,
            "version": version,
            "headers": headers,
            "body": body,
        }

    async def _dispatch(self, request: dict[str, object]) -> bytes:
        method = str(request["method"])
        target = str(request["target"])
        headers = request["headers"]  # type: ignore[assignment]
        body = request["body"]  # type: ignore[assignment]
        parsed = urlparse(target)

        if method == "GET" and parsed.path == "/":
            return self._html_response(INDEX_HTML)
        if method == "GET" and parsed.path == "/healthz":
            return self._json_response({"status": "ok"})
        if method == "GET" and parsed.path == "/api/totp":
            return self._json_response({"totp": current_totp(self.engine.config.admin_totp_secret)})
        if method == "POST" and parsed.path == "/api/login":
            payload = self._json_body(body)
            admin = self.engine.authenticate_admin(
                str(payload.get("username", "")),
                str(payload.get("password", "")),
            )
            if admin is None:
                return self._json_response({"error": "invalid credentials"}, status=HTTPStatus.UNAUTHORIZED)
            if not verify_totp(str(admin["totp_secret"]), str(payload.get("totp", ""))):
                return self._json_response({"error": "invalid totp"}, status=HTTPStatus.UNAUTHORIZED)
            token = issue_jwt(
                subject=str(admin["username"]),
                role=str(admin["role"]),
                secret=self.engine.config.jwt_secret,
                ttl_seconds=7200,
            )
            return self._json_response({"token": token})

        if method == "GET" and parsed.path == "/events":
            return await self._sse_response(headers)

        claims = self._require_auth(headers)
        if claims is None:
            return self._json_response({"error": "unauthorized"}, status=HTTPStatus.UNAUTHORIZED)

        if method == "GET" and parsed.path == "/api/dashboard":
            return self._json_response(self.engine.dashboard_snapshot())
        if method == "GET" and parsed.path == "/api/extensions":
            return self._json_response(self.engine.dashboard_snapshot()["extensions"])
        if method == "POST" and parsed.path == "/api/extensions":
            payload = self._json_body(body)
            created = self.engine.create_extension(payload)
            await self.engine.publish_event("admin", "extension_created", {"extension": created.get("extension", "")})
            return self._json_response(created, status=HTTPStatus.CREATED)
        if method == "POST" and parsed.path == "/api/messages":
            payload = self._json_body(body)
            self.engine.send_message(
                str(payload.get("source_extension", "")),
                str(payload.get("target_extension", "")),
                str(payload.get("body", "")),
            )
            await self.engine.publish_event("chat", "message_stored", payload)
            return self._json_response({"status": "stored"})
        if method == "POST" and parsed.path.startswith("/api/presence/"):
            extension = parsed.path.rsplit("/", 1)[-1]
            payload = self._json_body(body)
            presence = str(payload.get("presence", "available"))
            self.engine.set_presence(extension, presence)
            await self.engine.publish_event("presence", "updated", {"extension": extension, "presence": presence})
            return self._json_response({"status": "updated"})
        if method == "GET" and parsed.path == "/api/messages":
            query = parse_qs(parsed.query)
            extension = query.get("extension", [""])[0] or None
            return self._json_response(self.engine.store.list_messages(extension=extension, limit=100))

        return self._json_response({"error": "not found"}, status=HTTPStatus.NOT_FOUND)

    def _require_auth(self, headers: dict[str, str]) -> dict[str, object] | None:
        authorization = headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            return None
        token = authorization.split(" ", 1)[1]
        try:
            return decode_jwt(token, self.engine.config.jwt_secret)
        except Exception:
            return None

    def _json_body(self, body: bytes) -> dict[str, object]:
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    async def _sse_response(self, headers: dict[str, str]) -> bytes:
        if headers.get("accept", "").lower().find("text/event-stream") < 0:
            return self._json_response({"error": "event-stream required"}, status=HTTPStatus.BAD_REQUEST)
        queue = self.engine.subscribe_events()
        try:
            event = await asyncio.wait_for(queue.get(), timeout=self.engine.config.event_snapshot_interval)
        except asyncio.TimeoutError:
            event = {"ts": 0, "category": "heartbeat", "message": "idle", "payload": {}}
        finally:
            self.engine.unsubscribe_events(queue)
        body = f"data: {json.dumps(event, separators=(',', ':'))}\n\n"
        return self._raw_response(
            HTTPStatus.OK,
            body.encode("utf-8"),
            content_type="text/event-stream; charset=utf-8",
            extra_headers=[("Cache-Control", "no-cache")],
        )

    def _json_response(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> bytes:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        return self._raw_response(status, body, content_type="application/json; charset=utf-8")

    def _html_response(self, html: str, status: HTTPStatus = HTTPStatus.OK) -> bytes:
        return self._raw_response(status, html.encode("utf-8"), content_type="text/html; charset=utf-8")

    def _raw_response(
        self,
        status: HTTPStatus,
        body: bytes,
        *,
        content_type: str,
        extra_headers: list[tuple[str, str]] | None = None,
    ) -> bytes:
        headers = [
            ("Content-Type", content_type),
            ("Content-Length", str(len(body))),
            ("Connection", "close"),
            ("Server", "SMURF"),
        ]
        if extra_headers:
            headers.extend(extra_headers)
        header_block = "".join(f"{name}: {value}\r\n" for name, value in headers)
        return f"HTTP/1.1 {status.value} {status.phrase}\r\n{header_block}\r\n".encode("utf-8") + body

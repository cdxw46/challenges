from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True)
class SipUri:
    scheme: str
    user: str
    host: str
    port: int | None = None
    params: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    display_name: str = ""

    def canonical_aor(self) -> str:
        return f"{self.user}@{self.host}"

    def hostport(self) -> str:
        return self.host if self.port is None else f"{self.host}:{self.port}"

    def to_uri(self) -> str:
        params = "".join(
            f";{key}={value}" if value else f";{key}"
            for key, value in self.params.items()
        )
        headers = ""
        if self.headers:
            headers = "?" + "&".join(f"{key}={value}" for key, value in self.headers.items())
        return f"{self.scheme}:{self.user}@{self.hostport()}{params}{headers}"


@dataclass(slots=True)
class Registration:
    extension: str
    contact_uri: str
    transport: str
    source_addr: str
    expires_at: float
    connection_id: str = ""
    user_agent: str = ""
    instance_id: str = ""
    via_branch: str = ""


@dataclass(slots=True)
class Extension:
    extension: str
    display_name: str
    password_hash: str
    pin_hash: str
    digest_md5: str
    digest_sha256: str
    enabled: bool
    presence: str
    call_limit: int
    voicemail_enabled: bool
    role: str = "user"
    email: str = ""


@dataclass(slots=True)
class CallRecord:
    call_id: str
    from_extension: str
    to_extension: str
    state: str
    started_at: float
    answered_at: float | None = None
    ended_at: float | None = None
    duration_seconds: int = 0
    rtp_a_port: int = 0
    rtp_b_port: int = 0
    recording_path: str = ""


@dataclass(slots=True)
class ActiveCall:
    call_id: str
    from_extension: str
    to_extension: str
    state: str
    created_at: float
    updated_at: float
    caller_uri: SipUri
    callee_uri: SipUri
    from_tag: str
    to_tag: str | None = None
    invite_cseq: int = 1
    caller_contact: str = ""
    callee_contact: str = ""
    caller_transport: str = "udp"
    callee_transport: str = "udp"
    caller_sdp: str | None = None
    callee_sdp: str | None = None
    caller_media_host: str | None = None
    caller_media_port: int | None = None
    callee_media_host: str | None = None
    callee_media_port: int | None = None
    relay_port_a: int | None = None
    relay_port_b: int | None = None
    record_route: str = ""
    caller_endpoint: Any | None = None
    callee_endpoint: Any | None = None
    caller_invite: SipMessage | None = None
    callee_invite: SipMessage | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SipMessage:
    start_line: str
    headers: list[tuple[str, str]]
    body: bytes = b""

    @property
    def is_request(self) -> bool:
        return not self.start_line.startswith("SIP/2.0 ")

    @property
    def method(self) -> str:
        if not self.is_request:
            raise ValueError("Response message has no method")
        return self.start_line.split()[0]

    @property
    def request_uri(self) -> str:
        if not self.is_request:
            raise ValueError("Response message has no request URI")
        return self.start_line.split()[1]

    @property
    def status_code(self) -> int:
        if self.is_request:
            raise ValueError("Request message has no status code")
        return int(self.start_line.split()[1])

    @property
    def reason(self) -> str:
        if self.is_request:
            raise ValueError("Request message has no reason phrase")
        parts = self.start_line.split(" ", 2)
        return parts[2] if len(parts) > 2 else ""

    def header(self, name: str, default: str = "") -> str:
        name_lower = name.lower()
        for header_name, header_value in self.headers:
            if header_name.lower() == name_lower:
                return header_value
        return default

    def headers_named(self, name: str) -> list[str]:
        name_lower = name.lower()
        return [value for header_name, value in self.headers if header_name.lower() == name_lower]

    def with_header(self, name: str, value: str) -> "SipMessage":
        return SipMessage(self.start_line, [*self.headers, (name, value)], self.body)

    def replace_header(self, name: str, value: str) -> None:
        name_lower = name.lower()
        replaced = False
        new_headers: list[tuple[str, str]] = []
        for header_name, header_value in self.headers:
            if not replaced and header_name.lower() == name_lower:
                new_headers.append((header_name, value))
                replaced = True
            else:
                new_headers.append((header_name, header_value))
        if not replaced:
            new_headers.append((name, value))
        self.headers = new_headers

    def remove_header(self, name: str) -> None:
        name_lower = name.lower()
        self.headers = [
            (header_name, header_value)
            for header_name, header_value in self.headers
            if header_name.lower() != name_lower
        ]

    def to_bytes(self) -> bytes:
        headers = list(self.headers)
        if self.body:
            content_length = str(len(self.body))
        else:
            content_length = "0"
        found = False
        rendered_headers: list[str] = []
        for name, value in headers:
            if name.lower() == "content-length":
                value = content_length
                found = True
            rendered_headers.append(f"{name}: {value}")
        if not found:
            rendered_headers.append(f"Content-Length: {content_length}")
        payload = self.start_line + "\r\n" + "\r\n".join(rendered_headers) + "\r\n\r\n"
        return payload.encode("utf-8") + self.body


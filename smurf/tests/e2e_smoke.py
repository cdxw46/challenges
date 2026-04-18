from __future__ import annotations

import asyncio
import json
import os
import shutil
import socket
import ssl
import struct
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from smurf.config import SmurfConfig
from smurf.pbx import PbxEngine
from smurf.security import compute_digest_response, current_totp
from smurf.sdp import parse_sdp
from smurf.sip import create_branch, create_tag, extract_messages_from_stream, parse_auth_header, parse_sip_message
from smurf.web import WebApp


@dataclass
class SipDialog:
    extension: str
    password: str
    local_host: str
    local_port: int
    server_host: str
    server_port: int
    reader: asyncio.StreamReader | None = None
    writer: asyncio.StreamWriter | None = None
    call_id_seed: str = field(default_factory=lambda: hex(int(time.time() * 1000000))[2:])
    cseq: int = 1
    to_tag: str = ""
    from_tag: str = field(default_factory=create_tag)
    received_invites: list[object] = field(default_factory=list)

    async def connect(self) -> None:
        self.reader, self.writer = await asyncio.open_connection(self.server_host, self.server_port)

    async def close(self) -> None:
        if self.writer is not None:
            self.writer.close()
            await self.writer.wait_closed()

    async def send(self, message: bytes) -> None:
        assert self.writer is not None
        self.writer.write(message)
        await self.writer.drain()

    async def recv_message(self, timeout: float = 3.0):
        assert self.reader is not None
        buffer = bytearray()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.01, deadline - time.monotonic())
            chunk = await asyncio.wait_for(self.reader.read(8192), timeout=remaining)
            if not chunk:
                break
            buffer.extend(chunk)
            raw_messages = extract_messages_from_stream(buffer)
            if raw_messages:
                return parse_sip_message(raw_messages[0])
        raise TimeoutError("No SIP message received")

    def _build_register(self, auth_header: str = "") -> bytes:
        contact = f"<sip:{self.extension}@{self.local_host}:{self.local_port};transport=tcp>"
        headers = [
            f"REGISTER sip:smurf.local SIP/2.0",
            f"Via: SIP/2.0/TCP {self.local_host}:{self.local_port};branch={create_branch()}",
            f"From: <sip:{self.extension}@smurf.local>;tag={self.from_tag}",
            f"To: <sip:{self.extension}@smurf.local>",
            f"Call-ID: reg-{self.call_id_seed}-{self.extension}",
            f"CSeq: {self.cseq} REGISTER",
            "Max-Forwards: 70",
            f"Contact: {contact}",
            "Expires: 300",
            "User-Agent: SMURF-E2E",
        ]
        if auth_header:
            headers.append(f"Authorization: {auth_header}")
        headers.append("Content-Length: 0")
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8")

    async def register(self) -> None:
        await self.send(self._build_register())
        challenge = await self.recv_message()
        assert challenge.status_code == 401, challenge.start_line
        fields = parse_auth_header(challenge.header("WWW-Authenticate"))
        nonce = fields["nonce"]
        algorithm = fields.get("algorithm", "MD5")
        response = compute_digest_response(
            username=self.extension,
            realm="smurf.local",
            password=self.password,
            nonce=nonce,
            method="REGISTER",
            uri="sip:smurf.local",
            algorithm=algorithm,
            qop="auth",
            nc="00000001",
            cnonce="deadbeef",
        )
        auth = (
            f'Digest username="{self.extension}", realm="smurf.local", nonce="{nonce}", '
            f'uri="sip:smurf.local", response="{response}", algorithm={algorithm}, '
            'qop=auth, nc=00000001, cnonce="deadbeef"'
        )
        self.cseq += 1
        await self.send(self._build_register(auth))
        ok = await self.recv_message()
        assert ok.status_code == 200, ok.start_line

    def build_invite(self, target_extension: str, media_port: int, auth_header: str = "") -> bytes:
        body = (
            "v=0\r\n"
            f"o=- 1 1 IN IP4 {self.local_host}\r\n"
            "s=SMURF Test\r\n"
            f"c=IN IP4 {self.local_host}\r\n"
            "t=0 0\r\n"
            f"m=audio {media_port} RTP/AVP 0 101\r\n"
            "a=rtpmap:0 PCMU/8000\r\n"
            "a=rtpmap:101 telephone-event/8000\r\n"
        ).encode("utf-8")
        headers = [
            f"INVITE sip:{target_extension}@smurf.local SIP/2.0",
            f"Via: SIP/2.0/TCP {self.local_host}:{self.local_port};branch={create_branch()}",
            f"From: <sip:{self.extension}@smurf.local>;tag={self.from_tag}",
            f"To: <sip:{target_extension}@smurf.local>",
            f"Call-ID: call-{self.call_id_seed}",
            f"CSeq: {self.cseq} INVITE",
            "Max-Forwards: 70",
            f"Contact: <sip:{self.extension}@{self.local_host}:{self.local_port};transport=tcp>",
            "Content-Type: application/sdp",
        ]
        if auth_header:
            headers.append(f"Authorization: {auth_header}")
        headers.append(f"Content-Length: {len(body)}")
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8") + body

    def build_response(self, request, status_code: int, reason: str, body: bytes = b"") -> bytes:
        headers = [
            f"SIP/2.0 {status_code} {reason}",
            f"Via: {request.header('Via')}",
            f"From: {request.header('From')}",
            f"To: {request.header('To')}{'' if 'tag=' in request.header('To') else ';tag=callee123'}",
            f"Call-ID: {request.header('Call-ID')}",
            f"CSeq: {request.header('CSeq')}",
            "Server: E2E-UA",
        ]
        if body:
            headers.append("Content-Type: application/sdp")
        headers.append(f"Content-Length: {len(body)}")
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8") + body

    def build_bye(self, target_extension: str, call_id: str) -> bytes:
        headers = [
            f"BYE sip:{target_extension}@smurf.local SIP/2.0",
            f"Via: SIP/2.0/TCP {self.local_host}:{self.local_port};branch={create_branch()}",
            f"From: <sip:{self.extension}@smurf.local>;tag={self.from_tag}",
            f"To: <sip:{target_extension}@smurf.local>;tag=callee123",
            f"Call-ID: {call_id}",
            f"CSeq: {self.cseq + 1} BYE",
            "Max-Forwards: 70",
            "Content-Length: 0",
        ]
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8")

    def build_ack(self, target_uri: str, call_id: str, target_extension: str) -> bytes:
        headers = [
            f"ACK {target_uri} SIP/2.0",
            f"Via: SIP/2.0/TCP {self.local_host}:{self.local_port};branch={create_branch()}",
            f"From: <sip:{self.extension}@smurf.local>;tag={self.from_tag}",
            f"To: <sip:{target_extension}@smurf.local>;tag=callee123",
            f"Call-ID: {call_id}",
            f"CSeq: {self.cseq} ACK",
            "Max-Forwards: 70",
            "Content-Length: 0",
        ]
        return ("\r\n".join(headers) + "\r\n\r\n").encode("utf-8")


def build_rtp_packet(sequence: int, timestamp: int, ssrc: int, payload: bytes) -> bytes:
    return struct.pack("!BBHII", 0x80, 0x00, sequence & 0xFFFF, timestamp & 0xFFFFFFFF, ssrc) + payload


def send_udp_packet(sock: socket.socket, host: str, port: int, payload: bytes) -> None:
    sock.sendto(payload, (host, port))


async def recv_udp_packet(sock: socket.socket, timeout: float = 2.0) -> bytes:
    loop = asyncio.get_running_loop()
    data, _ = await asyncio.wait_for(loop.sock_recvfrom(sock, 2048), timeout=timeout)
    return data


def fetch_json(request: urllib.request.Request, context: ssl.SSLContext, timeout: float = 5.0) -> dict[str, object]:
    with urllib.request.urlopen(request, context=context, timeout=timeout) as response_obj:
        return json.loads(response_obj.read().decode("utf-8"))


async def run_smoke() -> dict[str, object]:
    runtime_dir = ROOT / "runtime-e2e"
    if runtime_dir.exists():
        shutil.rmtree(runtime_dir)
    os.environ.setdefault("SMURF_BIND_HOST", "127.0.0.1")
    os.environ.setdefault("SMURF_PUBLIC_HOST", "127.0.0.1")
    os.environ.setdefault("SMURF_SIP_PORT", "25060")
    os.environ.setdefault("SMURF_SIP_TLS_PORT", "25061")
    os.environ.setdefault("SMURF_WEB_PORT", "25001")
    os.environ.setdefault("SMURF_RUNTIME_DIR", str(runtime_dir))
    os.environ.setdefault("SMURF_DB_PATH", str(runtime_dir / "smurf.db"))
    os.environ.setdefault("SMURF_LOG_PATH", str(runtime_dir / "smurf.log"))
    os.environ.setdefault("SMURF_TLS_CERT", str(runtime_dir / "tls" / "server.crt"))
    os.environ.setdefault("SMURF_TLS_KEY", str(runtime_dir / "tls" / "server.key"))

    engine = await PbxEngine.build(ROOT)
    web = WebApp(engine)
    await engine.start()
    await web.start()

    client_a = SipDialog("1000", "alicepass", "127.0.0.1", 40000, engine.config.bind_host, engine.config.sip_port)
    client_b = SipDialog("1001", "bobpass", "127.0.0.1", 40001, engine.config.bind_host, engine.config.sip_port)
    await client_a.connect()
    await client_b.connect()

    try:
        await client_a.register()
        await client_b.register()

        await client_a.send(client_a.build_invite("1001", 31000))
        challenge = await client_a.recv_message()
        assert challenge.status_code == 401, challenge.start_line
        fields = parse_auth_header(challenge.header("WWW-Authenticate"))
        nonce = fields["nonce"]
        algorithm = fields.get("algorithm", "MD5")
        response = compute_digest_response(
            username="1000",
            realm="smurf.local",
            password="alicepass",
            nonce=nonce,
            method="INVITE",
            uri="sip:1001@smurf.local",
            algorithm=algorithm,
            qop="auth",
            nc="00000001",
            cnonce="cafebabe",
        )
        auth = (
            f'Digest username="1000", realm="smurf.local", nonce="{nonce}", '
            f'uri="sip:1001@smurf.local", response="{response}", algorithm={algorithm}, '
            'qop=auth, nc=00000001, cnonce="cafebabe"'
        )
        client_a.cseq += 1
        await client_a.send(client_a.build_invite("1001", 31000, auth))
        trying = await client_a.recv_message()
        assert trying.status_code == 100, trying.start_line

        forwarded = await client_b.recv_message()
        assert forwarded.method == "INVITE", forwarded.start_line
        ringing = client_b.build_response(forwarded, 180, "Ringing")
        await client_b.send(ringing)
        ringing_forwarded = await client_a.recv_message()
        assert ringing_forwarded.status_code == 180, ringing_forwarded.start_line

        ok_body = (
            "v=0\r\n"
            "o=- 2 2 IN IP4 127.0.0.1\r\n"
            "s=SMURF Answer\r\n"
            "c=IN IP4 127.0.0.1\r\n"
            "t=0 0\r\n"
            "m=audio 31002 RTP/AVP 0 101\r\n"
            "a=rtpmap:0 PCMU/8000\r\n"
            "a=rtpmap:101 telephone-event/8000\r\n"
        ).encode("utf-8")
        await client_b.send(client_b.build_response(forwarded, 200, "OK", ok_body))
        ok_forwarded = await client_a.recv_message()
        assert ok_forwarded.status_code == 200, ok_forwarded.start_line
        target_uri = ok_forwarded.header("Contact").strip("<>")
        await client_a.send(client_a.build_ack(target_uri, ok_forwarded.header("Call-ID"), "1001"))
        ack = await client_b.recv_message()
        assert ack.method == "ACK", ack.start_line

        answer_sdp = parse_sdp(ok_forwarded.body.decode("utf-8"))
        relay_port = answer_sdp.media[0].port
        left_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        right_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        left_sock.bind(("127.0.0.1", 31000))
        right_sock.bind(("127.0.0.1", 31002))
        left_sock.setblocking(False)
        right_sock.setblocking(False)
        try:
            left_recv = asyncio.create_task(recv_udp_packet(left_sock))
            right_recv = asyncio.create_task(recv_udp_packet(right_sock))
            await asyncio.sleep(0.1)
            await asyncio.to_thread(
                send_udp_packet,
                left_sock,
                "127.0.0.1",
                relay_port,
                build_rtp_packet(1, 160, 1111, b"\xff" * 160),
            )
            await asyncio.to_thread(
                send_udp_packet,
                right_sock,
                "127.0.0.1",
                30002,
                build_rtp_packet(1, 160, 2222, b"\xd5" * 160),
            )
            left_packet = await left_recv
            right_packet = await right_recv
        finally:
            left_sock.close()
            right_sock.close()
        assert len(left_packet) >= 12, "left RTP packet not received"
        assert len(right_packet) >= 12, "right RTP packet not received"

        await client_a.send(client_a.build_bye("1001", ok_forwarded.header("Call-ID")))
        bye_ok = await client_a.recv_message()
        assert bye_ok.status_code == 200, bye_ok.start_line
        bye_to_b = await client_b.recv_message()
        assert bye_to_b.method == "BYE", bye_to_b.start_line
        await client_b.send(client_b.build_response(bye_to_b, 200, "OK"))

        ctx = ssl._create_unverified_context()
        totp = current_totp(engine.config.admin_totp_secret)
        login_req = urllib.request.Request(
            f"https://{engine.config.bind_host}:{engine.config.web_port}/api/login",
            data=json.dumps(
                {
                    "username": engine.config.admin_username,
                    "password": engine.config.admin_password,
                    "totp": totp,
                }
            ).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        login_payload = await asyncio.to_thread(fetch_json, login_req, ctx, 5.0)
        token = login_payload["token"]

        dashboard_req = urllib.request.Request(
            f"https://{engine.config.bind_host}:{engine.config.web_port}/api/dashboard",
            headers={"Authorization": f"Bearer {token}"},
            method="GET",
        )
        dashboard_payload = await asyncio.to_thread(fetch_json, dashboard_req, ctx, 5.0)

        return {
            "login": "ok",
            "calls": dashboard_payload["calls"],
            "registrations": dashboard_payload["registrations"],
            "kpis": dashboard_payload["kpis"],
        }
    finally:
        await client_a.close()
        await client_b.close()
        await web.stop()
        await engine.stop()


def main() -> None:
    result = asyncio.run(run_smoke())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

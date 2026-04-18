# SMURF — From-scratch enterprise PBX (3CX-class)

SMURF is a complete VoIP/PBX platform written entirely from scratch — no
Asterisk, FreeSWITCH, Kamailio, OpenSIPS or any other PBX is used as a
base.  The SIP stack (RFC 3261 + 7118 + 4733), RTP/RTCP engine, B2BUA,
dial plan, registrar, voicemail, conference mixer, IVR, queues, ring
groups, parking, MoH, recording, provisioning and admin SPA are all
original code that lives in this repository.

The only third-party building blocks are general-purpose libraries
(asyncio, FastAPI, Pydantic, cryptography, websockets) and **aiortc** —
used solely as a low-level WebRTC stack to terminate DTLS-SRTP from
browsers; aiortc is not a PBX.

## Quick install

```bash
sudo ./install.sh
```

This installs system packages, creates a Python virtualenv at
`/opt/smurf/.venv`, configures a `smurf` system user, registers a
systemd unit (`/etc/systemd/system/smurf.service`) with auto-restart,
and starts SMURF.

After installation:

| Endpoint            | URL / address                         |
| ------------------- | ------------------------------------- |
| Admin panel (HTTPS) | `https://<host>:5001/`                |
| Web softphone       | `https://<host>:5001/softphone`       |
| API + Swagger UI    | `https://<host>:5001/api/docs`        |
| SIP UDP             | `udp://<host>:5060`                   |
| SIP TCP             | `tcp://<host>:5060`                   |
| SIP TLS             | `tls://<host>:5061`                   |
| SIP WebSocket       | `ws://<host>:8088`                    |
| SIP secure WS       | `wss://<host>:8089`                   |
| Provisioning HTTP   | `https://<host>:5001/prov/...`        |

### Default credentials

| Account | User    | Password       |
| ------- | ------- | -------------- |
| Admin   | `admin` | `smurf-admin`  |
| Ext 1001| `1001`  | `smurf1001`    |
| Ext 1002| `1002`  | `smurf1002`    |
| Ext 1003| `1003`  | `smurf1003`    |

Enable 2FA from `Admin → Sign-in → 2FA enable` (TOTP, scan with any
authenticator app).

## What's inside

* **SIP stack** – `smurf/sip/`
  * `message.py` parser/serializer with header folding + multi-value support
  * `transaction.py` client+server transaction state machines (RFC 3261 §17)
  * `dialog.py` dialog state per RFC 3261 §12
  * `auth.py` HTTP Digest MD5 + SHA-256 (RFC 7616)
  * `sdp.py` RFC 4566 SDP parser/builder
  * `transport.py` UDP / TCP / TLS transports
  * `ws_transport.py` SIP-over-WebSocket (RFC 7118)
  * `dispatcher.py` central message router

* **RTP engine** – `smurf/rtp/`
  * `codecs.py` G.711 µ-law / A-law (pure Python ITU-T G.711)
  * `dtmf.py` RFC 2833 / 4733 telephone-event
  * `jitter.py` adaptive jitter buffer
  * `session.py` RTP session + sender/receiver loops + relay/recording
  * `wav.py` WAV reader/writer at 8 kHz mono PCM-16

* **PBX core** – `smurf/pbx/`
  * `b2bua.py` Back-to-Back UA: INVITE/ACK/BYE/CANCEL/REFER/INFO/UPDATE
  * `registrar.py` SIP REGISTER with digest auth + Fail2ban hooks
  * `dialplan.py` regex-based plan with built-ins (`*43`, `*97`, …)
  * `media_apps.py` echo, voicemail recording, IVR, MoH, announcements
  * `conference.py` N-party conference mixer (RTP linear PCM)
  * `voicemail.py` MWI NOTIFY + email with WAV attachment
  * `trunks.py` outbound trunk REGISTER loop with digest
  * `webrtc_gateway.py` DTLS-SRTP terminator for browsers (aiortc)
  * `fax.py` T.38 UDPTL pass-through

* **Persistence** – `smurf/db/schema.sql` (SQLite, WAL mode)

* **REST API + WebSocket events** – `smurf/api/server.py`
  Full CRUD for extensions, trunks, dial plan, ring groups, queues,
  IVRs, settings; CDR + CSV download; recordings + voicemail audio;
  internal chat; live event WebSocket at `/api/ws/events`.

* **Web admin SPA + softphone PWA** – `smurf/web/`
  No frameworks; vanilla JS + service worker for installable PWA.
  The softphone speaks SIP over WebSocket (RFC 7118) and uses the
  browser's native WebRTC for media.

* **Provisioning server** – `smurf/provisioning/server.py`
  Templates for Yealink, Snom, Grandstream, Fanvil; auto-served by MAC.

## Configuration

Configuration is layered:

1. Defaults (`smurf/core/config.py`).
2. Environment overrides (`SMURF_<KEY>=…`).
3. Persistent JSON in `data/runtime.json` (written by the admin UI).

Hot-reload: edits made through the admin UI are visible to all
subsystems immediately via `config.subscribe()`.

## Service control

```bash
systemctl status smurf
systemctl restart smurf
journalctl -u smurf -f      # live logs
```

## Testing

A smoke E2E test using two real SIP UAs (baresip) and a Playwright
WebRTC client lives in `tests/e2e_call.py`.  See it for how to drive
the stack.

## Ports used

| Port      | Proto | Purpose                              |
| --------- | ----- | ------------------------------------ |
| 5060      | UDP/TCP | SIP                                |
| 5061      | TCP/TLS | SIP TLS                            |
| 8088      | TCP   | SIP WebSocket (WS)                   |
| 8089      | TCP/TLS | SIP secure WebSocket (WSS)         |
| 5000      | TCP   | Admin HTTP                           |
| 5001      | TCP/TLS | Admin HTTPS + WebRTC signaling     |
| 16384-32767 | UDP | RTP/RTCP (configurable)              |

## License

This project is original work — released under the AGPL-3.0.

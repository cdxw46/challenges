# SMURF PBX

Enterprise-grade PBX platform, complete functional replica of 3CX.

**Built from scratch** - no Asterisk, no FreeSWITCH, no Kamailio, no existing PBX codebases used.

## Features
- Full SIP stack (RFC 3261) over UDP/TCP/TLS/WebSocket
- RTP/RTCP engine with G.711, Opus, SRTP, jitter buffer
- Complete PBX logic: IVR, queues, ring groups, transfers, conferences, voicemail, fax (T.38)
- WebRTC Softphone (pure, no 3rd party libs)
- Modern React Admin Panel (SPA) on HTTPS:5001
- Mobile PWA with push notifications
- Provisioning server for IP phones (Yealink, Grandstream, etc.)
- CDR, recordings, reports, API REST + Webhooks
- High availability architecture, 500+ concurrent calls capable
- Full security: TLS, SRTP, rate limiting, fail2ban-like, 2FA

## Quick Start
```bash
sudo ./install.sh
```

Default credentials:
- Admin Panel: https://localhost:5001
  - Username: `admin`
  - Password: `smurfadmin123`
- Test Extension: 101 (password: 101)
- Test Extension: 102 (password: 102)

## Ports
- SIP: 5060 (UDP/TCP), 5061 (TLS)
- WebSocket SIP: 8080
- Web Admin: 5001 (HTTPS)
- RTP: 10000-20000 (UDP)
- Provisioning: 8081 (HTTP)

## Architecture
- `src/sip/` - C++ SIP stack
- `src/rtp/` - C RTP media engine
- `src/pbx/` - Python PBX logic engine
- `web/admin/` - React SPA
- `web/softphone/` - WebRTC client
- `db/` - PostgreSQL schema
- `services/` - systemd units

See `docs/` for detailed architecture, API, and RFC references.

**Status**: Full implementation in progress. Core components being built with rigorous RFC compliance.

# SMURF

SMURF is a from-scratch PBX foundation implemented in Python standard library components. This repository version includes:

- SIP server over UDP, TCP, and TLS
- Digest authentication with MD5 and SHA-256 validation
- Extension registration and presence tracking
- Internal extension calling with SIP dialog forwarding
- RTP relay with jitter accounting and DSCP marking
- HTTPS admin panel on port `5001`
- REST API with JWT
- Admin 2FA via TOTP
- SQLite-backed persistent state
- Install script and systemd unit

## Default runtime

- Web admin: `https://127.0.0.1:5001/`
- SIP UDP/TCP: `127.0.0.1:5060`
- SIP TLS: `127.0.0.1:5061`
- RTP relay: `127.0.0.1:30000-30100`

## Default credentials

- Admin user: `admin`
- Admin password: `admin123!`
- Admin TOTP secret: `JBSWY3DPEHPK3PXP`
- Test extension `1000` password: `alicepass`
- Test extension `1001` password: `bobpass`

## Install

Run:

`./install.sh`

The installer:

- compiles the Python modules
- prepares runtime directories
- installs the systemd unit
- restarts the `smurf` service when `systemctl` is available

## Run manually

`PYTHONPATH=src python3 -m smurf.main`

## Notes

- TLS certificates are generated automatically with `openssl` into `runtime/tls/`
- State is stored in `runtime/smurf.db`
- Logs are written to `runtime/smurf.log`
- The web panel exposes `/api/totp` to help local testing

## Current scope

This is a substantial functional PBX foundation, not yet a full 3CX-equivalent platform. The current implementation focuses on a working signaling/media/control plane that can be exercised end-to-end and extended component by component.

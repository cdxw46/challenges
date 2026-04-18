## Cursor Cloud specific instructions

The primary application code now lives under `smurf/`.

- Main runtime entrypoint: `PYTHONPATH=src python3 -m smurf.main` from `smurf/`
- Install script: `smurf/install.sh`
- Systemd unit template: `smurf/deploy/systemd/smurf.service`
- End-to-end smoke test: `PYTHONPATH=src python3 tests/e2e_smoke.py` from `smurf/`
- HTTPS admin panel: `https://127.0.0.1:5001/` by default
- SIP listeners: UDP/TCP `127.0.0.1:5060`, TLS `127.0.0.1:5061`

When editing the PBX, prefer focused runtime checks over broad test sweeps. The most valuable validations are:

- the Python module compile check for touched files,
- the `tests/e2e_smoke.py` end-to-end call flow, and
- manual browser verification of the HTTPS admin UI when web changes are made.

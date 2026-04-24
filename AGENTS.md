## Cursor Cloud specific instructions

This repository now contains a single-binary Rust implementation of the NEUROVA platform, plus static web frontends and deployment assets.

### Build and run

- Main service: `cargo run -- serve`
- Synthetic city generator only: `cargo run -- simulate --sensors 4000`
- Runtime data defaults to `./runtime`
- HTTP server defaults to `http://127.0.0.1:8080`

### Key routes

- Operator control center: `/control/`
- Citizen portal: `/ciudad/`
- API docs: `/api/docs`
- OpenAPI JSON: `/api/openapi.json`

### Protocol listeners

- MQTT: `1883`
- AMQP subset: `5672`
- TCP ingest: `9100`
- UDP ingest: `9101`

### Testing guidance

- Focus on `cargo test` and targeted `curl` checks against the running service.
- For UI changes, run the service locally and test both `/control/` and `/ciudad/`.
- If HTTPS/Nginx behavior is under test, prefer `docker compose up --build` or `./install.sh` on a fresh machine.

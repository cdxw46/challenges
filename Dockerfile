FROM rust:1.83-bookworm AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY web ./web
COPY docs ./docs
COPY deploy ./deploy
COPY README.md install.sh demo.sh AGENTS.md ./

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/neurova /app/neurova
COPY --from=builder /app/web /app/web
COPY --from=builder /app/docs /app/docs
COPY --from=builder /app/deploy /app/deploy
COPY --from=builder /app/README.md /app/README.md
COPY --from=builder /app/install.sh /app/install.sh
COPY --from=builder /app/demo.sh /app/demo.sh

EXPOSE 8080 1883 5672 9100 9101/udp

ENV NEUROVA_RUNTIME_DIR=/data/runtime

CMD ["/app/neurova", "serve"]

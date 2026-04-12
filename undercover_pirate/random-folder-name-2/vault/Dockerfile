FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssl \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/ssl/vault && \
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout /etc/ssl/vault/key.pem \
      -out /etc/ssl/vault/cert.pem \
      -days 3650 \
      -subj "/CN=vault" \
      -addext "subjectAltName=DNS:vault,IP:10.20.0.3"

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD npm start

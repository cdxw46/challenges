FROM node:20-slim

RUN apt-get update && apt-get install -y \
    openssl chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
    iputils-ping \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/ssl/captain && \
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout /etc/ssl/captain/key.pem \
      -out /etc/ssl/captain/cert.pem \
      -days 3650 \
      -subj "/CN=*" \
      -addext "subjectAltName=DNS:*"

ENV PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app
COPY package.json ./
RUN npm install
RUN npx @puppeteer/browsers install chrome@146.0.7680.76 --path /opt/browsers
ENV PUPPETEER_EXECUTABLE_PATH=/opt/browsers/chrome/linux-146.0.7680.76/chrome-linux64/chrome
COPY . .
CMD npm start

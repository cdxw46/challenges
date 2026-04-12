FROM nginx:alpine
ARG HOST
RUN apk add --no-cache openssl gettext && \
    mkdir -p /etc/nginx/ssl && \
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout /etc/nginx/ssl/key.pem \
      -out /etc/nginx/ssl/cert.pem \
      -days 3650 \
      -subj "/CN=proxy" \
      -addext "subjectAltName=DNS:*.${HOST},DNS:${HOST}"
RUN sed -i 's/worker_processes\s\+auto/worker_processes 1/' /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
RUN envsubst '${HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && \
    rm /etc/nginx/conf.d/default.conf.template

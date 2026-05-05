FROM node:20-slim
RUN apt-get update && apt-get install -y iputils-ping && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json .
RUN npm install
COPY app.js .
COPY templates/ templates/
COPY static/ static/
EXPOSE 80
CMD ["node", "app.js"]

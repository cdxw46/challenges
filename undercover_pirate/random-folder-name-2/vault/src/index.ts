import express from "express";
import https from "https";
import fs from "fs";

const HTTPS_PORT = 443;
const app = express();

app.get("/treasure", (req, res) => {
  console.log("Somebody touched the treasure!");
  res.send("UMASS{testing}");
});

https.createServer({
  key: fs.readFileSync("/etc/ssl/vault/key.pem"),
  cert: fs.readFileSync("/etc/ssl/vault/cert.pem"),
}, app).listen(HTTPS_PORT, () => {
  console.log(`Vault HTTPS server running on port ${HTTPS_PORT}`);
});

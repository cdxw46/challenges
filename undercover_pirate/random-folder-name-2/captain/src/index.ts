import express from "express";
import puppeteer from "puppeteer";
import https from "https";
import fs from "fs";
import {execSync} from "child_process";

console.log(`Using Chromium: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
execSync(`${process.env.PUPPETEER_EXECUTABLE_PATH || 'chromium'} --version`, { encoding: 'utf-8' }).trim().split('\n').forEach(l => console.log(l));

const PORT = 80;
const HTTPS_PORT = 443;
const app = express();

const LAUNCH_LIMIT = 10;
let activeLaunches = 0;

app.get("/call-captain", async (req, res) => {
  if (activeLaunches >= LAUNCH_LIMIT) {
    res.status(429).send("Captain is too busy right now. Try again later.");
    console.log(`Captain rate limited: ${activeLaunches} active launches`);
    return;
  }
  activeLaunches++;

  res.send("Captain is visiting the forum...");
  console.log("Captain was called")

  try {
    const b = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--ignore-certificate-errors"],
    });
    const ctx = await b.createBrowserContext();
    const page = await ctx.newPage();

    await page.goto(`https://forum.${process.env.HOST}/login`, {
      waitUntil: "networkidle2",
      timeout: 20000,
    });

    await new Promise((r) => setTimeout(r, 240000));

    await b.close();
    console.log("Captain finished visiting forum");
  } catch (err) {
    console.error("Captain bot error:", err);
  } finally {
    activeLaunches--;
  }
});

app.get('/check-vault', (req, res) => {
  try {
    const output = execSync('ping -nc 1 vault', { timeout: 10000 }).toString();
    res.send(`vault looks good to me! ${output}`);
  } catch (e :any) {
    res.status(500).send(e.stderr ? e.stderr.toString() : e.message);
  }
});

app.listen(PORT, () => {
  console.log(`Captain server running on port ${PORT}`);
});

https.createServer({
  key: fs.readFileSync("/etc/ssl/captain/key.pem"),
  cert: fs.readFileSync("/etc/ssl/captain/cert.pem"),
}, app).listen(HTTPS_PORT, () => {
  console.log(`Captain HTTPS server running on port ${HTTPS_PORT}`);
});

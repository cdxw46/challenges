const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
const { execSync } = require('child_process');

const app = express();
const templates = path.join(__dirname, 'templates');
const HOST = process.env.HOST;

nunjucks.configure(templates, { autoescape: true, express: app });

app.use('/static', express.static(path.join(__dirname, 'static')));

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https://images.brickset.com https://www.toysnbricks.com");
    next();
});

app.use(express.text());

app.get('/', (req, res) => {
    res.render('index.html', { host: HOST });
});

app.get('/ad', (req, res) => {
    res.render('ad.html', { host: HOST });
});

app.post('/healthcheck', (req, res) => {
  res.send(req.body);
});

app.get('/healthcheck', (req, res) => {
  try {
    const output = execSync('ping -nc 1 product', { timeout: 10000 }).toString();
    res.send(output);
  } catch (e) {
    res.status(500).send(e.stderr ? e.stderr.toString() : e.message);
  }
});

const server = app.listen(80, '0.0.0.0', () => {
    console.log('Listening on :80');
});

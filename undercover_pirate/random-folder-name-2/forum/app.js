const express = require('express');
const nunjucks = require('nunjucks');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const DOMPurify = require('isomorphic-dompurify');

const crypto = require('crypto');

const app = express();
const JWT_SECRET = crypto.randomBytes(32).toString('hex');
const HOST = process.env.HOST;

const users = [];
const posts = [];

nunjucks.configure(path.join(__dirname, 'templates'), { autoescape: true, express: app });

app.use('/static', express.static(path.join(__dirname, 'static')));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', `default-src 'self'; frame-src 'self' https://product.${HOST}; img-src 'self' https://i1.sndcdn.com`);
    next();
});

function getUser(req) {
    const token = req.cookies.token;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        return decoded.username;
    } catch (e) {
        return null;
    }
}

app.get('/', (req, res) => {
    const username = getUser(req);
    res.render('index.html', { username, posts: [...posts].reverse(), host: HOST });
});

app.get('/login', (req, res) => {
    res.render('login.html', { host: HOST });
});

app.post('/login', (req, res) => {
    const { username = '', password = '' } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).send('Invalid credentials');
    }
    const token = jwt.sign({ username, exp: Math.floor(Date.now() / 1000) + 3600 }, JWT_SECRET, { algorithm: 'HS256' });
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/');
});

app.get('/register', (req, res) => {
    res.render('register.html', { host: HOST });
});

app.post('/register', (req, res) => {
    const { username = '', password = '' } = req.body;
    if (!username || !password) {
        return res.status(400).send('Username and password required');
    }
    if (users.some(u => u.username === username)) {
        return res.status(400).send('Username already taken');
    }
    users.push({ username, password });
    res.redirect('/login');
});

app.post('/post', (req, res) => {
    const username = getUser(req);
    if (!username) return res.redirect('/login');
    const content = (req.body.content || '');
    if (content) {
        posts.push({ author: username, content, timestamp: Date.now() });
    }
    res.redirect('/');
});

app.post('/delete-post', (req, res) => {
    const username = getUser(req);
    if (!username) return res.redirect('/login');
    const timestamp = Number(req.body.timestamp);
    const idx = posts.findIndex(p => p.author === username && p.timestamp === timestamp);
    if (idx !== -1) {
        posts.splice(idx, 1);
    }
    res.redirect('/');
});

app.get('/user/:username', (req, res) => {
    const current_user = getUser(req);
    const target = req.params.username;
    const userPosts = posts.filter(p => p.author === target).reverse();
    res.render('user.html', { target, current_user, posts: userPosts, host: HOST });
});

app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

app.listen(80, '0.0.0.0', () => {
    console.log('Listening on :80');
});

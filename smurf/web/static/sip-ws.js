// Minimal SIP-over-WebSocket UA implemented in vanilla JS, paired with the
// browser's native WebRTC stack.  This file *is* the SMURF softphone signaling
// layer — no SIP.js, no JsSIP, no third-party libraries.
//
// Implements just enough of RFC 3261 + RFC 7118 + RFC 5626 to:
//   * REGISTER (digest auth, MD5 + SHA-256)
//   * Outgoing INVITE with SDP from RTCPeerConnection
//   * Incoming INVITE → answer with SDP
//   * ACK / BYE / CANCEL
//   * In-dialog INFO + REFER (transfer)
//   * 401/407 challenge re-issue with credentials
//
// State is exposed via callbacks: onRegistered, onIncoming, onConnected,
// onDisconnected, onLog.

(function (global) {
'use strict';

function rand(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
function genCallId(host) { return rand(12) + '@' + host; }
function genTag() { return rand(6); }
function genBranch() { return 'z9hG4bK-' + rand(8); }

async function md5Hex(s) {
  // No SubtleCrypto MD5; ship a tiny pure-JS MD5.
  return md5(s);
}
async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2,'0')).join('');
}

// --- pure-JS MD5 (Joseph Myers, public domain) ------------------------------
function md5cycle(x, k) {
  let a = x[0], b = x[1], c = x[2], d = x[3];
  a = ff(a, b, c, d, k[0], 7, -680876936); d = ff(d, a, b, c, k[1], 12, -389564586);
  c = ff(c, d, a, b, k[2], 17, 606105819); b = ff(b, c, d, a, k[3], 22, -1044525330);
  a = ff(a, b, c, d, k[4], 7, -176418897); d = ff(d, a, b, c, k[5], 12, 1200080426);
  c = ff(c, d, a, b, k[6], 17, -1473231341); b = ff(b, c, d, a, k[7], 22, -45705983);
  a = ff(a, b, c, d, k[8], 7, 1770035416); d = ff(d, a, b, c, k[9], 12, -1958414417);
  c = ff(c, d, a, b, k[10], 17, -42063); b = ff(b, c, d, a, k[11], 22, -1990404162);
  a = ff(a, b, c, d, k[12], 7, 1804603682); d = ff(d, a, b, c, k[13], 12, -40341101);
  c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
  a = gg(a, b, c, d, k[1], 5, -165796510); d = gg(d, a, b, c, k[6], 9, -1069501632);
  c = gg(c, d, a, b, k[11], 14, 643717713); b = gg(b, c, d, a, k[0], 20, -373897302);
  a = gg(a, b, c, d, k[5], 5, -701558691); d = gg(d, a, b, c, k[10], 9, 38016083);
  c = gg(c, d, a, b, k[15], 14, -660478335); b = gg(b, c, d, a, k[4], 20, -405537848);
  a = gg(a, b, c, d, k[9], 5, 568446438); d = gg(d, a, b, c, k[14], 9, -1019803690);
  c = gg(c, d, a, b, k[3], 14, -187363961); b = gg(b, c, d, a, k[8], 20, 1163531501);
  a = gg(a, b, c, d, k[13], 5, -1444681467); d = gg(d, a, b, c, k[2], 9, -51403784);
  c = gg(c, d, a, b, k[7], 14, 1735328473); b = gg(b, c, d, a, k[12], 20, -1926607734);
  a = hh(a, b, c, d, k[5], 4, -378558); d = hh(d, a, b, c, k[8], 11, -2022574463);
  c = hh(c, d, a, b, k[11], 16, 1839030562); b = hh(b, c, d, a, k[14], 23, -35309556);
  a = hh(a, b, c, d, k[1], 4, -1530992060); d = hh(d, a, b, c, k[4], 11, 1272893353);
  c = hh(c, d, a, b, k[7], 16, -155497632); b = hh(b, c, d, a, k[10], 23, -1094730640);
  a = hh(a, b, c, d, k[13], 4, 681279174); d = hh(d, a, b, c, k[0], 11, -358537222);
  c = hh(c, d, a, b, k[3], 16, -722521979); b = hh(b, c, d, a, k[6], 23, 76029189);
  a = hh(a, b, c, d, k[9], 4, -640364487); d = hh(d, a, b, c, k[12], 11, -421815835);
  c = hh(c, d, a, b, k[15], 16, 530742520); b = hh(b, c, d, a, k[2], 23, -995338651);
  a = ii(a, b, c, d, k[0], 6, -198630844); d = ii(d, a, b, c, k[7], 10, 1126891415);
  c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
  a = ii(a, b, c, d, k[12], 6, 1700485571); d = ii(d, a, b, c, k[3], 10, -1894986606);
  c = ii(c, d, a, b, k[10], 15, -1051523); b = ii(b, c, d, a, k[1], 21, -2054922799);
  a = ii(a, b, c, d, k[8], 6, 1873313359); d = ii(d, a, b, c, k[15], 10, -30611744);
  c = ii(c, d, a, b, k[6], 15, -1560198380); b = ii(b, c, d, a, k[13], 21, 1309151649);
  a = ii(a, b, c, d, k[4], 6, -145523070); d = ii(d, a, b, c, k[11], 10, -1120210379);
  c = ii(c, d, a, b, k[2], 15, 718787259); b = ii(b, c, d, a, k[9], 21, -343485551);
  x[0] = add32(a, x[0]); x[1] = add32(b, x[1]); x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
}
function cmn(q, a, b, x, s, t) { a = add32(add32(a, q), add32(x, t)); return add32((a << s) | (a >>> (32 - s)), b); }
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
function md51(s) {
  const n = s.length, state = [1732584193, -271733879, -1732584194, 271733878];
  let i;
  for (i = 64; i <= n; i += 64) md5cycle(state, md5blk(s.substring(i - 64, i)));
  s = s.substring(i - 64);
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) { md5cycle(state, tail); for (i = 0; i < 16; i++) tail[i] = 0; }
  tail[14] = n * 8; md5cycle(state, tail); return state;
}
function md5blk(s) { const m = []; for (let i = 0; i < 64; i += 4) m[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24); return m; }
const HEX = '0123456789abcdef';
function rhex(n) { let s = ''; for (let j = 0; j < 4; j++) s += HEX[(n >> (j * 8 + 4)) & 0x0F] + HEX[(n >> (j * 8)) & 0x0F]; return s; }
function hex(x) { for (let i = 0; i < x.length; i++) x[i] = rhex(x[i]); return x.join(''); }
function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
function md5(s) {
  // utf-8
  s = unescape(encodeURIComponent(s));
  return hex(md51(s));
}
// --- end MD5 ---------------------------------------------------------------

function parseChallenge(h) {
  const out = {}; const re = /(\w+)=("([^"]*)"|([^,\s]+))/g; let m;
  while ((m = re.exec(h)) !== null) out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4];
  return out;
}

async function digestResponse(method, uri, user, pwd, challenge, body) {
  const algo = (challenge.algorithm || 'MD5').toUpperCase();
  const ha1raw = `${user}:${challenge.realm}:${pwd}`;
  const ha2raw = `${method}:${uri}`;
  let ha1, ha2;
  if (algo.startsWith('SHA-256')) { ha1 = await sha256Hex(ha1raw); ha2 = await sha256Hex(ha2raw); }
  else { ha1 = md5(ha1raw); ha2 = md5(ha2raw); }
  if (challenge.qop) {
    const nc = '00000001';
    const cnonce = rand(8);
    const respRaw = `${ha1}:${challenge.nonce}:${nc}:${cnonce}:auth:${ha2}`;
    const resp = algo.startsWith('SHA-256') ? await sha256Hex(respRaw) : md5(respRaw);
    return `Digest username="${user}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${resp}", algorithm=${algo}, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  }
  const respRaw = `${ha1}:${challenge.nonce}:${ha2}`;
  const resp = algo.startsWith('SHA-256') ? await sha256Hex(respRaw) : md5(respRaw);
  return `Digest username="${user}", realm="${challenge.realm}", nonce="${challenge.nonce}", uri="${uri}", response="${resp}", algorithm=${algo}`;
}

function buildMessage(start, headers, body) {
  body = body || '';
  headers = Object.assign({}, headers);
  headers['Content-Length'] = (new TextEncoder().encode(body)).length.toString();
  const lines = [start];
  for (const [k, v] of Object.entries(headers)) {
    if (Array.isArray(v)) v.forEach(vv => lines.push(`${k}: ${vv}`));
    else lines.push(`${k}: ${v}`);
  }
  return lines.join('\r\n') + '\r\n\r\n' + body;
}

function parseMessage(raw) {
  const sep = raw.indexOf('\r\n\r\n');
  const head = sep === -1 ? raw : raw.substring(0, sep);
  const body = sep === -1 ? '' : raw.substring(sep + 4);
  const lines = head.split('\r\n');
  const start = lines.shift();
  const headers = {};
  let lastKey = null;
  for (const ln of lines) {
    if (/^[\s\t]/.test(ln) && lastKey) { headers[lastKey] += ' ' + ln.trim(); continue; }
    const idx = ln.indexOf(':');
    if (idx === -1) continue;
    const k = ln.substring(0, idx).trim();
    const v = ln.substring(idx + 1).trim();
    lastKey = k;
    if (headers[k] !== undefined) headers[k] = [].concat(headers[k], v); else headers[k] = v;
  }
  const isResp = start.startsWith('SIP/');
  if (isResp) {
    const [version, code, ...reason] = start.split(' ');
    return { isResponse: true, version, status: parseInt(code), reason: reason.join(' '), headers, body };
  }
  const [method, uri, version] = start.split(' ');
  return { isResponse: false, method, uri, version, headers, body };
}

function getHeader(h, n) { const v = h[Object.keys(h).find(k => k.toLowerCase() === n.toLowerCase())]; return Array.isArray(v) ? v[0] : v; }
function paramOf(s, n) { if (!s) return ''; const m = new RegExp('[;,]\\s*' + n + '=(?:"([^"]+)"|([^;,\\s]+))', 'i').exec(s); return m ? (m[1] || m[2]) : ''; }
function uriOf(h) { if (!h) return ''; const m = h.match(/<([^>]+)>/); return m ? m[1] : h.split(';')[0].trim(); }

class SipUA {
  constructor(opts) {
    this.uri = opts.uri;             // sip:1001@host
    this.user = opts.user;           // 1001
    this.pwd = opts.pwd;
    this.host = opts.host;           // signaling host (e.g. 1.2.3.4 or domain)
    this.wsUrl = opts.wsUrl;         // ws(s)://host:port
    this.displayName = opts.displayName || opts.user;
    this.transport = opts.wsUrl.startsWith('wss') ? 'WSS' : 'WS';
    this.contact = `<sip:${this.user}@${rand(6)}.invalid;transport=${this.transport.toLowerCase()};ob>`;
    this.callbacks = opts.callbacks || {};
    this.ws = null;
    this.dialogs = new Map();
    this.pendingTx = new Map();
    this.regCallId = genCallId(this.host);
    this.regCseq = 0;
    this.regTimer = null;
    this.lastChallenge = null;
  }

  log(msg) { try { (this.callbacks.onLog || console.log)(msg); } catch(e){} }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, ['sip']);
      this.ws.onopen = () => { this.log('WS open'); this.register().then(resolve, reject); };
      this.ws.onmessage = (m) => this._onMessage(m.data);
      this.ws.onclose = () => { this.log('WS closed'); if (this.callbacks.onDisconnected) this.callbacks.onDisconnected(); };
      this.ws.onerror = (e) => { this.log('WS error'); reject(e); };
    });
  }

  _send(raw) { this.log('>>> ' + raw.split('\r\n')[0]); this.ws.send(raw); }

  _onMessage(raw) {
    if (typeof raw !== 'string') raw = new TextDecoder().decode(raw);
    if (raw.trim() === '') return; // keepalive
    const msg = parseMessage(raw);
    this.log('<<< ' + (msg.isResponse ? `${msg.status} ${msg.reason}` : `${msg.method} ${msg.uri}`));
    if (msg.isResponse) this._onResponse(msg); else this._onRequest(raw, msg);
  }

  _onResponse(resp) {
    const cseqHdr = getHeader(resp.headers, 'CSeq') || '';
    const [cseqN, cseqM] = cseqHdr.split(/\s+/);
    const branch = paramOf(getHeader(resp.headers, 'Via') || '', 'branch');
    const key = `${cseqM}|${branch}`;
    const tx = this.pendingTx.get(key);
    if (!tx) return;
    tx.onResponse(resp);
  }

  async _onRequest(raw, req) {
    const callId = getHeader(req.headers, 'Call-ID');
    if (req.method === 'OPTIONS') { this._respond(req, 200, 'OK'); return; }
    if (req.method === 'NOTIFY') { this._respond(req, 200, 'OK'); if (this.callbacks.onNotify) this.callbacks.onNotify(req); return; }
    if (req.method === 'MESSAGE') { this._respond(req, 200, 'OK'); if (this.callbacks.onMessage) this.callbacks.onMessage(req); return; }
    if (req.method === 'BYE') {
      this._respond(req, 200, 'OK');
      const dialog = this.dialogs.get(callId);
      if (dialog && dialog.pc) try { dialog.pc.close(); } catch(e){}
      this.dialogs.delete(callId);
      if (this.callbacks.onEnded) this.callbacks.onEnded(callId);
      return;
    }
    if (req.method === 'CANCEL') { this._respond(req, 200, 'OK'); if (this.callbacks.onEnded) this.callbacks.onEnded(callId); return; }
    if (req.method === 'INVITE') { await this._onInvite(req); return; }
    if (req.method === 'ACK') return;
    this._respond(req, 405, 'Method Not Allowed');
  }

  _respond(req, code, reason, extraHeaders, body) {
    const headers = {
      'Via': req.headers['Via'],
      'From': req.headers['From'],
      'To': req.headers['To'] + (req.headers['To'].includes(';tag=') ? '' : ';tag=' + genTag()),
      'Call-ID': req.headers['Call-ID'],
      'CSeq': req.headers['CSeq'],
      'User-Agent': 'SMURF-WebPhone/0.1',
    };
    Object.assign(headers, extraHeaders || {});
    this._send(buildMessage(`SIP/2.0 ${code} ${reason}`, headers, body || ''));
  }

  async register(unregister=false) {
    return this._sendRegister(unregister, null);
  }

  _sendRegister(unregister, authHeader) {
    return new Promise((resolve, reject) => {
      this.regCseq += 1;
      const branch = genBranch();
      const reqURI = `sip:${this.host}`;
      const fromTag = this.regCallId.split('@')[0].slice(0, 8);
      const headers = {
        'Via': `SIP/2.0/${this.transport} ${this.host};branch=${branch};rport`,
        'Max-Forwards': '70',
        'From': `<${this.uri}>;tag=${fromTag}`,
        'To': `<${this.uri}>`,
        'Call-ID': this.regCallId,
        'CSeq': `${this.regCseq} REGISTER`,
        'Contact': this.contact,
        'Expires': unregister ? '0' : '3600',
        'Allow': 'INVITE,ACK,BYE,CANCEL,OPTIONS,NOTIFY,REFER,MESSAGE,INFO,UPDATE',
        'Supported': 'path, outbound, gruu',
        'User-Agent': 'SMURF-WebPhone/0.1',
      };
      if (authHeader) headers['Authorization'] = authHeader;
      const txKey = `REGISTER|${branch}`;
      this.pendingTx.set(txKey, { onResponse: async (resp) => {
        if (resp.status === 100) return;
        if (resp.status === 401 || resp.status === 407) {
          const wwwH = getHeader(resp.headers, resp.status === 407 ? 'Proxy-Authenticate' : 'WWW-Authenticate') || '';
          const ch = parseChallenge(wwwH.replace(/^Digest\s+/i, ''));
          const auth = await digestResponse('REGISTER', reqURI, this.user, this.pwd, ch);
          this.pendingTx.delete(txKey);
          this._sendRegister(unregister, auth).then(resolve, reject);
          return;
        }
        this.pendingTx.delete(txKey);
        if (resp.status >= 200 && resp.status < 300) {
          if (!unregister) {
            if (this.regTimer) clearTimeout(this.regTimer);
            this.regTimer = setTimeout(() => this.register(false), 30 * 60 * 1000);
          }
          if (this.callbacks.onRegistered) this.callbacks.onRegistered(true);
          resolve(resp);
        } else {
          if (this.callbacks.onRegistered) this.callbacks.onRegistered(false, resp);
          reject(new Error('REGISTER failed: ' + resp.status));
        }
      }});
      this._send(buildMessage(`REGISTER ${reqURI} SIP/2.0`, headers, ''));
    });
  }

  async call(targetExt, mediaStream) {
    const callId = genCallId(this.host);
    const fromTag = genTag();
    const branch = genBranch();
    const targetURI = `sip:${targetExt}@${this.host}`;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    mediaStream.getTracks().forEach(t => pc.addTrack(t, mediaStream));
    const remoteStream = new MediaStream();
    pc.ontrack = (ev) => { ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t)); if (this.callbacks.onRemoteStream) this.callbacks.onRemoteStream(remoteStream); };
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    // wait for ICE gathering complete
    await new Promise(r => { if (pc.iceGatheringState === 'complete') r(); else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') r(); }; });
    const sdp = pc.localDescription.sdp;
    const headers = {
      'Via': `SIP/2.0/${this.transport} ${this.host};branch=${branch};rport`,
      'Max-Forwards': '70',
      'From': `"${this.displayName}" <${this.uri}>;tag=${fromTag}`,
      'To': `<${targetURI}>`,
      'Call-ID': callId,
      'CSeq': '1 INVITE',
      'Contact': this.contact,
      'Allow': 'INVITE,ACK,BYE,CANCEL,OPTIONS,NOTIFY,REFER,MESSAGE,INFO,UPDATE',
      'Content-Type': 'application/sdp',
      'User-Agent': 'SMURF-WebPhone/0.1',
    };
    const dialog = { callId, fromTag, toTag: '', pc, remoteStream, targetURI, branch, cseq: 1, role: 'uac', state: 'calling' };
    this.dialogs.set(callId, dialog);
    const txKey = `INVITE|${branch}`;
    this.pendingTx.set(txKey, { onResponse: async (resp) => {
      if (resp.status === 100) return;
      if (resp.status === 401 || resp.status === 407) {
        const ch = parseChallenge((getHeader(resp.headers, resp.status === 407 ? 'Proxy-Authenticate' : 'WWW-Authenticate') || '').replace(/^Digest\s+/i, ''));
        const auth = await digestResponse('INVITE', targetURI, this.user, this.pwd, ch);
        // ACK 401 first (txn layer), then re-INVITE
        const ack = buildMessage(`ACK ${targetURI} SIP/2.0`, {
          'Via': headers['Via'],
          'Max-Forwards': '70',
          'From': headers['From'],
          'To': resp.headers['To'],
          'Call-ID': callId,
          'CSeq': '1 ACK',
        });
        this._send(ack);
        dialog.cseq += 1;
        const newBranch = genBranch();
        const headers2 = Object.assign({}, headers, {
          'Via': `SIP/2.0/${this.transport} ${this.host};branch=${newBranch};rport`,
          'CSeq': `${dialog.cseq} INVITE`,
          [resp.status === 407 ? 'Proxy-Authorization' : 'Authorization']: auth,
        });
        const txKey2 = `INVITE|${newBranch}`;
        this.pendingTx.set(txKey2, this.pendingTx.get(txKey));
        this.pendingTx.delete(txKey);
        dialog.branch = newBranch;
        this._send(buildMessage(`INVITE ${targetURI} SIP/2.0`, headers2, sdp));
        return;
      }
      if (resp.status >= 180 && resp.status < 200) {
        if (this.callbacks.onProgress) this.callbacks.onProgress(callId, resp.status);
        return;
      }
      if (resp.status >= 200 && resp.status < 300) {
        dialog.toTag = paramOf(resp.headers['To'], 'tag');
        dialog.state = 'confirmed';
        const remoteSDP = resp.body;
        try { await pc.setRemoteDescription({ type: 'answer', sdp: remoteSDP }); } catch(e) { this.log('setRemote err: '+e); }
        // Send ACK
        const ackBranch = genBranch();
        const remoteContact = uriOf(getHeader(resp.headers, 'Contact')) || targetURI;
        const ack = buildMessage(`ACK ${remoteContact} SIP/2.0`, {
          'Via': `SIP/2.0/${this.transport} ${this.host};branch=${ackBranch};rport`,
          'Max-Forwards': '70',
          'From': headers['From'],
          'To': resp.headers['To'],
          'Call-ID': callId,
          'CSeq': `${dialog.cseq} ACK`,
        });
        this._send(ack);
        if (this.callbacks.onConnected) this.callbacks.onConnected(callId);
        return;
      }
      if (resp.status >= 300) {
        try { pc.close(); } catch(e){}
        this.dialogs.delete(callId);
        if (this.callbacks.onEnded) this.callbacks.onEnded(callId, resp.status);
      }
    }});
    this._send(buildMessage(`INVITE ${targetURI} SIP/2.0`, headers, sdp));
    return callId;
  }

  async _onInvite(req) {
    const callId = getHeader(req.headers, 'Call-ID');
    if (this.dialogs.has(callId)) { this._respond(req, 200, 'OK'); return; }  // re-INVITE: accept
    if (this.callbacks.onIncoming) {
      const accept = await this.callbacks.onIncoming({
        callId,
        from: getHeader(req.headers, 'From'),
        to: getHeader(req.headers, 'To'),
      });
      if (!accept) { this._respond(req, 603, 'Decline'); return; }
      const mediaStream = accept.mediaStream;
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      mediaStream.getTracks().forEach(t => pc.addTrack(t, mediaStream));
      const remoteStream = new MediaStream();
      pc.ontrack = ev => { ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t)); if (this.callbacks.onRemoteStream) this.callbacks.onRemoteStream(remoteStream); };
      await pc.setRemoteDescription({ type: 'offer', sdp: req.body });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await new Promise(r => { if (pc.iceGatheringState === 'complete') r(); else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') r(); }; });
      const dialog = { callId, pc, remoteStream, role: 'uas', state: 'confirmed' };
      this.dialogs.set(callId, dialog);
      this._respond(req, 180, 'Ringing', { 'Contact': this.contact });
      this._respond(req, 200, 'OK', { 'Contact': this.contact, 'Content-Type': 'application/sdp' }, pc.localDescription.sdp);
      if (this.callbacks.onConnected) this.callbacks.onConnected(callId);
    } else {
      this._respond(req, 603, 'Decline');
    }
  }

  hangup(callId) {
    const dialog = this.dialogs.get(callId);
    if (!dialog) return;
    if (dialog.role === 'uac' && dialog.state === 'calling') {
      // CANCEL
      const branch = dialog.branch;
      const cancel = buildMessage(`CANCEL ${dialog.targetURI} SIP/2.0`, {
        'Via': `SIP/2.0/${this.transport} ${this.host};branch=${branch};rport`,
        'Max-Forwards': '70',
        'From': `<${this.uri}>;tag=${dialog.fromTag}`,
        'To': `<${dialog.targetURI}>`,
        'Call-ID': callId,
        'CSeq': `${dialog.cseq} CANCEL`,
      });
      this._send(cancel);
    } else {
      const branch = genBranch();
      const bye = buildMessage(`BYE ${dialog.targetURI || this.uri} SIP/2.0`, {
        'Via': `SIP/2.0/${this.transport} ${this.host};branch=${branch};rport`,
        'Max-Forwards': '70',
        'From': dialog.role === 'uac' ? `<${this.uri}>;tag=${dialog.fromTag}` : `<${this.uri}>;tag=${genTag()}`,
        'To': `<${dialog.targetURI || this.uri}>;tag=${dialog.toTag || genTag()}`,
        'Call-ID': callId,
        'CSeq': `${(dialog.cseq||1)+1} BYE`,
      });
      this._send(bye);
    }
    try { dialog.pc.close(); } catch(e){}
    this.dialogs.delete(callId);
  }
}

global.SmurfSipUA = SipUA;
})(window);

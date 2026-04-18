// SMURF Admin SPA — vanilla JS, no frameworks.
const TOKEN = () => localStorage.getItem('smurf.token');
const USER = () => localStorage.getItem('smurf.user');
const ROLE = () => localStorage.getItem('smurf.role');

function api(path, opts={}) {
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  if (TOKEN()) opts.headers['Authorization'] = 'Bearer ' + TOKEN();
  return fetch(path, opts).then(r => {
    if (r.status === 401) { localStorage.clear(); location.href = '/login'; throw new Error('unauthorized'); }
    return r;
  });
}
function jget(path) { return api(path).then(r=>r.json()); }
function jpost(path, body) { return api(path, {method:'POST', body: JSON.stringify(body||{})}).then(r=>r.json()); }
function jput(path, body) { return api(path, {method:'PUT', body: JSON.stringify(body||{})}).then(r=>r.json()); }
function jdel(path) { return api(path, {method:'DELETE'}).then(r=>r.json()); }

const view = document.getElementById('view');
const title = document.getElementById('title');
const tabs = {};

function tab(name, label, render) { tabs[name] = { label, render }; }

function el(html) {
  // Use <template> so table rows / cells parse correctly outside of a table.
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escape(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function modal(html, onMount) {
  const bg = el(`<div class="modal-bg"><div class="modal">${html}</div></div>`);
  document.body.appendChild(bg);
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  if (onMount) onMount(bg.firstElementChild);
  return { close: () => bg.remove(), root: bg.firstElementChild };
}

// ---------- Dashboard ----------
tab('dashboard', 'Dashboard', async () => {
  const [exts, regs, trunks, cdr, calls] = await Promise.all([
    jget('/api/extensions'), jget('/api/registrations'),
    jget('/api/trunks'), jget('/api/cdr?limit=200'), jget('/api/calls/active'),
  ]);
  const today = cdr.filter(r => (r.started_at || '').slice(0,10) === new Date().toISOString().slice(0,10)).length;
  view.innerHTML = `
    <div class="cards">
      <div class="kcard"><b>${calls.length}</b><span>Active calls</span></div>
      <div class="kcard"><b>${regs.length}</b><span>Registered extensions</span></div>
      <div class="kcard"><b>${exts.length}</b><span>Total extensions</span></div>
      <div class="kcard"><b>${trunks.length}</b><span>Trunks</span></div>
      <div class="kcard"><b>${today}</b><span>Calls today</span></div>
      <div class="kcard"><b>${cdr.length}</b><span>Calls (recent)</span></div>
    </div>
    <h3>Active calls</h3>
    <table id="calls-tbl"><thead><tr><th>Call ID</th><th>From</th><th>To</th><th>Started</th><th>Direction</th><th>Codec</th><th></th></tr></thead><tbody></tbody></table>
    <h3 style="margin-top:18px">Recent CDR</h3>
    <table id="cdr-tbl"><thead><tr><th>Time</th><th>From</th><th>To</th><th>Duration</th><th>Disposition</th></tr></thead><tbody></tbody></table>
  `;
  const tbody = view.querySelector('#calls-tbl tbody');
  calls.forEach(c => tbody.appendChild(el(`<tr><td><code>${escape(c.call_id.slice(0,16))}</code></td><td>${escape(c.src)}</td><td>${escape(c.dst)}</td><td>${new Date(c.started_at*1000).toLocaleTimeString()}</td><td>${escape(c.direction)}</td><td>${escape(c.a_codec||'-')} / ${escape(c.b_codec||'-')}</td><td><button class="btn danger" onclick="hangCall('${escape(c.call_id)}')">Hangup</button></td></tr>`)));
  const cdrBody = view.querySelector('#cdr-tbl tbody');
  cdr.slice(0,30).forEach(r => cdrBody.appendChild(el(`<tr><td>${escape(r.started_at)}</td><td>${escape(r.src)}</td><td>${escape(r.dst)}</td><td>${r.billsec||0}s</td><td>${escape(r.disposition)}</td></tr>`)));

  document.getElementById('kpi-active').textContent = `${calls.length} active`;
  document.getElementById('kpi-online').textContent = `${regs.length} online`;
  document.getElementById('kpi-trunks').textContent = `${trunks.length} trunks`;
  document.getElementById('kpi-today').textContent = `${today} today`;
});

window.hangCall = (id) => jpost('/api/calls/' + encodeURIComponent(id) + '/hangup', {}).then(()=>activate('dashboard'));

// ---------- Extensions ----------
tab('extensions', 'Extensions', async () => {
  const exts = await jget('/api/extensions');
  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" id="add-ext">+ New extension</button>
      <input id="ext-search" placeholder="Search…" />
    </div>
    <table><thead><tr><th>Number</th><th>Name</th><th>Status</th><th>Email</th><th>Voicemail</th><th>Record</th><th>Max</th><th></th></tr></thead><tbody id="ext-body"></tbody></table>
  `;
  const body = view.querySelector('#ext-body');
  function render(filter='') {
    body.innerHTML = '';
    exts.filter(e => !filter || (e.number+e.display_name).toLowerCase().includes(filter.toLowerCase())).forEach(e => {
      body.appendChild(el(`<tr>
        <td><b>${escape(e.number)}</b></td>
        <td>${escape(e.display_name)}</td>
        <td><span class="badge ${e.online ? 'green' : 'gray'}">${e.online ? 'online' : 'offline'}</span></td>
        <td>${escape(e.email||'')}</td>
        <td>${e.voicemail_enabled ? 'PIN '+escape(e.voicemail_pin||''): 'off'}</td>
        <td>${e.record_calls ? 'Yes':'No'}</td>
        <td>${e.max_concurrent}</td>
        <td class="row-actions">
          <button onclick='editExt(${JSON.stringify(e)})'>Edit</button>
          <button class="btn danger" onclick='delExt(${JSON.stringify(e.number)})'>Delete</button>
        </td>
      </tr>`));
    });
  }
  render();
  view.querySelector('#ext-search').addEventListener('input', e => render(e.target.value));
  view.querySelector('#add-ext').addEventListener('click', () => editExt({}));
});

window.editExt = function(e) {
  const isNew = !e.number;
  modal(`
    <h3>${isNew ? 'New' : 'Edit'} Extension</h3>
    <div class="form-grid">
      <label>Number<input id="f-number" value="${escape(e.number||'')}" ${isNew?'':'disabled'} /></label>
      <label>Display name<input id="f-name" value="${escape(e.display_name||'')}" /></label>
      <label>Secret<input id="f-secret" placeholder="${isNew ? 'auto-generated' : 'leave blank to keep'}" value="${escape(e.secret||'')}" /></label>
      <label>Email<input id="f-email" value="${escape(e.email||'')}" /></label>
      <label>Voicemail PIN<input id="f-pin" value="${escape(e.voicemail_pin||'')}" /></label>
      <label>Max concurrent<input id="f-max" type="number" value="${e.max_concurrent||2}" /></label>
      <label class="full row"><input id="f-vm" type="checkbox" ${e.voicemail_enabled !== 0 ? 'checked':''}/> Voicemail enabled</label>
      <label class="full row"><input id="f-rec" type="checkbox" ${e.record_calls ? 'checked':''}/> Record calls</label>
      <label class="full row"><input id="f-dnd" type="checkbox" ${e.do_not_disturb ? 'checked':''}/> Do not disturb</label>
    </div>
    <div class="modal-actions">
      <button id="cancel" class="btn ghost">Cancel</button>
      <button id="save" class="btn primary">Save</button>
    </div>`, root => {
    root.querySelector('#cancel').onclick = () => root.parentElement.remove();
    root.querySelector('#save').onclick = async () => {
      const body = {
        display_name: root.querySelector('#f-name').value,
        email: root.querySelector('#f-email').value,
        voicemail_pin: root.querySelector('#f-pin').value,
        max_concurrent: parseInt(root.querySelector('#f-max').value || '2'),
        voicemail_enabled: root.querySelector('#f-vm').checked ? 1 : 0,
        record_calls: root.querySelector('#f-rec').checked ? 1 : 0,
        do_not_disturb: root.querySelector('#f-dnd').checked ? 1 : 0,
      };
      const sec = root.querySelector('#f-secret').value;
      if (sec) body.secret = sec;
      if (isNew) {
        body.number = root.querySelector('#f-number').value;
        await jpost('/api/extensions', body);
      } else {
        await jput('/api/extensions/' + encodeURIComponent(e.number), body);
      }
      root.parentElement.remove();
      activate('extensions');
    };
  });
};
window.delExt = async function(num) {
  if (!confirm('Delete extension ' + num + '?')) return;
  await jdel('/api/extensions/' + encodeURIComponent(num));
  activate('extensions');
};

// ---------- Trunks ----------
tab('trunks', 'Trunks', async () => {
  const trunks = await jget('/api/trunks');
  view.innerHTML = `
    <div class="toolbar"><button class="btn primary" id="add-tk">+ New trunk</button></div>
    <table><thead><tr><th>Name</th><th>Host</th><th>Transport</th><th>Auth</th><th>Register</th><th>Enabled</th><th></th></tr></thead>
    <tbody id="tk-body"></tbody></table>`;
  const body = view.querySelector('#tk-body');
  trunks.forEach(t => body.appendChild(el(`<tr>
    <td>${escape(t.name)}</td><td>${escape(t.host)}:${t.port}</td><td>${escape(t.transport)}</td>
    <td>${escape(t.auth_mode)}</td><td>${t.register?'Yes':'No'}</td>
    <td><span class="badge ${t.enabled?'green':'gray'}">${t.enabled?'enabled':'disabled'}</span></td>
    <td><button class="btn danger" onclick='delTrunk(${t.id})'>Delete</button></td>
  </tr>`)));
  view.querySelector('#add-tk').onclick = () => modal(`
    <h3>New trunk</h3>
    <div class="form-grid">
      <label>Name<input id="f-name" /></label>
      <label>Host<input id="f-host" /></label>
      <label>Port<input id="f-port" type="number" value="5060"/></label>
      <label>Transport
        <select id="f-tr"><option value="udp">UDP</option><option value="tcp">TCP</option><option value="tls">TLS</option></select>
      </label>
      <label>Username<input id="f-user" /></label>
      <label>Secret<input id="f-secret" /></label>
      <label>Caller ID<input id="f-cid" /></label>
      <label>Auth mode
        <select id="f-auth"><option value="credentials">credentials</option><option value="ip">IP</option></select>
      </label>
      <label class="row"><input id="f-reg" type="checkbox" checked /> Register</label>
      <label class="row"><input id="f-enabled" type="checkbox" checked /> Enabled</label>
    </div>
    <div class="modal-actions">
      <button id="cancel" class="btn ghost">Cancel</button>
      <button id="save" class="btn primary">Save</button>
    </div>
  `, root => {
    root.querySelector('#cancel').onclick = () => root.parentElement.remove();
    root.querySelector('#save').onclick = async () => {
      await jpost('/api/trunks', {
        name: root.querySelector('#f-name').value,
        host: root.querySelector('#f-host').value,
        port: parseInt(root.querySelector('#f-port').value || '5060'),
        transport: root.querySelector('#f-tr').value,
        username: root.querySelector('#f-user').value,
        secret: root.querySelector('#f-secret').value,
        caller_id: root.querySelector('#f-cid').value,
        auth_mode: root.querySelector('#f-auth').value,
        register: root.querySelector('#f-reg').checked,
        enabled: root.querySelector('#f-enabled').checked,
      });
      root.parentElement.remove();
      activate('trunks');
    };
  });
});
window.delTrunk = async (id) => { if (confirm('Delete trunk?')) { await jdel('/api/trunks/' + id); activate('trunks'); } };

// ---------- Dial plan ----------
tab('dialplan', 'Dial Plan', async () => {
  const rules = await jget('/api/dialplan');
  view.innerHTML = `
    <div class="toolbar"><button class="btn primary" id="add-dp">+ New rule</button></div>
    <table><thead><tr><th>Pri</th><th>Name</th><th>Direction</th><th>Pattern</th><th>Action</th><th>Target</th><th>Strip/Prepend</th><th></th></tr></thead><tbody id="dp-body"></tbody></table>`;
  const body = view.querySelector('#dp-body');
  rules.forEach(r => body.appendChild(el(`<tr>
    <td>${r.priority}</td><td>${escape(r.name)}</td><td>${escape(r.direction)}</td>
    <td><code>${escape(r.pattern)}</code></td><td>${escape(r.action)}</td><td>${escape(r.target)}</td>
    <td>${r.strip}/${escape(r.prepend||'')}</td>
    <td><button class="btn danger" onclick='delDP(${r.id})'>Delete</button></td>
  </tr>`)));
  view.querySelector('#add-dp').onclick = () => modal(`
    <h3>New dial plan rule</h3>
    <div class="form-grid">
      <label>Name<input id="f-name"/></label>
      <label>Direction<select id="f-dir"><option value="outbound">outbound</option><option value="inbound">inbound</option></select></label>
      <label>Pattern (regex)<input id="f-pat" placeholder="^9(\\d+)$"/></label>
      <label>Action
        <select id="f-act">
          <option value="extension">extension</option>
          <option value="trunk">trunk</option>
          <option value="ring_group">ring_group</option>
          <option value="queue">queue</option>
          <option value="ivr">ivr</option>
          <option value="voicemail">voicemail</option>
          <option value="conference">conference</option>
          <option value="echo">echo</option>
          <option value="hangup">hangup</option>
        </select>
      </label>
      <label>Target<input id="f-tgt" placeholder="trunk-name / extension / $1"/></label>
      <label>Strip<input id="f-strip" type="number" value="0"/></label>
      <label>Prepend<input id="f-prep"/></label>
      <label>Priority<input id="f-pri" type="number" value="10"/></label>
    </div>
    <div class="modal-actions">
      <button id="cancel" class="btn ghost">Cancel</button>
      <button id="save" class="btn primary">Save</button>
    </div>
  `, root => {
    root.querySelector('#cancel').onclick = () => root.parentElement.remove();
    root.querySelector('#save').onclick = async () => {
      await jpost('/api/dialplan', {
        name: root.querySelector('#f-name').value,
        direction: root.querySelector('#f-dir').value,
        pattern: root.querySelector('#f-pat').value,
        action: root.querySelector('#f-act').value,
        target: root.querySelector('#f-tgt').value,
        strip: parseInt(root.querySelector('#f-strip').value||'0'),
        prepend: root.querySelector('#f-prep').value,
        priority: parseInt(root.querySelector('#f-pri').value||'10'),
      });
      root.parentElement.remove();
      activate('dialplan');
    };
  });
});
window.delDP = async (id) => { if (confirm('Delete rule?')) { await jdel('/api/dialplan/' + id); activate('dialplan'); } };

// ---------- Generic resource pages ----------
function genericList(name, path, columns) {
  return async () => {
    const rows = await jget(path);
    view.innerHTML = `<table><thead><tr>${columns.map(c=>`<th>${escape(c.label)}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
    const body = view.querySelector('tbody');
    rows.forEach(r => body.appendChild(el(`<tr>${columns.map(c=>`<td>${escape(c.fmt ? c.fmt(r): r[c.key]||'')}</td>`).join('')}</tr>`)));
  };
}

tab('ringgroups', 'Ring Groups', genericList('ringgroups', '/api/ring-groups', [
  {key:'number', label:'Number'}, {key:'name', label:'Name'},
  {key:'strategy', label:'Strategy'},
  {key:'members', label:'Members', fmt: r => (r.members||[]).join(', ')},
  {key:'timeout', label:'Timeout'}, {key:'fail_target', label:'On no answer'},
]));
tab('queues', 'Queues', genericList('queues', '/api/queues', [
  {key:'number', label:'Number'}, {key:'name', label:'Name'},
  {key:'strategy', label:'Strategy'},
  {key:'members', label:'Agents', fmt: r => (r.members||[]).join(', ')},
  {key:'max_wait', label:'Max wait'},
]));
tab('ivrs', 'IVRs', genericList('ivrs', '/api/ivrs', [
  {key:'number', label:'Number'}, {key:'name', label:'Name'},
  {key:'timeout', label:'Timeout'}, {key:'options', label:'Options', fmt: r => Object.entries(r.options||{}).map(([k,v])=>k+'→'+v).join(', ')},
]));
tab('conferences', 'Conferences', async () => {
  view.innerHTML = '<p class="muted">Conference rooms are dialed by number 8XXX. Use the Ring Group / IVR pages to wire entry points.</p>';
});

// ---------- CDR / Recordings / Voicemail / Chat ----------
tab('cdr', 'Call Records', async () => {
  const cdr = await jget('/api/cdr?limit=500');
  view.innerHTML = `
    <div class="toolbar">
      <a class="btn" href="/api/cdr.csv?limit=10000" target="_blank">Download CSV</a>
    </div>
    <table><thead><tr><th>ID</th><th>Started</th><th>Answered</th><th>Ended</th><th>From</th><th>To</th><th>Dur</th><th>Bill</th><th>Disp</th><th>Cause</th><th>Rec</th></tr></thead><tbody></tbody></table>`;
  const body = view.querySelector('tbody');
  cdr.forEach(r => body.appendChild(el(`<tr>
    <td>${r.id}</td><td>${escape(r.started_at)}</td><td>${escape(r.answered_at||'')}</td><td>${escape(r.ended_at||'')}</td>
    <td>${escape(r.src)}</td><td>${escape(r.dst)}</td><td>${r.duration||0}s</td><td>${r.billsec||0}s</td>
    <td>${escape(r.disposition)}</td><td>${escape(r.hangup_cause||'')}</td>
    <td>${r.recording_path ? '<a href="'+r.recording_path+'">file</a>' : ''}</td>
  </tr>`)));
});

tab('recordings', 'Recordings', async () => {
  const rs = await jget('/api/recordings');
  view.innerHTML = '<table><thead><tr><th>ID</th><th>Time</th><th>From</th><th>To</th><th>Dur</th><th>Audio</th></tr></thead><tbody></tbody></table>';
  const body = view.querySelector('tbody');
  rs.forEach(r => body.appendChild(el(`<tr>
    <td>${r.id}</td><td>${escape(r.created_at)}</td><td>${escape(r.src)}</td><td>${escape(r.dst)}</td><td>${r.duration}s</td>
    <td><audio controls src="/api/recordings/${r.id}/download"></audio></td>
  </tr>`)));
});

tab('voicemail', 'Voicemail', async () => {
  const exts = await jget('/api/extensions');
  view.innerHTML = `
    <div class="toolbar">
      <select id="vm-ext">${exts.map(e => `<option value="${escape(e.number)}">${escape(e.number)} — ${escape(e.display_name)}</option>`).join('')}</select>
    </div>
    <table id="vm-table"><thead><tr><th>ID</th><th>Caller</th><th>Time</th><th>Dur</th><th>Audio</th><th></th></tr></thead><tbody></tbody></table>
  `;
  async function load() {
    const ext = view.querySelector('#vm-ext').value;
    const list = await jget('/api/voicemail/' + encodeURIComponent(ext));
    const body = view.querySelector('#vm-table tbody'); body.innerHTML = '';
    list.forEach(m => body.appendChild(el(`<tr>
      <td>${m.id}</td><td>${escape(m.caller)}</td><td>${escape(m.created_at)}</td><td>${m.duration}s</td>
      <td><audio controls src="/api/voicemail/${escape(ext)}/${m.id}/audio"></audio></td>
      <td><button class="btn danger" onclick="vmDel('${escape(ext)}',${m.id})">Delete</button></td>
    </tr>`)));
  }
  view.querySelector('#vm-ext').addEventListener('change', load);
  load();
});
window.vmDel = async (ext, id) => { if (confirm('Delete voicemail?')) { await jdel('/api/voicemail/'+encodeURIComponent(ext)+'/'+id); activate('voicemail'); } };

tab('chat', 'Chat', async () => {
  view.innerHTML = `<p class="muted">Internal chat threads. Send messages between extensions; events stream live to softphones.</p>
    <div class="toolbar"><input id="me" placeholder="my ext"/><input id="peer" placeholder="peer ext"/><input id="msg" placeholder="message" /><button class="btn primary" id="send">Send</button></div>
    <table id="chat-tbl"><thead><tr><th>Time</th><th>From</th><th>To</th><th>Body</th></tr></thead><tbody></tbody></table>`;
  view.querySelector('#send').onclick = async () => {
    const me = view.querySelector('#me').value;
    const peer = view.querySelector('#peer').value;
    const body = view.querySelector('#msg').value;
    if (!me || !peer || !body) return;
    await jpost('/api/chat/send', {sender: me, recipient: peer, body});
    view.querySelector('#msg').value = '';
    refreshChat();
  };
  async function refreshChat() {
    const me = view.querySelector('#me').value;
    const peer = view.querySelector('#peer').value;
    if (!me || !peer) return;
    const hist = await jget('/api/chat/history?a=' + encodeURIComponent(me) + '&b=' + encodeURIComponent(peer));
    const body = view.querySelector('#chat-tbl tbody'); body.innerHTML = '';
    hist.forEach(h => body.appendChild(el(`<tr><td>${escape(h.created_at)}</td><td>${escape(h.sender)}</td><td>${escape(h.recipient)}</td><td>${escape(h.body)}</td></tr>`)));
  }
  view.querySelector('#peer').addEventListener('change', refreshChat);
});

// ---------- Settings ----------
tab('settings', 'Settings', async () => {
  const s = await jget('/api/settings');
  const fields = ['domain','external_ip','sip_udp_port','sip_tcp_port','sip_tls_port','sip_ws_port','sip_wss_port','rtp_port_min','rtp_port_max','max_concurrent_calls','registration_default_expiry','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','log_level','fail2ban_max_attempts','fail2ban_window_seconds','fail2ban_ban_seconds'];
  view.innerHTML = `<form id="settings-form" class="form-grid" style="max-width:740px"></form>
                    <div class="modal-actions" style="max-width:740px"><button class="btn primary" id="save-set">Save</button></div>`;
  const f = view.querySelector('#settings-form');
  fields.forEach(k => {
    f.appendChild(el(`<label>${escape(k)}<input data-k="${escape(k)}" value="${escape(s[k] ?? '')}" /></label>`));
  });
  view.querySelector('#save-set').onclick = async () => {
    const out = {};
    f.querySelectorAll('input').forEach(i => {
      let v = i.value;
      if (/_port|_seconds|_attempts|_min|_max|_calls|_expiry/.test(i.dataset.k)) v = parseInt(v||'0');
      out[i.dataset.k] = v;
    });
    await jput('/api/settings', out);
    alert('Saved.');
  };
});

// ---------- Live logs ----------
tab('logs', 'Live Logs', async () => {
  view.innerHTML = `<pre class="log" id="live"></pre>`;
  const live = view.querySelector('#live');
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws/events?token=' + encodeURIComponent(TOKEN()||'');
  const ws = new WebSocket(url);
  ws.onmessage = (m) => {
    const ev = JSON.parse(m.data);
    const t = new Date(ev.ts*1000).toLocaleTimeString();
    live.textContent += `[${t}] ${ev.topic}  ${JSON.stringify(ev.payload)}\n`;
    live.scrollTop = live.scrollHeight;
  };
  // close socket if user navigates away
  view.dataset.cleanup = '1';
  view.__ws = ws;
});

// ---------- Activation ----------
function activate(name) {
  if (!tabs[name]) name = 'dashboard';
  // cleanup any open WS in previous view
  const prev = view.__ws; if (prev) try { prev.close(); } catch(e){}
  view.__ws = null;
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
  title.textContent = tabs[name].label;
  return tabs[name].render();
}
document.querySelectorAll('.sidebar nav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); activate(a.dataset.tab); }));
document.getElementById('logout').addEventListener('click', async (e) => { e.preventDefault(); await api('/api/auth/logout', {method:'POST'}).catch(()=>{}); localStorage.clear(); location.href = '/login'; });

(async function init() {
  try {
    const me = await jget('/api/auth/me');
    document.getElementById('who').textContent = me.username + ' (' + me.role + ')';
    activate('dashboard');
    // Subscribe to events to refresh KPIs
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws/events?token=' + encodeURIComponent(TOKEN()||'');
    const ws = new WebSocket(url);
    ws.onmessage = async () => {
      // Lightweight refresh: only when on dashboard
      if (title.textContent === 'Dashboard') {
        const calls = await jget('/api/calls/active').catch(()=>[]);
        const regs = await jget('/api/registrations').catch(()=>[]);
        document.getElementById('kpi-active').textContent = `${calls.length} active`;
        document.getElementById('kpi-online').textContent = `${regs.length} online`;
      }
    };
  } catch (e) {
    location.href = '/login';
  }
})();

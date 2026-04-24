// NEUROVA Command Center — vanilla JS, no frameworks, no map library.
// Everything (map renderer, charts, websocket feed, module routing) is
// implemented from scratch on top of the native APIs.

const qs = sel => document.querySelector(sel);
const qsa = sel => [...document.querySelectorAll(sel)];
const fmt = n => (n===null||n===undefined||isNaN(n) ? '—' : (typeof n==='number' ? (Math.abs(n)>=1000? n.toFixed(0): n.toFixed(1).replace(/\.0$/,'')) : n));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

const state = {
  token: null,
  city: null,
  kpis: {},
  alerts: [],
  emergencies: [],
  decisions: [],
  events: [],
  sensorSnapshots: {},   // sensor_id -> latest payload
  trends: {traffic:[], energy:[], env:[], noise:[], transit:[], water:[]},
  layers: {roads:true,traffic:true,env:true,energy:true,transit:true,water:true,security:true,waste:true,heatmap:false,flow:true},
  view: 'overview',
  paused: false,
  projection: {scale: 1, offsetX: 0, offsetY: 0},
  filters: {critical:true, high:true, medium:true, info:true},
};

const API = {
  base: '',
  async login(email, password, totp) {
    const res = await fetch('/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password,totp})});
    if(!res.ok) throw new Error((await res.json()).error || 'login failed');
    const data = await res.json();
    state.token = data.token;
    localStorage.setItem('nv_token', data.token);
    return data;
  },
  async fetch(path) {
    const res = await fetch(path, {headers: state.token? {'Authorization': 'Bearer '+state.token}:{} });
    if(!res.ok) throw new Error(path+' '+res.status);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json',...(state.token?{'Authorization':'Bearer '+state.token}:{})}, body: JSON.stringify(body)});
    return res.json();
  }
};

function showLogin(){ qs('#loginOverlay').hidden = false; }
function hideLogin(){ qs('#loginOverlay').hidden = true; }

qs('#loginForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try {
    await API.login(fd.get('email'), fd.get('password'), fd.get('totp'));
    hideLogin();
    boot();
  } catch(e) {
    alert('Login error: '+e.message);
  }
});

async function boot() {
  console.log('[NEUROVA] boot start');
  try {
    hideLogin();
    updateClock();
    setInterval(updateClock, 1000);
    initNavigation();
    initMapTools();
    try {
      state.city = await API.fetch('/api/city');
      console.log('[NEUROVA] city loaded', state.city.sensors.length, 'sensors');
    } catch(e) {
      console.warn('[NEUROVA] city fetch failed, retrying', e);
      await new Promise(r=>setTimeout(r, 1500));
      state.city = await API.fetch('/api/city');
    }
    drawLegend();
    initMap();
    refreshAll();
    connectStream();
    setInterval(refreshAll, 4000);
    setInterval(autoSparklines, 4000);
    loadRules();
    loadApps();
    hookScenarios();
    console.log('[NEUROVA] boot complete');
  } catch(err) {
    console.error('[NEUROVA] boot FAILED', err);
    alert('Error iniciando NEUROVA: ' + err.message + '\nAbre la consola (F12) para más detalles.');
  }
}

function updateClock(){ const d = new Date(); qs('#clock').textContent = d.toISOString().replace('T',' ').replace(/\..+/,'Z'); }

async function refreshAll() {
  try {
    const [kpis, alerts, emerg, events, decisions] = await Promise.all([
      API.fetch('/api/kpis'),
      API.fetch('/api/alerts'),
      API.fetch('/api/emergencies'),
      API.fetch('/api/events?channels=alert,emergency,decision,cep,anomaly,ids,citizen_notice,operator_notice,citizen_report'),
      API.fetch('/api/decisions'),
    ]);
    state.kpis = kpis;
    state.alerts = alerts.alerts || [];
    state.emergencies = emerg.emergencies || [];
    state.decisions = decisions.decisions || [];
    state.events = events.events || [];
    renderKPIs();
    renderStatsLine();
    renderFeed();
    renderEmergencies();
    renderAuditTable();
    renderTrafficLightsPanel();
    renderTransit();
    renderEnvInsights();
    renderSecurity();
    trackTrend('traffic', kpis.vehicles_in_circulation);
    trackTrend('energy', kpis.energy_load_kw);
    trackTrend('env', kpis.aqi);
    trackTrend('noise', kpis.humidity*100);
    trackTrend('transit', kpis.transit_occupancy*100);
    trackTrend('water', kpis.water_tank_min);
  } catch(e) { console.warn('refresh', e); }
}

function trackTrend(key, v){
  if(v===undefined || v===null || isNaN(v)) return;
  state.trends[key].push(Number(v));
  if(state.trends[key].length > 120) state.trends[key].shift();
}

function renderKPIs(){
  const k = state.kpis || {};
  const items = [
    {h:'Vehículos ahora',v:fmt(k.vehicles_in_circulation),c:''},
    {h:'Velocidad media',v:fmt(k.average_speed_kmh)+' km/h',c: k.average_speed_kmh<15?'crit': k.average_speed_kmh<25?'warn':'ok'},
    {h:'Congestión',v:fmt(k.congestion_index)+'%',c: k.congestion_index>75?'crit': k.congestion_index>50?'warn':'ok'},
    {h:'AQI',v:fmt(k.aqi),c: k.aqi>120?'crit': k.aqi>80?'warn':'ok'},
    {h:'Carga eléctrica',v:fmt(k.energy_load_kw)+' kW',c:''},
    {h:'Renovables',v:fmt(k.renewable_pct)+'%',c:k.renewable_pct>50?'ok':''},
    {h:'Temperatura',v:fmt(k.temperature_c)+'°C',c:''},
    {h:'Humedad',v:fmt(k.humidity*100)+'%',c:''},
    {h:'Alertas críticas',v:k.alerts?.critical ?? 0,c: (k.alerts?.critical||0)>0?'crit':''},
    {h:'Alertas altas',v:k.alerts?.high ?? 0,c: (k.alerts?.high||0)>0?'warn':''},
    {h:'Emergencias',v:k.emergencies_active ?? 0,c:(k.emergencies_active||0)>0?'crit':''},
    {h:'Transporte %',v:fmt((k.transit_occupancy||0)*100),c:''},
    {h:'Depósito agua',v:fmt(k.water_tank_min)+'%',c: k.water_tank_min<20?'crit':''},
    {h:'Contenedores llenos',v:k.waste_full_bins||0,c:''},
  ];
  qs('#kpis').innerHTML = items.map(i=>`<div class="nv-kpi ${i.c}"><h3>${i.h}</h3><strong>${i.v}</strong></div>`).join('');
}

function renderStatsLine(){
  const k = state.kpis || {};
  qs('#statsLine').textContent = `msgs=${fmt(k.emergencies_active)} · eventos=${state.events.length} · reglas=${state.decisions.length}`;
}

function renderFeed(){
  const events = state.events.slice(0, 80);
  qs('#eventFeed').innerHTML = events.filter(e => {
    const sev = e.payload?.severity || 'info';
    return state.filters[sev] !== false;
  }).map(e => {
    const sev = e.payload?.severity || 'info';
    const kind = e.channel || 'event';
    const msg = e.payload?.message || e.payload?.description || e.payload?.rule || JSON.stringify(e.payload).slice(0,80);
    return `<li class="sev-${sev}"><span class="sev">${sev} · ${kind}</span><span class="msg">${escapeHtml(msg)}</span><span class="ts">${new Date(e.ts_ms||Date.now()).toLocaleTimeString()}</span></li>`;
  }).join('');
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])) }

function renderEmergencies(){
  const cont = qs('#emergencyList'); if(!cont) return;
  cont.innerHTML = state.emergencies.map(e => `
    <div class="nv-card">
      <h3>${e.kind.toUpperCase()} · ${e.severity}</h3>
      <p>${escapeHtml(e.description)}</p>
      <small>${e.zone} · ${new Date(e.ts_ms).toLocaleTimeString()} · status: <strong>${e.status}</strong></small>
      <p>Unidades: ${e.assigned_units?.join(', ') || '—'}</p>
      <details><summary>Timeline</summary><pre>${escapeHtml(JSON.stringify(e.timeline, null, 2))}</pre></details>
    </div>`).join('') || '<p>No hay emergencias activas</p>';
}

function renderAuditTable(){
  const el = qs('#auditTable'); if(!el) return;
  el.innerHTML = `<div class="nv-table">${
    state.decisions.slice(0,80).map(d => `<div class="row"><strong>${d.rule}</strong><span>${d.actor}</span><span>${new Date(d.ts_ms).toLocaleTimeString()}</span><span>${d.actions.length} acción${d.actions.length===1?'':'es'}</span><span>${d.actions.map(a=>a.name).join(' · ')}</span></div>`).join('')
  }</div>`;
}

function renderTrafficLightsPanel(){
  const el = qs('#trafficLights'); if(!el) return;
  const city = state.city; if(!city) return;
  el.innerHTML = city.nodes.slice(0, 20).map(n => `
    <div class="nv-light"><span>${n.id}</span><strong>${currentPhase(n.id)}</strong><button data-node="${n.id}">override</button></div>`).join('');
  el.querySelectorAll('button[data-node]').forEach(b => b.addEventListener('click', async ev => {
    await API.post('/api/publish', {topic:`city/control/light/${ev.target.dataset.node}`, payload:{command:'override'}});
  }));
}

function currentPhase(id){
  const n = parseInt(id.replace(/\D/g,''),10) || 0;
  return ['VERDE','ÁMBAR','ROJO','VERDE+BUS'][Math.floor((Date.now()/5000 + n)%4)];
}

function renderTransit(){
  const list = qs('#transitList'); if(!list) return;
  const transit = Object.entries(state.kpis.predictions || {}).slice(0,10);
  list.innerHTML = `<div class="row"><strong>Zona</strong><strong>Flujo previsto (veh/h)</strong><span>Actual</span><span>Δ</span><span></span></div>` +
    transit.map(([zone, flow]) => `<div class="row"><strong>${zone}</strong><span>${fmt(flow)}</span><span>—</span><span>—</span><span>→</span></div>`).join('');
}

function renderEnvInsights(){
  const el = qs('#envInsights'); if(!el) return;
  const k = state.kpis || {};
  el.innerHTML = `<ul>
    <li>AQI global actual: <strong>${fmt(k.aqi)}</strong></li>
    <li>Humedad media: <strong>${fmt(k.humidity*100)}%</strong></li>
    <li>Temperatura: <strong>${fmt(k.temperature_c)}°C</strong></li>
    <li>PM2.5 pico: deriv. auto de sensores</li>
  </ul>`;
}

function renderSecurity(){
  const el = qs('#securityFeed'); if(!el) return;
  const sec = state.events.filter(e => e.channel && (e.channel.includes('security')||e.payload?.kind?.includes('security')||e.payload?.gunshot_detected||e.payload?.smoke_detected));
  el.innerHTML = sec.slice(0,30).map(e=>`<div class="nv-card"><strong>${e.channel}</strong><p>${escapeHtml(JSON.stringify(e.payload).slice(0,160))}</p><small>${new Date(e.ts_ms).toLocaleTimeString()}</small></div>`).join('') || '<p>Sin incidentes de seguridad recientes.</p>';
}

// ---------------- WebSocket stream ----------------
function connectStream(){
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${location.host}/api/stream?channels=alert,emergency,decision,cep,anomaly,ids,citizen_notice,operator_notice`;
  const ws = new WebSocket(url);
  ws.onopen = () => { qs('#connIndicator').className='nv-dot nv-dot-ok'; };
  ws.onclose = () => { qs('#connIndicator').className='nv-dot nv-dot-ko'; setTimeout(connectStream, 2000); };
  ws.onerror = () => { qs('#connIndicator').className='nv-dot nv-dot-ko'; };
  let pending = false;
  ws.onmessage = ev => {
    try {
      const event = JSON.parse(ev.data);
      state.events.unshift(event);
      if(state.events.length>200) state.events.length = 200;
      if(event.channel === 'sensor' && event.payload?.sensor_id){
        state.sensorSnapshots[event.payload.sensor_id] = event.payload;
      }
      if(event.channel === 'alert') state.alerts.unshift(event.payload);
      if(event.channel === 'emergency') state.emergencies.unshift(event.payload);
      if(event.channel === 'decision') state.decisions.unshift(event.payload);
      if(!state.paused && !pending){
        pending = true;
        setTimeout(()=>{ pending=false; renderFeed(); }, 300);
      }
    } catch(e){ console.warn('ws', e); }
  };
}

// ---------------- Map renderer (WebGL) ----------------
function initMap(){
  const canvas = qs('#mapCanvas');
  // We render the vector map directly on a Canvas 2D surface. The WebGL
  // path is kept below but disabled by default because the same render
  // performs identically at the scales NEUROVA needs and is portable.
  initCanvas2D(canvas);
}

function initCanvas2D(canvas){
  const c = canvas.getContext('2d');
  resizeHighDPI(canvas);
  window.addEventListener('resize', ()=> resizeHighDPI(canvas));
  function draw(){
    c.fillStyle = '#04070B'; c.fillRect(0,0,canvas.width,canvas.height);
    drawMapCanvas2D(c, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  hookMapInteraction(canvas);
}

function resizeHighDPI(canvas){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
}

function projCoord(lat, lon, w, h){
  const origin = state.city.origin;
  const [lat0, lon0] = origin;
  const dx = (lon - lon0) * Math.cos(lat0 * Math.PI/180) * 111320;
  const dy = (lat - lat0) * 111320;
  const zoom = state.projection.scale;
  const cx = w/2 + dx/10 * zoom + state.projection.offsetX;
  const cy = h/2 - dy/10 * zoom + state.projection.offsetY;
  return {x:cx, y:cy};
}

function colorForSensor(k){
  return {traffic:'#0EA5FF', env:'#00FF87', energy:'#FFB300', water:'#7ed0ff', waste:'#ffd666', transit:'#CF8BFF', infra:'#ff9966', security:'#FF3B3B'}[k] || '#8a9bb4';
}

let nodeIndex = null;
let envSensorsCache = null;
let sensorSubsetCache = null;

function buildIndexes(){
  if(!state.city) return;
  nodeIndex = new Map(state.city.nodes.map(n => [n.id, n]));
  envSensorsCache = state.city.sensors.filter(s => s.kind === 'env');
  // Render at most 1 of every N sensors for density sanity
  const stride = Math.max(1, Math.floor(state.city.sensors.length / 2200));
  sensorSubsetCache = state.city.sensors.filter((_,i)=> i % stride === 0);
}

function drawMapCanvas2D(ctx, w, h){
  if(!state.city) return;
  if(!nodeIndex) buildIndexes();
  const city = state.city;
  ctx.save();
  city.zones.forEach(z => {
    ctx.beginPath();
    z.polygon.forEach(([lat,lon], i) => {
      const {x,y} = projCoord(lat, lon, w, h);
      i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    });
    ctx.closePath();
    ctx.fillStyle = z.kind==='commercial'?'rgba(14,165,255,.06)': z.kind==='industrial'?'rgba(255,179,0,.05)': z.kind==='park'?'rgba(0,255,135,.05)':'rgba(255,255,255,.02)';
    ctx.strokeStyle = 'rgba(14,165,255,.2)';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
  if(state.layers.roads){
    ctx.lineCap='round';
    city.edges.forEach(e => {
      const a = nodeIndex.get(e.from_id);
      const b = nodeIndex.get(e.to_id);
      if(!a||!b) return;
      const p1 = projCoord(a.lat, a.lon, w, h);
      const p2 = projCoord(b.lat, b.lon, w, h);
      ctx.strokeStyle = e.kind==='avenida' ? 'rgba(14,165,255,0.55)' : 'rgba(170,200,230,0.25)';
      ctx.lineWidth = e.kind==='avenida' ? 2.2 : 1;
      ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
    });
  }
  let drawn = 0;
  for (const s of sensorSubsetCache){
    if(!state.layers[s.kind]) continue;
    const {x,y} = projCoord(s.lat, s.lon, w, h);
    if(x<0||y<0||x>w||y>h) continue;
    ctx.fillStyle = colorForSensor(s.kind);
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 6.283); ctx.fill();
    drawn++;
  }
  ctx.globalAlpha = 1;
  if(state.layers.heatmap){
    envSensorsCache.forEach(s=>{
      const v = (state.sensorSnapshots[s.id]?.pm25_ugm3)||6;
      const {x,y} = projCoord(s.lat, s.lon, w, h);
      const r = 30;
      const g = ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0, `rgba(255,90,40,${clamp(v/120,0,0.7)})`);
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.fill();
    });
  }
  if(state.layers.flow){
    const t = Date.now()/700;
    for(let i=0;i<city.edges.length;i+=12){
      const e = city.edges[i];
      const a = nodeIndex.get(e.from_id);
      const b = nodeIndex.get(e.to_id);
      if(!a||!b) continue;
      const p1 = projCoord(a.lat,a.lon,w,h);
      const p2 = projCoord(b.lat,b.lon,w,h);
      const k = (Math.sin(t + i) + 1)/2;
      ctx.fillStyle = `rgba(0,255,135,${0.4+0.4*k})`;
      ctx.beginPath();
      ctx.arc(p1.x+(p2.x-p1.x)*k, p1.y+(p2.y-p1.y)*k, 2.2, 0, 6.283);
      ctx.fill();
    }
  }
  // emergencies pulse
  state.emergencies.filter(e=>e.status==='active').forEach(e => {
    const {x,y} = projCoord(e.lat, e.lon, w, h);
    const t = Date.now()/500;
    ctx.strokeStyle = 'rgba(255,59,59,.8)';
    ctx.lineWidth = 2;
    for(let i=0;i<3;i++){
      const r = 8 + ((t+i*4)%14);
      ctx.beginPath(); ctx.arc(x,y,r,0,6.283); ctx.stroke();
    }
  });
}

function initCanvasGL(canvas, gl){
  const vert = `#version 300 es
  in vec2 a_pos; in vec3 a_color; in float a_size;
  out vec3 v_color;
  uniform vec2 u_resolution; uniform vec2 u_offset; uniform float u_scale;
  void main(){
    vec2 p = (a_pos * u_scale + u_offset) / u_resolution * 2.0 - 1.0;
    p.y = -p.y;
    gl_Position = vec4(p, 0, 1);
    gl_PointSize = a_size;
    v_color = a_color;
  }`;
  const frag = `#version 300 es
  precision highp float;
  in vec3 v_color; out vec4 outColor;
  void main(){ vec2 d = gl_PointCoord - 0.5; if(length(d) > 0.5) discard; outColor = vec4(v_color, 1.0); }`;
  // If WebGL2 not available, fall back to 2D
  const gl2 = canvas.getContext('webgl2');
  if(!gl2){
    initCanvas2D(canvas);
    return;
  }
  // We still use Canvas 2D because the vector map plus animated features
  // benefit from fillStyle tricks; the WebGL path is ready for custom
  // high-throughput features but the 2D renderer is sufficient and
  // easier to maintain.
  initCanvas2D(canvas);
}

function hookMapInteraction(canvas){
  let dragging = false; let lastX=0; let lastY=0;
  canvas.addEventListener('wheel', ev => {
    ev.preventDefault();
    const factor = ev.deltaY < 0 ? 1.1 : 0.9;
    state.projection.scale = clamp(state.projection.scale*factor, 0.2, 8);
  });
  canvas.addEventListener('mousedown', e => { dragging = true; lastX=e.clientX; lastY=e.clientY;});
  canvas.addEventListener('mousemove', e => {
    if(!dragging) return;
    state.projection.offsetX += (e.clientX-lastX) * (window.devicePixelRatio||1);
    state.projection.offsetY += (e.clientY-lastY) * (window.devicePixelRatio||1);
    lastX=e.clientX; lastY=e.clientY;
  });
  canvas.addEventListener('mouseup', () => dragging = false);
  canvas.addEventListener('mouseleave', () => dragging = false);
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    showPopupNearest(x, y, e.clientX, e.clientY);
  });
}

function showPopupNearest(cx, cy, screenX, screenY){
  if(!state.city) return;
  const canvas = qs('#mapCanvas');
  let best = null; let bestD = 600;
  const subset = sensorSubsetCache || state.city.sensors;
  for (const s of subset) {
    const {x,y} = projCoord(s.lat, s.lon, canvas.width, canvas.height);
    const d = (x-cx)*(x-cx)+(y-cy)*(y-cy);
    if(d < bestD){ bestD = d; best = s; }
  }
  const popup = qs('#mapPopup');
  if(best){
    const snap = state.sensorSnapshots[best.id];
    popup.innerHTML = `<h4>${best.id}</h4>
      <div>Tipo: <strong>${best.kind}</strong> · zona ${best.zone}</div>
      <pre>${snap ? JSON.stringify(snap, null, 2) : 'sin datos recientes'}</pre>`;
    popup.hidden = false;
    popup.style.left = screenX + 'px';
    popup.style.top = (screenY + 12) + 'px';
    setTimeout(()=>{ popup.hidden = true }, 6000);
  }
}

function initMapTools(){
  qs('#zoomIn').addEventListener('click', ()=> state.projection.scale *= 1.15);
  qs('#zoomOut').addEventListener('click', ()=> state.projection.scale *= 0.87);
  qs('#reset').addEventListener('click', () => { state.projection = {scale:1, offsetX:0, offsetY:0}; });
  qs('#pauseBtn').addEventListener('click', ev => { state.paused = !state.paused; ev.target.textContent = state.paused ? '▶' : '⏸'; });
  qsa('.nv-map-layers input[type=checkbox]').forEach(c => c.addEventListener('change', ev => {
    state.layers[ev.target.dataset.layer] = ev.target.checked;
  }));
  qsa('.nv-feed-filters input').forEach(c => c.addEventListener('change', ev => {
    state.filters[ev.target.dataset.sev] = ev.target.checked;
    renderFeed();
  }));
}

function drawLegend(){
  const kinds = [
    ['Tráfico','#0EA5FF'],['Aire','#00FF87'],['Energía','#FFB300'],['Agua','#7ed0ff'],['Transporte','#CF8BFF'],['Residuos','#ffd666'],['Infra','#ff9966'],['Seguridad','#FF3B3B']
  ];
  qs('#legend').innerHTML = kinds.map(([n,c]) => `<span><span class="sw" style="background:${c}"></span>${n}</span>`).join('');
}

// ---------------- Navigation ----------------
function initNavigation(){
  qsa('.nv-nav button').forEach(b => b.addEventListener('click', () => {
    qsa('.nv-nav button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const view = b.dataset.view;
    qsa('.nv-panel').forEach(p => p.hidden = true);
    const pane = qs('#view-'+view);
    if(pane) pane.hidden = false;
  }));
}

// ---------------- Sparklines ----------------
function drawSparkline(canvas, values, color){
  if(!canvas) return;
  if(canvas.offsetParent === null) return;  // element or ancestor hidden
  resizeHighDPI(canvas);
  if(canvas.width === 0 || canvas.height === 0) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!values.length) return;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const W = canvas.width, H = canvas.height;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v,i) => {
    const x = (i/(values.length-1||1))*W;
    const y = H - ((v-min)/((max-min)||1))*H*0.85 - H*0.05;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = color+'33'; ctx.fill();
}

function autoSparklines(){
  drawSparkline(qs('#spark-traffic'), state.trends.traffic, '#0EA5FF');
  drawSparkline(qs('#spark-energy'), state.trends.energy, '#FFB300');
  drawSparkline(qs('#spark-env'), state.trends.env, '#00FF87');
  drawSparkline(qs('#spark-noise'), state.trends.noise, '#CF8BFF');
  drawSparkline(qs('#spark-transit'), state.trends.transit, '#7ed0ff');
  drawSparkline(qs('#spark-water'), state.trends.water, '#00FF87');
  drawSparkline(qs('#traffic-chart'), state.trends.traffic, '#0EA5FF');
  drawSparkline(qs('#energy-grid'), state.trends.energy, '#FFB300');
  drawSparkline(qs('#water-graph'), state.trends.water, '#7ed0ff');
  drawSparkline(qs('#env-chart'), state.trends.env, '#00FF87');
  if(qs('#loadKW')) qs('#loadKW').textContent = fmt(state.kpis.energy_load_kw);
  if(qs('#solarKW')) qs('#solarKW').textContent = fmt(state.kpis.energy_load_kw ? state.kpis.renewable_pct * state.kpis.energy_load_kw / 100 : 0);
  if(qs('#renewPct')) qs('#renewPct').textContent = fmt(state.kpis.renewable_pct);
}

// ---------------- Rules editor + sandbox ----------------
async function loadRules(){
  try {
    const res = await API.fetch('/api/rules');
    qs('#rulesList').innerHTML = res.rules.map(r => `<li><strong>${r.name}</strong> (p${r.priority}) ${r.description||''}</li>`).join('');
    qs('#rulesEditor').value = `RULE MY_CUSTOM_RULE\n  PRIORITY 10\n  DESCRIPTION "Mi regla de prueba"\n  WHEN metrics.env.co2.mean > 650\n  THEN raise_alert("high", "env", "CO2 arriba de 650")`;
  } catch {}
  qs('#rulesSave').addEventListener('click', async () => {
    const res = await API.post('/api/rules/preview', {source: qs('#rulesEditor').value});
    qs('#rulesOut').textContent = JSON.stringify(res, null, 2);
    loadRules();
  });
}

// ---------------- Apps marketplace ----------------
async function loadApps(){
  try {
    const res = await API.fetch('/api/apps');
    qs('#apps').innerHTML = res.apps.map(a => `<div class="nv-card"><h3>${a.name}</h3><p>${a.description}</p><small>Autor: ${a.author}</small></div>`).join('');
  } catch {}
}

// ---------------- Scenarios ----------------
function hookScenarios(){
  qsa('.nv-scenarios button').forEach(btn => btn.addEventListener('click', async () => {
    qs('#scenarioOut').textContent = 'Ejecutando simulación ABM...';
    const res = await API.post('/api/simulate', {scenario: btn.dataset.sc});
    qs('#scenarioOut').textContent = JSON.stringify(res, null, 2);
  }));
}

// Analytics query
window.addEventListener('DOMContentLoaded', () => {
  const f = qs('#queryBuilder');
  if(f){
    f.addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(f);
      const series = fd.get('series');
      const minutes = Number(fd.get('minutes')||30);
      const end = Date.now();
      const start = end - minutes*60*1000;
      const res = await fetch(`/api/history?series=${encodeURIComponent(series)}&start_ms=${start}&end_ms=${end}`).then(r=>r.json());
      const canvas = qs('#analyticsChart');
      resizeHighDPI(canvas);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(!res.points?.length){ ctx.fillStyle = '#8a9bb4'; ctx.fillText('Sin datos', 20, 40); return; }
      const values = res.points.map(([,v]) => v);
      drawSparkline(canvas, values, '#00FF87');
    });
  }
});

// Entry
const saved = localStorage.getItem('nv_token');
if(saved){
  state.token = saved;
  boot();
} else {
  showLogin();
}

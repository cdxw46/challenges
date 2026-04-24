// NEUROVA — portal ciudadano
const qs = s=>document.querySelector(s);
const qsa = s=>[...document.querySelectorAll(s)];

async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(url); return r.json(); }

let city = null; let activeZone = 'Z00';

init();

async function init(){
  try {
    city = await fetchJSON('/api/city');
    buildZones();
    buildStops();
    buildHistoryZones();
    await refresh();
    setInterval(refresh, 6000);
    drawMap();
    hookReport();
    hookHistory();
  } catch(e){ console.error(e); }
}

function buildZones(){
  const row = qs('#zoneChips');
  const sel = qs('#zoneSelect');
  row.innerHTML = city.zones.map(z=>`<button data-z="${z.id}">${z.name}</button>`).join('');
  sel.innerHTML = city.zones.map(z=>`<option value="${z.id}">${z.name}</option>`).join('');
  qs('#historyZone').innerHTML = city.zones.map(z=>`<option value="${z.id}">${z.name}</option>`).join('');
  row.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    activeZone = b.dataset.z;
    qsa('.c-chips button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    refresh();
  }));
  row.querySelector('button[data-z="Z00"]').classList.add('active');
}

function buildStops(){
  const opts = city.stops.slice(0,200).map(s=>`<option value="${s.id}">`).join('');
  qs('#stopOptions').innerHTML = opts;
}

function buildHistoryZones(){}

async function refresh(){
  try{
    const kpis = await fetchJSON('/api/kpis');
    renderKPIs(kpis);
    updateAQI(kpis);
    drawAQIChart();
    updateBusETA();
  }catch(e){console.warn(e)}
}

function renderKPIs(k){
  const items = [
    ['Vehículos', k.vehicles_in_circulation],
    ['Velocidad', (k.average_speed_kmh||0) + ' km/h'],
    ['AQI', k.aqi],
    ['Humedad', Math.round((k.humidity||0)*100)+'%'],
    ['Temperatura', (k.temperature_c||0) + '°C'],
    ['Renovables', (k.renewable_pct||0)+'%']
  ];
  qs('#kpiRow').innerHTML = items.map(([h,v])=>`<div class="c-kpi"><small>${h}</small><strong>${v}</strong></div>`).join('');
}

function updateAQI(k){
  const aqi = k.aqi || 0;
  const card = qs('#aqiCard');
  card.classList.remove('bad','critical');
  let label = 'Bueno';
  if(aqi > 80){ card.classList.add('bad'); label = 'Moderado'; }
  if(aqi > 120){ card.classList.add('critical'); label = 'Peligroso'; }
  card.innerHTML = `<strong>AQI ${aqi}</strong><span>${label} · ${activeZone}</span>`;
}

async function drawAQIChart(){
  try {
    const metric = 'env.pm25_ugm3.' + activeZone;
    const end = Date.now();
    const res = await fetchJSON(`/api/history?series=${encodeURIComponent(metric)}&start_ms=${end-6*3600*1000}&end_ms=${end}`);
    drawSeries(qs('#aqiChart'), res.points||[], '#0EA5FF');
  } catch {}
}

async function updateBusETA(){
  const el = qs('#busETA');
  const stop = qs('#stopInput').value;
  const lines = city.lines.filter(l => !stop || l.stops.includes(stop)).slice(0, 4);
  el.innerHTML = lines.map(l=>{
    const eta = Math.round(60 + Math.random()*600);
    return `<div class="bus"><strong>${l.name}</strong><small>${Math.floor(eta/60)} min</small></div>`;
  }).join('') || '<p>Introduce tu parada para ver próximas llegadas.</p>';
}

function drawSeries(canvas, pts, color){
  if(!canvas) return;
  const dpr = window.devicePixelRatio||1;
  const r = canvas.getBoundingClientRect();
  canvas.width = r.width*dpr; canvas.height = r.height*dpr;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!pts.length){ ctx.fillStyle = '#8a9bb4'; ctx.font = '13px Inter'; ctx.fillText('Sin datos en este rango.', 12, 24); return; }
  const vals = pts.map(p=>p[1]);
  const max = Math.max(...vals), min = Math.min(...vals);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2*dpr;
  ctx.beginPath();
  pts.forEach(([,v],i)=>{
    const x = i/(pts.length-1) * canvas.width;
    const y = canvas.height - ((v-min)/((max-min)||1))*canvas.height*.8 - canvas.height*.1;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.stroke();
}

function drawMap(){
  const canvas = qs('#cityMap');
  function renderFrame(){
    const dpr = window.devicePixelRatio||1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width*dpr; canvas.height = rect.height*dpr;
    const c = canvas.getContext('2d');
    c.fillStyle = '#0a1220'; c.fillRect(0,0,canvas.width,canvas.height);
    const W = canvas.width, H = canvas.height;
    const origin = city.origin;
    const [lat0, lon0] = origin;
    const project = (lat, lon) => {
      const dx = (lon-lon0)*Math.cos(lat0*Math.PI/180)*111320;
      const dy = (lat-lat0)*111320;
      return {x: W/2 + dx/9, y: H/2 - dy/9};
    };
    c.strokeStyle = 'rgba(14,165,255,.35)';
    c.lineWidth = 1*dpr;
    city.edges.forEach(e=>{
      const a = city.nodes.find(n=>n.id===e.from_id);
      const b = city.nodes.find(n=>n.id===e.to_id);
      if(!a||!b)return;
      const p1 = project(a.lat,a.lon), p2 = project(b.lat,b.lon);
      c.beginPath(); c.moveTo(p1.x,p1.y); c.lineTo(p2.x,p2.y); c.stroke();
    });
    city.sensors.filter((_,i)=>i%20===0).forEach(s=>{
      const {x,y} = project(s.lat,s.lon);
      c.fillStyle = {traffic:'#0EA5FF',env:'#00FF87',energy:'#FFB300',water:'#7ed0ff',transit:'#CF8BFF',waste:'#ffd666',security:'#FF3B3B',infra:'#ff9966'}[s.kind]||'#fff';
      c.beginPath(); c.arc(x,y,2*dpr,0,6.28); c.fill();
    });
    requestAnimationFrame(renderFrame);
  }
  renderFrame();
}

function hookReport(){
  qs('#geoBtn').addEventListener('click', ()=>{
    if(!navigator.geolocation){ alert('Geolocalización no disponible'); return; }
    navigator.geolocation.getCurrentPosition(p=>{
      qs('#latInput').value = p.coords.latitude;
      qs('#lonInput').value = p.coords.longitude;
      qs('#geoBtn').textContent = '✓ Ubicación compartida';
    }, e=>{ qs('#reportStatus').textContent = 'No se pudo obtener ubicación: '+e.message; });
  });
  qs('#reportForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try {
      const res = await fetch('/api/report', {method:'POST', body: fd});
      const j = await res.json();
      qs('#reportStatus').textContent = j.id ? `✅ Enviado. ID: ${j.id}. Gracias.` : `Error: ${j.error||''}`;
      ev.target.reset();
    } catch(e){ qs('#reportStatus').textContent = 'Error enviando reporte: '+e.message; }
  });
}

function hookHistory(){
  qs('#historyBtn').addEventListener('click', async () => {
    const zone = qs('#historyZone').value;
    const metric = qs('#historyMetric').value;
    const end = Date.now();
    const start = end - 7*24*3600*1000;
    const res = await fetchJSON(`/api/history?series=${encodeURIComponent(metric+'.'+zone)}&start_ms=${start}&end_ms=${end}`);
    drawSeries(qs('#historyChart'), res.points||[], '#008652');
  });
  qs('#downloadCSV').addEventListener('click', async ev => {
    ev.preventDefault();
    const zone = qs('#historyZone').value;
    const metric = qs('#historyMetric').value;
    const end = Date.now();
    const start = end - 365*24*3600*1000;
    const res = await fetchJSON(`/api/history?series=${encodeURIComponent(metric+'.'+zone)}&start_ms=${start}&end_ms=${end}`);
    const csv = 'ts_ms,value\n' + (res.points||[]).map(([t,v])=>`${t},${v}`).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${metric}_${zone}.csv`; a.click();
    URL.revokeObjectURL(url);
  });
}

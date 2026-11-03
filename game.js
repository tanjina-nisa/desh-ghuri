/* Desh Ghuri v2 — 3D Bangladesh driving game (MapLibre GL + OpenFreeMap) */
(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('dg_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dg_' + k, JSON.stringify(v)); } catch {} }
};
const decRing = f => { const r = []; let x = f[0], y = f[1]; r.push([x / 1000, y / 1000]); for (let i = 2; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; r.push([x / 1000, y / 1000]); } return r; };
const decPolys = ps => ps.map(p => p.map(decRing));
window.BD_DISTRICTS.forEach(d => d.p = decPolys(d.p)); window.BD_WATER = decPolys(window.BD_WATER);
const DIST = window.BD_DISTRICTS, PLACES = window.BD_PLACES, VEH = window.VEHICLES, UPZ = window.BD_UPAZILAS, WATER = window.BD_WATER;
const DIV_BN = { Barishal: 'বরিশাল', Chattogram: 'চট্টগ্রাম', Dhaka: 'ঢাকা', Khulna: 'খুলনা', Mymensingh: 'ময়মনসিংহ', Rajshahi: 'রাজশাহী', Rangpur: 'রংপুর', Sylhet: 'সিলেট' };
const SPEED_SCALE = 7;       // world moves 7x faster than real life so driving feels like a game
const ARRIVE_KM = 0.9;
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/* ---------- geometry ---------- */
function bboxOf(polys) { let a = [180, 90, -180, -90]; polys.forEach(p => p[0].forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; })); return a; }
function inRing(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
function inPolys(x, y, polys) { for (const p of polys) if (inRing(x, y, p[0])) { let hole = false; for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; } if (!hole) return true; } return false; }
DIST.forEach(d => d.bb = bboxOf(d.p));
const WATER_BB = bboxOf(WATER);
const inBB = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function districtAt(lat, lng) { for (const d of DIST) if (inBB(lng, lat, d.bb) && inPolys(lng, lat, d.p)) return d; return null; }
const seaAt = (lat, lng) => inBB(lng, lat, WATER_BB) && inPolys(lng, lat, WATER);
const drivable = (lat, lng) => !!districtAt(lat, lng) || seaAt(lat, lng);
function kmBetween(a, b) { const R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function bearing(a, b) { const t = Math.PI / 180, y = Math.sin((b[1] - a[1]) * t) * Math.cos(b[0] * t), x = Math.cos(a[0] * t) * Math.sin(b[0] * t) - Math.sin(a[0] * t) * Math.cos(b[0] * t) * Math.cos((b[1] - a[1]) * t); return (Math.atan2(y, x) / t + 360) % 360; }
function nearestUpazila(lat, lng) { let best = null, bd = 1e9; for (const u of UPZ) { const d = (u[1] - lat) ** 2 + ((u[2] - lng) * 0.92) ** 2; if (d < bd) { bd = d; best = u; } } return best; }
const dByName = n => DIST.find(d => d.n === n);
const fmtKm = k => k < 1 ? Math.round(k * 1000) + ' m' : (k < 10 ? k.toFixed(1) : Math.round(k)) + ' km';
const ll = p => [p[1], p[0]]; // [lat,lng] -> [lng,lat]

/* ---------- state ---------- */
const S = {
  name: ls.get('name', ''), veh: ls.get('veh', 'cng'), pos: ls.get('pos', null), heading: ls.get('heading', 90),
  speed: 0, dest: ls.get('dest', null), visited: ls.get('visited', []), km: ls.get('km', 0), trips: ls.get('trips', 0),
  auto: false, playing: false, curDist: null, nitro: 1, offroad: false, water: false, overview: false, sound: ls.get('sound', true), steerVis: 0
};
const vehicle = () => VEH.find(v => v.id === S.veh) || VEH[0];
const save = () => { ls.set('name', S.name); ls.set('veh', S.veh); ls.set('pos', S.pos); ls.set('heading', Math.round(S.heading)); ls.set('dest', S.dest); ls.set('visited', S.visited); ls.set('km', Math.round(S.km * 10) / 10); ls.set('trips', S.trips); ls.set('sound', S.sound); };

/* ---------- map ---------- */
let map, mapReady = false, roadLayers = [], waterLayers = [];
function initMap() {
  map = new maplibregl.Map({
    container: 'map', style: STYLE_URL, center: [90.35, 23.7], zoom: 6.3, pitch: 0, bearing: 0,
    maxBounds: [[85.5, 19.0], [95.0, 28.2]], attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, keyboard: false, maxPitch: 75
  });
  map.on('error', e => { if (!mapReady) console.warn(e && e.error); });
  map.on('load', () => {
    mapReady = true;
    const layers = map.getStyle().layers;
    roadLayers = layers.filter(l => l.type === 'line' && l['source-layer'] === 'transportation').map(l => l.id);
    waterLayers = layers.filter(l => l['source-layer'] === 'water' && l.type === 'fill').map(l => l.id);
    // Prefer Bangla names on labels where available
    layers.filter(l => l.type === 'symbol' && l.layout && l.layout['text-field'] && /label_(city|town|village|other|state)/.test(l.id))
      .forEach(l => { try { map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:bn'], ['get', 'name:latin'], ['get', 'name']]); } catch {} });
    try { map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.85); } catch {}
    map.setFog && map.setFog({});
    // district borders + visited fill
    map.addSource('districts', { type: 'geojson', data: { type: 'FeatureCollection', features: DIST.map(d => ({ type: 'Feature', properties: { n: d.n }, geometry: { type: 'MultiPolygon', coordinates: d.p } })) } });
    map.addLayer({ id: 'dist-fill', type: 'fill', source: 'districts', paint: { 'fill-color': '#38a169', 'fill-opacity': ['case', ['in', ['get', 'n'], ['literal', S.visited]], 0.12, 0] }, maxzoom: 11 });
    map.addLayer({ id: 'dist-line', type: 'line', source: 'districts', paint: { 'line-color': '#006a4e', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 2.5], 'line-dasharray': [3, 2], 'line-opacity': 0.7 } });
    map.addSource('route', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#f42a41', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 2, 16, 6], 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.85 } });
    $('#loading').classList.remove('show');
    if (S.playing) { setDriveCam(true); drawDest(); }
  });
  map.on('click', onMapClick);
}
const emptyFC = () => ({ type: 'FeatureCollection', features: [] });
const refreshDistStyle = () => mapReady && map.setPaintProperty('dist-fill', 'fill-opacity', ['case', ['in', ['get', 'n'], ['literal', S.visited]], 0.12, 0]);

let destMarker = null;
function drawDest() {
  if (!map) return;
  if (destMarker) { destMarker.remove(); destMarker = null; }
  if (!S.dest) { mapReady && map.getSource('route').setData(emptyFC()); return; }
  const el = document.createElement('div'); el.className = 'destpin'; el.textContent = '🏁';
  destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(ll(S.dest.c)).addTo(map);
  updateRoute();
}
function updateRoute() { if (mapReady && S.dest) map.getSource('route').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [ll(S.pos), ll(S.dest.c)] } }); }

/* ---------- camera ---------- */
let camZoom = 17;
function setDriveCam(instant) {
  S.overview = false; $('#zoomBtn').classList.remove('on');
  const opts = { center: ll(S.pos), zoom: 17, pitch: 66, bearing: S.heading, padding: { top: innerHeight * 0.38, bottom: 0, left: 0, right: 0 } };
  instant ? map.jumpTo(opts) : map.easeTo({ ...opts, duration: 900 });
}
function setOverview() {
  S.overview = true; $('#zoomBtn').classList.add('on');
  map.easeTo({ center: [90.3, 23.75], zoom: innerWidth < 760 ? 5.9 : 6.4, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1000 });
}

/* ---------- car sprite ---------- */
const car = $('#car');
let carKey = '';
function renderCarSprite() {
  const v = vehicle(), size = innerWidth < 760 ? 110 : 150;
  const key = v.id + size + S.name;
  if (key !== carKey) { $('#carSvg').innerHTML = vehicleRear(v, size); $('#carTag').textContent = S.name; carKey = key; }
  return size;
}
function placeCar(now) {
  if (!map || !S.pos) return;
  const size = renderCarSprite();
  const p = map.project(ll(S.pos));
  const scale = S.overview ? 0.35 : 1;
  const bob = Math.abs(S.speed) > 1 ? Math.sin(now / (60 - Math.min(40, Math.abs(S.speed) / 3))) * (S.offroad ? 2.5 : 0.8) : 0;
  const tilt = S.steerVis * 9;
  car.style.display = 'block';
  car.style.left = (p.x - size / 2) + 'px';
  car.style.top = (p.y - size + 8) + 'px';
  car.style.transform = `scale(${scale}) translateY(${bob}px) rotate(${tilt}deg)` + (S.overview ? ` rotate(${S.heading}deg)` : '');
  car.classList.toggle('braking', (keys.has('down') && S.speed > 0) || keys.has('brake'));
  car.classList.toggle('offroad', S.offroad && Math.abs(S.speed) > 5);
  car.classList.toggle('nitro', keys.has('boost') && S.nitro > 0 && S.speed > 5);
}

/* ---------- audio ---------- */
let ac = null, eng = null;
function audioInit() {
  if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination); o1.start(); o2.start();
  eng = { o1, o2, f, g };
}
function engineTick() {
  if (!eng) return;
  const v = vehicle(), on = S.sound && v.engine && S.playing && !S.overview && !$('#ov').classList.contains('show');
  const sp = Math.abs(S.speed), rpm = (sp % 40) / 40 + sp / 220;
  const base = 38 + rpm * 90 * (v.pitch || 1);
  eng.o1.frequency.setTargetAtTime(base, ac.currentTime, 0.05);
  eng.o2.frequency.setTargetAtTime(base * 0.5, ac.currentTime, 0.05);
  eng.f.frequency.setTargetAtTime(300 + rpm * 900, ac.currentTime, 0.05);
  eng.g.gain.setTargetAtTime(on ? 0.035 + (keys.has('up') || S.auto ? 0.03 : 0) : 0, ac.currentTime, 0.08);
}
let hornT = 0;
function horn() {
  audioInit(); if (!ac || !S.sound) return; const now = ac.currentTime; if (performance.now() - hornT < 350) return; hornT = performance.now();
  const v = vehicle();
  if (!v.engine) { // bicycle / rickshaw bell: tring tring
    [0, 0.18].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 2350; g.gain.setValueAtTime(0.25, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.35); o.connect(g); g.connect(ac.destination); o.start(now + t); o.stop(now + t + 0.4); });
  } else {
    const f = v.id === 'truck' || v.id === 'bus' ? [220, 277] : v.id === 'bike' ? [520, 620] : [392, 494];
    f.forEach(fr => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = fr; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + 0.02); g.gain.setValueAtTime(0.08, now + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55); o.connect(g); g.connect(ac.destination); o.start(now); o.stop(now + 0.6); });
  }
}

/* ---------- UI helpers ---------- */
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('show'); keys.clear(); }
function closeModal() { $('#ov').classList.remove('show'); }
$('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
window.closeModal = closeModal;
function districtCards() {
  const byDiv = {}; DIST.forEach(d => (byDiv[d.div] = byDiv[d.div] || []).push(d));
  return Object.keys(byDiv).sort().map(dv => `<div class="divh">${dv} বিভাগ · ${DIV_BN[dv] || ''}</div>` + byDiv[dv].map(d => `<button class="dbtn" data-d="${esc(d.n)}">${d.bn}<small>${esc(d.n)}</small></button>`).join('')).join('');
}
function filterList(listEl, q) {
  q = q.trim().toLowerCase();
  listEl.querySelectorAll('.dbtn').forEach(b => { const d = dByName(b.dataset.d); b.style.display = !q || d.n.toLowerCase().includes(q) || d.bn.includes(q) ? '' : 'none'; });
  listEl.querySelectorAll('.divh').forEach(h => { let n = h.nextElementSibling, any = false; while (n && !n.classList.contains('divh')) { if (n.style.display !== 'none') any = true; n = n.nextElementSibling; } h.style.display = any ? '' : 'none'; });
}

/* ---------- setup wizard ---------- */
const setup = { step: 0, start: null, dest: null };
function renderSetup() {
  const P = $('#setupPanel'), st = setup.step;
  const head = `<div class="brand">দেশ <span>ঘুরি</span> 🇧🇩</div><div class="sub" style="margin:6px 0 0">Desh Ghuri — 3D te puro Bangladesh drive kore ghuro!</div><div class="steps">${[0, 1, 2, 3].map(i => `<div class="${i <= st ? 'on' : ''}"></div>`).join('')}</div>`;
  if (st === 0) {
    P.innerHTML = head + `<h2>Tomar naam ki? 👋</h2><p class="sub">Gari r upor tomar naam dekhabe. Pore jekono shomoy bodlate parbe.</p>
      <input class="inp" id="nm" maxlength="24" placeholder="e.g. Tanjina" value="${esc(S.name)}"><div class="nav"><span></span><button class="btn btn-g" id="nx">Next →</button></div>`;
    const go = () => { const v = $('#nm').value.trim(); if (!v) { toast('Ekta naam dao 🙂'); return; } S.name = v; save(); setup.step = 1; renderSetup(); };
    $('#nx').onclick = go; $('#nm').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => $('#nm').focus(), 50);
  } else if (st === 1) {
    P.innerHTML = head + `<h2>Kon gari chalabe? 🚦</h2><p class="sub">Game er moddhe 🔄 chap dile jekono shomoy gari bodlate parbe.</p>
      <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 96)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div><small>${esc(v.desc)}</small></button>`).join('')}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx">Next →</button></div>`;
    P.querySelectorAll('.vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; save(); P.querySelectorAll('.vcard').forEach(x => x.classList.toggle('on', x === c)); });
    $('#bk').onclick = () => { setup.step = 0; renderSetup(); }; $('#nx').onclick = () => { setup.step = 2; renderSetup(); };
  } else if (st === 2) {
    P.innerHTML = head + `<h2>Kotha theke shuru korbe? 🚩</h2><p class="sub">64 district er jekono ekta — tomar gari oi district er centre e chole jabe.</p>
      <input class="inp" id="q" placeholder="🔎 District khujo (e.g. Sylhet / সিলেট)" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx" ${setup.start ? '' : 'disabled'}>Next →</button></div>`;
    const dl = $('#dl'), mark = () => dl.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('on', b.dataset.d === setup.start));
    dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { setup.start = b.dataset.d; mark(); $('#nx').disabled = false; });
    mark(); $('#q').oninput = e => filterList(dl, e.target.value);
    $('#bk').onclick = () => { setup.step = 1; renderSetup(); }; $('#nx').onclick = () => { setup.step = 3; renderSetup(); };
  } else {
    P.innerHTML = head + `<h2>Kothay jabe? 🏁</h2><p class="sub">Destination beche nao — na hole <b>free drive</b>: jekhane iccha jao, map e click kore pore destination dite parbe.</p>
      <button class="btn ${setup.dest ? 'btn-w' : 'btn-g'}" id="free" style="width:100%;margin-bottom:12px">🛣️ Free drive — destination chara</button>
      <input class="inp" id="q" placeholder="🔎 Destination district khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-r" id="go">🚀 Chalano shuru!</button></div>`;
    const dl = $('#dl'), mark = () => { dl.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('on', b.dataset.d === setup.dest)); $('#free').className = 'btn ' + (setup.dest ? 'btn-w' : 'btn-g'); };
    dl.querySelectorAll('.dbtn').forEach(b => { if (b.dataset.d === setup.start) { b.disabled = true; b.style.opacity = .4; } b.onclick = () => { setup.dest = b.dataset.d; mark(); }; });
    $('#free').onclick = () => { setup.dest = null; mark(); };
    mark(); $('#q').oninput = e => filterList(dl, e.target.value);
    $('#bk').onclick = () => { setup.step = 2; renderSetup(); };
    $('#go').onclick = () => { audioInit(); startGame(setup.start, setup.dest); };
  }
}

function startGame(startName, destName) {
  const d = dByName(startName);
  S.pos = d.c.slice(); S.speed = 0; S.heading = 0; S.auto = false; S.nitro = 1;
  S.dest = destName ? { type: 'district', name: destName, c: dByName(destName).c } : null;
  S.curDist = null; S.playing = true; save();
  $('#setup').classList.add('hide');
  if (!mapReady) $('#loading').classList.add('show');
  if (mapReady) { setDriveCam(false); drawDest(); }
  updateHUD(true);
  toast(`${d.bn} (${d.n}) theke shuru! W / ⛽ chepe gas dao 🚀`, 3500);
  if (S.dest) setTimeout(() => toast(`🏁 ${dByName(destName).bn} — ${fmtKm(kmBetween(S.pos, S.dest.c))} dure · 🧭 = auto-drive`, 3800), 900);
}

/* ---------- HUD ---------- */
let hudT = 0;
function updateHUD(force) {
  const v = vehicle(), sp = Math.abs(S.speed);
  $('#nameTxt').textContent = S.name; $('#vehTxt').textContent = v.name; $('#vehIcon').innerHTML = vehicleSVG(v, 40);
  $('#spd').textContent = Math.round(sp);
  $('#arc').style.strokeDashoffset = 251 - 251 * Math.min(1, sp / (v.max * 1.6));
  $('#gear').textContent = S.speed < -0.5 ? 'R' : sp < 0.5 ? 'N' : v.engine ? 'D' + Math.min(5, 1 + Math.floor(sp / (v.max / 5))) : 'PEDAL';
  $('#nitroBar').style.width = (S.nitro * 100) + '%';
  $('#badges').innerHTML = (S.water ? '<span class="badge">⛴️ Ferry</span>' : '') + (S.offroad && !S.water ? '<span class="badge" style="background:#975a16">🌾 Off-road — speed kom</span>' : '') + (S.auto ? '<span class="badge" style="background:#d69e2e">🧭 Auto-drive</span>' : '') + (keys.has('boost') && S.nitro > 0 ? '<span class="badge" style="background:#f42a41">🔥 NITRO</span>' : '');
  $('#autoBtn').classList.toggle('on', S.auto); $('#soundBtn').textContent = S.sound ? '🔊' : '🔇';
  if (force || performance.now() - hudT > 400) {
    hudT = performance.now();
    const d = districtAt(S.pos[0], S.pos[1]), u = nearestUpazila(S.pos[0], S.pos[1]);
    $('#locD').textContent = d ? `${d.bn} · ${d.n}` : (S.water ? 'Nodi / Shagor ⛴️' : '—');
    $('#locU').textContent = (u ? `${u[0]} upazila · ` : '') + (d ? `${d.div} division` : '');
    if (d && d.n !== S.curDist) {
      if (S.curDist) toast(`🎉 ${d.bn} (${d.n}) district e shagotom!`);
      S.curDist = d.n;
      if (!S.visited.includes(d.n)) { S.visited.push(d.n); refreshDistStyle(); save(); if (S.visited.length > 1) toast(`🏆 Notun district! ${S.visited.length}/64 ghora hoyeche`); }
    }
    if (S.dest) {
      const km = kmBetween(S.pos, S.dest.c), rel = (bearing(S.pos, S.dest.c) - S.heading + 360) % 360;
      $('#dest').innerHTML = `<div class="pill"><div class="row"><span id="arrow" style="transform:rotate(${rel}deg)">⬆️</span><div style="flex:1"><b>🏁 ${esc(S.dest.label || (dByName(S.dest.name)?.bn + ' · ' + S.dest.name))}</b><div class="visited">${fmtKm(km)} baki${rel > 100 && rel < 260 ? ' · ↩️ ulta dike jaccho!' : ''}</div></div><button title="Destination batil" id="clrDest" style="font-size:18px">✖️</button></div></div>`;
      $('#clrDest').onclick = () => { S.dest = null; S.auto = false; drawDest(); save(); updateHUD(true); toast('Free drive mode 🛣️'); };
    } else $('#dest').innerHTML = `<div class="pill"><div class="row">🛣️ <div><b>Free drive</b><div class="visited">Map e click kore destination dao</div></div></div></div>`;
    drawMinimap();
  }
}

/* ---------- minimap ---------- */
const mm = $('#mm'), mx = mm.getContext('2d');
const MMB = [88.0, 20.55, 92.7, 26.65];
const mmP = (lng, lat) => [(lng - MMB[0]) / (MMB[2] - MMB[0]) * mm.width, (MMB[3] - lat) / (MMB[3] - MMB[1]) * mm.height];
function drawMinimap() {
  mx.clearRect(0, 0, mm.width, mm.height);
  DIST.forEach(d => { mx.beginPath(); d.p.forEach(poly => poly.forEach(ring => ring.forEach(([x, y], i) => { const [px, py] = mmP(x, y); i ? mx.lineTo(px, py) : mx.moveTo(px, py); }))); mx.fillStyle = S.visited.includes(d.n) ? 'rgba(56,211,159,.75)' : 'rgba(255,255,255,.16)'; mx.fill('evenodd'); mx.strokeStyle = 'rgba(255,255,255,.35)'; mx.lineWidth = 1; mx.stroke(); });
  if (S.dest) { const [x, y] = mmP(S.dest.c[1], S.dest.c[0]); mx.font = '26px serif'; mx.fillText('🏁', x - 6, y); }
  if (S.pos) { const [x, y] = mmP(S.pos[1], S.pos[0]); mx.save(); mx.translate(x, y); mx.rotate(S.heading * Math.PI / 180); mx.beginPath(); mx.moveTo(0, -11); mx.lineTo(8, 9); mx.lineTo(0, 4); mx.lineTo(-8, 9); mx.closePath(); mx.fillStyle = '#f42a41'; mx.fill(); mx.strokeStyle = '#fff'; mx.lineWidth = 2; mx.stroke(); mx.restore(); }
}
$('#minimap').onclick = () => S.overview ? setDriveCam() : setOverview();

/* ---------- info / arrival ---------- */
function placeHTML(d) {
  const info = PLACES[d.n] || { p: [] }, q = encodeURIComponent;
  return info.p.map(([e, name, desc]) => `<div class="place"><div class="e">${e}</div><div><b>${esc(name)}</b><p>${esc(desc)}</p>
    <a href="https://www.google.com/maps/search/${q(name.split('(')[0] + ' ' + d.n + ' Bangladesh')}" target="_blank" rel="noopener">🗺️ Google Maps</a>
    <a href="https://en.wikipedia.org/wiki/Special:Search?search=${q(name.split('(')[0] + ' ' + d.n)}" target="_blank" rel="noopener">📖 Wikipedia</a></div></div>`).join('');
}
function showInfo(lat, lng, arrived) {
  const d = districtAt(lat, lng) || DIST.reduce((a, b) => kmBetween([lat, lng], a.c) < kmBetween([lat, lng], b.c) ? a : b);
  const u = nearestUpazila(lat, lng), info = PLACES[d.n] || { t: '' }, km = kmBetween([lat, lng], d.c);
  modal(`<div class="hero"><p>${arrived ? '🎉 Tumi pouche gecho!' : '📍 Tumi ekhon achho'}</p><h2>${d.bn} · ${esc(d.n)}</h2>
    <p>${u ? esc(u[0] + ' upazila · ') : ''}${esc(d.div)} division${km > 3 ? ` · district centre theke ${fmtKm(km)}` : ''}</p><p style="margin-top:6px;font-weight:600">${esc(info.t)}</p></div>
    <h3 style="margin-bottom:10px">✨ ${d.bn} er famous jayga</h3>${placeHTML(d)}
    <div class="mrow"><button class="btn btn-w" id="m_go">🎯 Notun destination</button><button class="btn btn-g" onclick="closeModal()">🚗 Cholo, aro ghuri!</button></div>`);
  $('#m_go').onclick = () => { closeModal(); openDestPicker(); };
}
function arrive() { const dest = S.dest; S.trips++; S.speed = 0; S.auto = false; S.dest = null; drawDest(); save(); showInfo(dest.c[0], dest.c[1], true); }

/* ---------- pickers ---------- */
function openDestPicker() {
  modal(`<h2>🎯 Kothay jabe?</h2><p class="sub">District beche nao — othoba map e jekono jaygay click koro.</p>
    <input class="inp" id="q" placeholder="🔎 District khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
    <div class="mrow"><button class="btn btn-w" id="free">🛣️ Free drive</button><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  const dl = $('#dl'); $('#q').oninput = e => filterList(dl, e.target.value);
  dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => setDest({ type: 'district', name: b.dataset.d, c: dByName(b.dataset.d).c }));
  $('#free').onclick = () => { S.dest = null; S.auto = false; drawDest(); save(); closeModal(); updateHUD(true); };
}
function setDest(dest) { S.dest = dest; save(); drawDest(); closeModal(); updateHUD(true); toast(`🏁 Destination set — ${fmtKm(kmBetween(S.pos, dest.c))} dure. 🧭 / P = auto-drive`, 3500); }
function openStartPicker() {
  modal(`<h2>🚩 Notun jayga theke shuru</h2><p class="sub">Je district beche nebe, gari tar centre e chole jabe.</p>
    <input class="inp" id="q" placeholder="🔎 District khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  const dl = $('#dl'); $('#q').oninput = e => filterList(dl, e.target.value);
  dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { const d = dByName(b.dataset.d); S.pos = d.c.slice(); S.speed = 0; S.auto = false; closeModal(); setDriveCam(true); drawDest(); save(); updateHUD(true); toast(`🚩 ${d.bn} theke abar shuru!`); });
}
function openVehPicker() {
  modal(`<h2>🔄 Gari bodlao</h2><p class="sub">Je gari choose korbe, oita diyei shamne chalabe.</p>
    <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 90)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div></button>`).join('')}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Close</button></div>`);
  document.querySelectorAll('#modal .vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; S.speed = Math.min(S.speed, vehicle().max); save(); closeModal(); updateHUD(true); toast(`${vehicle().name} (${vehicle().bn}) e uthe porecho!`); });
}
function openName() {
  modal(`<h2>✏️ Naam bodlao</h2><p class="sub">Tomar notun naam gari r upor dekhabe.</p><input class="inp" id="nm" maxlength="24" value="${esc(S.name)}">
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button><button class="btn btn-g" id="sv">Save</button></div>`);
  const sv = () => { const v = $('#nm').value.trim(); if (!v) return toast('Naam khali rakha jabe na'); S.name = v; save(); updateHUD(true); closeModal(); toast(`Hello, ${v}! 👋`); };
  $('#sv').onclick = sv; $('#nm').onkeydown = e => { if (e.key === 'Enter') sv(); }; setTimeout(() => $('#nm').select(), 50);
}
function openStats() {
  const left = DIST.filter(d => !S.visited.includes(d.n));
  modal(`<div class="hero"><p>🏆 ${esc(S.name)} er journey</p><h2>${S.visited.length} / 64 district</h2><p>${Math.round(S.km).toLocaleString()} km chaliyecho · ${S.trips} ta destination e pouchecho</p></div>
    <div class="progress"><div style="width:${S.visited.length / 64 * 100}%"></div></div>
    <h3 style="margin:14px 0 8px">✅ Ghora hoyeche</h3><p class="visited">${S.visited.map(n => dByName(n)?.bn).join(' · ') || 'Ekhono kichu na'}</p>
    <h3 style="margin:14px 0 8px">🗺️ Baki ache (${left.length})</h3><p class="visited">${left.map(d => d.bn).join(' · ') || 'Shob ghure felecho! 🎉🇧🇩'}</p>
    <div class="mrow"><button class="btn btn-w" id="rst">↺ Progress reset</button><button class="btn btn-g" onclick="closeModal()">OK</button></div>`);
  $('#rst').onclick = () => { if ($('#rst').dataset.c) { S.visited = S.curDist ? [S.curDist] : []; S.km = 0; S.trips = 0; save(); refreshDistStyle(); closeModal(); toast('Progress reset hoyeche'); } else { $('#rst').dataset.c = 1; $('#rst').textContent = 'Sure? Abar chapo'; } };
}

/* ---------- map click ---------- */
function onMapClick(e) {
  if (!S.playing) return;
  const { lat, lng } = e.lngLat, d = districtAt(lat, lng);
  if (!d) { new maplibregl.Popup().setLngLat(e.lngLat).setHTML('<div class="pp">🌊 Ei jayga Bangladesh er bhitore na. Desh er bhitore click koro.</div>').addTo(map); return; }
  const u = nearestUpazila(lat, lng), km = kmBetween(S.pos, [lat, lng]);
  const pp = new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="pp"><b>📍 ${esc(u ? u[0] : '')}, ${d.bn}</b><div class="visited">${esc(d.n)} district · tomar theke ${fmtKm(km)}</div>
    <div class="bt"><button class="btn-g" id="pp_go" style="background:#006a4e;color:#fff">🎯 Ekhane jabo</button><button id="pp_info" style="border:1.5px solid #e3e8e5">ℹ️ Ki ache dekho</button></div></div>`).addTo(map);
  setTimeout(() => {
    const g = document.getElementById('pp_go'), i = document.getElementById('pp_info');
    if (g) g.onclick = () => { pp.remove(); setDest({ type: 'point', c: [lat, lng], label: `${u ? u[0] + ', ' : ''}${d.bn}` }); if (S.overview) setDriveCam(); };
    if (i) i.onclick = () => { pp.remove(); showInfo(lat, lng, false); };
  }, 0);
}

/* ---------- controls ---------- */
const keys = new Set();
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'brake' };
addEventListener('keydown', e => {
  if (!S.playing || $('#ov').classList.contains('show') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  audioInit(); if (ac && ac.state === 'suspended') ac.resume();
  const k = KEYMAP[e.code];
  if (k) { keys.add(k); if (k === 'left' || k === 'right' || k === 'down' || k === 'brake') S.auto = false; if (S.overview && (k === 'up' || k === 'down')) setDriveCam(); e.preventDefault(); }
  if (e.code === 'KeyH') horn();
  if (e.repeat) return;
  if (e.code === 'KeyI') showInfo(S.pos[0], S.pos[1], false);
  if (e.code === 'KeyG') openDestPicker();
  if (e.code === 'KeyP') toggleAuto();
  if (e.code === 'KeyT') openStartPicker();
  if (e.code === 'KeyM') S.overview ? setDriveCam() : setOverview();
  if (e.code === 'KeyN') { S.sound = !S.sound; save(); updateHUD(); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());
document.querySelectorAll('.tc').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); audioInit(); if (ac && ac.state === 'suspended') ac.resume(); if (k === 'horn') { horn(); b.classList.add('on'); return; } keys.add(k); b.classList.add('on'); if (k === 'left' || k === 'right' || k === 'down') S.auto = false; if (S.overview && (k === 'up' || k === 'down')) setDriveCam(); };
  const off = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
function toggleAuto() {
  if (!S.dest) { toast('Age ekta destination dao 🎯'); return; }
  S.auto = !S.auto; if (S.auto && S.overview) setDriveCam();
  toast(S.auto ? '🧭 Auto-drive chalu — steering/brake dile bondho hobe' : 'Auto-drive bondho'); updateHUD(true);
}
$('#nameBtn').onclick = openName; $('#vehBtn').onclick = openVehPicker; $('#hornBtn').onclick = horn;
$('#infoBtn').onclick = () => showInfo(S.pos[0], S.pos[1], false);
$('#destBtn').onclick = openDestPicker; $('#autoBtn').onclick = toggleAuto; $('#startBtn').onclick = openStartPicker;
$('#zoomBtn').onclick = () => S.overview ? setDriveCam() : setOverview();
$('#soundBtn').onclick = () => { audioInit(); S.sound = !S.sound; save(); updateHUD(); };
$('#statsBtn').onclick = openStats;
addEventListener('resize', () => { carKey = ''; if (mapReady && !S.overview) setDriveCam(true); });

/* ---------- physics loop ---------- */
let last = performance.now(), bumpT = 0, saveT = 0, surfT = 0;
function sampleSurface(now) {
  if (!mapReady || S.overview || now - surfT < 150) return; surfT = now;
  const p = map.project(ll(S.pos)), box = [[p.x - 7, p.y - 7], [p.x + 7, p.y + 7]];
  try {
    const roads = roadLayers.length ? map.queryRenderedFeatures(box, { layers: roadLayers }) : [1];
    const water = waterLayers.length ? map.queryRenderedFeatures([p.x, p.y], { layers: waterLayers }) : [];
    S.water = water.length > 0 || seaAt(S.pos[0], S.pos[1]);
    S.offroad = !S.water && roads.length === 0 && map.areTilesLoaded();
  } catch { S.offroad = false; }
}
function step(dt, now) {
  const v = vehicle(); sampleSurface(now);
  const nitroOn = keys.has('boost') && S.nitro > 0 && S.speed > 3;
  let max = v.max * (nitroOn ? 1.6 : 1) * (S.auto ? 1.3 : 1);
  if (S.offroad) max *= 0.45; if (S.water) max = Math.min(max, 40);
  S.nitro = nitroOn ? Math.max(0, S.nitro - dt / 4) : Math.min(1, S.nitro + dt / 12);
  const gas = keys.has('up') || S.auto, brake = keys.has('down');
  if (S.auto && S.dest) { const diff = ((bearing(S.pos, S.dest.c) - S.heading + 540) % 360) - 180; S.heading = (S.heading + Math.max(-90 * dt, Math.min(90 * dt, diff)) + 360) % 360; }
  if (keys.has('brake')) S.speed *= Math.pow(0.03, dt);
  else if (gas && S.speed >= -0.5) S.speed = Math.min(max, S.speed + v.acc * (nitroOn ? 2 : 1) * (1 - Math.max(0, S.speed) / (max * 1.15)) * dt * 2.2);
  else if (brake) S.speed = S.speed > 0.5 ? Math.max(0, S.speed - v.acc * 5 * dt) : Math.max(-v.max * 0.25, S.speed - v.acc * 1.2 * dt);
  else S.speed *= Math.pow(S.offroad ? 0.25 : 0.55, dt);
  if (gas && S.speed < 0) S.speed = Math.min(0, S.speed + v.acc * 5 * dt);
  if (S.speed > max) S.speed = Math.max(max, S.speed - v.acc * 3 * dt);
  if (Math.abs(S.speed) < 0.3 && !gas && !brake) S.speed = 0;
  const turn = (keys.has('left') ? -1 : 0) + (keys.has('right') ? 1 : 0);
  S.steerVis += (turn - S.steerVis) * Math.min(1, dt * 8);
  if (turn && Math.abs(S.speed) > 0.5) { const sp = Math.abs(S.speed), rate = 95 * Math.min(1, sp / 18) * (1 - Math.min(0.5, sp / 400)) * (S.speed < 0 ? -1 : 1) * (keys.has('brake') ? 1.6 : 1); S.heading = (S.heading + turn * rate * dt + 360) % 360; }
  if (S.speed !== 0) {
    const m = S.speed / 3.6 * SPEED_SCALE * dt, rad = S.heading * Math.PI / 180;
    const nlat = S.pos[0] + m * Math.cos(rad) / 111320, nlng = S.pos[1] + m * Math.sin(rad) / (111320 * Math.cos(S.pos[0] * Math.PI / 180));
    if (drivable(nlat, nlng) || !drivable(S.pos[0], S.pos[1])) { S.pos = [nlat, nlng]; S.km += Math.abs(m) / 1000; }
    else { S.speed = 0; S.auto = false; if (now - bumpT > 2500) { bumpT = now; toast('🚧 Shamne desh er border/shagor — onno dike ghurao!'); } }
  }
  if (mapReady && !S.overview) {
    camZoom += ((17.4 - Math.min(2.2, Math.abs(S.speed) / 55)) - camZoom) * Math.min(1, dt * 1.5);
    map.jumpTo({ center: ll(S.pos), bearing: S.heading, zoom: camZoom, pitch: 66, padding: { top: innerHeight * 0.38, bottom: 0, left: 0, right: 0 } });
  }
  updateRoute(); updateHUD(); engineTick();
  if (S.dest && kmBetween(S.pos, S.dest.c) < ARRIVE_KM) arrive();
  if (now - saveT > 3000) { saveT = now; save(); }
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.playing && !$('#ov').classList.contains('show')) step(dt, now); else engineTick();
  if (S.playing) placeCar(now);
  requestAnimationFrame(loop);
}

/* ---------- boot ---------- */
initMap();
requestAnimationFrame(loop);
addEventListener('beforeunload', save);
if (S.name && S.pos) {
  S.playing = true; $('#setup').classList.add('hide');
  if (!mapReady) $('#loading').classList.add('show');
  updateHUD(true);
  setTimeout(() => toast(`Abar shagotom, ${S.name}! 👋 W / ⛽ chepe chalao`, 3500), 600);
} else renderSetup();
window.__game = { S, districtAt, startGame, setDest, dByName, get map() { return map; } };
})();

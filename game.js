/* Desh Ghuri — Bangladesh driving game */
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
const DIST = window.BD_DISTRICTS, PLACES = window.BD_PLACES, VEH = window.VEHICLES, UPZ = window.BD_UPAZILAS;
const DIV_BN = { Barishal: 'বরিশাল', Chattogram: 'চট্টগ্রাম', Dhaka: 'ঢাকা', Khulna: 'খুলনা', Mymensingh: 'ময়মনসিংহ', Rajshahi: 'রাজশাহী', Rangpur: 'রংপুর', Sylhet: 'সিলেট' };
const TIME_FACTOR = 40;          // game runs 40x faster than real life so long trips stay fun
const ARRIVE_KM = 1.6;

/* ---------- geometry ---------- */
function bboxOf(polys) { let a = [180, 90, -180, -90]; polys.forEach(p => p[0].forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; })); return a; }
function inRing(x, y, ring) { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; } return ins; }
function inPolys(x, y, polys) { for (const p of polys) { if (inRing(x, y, p[0])) { let hole = false; for (let k = 1; k < p.length; k++) if (inRing(x, y, p[k])) { hole = true; break; } if (!hole) return true; } } return false; }
DIST.forEach(d => d.bb = bboxOf(d.p));
const WATER = window.BD_WATER, WATER_BB = bboxOf(WATER);
const inBB = (x, y, b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
function districtAt(lat, lng) { for (const d of DIST) if (inBB(lng, lat, d.bb) && inPolys(lng, lat, d.p)) return d; return null; }
const onWater = (lat, lng) => inBB(lng, lat, WATER_BB) && inPolys(lng, lat, WATER);
function kmBetween(a, b) { const R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function bearing(a, b) { const t = Math.PI / 180, y = Math.sin((b[1] - a[1]) * t) * Math.cos(b[0] * t), x = Math.cos(a[0] * t) * Math.sin(b[0] * t) - Math.sin(a[0] * t) * Math.cos(b[0] * t) * Math.cos((b[1] - a[1]) * t); return (Math.atan2(y, x) / t + 360) % 360; }
function nearestUpazila(lat, lng) { let best = null, bd = 1e9; for (const u of UPZ) { const d = (u[1] - lat) ** 2 + ((u[2] - lng) * 0.92) ** 2; if (d < bd) { bd = d; best = u; } } return best; }
const dByName = n => DIST.find(d => d.n === n);
const fmtKm = k => k < 1 ? Math.round(k * 1000) + ' m' : (k < 10 ? k.toFixed(1) : Math.round(k)) + ' km';

/* ---------- state ---------- */
const S = {
  name: ls.get('name', ''), veh: ls.get('veh', 'rickshaw'), pos: ls.get('pos', null), heading: ls.get('heading', 90),
  speed: 0, dest: ls.get('dest', null), visited: ls.get('visited', []), km: ls.get('km', 0), trips: ls.get('trips', 0),
  auto: false, playing: false, curDist: null
};
const vehicle = () => VEH.find(v => v.id === S.veh) || VEH[0];
const save = () => { ls.set('name', S.name); ls.set('veh', S.veh); ls.set('pos', S.pos); ls.set('heading', Math.round(S.heading)); ls.set('dest', S.dest); ls.set('visited', S.visited); ls.set('km', Math.round(S.km * 10) / 10); ls.set('trips', S.trips); };

/* ---------- map ---------- */
const map = L.map('map', { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 17, maxBounds: [[19.5, 86.5], [27.6, 93.8]], maxBoundsViscosity: 0.8 }).setView([23.7, 90.35], 7);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd', maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a> · Boundaries © geoBoundaries'
}).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const distLayer = L.geoJSON({ type: 'FeatureCollection', features: DIST.map(d => ({ type: 'Feature', properties: { n: d.n }, geometry: { type: 'MultiPolygon', coordinates: d.p } })) }, {
  style: f => ({ color: '#006a4e', weight: 1.2, opacity: .55, fillColor: S.visited.includes(f.properties.n) ? '#38a169' : '#006a4e', fillOpacity: S.visited.includes(f.properties.n) ? .14 : .03 }),
  interactive: false
}).addTo(map);
const refreshDistStyle = () => distLayer.setStyle(f => ({ fillColor: S.visited.includes(f.properties.n) ? '#38a169' : '#006a4e', fillOpacity: S.visited.includes(f.properties.n) ? .14 : .03 }));
const labels = L.layerGroup().addTo(map);
DIST.forEach(d => L.marker(d.c, { interactive: false, icon: L.divIcon({ className: '', html: `<div style="font:600 11px 'Hind Siliguri';color:#004d38;text-shadow:0 0 3px #fff,0 0 3px #fff;white-space:nowrap;transform:translate(-50%,-50%)">${d.bn}</div>`, iconSize: [0, 0] }) }).addTo(labels));
map.on('zoomend', () => { const z = map.getZoom(); if (z < 8 || z > 12) map.removeLayer(labels); else labels.addTo(map); });

let vMarker = null, destMarker = null, destLine = null;
function vehIcon() {
  const v = vehicle(), west = S.heading > 180 && S.heading < 360;
  return L.divIcon({ className: 'veh', iconSize: [80, 50], iconAnchor: [40, 40],
    html: `<div class="wrap"><div class="tag">${esc(S.name)}</div><div class="${west ? 'flip' : ''}">${vehicleSVG(v)}</div><div class="hd" style="transform:rotate(${S.heading}deg)"><i>▲</i></div></div>` });
}
let lastIconKey = '';
function drawVehicle() {
  const key = S.veh + '|' + (S.heading > 180) + '|' + Math.round(S.heading / 10) + '|' + S.name;
  if (!vMarker) vMarker = L.marker(S.pos, { icon: vehIcon(), zIndexOffset: 1000, keyboard: false }).addTo(map);
  else { vMarker.setLatLng(S.pos); if (key !== lastIconKey) vMarker.setIcon(vehIcon()); }
  lastIconKey = key;
}
function drawDest() {
  if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
  if (destLine) { map.removeLayer(destLine); destLine = null; }
  if (!S.dest) return;
  destMarker = L.marker(S.dest.c, { icon: L.divIcon({ className: '', html: '<div class="destpin">🏁</div>', iconSize: [34, 34], iconAnchor: [8, 32] }) }).addTo(map);
  destLine = L.polyline([S.pos, S.dest.c], { color: '#f42a41', weight: 3, dashArray: '8 10', opacity: .8 }).addTo(map);
}

/* ---------- UI helpers ---------- */
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('show'); keys.clear(); }
function closeModal() { $('#ov').classList.remove('show'); }
$('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
window.closeModal = closeModal;

function districtCards(divFilter) {
  const byDiv = {};
  DIST.forEach(d => (byDiv[d.div] = byDiv[d.div] || []).push(d));
  return Object.keys(byDiv).sort().map(dv => `<div class="divh">${dv} বিভাগ · ${DIV_BN[dv] || ''}</div>` +
    byDiv[dv].map(d => `<button class="dbtn" data-d="${esc(d.n)}">${d.bn}<small>${esc(d.n)}</small></button>`).join('')).join('');
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
  const steps = `<div class="steps">${[0, 1, 2, 3].map(i => `<div class="${i <= st ? 'on' : ''}"></div>`).join('')}</div>`;
  const head = `<div class="brand">দেশ <span>ঘুরি</span> 🇧🇩</div><div class="sub" style="margin:6px 0 0">Desh Ghuri — puro Bangladesh drive kore ghuro!</div>${steps}`;
  if (st === 0) {
    P.innerHTML = head + `<h2>Tomar naam ki? 👋</h2><p class="sub">Game e eta tomar gari r upor dekhabe. Pore jekono shomoy bodlate parbe.</p>
      <input class="inp" id="nm" maxlength="24" placeholder="e.g. Tanjina" value="${esc(S.name)}">
      <div class="nav"><span></span><button class="btn btn-g" id="nx">Next →</button></div>`;
    const go = () => { const v = $('#nm').value.trim(); if (!v) { $('#nm').focus(); toast('Ekta naam dao 🙂'); return; } S.name = v; save(); setup.step = 1; renderSetup(); };
    $('#nx').onclick = go; $('#nm').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => $('#nm').focus(), 50);
  } else if (st === 1) {
    P.innerHTML = head + `<h2>Kon gari chalabe? 🚦</h2><p class="sub">Pore chaile onno gari o nite parbe.</p>
      <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 96)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div><small>${esc(v.desc)}</small></button>`).join('')}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx">Next →</button></div>`;
    P.querySelectorAll('.vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; save(); P.querySelectorAll('.vcard').forEach(x => x.classList.toggle('on', x === c)); });
    $('#bk').onclick = () => { setup.step = 0; renderSetup(); }; $('#nx').onclick = () => { setup.step = 2; renderSetup(); };
  } else if (st === 2) {
    P.innerHTML = head + `<h2>Kotha theke shuru korbe? 🚩</h2><p class="sub">64 district er jekono ekta beche nao — tomar gari oi district er centre e chole jabe.</p>
      <input class="inp" id="q" placeholder="🔎 District khujo (e.g. Sylhet / সিলেট)" style="margin-bottom:12px;font-size:16px">
      <div class="dlist" id="dl">${districtCards()}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx" ${setup.start ? '' : 'disabled'}>Next →</button></div>`;
    const dl = $('#dl');
    const mark = () => dl.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('on', b.dataset.d === setup.start));
    dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { setup.start = b.dataset.d; mark(); $('#nx').disabled = false; });
    mark(); $('#q').oninput = e => filterList(dl, e.target.value);
    $('#bk').onclick = () => { setup.step = 1; renderSetup(); }; $('#nx').onclick = () => { setup.step = 3; renderSetup(); };
  } else {
    P.innerHTML = head + `<h2>Kothay jabe? 🏁</h2><p class="sub">Destination beche nite paro — na hole <b>free drive</b> e jekhane iccha jao, map e click kore pore destination dite parbe.</p>
      <button class="btn ${setup.dest ? 'btn-w' : 'btn-g'}" id="free" style="width:100%;margin-bottom:12px">🛣️ Free drive — destination chara</button>
      <input class="inp" id="q" placeholder="🔎 Destination district khujo" style="margin-bottom:12px;font-size:16px">
      <div class="dlist" id="dl">${districtCards()}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-r" id="go">🚀 Chalano shuru!</button></div>`;
    const dl = $('#dl');
    const mark = () => { dl.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('on', b.dataset.d === setup.dest)); $('#free').className = 'btn ' + (setup.dest ? 'btn-w' : 'btn-g'); };
    dl.querySelectorAll('.dbtn').forEach(b => { if (b.dataset.d === setup.start) b.disabled = true, b.style.opacity = .4; b.onclick = () => { setup.dest = b.dataset.d; mark(); }; });
    $('#free').onclick = () => { setup.dest = null; mark(); };
    mark(); $('#q').oninput = e => filterList(dl, e.target.value);
    $('#bk').onclick = () => { setup.step = 2; renderSetup(); };
    $('#go').onclick = () => startGame(setup.start, setup.dest);
  }
}

function startGame(startName, destName) {
  const d = dByName(startName);
  S.pos = d.c.slice(); S.speed = 0; S.heading = 90; S.auto = false;
  S.dest = destName ? { type: 'district', name: destName, c: dByName(destName).c } : null;
  S.curDist = null; S.playing = true; save();
  $('#setup').classList.add('hide');
  map.setView(S.pos, 13, { animate: false });
  drawVehicle(); drawDest(); updateHUD(true);
  toast(`${d.bn} (${d.n}) theke shuru! 🚀`);
  if (S.dest) toast(`Destination: ${dByName(destName).bn} — ${fmtKm(kmBetween(S.pos, S.dest.c))} dure`, 3500);
  else toast('Free drive! Map e click kore jekono jayga destination korte paro', 4000);
}

/* ---------- HUD ---------- */
let hudT = 0;
function updateHUD(force) {
  const v = vehicle();
  $('#nameTxt').textContent = S.name; $('#vehTxt').textContent = v.name; $('#vehIcon').innerHTML = vehicleSVG(v, 40);
  $('#spd').textContent = Math.round(Math.abs(S.speed));
  const water = S.pos && onWater(S.pos[0], S.pos[1]);
  $('#mode').innerHTML = (water ? '<span class="badge">⛴️ Ferry</span> ' : '') + (S.auto ? '<span class="badge" style="background:#d69e2e">🧭 Auto</span> ' : '') + (keys.has('boost') ? '<span class="badge" style="background:#f42a41">⚡ Turbo</span>' : '');
  $('#autoBtn').classList.toggle('on', S.auto);
  if (force || performance.now() - hudT > 400) {
    hudT = performance.now();
    const d = districtAt(S.pos[0], S.pos[1]), u = nearestUpazila(S.pos[0], S.pos[1]);
    $('#locD').textContent = d ? `${d.bn} · ${d.n}` : (water ? 'Nodi / Shagor ⛴️' : '—');
    $('#locU').textContent = (u ? `${u[0]} upazila · ` : '') + (d ? `${d.div} division` : '');
    if (d && d.n !== S.curDist) {
      if (S.curDist) toast(`🎉 ${d.bn} (${d.n}) district e shagotom!`);
      S.curDist = d.n;
      if (!S.visited.includes(d.n)) { S.visited.push(d.n); refreshDistStyle(); save(); if (S.visited.length > 1) toast(`🏆 Notun district! ${S.visited.length}/64 ghora hoyeche`); }
    }
    if (S.dest) {
      const km = kmBetween(S.pos, S.dest.c), br = bearing(S.pos, S.dest.c);
      const eta = Math.abs(S.speed) > 1 ? Math.round(km / (Math.abs(S.speed) * TIME_FACTOR / 3600)) : null;
      $('#dest').innerHTML = `<div class="pill"><div class="row"><span id="arrow" style="transform:rotate(${br}deg)">⬆️</span><div style="flex:1"><b>🏁 ${esc(S.dest.label || (dByName(S.dest.name)?.bn + ' · ' + S.dest.name))}</b><div class="visited">${fmtKm(km)} baki${eta !== null ? ` · ~${eta < 60 ? eta + 's' : Math.round(eta / 60) + ' min'}` : ''}</div></div><button title="Destination batil" id="clrDest" style="font-size:18px">✖️</button></div></div>`;
      $('#clrDest').onclick = () => { S.dest = null; S.auto = false; drawDest(); save(); updateHUD(true); toast('Free drive mode 🛣️'); };
    } else $('#dest').innerHTML = `<div class="pill"><div class="row">🛣️ <div><b>Free drive</b><div class="visited">Map e click kore destination dao</div></div></div></div>`;
  }
}

/* ---------- info / arrival screens ---------- */
function placeHTML(d) {
  const info = PLACES[d.n] || { t: '', p: [] };
  const q = encodeURIComponent;
  return info.p.map(([e, name, desc]) => `<div class="place"><div class="e">${e}</div><div><b>${esc(name)}</b><p>${esc(desc)}</p>
    <a href="https://www.google.com/maps/search/${q(name.split('(')[0] + ' ' + d.n + ' Bangladesh')}" target="_blank" rel="noopener">🗺️ Google Maps</a>
    <a href="https://en.wikipedia.org/wiki/Special:Search?search=${q(name.split('(')[0] + ' ' + d.n)}" target="_blank" rel="noopener">📖 Wikipedia</a></div></div>`).join('');
}
function showInfo(lat, lng, arrived) {
  const d = districtAt(lat, lng) || DIST.reduce((a, b) => kmBetween([lat, lng], a.c) < kmBetween([lat, lng], b.c) ? a : b);
  const u = nearestUpazila(lat, lng), info = PLACES[d.n] || { t: '' };
  const km = kmBetween([lat, lng], d.c);
  modal(`<div class="hero"><p>${arrived ? '🎉 Tumi pouche gecho!' : '📍 Tumi ekhon achho'}</p><h2>${d.bn} · ${esc(d.n)}</h2>
    <p>${u ? esc(u[0] + ' upazila · ') : ''}${esc(d.div)} division${km > 3 ? ` · district centre theke ${fmtKm(km)}` : ''}</p><p style="margin-top:6px;font-weight:600">${esc(info.t)}</p></div>
    <h3 style="margin-bottom:10px">✨ ${d.bn} er famous jayga</h3>${placeHTML(d)}
    <div class="mrow"><button class="btn btn-w" id="m_go">🎯 Notun destination</button><button class="btn btn-g" onclick="closeModal()">🚗 Cholo, aro ghuri!</button></div>`);
  $('#m_go').onclick = () => { closeModal(); openDestPicker(); };
}
function arrive() {
  const dest = S.dest; S.trips++; S.speed = 0; S.auto = false; S.dest = null; drawDest(); save();
  showInfo(dest.c[0], dest.c[1], true);
}

/* ---------- pickers ---------- */
function openDestPicker() {
  modal(`<h2>🎯 Kothay jabe?</h2><p class="sub">District beche nao — othoba map e jekono jaygay click koro.</p>
    <input class="inp" id="q" placeholder="🔎 District khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
    <div class="mrow"><button class="btn btn-w" id="free">🛣️ Free drive</button><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  const dl = $('#dl'); $('#q').oninput = e => filterList(dl, e.target.value);
  dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => setDest({ type: 'district', name: b.dataset.d, c: dByName(b.dataset.d).c }));
  $('#free').onclick = () => { S.dest = null; S.auto = false; drawDest(); save(); closeModal(); updateHUD(true); };
}
function setDest(dest) {
  S.dest = dest; save(); drawDest(); closeModal(); updateHUD(true);
  toast(`🏁 Destination set — ${fmtKm(kmBetween(S.pos, dest.c))} dure. 🧭 chap dile auto-drive hobe`, 3500);
}
function openStartPicker() {
  modal(`<h2>🚩 Notun jayga theke shuru</h2><p class="sub">Je district beche nebe, gari tar centre e chole jabe.</p>
    <input class="inp" id="q" placeholder="🔎 District khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${districtCards()}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  const dl = $('#dl'); $('#q').oninput = e => filterList(dl, e.target.value);
  dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { const d = dByName(b.dataset.d); S.pos = d.c.slice(); S.speed = 0; S.auto = false; closeModal(); map.setView(S.pos, 13, { animate: false }); drawVehicle(); drawDest(); save(); updateHUD(true); toast(`🚩 ${d.bn} theke abar shuru!`); });
}
function openVehPicker() {
  modal(`<h2>🔄 Gari bodlao</h2><p class="sub">Je gari choose korbe, oita diyei shamne chalabe.</p>
    <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 90)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div></button>`).join('')}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Close</button></div>`);
  document.querySelectorAll('#modal .vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; S.speed = Math.min(S.speed, vehicle().max); save(); drawVehicle(); updateHUD(true); closeModal(); toast(`${vehicle().name} (${vehicle().bn}) e uthe porecho! ${vehicleIconEmoji()}`); });
}
const vehicleIconEmoji = () => ({ rickshaw: '🛺', van: '🛻', leguna: '🚐', bicycle: '🚲', bike: '🏍️', bus: '🚌', truck: '🚛', car: '🚗', cng: '🛺' }[S.veh]);
function openName() {
  modal(`<h2>✏️ Naam bodlao</h2><p class="sub">Tomar notun naam gari r upor dekhabe.</p><input class="inp" id="nm" maxlength="24" value="${esc(S.name)}">
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button><button class="btn btn-g" id="sv">Save</button></div>`);
  const sv = () => { const v = $('#nm').value.trim(); if (!v) return toast('Naam khali rakha jabe na'); S.name = v; save(); drawVehicle(); updateHUD(true); closeModal(); toast(`Hello, ${v}! 👋`); };
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

/* ---------- map click: set destination / see info ---------- */
map.on('click', e => {
  if (!S.playing) return;
  const { lat, lng } = e.latlng, d = districtAt(lat, lng);
  if (!d) { L.popup().setLatLng(e.latlng).setContent('<div class="pp">🌊 Ei jayga Bangladesh er bhitore na / shagor. Desh er bhitore click koro.</div>').openOn(map); return; }
  const u = nearestUpazila(lat, lng), km = kmBetween(S.pos, [lat, lng]);
  const pp = L.popup().setLatLng(e.latlng).setContent(`<div class="pp"><b>📍 ${esc(u ? u[0] : '')}, ${d.bn}</b><div class="visited">${esc(d.n)} district · tomar theke ${fmtKm(km)}</div>
    <div class="bt"><button class="btn-g" id="pp_go">🎯 Ekhane jabo</button><button class="btn-w" id="pp_info" style="border:1.5px solid #e3e8e5">ℹ️ Ki ache dekho</button></div></div>`).openOn(map);
  setTimeout(() => {
    const g = document.getElementById('pp_go'), i = document.getElementById('pp_info');
    if (g) g.onclick = () => { map.closePopup(pp); setDest({ type: 'point', c: [lat, lng], label: `${u ? u[0] + ', ' : ''}${d.bn}` }); };
    if (i) i.onclick = () => { map.closePopup(pp); showInfo(lat, lng, false); };
  }, 0);
});

/* ---------- controls ---------- */
const keys = new Set();
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'brake' };
addEventListener('keydown', e => {
  if (!S.playing || $('#ov').classList.contains('show') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const k = KEYMAP[e.code];
  if (k) { keys.add(k); if (k !== 'boost') S.auto = k === 'brake' ? false : (k === 'up' ? S.auto : false); e.preventDefault(); }
  if (e.code === 'KeyI') showInfo(S.pos[0], S.pos[1], false);
  if (e.code === 'KeyG') openDestPicker();
  if (e.code === 'KeyP') toggleAuto();
  if (e.code === 'KeyT') openStartPicker();
  if (e.code === 'KeyM') zoomToggle();
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());
document.querySelectorAll('.tc').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); keys.add(k); b.classList.add('on'); if (k !== 'boost' && k !== 'up') S.auto = false; };
  const off = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
function toggleAuto() {
  if (!S.dest) { toast('Age ekta destination dao 🎯'); return; }
  S.auto = !S.auto; toast(S.auto ? '🧭 Auto-drive chalu — destination er dike jacchi' : 'Auto-drive bondho'); updateHUD(true);
}
let zoomedOut = false;
function zoomToggle() { zoomedOut = !zoomedOut; if (zoomedOut) map.fitBounds([[20.6, 88], [26.65, 92.7]]); else map.setView(S.pos, 13); }
$('#nameBtn').onclick = openName; $('#vehBtn').onclick = openVehPicker;
$('#infoBtn').onclick = () => showInfo(S.pos[0], S.pos[1], false);
$('#destBtn').onclick = openDestPicker; $('#autoBtn').onclick = toggleAuto; $('#startBtn').onclick = openStartPicker;
$('#zoomBtn').onclick = zoomToggle; $('#statsBtn').onclick = openStats;
map.on('dragstart', () => { zoomedOut = true; });

/* ---------- game loop ---------- */
let last = performance.now(), bumpT = 0, saveT = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.playing && !$('#ov').classList.contains('show')) step(dt, now);
  requestAnimationFrame(loop);
}
function step(dt, now) {
  const v = vehicle(), water = onWater(S.pos[0], S.pos[1]);
  let max = v.max * (keys.has('boost') ? 1.8 : 1);
  if (water) max = Math.min(max, 25);
  const up = keys.has('up') || S.auto, down = keys.has('down');
  if (S.auto && S.dest) {
    const target = bearing(S.pos, S.dest.c); let diff = ((target - S.heading + 540) % 360) - 180;
    S.heading = (S.heading + Math.max(-120 * dt, Math.min(120 * dt, diff)) + 360) % 360;
  }
  if (keys.has('brake')) S.speed *= Math.pow(0.02, dt);
  else if (up) S.speed = Math.min(max, S.speed + v.acc * (keys.has('boost') ? 1.6 : 1) * dt * 2.2);
  else if (down) S.speed = Math.max(-v.max * 0.3, S.speed - v.acc * 3 * dt * 2.2);
  else S.speed *= Math.pow(0.35, dt);
  if (S.speed > max) S.speed = Math.max(max, S.speed - v.acc * 4 * dt);
  if (Math.abs(S.speed) < 0.2 && !up && !down) S.speed = 0;
  const turn = (keys.has('left') ? -1 : 0) + (keys.has('right') ? 1 : 0);
  if (turn) { const rate = 140 * (0.35 + Math.min(1, Math.abs(S.speed) / 20)) * (S.speed < 0 ? -1 : 1); S.heading = (S.heading + turn * rate * dt + 360) % 360; }
  if (S.speed !== 0) {
    const km = S.speed * TIME_FACTOR / 3600 * dt, rad = S.heading * Math.PI / 180;
    const nlat = S.pos[0] + km * Math.cos(rad) / 111.0, nlng = S.pos[1] + km * Math.sin(rad) / (111.0 * Math.cos(S.pos[0] * Math.PI / 180));
    if (districtAt(nlat, nlng) || onWater(nlat, nlng) || !(districtAt(S.pos[0], S.pos[1]) || onWater(S.pos[0], S.pos[1]))) { S.pos = [nlat, nlng]; S.km += Math.abs(km); }
    else { S.speed = 0; S.auto = false; if (now - bumpT > 2500) { bumpT = now; toast('🚧 Shamne border/shagor — onno dike ghurao!'); } }
  }
  drawVehicle();
  if (!zoomedOut) map.panTo(S.pos, { animate: false });
  if (destLine && S.dest) destLine.setLatLngs([S.pos, S.dest.c]);
  updateHUD();
  if (S.dest && kmBetween(S.pos, S.dest.c) < ARRIVE_KM) arrive();
  if (now - saveT > 3000) { saveT = now; save(); }
}
requestAnimationFrame(loop);
addEventListener('beforeunload', save);

/* ---------- boot ---------- */
if (S.name && S.pos) {
  // returning player: continue where they left off
  S.playing = true; $('#setup').classList.add('hide');
  map.setView(S.pos, 13, { animate: false }); drawVehicle(); drawDest(); updateHUD(true);
  setTimeout(() => toast(`Abar shagotom, ${S.name}! 👋 Jekhane chhile shekhan theke cholo`, 3500), 400);
} else renderSetup();
window.__game = { S, districtAt, onWater, startGame, setDest, dByName };
})();

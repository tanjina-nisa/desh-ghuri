/* Desh Ghuri v3 — Dhaka Street Racer (MapLibre GL v5, OpenFreeMap vector roads, Esri satellite) */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;          // shortest a-b in degrees
const VEH = window.VEHICLES, STARTS = window.DHAKA_STARTS;
const PLACES = window.DHAKA_PLACES.map(p => ({ id: p[0], e: p[1], n: p[2], bn: p[3], c: p[4], info: p[5] }));
const placeById = id => PLACES.find(p => p.id === id);

/* local metric frame around Dhaka (x = east m, y = north m) */
const O = [90.40, 23.78], KX = 111320 * Math.cos(O[1] * D2R), KY = 110574;
const toM = (lng, lat) => [(lng - O[0]) * KX, (lat - O[1]) * KY];
const toLL = (x, y) => [x / KX + O[0], y / KY + O[1]];
const BOUNDS = [[90.22, 23.62], [90.60, 23.96]];
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MINI_STYLE = 'https://tiles.openfreemap.org/styles/positron';
const SAT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SPEED_SCALE = 1.35;   // world moves a bit faster than real life — feels like a racing game
const fmtM = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';

/* per-vehicle sprite size (m that the 120-unit rear svg covers) and length (m) */
const SM = { rickshaw: 1.5, van: 1.85, leguna: 2.4, bicycle: 1.6, bike: 2.0, bus: 2.9, truck: 2.8, car: 2.3, cng: 1.8 };
const LEN = { rickshaw: 2.6, van: 2.6, leguna: 4.2, bicycle: 1.8, bike: 2.1, bus: 11, truck: 9, car: 4.5, cng: 2.8 };
/* road half-widths (m) by OpenMapTiles class */
const HW = { motorway: 11, trunk: 10, primary: 8, secondary: 6.5, tertiary: 5.5, minor: 4, service: 3, busway: 4 };
const ROAD_CLASSES = Object.keys(HW);

/* ---------- storage + state ---------- */
const ls = {
  get(k, d) { try { const v = localStorage.getItem('dg3_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dg3_' + k, JSON.stringify(v)); } catch { } }
};
const S = {
  name: ls.get('name', ''), veh: ls.get('veh', 'car'), x: ls.get('x', null), y: ls.get('y', null), heading: ls.get('h', 0),
  speed: 0, steer: 0, nitro: 1, cam: ls.get('cam', 'chase'), sat: ls.get('sat', true), sound: ls.get('sound', true),
  dest: ls.get('dest', null), auto: false, visited: ls.get('visited', []), km: ls.get('km', 0), best: ls.get('best', 0),
  crashes: ls.get('crashes', 0), trips: ls.get('trips', 0), playing: false, overview: false,
  scrape: 0, shake: 0, lost: 0, needSnap: true, onroad: false, road: '', area: ''
};
const vehicle = () => VEH.find(v => v.id === S.veh) || VEH[0];
const save = () => {
  ls.set('name', S.name); ls.set('veh', S.veh); ls.set('x', S.x == null ? null : Math.round(S.x)); ls.set('y', S.y == null ? null : Math.round(S.y));
  ls.set('h', Math.round(S.heading)); ls.set('cam', S.cam); ls.set('sat', S.sat); ls.set('sound', S.sound); ls.set('dest', S.dest);
  ls.set('visited', S.visited); ls.set('km', Math.round(S.km * 10) / 10); ls.set('best', Math.round(S.best)); ls.set('crashes', S.crashes); ls.set('trips', S.trips);
};

/* ---------- map ---------- */
let map, mini, mapReady = false, miniReady = false;
function initMap() {
  const c0 = S.x != null ? toLL(S.x, S.y) : STARTS[0].c;
  map = new maplibregl.Map({
    container: 'map', style: STYLE_URL, center: c0, zoom: 17, pitch: 70, bearing: S.heading,
    maxPitch: 89, maxZoom: 24, maxBounds: BOUNDS, dragRotate: false, keyboard: false, touchPitch: false,
    dragPan: false, scrollZoom: false, doubleClickZoom: false, touchZoomRotate: false, boxZoom: false,
    attributionControl: { compact: true }, fadeDuration: 0
  });
  map.on('load', () => {
    const style = map.getStyle(), layers = style.layers;
    const before = map.getLayer('building-3d') ? 'building-3d' : (layers.find(l => l.type === 'symbol') || {}).id;
    map.addSource('sat', { type: 'raster', tiles: [SAT_TILES], tileSize: 256, maxzoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' });
    map.addLayer({ id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-fade-duration': 0 } }, layers[1] ? layers[1].id : undefined);
    const RW = ['match', ['get', 'class'], 'motorway', 22, 'trunk', 20, 'primary', 16, 'secondary', 13, 'tertiary', 11, 'minor', 8, 'service', 6, 'busway', 8, 7];
    const W = add => ['interpolate', ['exponential', 2], ['zoom'], 12, ['*', ['+', RW, add], 4096 / 143260], 24, ['*', ['+', RW, add], 16777216 / 143260]];
    const flt = ['all', ['in', ['get', 'class'], ['literal', ROAD_CLASSES]], ['!=', ['get', 'brunnel'], 'tunnel']];
    map.addLayer({ id: 'g-edge', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: flt, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d8d8d2', 'line-width': W(1.6) } }, before);
    map.addLayer({ id: 'g-road', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: flt, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#3d4148', 'line-width': W(0) } }, before);
    map.addLayer({ id: 'g-mark', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 15,
      filter: ['all', flt, ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]]],
      paint: { 'line-color': '#f4f4f4', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 15, 0.25 * 32768 / 143260, 24, 0.25 * 16777216 / 143260], 'line-dasharray': [12, 20] } }, before);
    map.addSource('route', { type: 'geojson', data: emptyFC() });
    map.addLayer({ id: 'g-route', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#2d8cff', 'line-opacity': 0.55, 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 10, 4, 15, 8, 24, 3 * 16777216 / 143260] } }, before);
    if (map.getLayer('building-3d')) { map.setPaintProperty('building-3d', 'fill-extrusion-opacity', 0.92); }
    if (map.setSky) map.setSky({ 'sky-color': '#3d93e0', 'sky-horizon-blend': 0.55, 'horizon-color': '#cfe6ff', 'horizon-fog-blend': 0.6, 'fog-color': '#dfeaf3', 'fog-ground-blend': 0.55, 'atmosphere-blend': 0 });
    applyViewMode();
    mapReady = true; $('#loading').classList.remove('show');
    drawDest(); drawRoute();
    if (S.playing) { if (S.needSnap) buildIndex(); }
  });
  map.on('click', onMapClick);
  map.on('error', e => { if (e && e.error && /sat|arcgis/i.test(String(e.error.message || ''))) console.warn('satellite tile', e.error.message); });
}
/* show satellite or map base, always our own game roads on top */
function applyViewMode() {
  if (!map || !map.getStyle()) return;
  for (const l of map.getStyle().layers) {
    const id = l.id; if (id === 'sat' || id.startsWith('g-') || id === 'building-3d') continue;
    let vis;
    // street-level view: labels/icons off (they clutter the horizon and can crash MapLibre's symbol placement at very high pitch)
    if (l.type === 'symbol') vis = S.overview && !/^poi|shield|airport|aerialway|housenum|one_way/.test(id);
    else if (/^(road|tunnel|bridge|highway)[-_]|^building$/.test(id)) vis = false;      // replaced by our asphalt + 3D buildings
    else if (l.type === 'background') vis = true;
    else vis = !S.sat;
    map.setLayoutProperty(id, 'visibility', vis ? 'visible' : 'none');
  }
  map.setLayoutProperty('sat', 'visibility', S.sat ? 'visible' : 'none');
  map.setPaintProperty('g-road', 'line-opacity', S.sat ? 0.9 : 1);
  map.setPaintProperty('g-edge', 'line-opacity', S.sat ? 0.75 : 1);
  $('#satBtn').classList.toggle('on', S.sat);
}
const emptyFC = () => ({ type: 'FeatureCollection', features: [] });
function initMini() {
  mini = new maplibregl.Map({ container: 'mini', style: MINI_STYLE, center: S.x != null ? toLL(S.x, S.y) : STARTS[0].c, zoom: 15, interactive: false, attributionControl: false, fadeDuration: 0 });
  mini.on('load', () => {
    mini.addSource('route', { type: 'geojson', data: emptyFC() });
    mini.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#2d8cff', 'line-width': 5, 'line-opacity': 0.85 } });
    mini.addSource('dest', { type: 'geojson', data: emptyFC() });
    mini.addLayer({ id: 'dest', type: 'circle', source: 'dest', paint: { 'circle-radius': 7, 'circle-color': '#f42a41', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    miniReady = true; drawRoute(); drawDest();
  });
}

/* ---------- road network index (from the vector tiles already loaded) ---------- */
const CELL = 40;
let segs = [], grid = new Map(), names = [], nameGrid = new Map(), idxAt = { x: 1e12, y: 1e12, t: 0 }, qstamp = 0;
function addToGrid(g, s) {
  const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
  const y0 = Math.floor(Math.min(s.ay, s.by) / CELL), y1 = Math.floor(Math.max(s.ay, s.by) / CELL);
  for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const k = i + ',' + j; let a = g.get(k); if (!a) g.set(k, a = []); a.push(s); }
}
function linesOf(geom) { return geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : []; }
function buildIndex() {
  if (!mapReady) return; const t0 = performance.now();
  const R = 750, R2 = R * R, cx = S.x, cy = S.y, seen = new Set();
  const nSegs = [], nGrid = new Map(), nNames = [], nNameGrid = new Map();
  let feats = [];
  try { feats = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation', filter: ['in', ['get', 'class'], ['literal', ROAD_CLASSES]] }); } catch (e) { }
  for (const f of feats) {
    const p = f.properties, hw = HW[p.class]; if (!hw || p.brunnel === 'tunnel') continue;
    for (const line of linesOf(f.geometry)) {
      let prev = null;
      for (const c of line) {
        const m = toM(c[0], c[1]);
        if (prev) {
          const ax = prev[0], ay = prev[1], bx = m[0], by = m[1];
          const near = ((ax - cx) ** 2 + (ay - cy) ** 2 < R2) || ((bx - cx) ** 2 + (by - cy) ** 2 < R2);
          const len = Math.hypot(bx - ax, by - ay);
          if (near && len > 0.3) {
            const k1 = `${ax | 0},${ay | 0},${bx | 0},${by | 0}`, k2 = `${bx | 0},${by | 0},${ax | 0},${ay | 0}`;
            if (!seen.has(k1) && !seen.has(k2)) {
              seen.add(k1);
              const s = { ax, ay, bx, by, len, ux: (bx - ax) / len, uy: (by - ay) / len, hw, cls: p.class, q: 0 };
              nSegs.push(s); addToGrid(nGrid, s);
            }
          }
        }
        prev = m;
      }
    }
  }
  let nf = [];
  try { nf = map.querySourceFeatures('openmaptiles', { sourceLayer: 'transportation_name' }); } catch (e) { }
  const nseen = new Set();
  for (const f of nf) {
    const p = f.properties, nm = p['name:en'] || p.name_en || p['name:latin'] || p.name; if (!nm) continue;
    for (const line of linesOf(f.geometry)) {
      let prev = null;
      for (const c of line) {
        const m = toM(c[0], c[1]);
        if (prev && ((m[0] - cx) ** 2 + (m[1] - cy) ** 2 < R2)) {
          const len = Math.hypot(m[0] - prev[0], m[1] - prev[1]); const k = `${prev[0] | 0},${prev[1] | 0},${m[0] | 0}`;
          if (len > 0.3 && !nseen.has(k)) { nseen.add(k); const s = { ax: prev[0], ay: prev[1], bx: m[0], by: m[1], len, ux: (m[0] - prev[0]) / len, uy: (m[1] - prev[1]) / len, hw: 0, name: nm, nbn: p['name:bn'] || '', q: 0 }; nNames.push(s); addToGrid(nNameGrid, s); }
        }
        prev = m;
      }
    }
  }
  if (nSegs.length || !segs.length) { segs = nSegs; grid = nGrid; }
  if (nNames.length) { names = nNames; nameGrid = nNameGrid; }
  idxAt = { x: cx, y: cy, t: performance.now() }; S.idxMs = Math.round(idxAt.t - t0);
  if (S.needSnap && segs.length) snapToRoad(400, true);
}
/* nearest road segment: A = best aligned with heading (for lane assist), I = most "inside" (for road edges) */
function nearest(x, y, hx, hy, maxD, g = grid) {
  const r = Math.ceil(maxD / CELL), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); qstamp++;
  let A = null, as = 1e9, I = null, is = 1e9;
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const arr = g.get((cx + i) + ',' + (cy + j)); if (!arr) continue;
    for (const s of arr) {
      if (s.q === qstamp) continue; s.q = qstamp;
      let t = (x - s.ax) * s.ux + (y - s.ay) * s.uy; t = t < 0 ? 0 : t > s.len ? s.len : t;
      const px = s.ax + s.ux * t, py = s.ay + s.uy * t, d = Math.hypot(x - px, y - py);
      if (d > maxD) continue;
      const ex = d - s.hw; if (ex < is) { is = ex; I = { s, px, py, d }; }
      const dot = hx * s.ux + hy * s.uy, al = Math.abs(dot);
      const sc = Math.max(0, d - s.hw * 0.7) + (1 - al) * 14;
      if (sc < as) { as = sc; A = { s, px, py, d, al, sg: dot >= 0 ? 1 : -1 }; }
    }
  }
  return { A, I };
}
const segHeading = (s, sg) => Math.atan2(s.ux * sg, s.uy * sg) * R2D;
function lanesOf(hw) { return hw >= 8 ? [-hw * 0.7, -hw * 0.25, hw * 0.25, hw * 0.7] : hw >= 5.5 ? [-hw * 0.42, hw * 0.42] : [0]; }
function snapToRoad(maxD, align) {
  const h = S.heading * D2R, q = nearest(S.x, S.y, Math.sin(h), Math.cos(h), maxD);
  const hit = q.A || q.I; if (!hit) return false;
  const s = hit.s; S.x = hit.px; S.y = hit.py;
  if (align) { const sg = (Math.sin(h) * s.ux + Math.cos(h) * s.uy) >= 0 ? 1 : -1; S.heading = segHeading(s, sg); const pos = lanesOf(s.hw).filter(v => v > 0), off = pos.length ? pos[0] : 0; const tx = s.ux * sg, ty = s.uy * sg; S.x += -ty * off; S.y += tx * off; }
  S.needSnap = false; S.lost = 0; return true;
}

/* ---------- traffic ---------- */
const TK = ['car', 'car', 'car', 'cng', 'cng', 'cng', 'bus', 'bus', 'rickshaw', 'rickshaw', 'bike', 'bike', 'truck', 'leguna'];
const AI_N = 12, AIs = [];
const trafficEl = $('#traffic');
for (let i = 0; i < AI_N; i++) { const el = document.createElement('div'); el.className = 'spr'; trafficEl.appendChild(el); AIs.push({ alive: false, el, kind: '', t: 0 }); }
function aiTarget(cls, kind) {
  let v = { motorway: 80, trunk: 70, primary: 55, secondary: 45, tertiary: 38, minor: 28, service: 18, busway: 40 }[cls] || 30;
  v *= 0.75 + Math.random() * 0.45;
  if (kind === 'rickshaw') v = Math.min(v, 16); if (kind === 'cng' || kind === 'leguna') v = Math.min(v, 50);
  if (kind === 'bus' || kind === 'truck') v = Math.min(v, 60);
  return v;
}
function spawnAI(ai, minD = 70, maxD = 380) {
  if (!segs.length) return false;
  const h = S.heading * D2R, fx = Math.sin(h), fy = Math.cos(h);
  for (let tries = 0; tries < 40; tries++) {
    const s = segs[Math.random() * segs.length | 0]; if (s.hw < 3.5) continue;
    const t = Math.random() * s.len; let x = s.ax + s.ux * t, y = s.ay + s.uy * t;
    const dx = x - S.x, dy = y - S.y, dd = Math.hypot(dx, dy);
    if (dd < minD || dd > maxD || (dx * fx + dy * fy) / dd < 0.55) continue;
    const dot = s.ux * fx + s.uy * fy; if (Math.abs(dot) < 0.6) continue;
    const sg = dot >= 0 ? 1 : -1, tx = s.ux * sg, ty = s.uy * sg;
    const lanes = lanesOf(s.hw).filter(v => v >= 0), off = lanes[Math.random() * lanes.length | 0];
    if (AIs.some(o => o !== ai && o.alive && Math.hypot(o.x - x, o.y - y) < 14)) continue;
    const kind = TK[Math.random() * TK.length | 0];
    Object.assign(ai, { alive: true, x: x - ty * off, y: y + tx * off, h: segHeading(s, sg), v: 0, kind, lane: off, tv: aiTarget(s.cls, kind), hitT: 0, brake: false });
    ai.v = ai.tv;
    if (ai.el.dataset.k !== kind) { ai.el.innerHTML = vehicleRear(VEH.find(v => v.id === kind), 120); ai.el.dataset.k = kind; }
    return true;
  }
  return false;
}
function stepAI(dt, now) {
  const ph = S.heading * D2R, pfx = Math.sin(ph), pfy = Math.cos(ph);
  for (const ai of AIs) {
    if (!ai.alive) { if (now - ai.t > 600) { ai.t = now; spawnAI(ai); } continue; }
    const dx = ai.x - S.x, dy = ai.y - S.y, dist = Math.hypot(dx, dy), fwd = dx * pfx + dy * pfy;
    if (dist > 520 || fwd < -70) { ai.alive = false; ai.el.style.display = 'none'; continue; }
    const h = ai.h * D2R, hx = Math.sin(h), hy = Math.cos(h);
    const q = nearest(ai.x, ai.y, hx, hy, 22);
    if (!q.A || q.A.al < 0.35) { if (fwd > 120 || fwd < 0) { ai.alive = false; ai.el.style.display = 'none'; } continue; }
    const s = q.A.s, sg = q.A.sg, th = segHeading(s, sg);
    ai.h += angDiff(th, ai.h) * Math.min(1, dt * 5);
    const tx = s.ux * sg, ty = s.uy * sg, nlx = -ty, nly = tx;
    const lane = Math.min(ai.lane, s.hw * 0.7), lat = (ai.x - q.A.px) * nlx + (ai.y - q.A.py) * nly, k = Math.min(1, dt * 2);
    ai.x += nlx * (lane - lat) * k; ai.y += nly * (lane - lat) * k;
    // slow down behind the player if they're right in front in the same lane
    const rx = S.x - ai.x, ry = S.y - ai.y, af = rx * hx + ry * hy, al = Math.abs(rx * hy - ry * hx);
    let tgt = ai.tv; if (af > 0 && af < 16 && al < 2.2) tgt = Math.min(tgt, Math.max(0, S.speed * 0.9));
    ai.brake = tgt < ai.v - 2; ai.v += clamp(tgt - ai.v, -40 * dt, 12 * dt);
    const d = ai.v / 3.6 * dt * SPEED_SCALE; ai.x += Math.sin(ai.h * D2R) * d; ai.y += Math.cos(ai.h * D2R) * d;
    // collision with player
    const v = vehicle(), lx = ai.x - S.x, ly = ai.y - S.y, f2 = lx * pfx + ly * pfy, l2 = Math.abs(lx * pfy - ly * pfx);
    const lenSum = (LEN[S.veh] + LEN[ai.kind]) / 2, widSum = (v.w + (VEH.find(z => z.id === ai.kind) || v).w) / 2;
    if (Math.abs(f2) < lenSum && l2 < widSum * 0.95 && now - ai.hitT > 900) {
      ai.hitT = now; const rel = Math.abs(S.speed - ai.v);
      if (rel > 8) crash(rel);
      if (f2 > 0) { S.speed = Math.min(S.speed, ai.v * 0.7); const push = lenSum - f2 + 0.3; S.x -= pfx * push; S.y -= pfy * push; ai.v += 6; }
      else { S.speed = Math.max(S.speed, ai.v * 0.8); ai.v *= 0.6; }
    }
  }
}
function crash(rel) {
  S.crashes++; S.shake = Math.min(1.5, 0.5 + rel / 60); const fl = $('#flash'); fl.style.transition = 'none'; fl.style.opacity = 1; requestAnimationFrame(() => { fl.style.transition = 'opacity .5s'; fl.style.opacity = 0; });
  thud(Math.min(1, rel / 80)); badgeFlash = performance.now();
  if (rel > 25) toast(['💥 Dhakka! Shabdhane chalao', '🚨 Oops! Traffic e dhakka', '😬 Mama, dekhe chalao!'][S.crashes % 3]);
}

/* ---------- route (OSRM) + destination ---------- */
let route = null, routeT = 0, destMarker = null;
function drawDest() {
  if (destMarker) { destMarker.remove(); destMarker = null; }
  if (mapReady && S.dest) { const el = document.createElement('div'); el.className = 'destpin'; el.textContent = '🏁'; destMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(S.dest.c).addTo(map); }
  if (miniReady) mini.getSource('dest').setData(S.dest ? { type: 'Feature', geometry: { type: 'Point', coordinates: S.dest.c } } : emptyFC());
}
function drawRoute() {
  const fc = route ? { type: 'Feature', geometry: { type: 'LineString', coordinates: route.ll } } : emptyFC();
  if (mapReady) map.getSource('route').setData(fc);
  if (miniReady) mini.getSource('route').setData(fc);
}
async function fetchRoute() {
  if (!S.dest || S.x == null) { route = null; drawRoute(); return; }
  routeT = performance.now();
  const a = toLL(S.x, S.y), b = S.dest.c, want = S.dest;
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}?overview=full&geometries=geojson&bearings=${Math.round(S.heading)},80;`).then(r => r.json());
    if (S.dest !== want) return;
    const rt = r.routes && r.routes[0]; if (!rt) throw 0;
    const ll = rt.geometry.coordinates, pts = ll.map(c => toM(c[0], c[1])), cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const snapEnd = r.waypoints && r.waypoints[1] ? r.waypoints[1].distance : 0;
    route = { ll, pts, cum, idx: 0, total: cum[cum.length - 1], snapEnd };
  } catch (e) {
    const p = toM(b[0], b[1]); route = { ll: [a, b], pts: [[S.x, S.y], p], cum: [0, Math.hypot(p[0] - S.x, p[1] - S.y)], idx: 0, total: Math.hypot(p[0] - S.x, p[1] - S.y), snapEnd: 0, straight: true };
  }
  drawRoute();
}
/* progress along route: nearest point, lookahead target, remaining distance */
function routeInfo(look) {
  if (!route) return null;
  const P = route.pts; let best = route.idx, bd = 1e12;
  const i0 = Math.max(0, route.idx - 3), i1 = Math.min(P.length - 2, route.idx + 60);
  for (let i = i0; i <= i1; i++) {
    const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    let t = ((S.x - a[0]) * dx + (S.y - a[1]) * dy) / L; t = clamp(t, 0, 1);
    const d = (S.x - a[0] - dx * t) ** 2 + (S.y - a[1] - dy * t) ** 2; if (d < bd) { bd = d; best = i; route.t = t; }
  }
  route.idx = best;
  const along = route.cum[best] + (route.cum[best + 1] - route.cum[best]) * (route.t || 0), want = along + look;
  let j = best; while (j < P.length - 1 && route.cum[j + 1] < want) j++;
  let tp; if (j >= P.length - 1) tp = P[P.length - 1]; else { const seg = route.cum[j + 1] - route.cum[j] || 1, u = (want - route.cum[j]) / seg; tp = [P[j][0] + (P[j + 1][0] - P[j][0]) * u, P[j][1] + (P[j + 1][1] - P[j][1]) * u]; }
  return { off: Math.sqrt(bd), left: Math.max(0, route.total - along), tp };
}
function setDest(dest) {
  S.dest = dest; S.auto = false; route = null; save(); drawDest(); fetchRoute(); closeModal(); updateHUD(true);
  const p = toM(dest.c[0], dest.c[1]);
  toast(`🏁 ${dest.n} — ${fmtM(Math.hypot(p[0] - S.x, p[1] - S.y))} dure. Blue rasta dhore jao · P = auto-drive`, 4000);
  if (S.overview) setDriveCam();
}
function clearDest() { S.dest = null; S.auto = false; route = null; save(); drawDest(); drawRoute(); updateHUD(true); }
function arrive() {
  const d = S.dest; S.trips++; S.speed = 0; S.auto = false;
  if (d.id && !S.visited.includes(d.id)) S.visited.push(d.id);
  S.dest = null; route = null; drawDest(); drawRoute(); save();
  const pl = d.id ? placeById(d.id) : null;
  showInfo(d.c, true, pl);
}

/* ---------- camera ---------- */
const cam = { x: 0, y: 0, fx: 0, fy: 1, fov: 0 };
function setDriveCam() {
  S.overview = false; document.body.classList.remove('overview'); if (mapReady) applyViewMode();
  if (mapReady) { map.dragPan.disable(); map.scrollZoom.disable(); map.touchZoomRotate.disable(); if (meMarker) { meMarker.remove(); meMarker = null; } }
  $('#zoomBtn').classList.remove('on');
}
let meMarker = null;
function setOverview() {
  if (!mapReady) return;
  S.overview = true; document.body.classList.add('overview'); keys.clear(); applyViewMode();
  map.setVerticalFieldOfView(36.87); cam.fov = 36.87;
  map.easeTo({ center: toLL(S.x, S.y), zoom: 13.6, pitch: 0, bearing: 0, duration: 1100 });
  map.dragPan.enable(); map.scrollZoom.enable(); map.touchZoomRotate.enable();
  const el = document.createElement('div'); el.style.cssText = 'font-size:30px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.6))'; el.textContent = '🚗';
  meMarker = new maplibregl.Marker({ element: el }).setLngLat(toLL(S.x, S.y)).addTo(map);
  $('#zoomBtn').classList.add('on'); toast('🗺️ Puro Dhaka — drag/zoom koro, click kore destination dao. M = gari-te ferot');
}
function camUpdate() {
  const v = vehicle(), h = S.heading * D2R, fx = Math.sin(h), fy = Math.cos(h);
  const sp = clamp(S.speed / v.max, 0, 1.3), big = v.id === 'bus' || v.id === 'truck';
  let back, up, ahead, tAlt, fov;
  if (S.cam === 'cockpit') { back = big ? -3 : -0.3; up = big ? 2.7 : v.cock === 'car' ? 1.25 : 1.5; ahead = 34; tAlt = up * 0.62; fov = 64 + sp * 12; }
  else if (S.cam === 'far') { back = (big ? 22 : 15) + sp * 4; up = (big ? 9 : 6.5) + sp; ahead = 26; tAlt = 0; fov = 55 + sp * 10; }
  else { back = (big ? 13 : 7.2) + sp * 2.6; up = (big ? 4.6 : 2.6) + sp * 0.5; ahead = 24; tAlt = 0.7; fov = 58 + sp * 15; }
  const sh = S.shake * 0.12 + sp * 0.015, jx = (Math.random() - 0.5) * sh, jy = (Math.random() - 0.5) * sh, jz = (Math.random() - 0.5) * sh;
  const cx = S.x - fx * back + jx, cy = S.y - fy * back + jy, tx = S.x + fx * ahead, ty = S.y + fy * ahead;
  if (Math.abs(fov - cam.fov) > 0.4) { map.setVerticalFieldOfView(fov); cam.fov = fov; }
  const o = map.calculateCameraOptionsFromTo(new maplibregl.LngLat(...toLL(cx, cy)), up + jz, new maplibregl.LngLat(...toLL(tx, ty)), tAlt);
  map.jumpTo(o);
  Object.assign(cam, { x: cx, y: cy, fx, fy });
}

/* ---------- sprites ---------- */
const carEl = $('#car'); let carKey = '';
function renderCarSprite() { const k = S.veh; if (k === carKey) return; carKey = k; $('#carSvg').innerHTML = vehicleRear(vehicle(), 120); }
function placeSprite(el, x, y, kind) {
  const dx = x - cam.x, dy = y - cam.y, f = dx * cam.fx + dy * cam.fy;
  if (f < 1.5 || f > 420) { el.style.display = 'none'; return; }
  const p1 = map.project(toLL(x, y)), p2 = map.project(toLL(x + cam.fy, y - cam.fx));   // 1 m to the camera's right
  const ppm = Math.hypot(p2.x - p1.x, p2.y - p1.y), size = ppm * SM[kind];
  if (!isFinite(size) || size < 2 || p1.y < -50 || p1.y > innerHeight + size) { el.style.display = 'none'; return; }
  el.style.display = 'block'; el.style.width = el.style.height = size.toFixed(1) + 'px';
  el.style.transform = `translate(${(p1.x - size / 2).toFixed(1)}px,${(p1.y - size * 112 / 120).toFixed(1)}px)`;
  el.style.zIndex = String(1000 - Math.round(f * 2));
}
function placeAll() {
  renderCarSprite();
  if (S.overview) return;
  if (S.cam === 'cockpit') carEl.style.display = 'none';
  else {
    placeSprite(carEl, S.x, S.y, S.veh);
    const steerTilt = S.steer * clamp(S.speed / 60, 0, 1) * 3;
    carEl.querySelector('svg') && (carEl.querySelector('svg').style.transform = `rotate(${steerTilt.toFixed(2)}deg)`);
    carEl.classList.toggle('braking', keys.has('down') && S.speed > 1);
    carEl.classList.toggle('nitro', S.nitroOn);
    carEl.classList.toggle('scrape', S.scrape > 0);
  }
  for (const ai of AIs) { if (!ai.alive) continue; placeSprite(ai.el, ai.x, ai.y, ai.kind); ai.el.classList.toggle('braking', ai.brake); }
}

/* ---------- cockpit overlay ---------- */
const ck = $('#cockpit'); let ckKey = '';
function cockpitSVG(v) {
  const dig = `<text id="ckSpd" class="dig" x="400" y="305" font-size="46" text-anchor="middle" fill="#ff5a4e">0</text><text x="400" y="326" font-size="13" text-anchor="middle" fill="#ffb4ad" font-family="Orbitron">KM/H</text>`;
  if (v.cock === 'car') return `<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="dsh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f36"/><stop offset="1" stop-color="#0d0f12"/></linearGradient>
    <radialGradient id="glass" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1a1d22"/><stop offset="1" stop-color="#050607"/></radialGradient></defs>
    <path d="M-400 400V215Q-200 170 0 185Q200 150 400 150Q600 150 800 185Q1000 170 1200 215V400Z" fill="url(#dsh)"/>
    <path d="M-400 215Q-200 170 0 185Q200 150 400 150Q600 150 800 185Q1000 170 1200 215" fill="none" stroke="#4a505a" stroke-width="3"/>
    <rect x="300" y="168" width="200" height="104" rx="24" fill="url(#glass)" stroke="#3a3f47" stroke-width="3"/>${dig.replace('y="305"', 'y="238"').replace('y="326"', 'y="259"')}
    <rect x="320" y="180" width="160" height="10" rx="5" fill="#222"/><rect id="ckBar" x="320" y="180" width="0" height="10" rx="5" fill="#ff5a4e"/>
    <g class="wheel" id="ckWheel" style="transform-origin:400px 420px"><circle cx="400" cy="420" r="135" fill="none" stroke="#14161a" stroke-width="30"/><circle cx="400" cy="420" r="135" fill="none" stroke="#2c3038" stroke-width="6"/>
      <path d="M276 410Q400 382 524 410L508 442Q400 422 292 442Z" fill="#1c1f24"/><circle cx="400" cy="420" r="40" fill="#22262c" stroke="#3a3f47" stroke-width="3"/><circle cx="400" cy="420" r="12" fill="#006a4e"/><circle cx="400" cy="420" r="6" fill="#f42a41"/></g></svg>`;
  // bike / bicycle / rickshaw handlebar view
  const motor = v.id === 'bike';
  return `<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
    <path d="M150 300Q400 250 650 300" fill="none" stroke="#1b1d21" stroke-width="22" stroke-linecap="round"/>
    ${motor ? `<path d="M170 160l-70-70M630 160l70-70" stroke="#222" stroke-width="10" stroke-linecap="round"/><ellipse cx="80" cy="70" rx="85" ry="48" fill="#1b1d21"/><ellipse cx="80" cy="70" rx="72" ry="37" fill="#9fb3c8" opacity=".9"/><path d="M20 62h110" stroke="#e53e3e" stroke-width="6"/><ellipse cx="720" cy="70" rx="85" ry="48" fill="#1b1d21"/><ellipse cx="720" cy="70" rx="72" ry="37" fill="#9fb3c8" opacity=".9"/><path d="M670 62h110" stroke="#e53e3e" stroke-width="6"/>` : ''}
    <g class="wheel" id="ckWheel" style="transform-origin:400px 300px">
      <path d="M90 300Q400 240 710 300" fill="none" stroke="${motor ? '#2d3036' : '#9aa3ad'}" stroke-width="18" stroke-linecap="round"/>
      <rect x="40" y="276" width="120" height="50" rx="22" fill="#111"/><rect x="640" y="276" width="120" height="50" rx="22" fill="#111"/>
      <path d="M90 330q-20 40 10 70h90q10-40-10-70z" fill="#5c3b22"/><path d="M710 330q20 40-10 70h-90q-10-40 10-70z" fill="#5c3b22"/>
      ${motor ? `<rect x="300" y="200" width="200" height="140" rx="24" fill="#16181c" stroke="#3a3f47" stroke-width="4"/>${dig}<rect x="320" y="212" width="160" height="10" rx="5" fill="#222"/><rect id="ckBar" x="320" y="212" width="0" height="10" rx="5" fill="#ff5a4e"/><circle cx="270" cy="300" r="22" fill="#b91c1c"/><circle cx="530" cy="300" r="22" fill="#b91c1c"/>`
      : `<rect x="340" y="250" width="120" height="70" rx="16" fill="#16181c"/><text id="ckSpd" class="dig" x="400" y="298" font-size="34" text-anchor="middle" fill="#7ee0b5">0</text><rect id="ckBar" x="0" y="0" width="0" height="0"/>`}
    </g></svg>`;
}
function updateCockpit() {
  const on = S.cam === 'cockpit' && !S.overview && S.playing;
  ck.style.display = on ? 'block' : 'none'; document.body.classList.toggle('cockpit', on);
  if (!on) return;
  const v = vehicle(); if (ckKey !== v.id) { ckKey = v.id; ck.innerHTML = cockpitSVG(v); }
  const w = $('#ckWheel'); if (w) w.style.transform = `rotate(${(S.steer * (v.cock === 'car' ? 70 : 18)).toFixed(1)}deg)`;
  const sp = $('#ckSpd'); if (sp) sp.textContent = Math.round(Math.abs(S.speed));
  const b = $('#ckBar'); if (b && b.getAttribute('height') !== '0') b.setAttribute('width', (160 * clamp(Math.abs(S.speed) / v.max, 0, 1)).toFixed(0));
}

/* ---------- audio ---------- */
let ac = null, eng = null, noiseBuf = null, scrapeG = null;
function audioInit() {
  if (ac) return; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination); o1.start(); o2.start();
  eng = { o1, o2, f, g };
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const ns = ac.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true; const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; scrapeG = ac.createGain(); scrapeG.gain.value = 0;
  ns.connect(nf); nf.connect(scrapeG); scrapeG.connect(ac.destination); ns.start();
}
function engineTick() {
  if (!eng) return;
  const v = vehicle(), active = S.sound && S.playing && !S.overview && !$('#ov').classList.contains('show');
  const sp = Math.abs(S.speed), gearLen = v.max / 6, rpm = (sp % gearLen) / gearLen * 0.7 + sp / v.max * 0.5;
  const base = (v.engine ? 40 : 20) + rpm * 110 * (v.pitch || 1);
  eng.o1.frequency.setTargetAtTime(base, ac.currentTime, 0.05);
  eng.o2.frequency.setTargetAtTime(base * 0.5, ac.currentTime, 0.05);
  eng.f.frequency.setTargetAtTime(300 + rpm * 1100 + (S.nitroOn ? 600 : 0), ac.currentTime, 0.05);
  eng.g.gain.setTargetAtTime(active && v.engine ? 0.035 + (keys.has('up') || S.auto ? 0.03 : 0) : 0, ac.currentTime, 0.08);
  scrapeG.gain.setTargetAtTime(active && S.scrape > 0 && sp > 5 ? 0.05 : 0, ac.currentTime, 0.05);
}
function thud(k) {
  audioInit(); if (!ac || !S.sound) return; const now = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; const g = ac.createGain();
  g.gain.setValueAtTime(0.5 * k + 0.1, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.45); s.connect(f); f.connect(g); g.connect(ac.destination); s.start(now); s.stop(now + 0.5);
}
let hornT = 0;
function horn() {
  audioInit(); if (!ac || !S.sound) return; const now = ac.currentTime; if (performance.now() - hornT < 350) return; hornT = performance.now();
  const v = vehicle();
  if (!v.engine) {
    [0, 0.18].forEach(t => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 2350; g.gain.setValueAtTime(0.25, now + t); g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.35); o.connect(g); g.connect(ac.destination); o.start(now + t); o.stop(now + t + 0.4); });
  } else {
    const f = v.id === 'truck' || v.id === 'bus' ? [220, 277] : v.id === 'bike' ? [520, 620] : [392, 494];
    f.forEach(fr => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = fr; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + 0.02); g.gain.setValueAtTime(0.08, now + 0.45); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55); o.connect(g); g.connect(ac.destination); o.start(now); o.stop(now + 0.6); });
  }
  // traffic ahead gets out of the way a little
  for (const ai of AIs) if (ai.alive) { const dx = ai.x - S.x, dy = ai.y - S.y; if (Math.hypot(dx, dy) < 40) ai.tv += 8; }
}

/* ---------- UI helpers ---------- */
function toast(msg, ms = 2600) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms); }
function modal(html) { $('#modal').innerHTML = html; $('#ov').classList.add('show'); keys.clear(); }
function closeModal() { $('#ov').classList.remove('show'); }
$('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
window.closeModal = closeModal;
const startCards = sel => STARTS.map(s => `<button class="dbtn ${s.id === sel ? 'on' : ''}" data-s="${s.id}">🚩 ${s.bn}<small>${esc(s.n)}</small></button>`).join('');
const placeCards = sel => PLACES.map(p => `<button class="dbtn ${p.id === sel ? 'on' : ''}" data-p="${p.id}">${p.e} ${p.bn}<small>${esc(p.n)}${S.visited.includes(p.id) ? ' · ✅' : ''}</small></button>`).join('');
function filterList(listEl, q) { q = q.trim().toLowerCase(); listEl.querySelectorAll('.dbtn').forEach(b => { b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none'; }); }
const KEYS_HTML = `<div class="keys"><div><kbd>↑</kbd> Speed barao (gas)</div><div><kbd>↓</kbd> Brake / pichone</div><div><kbd>←</kbd> <kbd>→</kbd> Left / Right ghurao</div><div><kbd>Space</kbd> Nitro ⚡</div><div><kbd>C</kbd> Camera: pichon / cockpit / dur</div><div><kbd>V</kbd> Satellite ↔ Map</div><div><kbd>H</kbd> Horn · <kbd>P</kbd> Auto-drive</div><div><kbd>M</kbd> Puro Dhaka map · <kbd>G</kbd> Destination</div></div>`;

/* ---------- setup wizard ---------- */
const setup = { step: 0, start: null, dest: null };
function renderSetup() {
  const P = $('#setupPanel'), st = setup.step;
  const head = `<div class="brand">ঢাকা <span>ঘুরি</span> 🏎️</div><div class="sub" style="margin:6px 0 0">Desh Ghuri: Dhaka Street Racer — asol Dhakar rastay, satellite view-te gari chalao!</div><div class="steps">${[0, 1, 2, 3].map(i => `<div class="${i <= st ? 'on' : ''}"></div>`).join('')}</div>`;
  if (st === 0) {
    P.innerHTML = head + `<h2>Tomar naam ki? 👋</h2><p class="sub">Pore jekono shomoy bodlate parbe.</p>
      <input class="inp" id="nm" maxlength="24" placeholder="e.g. Tanjina" value="${esc(S.name)}"><div class="nav"><span></span><button class="btn btn-g" id="nx">Next →</button></div>`;
    const go = () => { const v = $('#nm').value.trim(); if (!v) { toast('Ekta naam dao 🙂'); return; } S.name = v; save(); setup.step = 1; renderSetup(); };
    $('#nx').onclick = go; $('#nm').onkeydown = e => { if (e.key === 'Enter') go(); }; setTimeout(() => $('#nm').focus(), 50);
  } else if (st === 1) {
    P.innerHTML = head + `<h2>Kon gari chalabe? 🚦</h2><p class="sub">Game-e 🔄 chap dile jekono shomoy bodlate parbe.</p>
      <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 96)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div><small>${esc(v.desc)}</small></button>`).join('')}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx">Next →</button></div>`;
    P.querySelectorAll('.vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; save(); P.querySelectorAll('.vcard').forEach(x => x.classList.toggle('on', x === c)); });
    $('#bk').onclick = () => { setup.step = 0; renderSetup(); }; $('#nx').onclick = () => { setup.step = 2; renderSetup(); };
  } else if (st === 2) {
    P.innerHTML = head + `<h2>Dhakar kotha theke shuru? 🚩</h2><p class="sub">Gari oi jaygar rastay giye darabe.</p>
      <div class="dlist" id="dl">${startCards(setup.start)}</div>
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-g" id="nx" ${setup.start ? '' : 'disabled'}>Next →</button></div>`;
    $('#dl').querySelectorAll('.dbtn').forEach(b => b.onclick = () => { setup.start = b.dataset.s; $('#dl').querySelectorAll('.dbtn').forEach(x => x.classList.toggle('on', x === b)); $('#nx').disabled = false; });
    $('#bk').onclick = () => { setup.step = 1; renderSetup(); }; $('#nx').onclick = () => { setup.step = 3; renderSetup(); };
  } else {
    P.innerHTML = head + `<h2>Kothay jabe? 🏁</h2><p class="sub">Famous jayga beche nao — GPS-er moto blue rasta dekhabe. Na hole <b>free drive</b>.</p>
      <button class="btn ${setup.dest ? 'btn-w' : 'btn-g'}" id="free" style="width:100%;margin-bottom:12px">🛣️ Free drive — jekhane iccha</button>
      <input class="inp" id="q" placeholder="🔎 Jayga khujo (e.g. Lalbagh)" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${placeCards(setup.dest)}</div>
      <h3 style="margin:16px 0 4px">🎮 Control</h3>${KEYS_HTML}
      <div class="nav"><button class="btn btn-w" id="bk">← Back</button><button class="btn btn-r" id="go">🚀 Chalano shuru!</button></div>`;
    const dl = $('#dl'), mark = () => { dl.querySelectorAll('.dbtn').forEach(b => b.classList.toggle('on', b.dataset.p === setup.dest)); $('#free').className = 'btn ' + (setup.dest ? 'btn-w' : 'btn-g'); };
    dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { setup.dest = b.dataset.p; mark(); });
    $('#free').onclick = () => { setup.dest = null; mark(); }; $('#q').oninput = e => filterList(dl, e.target.value);
    $('#bk').onclick = () => { setup.step = 2; renderSetup(); };
    $('#go').onclick = () => { audioInit(); startAt(STARTS.find(s => s.id === setup.start)); if (setup.dest) { const p = placeById(setup.dest); setDest({ id: p.id, n: p.n, bn: p.bn, c: p.c }); } };
  }
}
function startAt(st) {
  const m = toM(st.c[0], st.c[1]); S.x = m[0]; S.y = m[1]; S.heading = 0; S.speed = 0; S.auto = false; S.nitro = 1; S.needSnap = true;
  segs = []; grid = new Map(); idxAt = { x: 1e12, y: 1e12, t: 0 }; AIs.forEach(a => { a.alive = false; a.el.style.display = 'none'; });
  begin(); toast(`🚩 ${st.bn} theke shuru! ↑ chepe gas dao, Space = nitro ⚡`, 3800);
  if (route) fetchRoute();
}
function begin() {
  S.playing = true; save(); $('#setup').classList.add('hide');
  if (!mapReady) $('#loading').classList.add('show');
  setDriveCam(); updateHUD(true);
  if (mapReady) buildIndex();
}

/* ---------- info / places ---------- */
function nearbyPlaces(c, n = 5, maxM = 3500) {
  const p = toM(c[0], c[1]);
  return PLACES.map(pl => { const q = toM(pl.c[0], pl.c[1]); return { pl, d: Math.hypot(q[0] - p[0], q[1] - p[1]) }; }).filter(o => o.d < maxM).sort((a, b) => a.d - b.d).slice(0, n);
}
const placeRow = (pl, d) => `<div class="place"><div class="e">${pl.e}</div><div><b>${pl.bn} · ${esc(pl.n)}${S.visited.includes(pl.id) ? ' ✅' : ''}</b><p>${esc(pl.info)}</p>
  ${d != null ? `<p style="font-size:12.5px">📏 ${fmtM(d)} dure</p>` : ''}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pl.n + ' Dhaka')}" target="_blank" rel="noopener">📍 Google Maps</a><a href="https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(pl.n)}" target="_blank" rel="noopener">📖 Wikipedia</a>
  <a href="#" data-go="${pl.id}">🎯 Ekhane jabo</a></div></div>`;
function bindGo() { document.querySelectorAll('#modal [data-go]').forEach(a => a.onclick = e => { e.preventDefault(); const p = placeById(a.dataset.go); setDest({ id: p.id, n: p.n, bn: p.bn, c: p.c }); }); }
function showInfo(c, arrived, pl) {
  const near = nearbyPlaces(c, pl ? 4 : 5).filter(o => !pl || o.pl.id !== pl.id);
  modal(`<div class="hero"><p>${arrived ? '🎉 Pouche gecho!' : '📍 Ei jaygar kache'}</p><h2>${pl ? pl.e + ' ' + pl.bn : esc(S.road || 'Dhaka')}</h2><p>${pl ? esc(pl.n) : esc(S.area || '')}</p></div>
    ${pl ? placeRow(pl) : ''}${near.length ? `<h3 style="margin:12px 0 8px">✨ Ashe-pashe ja dekhar ache</h3>` + near.map(o => placeRow(o.pl, o.d)).join('') : '<p class="sub">Kache kono famous jayga list-e nai — kintu ghure dekho, Dhakar protita goli-i golpo! 🙂</p>'}
    <div class="mrow"><button class="btn btn-g" onclick="closeModal()">🚗 Chalate thako</button></div>`);
  bindGo();
}
function openDestPicker() {
  modal(`<h2>🎯 Kothay jabe?</h2><p class="sub">Jayga beche nao — othoba <b>M</b> chepe map-e jekono jaygay click koro.</p>
    <input class="inp" id="q" placeholder="🔎 Jayga khujo" style="margin-bottom:12px;font-size:16px"><div class="dlist" id="dl">${placeCards(S.dest && S.dest.id)}</div>
    <div class="mrow"><button class="btn btn-w" id="free">🛣️ Free drive</button><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  const dl = $('#dl'); $('#q').oninput = e => filterList(dl, e.target.value);
  dl.querySelectorAll('.dbtn').forEach(b => b.onclick = () => { const p = placeById(b.dataset.p); setDest({ id: p.id, n: p.n, bn: p.bn, c: p.c }); });
  $('#free').onclick = () => { clearDest(); closeModal(); };
}
function openStartPicker() {
  modal(`<h2>🚩 Notun jayga theke shuru</h2><p class="sub">Gari oi jaygar rastay chole jabe.</p><div class="dlist" id="dl">${startCards()}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button></div>`);
  $('#dl').querySelectorAll('.dbtn').forEach(b => b.onclick = () => { closeModal(); startAt(STARTS.find(s => s.id === b.dataset.s)); });
}
function openVehPicker() {
  modal(`<h2>🔄 Gari bodlao</h2><p class="sub">Je gari choose korbe, oita diyei shamne chalabe.</p>
    <div class="vgrid">${VEH.map(v => `<button class="vcard ${v.id === S.veh ? 'on' : ''}" data-v="${v.id}">${vehicleSVG(v, 90)}<b>${v.name} · ${v.bn}</b><div class="spd">Top speed ${v.max} km/h</div></button>`).join('')}</div>
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Close</button></div>`);
  document.querySelectorAll('#modal .vcard').forEach(c => c.onclick = () => { S.veh = c.dataset.v; S.speed = Math.min(S.speed, vehicle().max); save(); closeModal(); updateHUD(true); toast(`${vehicle().name} (${vehicle().bn}) e uthe porecho!`); });
}
function openName() {
  modal(`<h2>✏️ Naam bodlao</h2><input class="inp" id="nm" maxlength="24" value="${esc(S.name)}">
    <div class="mrow"><button class="btn btn-w" onclick="closeModal()">Cancel</button><button class="btn btn-g" id="sv">Save</button></div>`);
  const sv = () => { const v = $('#nm').value.trim(); if (!v) return toast('Naam khali rakha jabe na'); S.name = v; save(); updateHUD(true); closeModal(); toast(`Hello, ${v}! 👋`); };
  $('#sv').onclick = sv; $('#nm').onkeydown = e => { if (e.key === 'Enter') sv(); }; setTimeout(() => $('#nm').select(), 50);
}
function openStats() {
  const left = PLACES.filter(p => !S.visited.includes(p.id));
  modal(`<div class="hero"><p>🏆 ${esc(S.name)} er Dhaka journey</p><h2>${S.visited.length} / ${PLACES.length} jayga</h2><p>${S.km.toFixed(1)} km chaliyecho · Top speed ${Math.round(S.best)} km/h · ${S.crashes} ta dhakka 😅</p></div>
    <h3 style="margin:14px 0 8px">✅ Ghora hoyeche</h3><p class="sub">${S.visited.map(id => { const p = placeById(id); return p ? p.e + ' ' + p.bn : ''; }).join(' · ') || 'Ekhono kichu na — 🎯 diye destination dao!'}</p>
    <h3 style="margin:14px 0 8px">🗺️ Baki ache (${left.length})</h3><p class="sub">${left.map(p => p.e + ' ' + p.bn).join(' · ') || 'Shob ghure felecho! 🎉'}</p>
    <h3 style="margin:14px 0 8px">🎮 Control</h3>${KEYS_HTML}
    <div class="mrow"><button class="btn btn-w" id="rst">↺ Progress reset</button><button class="btn btn-g" onclick="closeModal()">OK</button></div>`);
  $('#rst').onclick = () => { if ($('#rst').dataset.c) { S.visited = []; S.km = 0; S.trips = 0; S.best = 0; S.crashes = 0; save(); closeModal(); toast('Progress reset hoyeche'); } else { $('#rst').dataset.c = 1; $('#rst').textContent = 'Sure? Abar chapo'; } };
}
function onMapClick(e) {
  if (!S.playing) return;
  const c = [e.lngLat.lng, e.lngLat.lat], p = toM(c[0], c[1]), d = Math.hypot(p[0] - S.x, p[1] - S.y);
  const near = nearbyPlaces(c, 1, 400)[0];
  const label = near ? `${near.pl.e} ${near.pl.bn}` : `📍 Ei jayga`;
  const pp = new maplibregl.Popup({ maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(`<div class="pp"><b>${label}</b><div style="color:#5d6b64;font-size:13px">Tomar theke ${fmtM(d)}</div>
    <div class="bt"><button id="pp_go" style="background:#006a4e;color:#fff">🎯 Ekhane jabo</button><button id="pp_info" style="border:1.5px solid #e3e8e5">ℹ️ Ki ache dekho</button></div></div>`).addTo(map);
  setTimeout(() => {
    const g = document.getElementById('pp_go'), i = document.getElementById('pp_info');
    if (g) g.onclick = () => { pp.remove(); setDest(near ? { id: near.pl.id, n: near.pl.n, bn: near.pl.bn, c: near.pl.c } : { n: 'Map-er jayga', c }); };
    if (i) i.onclick = () => { pp.remove(); showInfo(c, false, near && near.d < 150 ? near.pl : null); };
  }, 0);
}

/* ---------- controls: arrows = drive, Space = nitro ---------- */
const keys = new Set();
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'boost', ShiftLeft: 'boost', ShiftRight: 'boost' };
addEventListener('keydown', e => {
  if (!S.playing || $('#ov').classList.contains('show') || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  audioInit(); if (ac && ac.state === 'suspended') ac.resume();
  const k = KEYMAP[e.code];
  if (k) { keys.add(k); if (k === 'left' || k === 'right' || k === 'down') S.auto = false; if (S.overview && (k === 'up' || k === 'down')) setDriveCam(); e.preventDefault(); }
  if (e.code === 'KeyH') horn();
  if (e.repeat) return;
  if (e.code === 'KeyC') cycleCam();
  if (e.code === 'KeyV') toggleSat();
  if (e.code === 'KeyI') showInfo(toLL(S.x, S.y), false, null);
  if (e.code === 'KeyG') openDestPicker();
  if (e.code === 'KeyP') toggleAuto();
  if (e.code === 'KeyT') openStartPicker();
  if (e.code === 'KeyM') S.overview ? setDriveCam() : setOverview();
  if (e.code === 'KeyN') { S.sound = !S.sound; save(); updateHUD(true); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
addEventListener('blur', () => keys.clear());
document.querySelectorAll('.tc').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); audioInit(); if (ac && ac.state === 'suspended') ac.resume(); if (k === 'horn') { horn(); b.classList.add('on'); return; } keys.add(k); b.classList.add('on'); if (k === 'left' || k === 'right' || k === 'down') S.auto = false; if (S.overview) setDriveCam(); };
  const off = e => { e.preventDefault(); keys.delete(k); b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
});
function cycleCam() { const order = ['chase', 'cockpit', 'far']; S.cam = order[(order.indexOf(S.cam) + 1) % 3]; save(); toast({ chase: '🎥 Pichon theke view', cockpit: '🎥 Cockpit view — driver-er chokhe', far: '🎥 Dur theke view' }[S.cam], 1600); if (S.overview) setDriveCam(); }
function toggleSat() { S.sat = !S.sat; save(); applyViewMode(); toast(S.sat ? '🛰️ Satellite view — asol Dhaka' : '🗺️ Map view', 1600); }
function toggleAuto() {
  if (!S.dest) { toast('Age ekta destination dao 🎯'); return; }
  S.auto = !S.auto; if (S.auto && S.overview) setDriveCam(); if (S.auto && !route) fetchRoute();
  toast(S.auto ? '🧭 Auto-drive chalu — arrow chaple bondho hobe' : 'Auto-drive bondho'); updateHUD(true);
}
$('#nameBtn').onclick = openName; $('#vehBtn').onclick = openVehPicker; $('#hornBtn').onclick = horn;
$('#camBtn').onclick = cycleCam; $('#satBtn').onclick = toggleSat;
$('#destBtn').onclick = openDestPicker; $('#autoBtn').onclick = toggleAuto; $('#startBtn').onclick = openStartPicker;
$('#zoomBtn').onclick = () => S.overview ? setDriveCam() : setOverview(); $('#mini').onclick = () => S.overview ? setDriveCam() : setOverview();
$('#soundBtn').onclick = () => { audioInit(); S.sound = !S.sound; save(); updateHUD(true); };
$('#statsBtn').onclick = openStats;

/* ---------- HUD ---------- */
let hudT = 0, badgeFlash = 0, locT = 0, seenNear = new Set();
function updateHUD(force) {
  const now = performance.now(); if (!force && now - hudT < 90) return; hudT = now;
  const v = vehicle(), sp = Math.abs(S.speed);
  $('#nameTxt').textContent = S.name || 'Player'; $('#vehTxt').textContent = v.name; $('#vehIcon').innerHTML = vehicleSVG(v, 38);
  $('#spd').textContent = Math.round(sp);
  $('#arc').style.strokeDashoffset = 251 * (1 - clamp(sp / (v.max * 1.3), 0, 1));
  $('#gear').textContent = S.speed < -0.5 ? 'R' : sp < 0.5 ? 'N' : String(Math.min(6, 1 + Math.floor(sp / (v.max / 6))));
  $('#nitroBar').style.width = (S.nitro * 100).toFixed(0) + '%';
  $('#soundBtn').textContent = S.sound ? '🔊' : '🔇'; $('#autoBtn').classList.toggle('on', S.auto); $('#camBtn').title = 'Camera: ' + S.cam;
  $('#locD').textContent = S.road || 'Dhaka'; $('#locU').textContent = S.area || '';
  const b = [];
  if (S.nitroOn) b.push('<span class="badge">⚡ NITRO</span>');
  if (S.auto) b.push('<span class="badge">🧭 AUTO</span>');
  if (S.scrape > 0) b.push('<span class="badge warn">⚠️ Rastar kinare!</span>');
  if (now - badgeFlash < 1200) b.push('<span class="badge warn">💥 Dhakka!</span>');
  $('#badges').innerHTML = b.join('');
  const de = $('#dest'), dk = S.dest ? (S.dest.n + '|' + S.auto) : 'free';
  if (de.dataset.k !== dk) {
    de.dataset.k = dk;
    de.innerHTML = S.dest ? `<div class="pill"><div class="row"><span id="arrow">⬆️</span><div><b>🏁 ${esc(S.dest.bn || S.dest.n)}</b><div style="font-size:12.5px;color:#5d6b64" id="dLeft"></div></div></div>
      <div class="row" style="gap:6px"><button class="btn btn-g" style="padding:5px 10px;font-size:12.5px" id="dAuto">${S.auto ? '⏸ Auto bondho' : '🧭 Auto-drive (P)'}</button><button class="btn btn-w" style="padding:5px 10px;font-size:12.5px" id="dX">✖ Free drive</button></div></div>`
      : `<div class="pill"><div class="row"><span style="font-size:22px">🛣️</span><div><b>Free drive</b><div style="font-size:12.5px;color:#5d6b64">🎯 chepe destination dao</div></div></div></div>`;
    if (S.dest) { $('#dAuto').onclick = toggleAuto; $('#dX').onclick = clearDest; }
  }
  if (S.dest) {
    const ri = route ? routeInfo(10) : null, p = toM(S.dest.c[0], S.dest.c[1]);
    const left = ri ? ri.left : Math.hypot(p[0] - S.x, p[1] - S.y);
    const tp = ri ? ri.tp : p, brg = Math.atan2(tp[0] - S.x, tp[1] - S.y) * R2D, rel = angDiff(brg, S.heading);
    const eta = sp > 3 ? Math.round(left / (sp / 3.6 * SPEED_SCALE) / 60) : null;
    $('#arrow').style.transform = `rotate(${rel.toFixed(0)}deg)`;
    $('#dLeft').textContent = `${fmtM(left)} baki${eta != null ? ` · ~${Math.max(1, eta)} min` : ''}${route && route.straight ? ' · (soja line)' : ''}`;
  }
}
function updateLocation(now) {
  if (now - locT < 700) return; locT = now;
  const h = S.heading * D2R, q = nearest(S.x, S.y, Math.sin(h), Math.cos(h), 35, nameGrid);
  if (q.A || q.I) S.road = (q.A || q.I).s.name;
  else if (!S.onroad) S.road = 'Dhaka';
  const c = toLL(S.x, S.y), np = nearbyPlaces(c, 1, 2500)[0], st = STARTS.map(s => ({ s, d: Math.hypot(...[0, 1].map(i => toM(...s.c)[i] - [S.x, S.y][i])) })).sort((a, b) => a.d - b.d)[0];
  S.area = np && np.d < 600 ? `${np.pl.e} ${np.pl.n}-er kache · ${fmtM(np.d)}` : st ? `${st.s.n} area` : '';
  // passing by a famous place
  if (np && np.d < 90 && !seenNear.has(np.pl.id)) { seenNear.add(np.pl.id); toast(`${np.pl.e} Tumi ekhon ${np.pl.bn}-er pashe! (I = info)`, 3500); if (!S.visited.includes(np.pl.id)) { S.visited.push(np.pl.id); save(); } }
}

/* ---------- physics ---------- */
let last = performance.now(), saveT = 0, routeChkT = 0;
function step(dt, now) {
  const v = vehicle();
  if (S.overview) { if (meMarker) meMarker.setLngLat(toLL(S.x, S.y)); return; }
  // rebuild road index when we moved or tiles finished loading
  const moved = Math.hypot(S.x - idxAt.x, S.y - idxAt.y);
  if (moved > 220 || now - idxAt.t > (segs.length ? 4000 : 500)) buildIndex();

  let steerIn = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), gas = keys.has('up'), brake = keys.has('down');
  // autopilot along the OSRM route
  if (S.auto && S.dest) {
    const ri = routeInfo(22 + Math.abs(S.speed) * 0.35);
    S.autoStuck = S.scrape > 0 ? (S.autoStuck || 0) + dt : 0;
    if (S.autoStuck > 2 && performance.now() - routeT > 4000) { S.autoStuck = 0; fetchRoute(); }
    if (ri) {
      const brg = Math.atan2(ri.tp[0] - S.x, ri.tp[1] - S.y) * R2D, df = angDiff(brg, S.heading);
      steerIn = Math.abs(df) < 14 && !route.straight && S.onroad ? 0 : clamp(df / 22, -1, 1);
      const want = Math.min(v.max * 0.75, Math.abs(df) > 100 ? 16 : Math.abs(df) > 35 ? 28 : Math.abs(df) > 15 ? 50 : 120, ri.left < 120 ? 25 : 999);
      gas = S.speed < want; brake = S.speed > want + 12;
    }
  }
  S.nitroOn = keys.has('boost') && S.nitro > 0.02 && !brake;
  if (S.nitroOn) gas = true;
  const maxV = v.max * (S.nitroOn ? 1.3 : 1);
  if (gas) S.speed += v.acc * (S.nitroOn ? 2.2 : 1) * Math.max(0.12, 1 - Math.max(0, S.speed) / maxV) * dt * (S.speed < 0 ? 3 : 1);
  else if (brake) { if (S.speed > 0.5) S.speed -= Math.max(70, v.acc * 2.5) * dt; else S.speed = Math.max(-25, S.speed - 14 * dt); }
  else S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), (3 + Math.abs(S.speed) * 0.06) * dt);
  if (S.speed > maxV) S.speed -= (S.speed - maxV) * Math.min(1, dt * 1.5);
  S.nitro = clamp(S.nitro + (S.nitroOn ? -0.28 : 0.06) * dt, 0, 1);

  // steering (smoothed)
  S.steer += (steerIn - S.steer) * Math.min(1, dt * (steerIn ? 6 : 9));
  const sp = Math.abs(S.speed);
  const rate = (sp < 1 ? 0 : 100 - Math.min(55, sp * 0.3)) * Math.min(1, sp / 12);
  S.heading = (S.heading + S.steer * rate * dt * Math.sign(S.speed || 1) + 360) % 360;

  // stay on the road: lane assist + road edges
  const h = S.heading * D2R, fx = Math.sin(h), fy = Math.cos(h);
  S.scrape = Math.max(0, S.scrape - dt);
  if (segs.length) {
    const q = nearest(S.x, S.y, fx, fy, 45);
    if (!q.I) {
      S.lost += dt; S.onroad = false;
      if (S.lost > 0.7 && snapToRoad(450, true)) { S.speed *= 0.3; toast('🛣️ Rastay ferot ana holo'); }
    } else {
      S.lost = 0; S.onroad = true;
      const steering = Math.abs(steerIn) > 0.05;
      if (!steering && S.speed > 3 && q.A && q.A.al > 0.55) {
        const s = q.A.s, sg = q.A.sg, th = segHeading(s, sg);
        S.heading = (S.heading + angDiff(th, S.heading) * Math.min(1, dt * (2.2 + sp / 45)) + 360) % 360;
        const tx = s.ux * sg, ty = s.uy * sg, nlx = -ty, nly = tx, lat = (S.x - q.A.px) * nlx + (S.y - q.A.py) * nly;
        const lanes = lanesOf(s.hw); let ln = lanes[0]; for (const L of lanes) if (Math.abs(L - lat) < Math.abs(ln - lat)) ln = L;
        const k = Math.min(1, dt * 1.6); S.x += nlx * (ln - lat) * k; S.y += nly * (ln - lat) * k;
      }
      const lim = q.I.s.hw + 0.4;
      if (q.I.d > lim) {
        const ox = (S.x - q.I.px) / q.I.d, oy = (S.y - q.I.py) / q.I.d; S.x = q.I.px + ox * lim; S.y = q.I.py + oy * lim;
        if (sp > 15) { S.speed *= Math.max(0, 1 - dt * 1.6); S.scrape = 0.35; S.shake = Math.max(S.shake, 0.25); }
        if (!steering) { const s = q.I.s, sg = (fx * s.ux + fy * s.uy) >= 0 ? 1 : -1; S.heading = (S.heading + angDiff(segHeading(s, sg), S.heading) * Math.min(1, dt * 2.5) + 360) % 360; }
      }
    }
  }
  // move
  const d = S.speed / 3.6 * dt * SPEED_SCALE, h2 = S.heading * D2R;
  S.x += Math.sin(h2) * d; S.y += Math.cos(h2) * d;
  const r = Math.hypot(S.x, S.y); if (r > 21000) { S.x *= 21000 / r; S.y *= 21000 / r; S.speed *= 0.5; toast('🚧 Dhakar baire jawa jabe na!'); }
  S.km += Math.abs(d) / 1000; S.best = Math.max(S.best, S.speed);
  S.shake = Math.max(0, S.shake - dt * 1.8);

  stepAI(dt, now);
  // destination
  if (S.dest) {
    const p = toM(S.dest.c[0], S.dest.c[1]), dd = Math.hypot(p[0] - S.x, p[1] - S.y);
    if (dd < 45 + Math.min(150, route ? route.snapEnd : 60)) arrive();
    else if (route && now - routeChkT > 1500) { routeChkT = now; const ri = routeInfo(0); if (ri && ri.off > 70 && now - routeT > 5000) fetchRoute(); }
    else if (!route && now - routeT > 8000) fetchRoute();
  }
  if (now - saveT > 4000) { saveT = now; save(); }
}
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.playing && mapReady) {
    if (!$('#ov').classList.contains('show')) step(dt, now);
    if (!S.overview) camUpdate();
    placeAll(); updateCockpit(); updateLocation(now);
    const fx = $('#fx'), sp = clamp((Math.abs(S.speed) - 70) / 170, 0, 0.85);
    fx.style.opacity = S.overview ? 0 : (sp + (S.nitroOn ? 0.25 : 0)).toFixed(2); fx.classList.toggle('nitro', !!S.nitroOn);
    if (miniReady && now - (loop.mt || 0) > 120) { loop.mt = now; mini.jumpTo({ center: toLL(S.x, S.y), bearing: S.heading, zoom: 15.4 - clamp(Math.abs(S.speed) / 160, 0, 1) }); }
    if (ac) engineTick();
    updateHUD();
  }
  requestAnimationFrame(loop);
}
addEventListener('beforeunload', save);

/* ---------- boot ---------- */
initMap(); initMini();
if (S.name && S.x != null) { begin(); if (S.dest) fetchRoute(); toast(`Welcome back, ${S.name}! ↑ = gas · Space = nitro`, 3200); }
else renderSetup();
updateHUD(true);
requestAnimationFrame(loop);
window.__game = { S, AIs, get segs() { return segs; }, get map() { return map; }, get route() { return route; }, buildIndex, nearest, startAt, setDest, toM, toLL, STARTS, PLACES };
})();

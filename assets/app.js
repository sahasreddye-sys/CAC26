'use strict';

/* ============================================================
   Model: walks the exported LightGBM trees (same decision rules
   as LightGBM's NumericalDecision / CategoricalDecision).
   Node = [feature, threshold | categories, left, right,
           default_left, is_categorical, missing_type(0 none,1 zero,2 nan)]
   Child >= 0 is a node index, < 0 is leaf -(k) -> leaves[k-1].
   ============================================================ */
const Model = {
  treeValue(t, vec) {
    let i = t.r;
    while (i >= 0) {
      const nd = t.n[i];
      let x = vec[nd[0]];
      const missing = x === null || x === undefined || Number.isNaN(x);
      let left;
      if (nd[5]) {
        if (missing) {
          if (nd[6] === 2) { i = nd[3]; continue; }
          x = 0;
        }
        left = x >= 0 && nd[1].indexOf(Math.trunc(x)) !== -1;
      } else {
        if (missing && nd[6] !== 2) x = 0;
        if ((nd[6] === 1 && Math.abs(x) <= 1e-35) || (nd[6] === 2 && missing)) left = nd[4] === 1;
        else left = x <= nd[1];
      }
      i = left ? nd[2] : nd[3];
    }
    return t.l[-i - 1];
  },
  predictLog(model, vec) {
    let s = 0;
    const trees = model.trees;
    for (let k = 0; k < trees.length; k++) s += Model.treeValue(trees[k], vec);
    return s;
  },
};
if (typeof module !== 'undefined') module.exports = Model;

if (typeof document !== 'undefined') (function () {

/* ============================================================
   Accuracy numbers from the v2 notebook run (housing_model_v2.ipynb),
   read from data/summary.json through assets/site-data.js
   ============================================================ */
const SUMMARY = window.MODEL_SUMMARY;
const NB = {
  forsyth: {
    place: 'Forsyth County', name: 'Forsyth', county: 'Forsyth County', hue: 48,
    n: SUMMARY.homes, medape: SUMMARY.final['median APE %'],
    bandLo: SUMMARY.final.band_log_low, bandHi: SUMMARY.final.band_log_high,
  },
};
const TAX_YEAR = 2025;
// "New homes" = built in the last three years of the tax roll. Homes built in
// the tax year itself may have been valued partway through construction.
const NEW_HOME_FIRST_YEAR = TAX_YEAR - 2;
const isNewHome = (d, i) => d.H.yr[i] >= NEW_HOME_FIRST_YEAR;
const mayBePartlyBuilt = (d, i) => d.H.yr[i] >= TAX_YEAR;

const LABELS = {
  lon: 'Location (east–west)', lat: 'Location (north–south)',
  BLDGAREA: 'Building size', RESFLRAREA: 'Residential floor area', home_age: 'Age',
  FLOORCOUNT: 'Floors', STATEDAREA: 'Lot size', owns_lot: 'Owns its lot', USECD: 'Use type',
  NGHBRHDCD: 'Neighborhood', CLASSCD: 'Tax class', ZONING: 'Zoning', STRCLASS: 'Construction grade',
  RESSTRTYP: 'Structure type',
};

const SLIDERS = {
  forsyth: [
    { f: 'BLDGAREA', label: 'Building size', min: v => Math.max(400, r50(v * 0.5)), max: v => r50(v * 1.8), step: 50, fmt: v => fmtInt(v) + ' sq ft' },
    // the model uses age; people think in year built
    { f: 'home_age', label: 'Year built', toUI: a => TAX_YEAR - a, fromUI: y => TAX_YEAR - y, min: () => 1900, max: () => TAX_YEAR, step: 1, fmt: v => String(v) },
    { f: 'FLOORCOUNT', label: 'Floors', min: () => 1, max: () => 4, step: 1, fmt: v => String(v) },
    { f: 'STATEDAREA', label: 'Lot size', min: () => 0.05, max: v => Math.max(2, +(v * 3).toFixed(2)), step: 0.01, fmt: v => v.toFixed(2) + ' ac', skip: (h, i) => !(h.X.owns_lot[i] > 0) },
  ],
};

/* ---------------- utilities ---------------- */
const $ = id => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function r50(v) { return Math.round(v / 50) * 50; }
function fmtInt(v) { return Math.round(v).toLocaleString('en-US'); }
function fmtUSD(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString('en-US'); }
function fmtShort(v) {
  if (v >= 1e6) return '$' + (+(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)) + 'M';
  return '$' + Math.round(v / 1e3) + 'k';
}
function fmtPct(v, d = 1) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%'; }
function round100(v) { return Math.round(v / 100) * 100; }
function round1000(v) { return Math.round(v / 1000) * 1000; }
// one short sentence for screen readers, sent after typing pauses
function announce(id, text) { clearTimeout(announce[id]); announce[id] = setTimeout(() => { $(id).textContent = text; }, 700); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
function quantile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))]; }
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/* Critically damped spring (Apple: damping 1.0, response ~0.35s).
   Retargeting keeps the current value and velocity, so it is interruptible. */
class Spring {
  constructor(value, onUpdate, response = 0.35) {
    this.value = value; this.target = value; this.velocity = 0;
    this.onUpdate = onUpdate; this.response = response; this.raf = 0; this.last = 0;
  }
  set(target, velocity) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (reduceMotion.matches) return this.snap(target);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.step(t)); }
  }
  snap(v) {
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.value = this.target = v; this.velocity = 0; this.onUpdate(v, true);
  }
  step(now) {
    const dt = Math.min(0.064, (now - this.last) / 1000); this.last = now;
    const w = 2 * Math.PI / this.response;
    const x = this.value - this.target, v = this.velocity, e = Math.exp(-w * dt);
    const nx = (x + (v + w * x) * dt) * e;
    this.velocity = (v - w * (v + w * x) * dt) * e;
    this.value = this.target + nx;
    const scale = Math.max(1e-9, Math.abs(this.target) * 1e-5 + 1e-6);
    if (Math.abs(nx) < scale && Math.abs(this.velocity) < scale * 10) {
      this.value = this.target; this.velocity = 0; this.raf = 0; this.onUpdate(this.value, true); return;
    }
    this.onUpdate(this.value, false);
    this.raf = requestAnimationFrame(t => this.step(t));
  }
}

/* ---------------- state ---------------- */
const state = {
  market: 'forsyth', data: {}, sel: -1, vec: null, base: 0, est: 0, loading: null,
  listSort: 'newest', listShown: 20,
};
const cur = () => state.data[state.market];

/* ---------------- data loading ---------------- */
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  return JSON.parse(text);
}

function prepare(market, raw) {
  const H = raw.homes, X = raw.X, model = raw.model, nb = NB[market];
  const n = H.id.length;
  const lowMul = Math.exp(nb.bandLo), highMul = Math.exp(nb.bandHi);
  const d = { market, H, X, model, n, lowMul, highMul };
  d.lower = H.addr.map(a => a.toLowerCase());
  d.subOf = i => H.sub ? H.sub.v[H.sub.i[i]] : '';
  d.nbrOf = i => H.nbr ? H.nbr.v[H.nbr.i[i]] : '';
  d.useOf = i => H.use ? H.use.v[H.use.i[i]] : '';

  // equirectangular projection around the median latitude
  const lats = H.lat.filter(v => v != null).sort((a, b) => a - b);
  const lons = H.lon.filter(v => v != null).sort((a, b) => a - b);
  const lat0 = quantile(lats, 0.5), lon0 = quantile(lons, 0.5), kx = Math.cos(lat0 * Math.PI / 180);
  d.wx = new Float32Array(n); d.wy = new Float32Array(n); d.has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (H.lat[i] == null || H.lon[i] == null) continue;
    d.wx[i] = (H.lon[i] - lon0) * kx; d.wy[i] = -(H.lat[i] - lat0); d.has[i] = 1;
  }
  d.bounds = {
    x0: (quantile(lons, 0.003) - lon0) * kx, x1: (quantile(lons, 0.997) - lon0) * kx,
    y0: -(quantile(lats, 0.997) - lat0), y1: -(quantile(lats, 0.003) - lat0),
  };

  // color bucket per home from log estimate
  const ests = H.est.slice().sort((a, b) => a - b);
  d.vLo = quantile(ests, 0.02); d.vHi = quantile(ests, 0.98); d.vMid = quantile(ests, 0.5);
  const l0 = Math.log(d.vLo), l1 = Math.log(d.vHi);
  d.bucket = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = (Math.log(H.est[i]) - l0) / (l1 - l0);
    d.bucket[i] = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(t * (RAMP_STEPS - 1))));
  }
  d.order = Array.from({ length: n }, (_, i) => i).filter(i => d.has[i]).sort((a, b) => H.est[a] - H.est[b]);

  // spatial grid for hover, clicks and nearby homes
  const span = Math.max(d.bounds.x1 - d.bounds.x0, d.bounds.y1 - d.bounds.y0);
  d.cell = span / 160;
  d.grid = new Map();
  for (let i = 0; i < n; i++) {
    if (!d.has[i]) continue;
    const k = Math.floor(d.wx[i] / d.cell) + ',' + Math.floor(d.wy[i] / d.cell);
    let a = d.grid.get(k); if (!a) d.grid.set(k, a = []); a.push(i);
  }
  d.near = (x, y, r) => {
    const out = [];
    const c0 = Math.floor((x - r) / d.cell), c1 = Math.floor((x + r) / d.cell);
    const r0 = Math.floor((y - r) / d.cell), r1 = Math.floor((y + r) / d.cell);
    for (let cx = c0; cx <= c1; cx++) for (let cy = r0; cy <= r1; cy++) {
      const a = d.grid.get(cx + ',' + cy); if (!a) continue;
      for (const i of a) { const dx = d.wx[i] - x, dy = d.wy[i] - y, dd = dx * dx + dy * dy; if (dd <= r * r) out.push([dd, i]); }
    }
    return out.sort((a, b) => a[0] - b[0]);
  };
  d.featIndex = Object.fromEntries(model.features.map((f, k) => [f, k]));
  d.vecOf = i => model.features.map(f => X[f][i]);
  return d;
}

function loadMarket(market) {
  if (state.data[market]) return Promise.resolve(state.data[market]);
  const homes = fetchJSON(`data/${market}.json.gz`);
  const schools = market === 'forsyth' ? fetchJSON('data/forsyth_schools.json.gz').catch(() => null) : Promise.resolve(null);
  return Promise.all([homes, schools]).then(([raw, sch]) => {
    const d = prepare(market, raw);
    d.schools = sch;
    return (state.data[market] = d);
  });
}

/* ============================================================
   Map
   ============================================================ */
const RAMP_STEPS = 28;
const map = {
  canvas: $('map'), ctx: null, W: 0, H: 0, dpr: 1, colors: [], fit: 1, hover: -1, active: false,
  cam: { x: 0, y: 0, s: 1 }, springs: null, dragging: null, raf: 0,
};
map.ctx = map.canvas.getContext && map.canvas.getContext('2d');
if (!map.ctx) $('mapSkel').textContent = 'This browser can’t draw the map. The address search and the list of homes still work.';

function rampColor(t, hue, dark) {
  const L = dark ? 0.4 + 0.52 * t : 0.86 - 0.54 * t;
  const C = 0.035 + 0.13 * t;
  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue})`;
}
function buildRamp() {
  const hue = NB[state.market].hue, dark = isDark();
  map.colors = Array.from({ length: RAMP_STEPS }, (_, k) => rampColor(k / (RAMP_STEPS - 1), hue, dark));
  const stops = [0, 0.25, 0.5, 0.75, 1].map(t => rampColor(t, hue, dark) + ' ' + t * 100 + '%').join(',');
  $('ramp').style.background = `linear-gradient(to right, ${stops})`;
  const d = cur();
  if (d) { $('rampLo').textContent = fmtShort(d.vLo); $('rampHi').textContent = fmtShort(d.vHi); }
}
function sizeMap() {
  const r = map.canvas.getBoundingClientRect();
  map.dpr = Math.min(2, window.devicePixelRatio || 1);
  map.W = r.width; map.H = r.height;
  map.canvas.width = Math.round(r.width * map.dpr); map.canvas.height = Math.round(r.height * map.dpr);
  const d = cur(); if (d && map.W > 0) map.fit = fitScale(d);
  if (map.needsFit && map.W > 0) { resetCam(false); return; }
  drawMap();
}
function fitScale(d) {
  const b = d.bounds, pad = 28;
  return Math.min((map.W - pad * 2) / (b.x1 - b.x0), (map.H - pad * 2) / (b.y1 - b.y0));
}
function resetCam(animate) {
  const d = cur(); if (!d) return;
  // the map can't be fitted while its screen is hidden (0 px wide); sizeMap does it once shown
  if (map.W <= 0) { map.needsFit = true; return; }
  map.needsFit = false;
  map.fit = fitScale(d);
  const b = d.bounds;
  const tx = (b.x0 + b.x1) / 2, ty = (b.y0 + b.y1) / 2;
  if (animate) { map.springs.x.set(tx); map.springs.y.set(ty); map.springs.s.set(map.fit); }
  else { for (const [k, v] of [['x', tx], ['y', ty], ['s', map.fit]]) map.springs[k].snap(v); drawMap(); }
}
map.springs = {
  x: new Spring(0, v => { map.cam.x = v; requestDraw(); }, 0.55),
  y: new Spring(0, v => { map.cam.y = v; requestDraw(); }, 0.55),
  s: new Spring(1, v => { map.cam.s = v; requestDraw(); }, 0.55),
};
function requestDraw() { if (!map.raf) map.raf = requestAnimationFrame(() => { map.raf = 0; drawMap(); }); }
const toScreen = (d, i) => [(d.wx[i] - map.cam.x) * map.cam.s + map.W / 2, (d.wy[i] - map.cam.y) * map.cam.s + map.H / 2];
const toWorld = (sx, sy) => [(sx - map.W / 2) / map.cam.s + map.cam.x, (sy - map.H / 2) / map.cam.s + map.cam.y];

function drawMap() {
  const ctx = map.ctx, d = cur();
  if (!ctx) return;
  ctx.setTransform(map.dpr, 0, 0, map.dpr, 0, 0);
  ctx.clearRect(0, 0, map.W, map.H);
  if (!d) return;
  const zoom = map.cam.s / map.fit;
  const r = Math.min(5, Math.max(d.n > 40000 ? 0.9 : 1.2, 1.1 * Math.sqrt(zoom)));
  const W = map.W, Hh = map.H, s = map.cam.s, cx = map.cam.x - W / 2 / s, cy = map.cam.y - Hh / 2 / s;
  let lastB = -1;
  const round = r >= 2.4;
  if (d.match) {
    ctx.beginPath(); ctx.fillStyle = css('--outline-variant');
    for (let k = 0; k < d.order.length; k++) {
      const i = d.order[k];
      if (d.match[i]) continue;
      const x = (d.wx[i] - cx) * s, y = (d.wy[i] - cy) * s;
      if (x < 0 || y < 0 || x > W || y > Hh) continue;
      ctx.rect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    ctx.fill();
  }
  ctx.beginPath();
  for (let k = 0; k < d.order.length; k++) {
    const i = d.order[k];
    if (d.match && !d.match[i]) continue;
    const x = (d.wx[i] - cx) * s, y = (d.wy[i] - cy) * s;
    if (x < -r || y < -r || x > W + r || y > Hh + r) continue;
    const b = d.bucket[i];
    if (b !== lastB) { ctx.fill(); ctx.beginPath(); ctx.fillStyle = map.colors[b]; lastB = b; }
    if (round) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 6.2832); }
    else ctx.rect(x - r, y - r, r * 2, r * 2);
  }
  ctx.fill();
  const ring = (i, color, rad, width) => {
    const [x, y] = toScreen(d, i);
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832);
    ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke();
  };
  if (map.hover >= 0 && map.hover !== state.sel) ring(map.hover, css('--ink'), r + 3, 1.5);
  if (state.sel >= 0 && d.has[state.sel]) {
    const [x, y] = toScreen(d, state.sel);
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fillStyle = css('--mkt'); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = isDark() ? '#000' : '#fff'; ctx.stroke();
  }
}

function pickAt(sx, sy, px = 10) {
  const d = cur(); if (!d) return -1;
  const [wx, wy] = toWorld(sx, sy);
  const hit = d.near(wx, wy, px / map.cam.s).find(h => !d.match || d.match[h[1]]);
  return hit ? hit[1] : -1;
}
function showTip(i, sx, sy) {
  const tip = $('tip'), d = cur();
  if (i < 0) { tip.hidden = true; return; }
  tip.innerHTML = `<b>${esc(d.H.addr[i])}</b> · ${fmtShort(d.H.est[i])}`;
  tip.style.left = Math.max(80, Math.min(map.W - 80, sx)) + 'px';
  tip.style.top = sy + 'px';
  tip.hidden = false;
}

(function mapInput() {
  const c = map.canvas;
  let hist = [];
  const stopSprings = () => { for (const k in map.springs) { const sp = map.springs[k]; cancelAnimationFrame(sp.raf); sp.raf = 0; sp.value = sp.target = map.cam[k]; sp.velocity = 0; } };
  c.addEventListener('pointerdown', e => {
    if (!cur()) return;
    map.active = true;
    map.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType === 'touch' };
    if (!map.dragging.touch) { c.setPointerCapture(e.pointerId); stopSprings(); }
    hist = [[e.clientX, e.clientY, e.timeStamp]];
  });
  c.addEventListener('pointermove', e => {
    const rect = c.getBoundingClientRect();
    const g = map.dragging;
    if (g && g.id === e.pointerId) {
      const dx = e.clientX - hist[hist.length - 1][0], dy = e.clientY - hist[hist.length - 1][1];
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (!g.touch && g.moved > 4) {
        c.classList.add('dragging');
        map.cam.x -= dx / map.cam.s; map.cam.y -= dy / map.cam.s;
        map.springs.x.value = map.springs.x.target = map.cam.x;
        map.springs.y.value = map.springs.y.target = map.cam.y;
        $('tip').hidden = true;
        requestDraw();
      }
      hist.push([e.clientX, e.clientY, e.timeStamp]); if (hist.length > 6) hist.shift();
      return;
    }
    if (e.pointerType === 'touch') return;
    const i = pickAt(e.clientX - rect.left, e.clientY - rect.top);
    if (i !== map.hover) { map.hover = i; requestDraw(); }
    if (i >= 0) { const [x, y] = toScreen(cur(), i); showTip(i, x, y); } else showTip(-1);
    c.style.cursor = i >= 0 ? 'pointer' : '';
  });
  const end = e => {
    const g = map.dragging; if (!g || g.id !== e.pointerId) return;
    map.dragging = null; c.classList.remove('dragging');
    const rect = c.getBoundingClientRect();
    if (g.moved <= 6 && e.type === 'pointerup') {
      const i = pickAt(e.clientX - rect.left, e.clientY - rect.top, g.touch ? 16 : 10);
      if (i >= 0) selectHome(i, { from: 'map' });
      return;
    }
    if (g.touch) return;
    // momentum: project where the flick is heading (Apple's deceleration projection)
    const a = hist[0], b = hist[hist.length - 1], dt = Math.max(16, b[2] - a[2]) / 1000;
    if (b[2] - a[2] > 120 || e.timeStamp - b[2] > 80) return;
    const vx = (b[0] - a[0]) / dt, vy = (b[1] - a[1]) / dt, dec = 0.994;
    const proj = v => (v / 1000) * dec / (1 - dec);
    map.springs.x.set(map.cam.x - proj(vx) / map.cam.s, -vx / map.cam.s);
    map.springs.y.set(map.cam.y - proj(vy) / map.cam.s, -vy / map.cam.s);
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
  c.addEventListener('pointerleave', () => { map.active = false; if (map.hover >= 0) { map.hover = -1; requestDraw(); } showTip(-1); });
  c.addEventListener('wheel', e => {
    // zoom on trackpad pinch (ctrlKey) or once the pointer has engaged the map; otherwise let the page scroll
    if (!cur() || !(e.ctrlKey || map.active)) return;
    e.preventDefault(); stopSprings();
    const rect = c.getBoundingClientRect(), sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const [wx, wy] = toWorld(sx, sy);
    const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
    const s = Math.min(map.fit * 400, Math.max(map.fit * 0.6, map.cam.s * k));
    map.cam.s = s; map.cam.x = wx - (sx - map.W / 2) / s; map.cam.y = wy - (sy - map.H / 2) / s;
    for (const key of ['x', 'y', 's']) { map.springs[key].value = map.springs[key].target = map.cam[key]; }
    requestDraw();
  }, { passive: false });
  c.addEventListener('mouseenter', () => { /* engage wheel-zoom only after a click */ });
  $('zoomIn').onclick = () => map.springs.s.set(Math.min(map.fit * 400, map.springs.s.target * 2));
  $('zoomOut').onclick = () => map.springs.s.set(Math.max(map.fit * 0.6, map.springs.s.target / 2));
  $('zoomReset').onclick = () => resetCam(true);
  new ResizeObserver(() => sizeMap()).observe(map.canvas);
})();

function flyTo(i) {
  const d = cur(); if (!d.has[i]) return;
  map.springs.x.set(d.wx[i]); map.springs.y.set(d.wy[i]);
  map.springs.s.set(Math.max(map.springs.s.target, map.fit * 7));
}

/* ============================================================
   Search
   ============================================================ */
const search = { items: [], active: -1 };
function runSearch(q) {
  const d = cur(); if (!d) return [];
  q = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (q.length < 2) return [];
  const starts = [], contains = [];
  for (let i = 0; i < d.n; i++) {
    const a = d.lower[i];
    if (a.startsWith(q)) { starts.push(i); if (starts.length >= 8) break; }
    else if (contains.length < 8 && a.includes(q)) contains.push(i);
  }
  let out = starts.concat(contains).slice(0, 8);
  if (!out.length) {
    const qid = q.replace(/\s+/g, '');
    for (let i = 0; i < d.n && out.length < 8; i++) if (d.H.id[i].toLowerCase().replace(/\s+/g, '').startsWith(qid)) out.push(i);
  }
  return out;
}
function renderSuggest() {
  const ul = $('suggest'), input = $('q'), d = cur();
  if (!input.value.trim() || document.activeElement !== input) { ul.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
  if (!search.items.length) {
    ul.innerHTML = input.value.trim().length < 2 ? '' : `<li class="empty" role="option" aria-disabled="true">No ${esc(NB[state.market].name)} address matches “${esc(input.value.trim())}”. Try the house number and street name. Homes built or split after the ${TAX_YEAR} tax records aren’t in this data.</li>`;
  } else {
    ul.innerHTML = search.items.map((i, k) => {
      const sub = d.subOf(i);
      return `<li role="option" id="opt${k}" data-i="${i}" aria-selected="${k === search.active}"><span>${esc(d.H.addr[i])}${sub ? `<br><small>${esc(sub)}</small>` : ''}</span><small class="num">${fmtShort(d.H.est[i])}</small></li>`;
    }).join('');
  }
  const open = ul.innerHTML !== '';
  ul.hidden = !open; input.setAttribute('aria-expanded', String(open));
  input.setAttribute('aria-activedescendant', search.active >= 0 ? 'opt' + search.active : '');
}
(function searchInput() {
  const input = $('q'), ul = $('suggest');
  input.addEventListener('input', () => { search.items = runSearch(input.value); search.active = search.items.length ? 0 : -1; renderSuggest(); });
  input.addEventListener('focus', renderSuggest);
  input.addEventListener('blur', () => setTimeout(renderSuggest, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!search.items.length) return;
      e.preventDefault();
      search.active = (search.active + (e.key === 'ArrowDown' ? 1 : -1) + search.items.length) % search.items.length;
      renderSuggest();
    } else if (e.key === 'Enter') {
      if (search.active >= 0) { e.preventDefault(); choose(search.items[search.active]); }
    } else if (e.key === 'Escape') { input.value = ''; search.items = []; renderSuggest(); }
  });
  // select on press, not release
  ul.addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); choose(+li.dataset.i);
  });
  function choose(i) { input.value = cur().H.addr[i]; search.items = []; renderSuggest(); input.blur(); selectHome(i, { from: 'search' }); }
})();

function renderTry() {
  const d = cur(), row = $('tryRow');
  const ok = i => d.has[i] && d.H.sqft[i] && d.H.addr[i];
  const picks = [];
  for (const q of [0.5, 0.75, 0.96]) {
    const target = quantile(d.order.map(i => d.H.est[i]), q);
    let best = -1;
    for (let k = Math.floor(q * d.order.length); k < d.order.length; k++) { const i = d.order[k]; if (ok(i) && d.H.est[i] >= target) { best = i; break; } }
    if (best >= 0) picks.push(best);
  }
  if (picks.length) $('q').placeholder = 'Street address, e.g. ' + d.H.addr[picks[0]];
  const links = picks.map(i => `<button class="linkish" type="button" data-i="${i}">${esc(d.H.addr[i])}</button>`);
  row.innerHTML = 'Or open ' + (links.length > 1 ? links.slice(0, -1).join(', ') + ' or ' + links[links.length - 1] : links.join('')) + '.';
  row.hidden = false;
}
$('tryRow').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) selectHome(+b.dataset.i, { from: 'search' }); });

/* ============================================================
   Home detail
   ============================================================ */
const estSpring = new Spring(0, v => { $('rEst').textContent = fmtUSD(round100(v)); }, 0.3);

function selectHome(i, opts = {}) {
  const d = cur();
  state.sel = i;
  state.vec = d.vecOf(i);
  state.orig = state.vec.slice();
  state.base = Model.predictLog(d.model, state.vec);
  state.est = d.H.est[i];
  renderResult(opts);
  flyTo(i);
  requestDraw();
  const homeLink = `#/home/${state.market}/${encodeURIComponent(d.H.id[i])}`;
  $('tabDetail').href = homeLink;
  // picking a home from another screen opens the Detail tab (and Back returns);
  // switching homes while already on Detail just replaces the address
  if (currentScreen === 'detail') history.replaceState(null, '', homeLink);
  else location.hash = homeLink;
  if (opts.scroll !== false) window.scrollTo(0, 0);
}

function renderResult() {
  const d = cur(), H = d.H, i = state.sel, market = state.market;
  $('result').hidden = false;
  $('detailEmpty').hidden = true;
  $('rAddr').textContent = H.addr[i] || H.id[i];
  const use = titleCase(d.useOf(i));
  $('rParcel').textContent = 'Parcel ' + H.id[i].replace(/\s+/g, ' ');
  $('rMeta').textContent = [use, d.subOf(i), d.nbrOf(i) ? 'neighborhood ' + d.nbrOf(i) : ''].filter(Boolean).join(' · ');
  const link = $('rCounty');
  if (H.link) { link.href = H.link + H.id[i].replace(/ /g, '+'); link.hidden = false; } else link.hidden = true;

  // facts
  const facts = [];
  const sq = H.sqft[i]; if (sq) facts.push(['Square feet', fmtInt(sq)]);
  if (H.yr[i]) facts.push(['Built', H.yr[i]]);
  if (H.beds && H.beds[i] != null) facts.push(['Bedrooms', H.beds[i]]);
  if (H.baths && H.baths[i] != null) facts.push(['Baths', H.baths[i] + (H.half[i] ? ` + ${H.half[i]} half` : '')]);
  if (H.floors[i] != null) facts.push(['Floors', H.floors[i]]);
  if (H.ac[i]) facts.push(['Lot', H.ac[i].toFixed(2) + ' ac']);
  if (d.schools) {
    const z = level => { const k = d.schools.home[level][i]; return k >= 0 ? titleCase(d.schools.levels[level][k]) : '—'; };
    facts.push(['Elementary', z('ES')], ['Middle', z('MS')], ['High', z('HS')]);
  }
  $('rFacts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${esc(v)}</dd></div>`).join('');

  renderDrivers();
  renderSliders();
  renderNearby();
  resetAfford();
  estSpring.snap(H.est[i]);
  updateEstimate(true);
}
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSfr\b/, 'SFR').replace(/\bSf\b/, 'SF').replace(/\b(Es|Ms|Hs)$/, m => m.toUpperCase()); }

function updateEstimate(initial) {
  const d = cur(), H = d.H, i = state.sel;
  const orig = H.est[i];
  const est = orig * Math.exp(Model.predictLog(d.model, state.vec) - state.base);
  state.est = est;
  const lo = round100(est * d.lowMul), hi = round100(est * d.highMul);
  if (!initial) estSpring.set(est);
  $('rRange').textContent = `80% likely between ${fmtUSD(lo)} and ${fmtUSD(hi)}`;
  const delta = est - orig;
  $('rAdj').textContent = Math.abs(delta) < 50 ? '' : `${delta > 0 ? 'Up' : 'Down'} ${fmtUSD(round100(Math.abs(delta)))} (${fmtPct(delta / orig * 100)}) from ${fmtUSD(orig)} with your changes`;
  $('rReset').hidden = Math.abs(delta) < 1 && state.vec.every((v, k) => v === state.orig[k]);

  // range visual
  const cv = H.cv[i];
  const saleYear = H.sd && H.sd[i] ? +H.sd[i].slice(0, 4) : 0;
  const sp = H.sp && H.sp[i] && saleYear >= TAX_YEAR - 3 ? H.sp[i] : null;
  const baseLo = orig * d.lowMul, baseHi = orig * d.highMul;
  const vals = [lo, hi, cv, baseLo, baseHi].concat(sp ? [sp] : []);
  const min = Math.min(...vals) * 0.96, max = Math.max(...vals) * 1.03;
  const pos = v => ((v - min) / (max - min) * 100).toFixed(2) + '%';
  const band = $('rvBand');
  band.classList.toggle('glide', !!initial);
  band.style.left = pos(lo); band.style.width = ((hi - lo) / (max - min) * 100).toFixed(2) + '%';
  const m = (id, v, label) => { const el = $(id); el.classList.toggle('glide', !!initial); el.style.left = pos(v); el.querySelector('span').textContent = label; };
  m('rvEst', est, fmtShort(est));
  m('rvCv', cv, 'County ' + fmtShort(cv));
  const saleEl = $('rvSale');
  if (sp) {
    saleEl.hidden = false; m('rvSale', sp, 'Sold ' + fmtShort(sp));
    // keep the two lower labels from colliding
    const gap = Math.abs(sp - cv) / (max - min);
    saleEl.querySelector('span').style.visibility = gap < 0.16 ? 'hidden' : '';
  } else saleEl.hidden = true;

  const likely = PlannerMath.likelySalePrice(est, saleRatio());
  $('rangeText').textContent = `Model estimate ${fmtUSD(round1000(est))}, 80% likely between ${fmtUSD(round1000(lo))} and ${fmtUSD(round1000(hi))}. County value ${fmtUSD(cv)}.`
    + (likely !== est ? ` Likely sale price about ${fmtUSD(round1000(likely))}.` : '') + (sp ? ` Last sold for ${fmtUSD(sp)}.` : '');

  // comparison
  const diff = (est - cv) / cv * 100;
  const rows = [
    [`County value ${TAX_YEAR}`, fmtUSD(cv), `model is ${Math.abs(diff) < 0.5 ? 'within 0.5%' : Math.abs(diff).toFixed(1) + '%' + (diff > 0 ? ' higher' : ' lower')}`],
  ];
  if (H.sqft[i]) rows.push(['Estimate per sq ft', fmtUSD(est / H.sqft[i]), `county ${fmtUSD(cv / H.sqft[i])}`]);
  $('rCompare').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd class="num">${v}${s ? `<small>${esc(s)}</small>` : ''}</dd></div>`).join('');
}

function featValue(d, f, i) {
  const v = d.X[f][i];
  if (v == null) return 'Not recorded';
  if (d.model.cats[f]) {
    const c = d.model.cats[f][v];
    if (f === 'NbrHood' || f === 'NGHBRHDCD') return 'Code ' + c;
    return titleCase(c);
  }
  switch (f) {
    case 'lon': case 'lat': return 'Where the home sits';
    case 'BLDGAREA': case 'RESFLRAREA': return fmtInt(v) + ' sq ft';
    case 'STATEDAREA': return v.toFixed(2) + ' acres';
    case 'home_age': return (v <= 0 ? 'New' : v === 1 ? '1 year' : v + ' years') + ' (built ' + (TAX_YEAR - v) + ')';
    case 'owns_lot': return v ? 'Yes' : 'No';
    default: return String(v);
  }
}
function renderDrivers() {
  const d = cur(), i = state.sel;
  const drv = d.H.drv[i];
  const maxAbs = Math.max(6, ...drv.map(x => Math.abs(x[1])));
  $('rDrivers').innerHTML = drv.map(([k, pct]) => {
    const f = d.model.features[k];
    const w = Math.min(50, Math.abs(pct) / maxAbs * 50);
    const cls = pct >= 0 ? 'pos' : 'neg';
    return `<div class="drv"><div class="lbl">${esc(LABELS[f] || f)}<small>${esc(featValue(d, f, i))}</small></div>
      <div class="viz"><i class="${cls}" style="width:${w.toFixed(1)}%"></i></div>
      <div class="pct ${cls}">${fmtPct(pct, Math.abs(pct) < 10 ? 1 : 0)}</div></div>`;
  }).join('');
}

function renderSliders() {
  const d = cur(), i = state.sel, host = $('rSliders');
  const conf = SLIDERS[state.market].filter(c => d.X[c.f][i] != null && !(c.skip && c.skip(d, i)));
  if (!conf.length) { host.innerHTML = '<p class="fine">This record is missing the details the model needs for this.</p>'; return; }
  host.innerHTML = conf.map(c => {
    const raw = d.X[c.f][i];
    const ui = c.toUI ? c.toUI(raw) : raw;
    const min = Math.min(c.min(ui), ui), max = Math.max(c.max(ui), ui);
    return `<div class="sl"><label for="sl-${c.f}">${c.label}</label>
      <input type="range" id="sl-${c.f}" data-f="${c.f}" min="${min}" max="${max}" step="${c.step}" value="${ui}" data-orig="${ui}">
      <output id="out-${c.f}" for="sl-${c.f}">${c.fmt(ui)}</output></div>`;
  }).join('');
  host.querySelectorAll('input[type=range]').forEach(el => {
    const c = conf.find(x => x.f === el.dataset.f);
    const paint = () => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
    paint();
    el.addEventListener('input', () => {
      const ui = +el.value;
      state.vec[d.featIndex[c.f]] = c.fromUI ? c.fromUI(ui) : ui;
      const out = $('out-' + c.f); out.textContent = c.fmt(ui);
      out.classList.toggle('changed', String(ui) !== el.dataset.orig);
      paint();
      updateEstimate(false);
    });
  });
}
$('rReset').addEventListener('click', () => {
  state.vec = state.orig.slice();
  renderSliders(); updateEstimate(false);
});
$('rCopy').addEventListener('click', async () => {
  const btn = $('rCopy');
  try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => (btn.textContent = 'Copy link'), 1600);
});

function renderNearby() {
  const d = cur(), i = state.sel, ul = $('rNearby');
  if (!d.has[i]) { ul.innerHTML = '<li class="fine">No location on file for this home.</li>'; return; }
  let r = d.cell * 0.6, hits = [];
  for (let k = 0; k < 6 && hits.length < 7; k++, r *= 2) hits = d.near(d.wx[i], d.wy[i], r);
  hits = hits.filter(h => h[1] !== i).slice(0, 5);
  ul.innerHTML = hits.map(([dd, j]) => {
    const mi = Math.sqrt(dd) * 69;
    const dist = mi < 0.1 ? Math.round(mi * 5280 / 10) * 10 + ' ft' : mi.toFixed(1) + ' mi';
    const sq = d.H.sqft[j] ? ' · ' + fmtInt(d.H.sqft[j]) + ' sq ft' : '';
    return `<li><button type="button" data-i="${j}"><span class="a">${esc(d.H.addr[j])}</span><span class="v num">${fmtUSD(d.H.est[j])}</span><small>${dist}${sq}</small><small class="num r">county ${fmtShort(d.H.cv[j])}</small></button></li>`;
  }).join('');
}
$('rNearby').addEventListener('click', e => { const b = e.target.closest('button[data-i]'); if (b) selectHome(+b.dataset.i, { from: 'nearby', scroll: false }); });

/* ============================================================
   Can your family pay for it? (DESIGN.md 5.3, parts 1-4)
   ============================================================ */
const aff = { downTyped: false, rateMoved: false };

// The starting "price to check" is the model's estimate.
// Every home is judged at its likely sale price, not the county-value estimate:
// see market.estimate_to_sale_price_ratio in planner-config.json.
function saleRatio() { return plannerSetting('market.estimate_to_sale_price_ratio').value; }
function salePercentAbove() { const r = saleRatio(); return r > 0 ? Math.round((1 / r - 1) * 100) : 0; }

function startingPrice(d, i) {
  return PlannerMath.likelySalePrice(d.H.est[i], saleRatio());
}

function resetAfford() {
  const d = cur(), i = state.sel;
  if (i < 0) return;
  aff.downTyped = false; aff.rateMoved = false;
  $('affPrice').value = fmtInt(round100(startingPrice(d, i)));
  $('affDown').value = '';
  $('affIns').value = '';
  $('affDrop').checked = false;
  const rate = homeCostSettings(d.market).ratePercent;
  $('affRate').value = rate ?? 7;
  $('affSearch').href = 'https://www.google.com/search?q=' + encodeURIComponent(`${d.H.addr[i]}, Forsyth County GA for sale`);
  renderAfford();
}

function readMoneyBox(id) {
  const v = PlannerMath.parseAmount($(id).value);
  $(id).classList.toggle('invalid', Number.isNaN(v));
  return Number.isNaN(v) ? undefined : v;
}

function renderAfford() {
  const d = cur(), i = state.sel;
  if (!d || i < 0) return;
  const s = homeCostSettings(d.market);
  if (!aff.rateMoved && s.ratePercent != null) $('affRate').value = s.ratePercent;
  const rate = +$('affRate').value;
  $('affRateOut').textContent = rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%';
  $('affDropPct').textContent = plannerSetting('comfort.what_if_income_drop_percent').value ?? 10;

  const price = readMoneyBox('affPrice');
  const typedDown = readMoneyBox('affDown');
  const quote = readMoneyBox('affIns');
  const savings = familyBudget.savings || 0;
  const down = typedDown != null ? Math.min(typedDown, price || 0)
    : PlannerMath.downPaymentFromSavings(savings, price || 0, s.closingPercent) ?? 0;
  if (!aff.downTyped) $('affDown').placeholder = fmtInt(down);

  $('affPriceNote').textContent = salePercentAbove()
    ? `Starts at the likely sale price: the estimate +${salePercentAbove()}%. Type an asking price to check it.`
    : 'Starts at the model’s estimate. Type an asking price to check it.';
  $('affDownNote').textContent = typedDown != null ? 'Your number' : `From your savings after ${s.closingPercent}% closing costs`;
  $('affInsNote').textContent = quote != null ? 'Your quote, per year' : `Blank uses $${(+s.insurancePer1000).toFixed(2)} per $1,000 of value a year (${plannerSetting('insurance.homeowners_rate_per_1000').cite})`;

  if (price == null || price === undefined) {
    $('affTable').innerHTML = ''; $('affVerdict').textContent = 'Type a price to check.'; $('affPriceCheck').textContent = '';
    return;
  }
  renderPriceCheck(d, i, price);

  // a down payment below the minimum isn't allowed, so the loan is figured with the minimum
  const downUsed = s.minDownPercent != null ? Math.max(down, price * s.minDownPercent / 100) : down;
  const cost = PlannerMath.monthlyHousingCost({ ...s, ratePercent: rate, price, downPayment: downUsed,
    insuranceMonthly: quote != null ? quote / 12 : null });
  const downPct = price ? downUsed / price * 100 : 0;
  const millage = plannerSetting('property_tax.millage.forsyth_county');
  const notes = {
    loanPayment: `${fmtUSD(cost.loan)} loan at ${$('affRateOut').textContent} for ${s.termYears} years` + (downUsed > down ? ` (with the ${s.minDownPercent}% minimum down)` : ''),
    propertyTax: s.mills != null ? `40% of the price × ${s.mills} mills (${millage.cite})` : 'Not set yet: the tax rate needs an official source',
    homeInsurance: quote != null ? 'Your quote' : `Estimate: ${plannerSetting('insurance.homeowners_rate_per_1000').cite}`,
    mortgageInsurance: downPct >= s.pmiRequiredBelowPercent ? `None: ${s.pmiRequiredBelowPercent}% or more down`
      : `Under ${s.pmiRequiredBelowPercent}% down (${downPct.toFixed(1)}%): $${s.pmiPer100k} a month per $100,000 borrowed`,
  };
  const labels = { loanPayment: 'Loan payment', propertyTax: 'Property tax', homeInsurance: 'Home insurance', mortgageInsurance: 'Mortgage insurance' };
  $('affTable').innerHTML = '<tbody>' + Object.keys(labels).map(k => cost[k] == null
    ? `<tr><td>${labels[k]}<small>${esc(notes[k])}</small></td><td class="missing">not set yet</td></tr>`
    : `<tr><td>${labels[k]}<small>${esc(notes[k])}</small></td><td>${fmtUSD(cost[k])}</td></tr>`).join('') +
    `<tr class="total"><td>Total each month</td><td>${cost.total == null ? '—' : fmtUSD(cost.total)}</td></tr></tbody>`;

  renderCash(price, down, s);
  renderVerdict(cost);
}

function renderPriceCheck(d, i, price) {
  const H = d.H, estLo = H.est[i] * d.lowMul, estHi = H.est[i] * d.highMul;
  const up = salePercentAbove();
  const parts = [`The model puts this home at <b>${fmtShort(estLo)}–${fmtShort(estHi)}</b>, based on county values, which usually run below sale prices.`];
  // with a sales ratio set, an asking price is checked against the likely sale range instead
  const lo = up ? PlannerMath.likelySalePrice(estLo, saleRatio()) : estLo;
  const hi = up ? PlannerMath.likelySalePrice(estHi, saleRatio()) : estHi;
  if (up) parts.push(`In 2025, Alpharetta homes sold for about ${up}% more than this project’s estimates there, so expect about <b>${fmtShort(lo)}–${fmtShort(hi)}</b>. There are no Forsyth sales to check this against yet.`);
  else parts.push('No Forsyth sales were available to test how far below sale prices it runs.');
  const top = H.drv[i][0];
  if (top) parts.push(`The biggest reason for the model’s number: ${esc(LABELS[d.model.features[top[0]]] || '')} (${fmtPct(top[1], 0)} vs. the average home).`);
  if (price > hi) parts.push(`Your price is <b>${Math.round((price / hi - 1) * 100)}% above</b> the top of that range.`);
  else if (price < lo) parts.push(`Your price is <b>${Math.round((1 - price / lo) * 100)}% below</b> the bottom of that range.`);
  else parts.push('Your price is <b>inside</b> that range.');
  $('affPriceCheck').innerHTML = parts.join(' ');
}

function renderCash(price, down, s) {
  const closing = PlannerMath.closingCosts(price, s.closingPercent) || 0;
  // a down payment under the minimum can't be used, so the cash needed counts the minimum
  const minDownAmount = s.minDownPercent != null ? price * s.minDownPercent / 100 : 0;
  const needed = Math.max(down, minDownAmount) + closing;
  const savings = familyBudget.savings;
  const rows = [
    ['Down payment', fmtUSD(down), price ? (down / price * 100).toFixed(1) + '% of the price' : ''],
    ['Closing costs', fmtUSD(closing), `${s.closingPercent}% (${plannerSetting('closing_costs.percent_of_price').cite})`],
    ['Total needed', fmtUSD(needed), ''],
  ];
  const minDown = s.minDownPercent;
  if (minDown != null && price && down / price * 100 < minDown) {
    rows.splice(2, 0, ['Minimum down payment', fmtUSD(minDownAmount), `${minDown}% (${plannerSetting('loan.minimum_down_payment_percent').cite}); the down payment above is below it, so this is counted instead`]);
  }
  if (savings != null) {
    const gap = savings - needed;
    if (gap >= 0) rows.push(['Left in savings', fmtUSD(gap), gap === 0 ? 'all of it goes into the purchase; type a smaller down payment to keep some' : '']);
    else {
      const months = PlannerMath.monthsToSave(-gap, familyBudget.monthlySaving);
      rows.push(['Short by', fmtUSD(-gap), months == null ? 'add “can save each month” on the budget to see how long' : `about ${months} months at ${fmtUSD(familyBudget.monthlySaving)} a month`]);
    }
  }
  $('affCash').innerHTML = rows.map(([k, v, n]) => `<div><dt>${k}</dt><dd>${v}${n ? `<small>${esc(n)}</small>` : ''}</dd></div>`).join('');
}

const leftWords = left => left >= 0 ? `${fmtUSD(left)} left` : `${fmtUSD(-left)} short each month`;

function renderVerdict(cost) {
  const ready = budgetIsFilledIn();
  $('affNeedBudget').hidden = ready;
  $('affBar').hidden = !ready; $('affBarKey').hidden = !ready;
  if (!ready) { $('affVerdict').textContent = ''; $('affWhatIfNote').textContent = ''; return; }
  if (cost.total == null) {
    const names = { loanPayment: 'loan payment', propertyTax: 'property tax', homeInsurance: 'home insurance', mortgageInsurance: 'mortgage insurance' };
    $('affVerdict').textContent = `Can’t total this home yet: ${cost.missing.map(m => names[m]).join(', ')} isn’t set.`;
    $('affBar').hidden = true; $('affBarKey').hidden = true; $('affWhatIfNote').textContent = '';
    return;
  }
  const dropPct = plannerSetting('comfort.what_if_income_drop_percent').value ?? 10;
  const cut1 = plannerSetting('comfort.comfortable_min_left_percent').value;
  const cut2 = plannerSetting('comfort.stretching_below_left_percent').value;
  const b = familyBudget;
  const verdictFor = takeHome => {
    const pct = PlannerMath.leftAfterHousingPercent(takeHome, b.debts, b.otherCosts, cost.total);
    return { pct, left: takeHome * pct / 100, label: PlannerMath.comfortLabel(pct, cut1, cut2) };
  };
  const dropped = $('affDrop').checked;
  const takeHome = b.takeHome * (dropped ? 1 - dropPct / 100 : 1);
  const v = verdictFor(takeHome);
  const label = v.label ? `<b class="${v.label}">${v.label}</b>: ` : '';
  const lower = dropped ? `, with take-home pay ${dropPct}% lower` : '';
  $('affVerdict').innerHTML = (v.left >= 0
    ? `${label}about <b>${fmtUSD(v.left)}</b> (${v.pct.toFixed(0)}% of take-home pay) left each month after every bill, including this home${lower}.`
    : `${label}every bill plus this home would come to <b>${fmtUSD(-v.left)} more</b> than take-home pay each month${lower}.`)
    + (v.label ? ` Comfortable means ${cut1}% or more left; stretching means under ${cut2}%.` : '');
  const other = verdictFor(dropped ? b.takeHome : b.takeHome * (1 - dropPct / 100));
  $('affWhatIfNote').textContent = dropped
    ? `At your full take-home pay: ${other.label ? other.label + ', ' : ''}${leftWords(other.left)}.`
    : `If take-home pay dropped ${dropPct}%: ${other.label ? other.label + ', ' : ''}${leftWords(other.left)}.`;
  const costs = Math.min((b.debts || 0) + (b.otherCosts || 0), takeHome);
  const home = Math.min(cost.total, Math.max(0, takeHome - costs));
  const left = Math.max(0, takeHome - costs - home);
  const pct = x => (x / takeHome * 100).toFixed(2) + '%';
  $('aff-bar-costs').style.width = pct(costs); $('aff-bar-home').style.width = pct(home); $('aff-bar-left').style.width = pct(left);
  $('affBar').setAttribute('aria-label', `Take-home pay: bills and debt ${pct(costs)}, this home ${pct(home)}, left over ${pct(left)}`);
  $('affBarKey').textContent = `Take-home pay ${fmtUSD(takeHome)}: bills and debt ${fmtUSD(costs)} · this home ${fmtUSD(cost.total)} · left ${fmtUSD(takeHome - costs - cost.total)}`;
  announce('detailAnnounce', `${cur().H.addr[state.sel]}: about ${fmtUSD(cost.total)} a month. ${v.label ? v.label + ', ' : ''}${leftWords(v.left)}.`);
}

['affPrice', 'affIns'].forEach(id => $(id).addEventListener('input', renderAfford));
$('affDown').addEventListener('input', () => { aff.downTyped = $('affDown').value.trim() !== ''; renderAfford(); });
$('affRate').addEventListener('input', () => { aff.rateMoved = true; renderAfford(); });
$('affDrop').addEventListener('change', renderAfford);
$('affPrint').addEventListener('click', () => window.print());
window.addEventListener('budgetchange', () => { if (state.sel >= 0) renderAfford(); });

$('budgetPrint').addEventListener('click', () => window.print());

/* ============================================================
   The (i) panels: sources, accuracy and how each number is worked out
   ============================================================ */
const tableHTML = (head, rows) => '<thead><tr>' + head.map(h => `<th scope="col">${h}</th>`).join('') + '</tr></thead><tbody>'
  + rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('') + '</tbody>';
const linkSources = src => esc(src).replace(/(https?:\/\/[^\s)]+?)([.,;:]?)(?=\s|$)/g, '<a href="$1" target="_blank" rel="noopener">source ↗</a>$2');

// Every config number the cost math or the labels use, with its source and date.
const ASSUMPTION_ROWS = [
  ['Interest rate (starting value)', 'loan.default_interest_rate', v => v + '%'],
  ['Loan length (starting value)', 'loan.default_term_years', v => v + ' years'],
  ['Lowest down payment allowed', 'loan.minimum_down_payment_percent', v => v + '% of price'],
  ['Likely sale price', 'market.estimate_to_sale_price_ratio', v => `estimate ÷ ${v} (+${Math.round((1 / v - 1) * 100)}%)`],
  ['Share of value that is taxed', 'property_tax.assessment_ratio', v => (v * 100) + '%'],
  ['Forsyth tax rate', 'property_tax.millage.forsyth_county', v => v + ' mills'],
  ['Homestead exemption', 'property_tax.homestead_exemption', v => fmtUSD(v)],
  ['Home insurance', 'insurance.homeowners_rate_per_1000', v => `$${(+v).toFixed(2)} per $1,000 a year`],
  ['Mortgage insurance', 'mortgage_insurance.monthly_per_100k', v => `$${v}/mo per $100,000`],
  ['Mortgage insurance applies under', 'mortgage_insurance.required_below_down_payment_percent', v => v + '% down'],
  ['Closing costs', 'closing_costs.percent_of_price', v => v + '% of price'],
  ['Housing guideline (reference only)', 'guidelines.housing_share_of_gross_income', v => v + '% of pay before taxes'],
  ['Comfortable cutoff', 'comfort.comfortable_min_left_percent', v => v + '% or more left'],
  ['Stretching cutoff', 'comfort.stretching_below_left_percent', v => 'under ' + v + '% left'],
];
function assumptionsHTML(rows = ASSUMPTION_ROWS) {
  return '<thead><tr><th scope="col">What</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">As of</th></tr></thead><tbody>' + rows.map(([name, path, fmt]) => {
    const e = plannerSetting(path);
    return e.value == null
      ? `<tr><td>${name}</td><td class="unset">not set yet</td><td class="src">${esc(e.note || 'Needs an official source.')}</td><td>—</td></tr>`
      : `<tr><td>${name}</td><td>${fmt(e.value)}</td><td class="src">${linkSources(e.source)}</td><td>${esc(longDate(e.as_of))}</td></tr>`;
  }).join('') + '</tbody>';
}

function renderInfoPanels() {
  const f = SUMMARY.final, pct = v => (v * 100).toFixed(0) + '%';
  $('mHomes').textContent = fmtInt(SUMMARY.homes);
  $('mSteps').innerHTML = tableHTML(['What the model could see', 'Median error', 'Within 10%'],
    SUMMARY.steps.map(s => [esc(s.inputs), s['median APE %'].toFixed(2) + '%', s['within 10% of county value'].toFixed(1) + '%']));
  $('mAccuracy').innerHTML = tableHTML(['Measure (against county value)', 'Result'], [
    ['Half of homes are within', f['median APE %'].toFixed(1) + '% of their county value'],
    ['Homes within 10% of county value', f['within 10% of county value'].toFixed(1) + '%'],
    ['Average miss in dollars', fmtUSD(f['MAE $'])],
    ['Share of county values the model explains (R²)', f.R2.toFixed(3)],
    ['Homes whose county value falls inside their 80% range', pct(f.band_coverage)],
  ]);
  const tiers = Object.entries(f.coverage_by_tier);
  $('mTiers').innerHTML = tableHTML(['Price tier', 'County value inside the 80% range'],
    tiers.map(([k, v]) => [esc(k[0].toUpperCase() + k.slice(1)), pct(v)]));
  const top = tiers[tiers.length - 1][1];
  $('mWeak').innerHTML = [
    `The most expensive fifth of homes land inside their range only ${pct(top)} of the time, so treat their ranges as rough.`,
    'Homes built in the tax year may have been valued partway through construction, so their estimates can come out too low. They are marked “may be partly built”.',
    'There are no Forsyth sale prices in the open data, so the step from county value to sale price is borrowed from Alpharetta (below).',
  ].map(s => `<li>${esc(s)}</li>`).join('');

  const ratio = saleRatio();
  $('mSaleLead').textContent = ratio
    ? `County values run below what homes sell for. When this project also covered Alpharetta, it compared its estimates with real sales there. In 2025 the estimate was a median ${ratio} of the sale price, so the planner divides each Forsyth estimate by ${ratio} (about +${salePercentAbove()}%). Forsyth has no open sale records yet, so this step is less certain than the estimate itself.`
    : 'No sale-price adjustment is set, so homes are judged at their estimate.';
  $('mSales').innerHTML = tableHTML(['Sale year (Alpharetta)', 'Sales used', 'Estimate ÷ sale price (median)', 'County value ÷ sale price (median)'],
    Object.entries(SUMMARY.sales_check).map(([y, s]) => [y, fmtInt(s['sales used']), s['model estimate / sale price (median)'].toFixed(2), s['county value / sale price (median)'].toFixed(2)]));

  const c1 = plannerSetting('comfort.comfortable_min_left_percent'), c2 = plannerSetting('comfort.stretching_below_left_percent');
  $('mComfort').textContent = c1.value == null || c2.value == null ? 'The comfort cutoffs are not set yet.'
    : `The label looks at what is left of take-home pay after every monthly bill, including the home. Comfortable: ${c1.value}% or more left. Tight: between ${c2.value}% and ${c1.value}%. Stretching: under ${c2.value}%.`;
  $('mComfortWhy').textContent = c1.reason || '';
  $('costSources').innerHTML = assumptionsHTML();
  $('costSourcesBudget').innerHTML = assumptionsHTML();
}
renderInfoPanels();

/* ============================================================
   Segmented controls
   ============================================================ */
function initSeg(seg, onPick) {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.getAttribute('aria-pressed') === 'true') return;
    seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b);
  });
}

/* ============================================================
   Market switching + boot
   ============================================================ */
function renderStats(d) {
  const nb = NB[d.market];
  const cvs = d.H.cv.slice().sort((a, b) => a - b);
  const rows = [
    ['Homes', fmtInt(d.n)],
    ['Median county value', fmtUSD(quantile(cvs, 0.5))],
    ['Median estimate error', nb.medape.toFixed(1) + '%'],
    ['Typical 80% range', `${fmtPct((d.lowMul - 1) * 100)} to ${fmtPct((d.highMul - 1) * 100)}`],
    ['Tax year', String(TAX_YEAR)],
  ];
  $('stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
}
/* ---------------- home settings (filters) and list ---------------- */
// Settings are not budget data, but they still live only in memory.
const homeFilters = {};
const FILTER_INPUTS = ['fPriceMin', 'fPriceMax', 'fSqftMin', 'fSqftMax', 'fLotMin', 'fYearMin'];
const SCHOOL_LEVELS = { fES: 'ES', fMS: 'MS', fHS: 'HS' };

function setupFilters(d) {
  $('fNewYear').textContent = NEW_HOME_FIRST_YEAR;
  $('listTaxYear').textContent = TAX_YEAR;
  const has = { beds: !!d.H.beds, baths: !!d.H.baths, schools: !!d.schools };
  document.querySelectorAll('#filters [data-needs]').forEach(el => { el.hidden = !has[el.dataset.needs]; });
  for (const [id, level] of Object.entries(SCHOOL_LEVELS)) {
    const names = d.schools ? d.schools.levels[level] : [];
    const order = names.map((n, k) => [n, k]).sort((a, b) => a[0].localeCompare(b[0]));
    $(id).innerHTML = '<option value="">Any</option>' + order.map(([n, k]) => `<option value="${k}">${esc(titleCase(n))}</option>`).join('');
  }
  if (d.schools) $('fNote').textContent = `School zones come from Forsyth County GIS (updated ${d.schools.as_of.split(' ')[0]}). Zones can change, so check with the school district before deciding.`;
  else if (d.market === 'forsyth') $('fNote').textContent = 'School zones couldn’t be loaded.';

}

function readFilters() {
  const f = { newOnly: $('fNew').checked, fits: $('fFits').checked, includeTight: $('fTight').checked };
  let bad = false;
  for (const id of FILTER_INPUTS) {
    const v = PlannerMath.parseAmount($(id).value);
    $(id).classList.toggle('invalid', Number.isNaN(v));
    if (Number.isNaN(v)) bad = true;
    f[id] = Number.isNaN(v) ? null : v;
  }
  f.beds = $('fBeds').value === '' ? null : +$('fBeds').value;
  f.baths = $('fBaths').value === '' ? null : +$('fBaths').value;
  for (const [id, level] of Object.entries(SCHOOL_LEVELS)) f[level] = $(id).value === '' ? null : +$(id).value;
  // every word has to show up somewhere in the address or subdivision, in any order
  f.words = $('fText').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  $('fErr').textContent = bad ? 'Use numbers only in the marked boxes. They are being ignored for now.' : '';
  return f;
}

function homeMatches(d, i, f) {
  const H = d.H;
  if (f.newOnly && !isNewHome(d, i)) return false;
  if (f.fPriceMin != null && H.est[i] < f.fPriceMin) return false;
  if (f.fPriceMax != null && H.est[i] > f.fPriceMax) return false;
  if (f.fSqftMin != null && !(H.sqft[i] >= f.fSqftMin)) return false;
  if (f.fSqftMax != null && !(H.sqft[i] <= f.fSqftMax)) return false;
  if (f.fLotMin != null && !(H.ac[i] >= f.fLotMin)) return false;
  if (f.fYearMin != null && !(H.yr[i] >= f.fYearMin)) return false;
  if (f.beds != null && H.beds && !(H.beds[i] >= f.beds)) return false;
  if (f.baths != null && H.baths && !(H.baths[i] >= f.baths)) return false;
  if (d.schools) for (const level of ['ES', 'MS', 'HS']) if (f[level] != null && d.schools.home[level][i] !== f[level]) return false;
  if (f.words.length) {
    const place = d.lower[i] + ' ' + d.subOf(i).toLowerCase();
    if (!f.words.every(w => place.includes(w))) return false;
  }
  return true;
}

// Comfort label for one home at its starting price, or null if it can't be worked out.
function homeFitLabel(d, i) {
  const price = startingPrice(d, i);
  const cost = familyHomeCost(d.market, price).total;
  const b = familyBudget;
  const pct = PlannerMath.leftAfterHousingPercent(b.takeHome, b.debts, b.otherCosts, cost);
  return { cost, cashOk: savingsCoverPrice(d.market, price) !== false,
    label: PlannerMath.comfortLabel(pct, plannerSetting('comfort.comfortable_min_left_percent').value,
      plannerSetting('comfort.stretching_below_left_percent').value) };
}

function applyFilters() {
  const d = cur(); if (!d) return;
  const f = readFilters();
  // the budget setting only works once the budget and every cost source are there
  let fitsProblem = '';
  if (f.fits && !budgetIsFilledIn()) fitsProblem = 'Fill in your budget first. This setting is off until then.';
  else if (f.fits && homeFitLabel(d, 0).label == null) fitsProblem = 'A cost source is missing, so this setting is off.';
  $('fFitsNote').textContent = fitsProblem || (salePercentAbove()
    ? `Uses your budget and each home’s likely sale price (the estimate +${salePercentAbove()}%)`
    : 'Uses your budget and each home’s estimate as the price');
  $('fFitsNote').classList.toggle('partial', !!fitsProblem);
  const useFits = f.fits && !fitsProblem;
  const list = [];
  const mask = new Uint8Array(d.n);
  let aboveBudget = 0;
  for (let i = 0; i < d.n; i++) {
    if (!homeMatches(d, i, f)) continue;
    if (useFits) {
      const fit = homeFitLabel(d, i);
      if (!fit.cashOk || !(fit.label === 'Comfortable' || (f.includeTight && fit.label === 'Tight'))) { aboveBudget++; continue; }
    }
    mask[i] = 1; list.push(i);
  }
  d.aboveBudget = useFits ? aboveBudget : 0;
  if (useFits) f.fitsOn = true;
  d.match = list.length === d.n ? null : mask; // null means "nothing filtered out"
  d.matchList = list;
  d.activeSettings = describeSettings(d, f);
  d.relax = list.length ? [] : relaxOptions(d, f, useFits);
  state.listShown = 20;
  renderHomeList();
  map.hover = -1; drawMap();
}

// When nothing matches: which single setting, turned off, would bring homes back.
const RELAXABLE = [
  { label: 'Fits my budget', on: (f, fits) => fits, off: f => ({ ...f, fits: false }), ids: ['fFits'] },
  { label: 'Only new homes', on: f => f.newOnly, off: f => ({ ...f, newOnly: false }), ids: ['fNew'] },
  { label: 'Estimate range', on: f => f.fPriceMin != null || f.fPriceMax != null, off: f => ({ ...f, fPriceMin: null, fPriceMax: null }), ids: ['fPriceMin', 'fPriceMax'] },
  { label: 'Size', on: f => f.fSqftMin != null || f.fSqftMax != null, off: f => ({ ...f, fSqftMin: null, fSqftMax: null }), ids: ['fSqftMin', 'fSqftMax'] },
  { label: 'Lot size', on: f => f.fLotMin != null, off: f => ({ ...f, fLotMin: null }), ids: ['fLotMin'] },
  { label: 'Year built', on: f => f.fYearMin != null, off: f => ({ ...f, fYearMin: null }), ids: ['fYearMin'] },
  { label: 'Bedrooms', on: f => f.beds != null, off: f => ({ ...f, beds: null }), ids: ['fBeds'] },
  { label: 'Full baths', on: f => f.baths != null, off: f => ({ ...f, baths: null }), ids: ['fBaths'] },
  { label: 'School zones', on: f => f.ES != null || f.MS != null || f.HS != null, off: f => ({ ...f, ES: null, MS: null, HS: null }), ids: ['fES', 'fMS', 'fHS'] },
  { label: 'Subdivision or street', on: f => f.words.length > 0, off: f => ({ ...f, words: [] }), ids: ['fText'] },
];
function relaxOptions(d, f, useFits) {
  const out = [];
  RELAXABLE.forEach((r, k) => {
    if (!r.on(f, useFits)) return;
    const g = r.off(f), fits = k === 0 ? false : useFits;
    let n = 0;
    for (let i = 0; i < d.n; i++) {
      if (!homeMatches(d, i, g)) continue;
      if (fits) { const fit = homeFitLabel(d, i); if (!fit.cashOk || !(fit.label === 'Comfortable' || (g.includeTight && fit.label === 'Tight'))) continue; }
      n++;
    }
    if (n) out.push({ k, n });
  });
  return out.sort((a, b) => b.n - a.n).slice(0, 3);
}

// Plain-words list of the settings that are on, shown above the list.
function describeSettings(d, f) {
  const range = (lo, hi, fmt) => lo != null && hi != null ? `${fmt(lo)}–${fmt(hi)}` : lo != null ? `${fmt(lo)}+` : `up to ${fmt(hi)}`;
  const out = [];
  if (f.fitsOn) out.push(f.includeTight ? 'Fits my budget (incl. tight)' : 'Fits my budget');
  if (f.newOnly) out.push(`Built ${NEW_HOME_FIRST_YEAR} or later`);
  if (f.fPriceMin != null || f.fPriceMax != null) out.push('Estimate ' + range(f.fPriceMin, f.fPriceMax, fmtShort));
  if (f.fSqftMin != null || f.fSqftMax != null) out.push(range(f.fSqftMin, f.fSqftMax, fmtInt) + ' sq ft');
  if (f.fLotMin != null) out.push(`Lot ${f.fLotMin}+ acres`);
  if (f.fYearMin != null) out.push(`Built ${f.fYearMin} or later`);
  if (f.beds != null && d.H.beds) out.push(`${f.beds}+ bedrooms`);
  if (f.baths != null && d.H.baths) out.push(`${f.baths}+ full baths`);
  if (d.schools) for (const level of ['ES', 'MS', 'HS']) if (f[level] != null) out.push(titleCase(d.schools.levels[level][f[level]]));
  if (f.words.length) out.push(`“${f.words.join(' ')}”`);
  return out;
}

function renderHomeList() {
  const d = cur(); if (!d || !d.matchList) return;
  const on = d.activeSettings || [];
  $('activeSettings').hidden = !on.length;
  $('activeSettings').innerHTML = (on.length ? `Settings on: <b>${on.map(esc).join(' · ')}</b>` : '')
    + (d.aboveBudget ? ` ${on.length ? '<br>' : ''}${fmtInt(d.aboveBudget)} more homes match your other settings but are above your budget or your savings.` : '');
  $('activeSettings').hidden = !on.length && !d.aboveBudget;
  const H = d.H;
  const limit = comfortableLimit();
  const sort = listSortInUse(limit);
  const cmp = {
    closest: null,
    newest: (a, b) => (H.yr[b] || 0) - (H.yr[a] || 0) || H.est[b] - H.est[a],
    low: (a, b) => H.est[a] - H.est[b],
    high: (a, b) => H.est[b] - H.est[a],
    big: (a, b) => (H.sqft[b] || 0) - (H.sqft[a] || 0),
  }[sort];
  let list;
  if (sort === 'closest') {
    const key = new Float64Array(d.n);
    for (const i of d.matchList) {
      const price = startingPrice(d, i);
      key[i] = PlannerMath.budgetDistance(familyHomeCost(d.market, price).total, limit, savingsCoverPrice(d.market, price));
    }
    list = d.matchList.slice().sort((a, b) => key[a] - key[b]);
  } else list = d.matchList.slice().sort(cmp);
  $('listCount').textContent = list.length === d.n ? `${fmtInt(d.n)} homes` : `${fmtInt(list.length)} of ${fmtInt(d.n)}`;
  const rows = list.slice(0, state.listShown);
  $('homeList').innerHTML = rows.map(i => {
    const lo = round100(H.est[i] * d.lowMul), hi = round100(H.est[i] * d.highMul);
    const size = [H.beds && H.beds[i] != null ? H.beds[i] + ' bd' : '', H.sqft[i] ? fmtInt(H.sqft[i]) + ' sq ft' : ''].filter(Boolean).join(' · ');
    const bits = [H.yr[i] ? 'Built ' + H.yr[i] : '', size, d.subOf(i)].filter(Boolean).join(' · ');
    let note = mayBePartlyBuilt(d, i)
      ? '<small class="r partial">may be partly built</small>'
      : `<small class="r">county ${fmtShort(H.cv[i])}</small>`;
    if (budgetIsFilledIn()) {
      const fit = homeFitLabel(d, i);
      if (fit.cost != null) note = `<small class="r">≈ ${fmtUSD(fit.cost)}/mo at ${fmtShort(startingPrice(d, i))}${fit.label ? ` · <span class="fit ${fit.label}">${fit.label}</span>` : ''}${fit.cashOk ? '' : ' · <span class="fit Stretching">needs more savings</span>'}${mayBePartlyBuilt(d, i) ? ' · <span class="partial">may be partly built</span>' : ''}</small>`;
    }
    return `<li><button type="button" data-i="${i}"><span class="a">${esc(H.addr[i] || H.id[i])}</span><span class="v">${fmtShort(lo)}–${fmtShort(hi)}</span><small>${esc(bits)}</small>${note}</button></li>`;
  }).join('') || `<li class="empty">No homes match these settings.${(d.relax || []).length
    ? ' ' + d.relax.map(r => `<button class="linkish" type="button" data-relax="${r.k}">Turn off “${RELAXABLE[r.k].label}”</button> (${fmtInt(r.n)} homes)`).join(' · ')
    : ' Press Reset to start over.'}</li>`;
  $('listMore').hidden = rows.length >= list.length;
  $('listMoreCount').textContent = list.length ? `Showing ${fmtInt(rows.length)} of ${fmtInt(list.length)}` : '';
}

let filterTimer = 0;
$('filters').addEventListener('input', () => { clearTimeout(filterTimer); filterTimer = setTimeout(applyFilters, 120); });
$('filters').addEventListener('change', applyFilters);
$('filters').addEventListener('submit', e => e.preventDefault());
window.addEventListener('budgetchange', () => { clearTimeout(filterTimer); filterTimer = setTimeout(applyFilters, 150); });
// browsers can refill these boxes after a reload; start clean so no setting is on without the user knowing
$('filters').reset();
window.addEventListener('pageshow', e => { if (e.persisted) { $('filters').reset(); applyFilters(); } });
$('fReset').addEventListener('click', () => {
  $('filters').querySelectorAll('input, select').forEach(el => { if (el.type === 'checkbox') el.checked = false; else el.value = ''; });
  applyFilters();
});
$('homeList').addEventListener('click', e => {
  const relax = e.target.closest('button[data-relax]');
  if (relax) {
    for (const id of RELAXABLE[+relax.dataset.relax].ids) { const el = $(id); if (el.type === 'checkbox') el.checked = false; else el.value = ''; }
    applyFilters(); return;
  }
  const b = e.target.closest('button[data-i]'); if (b) selectHome(+b.dataset.i, { from: 'list' });
});
$('listMore').addEventListener('click', () => { state.listShown += 20; renderHomeList(); });
initSeg($('listSort'), b => { state.listSort = b.dataset.sort; state.listSortPicked = true; state.listShown = 20; renderHomeList(); });

// The most the family can spend on housing each month and stay comfortable, or null.
function comfortableLimit() {
  if (!budgetIsFilledIn()) return null;
  const b = familyBudget;
  return PlannerMath.comfortableHousingLimit(b.takeHome, b.debts, b.otherCosts, plannerSetting('comfort.comfortable_min_left_percent').value);
}

// "Closest to your budget" only shows once there is a budget to be close to, and
// it is the starting sort then, until someone picks a sort themselves.
function listSortInUse(limit) {
  const canClose = limit != null;
  let sort = state.listSortPicked ? state.listSort : (canClose ? 'closest' : 'newest');
  if (sort === 'closest' && !canClose) sort = 'newest';
  const seg = $('listSort');
  seg.querySelector('[data-sort="closest"]').hidden = !canClose;
  seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.sort === sort)));
  return sort;
}

function setStatus(msg, error) { const s = $('status'); s.textContent = msg; s.classList.toggle('error', !!error); }

async function setMarket(market, selectId) {
  state.market = market;
  document.body.dataset.market = market;
  const nb = NB[market];
  $('result').hidden = true; $('detailEmpty').hidden = false; state.sel = -1;
  $('tabDetail').href = '#/detail';
  $('q').value = ''; search.items = []; renderSuggest();
  if (currentScreen === 'homes') history.replaceState(null, '', '#/homes/' + market);

  $('retryLoad').hidden = true;
  if (!state.data[market]) {
    $('q').disabled = true; $('q').placeholder = 'Loading addresses…'; $('tryRow').hidden = true; $('legend').hidden = true;
    if (map.ctx) $('mapSkel').textContent = 'Loading map…';
    $('mapSkel').hidden = false; if (map.ctx) map.ctx.clearRect(0, 0, map.canvas.width, map.canvas.height);
    setStatus(`Loading ${fmtInt(nb.n)} ${nb.name} homes…`);
  }
  let d;
  try { d = await loadMarket(market); }
  catch (err) {
    console.error(err);
    $('q').placeholder = 'Addresses didn’t load';
    $('mapSkel').textContent = 'The map didn’t load.';
    setStatus(location.protocol === 'file:'
      ? 'Couldn’t load the home data. Browsers block it when this file is opened from the disk; open the live site, or run python -m http.server in this folder.'
      : 'Couldn’t load the home data. Check your connection and try again.', true);
    $('retryLoad').hidden = false;
    $('retryLoad').onclick = () => setMarket(market, selectId);
    return;
  }
  if (state.market !== market) return; // the user switched again while this loaded
  $('mapSkel').hidden = !!map.ctx; $('legend').hidden = !map.ctx; $('q').disabled = false;
  $('homeCount').textContent = fmtInt(d.n);
  setStatus('');
  buildRamp(); sizeMap(); resetCam(false); renderTry(); renderStats(d);
  setupFilters(d); applyFilters();
  if (selectId) {
    const i = d.H.id.indexOf(selectId);
    if (i >= 0) selectHome(i, { from: 'link' });
  }
}

function themeLabel() {
  $('themeBtn').querySelector('.ms').textContent = isDark() ? 'light_mode' : 'dark_mode';
  $('themeBtn').setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
}
themeLabel();
$('themeBtn').addEventListener('click', () => {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  themeLabel();
  buildRamp(); drawMap(); if (state.sel >= 0) { /* colors come from CSS vars */ }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeLabel(); buildRamp(); drawMap(); });

(async function boot() {
  const route = parseScreenRoute(location.hash);
  await setMarket('forsyth', route.id);
  window.addEventListener('hashchange', () => {
    const r = parseScreenRoute(location.hash);
    if (!r.market) return;
    if (r.market !== state.market) { setMarket(r.market, r.id); return; }
    const d = cur(), i = r.id && d ? d.H.id.indexOf(r.id) : -1;
    if (i >= 0 && i !== state.sel) selectHome(i, { from: 'link' });
  });
})();

})();

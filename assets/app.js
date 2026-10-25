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

// Validation numbers exactly as printed in housing_model_v2.ipynb for Forsyth.
// data/summary.json came from a slightly different run, so its R2, error and
// coverage differ in the last digit; the site shows the notebook's.
//   final model: cell 27 output     feature steps: cell 25 output
// Not in the notebook for Forsyth, so left out: a "whole neighborhoods held out" test
// (only run for Alpharetta, cell 11) and any check against Forsyth sale prices.
const NOTEBOOK_ACCURACY = {
  r2: 0.912, mae: 45380, mape: 6.76, medianError: 4.42, within10: 81.6,
  rangeLow: -8.5, rangeHigh: 11.0, coverage: 0.80,
  tiers: [['lowest 20%', 0.800], ['20-40%', 0.876], ['40-60%', 0.845], ['60-80%', 0.794], ['top 20%', 0.685]],
  steps: [
    ['v1 inputs (with land value)', 4.34, 82.4],
    ['minus land value', 4.50, 80.8],
    ['+ quality and structure type', 4.45, 81.3],
    ['+ coordinates (final)', 4.42, 81.6],
  ],
};
const NB = {
  forsyth: {
    place: 'Forsyth County', name: 'Forsyth', county: 'Forsyth County', hue: 48,
    n: SUMMARY.homes, medape: NOTEBOOK_ACCURACY.medianError,
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
// onProgress(fraction) is called while the file downloads, when the size is known
async function fetchText(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status + ' ' + url);
  const total = +res.headers.get('content-length');
  let buf;
  if (onProgress && total && res.body) {
    const reader = res.body.getReader(), chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(1, got / total));
    }
    buf = new Uint8Array(got);
    let at = 0;
    for (const c of chunks) { buf.set(c, at); at += c.length; }
  } else buf = new Uint8Array(await res.arrayBuffer());
  let text;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    text = await new Response(stream).text();
  } else {
    text = new TextDecoder().decode(buf);
  }
  return text;
}

function prepare(market, raw) {
  const H = raw.homes, X = raw.X, model = raw.model, nb = NB[market];
  const n = H.id.length;
  const lowMul = Math.exp(nb.bandLo), highMul = Math.exp(nb.bandHi);
  const d = { market, H, X, model, n, lowMul, highMul };
  d.lower = H.addr.map(a => a.toLowerCase());
  d.searchable = H.addr.map(PlannerMath.normalizeAddress);
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
  d.rankOf = new Int32Array(n).fill(-1);
  d.order.forEach((i, k) => { d.rankOf[i] = k; });

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

// Downloading only moves bytes; reading them (JSON.parse and prepare) is the slow part
// on a phone, so it waits until a screen that needs the homes opens.
const downloads = {};
function downloadMarket(market) {
  if (!downloads[market]) {
    const homes = fetchText(`data/${market}.json.gz`, f => {
      const msg = `Loading ${fmtInt(NB[market].n)} ${NB[market].name} homes… ${Math.round(f * 100)}%`;
      setStatus(msg); if (map.ctx) $('mapSkel').textContent = msg;
    });
    const schools = market === 'forsyth' ? fetchText('data/forsyth_schools.json.gz').catch(() => null) : Promise.resolve(null);
    downloads[market] = Promise.all([homes, schools]);
    downloads[market].catch(() => { delete downloads[market]; }); // let Try again download it again
  }
  return downloads[market];
}
function loadMarket(market) {
  if (state.data[market]) return Promise.resolve(state.data[market]);
  return downloadMarket(market).then(([homesText, schoolsText]) => {
    const d = prepare(market, JSON.parse(homesText));
    d.schools = schoolsText ? JSON.parse(schoolsText) : null;
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
  if (map.hover >= 0 && map.hover !== state.sel) ring(map.hover, css('--on-surface'), r + 3, 1.5);
  if (state.sel >= 0 && d.has[state.sel]) {
    const [x, y] = toScreen(d, state.sel);
    ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.fillStyle = css('--secondary'); ctx.fill();
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
  c.addEventListener('keydown', e => {
    if (!cur()) return;
    const pan = 80 / map.cam.s;
    const moves = { ArrowLeft: [-pan, 0], ArrowRight: [pan, 0], ArrowUp: [0, -pan], ArrowDown: [0, pan] };
    if (moves[e.key]) {
      map.springs.x.set(map.springs.x.target + moves[e.key][0]);
      map.springs.y.set(map.springs.y.target + moves[e.key][1]);
    } else if (e.key === '+' || e.key === '=') $('zoomIn').onclick();
    else if (e.key === '-' || e.key === '_') $('zoomOut').onclick();
    else if (e.key === '0') resetCam(true);
    else return;
    e.preventDefault();
  });
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
  q = PlannerMath.normalizeAddress(q);
  if (q.length < 2) return [];
  const starts = [], contains = [];
  for (let i = 0; i < d.n; i++) {
    const a = d.searchable[i];
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
const estSpring = new Spring(0, v => { $('rEst').textContent = fmtUSD(round1000(v)); }, 0.3);

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
  document.querySelectorAll('[data-detail-link]').forEach(a => { a.href = homeLink; });
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
  renderCompare();
  estSpring.snap(H.est[i]);
  updateEstimate(true);
}
function titleCase(s) { return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bSfr\b/, 'SFR').replace(/\bSf\b/, 'SF').replace(/\b(Es|Ms|Hs)$/, m => m.toUpperCase()); }

function updateEstimate(initial) {
  const d = cur(), H = d.H, i = state.sel;
  const orig = H.est[i];
  const est = orig * Math.exp(Model.predictLog(d.model, state.vec) - state.base);
  state.est = est;
  const lo = round1000(est * d.lowMul), hi = round1000(est * d.highMul);
  if (!initial) estSpring.set(est);
  $('rRange').textContent = `80% likely between ${fmtUSD(lo)} and ${fmtUSD(hi)}`;
  const delta = est - orig;
  $('rAdj').textContent = Math.abs(delta) < 500 ? '' : `${delta > 0 ? 'Up' : 'Down'} ${fmtUSD(round1000(Math.abs(delta)))} (${fmtPct(delta / orig * 100)}) from ${fmtUSD(round1000(orig))} with your changes`;
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
// One plain sentence from the two biggest reasons, pointing the same way as the estimate.
function driverSentence(d, i) {
  const drv = d.H.drv[i], higher = d.H.est[i] >= d.vMid;
  const name = k => (LABELS[d.model.features[k]] || d.model.features[k]).toLowerCase();
  const same = drv.filter(([, pct]) => higher ? pct > 0 : pct < 0).slice(0, 2).map(([k]) => name(k));
  if (!same.length) return '';
  return `The estimate is ${higher ? 'higher' : 'lower'} than the typical Forsyth home (${fmtShort(d.vMid)}) mostly because of its ${same.join(' and ')}.`;
}

// "How sure we are" (DESIGN.md 5.3, part 5): the tested range for homes in the same price tier
function renderHowSure(d, i) {
  const tiers = NOTEBOOK_ACCURACY.tiers;
  const rank = d.rankOf ? d.rankOf[i] : -1;
  const lines = [];
  if (rank >= 0) {
    const t = Math.min(tiers.length - 1, Math.floor(rank / d.order.length * tiers.length));
    const [tierName, cover] = tiers[t];
    lines.push(`<b>How sure we are:</b> this home is in the ${esc(tierName)} of Forsyth estimates. When tested, ${Math.round(cover * 100)}% of homes in that group had their county value inside their 80% range.`);
    if (cover < 0.75) lines.push('That is lower than for most homes, so treat this range as rough.');
  }
  if (mayBePartlyBuilt(d, i)) lines.push(`Built ${d.H.yr[i]}: the county may have valued it while it was still being built, so the estimate can be too low.`);
  if (!d.H.sqft[i]) lines.push('The county record has no building size, which makes the estimate less reliable.');
  $('rSure').innerHTML = lines.map(l => `<p>${l}</p>`).join('');
}

function renderDrivers() {
  const d = cur(), i = state.sel;
  $('rWhy').textContent = driverSentence(d, i);
  renderHowSure(d, i);
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
    return `<li><button type="button" data-i="${j}"><span class="a">${esc(d.H.addr[j])}</span><span class="v num">${fmtUSD(round1000(d.H.est[j]))}</span><small>${dist}${sq}</small><small class="num r">county ${fmtShort(d.H.cv[j])}</small></button></li>`;
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
  $('affPrice').value = fmtInt(round1000(startingPrice(d, i)));
  $('affDown').value = '';
  $('affIns').value = '';
  $('affHoa').value = '';
  $('affMaint').value = '';
  $('affDrop').value = plannerSetting('comfort.what_if_income_drop_percent').value ?? 10;
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

// "what's this?" words: one plain sentence each (DESIGN.md principle 5)
const GLOSSARY = {
  assessed: ['assessed value', 'In Georgia, property tax is charged on 40% of a home’s value. That 40%, minus any exemption, is the assessed value.'],
  millage: ['a mill', 'The local tax rate is set in mills: one mill is $1 of tax for every $1,000 of assessed value.'],
  pmi: ['mortgage insurance', 'Insurance that protects the lender, not you. It is usually required when the down payment is under 20% of the price.'],
  escrow: ['escrow', 'An account many lenders use to collect property tax and insurance with each monthly payment and pay those bills for you.'],
};
const openTerms = {};
function term(key) {
  const [word, def] = GLOSSARY[key], id = 'g-' + key, open = !!openTerms[id];
  return ` <button class="term" type="button" aria-expanded="${open}" aria-controls="${id}">what’s ${word}?</button><span class="term-def" id="${id}"${open ? '' : ' hidden'}>${esc(def)}</span>`;
}
// the toggle itself is in screens.js; remember what is open so a redraw keeps it open
document.addEventListener('click', e => {
  const b = e.target.closest('.term');
  if (b) openTerms[b.getAttribute('aria-controls')] = b.getAttribute('aria-expanded') === 'true';
});

const pctText = v => (+v).toFixed(1).replace(/\.0$/, '') + '%';

function renderAfford() {
  const d = cur(), i = state.sel;
  if (!d || i < 0) return;
  const s = homeCostSettings(d.market);
  if (!aff.rateMoved && s.ratePercent != null) $('affRate').value = s.ratePercent;
  const rate = +$('affRate').value;
  $('affRateOut').textContent = rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%';
  $('affDropOut').textContent = $('affDrop').value + '%';

  const price = readMoneyBox('affPrice');
  const typedDown = readMoneyBox('affDown');
  const quote = readMoneyBox('affIns');
  const hoa = readMoneyBox('affHoa');
  const maint = readMoneyBox('affMaint');
  const savings = familyBudget.savings || 0;
  const fromSavings = PlannerMath.downPaymentFromSavings(savings, price || 0, s.closingPercent) ?? 0;
  const down = typedDown != null ? Math.min(typedDown, price || 0) : fromSavings;
  if (!aff.downTyped) $('affDown').placeholder = fmtInt(down);

  $('affPriceNote').textContent = salePercentAbove()
    ? `Starts at the likely sale price: the estimate +${salePercentAbove()}%. Type an asking price to check it.`
    : 'Starts at the model’s estimate. Type an asking price to check it.';
  $('affDownNote').textContent = typedDown != null ? 'Your number' : `From your savings after ${s.closingPercent}% closing costs`;
  $('affInsNote').textContent = quote != null ? 'Your quote, per year' : `Blank uses $${(+s.insurancePer1000).toFixed(2)} per $1,000 of value a year (${plannerSetting('insurance.homeowners_rate_per_1000').cite})`;
  $('affHoaNote').textContent = hoa ? 'Your number, per month' : 'Many Forsyth subdivisions have them. Blank counts as $0.';
  $('affMaintNote').textContent = maint ? 'Your number, per month' : 'Money set aside each month for repairs. Blank counts as $0.';

  if (price == null || price === undefined) {
    $('affTable').innerHTML = ''; $('affVerdict').textContent = 'Type a price to check.'; $('affPriceCheck').textContent = '';
    $('affInterest').textContent = ''; $('affAmortWrap').hidden = true; $('affDownWhatIf').textContent = ''; $('affEscrow').textContent = '';
    renderSummary(null);
    return;
  }
  renderPriceCheck(d, i, price);

  // a down payment below the minimum isn't allowed, so the loan is figured with the minimum
  const costFor = downPayment => PlannerMath.monthlyHousingCost({ ...s, ratePercent: rate, price,
    downPayment: s.minDownPercent != null ? Math.max(downPayment, price * s.minDownPercent / 100) : downPayment,
    insuranceMonthly: quote != null ? quote / 12 : null, hoaMonthly: hoa || 0, maintenanceMonthly: maint || 0 });
  const downUsed = s.minDownPercent != null ? Math.max(down, price * s.minDownPercent / 100) : down;
  const cost = costFor(down);
  const downPct = price ? downUsed / price * 100 : 0;
  const millage = plannerSetting('property_tax.millage.forsyth_county');
  const millageLink = (String(millage.source).match(/https?:\/\/\S+/) || [])[0];
  // the loan payment shown as its two parts; the year-by-year table shows how the split shifts
  const split = PlannerMath.firstPaymentSplit(cost.loan, rate, s.termYears);
  if (split) { cost.principal = split.principal; cost.interest = split.interest; }
  const loanText = esc(`first month of a ${fmtUSD(cost.loan)} loan at ${$('affRateOut').textContent} for ${s.termYears} years` + (downUsed > down ? ` (with the ${s.minDownPercent}% minimum down)` : ''));
  const notes = {
    principal: `Pays down the loan; ${loanText}`,
    interest: `Paid to the lender; together with principal, ${fmtUSD(cost.loanPayment)} every month`,
    propertyTax: s.mills != null ? esc(`40% of the price × ${s.mills} mills (${millage.cite}), last checked ${longDate(millage.last_checked || millage.as_of)}. `)
      + (millageLink ? `<a href="${esc(millageLink)}" target="_blank" rel="noopener">County page ↗</a>` : '') + term('assessed') + term('millage') : 'Not set yet: the tax rate needs an official source',
    homeInsurance: esc(quote != null ? 'Your quote' : `Placeholder, not a quote: ${plannerSetting('insurance.homeowners_rate_per_1000').cite}. Type a real quote above.`),
    mortgageInsurance: esc(downPct >= s.pmiRequiredBelowPercent ? `None: ${s.pmiRequiredBelowPercent}% or more down`
      : `Under ${s.pmiRequiredBelowPercent}% down (${downPct.toFixed(1)}%): $${s.pmiPer100k} a month per $100,000 borrowed`) + term('pmi'),
    hoa: hoa ? 'Your number' : 'Not counted. Type your HOA dues above if the home has them.',
    maintenance: maint ? 'Your number' : 'Not counted. No official figure was found, so type your own above.',
  };
  const labels = { principal: 'Principal', interest: 'Interest', propertyTax: 'Property tax', homeInsurance: 'Home insurance', mortgageInsurance: 'Mortgage insurance (PMI)', hoa: 'HOA dues', maintenance: 'Maintenance reserve' };
  $('affTable').innerHTML = '<tbody>' + Object.keys(labels).map(k => cost[k] == null
    ? `<tr><td>${labels[k]}<small>${notes[k]}</small></td><td class="missing">not set yet</td></tr>`
    : `<tr><td>${labels[k]}<small>${notes[k]}</small></td><td>${fmtUSD(cost[k])}</td></tr>`).join('') +
    `<tr class="total"><td>Total each month</td><td>${cost.total == null ? '—' : fmtUSD(cost.total)}</td></tr></tbody>`;
  $('affEscrow').innerHTML = 'Lenders often collect the tax and insurance with the loan payment.' + term('escrow');

  // interest over the life of the loan
  const interest = PlannerMath.totalInterest(cost.loan, rate, s.termYears);
  $('affInterest').innerHTML = interest == null ? '' : `Over ${s.termYears} years you would pay about <b>${fmtUSD(interest)}</b> in interest on a ${fmtUSD(cost.loan)} loan.`;
  const years = PlannerMath.amortizationByYear(cost.loan, rate, s.termYears);
  $('affAmortWrap').hidden = !years || !cost.loan;
  if (years && $('affAmortWrap').open) $('affAmort').innerHTML = tableHTML(['Year', 'Interest', 'Principal', 'Still owed'],
    years.map(y => [y.year, fmtUSD(y.interest), fmtUSD(y.principal), fmtUSD(y.balance)]));

  // down payment what-if: the slider and the box show the same down payment
  const slider = $('affDownPct');
  slider.min = s.minDownPercent ?? 0;
  slider.value = Math.min(+slider.max, downPct);
  slider.style.setProperty('--p', ((slider.value - slider.min) / (slider.max - slider.min) * 100) + '%');
  $('affDownOut').textContent = `${fmtShort(downUsed)} (${pctText(downPct)})`;
  const base = costFor(fromSavings);
  const change = cost.total != null && base.total != null ? cost.total - base.total : null;
  const at20 = costFor(price * s.pmiRequiredBelowPercent / 100);
  const pmiNow = cost.mortgageInsurance;
  $('affDownWhatIf').textContent = [
    change != null && Math.abs(change) >= 1 ? `With this down payment the monthly total is ${fmtUSD(Math.abs(change))} ${change > 0 ? 'more' : 'less'} than with the one from your savings.` : '',
    pmiNow > 0 ? `At ${s.pmiRequiredBelowPercent}% down (${fmtUSD(price * s.pmiRequiredBelowPercent / 100)}) mortgage insurance stops; the total would be about ${fmtUSD(at20.total)} a month.`
      : `At ${pctText(downPct)} down there is no mortgage insurance.`,
  ].filter(Boolean).join(' ');

  renderCash(price, down, s);
  renderPrograms(price);
  renderVerdict(cost);
}

/* ---------------- shortlist and compare (DESIGN.md 5.4) ---------------- */
// Parcel IDs only, in memory; gone when the page closes.
const shortlist = [];
const MAX_COMPARE = 3;

function renderSaveButton() {
  const d = cur(), id = d && state.sel >= 0 ? d.H.id[state.sel] : null;
  const saved = shortlist.includes(id);
  $('rSave').textContent = saved ? 'Remove from compare' : shortlist.length >= MAX_COMPARE ? `Compare is full (${MAX_COMPARE})` : 'Add to compare';
  $('rSave').disabled = !saved && shortlist.length >= MAX_COMPARE;
}

function renderCompare() {
  renderSaveButton();
  const d = cur();
  $('compareSec').hidden = !d || !shortlist.length;
  if (!d || !shortlist.length) return;
  const idx = shortlist.map(id => d.H.id.indexOf(id)).filter(i => i >= 0);
  const s = homeCostSettings(d.market), H = d.H;
  const cols = idx.map(i => {
    const price = startingPrice(d, i);
    const down = PlannerMath.downPaymentFromSavings(familyBudget.savings || 0, price, s.closingPercent) ?? 0;
    const cost = familyHomeCost(d.market, price);
    const fit = budgetIsFilledIn() ? homeFitLabel(d, i) : null;
    const left = fit && cost.total != null ? familyBudget.takeHome - (familyBudget.debts || 0) - (familyBudget.otherCosts || 0) - cost.total : null;
    const cash = Math.max(down, price * (s.minDownPercent || 0) / 100) + (PlannerMath.closingCosts(price, s.closingPercent) || 0);
    const zone = level => { if (!d.schools) return '—'; const k = d.schools.home[level][i]; return k >= 0 ? titleCase(d.schools.levels[level][k]) : '—'; };
    return { i, price, cost, fit, left, cash, zone };
  });
  const row = (name, f) => `<tr><td>${name}</td>${cols.map(c => `<td>${f(c)}</td>`).join('')}</tr>`;
  $('compareTable').innerHTML = '<thead><tr><th scope="col"><span class="sr">Home</span></th>' + cols.map(c =>
    `<th scope="col">${esc(H.addr[c.i] || H.id[c.i])}<br><button class="linkish" type="button" data-open="${c.i}">Open</button> · <button class="linkish" type="button" data-remove="${esc(H.id[c.i])}">Remove</button></th>`).join('') + '</tr></thead><tbody>'
    + row('Likely sale price', c => fmtUSD(round1000(c.price)))
    + row('Monthly total', c => c.cost.total == null ? 'not set yet' : fmtUSD(c.cost.total))
    + row('Comfort', c => c.fit && c.fit.label ? `<b class="fit ${c.fit.label}">${c.fit.label}</b>` : 'fill in your budget')
    + row('Left each month', c => c.left == null ? '—' : leftWords(c.left))
    + row('Cash needed up front', c => fmtUSD(c.cash))
    + row('Size', c => H.sqft[c.i] ? fmtInt(H.sqft[c.i]) + ' sq ft' : '—')
    + row('Built', c => H.yr[c.i] || '—')
    + row('Lot', c => H.ac[c.i] ? H.ac[c.i].toFixed(2) + ' ac' : '—')
    + row('Schools', c => [c.zone('ES'), c.zone('MS'), c.zone('HS')].map(esc).join('<br>'))
    + '</tbody>';
  $('compareNote').textContent = (shortlist.length < 2 ? 'Open another home and press Add to compare to see them side by side. ' : '')
    + 'Each home is shown at its likely sale price with the down payment from your savings and no HOA dues. The list is kept only until you close the page.';
}

$('rSave').addEventListener('click', () => {
  const id = cur().H.id[state.sel], k = shortlist.indexOf(id);
  if (k >= 0) shortlist.splice(k, 1); else if (shortlist.length < MAX_COMPARE) shortlist.push(id);
  renderCompare();
});
$('compareTable').addEventListener('click', e => {
  const open = e.target.closest('[data-open]'), remove = e.target.closest('[data-remove]');
  if (open) selectHome(+open.dataset.open, { from: 'compare' });
  if (remove) { shortlist.splice(shortlist.indexOf(remove.dataset.remove), 1); renderCompare(); }
});
$('compareCopy').addEventListener('click', async () => {
  const btn = $('compareCopy');
  const link = location.href.split('#')[0] + '#/compare/' + state.market + '/' + shortlist.map(encodeURIComponent).join(',');
  try { await navigator.clipboard.writeText(link); btn.textContent = 'Link copied (home IDs only)'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => (btn.textContent = 'Copy compare link'), 2000);
});
window.addEventListener('budgetchange', () => { if (shortlist.length) renderCompare(); });

// Georgia Dream limits, only what the DCA page says, with its date. No eligibility check.
function renderPrograms(price) {
  const g = k => plannerSetting('programs.georgia_dream.' + k);
  const maxPrice = g('max_sales_price'), inc12 = g('income_limit_1_2_people'), inc3 = g('income_limit_3_plus_people');
  if (maxPrice.value == null) { $('affPrograms').innerHTML = ''; return; }
  $('affPrograms').innerHTML = `<p><b>Georgia Dream</b> (Georgia DCA) offers home loans, with down payment help as an option. The DCA page lists a maximum sales price of ${fmtUSD(maxPrice.value)} and yearly income limits of ${fmtUSD(inc12.value)} for 1–2 people and ${fmtUSD(inc3.value)} for 3 or more, effective ${esc(longDate(maxPrice.as_of))}.`
    + (price > maxPrice.value ? ` The price above is higher than that maximum.` : '') + `</p>`
    + `<p>Rules change and this planner can’t check if you qualify. Check with a participating lender or on the <a href="https://dca.georgia.gov/affordable-housing/home-ownership/georgia-dream" target="_blank" rel="noopener">Georgia Dream page ↗</a>.</p>`;
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

// The short answer shown next to the address and, on phones, pinned above the what-if controls.
function renderSummary(cost, v) {
  const price = readMoneyBox('affPrice');
  let html = '';
  if (cost && cost.total != null) {
    html = `About <b>${fmtUSD(cost.total)}</b> a month at ${fmtShort(price)}`;
    if (v && v.label) html += ` · <b class="${v.label}">${v.label}</b>, ${esc(leftWords(v.left))}`;
    else if (!budgetIsFilledIn()) html += ' · fill in your budget to see if it fits';
  }
  $('rSummary').innerHTML = html;
  $('affSticky').innerHTML = html;
}

function renderVerdict(cost) {
  const ready = budgetIsFilledIn();
  $('affNeedBudget').hidden = ready;
  $('affBar').hidden = !ready; $('affBarKey').hidden = !ready;
  if (!ready) { $('affVerdict').textContent = ''; $('affWhatIfNote').textContent = ''; renderSummary(cost); return; }
  if (cost.total == null) {
    renderSummary(null);
    const names = { loanPayment: 'loan payment', propertyTax: 'property tax', homeInsurance: 'home insurance', mortgageInsurance: 'mortgage insurance', hoa: 'HOA dues' };
    $('affVerdict').textContent = `Can’t total this home yet: ${cost.missing.map(m => names[m]).join(', ')} isn’t set.`;
    $('affBar').hidden = true; $('affBarKey').hidden = true; $('affWhatIfNote').textContent = '';
    return;
  }
  const dropPct = +$('affDrop').value;
  const cut1 = plannerSetting('comfort.comfortable_min_left_percent').value;
  const cut2 = plannerSetting('comfort.stretching_below_left_percent').value;
  const b = familyBudget;
  const verdictFor = takeHome => {
    const pct = PlannerMath.leftAfterHousingPercent(takeHome, b.debts, b.otherCosts, cost.total);
    return { pct, left: takeHome * pct / 100, label: PlannerMath.comfortLabel(pct, cut1, cut2) };
  };
  // the verdict is at full take-home pay; the income-drop slider only changes the what-if line
  const takeHome = b.takeHome;
  const v = verdictFor(takeHome);
  renderSummary(cost, v);
  const label = v.label ? `<b class="${v.label}">${v.label}</b>: ` : '';
  $('affVerdict').innerHTML = (v.left >= 0
    ? `${label}about <b>${fmtUSD(v.left)}</b> (${v.pct.toFixed(0)}% of take-home pay) left each month after every bill, including this home.`
    : `${label}every bill plus this home would come to <b>${fmtUSD(-v.left)} more</b> than take-home pay each month.`)
    + (v.label ? ` Comfortable means ${cut1}% or more left; stretching means under ${cut2}%.` : '');
  const other = verdictFor(b.takeHome * (1 - dropPct / 100));
  $('affWhatIfNote').textContent = dropPct > 0
    ? `If take-home pay dropped ${dropPct}% (to ${fmtUSD(b.takeHome * (1 - dropPct / 100))}): ${other.label ? other.label + ', ' : ''}${leftWords(other.left)}.`
    : 'Move the income drop slider to see what happens if take-home pay falls.';
  const costs = Math.min((b.debts || 0) + (b.otherCosts || 0), takeHome);
  const home = Math.min(cost.total, Math.max(0, takeHome - costs));
  const left = Math.max(0, takeHome - costs - home);
  const pct = x => (x / takeHome * 100).toFixed(2) + '%';
  $('aff-bar-costs').style.width = pct(costs); $('aff-bar-home').style.width = pct(home); $('aff-bar-left').style.width = pct(left);
  $('affBar').setAttribute('aria-label', `Take-home pay: bills and debt ${pct(costs)}, this home ${pct(home)}, left over ${pct(left)}`);
  $('affBarKey').textContent = `Take-home pay ${fmtUSD(takeHome)}: bills and debt ${fmtUSD(costs)} · this home ${fmtUSD(cost.total)} · left ${fmtUSD(takeHome - costs - cost.total)}`;
  announce('detailAnnounce', `${cur().H.addr[state.sel]}: about ${fmtUSD(cost.total)} a month. ${v.label ? v.label + ', ' : ''}${leftWords(v.left)}.`);
}

['affPrice', 'affIns', 'affHoa', 'affMaint'].forEach(id => $(id).addEventListener('input', renderAfford));
$('affDown').addEventListener('input', () => { aff.downTyped = $('affDown').value.trim() !== ''; renderAfford(); });
$('affRate').addEventListener('input', () => { aff.rateMoved = true; renderAfford(); });
$('affDrop').addEventListener('input', renderAfford);
$('affDownPct').addEventListener('input', () => {
  const price = readMoneyBox('affPrice');
  if (!price) return;
  $('affDown').value = fmtInt(round100(price * $('affDownPct').value / 100));
  aff.downTyped = true;
  renderAfford();
});
$('affAmortWrap').addEventListener('toggle', renderAfford);
$('affPrint').addEventListener('click', () => window.print());

// The printed worksheet: the budget, the home being looked at (if any), the
// assumptions with sources, and the disclaimers. Built right before printing.
function buildPrintSheet() {
  const b = familyBudget, byId = $;
  const withHome = currentScreen === 'detail' && state.sel >= 0;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const money = v => v == null ? '—' : fmtUSD(v);
  let html = `<h1>Forsyth MarketMap: home budget worksheet</h1><p>Printed ${esc(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>`;
  html += '<div class="print-cols"><div><h2>Budget, each month</h2><table><tbody>' + row('Take-home pay', money(b.takeHome)) + row('Debt payments', money(b.debts))
    + row('Other regular costs', money(b.otherCosts)) + row('Savings for buying', money(b.savings))
    + row('Loan', `${homeCostSettings('forsyth').ratePercent ?? '—'}% for ${homeCostSettings('forsyth').termYears ?? '—'} years`)
    + row('Housing that leaves you comfortable', esc(byId('r-comfortLimit').textContent))
    + row('Price you could carry', esc(byId('r-maxPrice').textContent)) + '</tbody></table>'
    + `<p>${byId('r-headline').innerHTML}</p></div>`;
  if (withHome) {
    html += `<div><h2>${esc(byId('rAddr').textContent)}</h2><p>${esc(byId('rParcel').textContent)} · checked at $${esc(byId('affPrice').value)}</p>`
      + `<table>${byId('affTable').innerHTML.replace(/<small>.*?<\/small>/g, '').replace(/<tr><td>HOA dues<\/td><td>\$0<\/td><\/tr>/, '')}</table>`
      + `<p>${byId('affVerdict').innerHTML}</p><p>${esc(byId('affWhatIfNote').textContent)}</p>`
      + `<p>${byId('affInterest').innerHTML}</p>`
      + `<table><tbody>${[...byId('affCash').querySelectorAll('div')].map(d => {
        const dd = d.querySelector('dd'), note = dd.querySelector('small');
        return row(esc(d.querySelector('dt').textContent) + (note ? `<small>${esc(note.textContent)}</small>` : ''), esc(dd.firstChild.textContent));
      }).join('')}</tbody></table></div>`;
  }
  html += '</div>';
  html += `<h2>Numbers the planner used, with sources</h2><table>${assumptionsHTML(ASSUMPTION_ROWS, true)}</table>`;
  html += '<p class="fineprint">Planning tool only. Not financial advice, a loan offer, or an appraisal. Home estimates follow the county’s 2025 assessed values, not sale prices. Nothing typed into the planner is sent anywhere or saved. https://sahasreddye-sys.github.io/CAC26/</p>';
  $('printSheet').innerHTML = html;
}
window.addEventListener('beforeprint', buildPrintSheet);
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
  ['Maintenance reserve', 'maintenance.reserve_per_month', v => fmtUSD(v) + ' a month'],
  ['Mortgage insurance applies under', 'mortgage_insurance.required_below_down_payment_percent', v => v + '% down'],
  ['Closing costs', 'closing_costs.percent_of_price', v => v + '% of price'],
  ['Housing guideline (reference only)', 'guidelines.housing_share_of_gross_income', v => v + '% of pay before taxes'],
  ['Comfortable cutoff', 'comfort.comfortable_min_left_percent', v => v + '% or more left'],
  ['Stretching cutoff', 'comfort.stretching_below_left_percent', v => 'under ' + v + '% left'],
];
// short: name the source and its website instead of quoting it (the printed page)
function assumptionsHTML(rows = ASSUMPTION_ROWS, short = false) {
  if (short) {
    return '<thead><tr><th scope="col">What</th><th scope="col">Value</th><th scope="col">Source, as of</th></tr></thead><tbody>' + rows.map(([name, path, fmt]) => {
      const e = plannerSetting(path);
      const site = (String(e.source).match(/https?:\/\/([^/\s]+)/) || [])[1];
      return e.value == null ? `<tr><td>${name}</td><td>not set yet</td><td>needs an official source</td></tr>`
        : `<tr><td>${name}</td><td>${fmt(e.value)}</td><td>${esc([e.cite, site, fmtDate(e.as_of) || e.as_of].filter(Boolean).join(', '))}</td></tr>`;
    }).join('') + '</tbody>';
  }
  return '<thead><tr><th scope="col">What</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">As of</th></tr></thead><tbody>' + rows.map(([name, path, fmt]) => {
    const e = plannerSetting(path);
    return e.value == null
      ? `<tr><td>${name}</td><td class="unset">not set yet</td><td class="src">${esc(e.note || 'Needs an official source.')}</td><td>—</td></tr>`
      : `<tr><td>${name}</td><td>${fmt(e.value)}</td><td class="src">${linkSources(e.source)}</td><td>${esc(longDate(e.as_of))}</td></tr>`;
  }).join('') + '</tbody>';
}

// The accuracy tables: one copy in the Detail (i) panel, one on the About page.
function accuracyTables(prefix) {
  const a = NOTEBOOK_ACCURACY, pct = v => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  $(prefix + 'Steps').innerHTML = tableHTML(['What the model could see', 'Median error', 'Within 10%'],
    a.steps.map(([name, err, w10]) => [esc(name), err.toFixed(2) + '%', w10.toFixed(1) + '%']));
  $(prefix + 'Accuracy').innerHTML = tableHTML(['Measure (against county value)', 'Result'], [
    ['Half of homes are within', a.medianError.toFixed(2) + '% of their county value'],
    ['Homes within 10% of county value', a.within10.toFixed(1) + '%'],
    ['Average miss in dollars', fmtUSD(a.mae)],
    ['Average miss in percent', a.mape.toFixed(2) + '%'],
    ['Share of county values the model explains (R²)', a.r2.toFixed(3)],
    ['80% range around each estimate', `${a.rangeLow.toFixed(1)}% to +${a.rangeHigh.toFixed(1)}%`],
    ['County values inside that range when tested', pct(a.coverage)],
  ]);
  $(prefix + 'Tiers').innerHTML = tableHTML(['Price tier', 'County value inside the 80% range'],
    a.tiers.map(([k, v]) => [esc(k[0].toUpperCase() + k.slice(1)), pct(v)]));
}

function renderInfoPanels() {
  const tiers = NOTEBOOK_ACCURACY.tiers, pct = v => (v * 100).toFixed(1).replace(/\.0$/, '') + '%';
  $('mHomes').textContent = fmtInt(SUMMARY.homes);
  accuracyTables('m');
  accuracyTables('about');
  const top = tiers[tiers.length - 1][1];
  $('mWeak').innerHTML = [
    `The most expensive fifth of homes land inside their range only ${pct(top)} of the time, so treat their ranges as rough.`,
    'Homes built in the tax year may have been valued partway through construction, so their estimates can come out too low. They are marked “may be partly built”.',
    'There are no Forsyth sale prices in the open data, so the step from county value to sale price is borrowed from Alpharetta (below).',
  ].map(t => `<li>${esc(t)}</li>`).join('');

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
   Methods page (#/methods): error charts and the fairness check.
   Numbers come from data/forsyth_errors.json (tools/build_error_tables.py).
   ============================================================ */
function renderMethods() {
  const E = window.ERROR_TABLES; if (!E) return;
  const pct = v => v.toFixed(1) + '%';
  const signed = v => Math.abs(v) < 0.5 ? 'about even' : (v > 0 ? `${v.toFixed(1)}% high` : `${(-v).toFixed(1)}% low`);
  $('methodsSource').textContent = `Worked out by tools/build_error_tables.py from the estimates in data/forsyth.json.gz: ${fmtInt(E.overall.homes)} homes, median miss ${pct(E.overall.median_error_pct)}, ${pct(E.overall.within_10_pct)} within 10%. The notebook prints ${NOTEBOOK_ACCURACY.medianError}% for the same model from a slightly different run.`;

  // estimate vs county value, counted on a log grid
  const S = E.scatter, bins = S.bins, size = 360, pad = 60, cell = size / bins;
  const max = Math.max(...S.counts.flat());
  const pos = v => (Math.log10(v) - S.log10_from) / (S.log10_to - S.log10_from) * size;
  let body = '';
  S.counts.forEach((row, y) => row.forEach((c, x) => {
    if (!c) return;
    const o = (0.15 + 0.85 * Math.log(c) / Math.log(max)).toFixed(2);
    body += `<rect class="dens" x="${(pad + x * cell).toFixed(1)}" y="${(size - (y + 1) * cell).toFixed(1)}" width="${cell.toFixed(1)}" height="${cell.toFixed(1)}" fill-opacity="${o}"/>`;
  }));
  body += `<line class="diag" x1="${pad}" y1="${size}" x2="${pad + size}" y2="0"/>`;
  body += `<line class="axis-line" x1="${pad}" y1="${size}" x2="${pad + size}" y2="${size}"/><line class="axis-line" x1="${pad}" y1="0" x2="${pad}" y2="${size}"/>`;
  for (const v of [2e5, 5e5, 1e6, 2e6]) {
    const p = pos(v), label = v >= 1e6 ? `$${v / 1e6}M` : `$${v / 1e3}k`;
    body += `<text x="${(pad + p).toFixed(1)}" y="${size + 16}" text-anchor="middle">${label}</text><text x="${pad - 6}" y="${(size - p + 4).toFixed(1)}" text-anchor="end">${label}</text>`;
  }
  body += `<text x="${pad + size / 2}" y="${size + 34}" text-anchor="middle">County value</text><text x="12" y="${size / 2}" text-anchor="middle" transform="rotate(-90 12 ${size / 2})">Estimate</text>`;
  $('mScatter').innerHTML = `<svg viewBox="0 0 ${size + pad + 8} ${size + 42}" role="img" aria-label="Estimate against county value for ${fmtInt(E.overall.homes)} homes. Most homes sit close to the line where the two match; ${pct(E.overall.within_10_pct)} are within 10%.">${body}</svg>`;
  $('mScatterCap').textContent = `${fmtInt(E.overall.homes)} homes. Both axes use a log scale from $100k to about $4M; homes outside that are left off.`;

  // fairness: by price fifth (with the notebook's range coverage) and by decade built
  const cover = Object.fromEntries(NOTEBOOK_ACCURACY.tiers);
  $('mByPrice').innerHTML = tableHTML(['County value (fifth of homes)', 'Homes', 'Median miss', 'Within 10%', 'Usually', 'Inside 80% range (notebook)'],
    E.by_price.map(r => [`${esc(r.band)}<small>${fmtShort(r.from)}–${fmtShort(r.to)}</small>`, fmtInt(r.homes), pct(r.median_error_pct), pct(r.within_10_pct), signed(r.median_signed_pct), cover[r.band] != null ? (cover[r.band] * 100).toFixed(1) + '%' : '—']));
  $('mByDecade').innerHTML = tableHTML(['Built', 'Homes', 'Median miss', 'Within 10%', 'Usually'],
    E.by_decade.map(r => [esc(r.built), fmtInt(r.homes), pct(r.median_error_pct), pct(r.within_10_pct), signed(r.median_signed_pct)]));
  const prices = E.by_price.slice().sort((a, b) => a.median_error_pct - b.median_error_pct);
  const best = prices[0], worst = prices[prices.length - 1];
  const decades = E.by_decade.slice().sort((a, b) => b.median_error_pct - a.median_error_pct);
  $('mFairText').textContent = `The model is not equally good for every home. It does best for homes in the ${best.band.replace('-', '–')} price band (median miss ${pct(best.median_error_pct)}) and worst for the ${worst.band} most expensive (${pct(worst.median_error_pct)}, with ${pct(worst.within_10_pct)} within 10%), where it usually comes in ${signed(worst.median_signed_pct)}. Older homes are the hardest: homes built ${decades[0].built} miss by a median ${pct(decades[0].median_error_pct)} and only ${pct(decades[0].within_10_pct)} are within 10%, against ${pct(E.overall.median_error_pct)} for all homes. Treat estimates for expensive and older homes as rough.`;

  // subdivisions
  const subRow = r => [esc(r.subdivision), fmtInt(r.homes), pct(r.median_error_pct), pct(r.within_10_pct), signed(r.median_signed_pct)];
  const subHead = ['Subdivision', 'Homes', 'Median miss', 'Within 10%', 'Usually'];
  $('mSubsText').textContent = `${fmtInt(E.subdivisions_counted)} subdivisions have 30 or more homes. Here are the ten with the smallest and the ten with the largest median miss.`;
  $('mBestSubs').innerHTML = tableHTML(subHead, E.best_subdivisions.map(subRow));
  $('mWorstSubs').innerHTML = tableHTML(subHead, E.worst_subdivisions.map(subRow));

  // map of median miss in ~1 km squares
  const M = E.map, cells = M.cells, lat0 = cells.reduce((a, c) => a + c[0], 0) / cells.length * M.cell_deg;
  const kx = Math.cos(lat0 * Math.PI / 180);
  const xs = cells.map(c => c[1]), ys = cells.map(c => c[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = 520, unit = w / ((x1 - x0 + 1) * kx), h = (y1 - y0 + 1) * unit;
  const cls = e => e < 3 ? 0 : e < 6 ? 1 : e < 10 ? 2 : 3;
  const counts = [0, 0, 0, 0];
  let map = '';
  for (const [y, x, n, e] of cells) {
    counts[cls(e)]++;
    map += `<rect class="err-${cls(e)}" x="${((x - x0) * kx * unit).toFixed(1)}" y="${((y1 - y) * unit).toFixed(1)}" width="${(kx * unit + 0.5).toFixed(1)}" height="${(unit + 0.5).toFixed(1)}"><title>${n} homes, median miss ${e}%</title></rect>`;
  }
  $('mErrMap').innerHTML = `<svg viewBox="0 0 ${w} ${h.toFixed(0)}" role="img" aria-label="Map of Forsyth County in about 1 km squares, shaded by median miss. ${counts[3]} of ${cells.length} squares miss by 10% or more; the tables above describe the same pattern in words.">${map}</svg>`;
  const labels = ['under 3%', '3–6%', '6–10%', '10% or more'];
  $('mErrMapKey').innerHTML = 'Median miss:' + labels.map((l, k) => `<span class="key-swatch chart-swatch-${k}" aria-hidden="true"></span>${l} (${counts[k]} squares)`).join('');
  $('mMapText').textContent = `Each square is about 1 km across and shows the median miss for the homes inside it. Squares with fewer than ${M.min_homes} homes are left out. North is up.`;
}
renderMethods();

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
    const lo = H.est[i] * d.lowMul, hi = H.est[i] * d.highMul;
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
// The list below the map has the same homes and can be sorted, so keyboard and
// screen reader users can skip the map entirely.
$('skipToList').addEventListener('click', () => {
  const first = document.querySelector('#homeList button');
  $('listSort').scrollIntoView({ block: 'start' });
  (first || $('listSort').querySelector('button')).focus();
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

/* ---------------- how many homes fit, by school zone or subdivision ---------------- */
// Worked out from the homes data and the family's budget only. The per-home check is the
// same one the list uses, so it is cached until the budget or the settings change.
const countyFit = { key: '', fits: null, showAll: false };

function countyFitFlags(d) {
  const b = familyBudget, tight = $('cfTight').checked;
  const key = JSON.stringify([b, tight, homeCostSettings(d.market)]);
  if (countyFit.key === key) return countyFit.fits;
  const fits = new Uint8Array(d.n);
  for (let i = 0; i < d.n; i++) {
    const fit = homeFitLabel(d, i);
    fits[i] = fit.cashOk && (fit.label === 'Comfortable' || (tight && fit.label === 'Tight')) ? 1 : 0;
  }
  countyFit.key = key; countyFit.fits = fits;
  return fits;
}

function renderCountyFit() {
  const d = cur(); if (!d) return;
  if (!budgetIsFilledIn() || comfortableLimit() == null) {
    $('countyFitSummary').textContent = 'Fill in your budget to see how many homes fit.';
    $('countyFitTable').innerHTML = ''; $('cfMore').hidden = true;
    return;
  }
  const fits = countyFitFlags(d), tight = $('cfTight').checked;
  let total = 0; for (let i = 0; i < d.n; i++) total += fits[i];
  $('countyFitSummary').innerHTML = `<b>${fmtInt(total)}</b> of ${fmtInt(d.n)} homes (${(total / d.n * 100).toFixed(1)}%) would leave you ${tight ? 'comfortable or tight' : 'comfortable'} with take-home pay of ${fmtUSD(familyBudget.takeHome)} a month.`;

  const group = $('cfGroup').value, rows = new Map();
  const nameOf = group === 'sub'
    ? i => d.subOf(i)
    : i => { if (!d.schools) return ''; const k = d.schools.home[group][i]; return k >= 0 ? titleCase(d.schools.levels[group][k]) : ''; };
  for (let i = 0; i < d.n; i++) {
    const name = nameOf(i); if (!name) continue;
    const r = rows.get(name) || { name, n: 0, fit: 0 };
    r.n++; r.fit += fits[i]; rows.set(name, r);
  }
  let list = [...rows.values()].filter(r => group !== 'sub' || r.n >= 20).sort((a, b) => b.fit / b.n - a.fit / a.n || b.n - a.n);
  const shown = countyFit.showAll ? list : list.slice(0, 15);
  $('cfMore').hidden = list.length <= 15;
  $('cfMore').textContent = countyFit.showAll ? 'Show fewer' : `Show all ${list.length}`;
  const label = { ES: 'Elementary zone', MS: 'Middle zone', HS: 'High zone', sub: 'Subdivision' }[group];
  $('countyFitTable').innerHTML = tableHTML([label, 'Homes', 'Fit', 'Share that fit'], shown.map(r => {
    const pct = r.fit / r.n * 100;
    return [esc(r.name), fmtInt(r.n), fmtInt(r.fit), `<span class="share-cell">${pct.toFixed(0)}%<span class="share-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span></span>`];
  }));
}
$('cfGroup').addEventListener('change', () => { countyFit.showAll = false; renderCountyFit(); });
$('cfTight').addEventListener('change', renderCountyFit);
$('cfMore').addEventListener('click', () => { countyFit.showAll = !countyFit.showAll; renderCountyFit(); });
window.addEventListener('budgetchange', () => { if (currentScreen === 'homes') { clearTimeout(countyFit.timer); countyFit.timer = setTimeout(renderCountyFit, 400); } });
window.addEventListener('hashchange', () => { if (parseScreenRoute(location.hash).screen === 'homes') setTimeout(renderCountyFit, 0); });

function setStatus(msg, error) { const s = $('status'); s.textContent = msg; s.classList.toggle('error', !!error); }

async function setMarket(market, selectId) {
  state.market = market;
  const nb = NB[market];
  $('result').hidden = true; $('detailEmpty').hidden = false; state.sel = -1;
  document.querySelectorAll('[data-detail-link]').forEach(a => { a.href = '#/detail'; });
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
  renderCountyFit();
  const shared = parseScreenRoute(location.hash).compare;
  if (shared) shared.forEach(id => { if (d.H.id.includes(id) && !shortlist.includes(id) && shortlist.length < MAX_COMPARE) shortlist.push(id); });
  if (selectId) {
    const i = d.H.id.indexOf(selectId);
    if (i >= 0) selectHome(i, { from: 'link' });
  }
}

const MOON_ICON = '<svg class="ms" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
const SUN_ICON = '<svg class="ms" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
function themeLabel() {
  $('themeBtn').innerHTML = isDark() ? SUN_ICON : MOON_ICON;
  $('themeBtn').setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
}
themeLabel();
$('themeBtn').addEventListener('click', () => {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  themeLabel();
  buildRamp(); drawMap(); if (state.sel >= 0) { /* colors come from CSS vars */ }
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { themeLabel(); buildRamp(); drawMap(); });

(function boot() {
  // The homes file is the biggest download (about 5 MB). The Budget screen doesn't
  // need it: it downloads once the Budget screen is idle and is read when Homes or Detail opens.
  let started = false;
  const start = () => { if (!started) { started = true; setMarket('forsyth', parseScreenRoute(location.hash).id); } };
  if (parseScreenRoute(location.hash).screen !== 'budget') start();
  else setTimeout(() => (window.requestIdleCallback || (f => f()))(() => downloadMarket('forsyth'), { timeout: 3000 }), 1500);
  window.addEventListener('hashchange', () => {
    const r = parseScreenRoute(location.hash);
    if (r.screen !== 'budget' && !started) { start(); return; }
    if (!r.market || !cur()) return;
    if (r.market !== state.market) { setMarket(r.market, r.id); return; }
    const d = cur(), i = r.id && d ? d.H.id.indexOf(r.id) : -1;
    if (i >= 0 && i !== state.sel) selectHome(i, { from: 'link' });
  });
})();

})();

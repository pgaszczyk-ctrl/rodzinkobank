// "Kopalnia Marzeń" – animated pixel-art cross-section.
// Above ground: the calendar landscape with seasons blending along the axis.
// Below ground: chests in rock alcoves, each exactly under its date, and the
// gallery where the Groszaki work. Drawn on a small canvas (1 art pixel =
// S CSS pixels) and scaled up with crisp pixels; dates and amounts are HTML
// labels on top so they stay sharp and readable.

import { addMonths, wallParts, wallToInstant, dayOfYear } from './calendar.js';
import { t, fmtDate, money } from './i18n.js';

export const S = 4;                // CSS px per art pixel
const DAY = 86400_000;
const H = 148;                     // scene height in art px
const GROUND = 50;                 // top of the grass
const AXIS_Y = 55;                 // timeline line
const LEDGE_Y = 90;                // chest ledge
const GAL_TOP = 104;               // gallery ceiling
const FLOOR = 140;                 // rail level
const TX = 24;                     // "today" (shaft and vault centre)
const SH0 = TX - 7, SH1 = TX + 7;  // shaft walls
const FPS_MS = 80;

/* ------------------------------------------------------------------ */
/*  Seasons                                                            */
/* ------------------------------------------------------------------ */
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const CENTERS = [14, 104, 195, 287];
const smooth = (x) => x * x * (3 - 2 * x);
export function seasonWeights(doy) {
  const w = { winter: 0, spring: 0, summer: 0, autumn: 0 };
  for (let i = 0; i < 4; i++) {
    const a = CENTERS[i], b = i === 3 ? CENTERS[0] + 365 : CENTERS[i + 1];
    let d = doy; if (i === 3 && d < a) d += 365;
    if (d >= a && d < b) { const f = smooth((d - a) / (b - a)); w[SEASONS[i]] = 1 - f; w[SEASONS[(i + 1) % 4]] = f; return w; }
  }
  w.winter = 1; return w;
}
const dominant = (w) => SEASONS.reduce((best, s) => (w[s] > w[best] ? s : best), 'winter');
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixA = (w, pal) => { const c = [0, 0, 0]; for (const s of SEASONS) { const v = hex(pal[s]); for (let i = 0; i < 3; i++) c[i] += v[i] * w[s]; } return c; };
const mixW = (w, pal) => `rgb(${mixA(w, pal).map(Math.round).join(',')})`;
const SKY_T = { winter: '#d9e5f5', spring: '#d6ecfa', summer: '#c4e4fa', autumn: '#f6e7d2' };
const SKY_B = { winter: '#f6f7fb', spring: '#f3fbf1', summer: '#fff8df', autumn: '#fcf5ea' };
const HILL = { winter: '#e1e4f1', spring: '#cfe7c6', summer: '#bfe2ae', autumn: '#eedcc2' };
const GRASS = { winter: '#86a85a', spring: '#5cbf4a', summer: '#3fae3f', autumn: '#8aa83a' };

/* ------------------------------------------------------------------ */
/*  Tiny pixel helpers                                                 */
/* ------------------------------------------------------------------ */
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
const h2 = (x, y) => rnd(x * 374761 + y * 668265);
function layer(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  return { c, g };
}
const px = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
function line(g, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  g.fillStyle = col;
  for (;;) { g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}
function disc(g, cx, cy, r, col) { for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); px(g, cx - w, cy + y, w * 2 + 1, 1, col); } }
/** Leafy blob: light top-left, dark bottom-right, ragged edge. */
function blob(g, cx, cy, rx, ry, [light, mid, dark], seed, extra) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2;
    if (d > 1 - 0.32 * h2(x + seed, y - seed)) continue;
    const s = x + y;
    let col = s < -rx * 0.45 ? light : s > rx * 0.55 ? dark : mid;
    if (extra && h2(x * 3 + seed, y * 7) > 0.93) col = extra;
    px(g, cx + x, cy + y, 1, 1, col);
  }
}

/* ------------------------------------------------------------------ */
/*  Sprites (drawn with primitives so colours and direction can vary)  */
/* ------------------------------------------------------------------ */
const K = '#2b2118';
const CHEST = {
  wood:   { box: '#a8642c', hi: '#c98d4e', lo: '#7a4b2a', band: '#4a2e1a', lock: '#ffd23f', lockD: '#c26a0e' },
  silver: { box: '#a9b3c1', hi: '#dfe4eb', lo: '#7b8494', band: '#555e6d', lock: '#ffd23f', lockD: '#c26a0e' },
  gold:   { box: '#f2a516', hi: '#ffe066', lo: '#c26a0e', band: '#8a4b0c', lock: '#fff3a8', lockD: '#b45309' },
};
function chest(g, x, y, skin) {
  const c = CHEST[skin] || CHEST.wood;
  px(g, x + 1, y, 16, 1, K); px(g, x, y + 1, 18, 12, K);           // outline 18×13
  px(g, x + 1, y + 1, 16, 4, c.box); px(g, x + 2, y + 1, 14, 1, c.hi); // lid
  px(g, x + 1, y + 5, 16, 1, K);
  px(g, x + 1, y + 6, 16, 6, c.box); px(g, x + 1, y + 11, 16, 1, c.lo);
  px(g, x + 1, y + 6, 16, 1, c.hi);
  if (skin === 'wood') { px(g, x + 1, y + 8, 16, 1, c.lo); px(g, x + 1, y + 3, 16, 1, c.lo); }
  for (const bx of [3, 13]) { px(g, x + bx, y + 1, 2, 11, c.band); }
  px(g, x + 7, y + 4, 4, 5, c.lockD); px(g, x + 8, y + 4, 2, 4, c.lock); px(g, x + 8, y + 6, 2, 1, K);
  if (skin !== 'wood') { px(g, x + 1, y + 1, 1, 1, c.hi); px(g, x + 16, y + 1, 1, 1, c.hi); }
}

function alcove(g, cx) {
  const top = LEDGE_Y - 22;
  for (let y = top; y < LEDGE_Y; y++) {
    const dy = y - top;
    const half = dy < 7 ? Math.round(Math.sqrt(49 - (7 - dy) ** 2) * 13 / 7) : 13;
    px(g, cx - half - 1, y, half * 2 + 3, 1, '#5e3b22');
    px(g, cx - half, y, half * 2 + 1, 1, dy < 3 ? '#3a2416' : '#2e1c12');
  }
  for (let i = -15; i < 15; i += 6) { px(g, cx + i, LEDGE_Y, 6, 4, '#6b7585'); px(g, cx + i + 1, LEDGE_Y, 4, 3, '#9aa5b4'); px(g, cx + i + 1, LEDGE_Y, 4, 1, '#c3ccd8'); }
}

function crate(g, x, y) {
  px(g, x, y, 10, 7, '#5a3a22'); px(g, x + 1, y + 1, 8, 5, '#a8642c'); px(g, x + 1, y + 1, 8, 1, '#c98d4e');
  line(g, x + 1, y + 5, x + 8, y + 1, '#7a4b2a');
}

function cart(g, x, y, full) {
  px(g, x, y, 20, 9, '#3d4452'); px(g, x + 1, y + 1, 18, 7, '#6b7686'); px(g, x + 1, y + 1, 18, 1, '#9aa5b4');
  px(g, x + 4, y + 2, 1, 5, '#555e6d'); px(g, x + 15, y + 2, 1, 5, '#555e6d');
  for (const wx of [4, 14]) { disc(g, x + wx, y + 10, 2, '#2b2118'); px(g, x + wx, y + 10, 1, 1, '#9aa5b4'); }
  if (full) {
    for (let i = 0; i < 18; i++) { const hh = Math.round(3 - Math.abs(i - 9) / 3.5 + h2(i, 3)); px(g, x + 1 + i, y + 1 - hh, 1, hh, i % 3 ? '#ffd23f' : '#f2a516'); }
    px(g, x + 7, y - 3, 1, 1, '#fff3a8'); px(g, x + 12, y - 2, 1, 1, '#fff3a8');
  }
}

/** Blocky miner. (x,y) = top-left of a 12×16 box; dir 1 faces right. */
function miner(g, x, y, o) {
  const { pose = 'dig', frame = 0, shirt = '#3f7ad9', shirtD = '#2c5bab', chief = false, dir = 1 } = o;
  const W = 12;
  const P = (dx, dy, w, h, col) => px(g, dir > 0 ? x + dx : x + W - dx - w, y + dy, w, h, col);
  const L = (ax, ay, bx, by, col) => line(g, dir > 0 ? x + ax : x + W - 1 - ax, y + ay, dir > 0 ? x + bx : x + W - 1 - bx, y + by, col);
  const helmet = chief ? '#ffd23f' : '#f2b62c', helmetD = chief ? '#c26a0e' : '#c98a12';
  const sitting = pose === 'sit' || pose === 'nap';
  const oy = sitting ? 3 : 0;
  const closed = pose === 'nap';
  // helmet
  P(3, oy, 5, 1, helmetD); P(2, oy + 1, 7, 1, helmet); P(9, oy + 1, 1, 2, '#fff3a8'); P(1, oy + 2, 9, 1, helmetD);
  if (chief) { P(5, oy - 1, 1, 1, '#ffd23f'); P(3, oy + 1, 1, 1, '#fff3a8'); }
  // head
  P(2, oy + 3, 7, 4, '#f1c7a0'); P(2, oy + 3, 2, 3, '#5a3a22'); P(8, oy + 6, 1, 1, '#d99a6c');
  if (closed) P(6, oy + 4, 2, 1, '#7a5a44'); else { P(7, oy + 4, 1, 1, '#2b3a55'); }
  P(6, oy + 6, 2, 1, closed ? '#d99a6c' : '#b86a50');
  // body
  P(2, oy + 7, 7, 4, shirt); P(2, oy + 10, 7, 1, shirtD); P(2, oy + 11, 7, 1, '#4a3628'); P(5, oy + 11, 1, 1, '#ffd23f');
  if (chief) P(6, oy + 8, 1, 1, '#ffd23f');
  // legs
  if (sitting) { P(5, oy + 12, 6, 2, '#3b4a8c'); P(9, oy + 12, 2, 4 - oy + 3, '#2a3566'); P(9, 15 + 0, 3, 1, '#4a3628'); }
  else { P(2, 12, 3, 3, '#3b4a8c'); P(6, 12, 3, 3, '#2a3566'); P(1, 15, 4, 1, '#4a3628'); P(6, 15, 4, 1, '#4a3628'); }
  // back arm
  if (pose !== 'nap') { P(1, oy + 7, 1, 4, shirtD); P(1, oy + 11, 1, 1, '#f1c7a0'); }

  const hand = (hx, hy) => { L(7, oy + 8, hx, hy, shirt); P(dir > 0 ? hx : hx, hy, 1, 1, '#f1c7a0'); };
  switch (pose) {
    case 'dig': {
      // frames: 0 raised, 1 mid, 2 strike
      const k = [[[8, 5], [4, -3]], [[10, 7], [15, 4]], [[10, 9], [15, 13]]][frame % 3];
      const [[hx, hy], [ex, ey]] = k;
      L(hx, hy, ex, ey, '#8b5a2b'); hand(hx, hy);
      if (frame % 3 === 0) { L(ex - 3, ey + 1, ex + 3, ey - 1, '#9aa5b4'); P(ex - 3, ey + 1, 1, 1, '#6b7686'); }
      else if (frame % 3 === 1) { L(ex, ey - 3, ex, ey + 3, '#9aa5b4'); P(ex, ey + 3, 1, 1, '#6b7686'); }
      else { L(ex - 2, ey - 2, ex + 2, ey + 2, '#9aa5b4'); P(ex + 2, ey + 2, 1, 1, '#6b7686'); }
      break;
    }
    case 'load': {
      const up = frame % 2 === 1;
      const [hx, hy, ex, ey] = up ? [9, 6, 15, 1] : [9, 9, 15, 14];
      L(hx, hy, ex, ey, '#8b5a2b'); hand(hx, hy);
      P(ex - 1, ey - (up ? 1 : 0), 3, 2, '#9aa5b4');
      if (up) { P(ex - 1, ey - 2, 2, 1, '#ffd23f'); }
      break;
    }
    case 'wave': {
      L(11, 0, 11, 15, '#8b5a2b'); P(10, 14, 3, 2, '#9aa5b4');           // shovel planted
      const hy = frame % 2 ? 1 : 3;
      L(7, 8, 9, hy + 1, shirt); P(9, hy, 2, 2, '#f1c7a0');
      break;
    }
    case 'sit': {
      L(7, oy + 9, 7, oy + 7, shirt); P(7, oy + 6, 1, 1, '#f1c7a0');      // chin on hand
      break;
    }
    case 'nap': {
      P(3, oy + 8, 6, 1, shirtD); P(3, oy + 8, 1, 1, '#f1c7a0'); P(8, oy + 8, 1, 1, '#f1c7a0'); // arms crossed
      break;
    }
    default: break;
  }
}

function hangingHelmet(g, x, y) {
  px(g, x + 3, y - 3, 1, 3, '#8b7355');
  px(g, x + 1, y, 5, 1, '#c98a12'); px(g, x, y + 1, 7, 1, '#f2b62c'); px(g, x - 1, y + 2, 9, 1, '#c98a12'); px(g, x + 6, y + 1, 1, 1, '#fff3a8');
}

/* landscape pieces */
function autumnTree(g, x, seed) {
  const top = GROUND - 26 - Math.round(rnd(seed) * 6);
  px(g, x - 1, top + 12, 3, GROUND - top - 11, '#6b4226'); px(g, x - 1, top + 12, 1, GROUND - top - 11, '#8a5a34');
  line(g, x, top + 16, x - 6, top + 10, '#6b4226'); line(g, x, top + 18, x + 6, top + 12, '#6b4226');
  const pal = ['#ffc145', '#f29a2e', '#c9661c'];
  blob(g, x - 6, top + 9, 7, 5, pal, seed); blob(g, x + 6, top + 9, 7, 5, pal, seed + 3); blob(g, x, top + 4, 9, 6, pal, seed + 7, '#ffe08a');
  for (let i = 0; i < 6; i++) px(g, x - 8 + Math.round(rnd(seed + i) * 16), GROUND - 1, 2, 1, i % 2 ? '#f29a2e' : '#ffc145');
  return { x, y: top + 6 };
}
function bush(g, x, pal, seed, extra) { blob(g, x, GROUND - 3, 5, 3, pal, seed, extra); }
function pine(g, x, seed, snowy) {
  const hgt = 20 + Math.round(rnd(seed) * 6);
  px(g, x - 1, GROUND - 4, 2, 4, '#6b4226');
  for (let i = 0; i < 4; i++) {
    const ty = GROUND - hgt + i * 5, w = 3 + i * 2;
    for (let r = 0; r < 6; r++) {
      const ww = Math.round(w * r / 5);
      px(g, x - ww, ty + r, ww * 2 + 1, 1, r < 2 ? '#3f8f5a' : '#2d6b45');
      if (snowy && r < 2) px(g, x - ww, ty + r, ww * 2 + 1, 1, '#f4f7fb');
    }
  }
  if (snowy) px(g, x - 1, GROUND - hgt - 1, 2, 1, '#ffffff');
}
function bareTree(g, x, seed) {
  const top = GROUND - 18 - Math.round(rnd(seed) * 5);
  line(g, x, GROUND, x, top + 4, '#a99fc0');
  for (let i = 0; i < 5; i++) {
    const by = top + 4 + i * 3, len = 6 - i;
    line(g, x, by + 2, x - len, by - 1, '#b8afd0'); line(g, x, by + 3, x + len, by, '#b8afd0');
    px(g, x - len, by - 1, 1, 1, '#ffffff'); px(g, x + len, by, 1, 1, '#ffffff');
  }
}
function snowman(g, x) {
  disc(g, x, GROUND - 5, 5, '#c9d2de'); disc(g, x, GROUND - 6, 5, '#ffffff');
  disc(g, x, GROUND - 14, 4, '#c9d2de'); disc(g, x, GROUND - 15, 4, '#ffffff');
  px(g, x - 4, GROUND - 19, 9, 1, '#2b2118'); px(g, x - 2, GROUND - 24, 5, 5, '#2b2118'); px(g, x - 2, GROUND - 20, 5, 1, '#d94141');
  px(g, x - 2, GROUND - 16, 1, 1, '#2b2118'); px(g, x + 1, GROUND - 16, 1, 1, '#2b2118'); px(g, x + 1, GROUND - 15, 3, 1, '#f2862e');
  px(g, x - 4, GROUND - 11, 9, 2, '#d94141'); px(g, x + 2, GROUND - 11, 2, 5, '#a32b2b');
  line(g, x - 5, GROUND - 9, x - 10, GROUND - 14, '#6b4226'); line(g, x + 5, GROUND - 9, x + 10, GROUND - 13, '#6b4226');
  px(g, x, GROUND - 7, 1, 1, '#2b2118'); px(g, x, GROUND - 4, 1, 1, '#2b2118');
}
function sun(g, x, y) {
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(g, x + Math.cos(a) * 8, y + Math.sin(a) * 8, x + Math.cos(a) * 11, y + Math.sin(a) * 11, '#ffc145'); }
  disc(g, x, y, 6, '#f2a516'); disc(g, x - 1, y - 1, 5, '#ffd23f'); px(g, x - 3, y - 3, 2, 1, '#fff3a8');
}
function vault(g, winterW) {
  const x0 = TX - 17, top = GROUND - 30;
  px(g, x0 - 2, top, 38, 3, '#7b8494'); px(g, x0 - 2, top, 38, 1, '#c3ccd8');
  px(g, x0, top + 3, 34, GROUND - top - 3, '#8f99a7');
  for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) {
    const bx = x0 + c * 6 - (r % 2 ? 3 : 0), by = top + 3 + r * 4;
    if (bx + 6 <= x0 || bx >= x0 + 34) continue;
    const xa = Math.max(bx, x0), xb = Math.min(bx + 6, x0 + 34);
    px(g, xa, by, xb - xa - 1, 3, h2(r, c) > 0.5 ? '#a9b2bf' : '#9aa4b2'); px(g, xa, by, xb - xa - 1, 1, '#bcc4cf');
  }
  // door rim + face (spokes are animated)
  disc(g, TX, GROUND - 12, 11, '#2b2118'); disc(g, TX, GROUND - 12, 10, '#c26a0e'); disc(g, TX, GROUND - 12, 9, '#f2a516'); disc(g, TX - 1, GROUND - 13, 7, '#ffcf3d');
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; px(g, TX + Math.round(Math.cos(a) * 9.5), GROUND - 12 + Math.round(Math.sin(a) * 9.5), 1, 1, '#fff3a8'); }
  px(g, x0, GROUND - 1, 34, 1, '#6b7585');
  if (winterW > 0.4) {
    px(g, x0 - 3, top - 2, 40, 2, '#ffffff'); px(g, x0 - 3, top - 3, 36, 1, '#f4f7fb');
    for (let i = 0; i < 7; i++) px(g, x0 - 1 + i * 6, top + 1, 2, 1 + Math.round(h2(i, 9) * 2), '#ffffff');
  }
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
const SHIRTS = [['#3f7ad9', '#2c5bab'], ['#e86fa8', '#b84f80'], ['#7c5cd6', '#5a3fa8']];

export function createMine(container) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'mine-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'mine-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-labelledby', 'sceneTitle sceneDesc');
  const labels = document.createElement('div');
  labels.className = 'mine-labels';
  labels.setAttribute('aria-hidden', 'true');
  wrap.append(canvas, labels);
  container.append(wrap);
  const g = canvas.getContext('2d');

  let L = null;                // layout + static layers
  let sig = '';
  let running = false, visible = true, lastDraw = 0;
  let deliveryAt = null;       // time (performance clock) the coin lands in the vault
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const snow = [], leaves = [], debris = [];

  function build(o) {
    const { now, tz, chests, unlocked, miningActive, restPoses, hasDeposits, viewportWidth } = o;
    const lastDays = chests.length ? (chests[chests.length - 1].at - now) / DAY : 0;
    const horizon = Math.max(100, Math.ceil(lastDays) + 20);
    const vwArt = Math.floor(viewportWidth / S);
    const ppd = Math.max(1.9, (vwArt - TX - 22) / horizon);
    const W = Math.max(vwArt, Math.ceil(TX + horizon * ppd + 22));
    const xOf = (ms) => Math.round(TX + ((ms - now) / DAY) * ppd);
    const wAt = (x) => seasonWeights(dayOfYear(now + ((x - TX) / ppd) * DAY, tz));
    const galEnd = Math.min(TX + 150, W - 30);

    canvas.width = W; canvas.height = H;
    canvas.style.width = W * S + 'px'; canvas.style.height = H * S + 'px';
    wrap.style.width = W * S + 'px'; wrap.style.height = H * S + 'px';
    g.imageSmoothingEnabled = false;

    /* back layer: sky + distant hills */
    const back = layer(W, H);
    const bands = 7;
    for (let x = 0; x < W; x++) {
      const w = wAt(x);
      const top = mixA(w, SKY_T), bot = mixA(w, SKY_B);
      for (let b = 0; b < bands; b++) {
        const f = b / (bands - 1);
        px(back.g, x, Math.floor(b * GROUND / bands), 1, Math.ceil(GROUND / bands) + 1, `rgb(${top.map((v, i) => Math.round(v + (bot[i] - v) * f)).join(',')})`);
      }
      const hh = 5 + Math.round(3 * Math.sin(x / 9) + 2 * Math.sin(x / 4.3 + 1) + h2(x, 1));
      px(back.g, x, GROUND - hh, 1, hh, mixW(w, HILL));
    }
    for (let x = 6; x < W; x += 13) if (h2(x, 2) > 0.55) { // far bushes on the horizon
      const w = wAt(x); const s = dominant(w);
      const col = s === 'winter' ? '#d3d0e6' : s === 'autumn' ? '#ebcfa6' : s === 'spring' ? '#bcdfb0' : '#a9d897';
      blob(back.g, x, GROUND - 5, 4, 3, [col, col, col], x);
    }

    /* front layer */
    const front = layer(W, H);
    const fg = front.g;
    // dirt + cobblestones
    px(fg, 0, GROUND + 2, W, H - GROUND - 2, '#7d4c2d');
    for (let row = 0, y = GROUND + 4; y < H; row++, y += 7) {
      for (let x = -((row * 5) % 11); x < W; x += 9 + Math.round(h2(row, x) * 4)) {
        const w = 7 + Math.round(h2(x, row) * 4), hgt = 5 + Math.round(h2(row, x + 1) * 2);
        px(fg, x + 1, y, w - 2, 1, '#5e3820'); px(fg, x, y + 1, w, hgt - 2, '#5e3820'); px(fg, x + 1, y + hgt - 1, w - 2, 1, '#5e3820');
        px(fg, x + 1, y + 1, w - 2, hgt - 2, h2(x, y) > 0.5 ? '#94603a' : '#8a5634');
        px(fg, x + 1, y + 1, w - 3, 1, '#a8703f');
      }
    }
    // grass / snow edge
    for (let x = 0; x < W; x++) {
      const w = wAt(x);
      px(fg, x, GROUND, 1, 3, mixW(w, GRASS)); px(fg, x, GROUND + 2, 1, 1, '#4f6b2a');
      if (h2(x, 5) > 0.6) px(fg, x, GROUND - 1, 1, 1, mixW(w, GRASS));
      const snowy = w.winter > 0.42 || (w.winter > 0.28 && h2(x, 6) > 0.5);
      if (snowy) { px(fg, x, GROUND - 1, 1, 3, '#f4f7fb'); if (h2(x, 7) > 0.7) px(fg, x, GROUND - 2, 1, 1, '#ffffff'); px(fg, x, GROUND + 2, 1, 1, '#c9d2de'); }
    }
    // landscape decorations
    const trees = [];
    const spans = [];
    let prev = null, start = 0;
    for (let x = 0; x <= W; x += 2) { const d = dominant(wAt(x)); if (d !== prev) { if (prev) spans.push({ s: prev, x0: start, x1: x }); prev = d; start = x; } }
    spans.push({ s: prev, x0: start, x1: W });
    for (const sp of spans) {
      if (sp.s === 'summer' && sp.x1 - sp.x0 > 30) sun(back.g, Math.min(Math.max((sp.x0 + sp.x1) / 2, sp.x0 + 14), W - 14), 16);
    }
    for (let i = 0, x = TX + 26; x < W - 6; i++, x += 14 + Math.round(rnd(i) * 10)) {
      const w = wAt(x);
      // pick among the seasons that are really present here, so the change stays gradual
      const present = SEASONS.filter((sn) => w[sn] > 0.22);
      const tot = present.reduce((a, sn) => a + w[sn], 0);
      let r = rnd(i * 7 + 1) * tot, s = present[0];
      for (const sn of present) { if (r < w[sn]) { s = sn; break; } r -= w[sn]; }
      const k = rnd(i * 5 + 2);
      if (s === 'autumn') { if (k < 0.45) trees.push(autumnTree(fg, x, i)); else bush(fg, x, ['#ffc145', '#f29a2e', '#c9661c'], i); }
      else if (s === 'winter') { if (k < 0.5) pine(fg, x, i, true); else if (k < 0.8) bareTree(fg, x, i); else bush(fg, x, ['#ffffff', '#e8edf4', '#c9d2de'], i); }
      else if (s === 'spring') { if (k < 0.5) blob(fg, x, GROUND - 12, 8, 7, ['#9ad67a', '#6dbb55', '#4a9a3e'], i, '#f7a8c8'), px(fg, x - 1, GROUND - 6, 2, 6, '#6b4226'); else for (let f = 0; f < 4; f++) px(fg, x - 4 + f * 3, GROUND - 1, 1, 1, ['#f472b6', '#fcd34d', '#a78bfa', '#ffffff'][f]); }
      else { if (k < 0.55) { px(fg, x - 1, GROUND - 6, 2, 6, '#6b4226'); blob(fg, x, GROUND - 13, 8, 7, ['#7fd05e', '#4fb043', '#2f8a35'], i); } else bush(fg, x, ['#7fd05e', '#4fb043', '#2f8a35'], i); }
    }
    for (const sp of spans) if (sp.s === 'winter' && sp.x1 - sp.x0 > 30) snowman(fg, Math.round(Math.min(Math.max((sp.x0 + sp.x1) / 2, sp.x0 + 12), W - 12)));
    // vault on the surface above the shaft
    vault(fg, wAt(TX).winter);

    // timeline line + month ticks + markers
    px(fg, TX, AXIS_Y, W - TX - 4, 1, '#f5e6c8'); px(fg, TX, AXIS_Y + 1, W - TX - 4, 1, '#b98a5a');
    const p0 = wallParts(now, tz);
    for (let k = 1; k <= 14; k++) {
      const x = xOf(addMonths(wallToInstant(p0.y, p0.m, 1, 0, 0, 0, 0, tz), k, tz));
      if (x > W - 6) break;
      px(fg, x, AXIS_Y - 1, 1, 3, '#e8d2a8');
    }
    const marker = (x) => { disc(fg, x, AXIS_Y, 3, '#6e4026'); disc(fg, x, AXIS_Y, 2, '#ffffff'); };

    // gallery
    px(fg, 4, GAL_TOP - 2, galEnd - 4, FLOOR - GAL_TOP + 8, '#5e3b22');
    px(fg, 5, GAL_TOP - 1, galEnd - 6, FLOOR - GAL_TOP + 6, '#3a2416');
    px(fg, 5, GAL_TOP + 6, galEnd - 6, FLOOR - GAL_TOP - 4, '#4a2e1a');
    px(fg, 5, FLOOR + 2, galEnd - 6, 3, '#2e1c12');
    px(fg, 4, GAL_TOP, galEnd - 4, 3, '#8b5a2b'); px(fg, 4, GAL_TOP, galEnd - 4, 1, '#b07a44');
    const lanterns = [];
    for (let x = SH1 + 22; x < galEnd - 20; x += 40) {
      px(fg, x, GAL_TOP + 3, 3, FLOOR - GAL_TOP - 3, '#8b5a2b'); px(fg, x, GAL_TOP + 3, 1, FLOOR - GAL_TOP - 3, '#b07a44');
      line(fg, x - 6, GAL_TOP + 3, x, GAL_TOP + 9, '#7a4b2a'); line(fg, x + 9, GAL_TOP + 3, x + 3, GAL_TOP + 9, '#7a4b2a');
      const lx = x + 12; lanterns.push({ x: lx + 1, y: GAL_TOP + 10 });
      px(fg, lx + 1, GAL_TOP + 3, 1, 4, '#3d4452'); px(fg, lx - 1, GAL_TOP + 7, 5, 6, '#2b2118'); px(fg, lx, GAL_TOP + 8, 3, 4, '#ffcf3d'); px(fg, lx, GAL_TOP + 8, 3, 1, '#fff3a8');
    }
    px(fg, 5, FLOOR, galEnd - 6, 1, '#9aa5b4'); px(fg, 5, FLOOR + 1, galEnd - 6, 1, '#555e6d');
    for (let x = 7; x < galEnd - 4; x += 6) px(fg, x, FLOOR + 2, 4, 2, '#7a4b2a');

    // ore wall (right side) + ore boulder inside the gallery
    const sparkles = [];
    const rock = (cx, cy, r, seed) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = (x * x) / (r * r) + (y * y) / (r * r * 0.7);
        if (d > 1 - 0.18 * h2(x + seed, y)) continue;
        const edge = d > 0.72;
        px(fg, cx + x, cy + y, 1, 1, edge ? '#3b2a1e' : x + y < -r * 0.5 ? '#9a8574' : x + y > r * 0.4 ? '#6a5649' : '#7f6b5c');
      }
      const n = 1 + Math.floor(h2(seed, 4) * 3);
      for (let i = 0; i < n; i++) {
        const gx = cx + Math.round((h2(seed, i) - 0.5) * r), gy = cy + Math.round((h2(i, seed) - 0.5) * r * 0.8);
        px(fg, gx, gy, 2, 2, '#ffd23f'); px(fg, gx, gy + 1, 1, 1, '#c26a0e'); px(fg, gx + 1, gy, 1, 1, '#fff3a8');
        sparkles.push({ x: gx, y: gy, ph: h2(gx, gy) * 6 });
      }
      if (h2(seed, 9) > 0.6) { const vx = cx - 3, vy = cy + 1; line(fg, vx, vy, vx + 5, vy - 3, '#ffd23f'); line(fg, vx + 5, vy - 3, vx + 7, vy - 2, '#f2a516'); }
    };
    for (let y = GAL_TOP - 8, row = 0; y < H + 6; y += 8, row++) {
      for (let x = galEnd - 6 + (row % 2) * 5; x < W + 8; x += 10) rock(x + Math.round(h2(x, y) * 3), y, 5 + Math.round(h2(y, x) * 3), x * 31 + y);
    }
    const oreX = galEnd - 52;
    rock(oreX, FLOOR - 5, 7, 99); rock(oreX + 8, FLOOR - 4, 5, 98);

    // shaft (from the vault down to the gallery floor)
    px(fg, SH0, GROUND + 1, SH1 - SH0 + 1, FLOOR - GROUND + 2, '#1f140c');
    px(fg, SH0 - 2, GROUND + 1, 2, FLOOR - GROUND + 2, '#8b5a2b'); px(fg, SH1 + 1, GROUND + 1, 2, FLOOR - GROUND + 2, '#8b5a2b');
    for (let y = GROUND + 8; y < FLOOR; y += 12) { px(fg, SH0 - 2, y, SH1 - SH0 + 5, 2, '#7a4b2a'); px(fg, SH0 - 2, y, SH1 - SH0 + 5, 1, '#a8703f'); }

    // Groszaki: positions and crates
    const slots = [];
    const slotDefs = miningActive
      ? [{ x: galEnd - 17, pose: 'dig', dir: 1 }, { x: SH1 + 25, pose: 'load', dir: -1 }, { x: oreX - 18, pose: 'dig', dir: 1 }]
      : [{ x: SH1 + 30, dir: 1 }, { x: SH1 + 46, dir: -1 }, { x: SH1 + 64, dir: 1 }];
    for (let i = 0; i < 3; i++) {
      const visibleSlot = i < unlocked || (i === 0 && !hasDeposits);
      if (!visibleSlot) { hangingHelmet(fg, SH1 + 82 + i * 12, GAL_TOP + 14); continue; }
      const d = slotDefs[i];
      const pose = !hasDeposits ? 'nap' : miningActive ? d.pose : restPoses[i];
      if (pose === 'sit' || pose === 'nap') crate(fg, d.x + (d.dir > 0 ? 0 : 2), FLOOR - 7);
      slots.push({ i, x: d.x, y: FLOOR - 16 - (pose === 'sit' || pose === 'nap' ? 5 : 0), pose, dir: d.dir, chief: i === 2 });
    }
    cart(fg, SH1 + 3, FLOOR - 11, miningActive);

    // chests in alcoves, each right under its date
    const chestPos = [];
    let lastX = -999;
    chests.forEach((c) => {
      let x = xOf(c.at);
      x = Math.max(x, TX + 14);
      const tooClose = x - lastX < 30;
      lastX = x;
      alcove(fg, x);
      chest(fg, x - 9, LEDGE_Y - 13, c.skin);
      line(fg, x, AXIS_Y + 3, x, LEDGE_Y - 23, 'rgba(255,240,210,.35)');
      marker(x);
      chestPos.push({ x, c, tooClose });
    });
    marker(TX);

    // falling particles depend on season columns
    snow.length = 0; leaves.length = 0;
    const winterCols = [];
    for (let x = 0; x < W; x += 2) if (wAt(x).winter > 0.45) winterCols.push(x);
    for (let i = 0; i < Math.min(60, winterCols.length / 2); i++) snow.push({ x: winterCols[Math.floor(rnd(i) * winterCols.length)], y: rnd(i + 50) * GROUND, v: 2 + rnd(i + 9) * 3 });
    trees.forEach((tr, i) => { for (let k = 0; k < 2; k++) leaves.push({ x0: tr.x - 6 + k * 8, y0: tr.y, t: rnd(i * 3 + k) * 5, col: k ? '#f29a2e' : '#ffc145' }); });

    L = { W, back: back.c, front: front.c, slots, lanterns, sparkles, galEnd, oreX, miningActive, hasDeposits };

    // HTML labels (crisp text above the pixels)
    const pill = (x, y, html, cls = '') => `<span class="mine-pill ${cls}" style="left:${x * S}px;top:${y * S}px">${html}</span>`;
    let lbl = pill(TX, AXIS_Y + 4, t('scene.today'), 'mine-pill-today');
    chestPos.forEach(({ x, c }, i) => {
      lbl += pill(x, AXIS_Y + 4 + (i && chestPos[i - 1].x > x - 22 ? 7 : 0), fmtDate(c.at, tz, 'short'));
      lbl += pill(x, LEDGE_Y + 5, money(c.amount, { sign: true }), 'mine-pill-amt');
    });
    if (!hasDeposits) lbl += pill(SH1 + 44, GAL_TOP + 10, t('kid.wakeHint'), 'mine-pill-hint');
    labels.innerHTML = lbl;
  }

  /* ---------------- per-frame drawing ---------------- */
  function draw(now) {
    if (!L) return;
    const T = now / 1000;
    g.drawImage(L.back, 0, 0);
    // clouds drift slowly
    for (let i = 0; i < Math.ceil(L.W / 70); i++) {
      const cx = ((i * 70 + rnd(i) * 40 + T * (1.2 + rnd(i + 3))) % (L.W + 40)) - 20, cy = 6 + rnd(i + 7) * 16;
      px(g, cx, cy, 14, 3, '#ffffff'); px(g, cx + 3, cy - 2, 7, 2, '#ffffff'); px(g, cx + 1, cy + 3, 12, 1, '#e8e4f0');
    }
    g.drawImage(L.front, 0, 0);

    // snow and falling leaves
    for (const f of snow) { const y = (f.y + T * f.v * 3) % GROUND; px(g, f.x + Math.round(Math.sin(T + f.y) * 1.5), y, 1, 1, '#ffffff'); }
    for (const l of leaves) { const p = ((T + l.t) % 5) / 5; px(g, l.x0 + p * 10 + Math.sin(p * 9) * 2, l.y0 + p * (GROUND - l.y0), 1, 1, l.col); }

    // lantern glow (flicker)
    for (const ln of L.lanterns) {
      const a = 0.10 + 0.05 * Math.sin(T * 7 + ln.x);
      g.globalAlpha = a; disc(g, ln.x, ln.y, 12, '#ffcf3d'); g.globalAlpha = a * 1.6; disc(g, ln.x, ln.y, 6, '#ffe08a'); g.globalAlpha = 1;
    }
    // ore sparkles
    for (const s of L.sparkles) {
      const v = Math.sin(T * 2.2 + s.ph);
      if (v > 0.85) { px(g, s.x, s.y - 1, 1, 3, '#fffbe0'); px(g, s.x - 1, s.y, 3, 1, '#fffbe0'); }
    }

    // vault door wheel (spins while a delivery arrives)
    let spin = 0;
    if (deliveryAt) { const dt = now - deliveryAt; if (dt > -400 && dt < 700) spin = (dt + 400) / 1100 * Math.PI; }
    disc(g, TX, GROUND - 12, 3, '#c26a0e');
    for (let i = 0; i < 6; i++) { const a = spin + i * Math.PI / 3; line(g, TX + Math.cos(a) * 3, GROUND - 12 + Math.sin(a) * 3, TX + Math.cos(a) * 6, GROUND - 12 + Math.sin(a) * 6, '#9c5a12'); px(g, TX + Math.round(Math.cos(a) * 6), GROUND - 12 + Math.round(Math.sin(a) * 6), 1, 1, '#fff3a8'); }
    px(g, TX, GROUND - 12, 1, 1, '#fff3a8');

    // lift in the shaft
    const bottom = FLOOR - 9, top = GROUND + 3;
    let ly = bottom, loaded = L.miningActive, coins = null;
    if (deliveryAt) {
      const dt = now - deliveryAt;
      if (dt < -2800) ly = bottom;
      else if (dt < -600) { ly = bottom + (top - bottom) * smooth((dt + 2800) / 2200); loaded = true; }
      else if (dt < 300) { ly = top; loaded = dt < -100; if (dt > -600 && dt < 0) coins = (dt + 600) / 600; }
      else if (dt < 2600) { ly = top + (bottom - top) * smooth((dt - 300) / 2300); loaded = false; }
      else { deliveryAt = null; }
    }
    line(g, TX, GROUND + 1, TX, ly, '#8b7355');
    px(g, SH0 + 1, ly, SH1 - SH0 - 1, 7, '#5a3a22'); px(g, SH0 + 2, ly + 1, SH1 - SH0 - 3, 5, '#a8642c'); px(g, SH0 + 2, ly + 1, SH1 - SH0 - 3, 1, '#c98d4e');
    if (loaded) for (let i = 0; i < SH1 - SH0 - 3; i++) px(g, SH0 + 2 + i, ly - 1 - (i % 3 === 1 ? 1 : 0), 1, 1 + (i % 3 === 1 ? 1 : 0), i % 2 ? '#ffd23f' : '#f2a516');
    if (coins != null) for (let k = 0; k < 3; k++) {
      const p = Math.min(1, Math.max(0, coins * 1.3 - k * 0.15));
      const cx = TX - 3 + k * 3, cy = ly - 2 - Math.sin(p * Math.PI) * 6 - p * (ly - (GROUND - 12));
      px(g, cx, cy, 2, 2, '#ffd23f'); px(g, cx, cy, 1, 1, '#fff3a8');
    }
    if (L.miningActive) for (let i = 0; i < 6; i++) { // gold dust rising in the shaft
      const p = ((T * 0.35 + i / 6) % 1);
      px(g, SH0 + 2 + Math.round(rnd(i) * (SH1 - SH0 - 4)), bottom - p * (bottom - top), 1, 1, p > 0.8 ? '#fff3a8' : '#ffd23f');
    }

    // Groszaki
    for (const s of L.slots) {
      const [shirt, shirtD] = SHIRTS[s.i];
      let frame = 0;
      if (s.pose === 'dig') { const c = ((T * 1000 + s.i * 330) % 900) / 900; frame = c < 0.45 ? 0 : c < 0.55 ? 1 : c < 0.75 ? 2 : 1;
        if (frame === 2 && c < 0.6 && debris.length < 30) { const hx = s.x + (s.dir > 0 ? 16 : -4); for (let k = 0; k < 2; k++) debris.push({ x: hx, y: FLOOR - 4, vx: (Math.random() * 2 - 0.4) * s.dir * -1, vy: -Math.random() * 3 - 1, life: 1 }); } }
      else if (s.pose === 'load') frame = Math.floor((T * 1000 + 200) / 800) % 2;
      else if (s.pose === 'wave') frame = Math.floor(T * 2.4) % 2;
      miner(g, s.x, s.y, { pose: s.pose, frame, shirt, shirtD, chief: s.chief, dir: s.dir });
      if (s.pose === 'nap') for (let k = 0; k < 3; k++) {
        const p = ((T * 0.5 + k / 3) % 1);
        const zx = s.x + 8 + p * 6 + k, zy = s.y - 2 - p * 12;
        g.globalAlpha = 1 - p;
        px(g, zx, zy, 3, 1, '#e9edf2'); px(g, zx + 1, zy + 1, 1, 1, '#e9edf2'); px(g, zx, zy + 2, 3, 1, '#e9edf2');
        g.globalAlpha = 1;
      }
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.x += d.vx; d.y += d.vy; d.vy += 0.6; d.life -= 0.12;
      if (d.life <= 0 || d.y > FLOOR) { debris.splice(i, 1); continue; }
      px(g, d.x, d.y, 1, 1, Math.random() > 0.7 ? '#ffd23f' : '#9a8574');
    }
  }

  function loop(ts) {
    if (!running) return;
    if (visible && ts - lastDraw >= FPS_MS) { lastDraw = ts; draw(performance.now()); }
    requestAnimationFrame(loop);
  }
  function start() {
    if (reduce()) { running = false; draw(performance.now()); return; }
    if (!running) { running = true; requestAnimationFrame(loop); }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(wrap);

  return {
    update(o) {
      const s = JSON.stringify([S, o.chests.map((c) => [c.at, c.amount, c.skin]), o.unlocked, o.miningActive, o.hasDeposits, Math.round(o.viewportWidth / 30), Math.floor(o.now / 3600_000), o.lang, o.restPoses]);
      if (s !== sig) { sig = s; build(o); }
      start();
      if (!running) draw(performance.now());
    },
    /** Run the lift so the coins land in the vault at `landAtEpoch` (ms, same clock as Date.now()). */
    deliver(landAtEpoch, nowEpoch) {
      if (reduce()) return;
      deliveryAt = performance.now() + (landAtEpoch - nowEpoch);
    },
    get width() { return L ? L.W * S : 0; },
  };
}

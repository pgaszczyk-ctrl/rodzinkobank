// "Kopalnia Marzeń": one cross-section with the calendar landscape above ground
// and the mine below. Every chest underground sits exactly under its date on
// the axis. Seasons blend into each other along the axis.

import { addMonths, wallParts, wallToInstant, dayOfYear } from './calendar.js';
import { minerSvg, coinHeapSvg, chestSvg } from './art.js';
import { t, fmtDate, money } from './i18n.js';

const DAY = 86400_000;
export const SCENE_H = 540;
const SURFACE = 168;      // ground level
const ROAD_H = 32;        // axis band (chest markers on top, month names below)
const CHEST_BASE = 286;   // chest baseline (first row; a close neighbour goes one row lower)
const ROW_DY = 70;
const GALLERY_TOP = 392;
const FLOOR = 506;        // rail level / miners' feet
const SX = 122;           // shaft centre
const MINER_S = 1.35;     // miner scale (Rodzinobank-style blocky miners)
const TX = 160;           // "today" on the axis

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const CENTERS = [14, 104, 195, 287]; // mid-January, -April, -July, -October (day of year)
const PALETTE = {
  winter: { skyT: [196, 222, 250], skyB: [240, 247, 255], ground: [246, 250, 255], hill: [226, 236, 248] },
  spring: { skyT: [190, 232, 255], skyB: [238, 252, 240], ground: [134, 214, 120], hill: [176, 232, 168] },
  summer: { skyT: [150, 212, 255], skyB: [255, 246, 214], ground: [86, 196, 88], hill: [150, 222, 140] },
  autumn: { skyT: [255, 220, 178], skyB: [255, 245, 230], ground: [214, 160, 88], hill: [234, 196, 136] },
};

const smooth = (x) => x * x * (3 - 2 * x);
/** Weights of the four seasons for a day of year (they blend between mid-season points). */
export function seasonWeights(doy) {
  const w = { winter: 0, spring: 0, summer: 0, autumn: 0 };
  for (let i = 0; i < 4; i++) {
    const a = CENTERS[i], b = i === 3 ? CENTERS[0] + 365 : CENTERS[i + 1];
    let d = doy; if (i === 3 && d < a) d += 365;
    if (d >= a && d < b) {
      const f = smooth((d - a) / (b - a));
      w[SEASONS[i]] = 1 - f; w[SEASONS[(i + 1) % 4]] = f;
      return w;
    }
  }
  w.winter = 1; return w;
}
export const dominantSeason = (w) => SEASONS.reduce((best, s) => (w[s] > w[best] ? s : best), 'winter');

function mixColor(w, key) {
  const c = [0, 0, 0];
  for (const s of SEASONS) for (let i = 0; i < 3; i++) c[i] += PALETTE[s][key][i] * w[s];
  return `rgb(${c.map((v) => Math.round(v)).join(',')})`;
}

// deterministic pseudo-random from an integer
const rnd = (n) => { let x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/* ---------------- decorations ---------------- */
function tree(x, y, s, season, seed) {
  const k = 0.8 + rnd(seed) * 0.5;
  const sc = s * k;
  if (season === 'winter') {
    return `<g transform="translate(${x} ${y}) scale(${sc})"><rect x="-3" y="-14" width="6" height="14" fill="#7a5230"/>
      <path d="M0 -62 L20 -34 H-20Z M0 -46 L24 -14 H-24Z" fill="#3f9f73"/>
      <path d="M0 -62 L8 -51 Q0 -48 -8 -51Z M-15 -34 Q0 -30 15 -34 L19 -29 Q0 -25 -19 -29Z M-19 -14 Q0 -10 19 -14 L23 -12 Q0 -8 -23 -12Z" fill="#fff"/></g>`;
  }
  const canopy = season === 'autumn' ? ['#f28c38', '#e85d3a', '#f6b445'][seed % 3]
    : season === 'spring' ? '#7ed67a' : '#3fbf5f';
  const extra = season === 'spring'
    ? [[-10, -44], [6, -52], [12, -38], [-4, -34], [-14, -30], [2, -44]].map(([dx, dy], i) => `<circle cx="${dx}" cy="${dy}" r="${2.6 + (i % 2)}" fill="${i % 2 ? '#fbcfe8' : '#f9a8d4'}"/>`).join('')
    : season === 'autumn'
      ? [0, 1].map((i) => `<path class="leaf" style="animation-delay:${(seed % 5) * 0.7 + i * 2.1}s" d="M${-8 + i * 14} -30 q4 -5 8 0 q-4 5 -8 0z" fill="${['#e85d3a', '#f6b445'][i]}"/>`).join('')
      : '';
  return `<g transform="translate(${x} ${y}) scale(${sc})"><g class="sway" style="animation-delay:${(seed % 7) * 0.4}s">
    <rect x="-3.5" y="-24" width="7" height="24" rx="2" fill="#8b5a2b"/>
    <circle cx="0" cy="-40" r="18" fill="${canopy}"/><circle cx="-12" cy="-30" r="11" fill="${canopy}"/><circle cx="12" cy="-31" r="12" fill="${canopy}"/>
    <circle cx="-6" cy="-46" r="6" fill="#fff" opacity=".22"/>${extra}</g></g>`;
}

function groundDetail(x, y, season, seed) {
  if (season === 'spring') {
    const c = ['#f472b6', '#fcd34d', '#a78bfa', '#60a5fa'][seed % 4];
    return `<g transform="translate(${x} ${y})"><path d="M0 0 V-9" stroke="#3fa776" stroke-width="1.6"/><path d="M0 -4 q-4 -2 -5 -6 q4 1 5 4" fill="#5cbf6b"/>
      <circle cx="0" cy="-11" r="3" fill="${c}"/><circle cx="0" cy="-11" r="1.3" fill="#fff7c2"/></g>`;
  }
  if (season === 'autumn') return `<ellipse cx="${x}" cy="${y - 1}" rx="9" ry="2.6" fill="#e2632f" opacity=".75"/><path d="M${x + 6} ${y - 5} q3 -3 6 0 q-3 3 -6 0z" fill="#f6b445"/>`;
  if (season === 'summer') return `<path d="M${x - 5} ${y} q2 -9 4 0 q2 -11 4 0 q2 -8 4 0" stroke="#2f9e4a" stroke-width="1.6" fill="none"/>`;
  return `<ellipse cx="${x}" cy="${y - 1}" rx="10" ry="3" fill="#fff"/>`;
}

function snowman(x, y) {
  return `<g transform="translate(${x} ${y})" class="snowman">
    <ellipse cx="0" cy="-1" rx="20" ry="4" fill="#dbe7f3"/>
    <circle cx="0" cy="-16" r="16" fill="#fff" stroke="#cfe0f0" stroke-width="2"/>
    <circle cx="0" cy="-42" r="11" fill="#fff" stroke="#cfe0f0" stroke-width="2"/>
    <rect x="-9" y="-56" width="18" height="4" rx="1.5" fill="#2b3a55"/><rect x="-6" y="-66" width="12" height="11" rx="1.5" fill="#2b3a55"/><rect x="-6" y="-58" width="12" height="2.5" fill="#ef4444"/>
    <circle cx="-4" cy="-44" r="1.6" fill="#2b3a55"/><circle cx="4" cy="-44" r="1.6" fill="#2b3a55"/><path d="M0 -40 l9 2 l-9 2z" fill="#fb923c"/>
    <path d="M-11 -32 q11 6 22 0 l1 4 q-12 6 -24 0z" fill="#ef4444"/>
    <circle cx="0" cy="-20" r="1.8" fill="#2b3a55"/><circle cx="0" cy="-12" r="1.8" fill="#2b3a55"/>
    <path d="M-15 -24 L-30 -34 M15 -24 L29 -36" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/></g>`;
}

function sun(x, y) {
  return `<g transform="translate(${x} ${y})"><g class="sun-rays">${Array.from({ length: 12 }, (_, i) => `<rect x="-2.5" y="-36" width="5" height="12" rx="2.5" fill="#fcd34d" transform="rotate(${i * 30})"/>`).join('')}</g>
    <circle r="21" fill="#fde047"/><circle cx="-7" cy="-3" r="2.2" fill="#b45309"/><circle cx="7" cy="-3" r="2.2" fill="#b45309"/>
    <path d="M-8 6 Q0 13 8 6" stroke="#b45309" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`;
}

function cloud(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})" opacity=".92" fill="#fff"><ellipse cx="0" cy="0" rx="22" ry="9"/><ellipse cx="14" cy="-6" rx="14" ry="9"/><ellipse cx="-12" cy="-4" rx="10" ry="7"/></g>`;
}

/* ---------------- mine pieces (Rodzinobank style) ---------------- */
function gearPath(cx, cy, teeth, rOut, rIn, rHole) {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    [[a - step * 0.30, rIn], [a - step * 0.18, rOut], [a + step * 0.18, rOut], [a + step * 0.30, rIn], [a + step * 0.5, rIn]].forEach(([ang, r], j) => {
      d += (i === 0 && j === 0 ? 'M' : 'L') + (cx + r * Math.cos(ang)).toFixed(2) + ' ' + (cy + r * Math.sin(ang)).toFixed(2) + ' ';
    });
  }
  return d + `Z M${cx + rHole} ${cy} A${rHole} ${rHole} 0 1 0 ${cx - rHole} ${cy} A${rHole} ${rHole} 0 1 0 ${cx + rHole} ${cy}Z`;
}
function gear(cx, cy, teeth, r, fill, cls) {
  return `<g class="${cls}"><path d="${gearPath(cx, cy, teeth, r, r * 0.8, r * 0.28)}" fill="${fill}" fill-rule="evenodd" stroke="rgba(0,0,0,.12)" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3"/>
    ${[0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2 + Math.PI / 4; return `<circle cx="${(cx + Math.cos(a) * r * 0.48).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.48).toFixed(1)}" r="${r * 0.09}" fill="rgba(0,0,0,.15)"/>`; }).join('')}</g>`;
}

function headframe() {
  return `<g class="headframe">
    <path d="M${SX - 22} ${SURFACE} L${SX - 4} ${SURFACE - 64} M${SX + 22} ${SURFACE} L${SX + 4} ${SURFACE - 64} M${SX - 15} ${SURFACE - 30} H${SX + 15}" stroke="#8b5a2b" stroke-width="5" stroke-linecap="round"/>
    <g class="winch-wheel" style="transform-origin:${SX}px ${SURFACE - 66}px"><circle cx="${SX}" cy="${SURFACE - 66}" r="10" fill="#94a3b8" stroke="#475569" stroke-width="2.5"/>
      <path d="M${SX - 10} ${SURFACE - 66} H${SX + 10} M${SX} ${SURFACE - 76} V${SURFACE - 56}" stroke="#475569" stroke-width="2"/></g>
  </g>`;
}

function gallery(endX, active) {
  const top = GALLERY_TOP, x0 = SX - 22, w = endX - x0;
  let g = `<rect x="${x0}" y="${top}" width="${w}" height="${FLOOR - top + 22}" rx="22" fill="url(#caveGrad)"/>
    <rect x="${x0}" y="${FLOOR - 8}" width="${w}" height="30" rx="10" fill="#e8b46a"/>
    <rect x="${x0}" y="${FLOOR}" width="${w}" height="4" fill="#8b5a2b"/>`;
  for (let x = x0 + 8; x < endX - 10; x += 20) g += `<rect x="${x}" y="${FLOOR - 4}" width="8" height="12" fill="#a0703f"/>`;
  for (let x = SX + 86; x < endX - 60; x += 150) {
    g += `<rect x="${x}" y="${top}" width="10" height="${FLOOR - top - 8}" fill="#a0703f"/><rect x="${x - 20}" y="${top}" width="50" height="10" rx="3" fill="#8b5a2b"/>
      <circle cx="${x + 5}" cy="${top + 20}" r="16" fill="#fff3b0" class="lamp-glow"/><rect x="${x}" y="${top + 12}" width="10" height="12" rx="3" fill="#fcd34d"/>`;
  }
  const spin = active ? '' : ' gear-still';
  g += gear(endX - 36, FLOOR - 50, 12, 32, '#7dd3fc', 'gear-ccw' + spin);
  g += gear(endX - 76, FLOOR - 20, 8, 20, '#34d399', 'gear-cw' + spin);
  g += gear(endX - 14, top - 8, 10, 17, '#c4b5fd', 'gear-cw-slow' + spin);
  return g;
}

function oreBlock(x, y, delay, active) {
  const s = 38;
  return `<g transform="translate(${x} ${y})"><g class="${active ? 'ore-shake' : ''}" style="animation-delay:${delay}s">
    <rect width="${s}" height="${s}" rx="4" fill="#a8b3c4"/><rect width="${s}" height="${s * 0.18}" rx="3" fill="#c3ccd8"/>
    <rect x="${s * .15}" y="${s * .30}" width="${s * .2}" height="${s * .2}" fill="#fcd34d"/><rect x="${s * .55}" y="${s * .50}" width="${s * .22}" height="${s * .22}" fill="#fbbf24"/>
    <rect x="${s * .35}" y="${s * .70}" width="${s * .15}" height="${s * .15}" fill="#fde68a"/><rect x="${s * .62}" y="${s * .2}" width="${s * .12}" height="${s * .12}" fill="#fde68a"/></g>
    ${active ? `<g class="spark" style="animation-delay:${delay}s"><path d="M4 8 l5 -10 l3 9 l9 -4 l-6 8 l8 5 l-10 0 l-2 9 l-3 -9 l-9 1z" fill="#fff7c2" stroke="#fbbf24" stroke-width="1.5"/></g>` : ''}</g>`;
}

function cart(active) {
  return `<g class="cart ${active ? 'cart-shuttle' : ''}"><g transform="translate(${SX + 30} ${FLOOR - 38})">
    <rect x="0" y="6" width="56" height="26" rx="4" fill="#64748b"/><rect x="0" y="6" width="56" height="6" fill="#94a3b8"/>
    <circle cx="14" cy="34" r="6" fill="#2b3a55"/><circle cx="42" cy="34" r="6" fill="#2b3a55"/>
    ${active ? '<circle cx="12" cy="4" r="7" fill="#fcd34d"/><circle cx="26" cy="0" r="8" fill="#fbbf24"/><circle cx="40" cy="4" r="7" fill="#fde68a"/><circle cx="26" cy="0" r="3" fill="#fff7c2"/>' : ''}
  </g></g>`;
}

/* ---------------- the scene ---------------- */
/**
 * @returns {{svg:string, width:number}}
 */
export function buildScene(o) {
  const { now, tz, chests, unlocked, miningActive, restPoses, hasDeposits, viewportWidth } = o;
  const lastDays = chests.length ? (chests[chests.length - 1].at - now) / DAY : 0;
  const horizon = Math.max(200, Math.ceil(lastDays) + 26);
  const ppd = Math.max(4.6, (viewportWidth - TX - 40) / horizon);
  const W = Math.ceil(TX + horizon * ppd + 30);
  const xOf = (ms) => TX + ((ms - now) / DAY) * ppd;
  const dateAt = (x) => now + ((x - TX) / ppd) * DAY;
  const wAt = (x) => seasonWeights(dayOfYear(dateAt(x), tz));

  // ---- sky & ground gradients (horizontal blend of seasons) ----
  const stops = { skyT: [], skyB: [], ground: [], hill: [] };
  for (let x = 0; x <= W; x += Math.max(24, ppd * 6)) {
    const w = wAt(x);
    for (const k of Object.keys(stops)) stops[k].push(`<stop offset="${(x / W).toFixed(4)}" stop-color="${mixColor(w, k)}"/>`);
  }
  const grad = (id, k) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">${stops[k].join('')}</linearGradient>`;

  let s = `<defs>${grad('gSkyT', 'skyT')}${grad('gSkyB', 'skyB')}${grad('gGround', 'ground')}${grad('gHill', 'hill')}
    <linearGradient id="fadeV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="skyMask"><rect width="${W}" height="${SURFACE}" fill="url(#fadeV)"/></mask>
    <linearGradient id="caveGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9c2"/><stop offset="1" stop-color="#ffd89a"/></linearGradient>
    <pattern id="dirt" width="22" height="22" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#b98457"/><rect width="11" height="11" fill="#ad794c"/><rect x="11" y="11" width="11" height="11" fill="#c28e60"/></pattern>
    <pattern id="stone" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#b4bfcd"/><rect width="13" height="13" fill="#aab5c4"/><rect x="13" y="13" width="13" height="13" fill="#c0c9d6"/></pattern>
  </defs>
  <rect width="${W}" height="${SURFACE}" fill="url(#gSkyB)"/>
  <rect width="${W}" height="${SURFACE}" fill="url(#gSkyT)" mask="url(#skyMask)"/>`;

  // clouds
  for (let x = 60; x < W; x += 210) s += cloud(x + rnd(x) * 80, 34 + rnd(x + 1) * 30, 0.8 + rnd(x + 2) * 0.5);

  // special: sun (summer peak) and snowmen (winter peak) within the horizon
  const specials = [];
  let prevDom = null, spanStart = 0;
  const spans = [];
  for (let x = TX - 30; x <= W; x += 4) {
    const dom = dominantSeason(wAt(x));
    if (dom !== prevDom) { if (prevDom) spans.push({ season: prevDom, x0: spanStart, x1: x }); prevDom = dom; spanStart = x; }
  }
  spans.push({ season: prevDom, x0: spanStart, x1: W });
  for (const sp of spans) {
    const mid = (sp.x0 + sp.x1) / 2;
    if (sp.season === 'summer' && sp.x1 - sp.x0 > 60) specials.push(sun(Math.min(Math.max(mid, sp.x0 + 40), W - 50), 48));
    if (sp.season === 'winter' && sp.x1 - sp.x0 > 70) specials.push(snowman(Math.min(Math.max(mid, sp.x0 + 40), W - 40), SURFACE - 4));
  }

  // snowfall over winter stretches
  let flakes = '';
  for (let x = TX - 20, i = 0; x < W; x += 26, i++) {
    if (wAt(x).winter < 0.45) continue;
    flakes += `<circle class="flake" style="animation-delay:${(rnd(i) * 7).toFixed(2)}s;animation-duration:${6 + (i % 4)}s" cx="${x + rnd(i + 9) * 18}" cy="${-6 - rnd(i + 3) * 30}" r="${1.6 + (i % 3)}" fill="#fff"/>`;
  }

  // hills + ground
  let hill = `M0 ${SURFACE - 18}`;
  for (let x = 0; x <= W + 120; x += 120) hill += ` Q${x + 60} ${SURFACE - 40 - rnd(x) * 22} ${x + 120} ${SURFACE - 18}`;
  hill += ` V${SURFACE} H0Z`;
  s += `<path d="${hill}" fill="url(#gHill)"/>`;
  s += specials.filter((x) => x.includes('sun-rays')).join('');
  s += `<g class="snowfall">${flakes}</g>`;

  // trees and ground details
  let deco = '';
  const step = Math.max(46, ppd * 9);
  for (let x = TX + 22, i = 0; x < W - 10; x += step, i++) {
    const jx = x + (rnd(i * 3) - 0.5) * step * 0.5;
    const w = wAt(jx);
    // pick a season by weight so the transition is gradual
    let r = rnd(i * 7 + 1), season = 'winter';
    for (const sn of SEASONS) { if (r < w[sn]) { season = sn; break; } r -= w[sn]; }
    if (rnd(i * 5 + 2) < 0.72) deco += tree(jx, SURFACE - 6, 0.82, season, i);
    deco += groundDetail(jx + 18, SURFACE - 2, season, i);
  }
  s += `<rect x="0" y="${SURFACE - 12}" width="${W}" height="14" fill="url(#gGround)"/>`;
  s += deco;
  s += specials.filter((x) => x.includes('snowman')).join('');

  // season names
  s += spans.filter((sp) => sp.x1 - sp.x0 > 40).map((sp) => {
    const x = Math.max(sp.x0, TX - 10) + 8;
    if (x > W - 70) return '';
    return `<g transform="translate(${x} 12)"><rect width="${t('season.' + sp.season).length * 8 + 18}" height="22" rx="11" fill="#fff" opacity=".85"/>
      <text x="9" y="15.5" class="scene-season">${t('season.' + sp.season)}</text></g>`;
  }).join('');

  // ---- axis (road) ----
  s += `<rect x="0" y="${SURFACE}" width="${W}" height="${ROAD_H}" fill="#f3e6cf"/><rect x="0" y="${SURFACE}" width="${W}" height="3" fill="#e2cfae"/>`;
  // month ticks: first day of each month
  const p0 = wallParts(now, tz);
  for (let k = 1; k <= 16; k++) {
    const m0 = wallToInstant(p0.y, p0.m, 1, 0, 0, 0, 0, tz);
    const ms = addMonths(m0, k, tz);
    const x = xOf(ms);
    if (x > W - 20) break;
    const p = wallParts(ms, tz);
    const label = p.m === 1 ? fmtDate(ms, tz, 'monthYear') : fmtDate(ms, tz, 'month');
    s += `<path d="M${x} ${SURFACE + 3} V${SURFACE + ROAD_H}" stroke="#cdb48b" stroke-width="2"/>
      <text x="${x + 5}" y="${SURFACE + 27}" class="scene-month">${label}</text>`;
  }

  // ---- underground ----
  s += `<rect x="0" y="${SURFACE + ROAD_H}" width="${W}" height="40" fill="url(#dirt)"/>
    <rect x="0" y="${SURFACE + ROAD_H + 40}" width="${W}" height="${SCENE_H - SURFACE - ROAD_H - 40}" fill="url(#stone)"/>`;

  // shaft
  s += `<rect x="${SX - 15}" y="${SURFACE + 2}" width="30" height="${FLOOR - SURFACE + 8}" fill="#5b4632"/>
    <rect x="${SX - 15}" y="${SURFACE + 2}" width="4" height="${FLOOR - SURFACE + 8}" fill="#8b5a2b"/><rect x="${SX + 11}" y="${SURFACE + 2}" width="4" height="${FLOOR - SURFACE + 8}" fill="#8b5a2b"/>`;

  const galleryEnd = Math.min(W - 16, SX + 520);
  s += gallery(galleryEnd, miningActive);

  // rope + bucket (delivery animation moves the bucket up the shaft)
  s += `<path d="M${SX} ${SURFACE - 56} V${FLOOR - 26}" stroke="#7c6a55" stroke-width="1.6" class="rope"/>
    <g id="bucket" class="bucket" style="--lift:${-(FLOOR - SURFACE - 6)}px"><g transform="translate(${SX} ${FLOOR - 26})">
      <path d="M-9 0 h18 l-3 14 h-12z" fill="#64748b" stroke="#475569" stroke-width="1.5"/><path d="M-9 0 q9 -9 18 0" stroke="#475569" stroke-width="1.5" fill="none"/>
      <circle class="bucket-coin" cx="0" cy="2" r="4.5" fill="#fbbf24" stroke="#b45309" stroke-width="1"/></g></g>`;
  s += headframe();

  // heap of coins on the surface: the winch delivers each microgrosz here
  const HEAP_X = 52;
  s += `<g id="sceneHeap" transform="translate(${HEAP_X} ${SURFACE})">${coinHeapSvg()}</g>
    <g id="flyCoin" class="fly-coin" style="--fx:${HEAP_X - SX}px"><circle cx="${SX}" cy="${SURFACE - 30}" r="5.5" fill="#fbbf24" stroke="#b45309" stroke-width="1.2"/></g>`;

  // cart + miners
  s += cart(miningActive);
  const slots = [
    { x: SX + 225, pose: 'dig' },
    { x: SX + 112, pose: 'load' },
    { x: SX + 330, pose: 'dig' },
  ];
  const minerY = FLOOR - 4 - 58 * MINER_S;
  slots.forEach((slot, i) => {
    const unlockedHere = i < unlocked;
    const show = unlockedHere || (i === 0 && !hasDeposits);
    if (slot.x > galleryEnd - 60) return;
    if (!show) { s += `<g transform="translate(${slot.x} ${minerY}) scale(${MINER_S})">${minerSvg({ pose: 'locked' })}</g>`; return; }
    const pose = !hasDeposits ? 'nap' : miningActive ? slot.pose : restPoses[i];
    if (pose === 'dig') s += oreBlock(slot.x + 50, FLOOR - 42, i * 0.35, true);
    s += `<g transform="translate(${slot.x} ${minerY}) scale(${MINER_S})" class="miner-slot" data-slot="${i}">${minerSvg({ pose, chief: i === 2, idx: i, delay: i * 0.35 })}</g>`;
  });

  // ---- chests, aligned with their dates ----
  const lastInRow = [-999, -999];
  chests.forEach((c, i) => {
    const x = xOf(c.at);
    const row = x - lastInRow[0] >= 100 ? 0 : x - lastInRow[1] >= 100 ? 1 : (lastInRow[0] <= lastInRow[1] ? 0 : 1);
    lastInRow[row] = x;
    const base = CHEST_BASE + row * ROW_DY;
    const stroke = c.skin === 'gold' ? '#d97706' : c.skin === 'silver' ? '#64748b' : '#8a5527';
    const fill = c.skin === 'gold' ? '#fbbf24' : c.skin === 'silver' ? '#94a3b8' : '#b7793f';
    s += `<g class="chest-marker" data-chest="${i}">
      <path d="M${x} ${SURFACE + 15} V${base - 52}" stroke="#7c5a2d" stroke-width="1.6" stroke-dasharray="4 4" opacity=".7"/>
      <g transform="translate(${x} ${SURFACE + 9})"><circle r="6.5" fill="#fff" stroke="${stroke}" stroke-width="3"/><circle r="2.4" fill="${fill}"/></g>
      <g transform="translate(${x} ${base}) scale(${i === 0 ? 1.05 : 0.92})">${chestSvg(c.skin)}</g>
      <g transform="translate(${x} ${base + 6})"><rect x="-46" y="0" width="92" height="27" rx="9" fill="#fff" opacity=".93"/>
        <text x="0" y="12" text-anchor="middle" class="scene-chest-amt">${money(c.amount, { sign: true })}</text>
        <text x="0" y="23" text-anchor="middle" class="scene-chest-date">${fmtDate(c.at, tz, 'long')}</text></g>
    </g>`;
  });

  // ---- today marker ----
  s += `<g class="today"><path d="M${TX} ${SURFACE - 70} V${SURFACE + ROAD_H}" stroke="#db2777" stroke-width="3"/>
    <path d="M${TX} ${SURFACE - 70} h46 l-8 9 l8 9 h-46z" fill="#ec4899"/>
    <text x="${TX + 6}" y="${SURFACE - 57}" class="scene-today">${t('scene.today')}</text>
    <circle cx="${TX}" cy="${SURFACE + 9}" r="6" fill="#fff" stroke="#db2777" stroke-width="3"/></g>`;

  // speech bubble before the first deposit
  if (!hasDeposits) {
    const bx = slots[0].x;
    s += `<g transform="translate(${bx - 100} ${GALLERY_TOP + 8})"><rect width="200" height="30" rx="12" fill="#fff" stroke="#f9a8d4" stroke-width="2"/>
      <text x="100" y="20" text-anchor="middle" class="scene-bubble">${t('kid.wakeHint')}</text></g>`;
  }

  return { svg: `<svg viewBox="0 0 ${W} ${SCENE_H}" width="${W}" height="${SCENE_H}" class="scene-svg" role="img" aria-labelledby="sceneTitle sceneDesc">${s}</svg>`, width: W, ppd };
}

// "Kopalnia Marzeń": one cross-section with the calendar landscape above ground
// and the mine below. Every chest underground sits exactly under its date on
// the axis. Seasons blend into each other along the axis.

import { addMonths, wallParts, wallToInstant, dayOfYear } from './calendar.js';
import { t, fmtDate, money } from './i18n.js';

const DAY = 86400_000;
export const SCENE_H = 402;
const SURFACE = 168;      // ground level
const ROAD_H = 32;        // axis band (chest markers on top, month names below)
const GALLERY_TOP = 262;   // top of the original tunnel
const FLOOR = GALLERY_TOP + 32;   // where the shaft opens into the tunnel
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

/* ---------------- mine pieces: the original Rodzinobank artwork ---------------- */
// The mine below is drawn in the coordinates of the first version (viewBox 640×200)
// and placed under the chests with one translate, so it looks exactly like before.
const MINE_Y = GALLERY_TOP - 72;   // original tunnel top (y = 72) lands on GALLERY_TOP

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
function gearSvg(cx, cy, teeth, r, fill, cls, delay = 0) {
  return `<g class="${cls}" style="animation-delay:${delay}s">
    <path d="${gearPath(cx, cy, teeth, r, r * 0.80, r * 0.28)}" fill="${fill}" fill-rule="evenodd" stroke="rgba(0,0,0,.12)" stroke-width="2"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3"/>
    ${[0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2 + Math.PI / 4; return `<circle cx="${(cx + Math.cos(a) * r * 0.48).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.48).toFixed(1)}" r="${r * 0.09}" fill="rgba(0,0,0,.15)"/>`; }).join('')}
  </g>`;
}

/**
 * The original block miner. States:
 *   'sit'  – sits on a stone, the pickaxe lies on the ground (not working yet / resting),
 *   'wake' – stands up, picks up the pickaxe, walks to the ore and starts digging (after a deposit),
 *   'dig'  – digs (the original swinging pickaxe).
 * The miner's digging spot is x; while sitting he is SIT_DX units to the left.
 */
const SIT_DX = -12;
function minerSvg(x, y, scale, shirt, delay, { state = 'dig', chief = false } = {}) {
  const helmet = chief ? '#facc15' : '#fbbf24';
  const brim = chief ? '#b45309' : '#d97706';
  const pick = `<rect x="26" y="34" width="3" height="24" fill="#8b5a2b"/>
      <rect x="24" y="22" width="6" height="14" fill="${shirt}"/>
      <rect x="24" y="34" width="6" height="5" fill="#f1c27d"/>
      <path d="M10 49 Q14 53 18 55 H38 Q42 53 46 49 L47 52 Q43 57 38 59 H18 Q13 57 9 52Z" fill="#94a3b8" stroke="#64748b" stroke-width="1"/>
      <rect x="25" y="54" width="5" height="6" rx="1" fill="#64748b"/>
      <path d="M13 52.5 Q17 56 20 56.5 H36" stroke="#5eead4" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  // pickaxe lying on the ground in front of the sitting miner
  const pickOnGround = `<rect x="27" y="54" width="24" height="3" rx="1" fill="#8b5a2b"/>
      <rect x="49" y="45" width="4" height="13" fill="#94a3b8"/><rect x="47" y="43" width="4" height="4" fill="#94a3b8"/><rect x="47" y="56" width="4" height="2" fill="#64748b"/>
      <rect x="50" y="46" width="1.4" height="10" fill="#5eead4"/>`;
  return `<g class="miner m-${state}" style="--sx:${SIT_DX}px;--d:${delay}s">
    <g transform="translate(${x} ${y}) scale(${scale})">
      <g class="m-body"><g class="m-breathe">
        <g class="legs-stand"><rect x="10" y="40" width="9" height="16" fill="#3b4a8c"/><rect x="19" y="40" width="9" height="16" fill="#2f3b73"/><rect x="10" y="54" width="9" height="4" fill="#4b3621"/><rect x="19" y="54" width="9" height="4" fill="#4b3621"/></g>
        <g class="legs-sit"><rect x="10" y="40" width="18" height="7" fill="#3b4a8c"/><rect x="22" y="40" width="7" height="8" fill="#2f3b73"/><rect x="22" y="46" width="9" height="3" fill="#4b3621"/></g>
        <rect x="5" y="22" width="6" height="16" fill="${shirt}" opacity=".8"/><rect x="5" y="36" width="6" height="4" fill="#e8b88a"/>
        <rect x="10" y="22" width="18" height="18" fill="${shirt}"/>
        <rect x="10" y="36" width="18" height="4" fill="#7c5a2d"/><rect x="17" y="36" width="4" height="4" fill="#fcd34d"/>
        ${chief ? '<path d="M14 25 l1.6 3.2 3.4 .5 -2.5 2.3 .6 3.4 -3.1 -1.7 -3.1 1.7 .6 -3.4 -2.5 -2.3 3.4 -.5z" transform="translate(5 0)" fill="#fde047" stroke="#b45309" stroke-width=".6"/>' : ''}
        <rect x="9" y="4" width="20" height="18" fill="#f1c27d"/>
        <rect x="9" y="4" width="20" height="5" fill="#6b4423"/><rect x="9" y="4" width="3" height="9" fill="#6b4423"/>
        <rect x="21" y="12" width="3" height="3" fill="#fff"/><rect x="22" y="13" width="2" height="2" fill="#2b3a55"/><rect x="14" y="12" width="3" height="3" fill="#fff"/><rect x="15" y="13" width="2" height="2" fill="#2b3a55"/>
        <rect x="17" y="17" width="6" height="2" fill="#c9875a"/>
        <rect x="7" y="0" width="24" height="6" rx="1" fill="${helmet}"/><rect x="7" y="5" width="25" height="2" fill="${brim}"/>
        ${chief ? '<rect x="9" y="1.5" width="20" height="1.2" fill="#fff7c2" opacity=".85"/>' : ''}
        <rect x="26" y="1" width="5" height="4" fill="#fff7c2"/>
        <circle cx="34" cy="3" r="7" fill="#fff7c2" class="lamp-glow"/>
      </g></g>
      <g class="pick-ground">${pickOnGround}</g>
      <g class="pick-arm">${pick}</g>
    </g>
  </g>`;
}

function oreBlock(x, y, s, delay, active) {
  return `<g transform="translate(${x} ${y})"><g class="${active ? 'ore-shake' : ''}" style="animation-delay:${delay}s">
    <rect width="${s}" height="${s}" rx="4" fill="#a8b3c4"/>
    <rect width="${s}" height="${s * 0.18}" rx="3" fill="#c3ccd8"/>
    <rect x="${s * .15}" y="${s * .30}" width="${s * .2}" height="${s * .2}" fill="#fcd34d"/>
    <rect x="${s * .55}" y="${s * .50}" width="${s * .22}" height="${s * .22}" fill="#fbbf24"/>
    <rect x="${s * .35}" y="${s * .70}" width="${s * .15}" height="${s * .15}" fill="#fde68a"/>
    <rect x="${s * .62}" y="${s * .2}"  width="${s * .12}" height="${s * .12}" fill="#fde68a"/>
  </g></g>
  ${active ? `<g class="spark" style="animation-delay:${delay}s"><path d="M${x + 4} ${y + 8} l5 -10 l3 9 l9 -4 l-6 8 l8 5 l-10 0 l-2 9 l-3 -9 l-9 1z" fill="#fff7c2" stroke="#fbbf24" stroke-width="1.5"/></g>` : ''}`;
}

/** The whole original mine tunnel (coordinates of the first version). */
function originalMine({ unlocked, miningActive, hasDeposits, prevDigging }) {
  const still = miningActive ? '' : ' gear-still';
  let s = `<rect x="16" y="72" width="608" height="120" rx="22" fill="url(#caveGrad)"/>
    <rect x="16" y="168" width="608" height="24" rx="10" fill="#e8b46a"/>
    <rect x="16" y="176" width="608" height="4" fill="#8b5a2b"/>
    ${Array.from({ length: 30 }, (_, i) => `<rect x="${24 + i * 20}" y="172" width="8" height="12" fill="#a0703f"/>`).join('')}
    ${[120, 330, 540].map((x) => `<rect x="${x}" y="72" width="10" height="100" fill="#a0703f"/><rect x="${x - 20}" y="72" width="50" height="10" rx="3" fill="#8b5a2b"/>`).join('')}
    ${[125, 335, 545].map((x) => `<circle cx="${x + 5}" cy="92" r="16" fill="#fff3b0" class="lamp-glow"/><rect x="${x}" y="84" width="10" height="12" rx="3" fill="#fcd34d"/>`).join('')}`;
  s += gearSvg(70, 120, 12, 34, '#fbbf24', 'gear-cw' + still);
  s += gearSvg(116, 150, 8, 22, '#34d399', 'gear-ccw' + still);
  s += gearSvg(590, 118, 12, 32, '#7dd3fc', 'gear-ccw' + still);
  s += gearSvg(612, 40, 10, 18, '#c4b5fd', 'gear-cw-slow' + still);

  const miners = [{ x: 148, shirt: '#38bdf8', d: 0 }, { x: 262, shirt: '#f472b6', d: 0.35 }, { x: 376, shirt: '#34d399', d: 0.7 }];
  miners.forEach((m, i) => {
    // a Groszak digs once a deposit has woken him (1st, 2nd, 3rd deposit) and the mine is earning
    const digging = hasDeposits && miningActive && i < unlocked;
    const state = digging ? (prevDigging && !prevDigging[i] ? 'wake' : 'dig') : 'sit';
    s += oreBlock(m.x + 78, 130, 38, m.d, digging);
    s += `<g transform="translate(${m.x + SIT_DX + 4} 158)"><rect width="34" height="14" rx="6" fill="#a8b3c4"/><rect width="34" height="4" rx="2" fill="#c3ccd8"/></g>`;
    s += minerSvg(m.x, 88, 1.4, m.shirt, m.d, { state, chief: i === 2 });
  });

  // cart with gold
  s += `<g class="${miningActive ? 'cart-bounce' : ''}"><g transform="translate(502 136)">
    <rect x="0" y="6" width="56" height="26" rx="4" fill="#64748b"/><rect x="0" y="6" width="56" height="6" fill="#94a3b8"/>
    <circle cx="14" cy="34" r="6" fill="#2b3a55"/><circle cx="42" cy="34" r="6" fill="#2b3a55"/>
    ${hasDeposits ? '<circle cx="12" cy="4" r="7" fill="#fcd34d"/><circle cx="26" cy="0" r="8" fill="#fbbf24"/><circle cx="40" cy="4" r="7" fill="#fde68a"/><circle cx="26" cy="0" r="3" fill="#fff7c2"/>' : ''}
  </g></g>`;
  return s;
}

/** Small vault on the surface where the delivered coins go (flat style). */
function vaultSvg(x, winter) {
  return `<g class="vault" transform="translate(${x - 6} ${SURFACE}) scale(.72)"><g class="vault-pulse">
    <rect x="-44" y="-62" width="88" height="62" rx="6" fill="#94a3b8"/>
    ${[0, 1, 2, 3].map((r) => `<path d="M-44 ${-50 + r * 13} H44" stroke="#7b8494" stroke-width="2"/>`).join('')}
    ${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => `<path d="M${-44 + c * 26 + (r % 2 ? 13 : 0)} ${-62 + r * 13} v13" stroke="#7b8494" stroke-width="2"/>`).join('')).join('')}
    <rect x="-50" y="-70" width="100" height="10" rx="4" fill="#cbd5e1"/>
    ${winter ? '<path d="M-52 -70 q50 -14 104 0 v4 q-10 4 -16 0 q-12 6 -20 0 q-14 6 -24 0 q-12 6 -22 0 q-10 5 -22 0z" fill="#fff"/>' : ''}
    <circle cx="0" cy="-26" r="25" fill="#d97706"/><circle cx="0" cy="-26" r="21" fill="#fbbf24"/><circle cx="-3" cy="-29" r="15" fill="#fcd34d"/>
    <g class="vault-wheel" style="transform-origin:0px -26px">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="-2" y="-40" width="4" height="13" rx="2" fill="#b45309" transform="rotate(${i * 60} 0 -26)"/>`).join('')}<circle cx="0" cy="-26" r="5" fill="#b45309"/><circle cx="0" cy="-26" r="2" fill="#fff7c2"/></g>
  </g></g>`;
}

/* ---------------- gold thrown up into the vault ---------------- */
let lastDigging = null;
const MINE_X = SX - 30;
const MINER_X = [148, 262, 376];
const VAULT_DOOR = { x: SX - 6, y: SURFACE - 19 };

/**
 * Every digging Groszak tosses gold from his ore block; it flies to the shaft and up
 * into the vault, landing exactly `landInMs` from now (when the balance digits change).
 */
export function throwGold(svg, landInMs) {
  if (!svg || !svg.animate) return;
  const diggers = [...svg.querySelectorAll('.orig-mine .miner')].map((m, i) => (m.classList.contains('m-sit') ? -1 : i)).filter((i) => i >= 0);
  if (!diggers.length) return;
  const FLY = 1150;
  const ns = 'http://www.w3.org/2000/svg';
  diggers.forEach((i, n) => {
    const sx = MINE_X + MINER_X[i] + 97, sy = MINE_Y + 128;      // top of the ore block
    const bx = SX, by = MINE_Y + 96;                              // bottom of the shaft
    for (let k = 0; k < 3; k++) {
      const coin = document.createElementNS(ns, 'g');
      coin.innerHTML = '<circle r="6.5" fill="#fbbf24" stroke="#b45309" stroke-width="1.6"/><circle cx="-2" cy="-2" r="2.2" fill="#fff7c2"/>';
      coin.setAttribute('class', 'gold-toss');
      svg.appendChild(coin);
      const frames = [];
      const steps = 16;
      for (let j = 0; j <= steps; j++) {
        const u = j / steps;
        let x, y;
        if (u < 0.55) {                                             // arc from the ore to the shaft
          const v = u / 0.55;
          x = sx + (bx - sx) * v;
          y = sy + (by - sy) * v - Math.sin(Math.PI * v) * (60 + k * 12);
        } else {                                                    // straight up the shaft into the vault
          const v = (u - 0.55) / 0.45;
          x = bx + (VAULT_DOOR.x - bx) * v;
          y = by + (VAULT_DOOR.y - by) * (v * v * 0.4 + v * 0.6);
        }
        const sc = u > 0.9 ? 1 - (u - 0.9) * 6 : 1;
        frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(2)})`, opacity: u > 0.97 ? 0 : 1, offset: u });
      }
      const delay = Math.max(0, landInMs - FLY - (2 - k) * 70 - n * 40);
      const anim = coin.animate(frames, { duration: FLY, delay, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'both' });
      anim.onfinish = () => coin.remove();
    }
  });
  // the vault door glows when the gold arrives
  const vault = svg.querySelector('.vault-pulse');
  if (vault) setTimeout(() => { vault.classList.remove('vault-hit'); void vault.getBoundingClientRect(); vault.classList.add('vault-hit'); }, Math.max(0, landInMs - 60));
}

/* ---------------- the scene ---------------- */
/**
 * @returns {{svg:string, width:number}}
 */
export function buildScene(o) {
  const { now, tz, chests, unlocked, miningActive, hasDeposits, viewportWidth } = o;
  // who was already digging in the previous picture: only newly woken Groszaki play the wake-up
  const digging = [0, 1, 2].map((i) => hasDeposits && miningActive && i < unlocked);
  const prevDigging = lastDigging;
  lastDigging = digging;
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

  // the original mine, placed so that the shaft from the vault enters its left end
  s += `<g class="orig-mine" transform="translate(${MINE_X} ${MINE_Y})">${originalMine({ unlocked, miningActive, hasDeposits, prevDigging })}</g>`;
  s += vaultSvg(SX, wAt(SX).winter > 0.4);

  // ---- today marker ----
  s += `<g class="today"><path d="M${TX} ${SURFACE - 70} V${SURFACE + ROAD_H}" stroke="#db2777" stroke-width="3"/>
    <path d="M${TX} ${SURFACE - 70} h46 l-8 9 l8 9 h-46z" fill="#ec4899"/>
    <text x="${TX + 6}" y="${SURFACE - 57}" class="scene-today">${t('scene.today')}</text>
    <circle cx="${TX}" cy="${SURFACE + 9}" r="6" fill="#fff" stroke="#db2777" stroke-width="3"/></g>`;

  // speech bubble before the first deposit
  if (!hasDeposits) {
    const bx = SX - 30 + 175;
    s += `<g transform="translate(${bx - 100} ${GALLERY_TOP - 40})"><rect width="200" height="30" rx="12" fill="#fff" stroke="#f9a8d4" stroke-width="2"/>
      <text x="100" y="20" text-anchor="middle" class="scene-bubble">${t('kid.wakeHint')}</text></g>`;
  }

  return { svg: `<svg viewBox="0 0 ${W} ${SCENE_H}" width="${W}" height="${SCENE_H}" class="scene-svg" role="img" aria-labelledby="sceneTitle sceneDesc">${s}</svg>`, width: W, ppd };
}

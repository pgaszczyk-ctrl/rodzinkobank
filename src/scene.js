// "Kopalnia Marzeń": one cross-section built from the illustrator's artwork
// (assets/art, Groszaki SVG v2). Above ground the calendar landscape changes
// with the seasons along the axis; in the topsoil every chest sits exactly
// under its date; below is the mine from the mock-up (vault, shaft with the
// lift bucket, tunnel, wagon, ore wall) with the Groszaki working or resting.

import { addMonths, wallParts, wallToInstant, dayOfYear } from './calendar.js';
import { art, GROSZAK_LOOK, restRecolor } from './art.js';
import { t, fmtDate, money } from './i18n.js';

const DAY = 86400_000;
const BASE_W = 1060;              // width of the mock-up
const SKY = 180;                  // ground line
const AXIS = 192;                 // timeline ribbon (on the topsoil)
const CHEST_Y = 210;              // top of the chests
const CHEST_S = 0.68;             // chest scale (106×87 → 72×59)
const MINE_Y = 296;               // top of the mine (82 topsoil + 34 more soil)
export const SCENE_H = MINE_Y + 189;
const TX = 123;                   // "today": centre of the vault door and the shaft

/* ---------------- seasons ---------------- */
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const CENTERS = [14, 104, 195, 287]; // mid-January, -April, -July, -October
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
export const dominantSeason = (w) => SEASONS.reduce((best, s) => (w[s] > w[best] ? s : best), 'winter');
const HILL = { winter: [244, 251, 255], spring: [197, 227, 160], summer: [185, 215, 143], autumn: [232, 201, 138] };
const mix = (w, pal) => `rgb(${[0, 1, 2].map((i) => Math.round(SEASONS.reduce((s, k) => s + pal[k][i] * w[k], 0))).join(',')})`;
const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

/* ---------------- small pieces ---------------- */
const pill = (x, y, text, { fill = '#fff', stroke = '#8C5D41', color = '#29334D', w = null, cls = 'scene-pill' } = {}) => {
  const width = w || Math.max(44, text.length * 7.4 + 18);
  return `<g transform="translate(${x} ${y})"><rect x="${-width / 2}" y="-11" width="${width}" height="22" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
    <text x="0" y="4.5" text-anchor="middle" class="${cls}" fill="${color}">${text}</text></g>`;
};
const helmetOnHook = (x, y) => `<g transform="translate(${x} ${y}) scale(.62)">
  <path d="M49 -6 V10" stroke="#825244" stroke-width="4" stroke-linecap="round"/>
  <path d="M30 31 Q31 10 49 10 Q68 10 71 31 Z" fill="#FFD86D" stroke="#29334D" stroke-width="3" stroke-linejoin="round"/>
  <path d="M27 31 H75" stroke="#29334D" stroke-width="4" stroke-linecap="round"/>
  <circle cx="59" cy="22" r="6" fill="#FFF8E5" stroke="#29334D" stroke-width="3"/></g>`;

/** A rubble pile cut out of the ore wall – what the sztygar digs at. */
function oreChunk(x, y, w, h) {
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="120 ${189 - h} ${w} ${h}" overflow="hidden">
    <defs><clipPath id="chunkClip${x}"><ellipse cx="${120 + w / 2}" cy="189" rx="${w / 2}" ry="${h}"/></clipPath></defs>
    <g clip-path="url(#chunkClip${x})">${art('ore-wall')}</g></svg>`;
}

/**
 * @returns {{svg:string, width:number}}
 */
export function buildScene(o) {
  const { now, tz, chests, unlocked, miningActive, restPoses, hasDeposits, viewportWidth } = o;
  const lastDays = chests.length ? (chests[chests.length - 1].at - now) / DAY : 0;
  const horizon = Math.max(120, Math.ceil(lastDays) + 22);
  const W = Math.max(BASE_W, Math.ceil(viewportWidth));
  const ppd = (W - TX - 46) / horizon;
  const xOf = (ms) => TX + ((ms - now) / DAY) * ppd;
  const wAt = (x) => seasonWeights(dayOfYear(now + ((x - TX) / ppd) * DAY, tz));

  let s = '';
  /* ---- sky, clouds, hills ---- */
  const stops = [];
  for (let x = 0; x <= W; x += 30) stops.push(`<stop offset="${(x / W).toFixed(4)}" stop-color="${mix(wAt(x), HILL)}"/>`);
  s += `<defs><linearGradient id="hillGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0">${stops.join('')}</linearGradient></defs>
    <rect width="${W}" height="${SKY + 10}" fill="#E2F1F6"/>`;
  for (let i = 0, x = 180; x < W; i++, x += 300 + rnd(i) * 90) {
    s += `<g class="cloud-drift" style="animation-delay:${-i * 7}s;animation-duration:${50 + i * 9}s">${art('cloud', { x, y: 18 + rnd(i + 3) * 22, scale: 0.55 + rnd(i + 5) * 0.35 })}</g>`;
  }
  // spans of each dominant season (for the sun, snowmen and labels)
  const spans = [];
  let prev = null, start = 0;
  for (let x = 0; x <= W; x += 4) { const d = dominantSeason(wAt(x)); if (d !== prev) { if (prev) spans.push({ season: prev, x0: start, x1: x }); prev = d; start = x; } }
  spans.push({ season: prev, x0: start, x1: W });
  for (const sp of spans) if (sp.season === 'summer' && sp.x1 - sp.x0 > 120) s += art('sun', { x: Math.min((sp.x0 + sp.x1) / 2, W - 90), y: 14, scale: 0.86 });

  let hill = `M0 ${SKY - 7}`;
  for (let x = 0; x < W; x += 160) hill += ` Q${x + 80} ${SKY - 40 - rnd(x) * 22} ${x + 160} ${SKY - 12 - rnd(x + 1) * 14}`;
  s += `<path d="${hill} V${SKY + 2} H0Z" fill="url(#hillGrad)"/>`;

  // snow falling over winter stretches
  let flakes = '';
  for (let x = TX, i = 0; x < W; x += 24, i++) {
    if (wAt(x).winter < 0.45) continue;
    flakes += `<circle class="flake" style="animation-delay:${(rnd(i) * 7).toFixed(2)}s;animation-duration:${6 + (i % 4)}s" cx="${x + rnd(i + 9) * 16}" cy="${-6 - rnd(i + 3) * 30}" r="${1.8 + (i % 3)}" fill="#fff"/>`;
  }
  s += `<g>${flakes}</g>`;

  // trees: choose among the seasons present at that date, so changes are gradual
  const TREE = { autumn: 'tree-autumn', spring: 'tree-spring', summer: 'tree-summer', winter: 'pine-winter' };
  for (let i = 0, x = TX + 95; x < W - 40; i++, x += 92 + rnd(i) * 56) {
    const w = wAt(x);
    const present = SEASONS.filter((k) => w[k] > 0.22);
    const tot = present.reduce((a, k) => a + w[k], 0);
    let r = rnd(i * 7 + 1) * tot, season = present[0];
    for (const k of present) { if (r < w[k]) { season = k; break; } r -= w[k]; }
    const sc = 0.7 + rnd(i * 3) * 0.38;
    s += art(TREE[season], { x: x - 45 * sc, y: SKY - 103 * sc, scale: sc });
    if (season === 'autumn' && rnd(i * 11) > 0.3) {
      s += [0, 1].map((k) => `<ellipse class="leaf" style="animation-delay:${(rnd(i + k) * 5).toFixed(2)}s" cx="${x - 14 + k * 22}" cy="${SKY - 70 * sc}" rx="4" ry="2.4" fill="${k ? '#F7A950' : '#F28A3C'}"/>`).join('');
    }
  }
  for (const sp of spans) if (sp.season === 'winter' && sp.x1 - sp.x0 > 140) s += art('snowman', { x: Math.min(Math.max((sp.x0 + sp.x1) / 2, sp.x0 + 60), W - 80) - 34, y: SKY - 92 });
  // season names
  s += spans.filter((sp) => sp.x1 - sp.x0 > 60).map((sp) => {
    const x = Math.max(sp.x0, TX + 60) + 8;
    if (x > W - 80) return '';
    const label = t('season.' + sp.season);
    return `<g transform="translate(${x} 10)"><rect width="${label.length * 8 + 18}" height="22" rx="11" fill="#fff" opacity=".85"/><text x="9" y="15.5" class="scene-season">${label}</text></g>`;
  }).join('');

  /* ---- topsoil with the timeline ---- */
  for (let x = 0; x < W; x += BASE_W) s += art('topsoil', { x, y: SKY });
  s += `<rect x="0" y="${SKY + 82}" width="${W}" height="${MINE_Y - SKY - 82}" fill="#A47254"/>`;
  // a few carrots and potatoes where no chest is
  const chestXs = chests.map((c) => xOf(c.at));
  for (let i = 0, x = TX + 70; x < W - 30; i++, x += 120 + rnd(i) * 80) {
    if (chestXs.some((cx) => Math.abs(cx - x) < 70)) continue;
    const veg = rnd(i * 13) > 0.5 ? 'carrot' : 'potato';
    s += `<g transform="rotate(${Math.round(rnd(i) * 40 - 20)} ${x} ${SKY + 52})">${art(veg, { x: x - 12, y: SKY + 36 + rnd(i + 2) * 30, scale: 0.8 })}</g>`;
  }
  s += `<path d="M${TX} ${AXIS} H${W - 16}" stroke="#F5E6C8" stroke-width="6" stroke-linecap="round"/><path d="M${TX} ${AXIS + 3.5} H${W - 16}" stroke="#80563E" stroke-width="1.5" opacity=".5"/>`;
  const p0 = wallParts(now, tz);
  for (let k = 1; k <= 14; k++) {
    const ms = addMonths(wallToInstant(p0.y, p0.m, 1, 0, 0, 0, 0, tz), k, tz);
    const x = xOf(ms);
    if (x > W - 40) break;
    const label = wallParts(ms, tz).m === 1 ? fmtDate(ms, tz, 'monthYear') : fmtDate(ms, tz, 'month');
    s += `<path d="M${x} ${AXIS - 5} V${AXIS + 5}" stroke="#F5E6C8" stroke-width="3" stroke-linecap="round"/><text x="${x + 6}" y="${AXIS + 17}" class="scene-month">${label}</text>`;
  }

  /* ---- chests under their dates ---- */
  let prevX = -999, row = 0;
  const chestMarks = [];
  chests.forEach((c, i) => {
    const x = Math.max(xOf(c.at), TX + 50);
    row = x - prevX < 82 ? 1 - row : 0;
    prevX = x;
    const sc = row ? CHEST_S * 0.8 : CHEST_S;
    s += `<g class="chest-marker" data-chest="${i}">
      <path d="M${x} ${AXIS + 8} V${CHEST_Y + 6}" stroke="#F5E6C8" stroke-width="2" stroke-dasharray="3 4"/>
      ${art('chest-' + c.skin, { x: x - 53 * sc, y: CHEST_Y + (row ? 10 : 0), scale: sc })}
      ${pill(x, CHEST_Y + 72 + row * 4, money(c.amount, { sign: true }), { fill: '#FFF7D6', stroke: '#B45309', color: '#92400E' })}
    </g>`;
    chestMarks.push(pill(x, AXIS, fmtDate(c.at, tz, 'short'), { w: 62 }));
  });

  /* ---- the mine (layout of the mock-up) ---- */
  s += art('tunnel-backdrop', { x: 0, y: MINE_Y });
  if (W > 600) s += `<rect x="560" y="${MINE_Y}" width="${W - 560}" height="189" fill="#73545A"/>`;
  for (const bx of [26, 266, 497]) s += art('support-beam', { x: bx, y: MINE_Y + 12 });
  s += `<g class="${miningActive ? '' : 'mine-still'}">`;
  for (const [gx, gy, gs] of [[218, 26, 1], [242, 49, 0.7], [365, 27, 1], [388, 46, 0.7]]) s += art('gear', { x: gx, y: MINE_Y + gy, scale: gs });
  s += '</g>';
  for (const lx of [177, 324, 475]) s += art('lamp', { x: lx, y: MINE_Y + 18 });
  s += art('rails', { x: 0, y: MINE_Y + 163 });
  s += art('ore-wall', { x: 530, y: MINE_Y, sx: (W - 530) / 530, sy: 1 });

  // shaft from the vault down into the mine, with the lift bucket on its rope
  const BUCKET_Y = MINE_Y + 31;
  s += art('shaft', { x: TX - 32, y: SKY, sx: 1, sy: (MINE_Y + 126 - SKY) / 208 });
  s += `<path d="M${TX} ${SKY} V${BUCKET_Y + 14}" stroke="#F5DCA5" stroke-width="2.5"/>`;
  s += `<g id="bucket" class="bucket" style="--lift:${-(BUCKET_Y - (SKY - 54))}px">${art('lift-bucket', { x: TX - 28, y: BUCKET_Y })}</g>`;
  s += art('vault', { x: TX - 68 * 1.1, y: SKY - 118, scale: 1.1 });
  s += `<circle class="fly-coin" cx="${TX}" cy="${SKY - 18}" r="7" fill="#FFD552" stroke="#29334D" stroke-width="2.5"/>`;
  s += `<g class="${miningActive ? 'wagon-bob' : ''}">${art('wagon', { x: 136, y: MINE_Y + 102, scale: 1.02 })}</g>`;

  // Groszaki: working positions vs. resting positions
  const MY = MINE_Y + 56, MS = 1.06;
  const work = [{ x: 470, pose: 'dig' }, { x: 196, pose: 'load', flip: true }, { x: 326, pose: 'dig' }];
  const rest = [470, 255, 352];
  if (miningActive && unlocked >= 3) s += oreChunk(420, MINE_Y + 118, 62, 52);
  for (let i = 0; i < 3; i++) {
    const look = GROSZAK_LOOK[i];
    const visible = i < unlocked || (i === 0 && !hasDeposits);
    if (!visible) { s += helmetOnHook([300, 420, 150][i], MINE_Y + 64); continue; }
    if (hasDeposits && miningActive) {
      const wk = work[i];
      let a = art(look.art, { x: wk.x, y: MY, scale: MS, flip: wk.flip, cls: 'pose-' + wk.pose, attrs: `style="--d:${-i * 0.37}s"` });
      if (wk.pose === 'load') a = a.replace(/<g class="gk-pickaxe"[^>]*>.*?<\/g>/, '<g class="gk-nugget"><circle cx="25" cy="-4" r="6.5" fill="#FFD552" stroke="#29334D" stroke-width="2.5"/></g>');
      s += a;
    } else {
      const pose = !hasDeposits ? 'rest-nap' : ('rest-' + (restPoses[i] === 'nap' ? 'nap' : restPoses[i] === 'sit' ? 'sit' : 'wave'));
      s += art(pose, { x: hasDeposits ? rest[i] : 352, y: MY + 2, scale: MS, recolor: restRecolor(pose, look), attrs: `style="--d:${-i * 0.5}s"` });
    }
  }

  // labels on top
  s += pill(TX, AXIS, t('scene.today'), { fill: '#fff', stroke: '#DB2777', color: '#BE185D', w: 56 });
  s += chestMarks.join('');
  if (!hasDeposits) s += pill(410, MINE_Y + 36, t('kid.wakeHint'), { fill: '#fff', stroke: '#F472B6', color: '#BE185D' });

  return {
    svg: `<svg viewBox="0 0 ${W} ${SCENE_H}" width="${W}" height="${SCENE_H}" class="scene-svg ${miningActive ? 'mine-active' : ''}" role="img" aria-labelledby="sceneTitle sceneDesc">${s}</svg>`,
    width: W,
  };
}

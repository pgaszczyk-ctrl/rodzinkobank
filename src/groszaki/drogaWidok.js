// Droga przez rok – rysunek SVG w stylu mapy, przewijany palcem w poziomie.
// Odległość na drodze jest proporcjonalna do liczby dni.

import { dateOfDay } from './czas.js';
import { t, plural } from './teksty.js';

const PX_DAY = 7;          // pikseli na dzień
const PREFIX = 230;        // miejsce na ślady wpłat przed „Dziś”
const TAIL = 190;          // miejsce na cele „za ponad rok”
const H = 300;
const ROAD_Y = 178;
const INK = '#5a3424';

const SKY = { autumn: '#fbe2b0', winter: '#e6f0f7', spring: '#e4f2d0', summer: '#fff0b8' };
const GROUND = { autumn: '#f0b45a', winter: '#f7fbff', spring: '#a8d47a', summer: '#cfe58a' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// prosty generator liczb (stałe położenie dekoracji przy każdym rysowaniu)
function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function roadY(x) {
  return ROAD_Y + Math.sin(x / 170) * 14 + Math.sin(x / 57) * 3;
}

/** Ścieżka drogi (falista) od x0 do x1. */
function roadPath(x0, x1) {
  let d = `M${x0},${roadY(x0).toFixed(1)}`;
  for (let x = x0 + 10; x <= x1; x += 10) d += ` L${x},${roadY(x).toFixed(1)}`;
  return d;
}

// ------------------------------------------------------------------ dekoracje
const deco = {
  tree(x, y, c = '#e07a2e', s = 1) {
    return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-3" y="-4" width="6" height="16" rx="2" fill="#8a5a3a" stroke="${INK}" stroke-width="1.5"/>
      <circle cx="0" cy="-14" r="14" fill="${c}" stroke="${INK}" stroke-width="1.8"/><circle cx="-8" cy="-8" r="8" fill="${c}" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="8" cy="-8" r="8" fill="${c}" stroke="${INK}" stroke-width="1.8"/></g>`;
  },
  pine(x, y, snow, s = 1) {
    return `<g transform="translate(${x},${y}) scale(${s})"><rect x="-3" y="0" width="6" height="10" fill="#8a5a3a" stroke="${INK}" stroke-width="1.5"/>
      <path d="M0,-42 L18,-8 L-18,-8 Z M0,-30 L22,4 L-22,4 Z" fill="#3e8a55" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      ${snow ? '<path d="M0,-42 L8,-27 L-8,-27 Z" fill="#fff"/><path d="M-12,-14 q6,4 12,0 q6,4 12,0" stroke="#fff" stroke-width="3" fill="none"/>' : ''}</g>`;
  },
  xmasTree(x, y) {
    let balls = '';
    [[-8, -18, '#e63946'], [7, -24, '#ffd166'], [-12, -4, '#4ea8de'], [10, -6, '#e63946'], [0, -12, '#ffd166']]
      .forEach(([bx, by, c]) => { balls += `<circle cx="${bx}" cy="${by}" r="2.8" fill="${c}" stroke="${INK}" stroke-width="1"/>`; });
    return `<g transform="translate(${x},${y})">${deco.pine(0, 0, true, 1.15)}${balls}<path d="M0,-55 l3,6 6,1 -4.5,4 1,6 -5.5,-3 -5.5,3 1,-6 -4.5,-4 6,-1z" fill="#ffd166" stroke="${INK}" stroke-width="1.2"/></g>`;
  },
  snowman(x, y) {
    return `<g transform="translate(${x},${y})"><circle cy="-10" r="12" fill="#fff" stroke="${INK}" stroke-width="1.8"/><circle cy="-29" r="8.5" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="-3" cy="-31" r="1.3" fill="${INK}"/><circle cx="3" cy="-31" r="1.3" fill="${INK}"/><path d="M0,-28 l7,2 -7,1z" fill="#f08a24"/>
      <rect x="-7" y="-44" width="14" height="7" fill="${INK}"/><rect x="-10" y="-38" width="20" height="2.5" fill="${INK}"/>
      <path d="M-11,-14 l-11,-8 M11,-14 l11,-8" stroke="#8a5a3a" stroke-width="2"/></g>`;
  },
  egg(x, y, c) {
    return `<g transform="translate(${x},${y})"><ellipse cy="-8" rx="6" ry="8" fill="${c}" stroke="${INK}" stroke-width="1.5"/>
      <path d="M-6,-9 q3,-3 6,0 q3,3 6,0" stroke="#fff" stroke-width="1.6" fill="none"/></g>`;
  },
  flower(x, y, c) {
    return `<g transform="translate(${x},${y})"><path d="M0,0 v-12" stroke="#4f8a3c" stroke-width="2"/>
      ${[0, 72, 144, 216, 288].map((a) => `<circle cx="${Math.cos(a / 57.3) * 4}" cy="${-14 + Math.sin(a / 57.3) * 4}" r="3" fill="${c}"/>`).join('')}
      <circle cy="-14" r="2.2" fill="#ffd166"/></g>`;
  },
  bud(x, y) {
    return `<g transform="translate(${x},${y})"><path d="M0,0 q-4,-12 0,-22" stroke="#6b4a2f" stroke-width="2.5" fill="none"/>
      <ellipse cx="4" cy="-14" rx="4" ry="2.5" fill="#8fd16a" stroke="${INK}" stroke-width="1"/><ellipse cx="-3" cy="-20" rx="3.5" ry="2.2" fill="#f7b6c8" stroke="${INK}" stroke-width="1"/></g>`;
  },
  sun(x, y) {
    let rays = '';
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628;
      rays += `<path d="M${Math.cos(a) * 20},${Math.sin(a) * 20} L${Math.cos(a) * 28},${Math.sin(a) * 28}" stroke="#f2a51a" stroke-width="3" stroke-linecap="round"/>`;
    }
    return `<g transform="translate(${x},${y})">${rays}<circle r="15" fill="#ffd166" stroke="${INK}" stroke-width="1.8"/></g>`;
  },
  tent(x, y, c) {
    return `<g transform="translate(${x},${y})"><path d="M-18,0 L0,-26 L18,0 Z" fill="${c}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M0,-26 L-5,0 L5,0 Z" fill="${INK}" opacity=".55"/><path d="M0,-26 v-8" stroke="${INK}" stroke-width="1.5"/><path d="M0,-34 l8,3 -8,3z" fill="#e63946"/></g>`;
  },
  schoolbag(x, y) {
    return `<g transform="translate(${x},${y})"><rect x="-13" y="-26" width="26" height="26" rx="5" fill="#4ea8de" stroke="${INK}" stroke-width="1.8"/>
      <rect x="-9" y="-14" width="18" height="10" rx="3" fill="#ffd166" stroke="${INK}" stroke-width="1.4"/><path d="M-7,-26 q7,-9 14,0" stroke="${INK}" stroke-width="2" fill="none"/></g>`;
  },
  leaf(x, y, c, r) {
    return `<ellipse cx="${x}" cy="${y}" rx="4" ry="2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`;
  },
  flake(x, y) {
    return `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff" stroke="#c9dceb" stroke-width=".6"/>`;
  },
};

/**
 * Rysuje drogę do `el` (kontener przewijany w poziomie).
 * opts: { formatMoney(µg), formatDate(day), onFlag(goalFlag), onWaypoint(w) }
 */
export function renderRoad(el, road, opts = {}) {
  const fm = opts.formatMoney ?? ((m) => (m / 1e6).toFixed(2) + ' zł');
  const fd = opts.formatDate ?? ((d) => { const x = dateOfDay(d); return `${x.day}.${x.month}`; });
  const days = road.end - road.today;
  const xOf = (day) => PREFIX + (day - road.today) * PX_DAY;
  const W = PREFIX + days * PX_DAY + TAIL;
  const R = rng(road.today);
  const parts = [];

  // ---- tło: niebo i ziemia przechodzące płynnie między porami roku
  const stops = [];
  stops.push({ x: 0, s: road.seasons[0].season });
  for (const sg of road.seasons) stops.push({ x: (xOf(sg.from) + xOf(sg.to)) / 2, s: sg.season });
  stops.push({ x: W, s: road.seasons.at(-1).season });
  const grad = (id, pal) => `<linearGradient id="${id}" x1="0" x2="${W}" y1="0" y2="0" gradientUnits="userSpaceOnUse">${
    stops.map((p) => `<stop offset="${(p.x / W).toFixed(4)}" stop-color="${pal[p.s]}"/>`).join('')}</linearGradient>`;
  parts.push(`<defs>${grad('grSky', SKY)}${grad('grGround', GROUND)}</defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#grSky)"/>`);
  parts.push(`<path d="M0,120 ${Array.from({ length: Math.ceil(W / 60) + 1 }, (_, i) => `Q${i * 60 + 30},${110 + (i % 2) * 14} ${i * 60 + 60},120`).join(' ')} L${W},${H} L0,${H} Z" fill="url(#grGround)" stroke="${INK}" stroke-width="1.5" opacity=".95"/>`);

  // ---- dekoracje pór roku
  const decoBack = [];
  for (const sg of road.seasons) {
    const x0 = xOf(sg.from), x1 = xOf(sg.to);
    const span = x1 - x0;
    const n = Math.max(2, Math.floor(span / 95));
    for (let i = 0; i < n; i++) {
      const x = x0 + (i + 0.3 + R() * 0.4) * span / n;
      const top = R() < 0.5;
      const y = top ? 118 + R() * 10 : 250 + R() * 30;
      if (sg.season === 'autumn') decoBack.push(R() < 0.7 ? deco.tree(x, y, ['#e07a2e', '#c94a2a', '#f0b23c'][Math.floor(R() * 3)], 0.8 + R() * 0.3) : deco.leaf(x, y - 20, '#c94a2a', R() * 180));
      else if (sg.season === 'winter') decoBack.push(R() < 0.6 ? deco.pine(x, y, true, 0.7 + R() * 0.3) : deco.flake(x, y - 30));
      else if (sg.season === 'spring') decoBack.push(R() < 0.5 ? deco.flower(x, y, ['#f7b6c8', '#ffffff', '#c3a6ff'][Math.floor(R() * 3)]) : R() < 0.7 ? deco.bud(x, y) : deco.tree(x, y, '#f7c6d6', 0.8));
      else decoBack.push(R() < 0.5 ? deco.tree(x, y, '#6fbf5a', 0.85) : deco.flower(x, y, '#ffd166'));
    }
    // opady
    for (let i = 0; i < span / 40; i++) {
      const x = x0 + R() * span, y = 10 + R() * 100;
      if (sg.season === 'winter') decoBack.push(deco.flake(x, y));
      if (sg.season === 'autumn') decoBack.push(deco.leaf(x, y, ['#e07a2e', '#c94a2a', '#f0b23c'][Math.floor(R() * 3)], R() * 180));
    }
    if (sg.season === 'summer') {
      decoBack.push(deco.sun(x0 + span * 0.25, 42));
      // morze na horyzoncie
      decoBack.push(`<path d="M${x0 + span * 0.35},112 ${Array.from({ length: Math.ceil(span * 0.5 / 24) }, (_, i) => `q6,-5 12,0 q6,5 12,0`).join(' ')} V118 H${x0 + span * 0.35} Z" fill="#7cc6e8" stroke="${INK}" stroke-width="1.2"/>`);
    }
  }
  parts.push(decoBack.join(''));

  // ---- dekoracje świąt
  const wp = (key) => road.waypoints.find((w) => w.key === key);
  const w24 = wp('wigilia'); if (w24) parts.push(deco.xmasTree(xOf(w24.day) + 34, 128), deco.snowman(xOf(w24.day) - 70, 268));
  const wE = wp('wielkanoc'); if (wE) parts.push(deco.egg(xOf(wE.day) + 30, 262, '#f7b6c8'), deco.egg(xOf(wE.day) + 44, 266, '#8fd16a'), deco.egg(xOf(wE.day) + 57, 262, '#ffd166'));
  const wW = wp('wakacje'); if (wW) parts.push(deco.tent(xOf(wW.day) + 60, 262, '#e8902f'), deco.tent(xOf(wW.day) + 100, 268, '#4ea8de'), deco.tent(xOf(wW.day) + 140, 262, '#8fd16a'));
  const wS = wp('poczatekRoku'); if (wS) parts.push(deco.schoolbag(xOf(wS.day) + 34, 266));

  // ---- droga
  const path = roadPath(0, W);
  parts.push(`<path d="${path}" stroke="${INK}" stroke-width="30" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="${path}" stroke="#f6dcae" stroke-width="25" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="${path}" stroke="#e7c38a" stroke-width="2" fill="none" stroke-dasharray="10 12"/>`);

  // ---- miesiące
  for (let d = road.today + 1; d <= road.end; d++) {
    const x = dateOfDay(d);
    if (x.day !== 1) continue;
    const name = new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(Date.UTC(x.year, x.month - 1, 15));
    parts.push(`<text x="${xOf(d)}" y="${H - 8}" font-size="11" fill="${INK}" opacity=".6" text-anchor="middle">${esc(name)}${x.month === 1 ? ' ' + x.year : ''}</text>`);
    parts.push(`<path d="M${xOf(d)},${roadY(xOf(d)) + 16} v6" stroke="${INK}" opacity=".35"/>`);
  }

  // ---- ślady przeszłych wpłat (przed „Dziś”)
  road.traces.forEach((tr, i) => {
    const x = 30 + i * ((PREFIX - 60) / Math.max(1, road.traces.length - 1 || 1));
    const y = roadY(x);
    parts.push(`<g transform="translate(${x},${y})"><circle r="9" fill="#e8a25c" stroke="${INK}" stroke-width="1.6"/><text y="3.5" font-size="9" font-weight="700" text-anchor="middle" fill="${INK}">gr</text></g>`);
    parts.push(`<text x="${x}" y="${y - (i % 2 ? 36 : 18)}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">${esc(fm(tr.amount))}</text>`);
    if (tr.note) parts.push(`<text x="${x}" y="${y - (i % 2 ? 24 : 6) + 32}" font-size="10" text-anchor="middle" fill="${INK}" opacity=".75">${esc(tr.note)}</text>`);
  });

  // ---- Dziś
  const x0 = xOf(road.today);
  parts.push(`<g transform="translate(${x0},${roadY(x0)})"><path d="M0,0 V-86" stroke="${INK}" stroke-width="3"/>
    <rect x="-36" y="-110" width="72" height="28" rx="8" fill="#4a2c1a"/><text y="-91" font-size="14" font-weight="800" text-anchor="middle" fill="#fff">${esc(t('droga.dzis'))}</text>
    <circle r="6" fill="#ffd166" stroke="${INK}" stroke-width="2"/></g>`);

  // ---- drogowskazy (nad drogą). Wydarzenia bliżej niż kilka dni łączymy w jeden
  // drogowskaz; pozostałe układamy na dwóch poziomach, żeby tabliczki się nie nakładały.
  const groups = [];
  for (const w of road.waypoints) {
    const g = groups.at(-1);
    if (g && (w.day - g.at(-1).day) * PX_DAY < 40) g.push(w); else groups.push([w]);
  }
  const busy = [[], []];
  for (const g of groups) {
    const w = g.at(-1);
    const x = xOf(g[0].day);
    const y = roadY(x);
    const names = g.map((v) => (v.kind === 'wlasne' ? v.nazwa : t('wp.' + v.key)));
    const name = names.join(' · ');
    const sub = w.nights !== null ? t('droga.noce', { n: w.nights, noce: plural(w.nights, 'noc', 'noce', 'nocy') }) : fd(g[0].day);
    const bw = Math.max(110, Math.min(230, name.length * 7 + 24));
    const free = (lvl) => busy[lvl].every(([a, b]) => x + bw / 2 + 8 < a || x - bw / 2 - 8 > b);
    const level = free(0) ? 0 : free(1) ? 1 : 0;
    busy[level].push([x - bw / 2, x + bw / 2]);
    const top = level ? 4 : 62;
    parts.push(`<g class="wp" data-day="${w.day}" transform="translate(${x},0)">
      <path d="M0,${top + 50} V${y - 12}" stroke="${INK}" stroke-width="3"/>
      <rect x="${-bw / 2}" y="${top}" width="${bw}" height="52" rx="7" fill="#fffaf0" stroke="${INK}" stroke-width="2"/>
      <text y="${top + 15}" font-size="12" font-weight="800" text-anchor="middle" fill="${INK}">${esc(name)}</text>
      <text y="${top + 28}" font-size="10.5" text-anchor="middle" fill="${INK}" opacity=".75">${esc(sub)}</text>
      <text y="${top + 43}" font-size="11.5" font-weight="700" text-anchor="middle" fill="#2f7a3a">${esc(fm(w.amount))}*</text></g>`);
  }

  // ---- flagi celów (pod drogą)
  const flagLast = [-1e9, -1e9, -1e9];
  const beyondList = road.goals.filter((g) => g.beyond);
  road.goals.forEach((g, i) => {
    let x;
    if (g.beyond) x = W - TAIL + 40 + beyondList.indexOf(g) * 46;
    else x = xOf(g.day);
    let lvl = 0;
    while (lvl < 2 && x - flagLast[lvl] < 64) lvl++;
    flagLast[lvl] = x;
    const y = roadY(x) + 14;
    const pole = 38 + lvl * 22;
    const color = g.reachedNow ? '#2f9e44' : ['#e8590c', '#7048e8', '#1c7ed6', '#d6336c', '#0ca678'][i % 5];
    parts.push(`<g class="flag" data-goal="${esc(g.goal.id)}" style="cursor:pointer" transform="translate(${x},${y})">
      <rect x="-26" y="0" width="56" height="${pole + 40}" fill="transparent"/>
      <path d="M0,0 V${pole + 14}" stroke="${INK}" stroke-width="2.5"/>
      <path d="M0,${pole - 10} h30 l-7,10 7,10 h-30 z" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <text x="12" y="${pole + 5}" font-size="13" text-anchor="middle">${esc(g.goal.ikona || '⭐')}</text>
      <text x="2" y="${pole + 28}" font-size="11" font-weight="700" text-anchor="middle" fill="${INK}">${esc(g.goal.nazwa)}</text></g>`);
  });
  if (beyondList.length) {
    parts.push(`<text x="${W - TAIL / 2}" y="${ROAD_Y - 40}" font-size="13" font-weight="800" text-anchor="middle" fill="${INK}">${esc(t('droga.ponadRok'))} →</text>`);
  }

  // ---- przypis: prognoza
  parts.push(`<text x="${W - 12}" y="16" font-size="11" text-anchor="end" fill="${INK}" opacity=".7">* ${esc(t('droga.prognoza'))}: ${esc(t('droga.jesliNic'))}</text>`);
  parts.push(`<text x="${PREFIX + 12}" y="16" font-size="11" fill="${INK}" opacity=".7">* ${esc(t('droga.prognoza'))}: ${esc(t('droga.jesliNic'))}</text>`);

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('droga.tytul'))}" style="display:block;font-family:system-ui,sans-serif">${parts.join('')}</svg>`;
  el.querySelectorAll('.flag').forEach((n) => n.addEventListener('click', () => {
    const g = road.goals.find((x) => String(x.goal.id) === n.dataset.goal);
    if (g && opts.onFlag) opts.onFlag(g);
  }));
  return { width: W, xOf };
}

export const DROGA_CSS = `
.gr-road { overflow-x: auto; overflow-y: hidden; border-radius: 16px; border: 2px solid #ecd9b8;
  touch-action: pan-x; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scrollbar-width: thin; }
`;

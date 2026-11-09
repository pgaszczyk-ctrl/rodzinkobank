// SVG illustrations: the Groszaki miners, the coin heap, chests and dream pictures.

const SHIRTS = ['#38bdf8', '#f472b6', '#34d399'];

/**
 * Blocky Groszak miner in the Rodzinobank style (pixel blocks, helmet with a lamp).
 * Local coordinates: about 44×62, feet at y = 58. Poses: dig, load, wave, sit, nap, locked.
 * The third Groszak (chief) is the sztygar with a gold helmet and a badge.
 */
export function minerSvg({ pose = 'dig', chief = false, idx = 0, delay = 0 } = {}) {
  const shirt = chief ? '#a78bfa' : SHIRTS[idx % 3];
  const helmet = chief ? '#facc15' : '#fbbf24';
  const brim = chief ? '#b45309' : '#d97706';
  const d = `style="animation-delay:${delay}s"`;
  const closed = pose === 'nap';
  const eyes = closed
    ? '<rect x="14" y="14" width="4" height="1.6" fill="#2b3a55"/><rect x="21" y="14" width="4" height="1.6" fill="#2b3a55"/>'
    : '<rect x="21" y="12" width="3" height="3" fill="#fff"/><rect x="22" y="13" width="2" height="2" fill="#2b3a55"/><rect x="14" y="12" width="3" height="3" fill="#fff"/><rect x="15" y="13" width="2" height="2" fill="#2b3a55"/>';
  const head = `
    <rect x="9" y="4" width="20" height="18" fill="#f1c27d"/>
    <rect x="9" y="4" width="20" height="5" fill="#6b4423"/><rect x="9" y="4" width="3" height="9" fill="#6b4423"/>
    ${eyes}
    <rect x="17" y="17" width="6" height="2" fill="#c9875a"/>
    <rect x="7" y="0" width="24" height="6" rx="1" fill="${helmet}"/><rect x="7" y="5" width="25" height="2" fill="${brim}"/>
    ${chief ? '<rect x="7" y="2" width="24" height="1.4" fill="#fff7c2" opacity=".8"/><path d="M13 -4 l2 3 l2 -3 l2 3 l2 -3 v4 h-8z" fill="#facc15" stroke="#b45309" stroke-width=".8"/>' : ''}
    <rect x="26" y="1" width="5" height="4" fill="#fff7c2"/>
    ${closed ? '' : '<circle cx="34" cy="3" r="7" fill="#fff7c2" class="lamp-glow"/>'}`;
  const torso = `<rect x="10" y="22" width="18" height="18" fill="${shirt}"/>
    <rect x="10" y="36" width="18" height="4" fill="#7c5a2d"/><rect x="17" y="36" width="4" height="4" fill="#fcd34d"/>
    ${chief ? '<path d="M22 26 l1.4 2.8 3 .4 -2.2 2 .6 3 -2.8 -1.5 -2.8 1.5 .6 -3 -2.2 -2 3 -.4z" fill="#fde047" stroke="#b45309" stroke-width=".6"/>' : ''}`;
  const legs = `<rect x="10" y="40" width="9" height="16" fill="#3b4a8c"/><rect x="19" y="40" width="9" height="16" fill="#2f3b73"/>
    <rect x="10" y="54" width="9" height="4" fill="#4b3621"/><rect x="19" y="54" width="9" height="4" fill="#4b3621"/>`;
  const backArm = `<rect x="5" y="22" width="6" height="16" fill="${shirt}" opacity=".8"/><rect x="5" y="36" width="6" height="4" fill="#e8b88a"/>`;
  const pickHead = (x, y) => `<rect x="${x}" y="${y}" width="21" height="4" fill="#94a3b8"/><rect x="${x - 3}" y="${y + 2}" width="4" height="4" fill="#94a3b8"/><rect x="${x + 20}" y="${y + 2}" width="4" height="4" fill="#94a3b8"/>
    <rect x="${x - 5}" y="${y + 5}" width="3" height="3" fill="#64748b"/><rect x="${x + 23}" y="${y + 5}" width="3" height="3" fill="#64748b"/><rect x="${x + 2}" y="${y}" width="17" height="1.6" fill="#5eead4"/>`;
  const shovel = (x) => `<rect x="${x}" y="14" width="3" height="40" fill="#8b5a2b"/><rect x="${x - 4}" y="50" width="11" height="9" rx="2" fill="#94a3b8"/><rect x="${x - 3}" y="12" width="9" height="3" fill="#8b5a2b"/>`;

  switch (pose) {
    case 'dig':
      return `<g class="miner m-dig"><g class="miner-body" ${d}>${legs}${backArm}${torso}${head}</g>
        <g class="pick-arm" ${d}><rect x="26" y="34" width="3" height="24" fill="#8b5a2b"/><rect x="24" y="22" width="6" height="14" fill="${shirt}"/><rect x="24" y="34" width="6" height="5" fill="#f1c27d"/>${pickHead(17, 54)}</g></g>`;
    case 'load':
      return `<g class="miner m-load"><g class="miner-body" ${d}>${legs}${backArm}${torso}${head}</g>
        <g class="shovel-arm" ${d}><rect x="24" y="22" width="6" height="14" fill="${shirt}"/><rect x="24" y="34" width="6" height="5" fill="#f1c27d"/>
          <rect x="27" y="36" width="3" height="18" fill="#8b5a2b" transform="rotate(-35 28 37)"/><rect x="34" y="48" width="12" height="7" rx="2" fill="#94a3b8" transform="rotate(-35 28 37)"/>
          <rect class="nugget" x="38" y="44" width="5" height="5" fill="#fcd34d" transform="rotate(-35 28 37)"/></g></g>`;
    case 'wave':
      return `<g class="miner m-wave">${shovel(1)}${legs}<rect x="5" y="22" width="6" height="14" fill="${shirt}" opacity=".8"/><rect x="2" y="34" width="9" height="4" fill="#e8b88a"/>${torso}${head}
        <g class="wave-arm" ${d}><rect x="27" y="10" width="6" height="16" fill="${shirt}"/><rect x="27" y="5" width="6" height="6" fill="#f1c27d"/></g></g>`;
    case 'sit':
      return `<g class="miner m-sit"><rect x="2" y="44" width="34" height="14" rx="4" fill="#a8b3c4"/><rect x="2" y="44" width="34" height="4" rx="2" fill="#c3ccd8"/>
        <g transform="translate(0 6)"><g class="breathe" ${d}>${backArm}${torso}${head}</g>
        <rect x="14" y="34" width="20" height="8" fill="#3b4a8c"/><rect x="28" y="34" width="8" height="18" fill="#2f3b73"/><rect x="28" y="48" width="10" height="4" fill="#4b3621"/>
        <rect x="24" y="24" width="6" height="12" fill="${shirt}"/><rect x="24" y="34" width="6" height="4" fill="#f1c27d"/>
      </g></g>`;
    case 'nap':
      return `<g class="miner m-nap"><rect x="0" y="50" width="40" height="8" rx="3" fill="#a8b3c4"/>
        <g transform="rotate(-80 20 54) translate(2 6)"><g class="breathe" ${d}>${legs}${backArm}${torso}${head}</g></g>
        <g class="zzz" ${d}><text x="30" y="20" font-family="Baloo 2, sans-serif" font-weight="800" font-size="13" fill="#64748b">Z</text>
          <text x="38" y="9" font-family="Baloo 2, sans-serif" font-weight="800" font-size="10" fill="#94a3b8">z</text>
          <text x="44" y="0" font-family="Baloo 2, sans-serif" font-weight="800" font-size="8" fill="#cbd5e1">z</text></g></g>`;
    default: // locked slot: dashed helmet outline
      return `<g class="miner m-locked" opacity=".4"><rect x="9" y="4" width="20" height="18" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3"/>
        <rect x="7" y="0" width="24" height="6" rx="1" fill="none" stroke="#64748b" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="19" y="19" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="13" fill="#64748b">?</text></g>`;
  }
}

/** Portrait of the chief Groszak shown next to the balance. */
export function minerPortrait({ cls = '', sleeping = false, title = '' } = {}) {
  return `<svg viewBox="-6 -10 52 72" class="${cls}" role="img" aria-label="${title}">
    <ellipse cx="19" cy="60" rx="18" ry="3" fill="#2b3a55" opacity=".12"/>
    <g class="portrait-bob">${minerSvg({ pose: sleeping ? 'nap' : 'wave', chief: true })}</g></svg>`;
}

/** Heap of coins on the surface – where the winch delivers microgrosze. */
export function coinHeapSvg() {
  const c = (x, y, r, f) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.45}" fill="${f}" stroke="#b45309" stroke-width="1"/>`;
  return `<g class="coin-heap"><rect x="-34" y="-8" width="68" height="10" rx="2" fill="#8b5a2b"/><rect x="-34" y="-8" width="68" height="3" fill="#a0703f"/>
    ${c(-20, -12, 9, '#fbbf24')}${c(-4, -12, 10, '#fcd34d')}${c(14, -12, 9, '#fbbf24')}${c(-12, -19, 9, '#fde68a')}${c(6, -19, 9, '#fbbf24')}${c(-3, -26, 8, '#fcd34d')}
    <rect x="22" y="-36" width="4" height="10" fill="#fcd34d" stroke="#b45309" stroke-width=".8"/><rect x="21" y="-40" width="6" height="5" fill="#fbbf24" stroke="#b45309" stroke-width=".8"/>
    <path class="heap-sparkle" d="M-24 -34 l2 -5 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2z" fill="#fff7c2" stroke="#fbbf24" stroke-width=".8"/></g>`;
}

const SKINS = {
  wood:   { box: '#b7793f', dark: '#8a5527', band: '#5b3a1e', lid: '#c98a4d', shine: '#e0ac74', gem: null },
  silver: { box: '#cbd5e1', dark: '#94a3b8', band: '#64748b', lid: '#e2e8f0', shine: '#f8fafc', gem: '#38bdf8' },
  gold:   { box: '#fbbf24', dark: '#d97706', band: '#b45309', lid: '#fcd34d', shine: '#fff7c2', gem: '#f43f5e' },
};

/** Treasure chest centred on (0,0) bottom; ~56×46 at scale 1. */
export function chestSvg(skin = 'wood', { open = false } = {}) {
  const s = SKINS[skin] || SKINS.wood;
  return `<g class="chest chest-${skin}">
    <ellipse cx="0" cy="2" rx="30" ry="5" fill="#000" opacity=".15"/>
    <rect x="-28" y="-28" width="56" height="30" rx="4" fill="${s.box}" stroke="${s.dark}" stroke-width="2"/>
    ${skin === 'wood' ? '<path d="M-28 -18 H28 M-28 -8 H28" stroke="#8a5527" stroke-width="1.4" opacity=".6"/>' : ''}
    <rect x="-20" y="-28" width="6" height="30" fill="${s.band}"/><rect x="14" y="-28" width="6" height="30" fill="${s.band}"/>
    <rect x="-6" y="-24" width="12" height="12" rx="2" fill="${s.band}"/><circle cx="0" cy="-18" r="2.4" fill="${s.shine}"/>
    <g class="chest-lid" ${open ? 'transform="rotate(-38 -28 -28)"' : ''}>
      <path d="M-29 -28 q0 -18 29 -18 q29 0 29 18z" fill="${s.lid}" stroke="${s.dark}" stroke-width="2"/>
      <rect x="-20" y="-44" width="6" height="16" fill="${s.band}"/><rect x="14" y="-44" width="6" height="16" fill="${s.band}"/>
      <path d="M-22 -36 q10 -6 18 -6" stroke="${s.shine}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
      ${s.gem ? `<path d="M0 -42 l4 4 l-4 4 l-4 -4z" fill="${s.gem}" stroke="#fff" stroke-width="1"/>` : ''}
    </g>
    ${skin !== 'wood' ? `<path class="chest-sparkle" d="M24 -46 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2z" fill="${s.shine}" stroke="${s.dark}" stroke-width=".8"/>` : ''}
  </g>`;
}

export function chestIcon(skin, cls = 'w-8 h-8') {
  return `<svg viewBox="-34 -54 68 60" class="${cls}" aria-hidden="true">${chestSvg(skin)}</svg>`;
}

/** Logo mark: a gold grosz coin wearing a miner's helmet. */
export function logoMark(cls = 'w-11 h-11') {
  return `<svg viewBox="0 0 64 64" class="${cls}" aria-hidden="true">
    <circle cx="32" cy="38" r="22" fill="#fbbf24" stroke="#d97706" stroke-width="4"/>
    <circle cx="32" cy="38" r="15" fill="none" stroke="#fde68a" stroke-width="2"/>
    <text x="32" y="46" text-anchor="middle" font-family="Baloo 2, sans-serif" font-weight="800" font-size="20" fill="#b45309">1</text>
    <path d="M12 22 q20 -24 40 0z" fill="#fbbf24" stroke="#d97706" stroke-width="2"/><path d="M8 22 h48" stroke="#b45309" stroke-width="4" stroke-linecap="round"/>
    <rect x="28" y="6" width="8" height="7" rx="2" fill="#fff7c2" stroke="#d97706" stroke-width="1.5"/>
  </svg>`;
}

const svgUri = (s) => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);

/** Built-in dream illustrations (choosable in the parent zone). */
export const DREAM_ART = {
  bricks: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#d1fae5"/><g transform="translate(30 40)"><rect y="30" width="140" height="62" rx="10" fill="#ef4444"/><rect y="30" width="140" height="12" rx="6" fill="#f87171"/><g fill="#ef4444"><rect x="12" y="12" width="28" height="22" rx="6"/><rect x="56" y="12" width="28" height="22" rx="6"/><rect x="100" y="12" width="28" height="22" rx="6"/></g><g fill="#fca5a5"><rect x="12" y="12" width="28" height="6" rx="3"/><rect x="56" y="12" width="28" height="6" rx="3"/><rect x="100" y="12" width="28" height="6" rx="3"/></g></g><g transform="translate(116 16)"><rect y="16" width="56" height="30" rx="6" fill="#3b82f6"/><rect x="8" y="5" width="16" height="14" rx="4" fill="#3b82f6"/><rect x="32" y="5" width="16" height="14" rx="4" fill="#3b82f6"/></g></svg>`),
  scooter: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#e0f2fe"/><rect y="124" width="200" height="26" fill="#bae6fd"/><path d="M140 26 L150 112" stroke="#475569" stroke-width="10" stroke-linecap="round"/><path d="M122 26 H158" stroke="#0ea5e9" stroke-width="12" stroke-linecap="round"/><rect x="40" y="100" width="112" height="14" rx="7" fill="#8b5cf6"/><circle cx="52" cy="120" r="17" fill="#2b3a55"/><circle cx="52" cy="120" r="7" fill="#e2e8f0"/><circle cx="150" cy="120" r="17" fill="#2b3a55"/><circle cx="150" cy="120" r="7" fill="#e2e8f0"/></svg>`),
  console: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#ede9fe"/><path d="M40 60 Q40 42 58 42 H142 Q160 42 160 60 L170 110 Q174 132 152 130 Q140 128 132 112 H68 Q60 128 48 130 Q26 132 30 110Z" fill="#6d28d9"/><rect x="58" y="68" width="10" height="30" rx="3" fill="#ede9fe"/><rect x="48" y="78" width="30" height="10" rx="3" fill="#ede9fe"/><circle cx="134" cy="72" r="7" fill="#fcd34d"/><circle cx="148" cy="86" r="7" fill="#f472b6"/><circle cx="120" cy="86" r="7" fill="#34d399"/><circle cx="134" cy="100" r="7" fill="#38bdf8"/></svg>`),
  bike: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#fef3c7"/><circle cx="55" cy="100" r="30" fill="none" stroke="#2b3a55" stroke-width="8"/><circle cx="148" cy="100" r="30" fill="none" stroke="#2b3a55" stroke-width="8"/><path d="M55 100 L85 55 H135 L148 100 M85 55 L105 100 H55 M105 100 L135 55" stroke="#ef4444" stroke-width="7" fill="none" stroke-linejoin="round"/><path d="M78 46 h18 M130 40 l6 15" stroke="#2b3a55" stroke-width="6" stroke-linecap="round"/></svg>`),
  teddy: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#fce7f3"/><circle cx="72" cy="34" r="16" fill="#b45309"/><circle cx="128" cy="34" r="16" fill="#b45309"/><circle cx="100" cy="58" r="34" fill="#d97706"/><ellipse cx="100" cy="116" rx="40" ry="32" fill="#d97706"/><ellipse cx="100" cy="68" rx="14" ry="10" fill="#fde68a"/><circle cx="88" cy="52" r="4" fill="#2b3a55"/><circle cx="112" cy="52" r="4" fill="#2b3a55"/><circle cx="100" cy="64" r="4" fill="#2b3a55"/><path d="M84 92 h32" stroke="#ef4444" stroke-width="8" stroke-linecap="round"/></svg>`),
  ball: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#dcfce7"/><rect y="118" width="200" height="32" fill="#86efac"/><circle cx="100" cy="76" r="46" fill="#fff" stroke="#2b3a55" stroke-width="4"/><path d="M100 54 l20 14 -8 24 h-24 l-8 -24z" fill="#2b3a55"/><path d="M100 54 V32 M120 68 l22 -6 M112 92 l12 18 M88 92 l-12 18 M80 68 l-22 -6" stroke="#2b3a55" stroke-width="4"/></svg>`),
};
export const DREAM_ART_KEYS = Object.keys(DREAM_ART);
export const DEFAULT_DREAM_ART = ['bricks', 'scooter', 'console'];

/** Resolve a stored dream image: "art:<key>", data/http URL, or the slot default. */
export function dreamImage(img, slot) {
  if (img && img.startsWith('art:') && DREAM_ART[img.slice(4)]) return DREAM_ART[img.slice(4)];
  if (img) return img;
  return DREAM_ART[DEFAULT_DREAM_ART[slot] || 'bricks'];
}

// Treasure chests painted to match the "Cztery pory roku" scene: soft gradients,
// warm brown outlines, highlights and a light paper grain. The lid is a separate
// group (class "chest-lid") hinged at its own (0,0), so it can be opened.
// Drawing area: 106 × 87, the chest stands on y = 80.

let uid = 0;
const SKINS = {
  wood: { body: ['#c98b55', '#a0643a', '#7a4527'], lid: ['#d79a5f', '#a8693c'], band: ['#6b6f78', '#4a4d55'], plank: '#7a4527', line: '#5c3420', lock: ['#ffd77a', '#c98a2e'] },
  silver: { body: ['#e3e8ef', '#b5bfcc', '#8a94a3'], lid: ['#f2f5f9', '#b9c3cf'], band: ['#7a8494', '#566070'], plank: '#9aa4b2', line: '#4f5866', lock: ['#ffe08a', '#c99a2e'] },
  gold: { body: ['#ffd36b', '#f0a934', '#c47a1c'], lid: ['#ffe08a', '#e9a43a'], band: ['#b06a1c', '#7f4a12'], plank: '#d08a26', line: '#7a4615', lock: ['#fff3c4', '#e0a73a'] },
};

/** Markup of a chest (an SVG <g>) in its 106 × 87 drawing area. */
export function chestMarkup(skin = 'wood', { open = 0 } = {}) {
  const c = SKINS[skin] || SKINS.wood;
  const id = `ch${++uid}`;
  const shine = skin === 'wood' ? '' : `<path class="chest-shine" d="M86 6 l2.5 -7 l2.5 7 l7 2.5 l-7 2.5 l-2.5 7 l-2.5 -7 l-7 -2.5z" fill="#fffbe6" opacity=".9"/>`;
  return `<g class="chest chest-${skin}">
    <defs>
      <linearGradient id="${id}b" x1="0" y1="40" x2="0" y2="80" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.body[0]}"/><stop offset=".55" stop-color="${c.body[1]}"/><stop offset="1" stop-color="${c.body[2]}"/></linearGradient>
      <linearGradient id="${id}l" x1="0" y1="-28" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.lid[0]}"/><stop offset="1" stop-color="${c.lid[1]}"/></linearGradient>
      <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c.band[0]}"/><stop offset="1" stop-color="${c.band[1]}"/></linearGradient>
      <filter id="${id}g" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="4" result="n"/>
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 .2  0 0 0 0 .12  0 0 0 0 .05  0 0 0 .16 0" result="a"/>
        <feComposite in="a" in2="SourceGraphic" operator="in" result="grain"/>
        <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge>
      </filter>
    </defs>
    <ellipse cx="53" cy="81" rx="46" ry="5" fill="#3a2414" opacity=".28"/>
    <g filter="url(#${id}g)">
      <rect x="9" y="38" width="88" height="42" rx="7" fill="url(#${id}b)" stroke="${c.line}" stroke-width="2.6"/>
      <path d="M12 52 H94 M12 66 H94" stroke="${c.plank}" stroke-width="1.6" opacity=".55"/>
      <path d="M14 42 H58" stroke="#fff6dc" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>
      <rect x="20" y="38.5" width="10" height="41" rx="2.5" fill="url(#${id}m)" stroke="${c.line}" stroke-width="1.4"/>
      <rect x="76" y="38.5" width="10" height="41" rx="2.5" fill="url(#${id}m)" stroke="${c.line}" stroke-width="1.4"/>
      <circle cx="25" cy="46" r="1.6" fill="#f3efe6"/><circle cx="25" cy="72" r="1.6" fill="#f3efe6"/><circle cx="81" cy="46" r="1.6" fill="#f3efe6"/><circle cx="81" cy="72" r="1.6" fill="#f3efe6"/>
    </g>
    <g transform="translate(9 39)"><g class="chest-lid" ${open ? `transform="rotate(${-open})"` : ''}>
      <g filter="url(#${id}g)">
        <path d="M0 0 V-9 Q0 -27 18 -27 H70 Q88 -27 88 -9 V0 Z" fill="url(#${id}l)" stroke="${c.line}" stroke-width="2.6" stroke-linejoin="round"/>
        <path d="M6 -6 Q7 -21 20 -22 H52" fill="none" stroke="#fff6dc" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>
        <path d="M11 -1 V-22 M67 -1 V-22" stroke="url(#${id}m)" stroke-width="10" stroke-linecap="round"/>
        <path d="M2 -1 H86" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>
      </g>
      <rect x="37" y="-8" width="15" height="17" rx="3.5" fill="${c.lock[0]}" stroke="${c.line}" stroke-width="2.2"/>
      <path d="M44.5 -2 v5" stroke="${c.line}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M39 -6 h7" stroke="#fffbea" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>
    </g></g>
    ${shine}
  </g>`;
}

/** A standalone <svg> chest icon for the UI. */
export function chestIconSvg(skin, cls = 'w-8 h-8') {
  return `<svg viewBox="2 4 102 84" class="${cls}" aria-hidden="true">${chestMarkup(skin)}</svg>`;
}

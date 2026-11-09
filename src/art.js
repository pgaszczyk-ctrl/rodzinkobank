// Illustration helpers: chest icons, the balance mascot, the logo and dream pictures.
// Characters and mine pieces come from assets/scene (see src/scenedata.js), chests from src/chests.js.

import { SCENE } from './scenedata.js';
import { chestIconSvg } from './chests.js';

/** Chest icon (wood / silver / gold), painted like the scene. */
export function chestIcon(skin, cls = 'w-8 h-8') {
  return chestIconSvg(skin || 'wood', cls);
}

/** A Groszak from the illustration next to the balance: holding a gold nugget, or dozing before the first deposit. */
export function minerPortrait({ cls = '', sleeping = false, title = '' } = {}) {
  const a = SCENE.assets[sleeping ? 'gornicy/gornik-odpoczywa' : 'gornicy/gornik-ze-zlotem'];
  const vb = sleeping ? '40 200 500 300' : '140 70 300 430';
  return `<svg viewBox="${vb}" class="portrait ${cls}" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}><image href="${a.url}" width="${a.size[0]}" height="${a.size[1]}"/></svg>`;
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

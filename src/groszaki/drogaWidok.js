// Droga przez rok – pionowa panorama pod miasteczkiem, przewijana razem ze stroną.
//
// Tło to jedna zapętlona panorama roku (assets/groszaki/droga/rok.jpg), u góry jest „dziś”.
// Wydarzenia to obrazki postawione obok drogi przy swoich datach, cele – znaczniki
// z obrazkiem celu. Na drodze nie ma napisów: nazwa, data i prognoza pokazują się
// po dotknięciu. Groszak idzie drogą: trzyma się środka ekranu, a droga przesuwa się pod nim.
// Układ (gdzie co stoi) liczy layoutRoad() w droga.js; tu tylko DOM i animacja.

import { layoutRoad, roadXAt } from './droga.js';
import { createGroszak, drawGroszak } from './kukielka.js';
import { t, plural } from './teksty.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => `${(v * 100).toFixed(3)}%`;
// Cel to zwykłe szare pudełko kartonowe z naklejonym obrazkiem tego, co jest w środku
// (nie prezent). Rysunek tymczasowy – do podmiany na obrazek od grafika.
const BOX_SVG = `<svg class="gr-road-box" viewBox="0 0 100 100" aria-hidden="true">
  <ellipse cx="50" cy="94" rx="44" ry="5" fill="rgba(60,30,10,.22)"/>
  <path d="M8 34 L50 22 L92 34 L50 46 Z" fill="#d3cdc2" stroke="#5a3424" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M8 34 L50 46 L50 93 L8 81 Z" fill="#b7b0a4" stroke="#5a3424" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M92 34 L50 46 L50 93 L92 81 Z" fill="#a39c90" stroke="#5a3424" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M29 28 L71 40" stroke="#5a3424" stroke-width="1.6" opacity=".55"/>
  <path d="M26 29 L32 27.3 L74 39.3 L68 41 Z" fill="#c9b48e" opacity=".8"/>
  <path d="M68 41 L74 39.3 L74 56 L68 57.7 Z" fill="#c9b48e" opacity=".8"/>
</svg>`;
// Mrugające tło za pudełkiem celu: poświata i iskierki.
const GLOW = `<span class="gr-road-glow" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;
const WALKER = 0.12;         // wielkość Groszaka (ułamek szerokości drogi)
const VIEW_Y = 0.55;         // na jakiej wysokości ekranu idzie Groszak

export class DrogaWidok {
  /** opts: { base, manifest (czesci.json), data (droga-rok.json), material (kukiełka) } */
  constructor(el, { base, manifest, data, material }) {
    this.el = el;
    this.base = base;
    this.data = data;
    this.objects = manifest.obiekty?.droga || {};
    this.sizes = Object.fromEntries(Object.entries(this.objects).map(([k, v]) => [k, [v.w, v.h]]));
    this.g = material ? createGroszak(material, { action: 'idle', dir: 1 }) : null;
    this.walkY = null;           // położenie Groszaka (px od góry drogi)
    this.lastScroll = 0;
    this.still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.raf = 0;
    this.visible = false;
    this.onScroll = () => { this.lastScroll = performance.now(); };
    addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('click', (e) => { if (this.tip && !e.target.closest('.gr-road-obj')) this.tip.hidden = true; });
    new IntersectionObserver(([en]) => {
      this.visible = en.isIntersecting;
      if (this.visible && !this.raf) this.raf = requestAnimationFrame((n) => this.frame(n));
    }).observe(el);
  }

  /** opts: { formatMoney(µg), formatDate(day), onGoal(flag) } */
  render(road, opts = {}) {
    this.road = road;
    this.opts = opts;
    const L = this.L = layoutRoad(road, this.data, { sizes: this.sizes });
    const span = L.y1 - L.y0;
    const ty = (y) => pct((y - L.y0) / span);
    const tiles = Math.ceil(L.y1);
    const parts = [];
    parts.push(`<div class="gr-road-bg" style="top:${pct(-L.y0 / span)};height:${pct(tiles / span)};
      background-image:url('${this.base}${this.data.plik}');background-size:100% ${pct(1 / tiles)}"></div>`);
    L.items.forEach((it, i) => {
      if (it.type === 'wp') {
        const o = this.objects[it.decor];
        const badge = it.decor === 'inne' && it.w.ikona ? `<span class="gr-road-badge">${esc(it.w.ikona)}</span>` : '';
        parts.push(`<button class="gr-road-obj" data-i="${i}" style="left:${pct(it.x)};top:${ty(it.y)};width:${pct(it.wFrac)}"
          aria-label="${esc(this.label(it.w))}"><img src="${this.base}${o.plik}" alt="" draggable="false">${badge}</button>`);
      } else {
        const g = it.flag;
        parts.push(`<button class="gr-road-goal${g.reachedNow ? ' done' : ''}" data-goal="${esc(g.goal.id)}"
          style="left:${pct(it.x)};top:${ty(it.y)};width:${pct(it.wFrac)}" aria-label="${esc(g.goal.nazwa)}">
          ${GLOW}${BOX_SVG}<span class="gr-road-sticker">${esc(g.goal.ikona || '⭐')}</span>${g.reachedNow ? '<span class="gr-road-ok">✓</span>' : ''}</button>`);
      }
    });
    parts.push('<div class="gr-road-fade"></div><canvas class="gr-road-walker" aria-hidden="true"></canvas><div class="gr-road-tip" hidden></div>');
    this.el.className = 'gr-road';
    this.el.style.aspectRatio = `1 / ${(span * L.aspect).toFixed(4)}`;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', t('droga.tytul'));
    this.el.innerHTML = parts.join('');
    this.canvas = this.el.querySelector('.gr-road-walker');
    this.tip = this.el.querySelector('.gr-road-tip');
    this.el.querySelectorAll('.gr-road-obj').forEach((b) => b.addEventListener('click', () => this.showTip(L.items[+b.dataset.i], b)));
    this.el.querySelectorAll('.gr-road-goal').forEach((b) => b.addEventListener('click', () => {
      const f = road.goals.find((x) => String(x.goal.id) === b.dataset.goal);
      if (!f) return;
      this.scrollToGoal(f.goal.id);
      opts.onGoal?.(f);
    }));
    if (this.visible && !this.raf) this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  label(w) { return w.kind === 'wlasne' ? w.nazwa : t('wp.' + w.key); }

  showTip(it, btn) {
    const w = it.w;
    const fm = this.opts.formatMoney ?? ((m) => (m / 1e6).toFixed(2) + ' zł');
    const fd = this.opts.formatDate ?? String;
    const when = w.nights !== null ? t('droga.noce', { n: w.nights, noce: plural(w.nights, 'noc', 'noce', 'nocy') }) : fd(w.day);
    this.tip.innerHTML = `<b>${esc(this.label(w))}</b><span>${esc(when)}</span>
      <span class="gr-road-tip-m">${esc(fm(w.amount))}*</span><small>* ${esc(t('droga.prognoza'))}: ${esc(t('droga.jesliNic'))}</small>`;
    this.tip.style.left = pct(Math.min(0.8, Math.max(0.2, it.x)));
    const L = this.L;
    // dymek nad obrazkiem; przy samej górze drogi – pod nim
    const top = (it.y - it.h * 0.92 - L.y0) / (L.y1 - L.y0);
    const below = top * this.el.getBoundingClientRect().height < 110;
    this.tip.classList.toggle('below', below);
    this.tip.style.top = below ? btn.style.top : pct(top);
    this.tip.hidden = false;
  }

  /** Przewija stronę tak, żeby cel był na wysokości Groszaka – Groszak sam do niego „dojdzie”. */
  scrollToGoal(id) {
    const it = this.L?.items.find((i) => i.type === 'goal' && String(i.flag.goal.id) === String(id));
    if (!it) return;
    const r = this.el.getBoundingClientRect();
    const y = (it.y - this.L.y0) / (this.L.y1 - this.L.y0) * r.height;
    scrollTo({ top: scrollY + r.top + y - innerHeight * VIEW_Y, behavior: this.still ? 'auto' : 'smooth' });
  }

  frame(now) {
    this.raf = 0;
    if (!this.visible || !this.L || !this.g) return;
    const L = this.L, r = this.el.getBoundingClientRect();
    const span = L.y1 - L.y0;
    const pxOf = (y) => (y - L.y0) / span * r.height;
    const yOfPx = (px) => L.y0 + px / r.height * span;
    const target = Math.min(pxOf(L.yEnd), Math.max(pxOf(L.yToday), innerHeight * VIEW_Y - r.top));
    const dt = Math.min(0.1, (now - (this.prevNow || now)) / 1000);
    this.prevNow = now;
    if (this.walkY === null || this.still) this.walkY = target;
    else this.walkY += (target - this.walkY) * Math.min(1, dt * 6);
    const moving = Math.abs(target - this.walkY) > 1 || now - this.lastScroll < 220;
    const y = yOfPx(this.walkY);
    const x = roadXAt(this.data, y) * r.width;
    const dx = (roadXAt(this.data, y + 0.004) - roadXAt(this.data, y - 0.004)) * r.width;
    const g = this.g;
    g.action = moving ? 'walk' : 'idle';
    g.dir = Math.max(-1, Math.min(1, dx / 20));

    const D = WALKER * r.width, dpr = Math.min(2, devicePixelRatio || 1);
    const cw = Math.ceil(D * 1.8), ch = Math.ceil(D * 2);
    const c = this.canvas;
    if (c.width !== Math.round(cw * dpr)) {
      c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
      c.style.width = cw + 'px'; c.style.height = ch + 'px';
    }
    c.style.transform = `translate(${(x - cw / 2).toFixed(1)}px, ${(this.walkY - ch * 0.9).toFixed(1)}px)`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    Object.assign(g, { x: cw / 2, y: ch * 0.9, size: D });
    drawGroszak(ctx, g, now, dpr, this.still);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
}

export const DROGA_CSS = `
.gr-road { position: relative; width: 100%; max-width: 640px; margin: 0 auto; overflow: hidden; border-radius: 18px;
  border: 2px solid #ecd9b8; background: #a9cf6b; -webkit-user-select: none; user-select: none; }
.gr-road-bg { position: absolute; left: 0; right: 0; background-repeat: repeat-y; pointer-events: none; }
.gr-road-obj, .gr-road-goal { position: absolute; transform: translate(-50%, -92%); padding: 0; border: 0; background: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent; }
.gr-road-obj img { display: block; width: 100%; height: auto; filter: drop-shadow(0 3px 3px rgba(60,30,10,.25)); transition: transform .15s; }
.gr-road-obj:active img { transform: scale(.94); }
.gr-road-badge { position: absolute; left: 50%; top: 24%; transform: translateX(-50%); font-size: clamp(10px, 3vw, 18px); }
.gr-road-goal { aspect-ratio: 1; container-type: inline-size; }
.gr-road-glow { position: absolute; left: -45%; top: -50%; width: 190%; height: 190%; pointer-events: none;
  background: radial-gradient(closest-side, rgba(255,214,90,1), rgba(255,170,40,.6) 45%, rgba(255,170,40,0));
  animation: grGlow 1.8s ease-in-out infinite; }
.gr-road-glow i { position: absolute; width: 14%; aspect-ratio: 1; background: #fff3a8; filter: drop-shadow(0 0 2px #e8902f);
  clip-path: polygon(50% 0, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0 50%, 38% 38%);
  animation: grTwinkle 1.4s ease-in-out infinite; }
.gr-road-glow i:nth-child(1) { left: 22%; top: 22%; }
.gr-road-glow i:nth-child(2) { left: 70%; top: 18%; animation-delay: .5s; width: 10%; }
.gr-road-glow i:nth-child(3) { left: 80%; top: 55%; animation-delay: .9s; }
.gr-road-glow i:nth-child(4) { left: 12%; top: 58%; animation-delay: .3s; width: 10%; }
.gr-road-glow i:nth-child(5) { left: 46%; top: 6%; animation-delay: 1.1s; width: 9%; }
@keyframes grGlow { 0%, 100% { opacity: .55; transform: scale(.92); } 50% { opacity: 1; transform: scale(1.05); } }
@keyframes grTwinkle { 0%, 100% { opacity: 0; transform: scale(.3) rotate(0); } 50% { opacity: 1; transform: scale(1) rotate(45deg); } }
@media (prefers-reduced-motion: reduce) { .gr-road-glow, .gr-road-glow i { animation: none; } .gr-road-glow i { opacity: .8; } }
.gr-road-box { position: relative; display: block; width: 100%; height: 100%; overflow: visible; transition: transform .15s; }
.gr-road-goal:active .gr-road-box { transform: scale(.94); }
/* naklejka na przedniej (lewej) ścianie pudełka */
.gr-road-sticker { position: absolute; z-index: 1; left: 13%; top: 50%; width: 31%; aspect-ratio: 1; display: grid; place-items: center;
  background: #fffdf7; border: 1.5px solid #5a3424; border-radius: 4px; transform: skewY(16deg);
  font-size: 19cqw; line-height: 1; overflow: hidden; }
.gr-road-ok { position: absolute; z-index: 1; right: 0; top: 4%; width: 34%; aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%;
  background: #2f9e44; color: #fff; border: 2px solid #fff; font-weight: 900; font-size: 20cqw; }
.gr-road-fade { position: absolute; left: 0; right: 0; bottom: 0; height: 90px; pointer-events: none;
  background: linear-gradient(to bottom, rgba(255,250,240,0), rgba(255,250,240,.85)); }
.gr-road-walker { position: absolute; left: 0; top: 0; pointer-events: none; will-change: transform; }
.gr-road-tip { position: absolute; z-index: 2; transform: translate(-50%, calc(-100% - 14px)); display: grid; gap: 2px; text-align: center;
  background: #fff; border: 2px solid #4a2c1a; border-radius: 14px; padding: 8px 12px; color: #4a2c1a; font-size: 14px; max-width: 220px;
  box-shadow: 0 6px 18px rgba(0,0,0,.15); }
.gr-road-tip.below { transform: translate(-50%, 10px); }
.gr-road-tip[hidden] { display: none; }
.gr-road-tip-m { font-weight: 800; color: #2f7a3a; font-size: 16px; }
.gr-road-tip small { font-size: 11px; opacity: .7; }
`;

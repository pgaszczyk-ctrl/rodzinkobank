// Miasteczko Groszaków na <canvas>: mapa pory roku z przesuwaniem i
// przybliżaniem, Groszaki z planami (przesłony), okruszki lecące do Skarbca,
// delikatne efekty pór roku i dymki po dotknięciu.

import { loadMaterial, createGroszak, wave, hitTest } from './kukielka.js';
import { prepareOccluders, drawGroszakiWithDepth } from './przeslony.js';
import { buildGraph } from './trasy.js';
import { TownSim } from './symulacja.js';
import { seasonOfMonth } from './kalendarz.js';
import { t } from './teksty.js';

export const MAP_W = 2000;
export const MAP_H = 1116;
const SEASON_FILE = { winter: 'mapa-zima.jpg', spring: 'mapa-wiosna.jpg', summer: 'mapa-lato.jpg', autumn: 'mapa-jesien.jpg' };
// Kominy z dymem (piksele mapy)
const CHIMNEYS = [[500, 400], [381, 426], [301, 476]];

function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Nie mogę wczytać ' + src));
    i.src = src;
  });
}

export class Miasteczko {
  /**
   * wrap – element z <canvas> w środku (ma stały rozmiar, touch-action: none).
   * opts: { base: 'assets/groszaki/', material: 'miedziany', formatMoney, season, still }
   */
  constructor(wrap, opts = {}) {
    this.wrap = wrap;
    this.canvas = wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.base = opts.base ?? './assets/groszaki/';
    this.materialId = opts.material ?? 'miedziany';
    this.formatMoney = opts.formatMoney ?? ((m) => String(m));
    this.still = opts.still ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.season = opts.season ?? seasonOfMonth(new Date().getMonth() + 1);
    this.maps = {};
    this.prevMap = null;
    this.fadeStart = 0;
    this.cam = { x: MAP_W / 2, y: MAP_H / 2, z: 1 };
    this.cssW = 0; this.cssH = 0; this.dpr = 1;
    this.pointers = new Map();
    this.pinch = null;
    this.moved = 0;
    this.say = { text: '', until: 0, g: null };
    this.particles = [];
    this.smoke = [];
    this.raf = 0;
    this.last = 0;
    this.listeners = {};
  }

  async load() {
    const [manifest, routes, occ] = await Promise.all([
      fetch(this.base + 'czesci.json').then((r) => r.json()),
      fetch(this.base + 'trasy.json').then((r) => r.json()),
      fetch(this.base + 'przeslony.json').then((r) => r.json()),
    ]);
    this.routesData = routes;
    this.occData = occ;
    this.occluders = prepareOccluders(occ.przeslony);
    this.material = await loadMaterial(this.base, manifest, this.materialId);
    this.mapImg = await this.loadMap(this.season);
    this.sim = new TownSim({
      graph: buildGraph(routes),
      makePuppet: (o) => createGroszak(this.material, o),
      formatMoney: this.formatMoney,
    });
    this.buildDom();
    this.bindInput();
    new ResizeObserver(() => this.resize(false)).observe(this.wrap);
    this.resize(true);
    this.initParticles();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop(); else this.start();
    });
    return this;
  }

  loadMap(season) {
    if (!this.maps[season]) this.maps[season] = loadImage(this.base + 'zrodla/' + SEASON_FILE[season]);
    return this.maps[season];
  }

  /** Zmiana pory roku z płynnym przenikaniem map. */
  async setSeason(season) {
    if (season === this.season) return;
    const img = await this.loadMap(season);
    this.prevMap = this.mapImg;
    this.mapImg = img;
    this.fadeStart = performance.now();
    this.season = season;
    this.initParticles();
  }

  /** Saldo (µg), próg (µg), powód: 'init' | 'deposit' | 'withdrawal' | 'tick'. */
  setBalance(balance, threshold, reason = 'tick') {
    this.sim.setBalance(balance, threshold, performance.now(), reason);
    this.empty.hidden = this.sim.crew.count > 0;
  }

  /** Tyknięcie salda (co 10 s): Groszaki z kolejki oddają okruszki. */
  tick() { return this.sim.tick(performance.now()); }

  on(name, fn) { (this.listeners[name] ||= []).push(fn); }
  emit(name, ...a) { for (const fn of this.listeners[name] || []) fn(...a); }

  // ------------------------------------------------------------ DOM
  buildDom() {
    this.bubble = document.createElement('div');
    this.bubble.className = 'gr-bubble';
    this.wrap.appendChild(this.bubble);
    this.empty = document.createElement('div');
    this.empty.className = 'gr-empty';
    this.empty.textContent = t('pusty');
    this.empty.hidden = true;
    this.wrap.appendChild(this.empty);
  }

  // ------------------------------------------------------------ kamera
  minZoom() { return Math.max(this.cssW / MAP_W, this.cssH / MAP_H); }
  clampCam() {
    const c = this.cam;
    c.z = Math.min(Math.max(c.z, this.minZoom()), 3);
    const vw = this.cssW / c.z, vh = this.cssH / c.z;
    c.x = Math.min(Math.max(c.x, vw / 2), MAP_W - vw / 2);
    c.y = Math.min(Math.max(c.y, vh / 2), MAP_H - vh / 2);
  }
  resize(initial) {
    const r = this.wrap.getBoundingClientRect();
    this.cssW = r.width; this.cssH = r.height;
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    if (initial) this.resetView();
    this.clampCam();
  }
  /** Telefon: przybliżony rynek i schody do Skarbca; komputer: cała mapa. */
  resetView() {
    if (this.cssW < 600) Object.assign(this.cam, { z: this.cssW / 430, x: 930, y: 560 });
    else Object.assign(this.cam, { z: this.minZoom(), x: MAP_W / 2, y: MAP_H / 2 });
    this.clampCam();
  }
  toMap(cx, cy) {
    return { x: this.cam.x + (cx - this.cssW / 2) / this.cam.z, y: this.cam.y + (cy - this.cssH / 2) / this.cam.z };
  }
  toScreen(x, y) {
    return { x: (x - this.cam.x) * this.cam.z + this.cssW / 2, y: (y - this.cam.y) * this.cam.z + this.cssH / 2 };
  }
  zoomAt(cx, cy, z) {
    const before = this.toMap(cx, cy);
    this.cam.z = z;
    this.clampCam();
    const after = this.toMap(cx, cy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  bindInput() {
    const w = this.wrap;
    w.addEventListener('pointerdown', (e) => {
      if (this.editor?.capture?.(e)) return;
      w.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.moved = 0;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cam.z };
      }
    });
    w.addEventListener('pointermove', (e) => {
      if (this.editor?.dragging) { this.editor.move(e); return; }
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      if (this.pointers.size === 1) {
        this.cam.x -= (e.offsetX - p.x) / this.cam.z;
        this.cam.y -= (e.offsetY - p.y) / this.cam.z;
        this.moved += Math.abs(e.offsetX - p.x) + Math.abs(e.offsetY - p.y);
      }
      p.x = e.offsetX; p.y = e.offsetY;
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d);
        this.moved = 99;
      }
      this.clampCam();
    });
    const up = (e) => {
      if (this.editor?.dragging) { this.editor.end(e); return; }
      if (this.pointers.size === 1 && this.moved < 6) this.tap(e.offsetX, e.offsetY);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
    };
    w.addEventListener('pointerup', up);
    w.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.pinch = null; });
    w.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(e.offsetX, e.offsetY, this.cam.z * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  tap(cx, cy) {
    const p = this.toMap(cx, cy);
    if (this.editor?.tap?.(p)) return;
    // najbliższy widzowi (największe y) Groszak pod palcem
    const hit = this.sim.puppets.filter((g) => hitTest(g, p.x, p.y)).sort((a, b) => b.y - a.y)[0];
    if (!hit) return;
    const now = performance.now();
    if (hit.action !== 'sleep') wave(hit, now);
    this.say = { text: this.sim.describe(hit), until: now + 2600, g: hit };
  }

  // ------------------------------------------------------------ efekty pór roku
  initParticles() {
    this.particles = [];
    if (this.still) return;
    const n = { winter: 110, autumn: 34, spring: 30, summer: 12 }[this.season];
    for (let i = 0; i < n; i++) this.particles.push(this.newParticle(true));
  }
  newParticle(anywhere) {
    const s = this.season;
    const vw = this.cssW / this.cam.z, vh = this.cssH / this.cam.z;
    const x = this.cam.x - vw / 2 + Math.random() * vw * 1.2;
    const y = anywhere ? this.cam.y - vh / 2 + Math.random() * vh : this.cam.y - vh / 2 - 20;
    const p = { x, y, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 2, ph: Math.random() * 6.28 };
    if (s === 'winter') Object.assign(p, { vx: -6 + Math.random() * 4, vy: 18 + Math.random() * 16, r: 1.2 + Math.random() * 1.8, c: '#ffffff' });
    else if (s === 'autumn') Object.assign(p, { vx: -14 + Math.random() * 8, vy: 16 + Math.random() * 14, r: 3 + Math.random() * 2.5,
      c: ['#d9622b', '#e8902f', '#c4432a', '#f0b23c'][Math.floor(Math.random() * 4)] });
    else if (s === 'spring') Object.assign(p, { vx: -10 + Math.random() * 6, vy: 10 + Math.random() * 10, r: 2.2 + Math.random() * 1.6,
      c: ['#f7b6c8', '#fbd3df', '#ffffff'][Math.floor(Math.random() * 3)] });
    else Object.assign(p, { vx: (Math.random() - 0.5) * 8, vy: -2 - Math.random() * 3, r: 1.4 + Math.random(), c: '#fff6c2', glow: true });
    return p;
  }
  updateParticles(dt) {
    const vw = this.cssW / this.cam.z, vh = this.cssH / this.cam.z;
    const top = this.cam.y - vh / 2, bottom = this.cam.y + vh / 2, left = this.cam.x - vw / 2, right = this.cam.x + vw / 2;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.ph += dt * 1.6;
      p.x += (p.vx + Math.sin(p.ph) * 6) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.y > bottom + 10 || p.y < top - 30 || p.x < left - 30 || p.x > right + 30) {
        this.particles[i] = this.newParticle(this.season === 'summer');
      }
    }
    // dym z kominów
    if (!this.still && Math.random() < dt * 2.2) {
      const [x, y] = CHIMNEYS[Math.floor(Math.random() * CHIMNEYS.length)];
      this.smoke.push({ x, y, t: 0, life: 3 + Math.random() * 1.5, dx: 4 + Math.random() * 4 });
    }
    this.smoke = this.smoke.filter((s) => (s.t += dt) < s.life);
  }
  drawParticles(ctx) {
    for (const s of this.smoke) {
      const k = s.t / s.life;
      ctx.fillStyle = `rgba(235, 235, 240, ${0.45 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(s.x + s.dx * s.t * 2, s.y - s.t * 14, 3 + k * 9, 0, 6.283);
      ctx.fill();
    }
    for (const p of this.particles) {
      ctx.fillStyle = p.c;
      if (this.season === 'winter' || p.glow) {
        ctx.globalAlpha = p.glow ? 0.5 + 0.5 * Math.sin(p.ph * 2) : 0.9;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.5, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      }
    }
  }

  drawEffects(ctx, now) {
    const crumb = this.material.parts.okruszek;
    for (const f of this.sim.effects) {
      const k = (now - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      if (f.type === 'crumb') {
        const x = f.x0 + (f.x1 - f.x0) * k;
        const y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 26;
        const sz = 10 * (1 - k * 0.5);
        ctx.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
        ctx.drawImage(crumb.sprite.forWidth(sz * this.cam.z * this.dpr), x - sz / 2, y - sz / 2, sz, sz * crumb.h / crumb.w);
        ctx.globalAlpha = 1;
      } else if (f.type === 'sparkle') {
        ctx.strokeStyle = `rgba(255, 220, 90, ${1 - k})`;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) {
          const a = i * 1.047 + k;
          const r0 = 6 + k * 10, r1 = 10 + k * 18;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0);
          ctx.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
          ctx.stroke();
        }
      }
    }
  }

  // ------------------------------------------------------------ pętla
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now) => {
      this.frame(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.sim.update(now, dt, this.still);
    if (!this.still) this.updateParticles(dt);
    if (this.follow) this.followTarget(dt);

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(this.cssW / 2, this.cssH / 2);
    ctx.scale(this.cam.z, this.cam.z);
    ctx.translate(-this.cam.x, -this.cam.y);
    ctx.imageSmoothingEnabled = true;
    const layers = [{ img: this.mapImg, alpha: 1 }];
    if (this.prevMap) {
      const k = (now - this.fadeStart) / 1500;
      if (k >= 1) this.prevMap = null; else layers.push({ img: this.prevMap, alpha: 1 - k });
    }
    for (const l of layers) { ctx.globalAlpha = l.alpha; ctx.drawImage(l.img, 0, 0, MAP_W, MAP_H); }
    ctx.globalAlpha = 1;
    const zs = this.cam.z * this.dpr;
    drawGroszakiWithDepth(ctx, layers, this.sim.puppets, this.occluders, now, zs, this.still);
    this.drawEffects(ctx, now);
    if (!this.still) this.drawParticles(ctx);
    this.editor?.draw?.(ctx, now);

    const s = this.say;
    if (now < s.until && s.g) {
      const p = this.toScreen(s.g.x, s.g.y - s.g.size * 1.75);
      this.bubble.textContent = s.text;
      this.bubble.style.left = p.x + 'px';
      this.bubble.style.top = p.y + 'px';
      this.bubble.classList.add('on');
    } else this.bubble.classList.remove('on');
    this.emit('frame', now);
  }

  /** Kamera podąża za wybranym Groszakiem (do podglądu i nagrań). */
  followTarget(dt) {
    let g = this.follow === true ? null : this.follow;
    if (!g || !this.sim.puppets.includes(g)) {
      g = this.sim.puppets[0];
      if (this.follow === true) this.follow = g || true;
    }
    if (!g || this.pointers.size) return;
    this.cam.z = Math.max(this.cam.z, this.cssW / 320);
    this.cam.x += (g.x - this.cam.x) * Math.min(1, dt * 2.5);
    this.cam.y += (g.y - 20 - this.cam.y) * Math.min(1, dt * 2.5);
    this.clampCam();
  }
}

/** Style dymka i napisu pustego Skarbca (wstaw raz na stronę). */
export const MIASTECZKO_CSS = `
.gr-bubble { position: absolute; transform: translate(-50%, -100%); background: #fff; color: #4a2c1a;
  border: 2px solid #4a2c1a; border-radius: 12px; padding: 4px 10px; font: 600 13px/1.3 system-ui, sans-serif;
  max-width: 220px; text-align: center; pointer-events: none; opacity: 0; transition: opacity .2s; }
.gr-bubble::after { content: ''; position: absolute; left: 50%; bottom: -8px; margin-left: -6px;
  border: 6px solid transparent; border-top-color: #4a2c1a; }
.gr-bubble.on { opacity: 1; }
.gr-empty { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: rgba(255,250,240,.92);
  color: #4a2c1a; border: 2px solid #ecd9b8; border-radius: 999px; padding: 6px 14px; font: 600 14px/1.3 system-ui, sans-serif;
  white-space: nowrap; pointer-events: none; }
.gr-empty[hidden] { display: none; }
`;

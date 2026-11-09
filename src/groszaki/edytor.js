// Ukryty edytor tras i przesłon: prototyp.html?edytor=1
//
// Trasy:     klik w puste miejsce – nowy punkt (połączony z zaznaczonym),
//            przeciągnij punkt – przesuń, klik w punkt – zaznacz,
//            Shift+klik (albo tryb „Łącz”) w drugi punkt – dodaj/usuń drogę,
//            Delete – usuń punkt. Groszaki od razu chodzą po zmienionej sieci.
// Przesłony: przeciągnij wierzchołek; „Nowa przesłona” + klikanie – nowy obrys,
//            Enter – zakończ. Linia gruntu = najniższy punkt obrysu.
// Krawędzie są na bieżąco sprawdzane z mapą (piasek, woda, przesłony) – tak jak
// tools/sprawdz_trasy.py: zielone w porządku, czerwone do poprawy.

import { buildGraph, EDGE_MARGIN } from './trasy.js';
import { prepareOccluders } from './przeslony.js';

const FREE = new Set(['schody', 'most', 'laka']);

function rgbToHsv255(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h / 360 * 255, mx ? d / mx * 255 : 0, mx];
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export class Edytor {
  constructor(town) {
    this.town = town;
    this.data = structuredClone(town.routesData);
    this.occ = structuredClone(town.occData);
    this.mode = 'trasy';
    this.sel = null;
    this.selOcc = null;
    this.linking = false;
    this.newPoly = null;
    this.dragging = null;
    this.check = new Map();
    this.counter = 1;
    town.editor = this;
    this.buildPanel();
    this.loadPixels().then(() => this.recheck());
    addEventListener('keydown', (e) => this.key(e));
  }

  async loadPixels() {
    const img = await this.town.loadMap('autumn');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    this.pix = g.getImageData(0, 0, c.width, c.height);
  }
  sample(x, y) {
    const { width, height, data } = this.pix;
    const ix = Math.round(x), iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return { sand: false, water: false };
    const i = (iy * width + ix) * 4;
    const [h, s, v] = rgbToHsv255(data[i], data[i + 1], data[i + 2]);
    return {
      sand: s >= 90 && s <= 150 && v >= 215 && h >= 17 && h <= 36,
      water: h >= 105 && h <= 135 && s >= 40 && s <= 140 && v >= 140,
    };
  }

  // ------------------------------------------------------------ dane
  nodes() { return new Map(this.data.punkty.map((p) => [p.id, p])); }
  apply() {
    const graph = buildGraph(this.data);
    this.town.sim.setGraph(graph);
    this.town.occluders = prepareOccluders(this.occ.przeslony);
    this.recheck();
    this.refreshPanel();
  }
  recheck() {
    if (!this.pix) return;
    const N = this.nodes();
    this.check.clear();
    for (const [a, b] of this.data.krawedzie) {
      const A = N.get(a), B = N.get(b);
      if (!A || !B) continue;
      const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
      const exempt = FREE.has(A.t) || FREE.has(B.t);
      const bridge = A.t === 'most' || B.t === 'most';
      let tot = 0, sand = 0, water = 0, hit = false;
      const steps = Math.max(2, Math.floor(L / 3));
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const x = A.x + (B.x - A.x) * k, y = A.y + (B.y - A.y) * k;
        const s = Math.max(0, A.s + (B.s - A.s) * k - EDGE_MARGIN);
        for (const lane of [-1, -0.5, 0, 0.5, 1]) {
          const px = x + nx * s * lane, py = y + ny * s * lane;
          const r = this.sample(px, py);
          tot++; sand += r.sand; water += r.water;
          for (const o of this.occ.przeslony) {
            if (bridge && o.id.startsWith('most-')) continue;
            if (inside(o.poly, px, py)) hit = true;
          }
        }
      }
      const ok = (exempt || sand / tot >= 0.8)   // w Pythonie maska jest wygładzona – tu próg trochę niższy
         && (bridge || water === 0) && !hit;
      this.check.set(a + '|' + b, ok);
    }
  }

  // ------------------------------------------------------------ panel
  buildPanel() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;background:#fffaf0;border:2px solid #4a2c1a;border-radius:12px;padding:10px;font:13px system-ui;color:#4a2c1a;max-width:300px;box-shadow:0 4px 16px rgba(0,0,0,.2)';
    p.innerHTML = `
      <b>Edytor tras</b>
      <div style="display:flex;gap:6px;margin:6px 0;flex-wrap:wrap">
        <button data-a="trasy">Trasy</button><button data-a="przeslony">Przesłony</button>
        <button data-a="lacz">Łącz</button><button data-a="usun">Usuń</button>
      </div>
      <div data-sel style="margin:4px 0"></div>
      <label>Szerokość (połowa) <input type="range" min="6" max="40" data-s style="width:120px"> <span data-sv></span></label><br>
      <label>Rodzaj <select data-t><option value="">droga</option><option value="schody">schody</option><option value="most">mostek</option><option value="laka">łąka / pole</option></select></label>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button data-a="nowa">Nowa przesłona</button>
        <button data-a="eksport">Eksportuj JSON</button>
      </div>
      <div data-info style="margin-top:6px;opacity:.8"></div>`;
    document.body.appendChild(p);
    this.panel = p;
    p.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (!a) return;
      if (a === 'trasy' || a === 'przeslony') { this.mode = a; this.newPoly = null; }
      if (a === 'lacz') this.linking = !this.linking;
      if (a === 'usun') this.removeSelected();
      if (a === 'nowa') { this.mode = 'przeslony'; this.newPoly = []; }
      if (a === 'eksport') this.export();
      this.refreshPanel();
    });
    p.querySelector('[data-s]').addEventListener('input', (e) => {
      const n = this.nodes().get(this.sel);
      if (n) { n.s = Number(e.target.value); this.apply(); }
    });
    p.querySelector('[data-t]').addEventListener('change', (e) => {
      const n = this.nodes().get(this.sel);
      if (n) { if (e.target.value) n.t = e.target.value; else delete n.t; this.apply(); }
    });
    this.refreshPanel();
  }
  refreshPanel() {
    const p = this.panel;
    for (const b of p.querySelectorAll('button[data-a]')) {
      const on = b.dataset.a === this.mode || (b.dataset.a === 'lacz' && this.linking) || (b.dataset.a === 'nowa' && this.newPoly);
      b.style.cssText = `font:inherit;border:2px solid #4a2c1a;border-radius:999px;padding:2px 9px;cursor:pointer;background:${on ? '#4a2c1a' : '#fff'};color:${on ? '#fff' : '#4a2c1a'}`;
    }
    const n = this.nodes().get(this.sel);
    p.querySelector('[data-sel]').textContent = n ? `Punkt ${n.id} (${Math.round(n.x)}, ${Math.round(n.y)})` : (this.mode === 'trasy' ? 'Kliknij punkt albo puste miejsce' : (this.newPoly ? 'Klikaj wierzchołki, Enter – koniec' : 'Przeciągnij wierzchołek przesłony'));
    p.querySelector('[data-s]').value = n ? n.s : 12;
    p.querySelector('[data-sv]').textContent = n ? n.s : '';
    p.querySelector('[data-t]').value = n ? (n.t || '') : '';
    const bad = [...this.check.values()].filter((v) => !v).length;
    p.querySelector('[data-info]').textContent = `${this.data.punkty.length} punktów, ${this.data.krawedzie.length} dróg` + (this.pix ? `, do poprawy: ${bad}` : '');
  }

  // ------------------------------------------------------------ wskaźnik
  pick(p, r = 9) {
    const z = this.town.cam.z;
    let best = null, bd = (r / z) ** 2;
    for (const n of this.data.punkty) {
      const d = (n.x - p.x) ** 2 + (n.y - p.y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  pickVertex(p, r = 9) {
    const z = this.town.cam.z;
    let best = null, bd = (r / z) ** 2;
    for (const o of this.occ.przeslony) {
      o.poly.forEach((v, i) => {
        const d = (v[0] - p.x) ** 2 + (v[1] - p.y) ** 2;
        if (d < bd) { bd = d; best = { o, i }; }
      });
    }
    return best;
  }
  capture(e) {
    const p = this.town.toMap(e.offsetX, e.offsetY);
    if (this.mode === 'trasy') {
      const n = this.pick(p);
      if (!n) return false;
      this.dragging = { n, moved: 0, shift: e.shiftKey, x: e.offsetX, y: e.offsetY };
    } else {
      if (this.newPoly) return false;
      const v = this.pickVertex(p);
      if (!v) return false;
      this.dragging = { v, moved: 0, x: e.offsetX, y: e.offsetY };
    }
    this.town.wrap.setPointerCapture(e.pointerId);
    return true;
  }
  move(e) {
    const d = this.dragging;
    d.moved += Math.abs(e.offsetX - d.x) + Math.abs(e.offsetY - d.y);
    d.x = e.offsetX; d.y = e.offsetY;
    if (d.moved < 4) return;
    const p = this.town.toMap(e.offsetX, e.offsetY);
    if (d.n) { d.n.x = Math.round(p.x); d.n.y = Math.round(p.y); }
    if (d.v) {
      d.v.o.poly[d.v.i] = [Math.round(p.x), Math.round(p.y)];
      d.v.o.base = Math.max(...d.v.o.poly.map((q) => q[1]));
    }
  }
  end() {
    const d = this.dragging;
    this.dragging = null;
    if (d.n && d.moved < 4) {
      if ((d.shift || this.linking) && this.sel && this.sel !== d.n.id) this.toggleEdge(this.sel, d.n.id);
      this.sel = d.n.id;
    }
    this.apply();
  }
  /** Klik w puste miejsce mapy. */
  tap(p) {
    if (this.mode === 'przeslony') {
      if (this.newPoly) { this.newPoly.push([Math.round(p.x), Math.round(p.y)]); return true; }
      this.selOcc = this.occ.przeslony.find((o) => inside(o.poly, p.x, p.y)) || null;
      return true;
    }
    const id = 'n' + Date.now().toString(36) + (this.counter++);
    const prev = this.nodes().get(this.sel);
    this.data.punkty.push({ id, x: Math.round(p.x), y: Math.round(p.y), s: prev ? prev.s : 14, ...(prev?.t ? { t: prev.t } : {}) });
    if (prev) this.data.krawedzie.push([prev.id, id]);
    this.sel = id;
    this.apply();
    return true;
  }
  toggleEdge(a, b) {
    const i = this.data.krawedzie.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (i >= 0) this.data.krawedzie.splice(i, 1); else this.data.krawedzie.push([a, b]);
  }
  removeSelected() {
    if (this.mode === 'przeslony' && this.selOcc) {
      this.occ.przeslony = this.occ.przeslony.filter((o) => o !== this.selOcc);
      this.selOcc = null;
    } else if (this.sel) {
      const used = JSON.stringify(this.data.miejsca).includes(`"${this.sel}"`);
      if (used && !confirm('Ten punkt jest miejscem (praca, drzwi…). Usunąć mimo to?')) return;
      this.data.punkty = this.data.punkty.filter((p) => p.id !== this.sel);
      this.data.krawedzie = this.data.krawedzie.filter(([a, b]) => a !== this.sel && b !== this.sel);
      this.sel = null;
    }
    this.apply();
  }
  key(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { this.removeSelected(); e.preventDefault(); }
    if (e.key === 'Enter' && this.newPoly) {
      if (this.newPoly.length >= 3) {
        this.occ.przeslony.push({ id: 'przeslona-' + (this.occ.przeslony.length + 1),
          base: Math.max(...this.newPoly.map((q) => q[1])), poly: this.newPoly });
      }
      this.newPoly = null;
      this.apply();
    }
    if (e.key === 'Escape') { this.sel = null; this.newPoly = null; this.refreshPanel(); }
  }

  export() {
    const files = { 'trasy.json': this.data, 'przeslony.json': this.occ };
    for (const [name, obj] of Object.entries(files)) {
      const blob = new Blob([JSON.stringify(obj, null, 1) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    navigator.clipboard?.writeText(JSON.stringify(this.data, null, 1)).catch(() => {});
  }

  // ------------------------------------------------------------ rysowanie
  draw(ctx) {
    const z = this.town.cam.z;
    const N = this.nodes();
    ctx.save();
    for (const [a, b] of this.data.krawedzie) {
      const A = N.get(a), B = N.get(b);
      if (!A || !B) continue;
      const ok = this.check.get(a + '|' + b);
      const L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const nx = -(B.y - A.y) / L, ny = (B.x - A.x) / L;
      const sA = Math.max(1, A.s - EDGE_MARGIN), sB = Math.max(1, B.s - EDGE_MARGIN);
      ctx.fillStyle = ok === false ? 'rgba(230,30,30,.45)' : 'rgba(40,200,60,.35)';
      ctx.beginPath();
      ctx.moveTo(A.x + nx * sA, A.y + ny * sA); ctx.lineTo(B.x + nx * sB, B.y + ny * sB);
      ctx.lineTo(B.x - nx * sB, B.y - ny * sB); ctx.lineTo(A.x - nx * sA, A.y - ny * sA);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1 / z;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    for (const n of this.data.punkty) {
      ctx.fillStyle = n.id === this.sel ? '#ffcc00' : (FREE.has(n.t) ? '#3366ff' : '#222');
      ctx.beginPath(); ctx.arc(n.x, n.y, (n.id === this.sel ? 5 : 3.5) / z, 0, 6.283); ctx.fill();
    }
    if (this.mode === 'przeslony') {
      for (const o of this.occ.przeslony) {
        ctx.strokeStyle = o === this.selOcc ? '#ffcc00' : 'rgba(0,90,255,.95)';
        ctx.lineWidth = 1.5 / z;
        ctx.beginPath();
        o.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(0,90,255,.95)';
        for (const [x, y] of o.poly) { ctx.beginPath(); ctx.arc(x, y, 2.5 / z, 0, 6.283); ctx.fill(); }
      }
      if (this.newPoly?.length) {
        ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2 / z;
        ctx.beginPath();
        this.newPoly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
    ctx.restore();
    if (this.dragging || this.frameN++ % 30 === 0) this.refreshPanel();
  }
}
Edytor.prototype.frameN = 0;

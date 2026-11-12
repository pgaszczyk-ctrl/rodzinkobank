// Plany na mapie: Groszaki i przesłony (stragany, domy…) rysowane w kolejności
// linii gruntu. Przesłona to wycinek tej samej mapy w obrysie obiektu,
// nakładany na Groszaka, który stoi za obiektem.

import { drawGroszak } from './kukielka.js';

/** Przygotowuje przesłony z przeslony.json (prostokąt otaczający, ścieżka). */
export function prepareOccluders(list) {
  return list.map((o) => {
    const xs = o.poly.map((p) => p[0]);
    const ys = o.poly.map((p) => p[1]);
    const path = new Path2D();
    o.poly.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    const x0 = Math.floor(Math.min(...xs)), y0 = Math.floor(Math.min(...ys));
    return { ...o, path, box: [x0, y0, Math.ceil(Math.max(...xs)) - x0, Math.ceil(Math.max(...ys)) - y0] };
  });
}

function overlaps(g, box) {
  const D = g.size;
  return g.x + D * 0.7 > box[0] && g.x - D * 0.7 < box[0] + box[2]
      && g.y > box[1] && g.y - D * 1.8 < box[1] + box[3];
}

/**
 * Rysuje Groszaki z planami. layers – [{ img, alpha }] warstwy mapy
 * (przy przenikaniu pór roku dwie), scale – piksele ekranu na piksel mapy.
 */
export function drawGroszakiWithDepth(ctx, layers, groszaki, occluders, now, scale, still, extras = []) {
  const items = [];
  for (const g of [...groszaki, ...extras]) items.push({ y: g.y, g });
  for (const o of occluders) items.push({ y: o.base, o });
  items.sort((a, b) => a.y - b.y);
  const drawn = [];
  for (const it of items) {
    if (it.g) { if (it.g.draw) it.g.draw(ctx); else drawGroszak(ctx, it.g, now, scale, still); drawn.push(it.g); continue; }
    const o = it.o;
    if (!drawn.some((g) => overlaps(g, o.box))) continue;
    const [bx, by, bw, bh] = o.box;
    ctx.save();
    ctx.clip(o.path);
    for (const l of layers) {
      ctx.globalAlpha = l.alpha;
      const sx = l.sourceScaleX ?? 1, sy = l.sourceScaleY ?? 1;
      ctx.drawImage(l.img, bx * sx, by * sy, bw * sx, bh * sy, bx, by, bw, bh);
    }
    ctx.restore();
  }
}

// Sieć ścieżek miasteczka: graf punktów (assets/groszaki/trasy.json).
// Czyste funkcje: bez DOM. Każdy punkt ma połowę szerokości drogi `s`,
// więc Groszaki chodzą różnymi pasami i mogą się mijać.
//
// Format trasy.json:
//   punkty:     [{ id, x, y, s, t? }]   s – połowa szerokości drogi (px mapy), t – 'schody' | 'most'
//   krawedzie:  [[idA, idB], …]         drogi dwukierunkowe
//   miejsca:    { drzwi, kolejka: [...], sen, wyjscia: [...], praca: [{ punkt, strefa, nazwa, teksty }] }

/** Margines od krawędzi drogi do środka Groszaka (px mapy). */
export const EDGE_MARGIN = 9;

export function buildGraph(data) {
  const nodes = new Map();
  for (const p of data.punkty || []) nodes.set(p.id, { ...p, s: p.s ?? 12 });
  const adj = new Map([...nodes.keys()].map((k) => [k, []]));
  for (const [a, b] of data.krawedzie || []) {
    const A = nodes.get(a), B = nodes.get(b);
    if (!A || !B || a === b) continue;
    const len = Math.hypot(A.x - B.x, A.y - B.y);
    adj.get(a).push({ to: b, len });
    adj.get(b).push({ to: a, len });
  }
  return { nodes, adj, places: data.miejsca || {} };
}

/**
 * Najkrótsza droga z losowym „zamieszaniem”: każda krawędź dostaje wagę
 * len · (1 + variety · rand()). Dzięki temu, gdy istnieją dwie podobne drogi,
 * Groszaki raz idą jedną, raz drugą. Zwraca listę id albo null.
 */
export function findPath(graph, from, to, rand = Math.random, variety = 0.6) {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  if (from === to) return [from];
  const w = new Map();
  const weight = (a, b, len) => {
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (!w.has(k)) w.set(k, len * (1 + variety * rand()));
    return w.get(k);
  };
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const done = new Set();
  // mała sieć (dziesiątki punktów) – prosta kolejka wystarczy
  const open = [from];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === to) break;
    if (done.has(cur)) continue;
    done.add(cur);
    for (const e of graph.adj.get(cur)) {
      if (done.has(e.to)) continue;
      const nd = dist.get(cur) + weight(cur, e.to, e.len);
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur);
        open.push(e.to);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return path;
}

/** Wszystkie punkty osiągalne z `from` (do sprawdzania spójności sieci). */
export function reachable(graph, from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const e of graph.adj.get(stack.pop()) || []) {
      if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
  }
  return seen;
}

/**
 * Zamienia listę id w trasę do przejścia: punkty z normalnymi w wierzchołkach
 * (dwusieczne), skumulowaną długością i szerokością. Element listy może też być
 * punktem { x, y, s } (np. bieżąca pozycja Groszaka przy zmianie planu).
 */
export function makeRoute(graph, ids) {
  const pts = ids.map((id) => (typeof id === 'string' ? graph.nodes.get(id) : id));
  const n = pts.length;
  const segN = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y;
    const l = Math.hypot(dx, dy) || 1;
    // normalna „po prawej ręce” idącego (oś y w dół): (-dy, dx)
    segN.push({ x: -dy / l, y: dx / l, len: l });
  }
  const out = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    let nx, ny;
    if (n === 1) { nx = 0; ny = 0; }
    else if (i === 0) ({ x: nx, y: ny } = segN[0]);
    else if (i === n - 1) ({ x: nx, y: ny } = segN[n - 2]);
    else {
      nx = segN[i - 1].x + segN[i].x; ny = segN[i - 1].y + segN[i].y;
      const l = Math.hypot(nx, ny);
      if (l < 1e-6) {
        // zawrócenie w miejscu – zostaw normalną następnego odcinka
        nx = segN[i].x; ny = segN[i].y;
      } else {
        // na ostrym zakręcie wydłuż, żeby pas zachował szerokość (z ograniczeniem)
        const cos = (segN[i - 1].x * segN[i].x + segN[i - 1].y * segN[i].y);
        const k = 1 / Math.max(0.5, Math.sqrt(Math.max(0, (1 + cos) / 2)));
        nx = nx / l * k; ny = ny / l * k;
      }
    }
    out.push({ id: pts[i].id, x: pts[i].x, y: pts[i].y, s: pts[i].s, t: pts[i].t, nx, ny, at: acc });
    if (i < n - 1) acc += segN[i].len;
  }
  return { pts: out, length: acc };
}

/**
 * Pozycja na trasie po przejściu `d` px, w pasie `lane` (−1…1; dodatni = prawa
 * strona idącego). Zwraca { x, y, dirX, onStairs, onBridge, done }.
 */
export function routePosition(route, d, lane = 0) {
  const P = route.pts;
  if (P.length === 1 || d <= 0) return pointAt(P, 0, 0, lane, d >= route.length);
  if (d >= route.length) return pointAt(P, P.length - 2, 1, lane, true);
  let i = 0;
  while (i < P.length - 2 && P[i + 1].at <= d) i++;
  const segLen = P[i + 1].at - P[i].at || 1;
  return pointAt(P, i, (d - P[i].at) / segLen, lane, false);
}

function pointAt(P, i, k, lane, done) {
  const A = P[i], B = P[Math.min(i + 1, P.length - 1)];
  const x = A.x + (B.x - A.x) * k;
  const y = A.y + (B.y - A.y) * k;
  const s = A.s + (B.s - A.s) * k;
  const nx = A.nx + (B.nx - A.nx) * k;
  const ny = A.ny + (B.ny - A.ny) * k;
  const off = lane * Math.max(0, s - EDGE_MARGIN);
  const stairs = A.t === 'schody' && B.t === 'schody';
  const bridge = A.t === 'most' || B.t === 'most';
  return { x: x + nx * off, y: y + ny * off, dirX: B.x - A.x, onStairs: stairs, onBridge: bridge, done };
}

/** Najbliższy punkt sieci do (x, y). */
export function nearestNode(graph, x, y) {
  let best = null, bd = Infinity;
  for (const n of graph.nodes.values()) {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

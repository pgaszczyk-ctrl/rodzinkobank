import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph, findPath, makeRoute, routePosition, reachable, EDGE_MARGIN } from '../src/groszaki/trasy.js';

// Dwie równoległe drogi z A do D: górna (B) i dolna (C), podobnej długości.
const data = {
  punkty: [
    { id: 'A', x: 0, y: 0, s: 20 }, { id: 'B', x: 50, y: -10, s: 20 },
    { id: 'C', x: 50, y: 12, s: 20 }, { id: 'D', x: 100, y: 0, s: 20 },
    { id: 'E', x: 300, y: 300, s: 10 },
  ],
  krawedzie: [['A', 'B'], ['B', 'D'], ['A', 'C'], ['C', 'D']],
};

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

test('droga istnieje i zaczyna się oraz kończy we właściwych punktach', () => {
  const g = buildGraph(data);
  const p = findPath(g, 'A', 'D', seeded(1));
  assert.equal(p[0], 'A');
  assert.equal(p.at(-1), 'D');
  assert.equal(findPath(g, 'A', 'E'), null);
  assert.deepEqual(findPath(g, 'A', 'A'), ['A']);
});

test('przy podobnych drogach Groszaki wybierają różne warianty', () => {
  const g = buildGraph(data);
  const rnd = seeded(7);
  const seen = new Set();
  for (let i = 0; i < 40; i++) seen.add(findPath(g, 'A', 'D', rnd)[1]);
  assert.deepEqual([...seen].sort(), ['B', 'C']);
  // bez losowości – zawsze najkrótsza
  const det = new Set();
  for (let i = 0; i < 5; i++) det.add(findPath(g, 'A', 'D', Math.random, 0)[1]);
  assert.deepEqual([...det], ['B']);
});

test('pas: Groszak zostaje w obrębie szerokości drogi z marginesem', () => {
  const g = buildGraph(data);
  const r = makeRoute(g, ['A', 'B', 'D']);
  for (let d = 0; d <= r.length; d += 3) {
    for (const lane of [-1, -0.5, 0, 0.5, 1]) {
      const c = routePosition(r, d, 0);
      const p = routePosition(r, d, lane);
      const off = Math.hypot(p.x - c.x, p.y - c.y);
      assert.ok(off <= (20 - EDGE_MARGIN) * 1.5 + 1e-9, `odsunięcie ${off}`);
    }
  }
});

test('ruch prawostronny: idący w przeciwne strony są po różnych stronach osi drogi', () => {
  const g = buildGraph({ punkty: [{ id: 'a', x: 0, y: 0, s: 20 }, { id: 'b', x: 100, y: 0, s: 20 }], krawedzie: [['a', 'b']] });
  const there = routePosition(makeRoute(g, ['a', 'b']), 50, 0.8);
  const back = routePosition(makeRoute(g, ['b', 'a']), 50, 0.8);
  assert.ok(there.y > 0 && back.y < 0);
  assert.equal(Math.round(there.x), 50);
});

test('koniec trasy jest oznaczony', () => {
  const g = buildGraph(data);
  const r = makeRoute(g, ['A', 'C', 'D']);
  assert.ok(!routePosition(r, r.length / 2).done);
  const end = routePosition(r, r.length + 5);
  assert.ok(end.done);
  assert.equal(Math.round(end.x), 100);
});

test('sieć miasteczka: wszystkie miejsca są połączone z drzwiami Skarbca', () => {
  const data = JSON.parse(readFileSync(new URL('../assets/groszaki/trasy.json', import.meta.url)));
  const g = buildGraph(data);
  const m = data.miejsca;
  const all = reachable(g, m.drzwi);
  for (const id of g.nodes.keys()) assert.ok(all.has(id), `punkt ${id} nie łączy się ze Skarbcem`);
  for (const w of m.praca) assert.ok(g.nodes.has(w.punkt), `brak punktu pracy ${w.punkt}`);
  for (const id of [m.sen, ...m.kolejka, ...m.wyjscia]) assert.ok(g.nodes.has(id), `brak punktu ${id}`);
  assert.ok(m.praca.some((w) => w.strefa === 'blisko'));
  assert.ok(m.praca.some((w) => w.strefa === 'daleko'));
});

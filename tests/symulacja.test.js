import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGraph } from '../src/groszaki/trasy.js';
import { TownSim } from '../src/groszaki/symulacja.js';
import { zl } from '../src/groszaki/finanse.js';

const data = JSON.parse(readFileSync(new URL('../assets/groszaki/trasy.json', import.meta.url)));
const T = zl(1000);

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function makeSim(seed = 3) {
  const graph = buildGraph(data);
  return new TownSim({
    graph, rand: seeded(seed),
    makePuppet: (o) => ({ x: 0, y: 0, size: 22, dir: 1, action: 'idle', carry: false, pack: false, ...o }),
  });
}
function run(sim, from, ms, step = 50, onTick) {
  let now = from;
  for (; now < from + ms; now += step) {
    sim.update(now, step / 1000);
    if (onTick && now % 10000 === 0) onTick(now);
  }
  return now;
}
/** Odległość punktu od osi najbliższej krawędzi względem jej szerokości. */
function onPaths(graph, x, y) {
  for (const [a, list] of graph.adj) {
    const A = graph.nodes.get(a);
    for (const { to } of list) {
      const B = graph.nodes.get(to);
      const dx = B.x - A.x, dy = B.y - A.y;
      const L2 = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2));
      const px = A.x + dx * k, py = A.y + dy * k;
      const s = A.s + (B.s - A.s) * k;
      if (Math.hypot(x - px, y - py) <= Math.max(s, 6) + 1) return true;
    }
  }
  return false;
}

test('liczba Groszaków wynika z salda', () => {
  const sim = makeSim();
  sim.setBalance(zl(250), T, 0, 'init');
  assert.equal(sim.entities.length, 25);
  assert.equal(sim.sleeper, null);
});

test('pusty Skarbiec: jeden śpiący Groszak; wpłata go budzi i dobiegają nowi', () => {
  const sim = makeSim();
  sim.setBalance(0, T, 0, 'init');
  assert.equal(sim.entities.length, 0);
  assert.ok(sim.sleeper);
  assert.equal(sim.puppets.length, 1);
  sim.setBalance(zl(50), T, 1000, 'deposit');
  assert.equal(sim.sleeper, null);
  run(sim, 1000, 5000);
  assert.equal(sim.alive().length, 5);
});

test('wpłata dodaje Groszaków, wypłata wysyła ich z plecakami po marzenie', () => {
  const sim = makeSim();
  sim.setBalance(zl(100), T, 0, 'init');
  sim.setBalance(zl(300), T, 1000, 'deposit');
  run(sim, 1000, 10000);
  assert.equal(sim.alive().length, 30);
  sim.setBalance(zl(120), T, 20000, 'withdrawal');
  const leaving = sim.entities.filter((e) => e.state === 'leaving');
  assert.equal(leaving.length, 18);
  assert.ok(leaving.every((e) => e.g.pack));
  run(sim, 20000, 120000);
  assert.equal(sim.entities.length, 12);
});

test('powyżej 1000 zł część Groszaków pracuje na farmie', () => {
  const sim = makeSim();
  sim.setBalance(zl(1500), T, 0, 'init');
  const far = sim.entities.filter((e) => e.zone === 'daleko').length;
  assert.ok(far >= 20 && far <= 30, `na farmie ${far}`);
  assert.ok(sim.entities.filter((e) => e.workPlace.strefa === 'daleko').every((e) => e.zone === 'daleko'));
});

test('okruszki trafiają do Skarbca tylko przy tyknięciu salda', () => {
  const sim = makeSim(11);
  sim.setBalance(zl(400), T, 0, 'init');
  let delivered = 0;
  let now = 0;
  for (; now < 60000; now += 50) {
    sim.update(now, 0.05);
    for (const e of sim.entities) if (e.state === 'deliver' && e.deliveredAt === undefined) e.deliveredAt = -1;
    if (now % 10000 === 0 && now > 0) delivered += sim.tick(now);
    for (const e of sim.entities) if (e.state === 'deliver' && e.deliveredAt === undefined) e.deliveredAt = now;
    for (const e of sim.entities) if (e.state !== 'deliver' && e.deliveredAt !== undefined && e.deliveredAt !== -1) e.ok = true;
  }
  assert.ok(delivered > 0, 'nikt nie oddał okruszka');
  // każde oddanie zaczyna się dokładnie w chwili tyknięcia
  for (const e of sim.entities) if (e.deliveredAt !== undefined) assert.equal(e.deliveredAt % 10000, 0, 'oddanie poza tyknięciem');
});

test('Groszaki chodzą tylko po trasach', () => {
  const sim = makeSim(5);
  sim.setBalance(zl(800), T, 0, 'init');
  for (let now = 0; now < 40000; now += 100) {
    sim.update(now, 0.1);
    if (now % 10000 === 0) sim.tick(now);
    for (const e of sim.entities) {
      assert.ok(onPaths(sim.graph, e.g.x, e.g.y), `Groszak ${e.id} poza trasą: ${e.g.x.toFixed(0)},${e.g.y.toFixed(0)} (${e.state})`);
    }
  }
});

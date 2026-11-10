import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoad, accountantLine, addMonths } from '../src/groszaki/droga.js';
import { zl } from '../src/groszaki/finanse.js';
import { dayNumberOf, dateOfDay, dayStart } from '../src/groszaki/czas.js';

const NOW = Date.parse('2026-11-10T18:00:00+01:00');
const dep = (id, ts, z, note) => ({ id, type: 'deposit', ts, amount: zl(z), note });
const events = [dep('a', NOW - 40 * 86400000, 100, 'od babci'), dep('b', NOW - 5 * 86400000, 50, 'kieszonkowe')];

test('droga obejmuje 14 miesięcy od dziś', () => {
  const r = buildRoad({ events, now: NOW });
  assert.equal(r.today, dayNumberOf(2026, 11, 10));
  assert.deepEqual(dateOfDay(r.end).month, 1);
  assert.equal(dateOfDay(r.end).year, 2028);
  assert.equal(addMonths(dayNumberOf(2026, 1, 31), 1), dayNumberOf(2026, 2, 28));
});

test('drogowskazy z prognozą „jeśli nic nie wydasz” rosną w czasie', () => {
  const r = buildRoad({ events, now: NOW });
  const keys = r.waypoints.map((w) => w.key);
  assert.ok(keys.includes('mikolajki') && keys.includes('wielkanoc') && keys.includes('wakacje'));
  for (let i = 1; i < r.waypoints.length; i++) assert.ok(r.waypoints[i].amount >= r.waypoints[i - 1].amount);
  assert.ok(r.waypoints[0].amount > r.balanceNow);
});

test('blisko (mniej niż 14 dni) pokazujemy noce', () => {
  const r = buildRoad({ events, now: Date.parse('2026-12-15T20:00:00+01:00') });
  const wig = r.waypoints.find((w) => w.key === 'wigilia');
  assert.equal(wig.nights, 9);
  const wak = r.waypoints.find((w) => w.key === 'wakacje');
  assert.equal(wak.nights, null);
});

test('ferie i wydarzenia rodzica', () => {
  const ferie = { start: dayNumberOf(2027, 2, 15), end: dayNumberOf(2027, 2, 28) };
  const custom = [{ id: 'u', nazwa: 'Urodziny Zosi', day: dayNumberOf(2027, 3, 3) }, { id: 'stare', nazwa: 'Było', day: dayNumberOf(2026, 1, 1) }];
  const r = buildRoad({ events, now: NOW, ferie, custom });
  assert.ok(r.waypoints.some((w) => w.key === 'ferie'));
  assert.ok(r.waypoints.some((w) => w.nazwa === 'Urodziny Zosi'));
  assert.ok(!r.waypoints.some((w) => w.nazwa === 'Było'));
  const hidden = buildRoad({ events, now: NOW, ferie: null });
  assert.ok(!hidden.waypoints.some((w) => w.key === 'ferie'));
});

test('cele: osiągnięty, w drodze, za ponad rok', () => {
  const goals = [
    { id: 'k', nazwa: 'Klocki', kwota: zl(80) },
    { id: 'h', nazwa: 'Hulajnoga', kwota: zl(250) },
    { id: 'r', nazwa: 'Rower', kwota: zl(50000) },
  ];
  const r = buildRoad({ events, now: NOW, goals });
  const [k, h, rw] = r.goals;
  assert.ok(k.reachedNow);
  assert.equal(k.missing, 0);
  assert.ok(!h.reachedNow && !h.beyond && h.day > r.today && h.day <= r.end);
  assert.ok(h.missing > 0 && h.progress > 0 && h.progress < 1);
  assert.ok(rw.beyond);
  assert.equal(accountantLine(k, r).key, 'ksiegowy.juz');
  assert.equal(accountantLine(rw, r).key, 'ksiegowy.ponadRok');
  const line = accountantLine(h, r);
  assert.ok(['ksiegowy.przed', 'ksiegowy.dnia', 'ksiegowy.przedWlasnym'].includes(line.key));
  // regularne wpłaty przyspieszają cel
  const plans = [{ amount: zl(10), every: 'week', startDay: r.today + 1 }];
  const faster = buildRoad({ events, now: NOW, goals, plans });
  assert.ok(faster.goals[1].day < h.day);
});

test('ślady przeszłych wpłat z opisem', () => {
  const r = buildRoad({ events, now: NOW });
  assert.deepEqual(r.traces.map((t) => t.note), ['od babci', 'kieszonkowe']);
});

test('odcinki pór roku pokrywają całą drogę', () => {
  const r = buildRoad({ events, now: NOW });
  assert.equal(r.seasons[0].season, 'autumn');
  assert.equal(r.seasons[1].season, 'winter');
  assert.equal(r.seasons[0].from, r.today);
  assert.equal(r.seasons.at(-1).to, r.end);
  for (let i = 1; i < r.seasons.length; i++) assert.equal(r.seasons[i].from, r.seasons[i - 1].to + 1);
});

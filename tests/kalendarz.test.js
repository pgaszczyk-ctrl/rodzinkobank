import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easter, seasonOfMonth, seasonOfDay, schoolYearEnd, schoolYearStart, standardWaypoints } from '../src/groszaki/kalendarz.js';
import { dayNumberOf, dateOfDay, nightsUntil, dayStart } from '../src/groszaki/czas.js';
import { groszakiCrew, MAX_GROSZAKI } from '../src/groszaki/liczenie.js';
import { zl } from '../src/groszaki/finanse.js';

test('Wielkanoc w kolejnych latach', () => {
  const known = {
    2024: [3, 31], 2025: [4, 20], 2026: [4, 5], 2027: [3, 28], 2028: [4, 16], 2029: [4, 1],
    2030: [4, 21], 2031: [4, 13], 2032: [3, 28], 2035: [3, 25], 2038: [4, 25], 2049: [4, 18],
    2285: [3, 22], 1943: [4, 25],
  };
  for (const [y, [m, d]] of Object.entries(known)) {
    const e = easter(Number(y));
    assert.deepEqual([e.month, e.day], [m, d], `Wielkanoc ${y}`);
    assert.equal(dateOfDay(dayNumberOf(e.year, e.month, e.day)).weekday, 0);
  }
});

test('pory roku według miesięcy', () => {
  const expected = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
  for (let m = 1; m <= 12; m++) assert.equal(seasonOfMonth(m), expected[m - 1]);
  assert.equal(seasonOfDay(dayNumberOf(2027, 2, 28)), 'winter');
  assert.equal(seasonOfDay(dayNumberOf(2027, 3, 1)), 'spring');
  assert.equal(seasonOfDay(dayNumberOf(2028, 11, 30)), 'autumn');
  assert.equal(seasonOfDay(dayNumberOf(2028, 12, 1)), 'winter');
});

test('koniec i początek roku szkolnego', () => {
  const end = (y) => { const d = dateOfDay(schoolYearEnd(y)); return [d.month, d.day]; };
  assert.deepEqual(end(2024), [6, 21]);
  assert.deepEqual(end(2025), [6, 27]);
  assert.deepEqual(end(2026), [6, 26]);
  assert.deepEqual(end(2027), [6, 25]);
  const start = (y) => { const d = dateOfDay(schoolYearStart(y)); return [d.month, d.day]; };
  assert.deepEqual(start(2023), [9, 4]);   // piątek → poniedziałek
  assert.deepEqual(start(2024), [9, 2]);   // niedziela → poniedziałek
  assert.deepEqual(start(2025), [9, 1]);
  assert.deepEqual(start(2029), [9, 3]);   // sobota → poniedziałek
});

test('drogowskazy na 14 miesięcy od listopada', () => {
  const from = dayNumberOf(2026, 11, 9);
  const to = dayNumberOf(2028, 1, 9);
  const keys = standardWaypoints(from, to).map((w) => w.key);
  assert.deepEqual(keys, ['mikolajki', 'wigilia', 'wielkanoc', 'dzienDziecka', 'koniecRoku', 'wakacje',
                          'poczatekRoku', 'mikolajki', 'wigilia']);
});

test('noce do wydarzenia', () => {
  const now = Date.parse('2026-12-15T21:00:00+01:00');
  assert.equal(nightsUntil(now, dayNumberOf(2026, 12, 24)), 9);
  assert.equal(nightsUntil(dayStart(dayNumberOf(2026, 12, 24)) - 1, dayNumberOf(2026, 12, 24)), 1);
});

test('liczba Groszaków: 1 na 10 zł, co najmniej 1, najwyżej 80', () => {
  const T = zl(1000);
  assert.equal(groszakiCrew(0, T).count, 0);
  assert.equal(groszakiCrew(1, T).count, 0);          // same mikrogrosze – pusty Skarbiec
  assert.equal(groszakiCrew(zl(0.01), T).count, 1);
  assert.equal(groszakiCrew(zl(9.99), T).count, 1);
  assert.equal(groszakiCrew(zl(25), T).count, 2);
  assert.equal(groszakiCrew(zl(512), T).count, 51);
  assert.equal(groszakiCrew(zl(800), T).count, 80);
  const big = groszakiCrew(zl(5000), T);
  assert.equal(big.count, MAX_GROSZAKI);
  assert.ok(big.perGroszak > zl(10));
  assert.equal(groszakiCrew(zl(500), T).far, 0);
  const above = groszakiCrew(zl(1500), T);
  assert.equal(above.near + above.far, 80);
  assert.ok(above.far >= 1);
  // po wpłacie rośnie, po wypłacie maleje
  assert.ok(groszakiCrew(zl(150), T).count > groszakiCrew(zl(100), T).count);
});

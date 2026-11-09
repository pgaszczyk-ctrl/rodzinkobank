import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zl, toZl, simulate, balanceAt, validateEvent, maxWithdrawal, dailyRate, history,
  dailyForecast, reachDay, forecastAt, depositCostPreview, splitAmount, tickTime,
  crossedFullGrosz, DEFAULT_RATES, MICRO_PER_GROSZ,
} from '../src/groszaki/finanse.js';
import { dayOf, dayStart, dayNumberOf } from '../src/groszaki/czas.js';

const DAY = 86400000;
const T0 = Date.parse('2026-01-10T09:30:00+01:00');
const dep = (id, ts, z) => ({ id, type: 'deposit', ts, amount: zl(z) });

test('10 zł: po 10 s małe cyfry salda są większe niż na starcie', () => {
  const ev = [dep('a', T0, 10)];
  const start = balanceAt(ev, T0);
  const after = balanceAt(ev, T0 + 10_000);
  assert.equal(start, zl(10));
  assert.ok(after > start, `${after} > ${start}`);
  assert.equal(splitAmount(start).micro, '0000');
  assert.notEqual(splitAmount(after).micro, '0000');
});

test('500 zł przez 365 dni bez operacji ≈ 897,6 zł', () => {
  const ev = [dep('a', dayStart(dayOf(T0)), 500)];
  const b = toZl(balanceAt(ev, dayStart(dayOf(T0)) + 365 * DAY + 3600000));
  assert.ok(Math.abs(b - 897.6) < 0.1, `saldo ${b}`);
});

test('1500 zł: część do 1000 zł rośnie 5%, część ponad próg 3% (oba progi)', () => {
  const s = dayStart(dayOf(T0));
  const ev = [dep('a', s, 1500)];
  // Pierwsza doba: dokładnie według wzoru
  const day1 = balanceAt(ev, dayStart(dayOf(T0) + 1));
  const expected1 = zl(1500) + Math.floor(zl(1000) * dailyRate(0.05) + zl(500) * dailyRate(0.03));
  assert.equal(day1, expected1);
  // Niezależne przeliczenie na 60 dni
  let b = zl(1500);
  for (let d = 0; d < 60; d++) {
    const low = Math.min(b, zl(1000));
    b += Math.floor(low * dailyRate(0.05) + (b - low) * dailyRate(0.03));
  }
  assert.equal(balanceAt(ev, dayStart(dayOf(T0) + 60)), b);
  // Saldo ponad próg rośnie wolniej niż gdyby całe rosło 5%
  const all5 = zl(1500) * Math.pow(1.05, 60 / 30.4375);
  const all3 = zl(1500) * Math.pow(1.03, 60 / 30.4375);
  assert.ok(b < all5 && b > all3);
  // Poniżej progu: tylko stawka 5%
  const ev2 = [dep('a', s, 800)];
  const d1 = balanceAt(ev2, dayStart(dayOf(T0) + 1));
  assert.equal(d1, zl(800) + Math.floor(zl(800) * dailyRate(0.05)));
});

test('saldo przekracza próg: od tej chwili nadwyżka rośnie wolniej', () => {
  const s = dayStart(dayOf(T0));
  const ev = [dep('a', s, 999)];
  const b40 = balanceAt(ev, dayStart(dayOf(T0) + 1));
  assert.equal(b40, zl(999) + Math.floor(zl(999) * dailyRate(0.05)));
  const b2 = balanceAt(ev, dayStart(dayOf(T0) + 2)); // drugi dzień: część ponad 1000 zł na 3%
  const low = zl(1000), high = b40 - low;
  assert.equal(b2, b40 + Math.floor(low * dailyRate(0.05) + high * dailyRate(0.03)));
});

test('wewnątrz doby licznik rośnie liniowo do kwoty należnej na koniec doby', () => {
  const s = dayStart(dayOf(T0));
  const ev = [dep('a', s, 500)];
  const end = balanceAt(ev, dayStart(dayOf(T0) + 1));
  const mid = balanceAt(ev, s + (dayStart(dayOf(T0) + 1) - s) / 2);
  const gain = end - zl(500);
  assert.ok(Math.abs((mid - zl(500)) - gain / 2) <= 1);
});

test('wpłata w środku dnia nalicza odsetki tylko od chwili wpłaty', () => {
  const d = dayOf(T0);
  const s = dayStart(d), e = dayStart(d + 1);
  const ev = [dep('a', s + (e - s) * 0.75, 1000)];
  const end = balanceAt(ev, e);
  assert.equal(end, zl(1000) + Math.floor(zl(1000) * dailyRate(0.05) * 0.25));
});

test('zmiana stawki od daty D nie zmienia salda sprzed D', () => {
  const s = dayStart(dayOf(T0));
  const base = [dep('a', s, 700)];
  const D = dayStart(dayOf(T0) + 20);
  const changed = [...base, { id: 'r', type: 'rate', ts: D, rates: { low: 0.10, high: 0.02, threshold: zl(500) } }];
  for (const t of [s + 1000, s + 5 * DAY, D - 1, D]) {
    assert.equal(balanceAt(changed, t), balanceAt(base, t), `t=${new Date(t).toISOString()}`);
  }
  assert.ok(balanceAt(changed, D + 5 * DAY) > balanceAt(base, D + 5 * DAY));
  // stawka obowiązuje od D: pierwszy dzień po D liczony nowymi stawkami
  const atD = balanceAt(changed, D);
  const next = balanceAt(changed, dayStart(dayOf(D) + 1));
  assert.equal(next, atD + Math.floor(zl(500) * dailyRate(0.10) + (atD - zl(500)) * dailyRate(0.02)));
});

test('zmiana stawki nie może działać wstecz ani od dzisiaj', () => {
  const now = T0;
  const r = (ts) => ({ id: 'r', type: 'rate', ts, rates: { ...DEFAULT_RATES, low: 0.04 } });
  assert.equal(validateEvent([], r(dayStart(dayOf(now) - 1)), now), 'RATE_RETROACTIVE');
  assert.equal(validateEvent([], r(dayStart(dayOf(now))), now), 'RATE_RETROACTIVE');
  assert.equal(validateEvent([], r(dayStart(dayOf(now) + 1)), now), null);
  assert.equal(validateEvent([], r(dayStart(dayOf(now) + 1) + 5), now), 'RATE_NOT_MIDNIGHT');
  assert.equal(validateEvent([], { ...r(dayStart(dayOf(now) + 1)), rates: { low: -1, high: 0, threshold: 0 } }, now), 'BAD_RATES');
});

test('odświeżenie, druga karta i ponowiony zapis nie zmieniają należnej kwoty', () => {
  const ev = [dep('a', T0, 120), dep('b', T0 + 3 * DAY, 30)];
  const t = T0 + 40 * DAY + 12345;
  const once = balanceAt(ev, t);
  // wielokrotne liczenie (odświeżenia, dwie karty) daje to samo
  for (let k = 0; k < 5; k++) assert.equal(balanceAt(ev, t), once);
  // ponowiony zapis tego samego zdarzenia (to samo id) nie dubluje wpłaty
  assert.equal(balanceAt([...ev, dep('b', T0 + 3 * DAY, 30), ev[0]], t), once);
  // kolejność w dzienniku nie ma znaczenia
  assert.equal(balanceAt([...ev].reverse(), t), once);
  // liczenie „krokami” (co 10 s) i od razu daje to samo
  const a = balanceAt(ev, t - 10_000);
  assert.ok(a <= once);
});

test('po powrocie do aplikacji saldo uwzględnia czas nieobecności', () => {
  const ev = [dep('a', T0, 200)];
  assert.ok(balanceAt(ev, T0 + 7 * DAY) > balanceAt(ev, T0 + DAY));
});

test('wypłacić można tylko pełne grosze; mikrogrosze zostają', () => {
  const ev = [dep('a', T0, 10)];
  const now = T0 + 3 * DAY + 5000;
  const max = maxWithdrawal(ev, now);
  assert.equal(max % MICRO_PER_GROSZ, 0);
  assert.ok(max <= balanceAt(ev, now));
  assert.equal(validateEvent(ev, { id: 'w', type: 'withdrawal', ts: now, amount: max + 1 }, now), 'NOT_FULL_GROSZ');
  assert.equal(validateEvent(ev, { id: 'w', type: 'withdrawal', ts: now, amount: max }, now), null);
  assert.equal(validateEvent(ev, { id: 'w', type: 'withdrawal', ts: now, amount: max + MICRO_PER_GROSZ }, now), 'INSUFFICIENT');
  const after = balanceAt([...ev, { id: 'w', type: 'withdrawal', ts: now, amount: max }], now);
  assert.ok(after >= 0 && after < MICRO_PER_GROSZ);
});

test('wsteczna wypłata nie może zrobić debetu przed późniejszymi operacjami', () => {
  const ev = [dep('a', T0, 50), { id: 'w1', type: 'withdrawal', ts: T0 + 5 * DAY, amount: zl(50) }];
  const now = T0 + 10 * DAY;
  assert.equal(validateEvent(ev, { id: 'w2', type: 'withdrawal', ts: T0 + DAY, amount: zl(10) }, now), 'INSUFFICIENT');
  assert.equal(validateEvent(ev, { id: 'w2', type: 'withdrawal', ts: T0 + DAY, amount: zl(0.1) }, now), null);
});

test('walidacja kwot i dat', () => {
  assert.equal(validateEvent([], { id: 'x', type: 'deposit', ts: T0, amount: 0 }, T0), 'BAD_AMOUNT');
  assert.equal(validateEvent([], { id: 'x', type: 'deposit', ts: T0, amount: 1.5 }, T0), 'BAD_AMOUNT');
  assert.equal(validateEvent([], { id: 'x', type: 'deposit', ts: T0 + 1000, amount: 5 }, T0), 'IN_FUTURE');
  assert.equal(validateEvent([], { id: 'x', type: 'adjustment', ts: T0, amount: -5 }, T0), 'INSUFFICIENT');
  assert.equal(validateEvent([dep('a', T0 - DAY, 1)], { id: 'x', type: 'adjustment', ts: T0, amount: -5 }, T0), null);
  assert.equal(validateEvent([], { id: 'x', type: 'lottery', ts: T0, amount: 5 }, T0), 'BAD_TYPE');
});

test('korekta zmienia saldo i jest widoczna w rozbiciu', () => {
  const ev = [dep('a', T0, 100), { id: 'k', type: 'adjustment', ts: T0 + DAY, amount: -zl(5) }];
  const s = simulate(ev, T0 + 2 * DAY);
  assert.equal(s.adjusted, -zl(5));
  assert.equal(s.total, s.deposited - s.withdrawn + s.adjusted + s.interest);
});

test('historia rozbija saldo na kapitał i odsetki', () => {
  const ev = [dep('a', T0, 100), dep('b', T0 + 10 * DAY, 50),
              { id: 'w', type: 'withdrawal', ts: T0 + 20 * DAY, amount: zl(20) }];
  const h = history(ev, T0 + 30 * DAY);
  assert.equal(h.length, 3);
  assert.equal(h[0].balanceBefore, 0);
  assert.equal(h[0].balanceAfter, zl(100));
  assert.ok(h[1].interestSincePrev > 0);
  assert.equal(h[1].balanceAfter - h[1].balanceBefore, zl(50));
  assert.equal(h[2].balanceBefore - h[2].balanceAfter, zl(20));
});

test('doba ze zmianą czasu (23 i 25 godzin) jest liczona jako jedna doba', () => {
  const spring = dayNumberOf(2026, 3, 29);   // zmiana czasu na letni
  const autumn = dayNumberOf(2026, 10, 25);  // zmiana czasu na zimowy
  assert.equal(dayStart(spring + 1) - dayStart(spring), 23 * 3600000);
  assert.equal(dayStart(autumn + 1) - dayStart(autumn), 25 * 3600000);
  for (const d of [spring, autumn]) {
    const ev = [dep('a', dayStart(d), 500)];
    assert.equal(balanceAt(ev, dayStart(d + 1)), zl(500) + Math.floor(zl(500) * dailyRate(0.05)));
  }
});

test('prognoza: regularne wpłaty i dzień osiągnięcia celu', () => {
  const now = T0;
  const ev = [dep('a', now - 30 * DAY, 100)];
  const plain = dailyForecast(ev, now, 420);
  assert.equal(plain.length, 421);
  assert.ok(plain[420].total > plain[0].total);
  const plans = [{ id: 'p', amount: zl(10), every: 'week', startDay: dayOf(now) + 1 }];
  const withPlan = dailyForecast(ev, now, 420, { plans });
  assert.ok(withPlan[100].total > plain[100].total + zl(100));
  const target = zl(300);
  const d1 = reachDay(plain, target), d2 = reachDay(withPlan, target);
  assert.ok(d2 !== null && (d1 === null || d2 < d1));
  // spójność z forecastAt
  const atEnd = forecastAt(ev, now, dayStart(dayOf(now) + 101), { plans });
  assert.equal(atEnd, withPlan[100].total);
  // regularne co miesiąc: 31. dzień miesiąca przechodzi na ostatni dzień krótszego
  const monthly = [{ amount: zl(1), every: 'month', startDay: dayNumberOf(2026, 1, 31) }];
  const f = dailyForecast([], Date.parse('2026-01-15T12:00:00+01:00'), 60, { plans: monthly });
  const feb28 = f.find((x) => x.day === dayNumberOf(2026, 2, 28));
  const feb27 = f.find((x) => x.day === dayNumberOf(2026, 2, 27));
  assert.ok(feb28.total - feb27.total >= zl(1));
});

test('podgląd kosztu dla rodzica przy wpłacie', () => {
  const c = depositCostPreview([], T0, zl(100));
  // 100 zł na 5% miesięcznie przez rok: ok. 79 zł odsetek
  assert.ok(Math.abs(toZl(c.yearInterestTotal) - 79.4) < 1, toZl(c.yearInterestTotal));
  assert.equal(c.yearInterestFromDeposit, c.yearInterestTotal);
});

test('wyświetlanie: złote, grosze i cztery cyfry mikrogroszy', () => {
  assert.deepEqual(splitAmount(512_374_821), { negative: false, zl: 512, gr: '37', micro: '4821' });
  assert.deepEqual(splitAmount(5), { negative: false, zl: 0, gr: '00', micro: '0005' });
  assert.equal(tickTime(1_234_567), 1_230_000);
  assert.ok(crossedFullGrosz(19_999, 20_000));
  assert.ok(!crossedFullGrosz(20_001, 29_999));
});

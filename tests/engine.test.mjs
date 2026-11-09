import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derive, upcomingChests, allocateWithdrawal, previewDeposit, validatePlan,
  chestsBetween, forecastReach, DEFAULT_PLAN, STEP_MS,
} from '../src/engine.js';
import { addMonths, dayKey } from '../src/calendar.js';
import { zlToMicro, splitMicro, parseZl } from '../src/money.js';

const TZ = 'Europe/Warsaw';
const T0 = Date.parse('2026-11-15T09:00:00Z');
const dep = (id, ts, zl, extra = {}) => ({ id, kind: 'deposit', ts, vault: zlToMicro(zl), now: 0, plan: DEFAULT_PLAN, seq: ts, ...extra });
const at = (ops, t) => derive(ops, { at: t, tz: TZ });
const fmt = (m) => { const p = splitMicro(m); return `${p.zl},${p.gr}|${p.micro}`; };

test('10 zł: first µg after 10 s, second after 20 s', () => {
  const ops = [dep('a', T0, 10)];
  assert.equal(fmt(at(ops, T0).vault), '10,00|0000');
  assert.equal(fmt(at(ops, T0 + 9_999).vault), '10,00|0000');
  assert.equal(fmt(at(ops, T0 + 10_000).vault), '10,00|0001');
  assert.equal(fmt(at(ops, T0 + 20_000).vault), '10,00|0002');
});

test('10 000 steps carry into a full grosz (27 h 46 min 40 s)', () => {
  const ops = [dep('a', T0, 10)];
  const t = T0 + 10_000 * STEP_MS;
  assert.equal(t - T0, (27 * 3600 + 46 * 60 + 40) * 1000);
  assert.equal(fmt(at(ops, t - STEP_MS).vault), '10,00|9999');
  assert.equal(fmt(at(ops, t).vault), '10,01|0000');
});

test('full 50% plan ends at exactly 15 zł, with or without a parent bonus, then stops', () => {
  const end = addMonths(T0, 6, TZ);
  const plain = [dep('a', T0, 10)];
  assert.equal(at(plain, end).vault, zlToMicro(15));
  const withBonus = [dep('a', T0, 10), { id: 'b', kind: 'bonus', ref: 'a', ts: T0, vault: zlToMicro(2), seq: T0 + 1 }];
  const s = at(withBonus, end);
  assert.equal(s.deposits[0].bonus, zlToMicro(2));
  assert.equal(s.vault, zlToMicro(15));
  // after the plan nothing more is generated
  assert.equal(at(withBonus, end + 90 * 86400_000).vault, zlToMicro(15));
  assert.equal(at(withBonus, end + 90 * 86400_000).miningActive, false);
});

test('mining part matches the 180-day example (1,5552 zł) and depends on real month lengths', () => {
  const ops = [dep('a', T0, 10)];
  const st = at(ops, T0 + 180 * 86400_000);
  // 180 days of mining = 1 555 200 µg; chests on top come from the thresholds
  const d = st.deposits[0];
  assert.equal(d.mined, 1_555_200);
  const end = addMonths(T0, 6, TZ);
  const days = (end - T0) / 86400_000;
  assert.equal(at(ops, end).deposits[0].mined, Math.round(days * 8640));
});

test('first chest: +0,24 zł (5% minus mining so far)', () => {
  const ops = [dep('a', T0, 10)];
  const [c1] = upcomingChests(ops, { from: T0, tz: TZ });
  assert.equal(dayKey(c1.at, TZ), '2026-12-15');
  const days = (c1.at - T0) / 86400_000; // 30
  assert.equal(c1.amount, 500_000 - days * 8640);
  assert.equal(c1.skin, 'wood');
});

test('cumulative thresholds hold at every chest', () => {
  const ops = [dep('a', T0, 10)];
  for (let k = 1; k <= 6; k++) {
    const t = addMonths(T0, k, TZ);
    const d = at(ops, t).deposits[0];
    const total = d.mined + d.chestSum + d.bonus;
    assert.equal(total, (DEFAULT_PLAN.th[k - 1] * 10_000_000) / 10_000, `month ${k}`);
  }
});

test('refresh / second tab: deriving repeatedly never adds anything', () => {
  const ops = [dep('a', T0, 10)];
  const t = T0 + 45 * 86400_000 + 1234;
  const a = at(ops, t).vault;
  for (let i = 0; i < 5; i++) assert.equal(at(ops, t).vault, a);
  // visiting in between does not change the result either
  at(ops, T0 + 3 * 86400_000);
  assert.equal(at(ops, t).vault, a);
});

test('partial withdrawal: bonuses first, then oldest principal; date kept, rate and chests follow the smaller base', () => {
  const ops = [dep('a', T0, 10)];
  const tw = T0 + 40 * 86400_000;
  const before = at(ops, tw);
  const alloc = allocateWithdrawal(before, zlToMicro(5));
  assert.equal(alloc.free, before.free);
  const fromPrincipal = zlToMicro(5) - before.free;
  assert.equal(alloc.principal.a, fromPrincipal);
  const ops2 = [...ops, { id: 'w', kind: 'withdrawal', ts: tw, vault: -zlToMicro(5), alloc, seq: tw }];
  const after = at(ops2, tw);
  assert.equal(after.vault, before.vault - zlToMicro(5));
  const d = after.deposits[0];
  assert.equal(d.start, T0); // keeps its original date
  assert.equal(d.P, zlToMicro(10) - fromPrincipal);
  // rate follows the new base
  const later = at(ops2, tw + 1000 * STEP_MS);
  assert.equal(later.deposits[0].mined - d.mined, Math.floor((1000 * d.P) / 10_000_000) + (0)); // remainder may add at most 1
  // final premium = 50% of the remaining principal; awarded bonuses are never taken back
  const end = addMonths(T0, 6, TZ);
  const fin = at(ops2, end).deposits[0];
  const cap = Math.floor((5000 * d.P) / 10_000);
  assert.equal(fin.mined + fin.chestSum, Math.max(cap, d.mined + d.chestSum));
});

test('withdrawal larger than earned premiums makes later chests skip when already above threshold', () => {
  const ops = [dep('a', T0, 10)];
  const tw = addMonths(T0, 5, TZ) + 86400_000; // after the 5th chest (38%)
  const st = at(ops, tw);
  const alloc = allocateWithdrawal(st, zlToMicro(9));
  const ops2 = [...ops, { id: 'w', kind: 'withdrawal', ts: tw, vault: -zlToMicro(9), alloc, seq: tw }];
  const fin = at(ops2, addMonths(T0, 6, TZ)).deposits[0];
  // remaining principal tiny → cap below already awarded → last chest skipped, nothing clawed back
  assert.equal(fin.chests[5].amount, 0);
  assert.ok(fin.mined + fin.chestSum >= 3_800_000);
});

test('micro amounts below a grosz stay in the balance after a withdrawal', () => {
  const ops = [dep('a', T0, 10)];
  const t = T0 + 37 * STEP_MS;
  const st = at(ops, t);
  assert.equal(st.vault % 10_000, 37);
  assert.equal(st.available, zlToMicro(10));
  const alloc = allocateWithdrawal(st, st.available);
  const st2 = at([...ops, { id: 'w', kind: 'withdrawal', ts: t, vault: -st.available, alloc, seq: t }], t);
  assert.equal(st2.vault, 37);
  assert.equal(allocateWithdrawal(st, st.available + 10_000), null);
});

test('chests on the same day merge; the highest stage decides the skin', () => {
  const t2 = addMonths(T0, 2, TZ);
  const ops = [dep('a', T0, 10), dep('b', t2, 10)];
  const list = upcomingChests(ops, { from: t2 + 1, tz: TZ, limit: 10 });
  const merged = list.find((g) => g.parts.length > 1);
  assert.ok(merged, 'expected a merged chest');
  assert.equal(merged.amount, merged.parts.reduce((s, p) => s + p.amount, 0));
  assert.equal(merged.stage, Math.max(...merged.parts.map((p) => p.k)));
});

test('Groszaki: only positive vault deposits unlock, max three; bonuses and corrections do not', () => {
  const ops = [
    dep('a', T0, 10), { id: 'b', kind: 'bonus', ref: 'a', ts: T0, vault: 100, seq: T0 + 1 },
    { id: 'c', kind: 'correction', ts: T0 + 5, vault: zlToMicro(3), seq: T0 + 5 },
    dep('n', T0 + 6, 0, { now: zlToMicro(5) }),
  ];
  assert.equal(at(ops, T0 + 10).unlocked, 1);
  const more = [...ops, dep('d', T0 + 100, 1), dep('e', T0 + 200, 1), dep('f', T0 + 300, 1)];
  assert.equal(at(more, T0 + 400).unlocked, 3);
});

test('gift split keeps the full amount; premiums only on the vault part', () => {
  const ops = [dep('g', T0, 6, { now: zlToMicro(4) })];
  const st = at(ops, T0);
  assert.equal(st.vault + st.now, zlToMicro(10));
  const fin = at(ops, addMonths(T0, 6, TZ));
  assert.equal(fin.vault, zlToMicro(9));
  assert.equal(fin.now, zlToMicro(4));
});

test('parent bonus is clamped to leave room for future mining', () => {
  const p = previewDeposit({ amount: zlToMicro(10), start: T0, tz: TZ });
  const end = addMonths(T0, 6, TZ);
  const mineAll = Math.floor(((end - T0) / STEP_MS) * 10_000_000 / 10_000_000);
  assert.equal(p.maxBonus, Math.floor((5_000_000 - mineAll) / 10_000) * 10_000);
  const greedy = previewDeposit({ amount: zlToMicro(10), bonus: zlToMicro(5), start: T0, tz: TZ });
  assert.ok(greedy.bonus <= 5_000_000 - mineAll);
  assert.equal(greedy.total, 5_000_000);
  // a 20% bonus shrinks or removes chests but the total stays at the cap
  const b20 = previewDeposit({ amount: zlToMicro(10), bonus: zlToMicro(2), start: T0, tz: TZ });
  assert.equal(b20.total, 5_000_000);
  assert.ok(b20.chests.filter((c) => c.amount > 0).length <= p.chests.filter((c) => c.amount > 0).length);
});

test('plan validation: non-decreasing, last ≤ 50%, mining must fit', () => {
  assert.deepEqual(validatePlan(DEFAULT_PLAN), []);
  assert.ok(validatePlan({ th: [500, 400, 600, 700, 800, 900], rate: 1 }).includes('plan_decreasing'));
  assert.ok(validatePlan({ th: [500, 1000, 1800, 2500, 3800, 5500], rate: 1 }).includes('plan_over_cap'));
  assert.ok(validatePlan({ th: [100, 200, 300, 400, 500, 1000], rate: 1 }).includes('plan_mine_over_cap'));
  assert.deepEqual(validatePlan({ th: [0, 0, 0, 0, 0, 2000], rate: 1 }), []);
});

test('chest reserves budget for future mining (front-loaded plan)', () => {
  const plan = { v: 2, th: [4000, 4000, 4000, 4000, 4000, 5000], rate: 1 };
  const ops = [dep('a', T0, 10, { plan })];
  const end = addMonths(T0, 6, TZ);
  const fin = at(ops, end).deposits[0];
  assert.equal(fin.mined + fin.chestSum, 5_000_000);
  assert.equal(at(ops, end).vault, zlToMicro(15));
});

test('next micro increment timing for a tiny deposit', () => {
  const ops = [dep('a', T0, 1)]; // 0.1 µg per step → 1 µg every 100 s
  const st = at(ops, T0 + 5_000);
  assert.equal(st.nextIncrementAt, T0 + 100_000);
  assert.equal(at(ops, T0 + 100_000).vault, zlToMicro(1) + 1);
});

test('later deposits share the 10-second rhythm of the first one', () => {
  const ops = [dep('a', T0, 10), dep('b', T0 + 33_333, 10)];
  const st = at(ops, T0 + 40_000);
  assert.equal(st.deposits[1].start, T0 + 40_000);
});

test('away celebration summarises chests opened while away', () => {
  const ops = [dep('a', T0, 10)];
  const c = chestsBetween(ops, { since: T0, until: addMonths(T0, 2, TZ) + 1, tz: TZ });
  assert.equal(c.count, 2);
  assert.ok(c.amount > 0);
});

test('forecast with a weekly schedule', () => {
  const ops = [dep('a', T0, 10)];
  const t = forecastReach(ops, { from: T0, price: zlToMicro(89), schedule: { amount: zlToMicro(10), every: 'week' }, tz: TZ });
  assert.ok(t > T0 && t < T0 + 70 * 86400_000);
  assert.equal(forecastReach(ops, { from: T0, price: zlToMicro(5), tz: TZ }), T0);
});

test('money parsing', () => {
  assert.equal(parseZl('12,5'), 12_500_000);
  assert.equal(parseZl('0.01'), 10_000);
  assert.ok(Number.isNaN(parseZl('1,234')));
  assert.ok(Number.isNaN(parseZl('-1')));
});

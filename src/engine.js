// Groszaki ledger engine.
//
// The balance is a pure function of the stored operations and a point in time.
// Mining (microgrosze every 10 s) and chests are *derived*, in chronological
// order, from those operations. Because nothing is granted by the client, a page
// refresh or a second tab cannot award anything twice, and every device that
// has the same operations shows the same balance.
//
// Units: integer microgrosze (µg). 1 zł = 1 000 000 µg.

import { addMonths, dayKey, DEFAULT_TZ } from './calendar.js';
import { MICRO_PER_GROSZ, floorToGrosz } from './money.js';

export const STEP_MS = 10_000;
/** 1 µg per 10 s per 10 zł → per step a deposit earns P·rate / 10 000 000 µg. */
export const RATE_DIVISOR = 10_000_000;
export const PLAN_MONTHS = 6;
export const MAX_CAP_BP = 5000; // 50 %, in basis points
export const ALLOWED_RATES = [1, 2, 3];
export const DEFAULT_PLAN = Object.freeze({ v: 1, th: [500, 1000, 1800, 2500, 3800, 5000], rate: 1 });
export const MAX_GROSZAKI = 3;

const BIG_DIV = BigInt(RATE_DIVISOR);

/** Chest skin for a plan stage (month 1–6). */
export const chestSkin = (stage) => (stage >= 5 ? 'gold' : stage >= 3 ? 'silver' : 'wood');

/* ------------------------------------------------------------------ */
/*  Plan validation                                                    */
/* ------------------------------------------------------------------ */

/** Share of a deposit (in bp) that mining alone can produce in the longest 6-month window (184 days). */
export function maxMineShareBp(rate) {
  const steps = (184 * 86400_000) / STEP_MS;
  return Math.ceil((steps * rate * 10_000) / RATE_DIVISOR);
}

/** Returns a list of error codes (empty when the plan is valid). */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || !Array.isArray(plan.th) || plan.th.length !== PLAN_MONTHS) return ['plan_shape'];
  for (const v of plan.th) if (!Number.isInteger(v) || v < 0) errors.push('plan_value');
  for (let i = 1; i < plan.th.length; i++) if (plan.th[i] < plan.th[i - 1]) { errors.push('plan_decreasing'); break; }
  if (plan.th[PLAN_MONTHS - 1] > MAX_CAP_BP) errors.push('plan_over_cap');
  if (!ALLOWED_RATES.includes(plan.rate)) errors.push('plan_rate');
  if (!errors.length && plan.th[PLAN_MONTHS - 1] < maxMineShareBp(plan.rate)) errors.push('plan_mine_over_cap');
  return [...new Set(errors)];
}

/* ------------------------------------------------------------------ */
/*  Core derivation                                                    */
/* ------------------------------------------------------------------ */

function snapToGrid(ts, anchor) {
  if (anchor == null || ts <= anchor) return ts;
  return anchor + Math.ceil((ts - anchor) / STEP_MS) * STEP_MS;
}

function newDeposit(op, anchor, tz) {
  const start = snapToGrid(op.ts, anchor);
  const plan = op.plan || DEFAULT_PLAN;
  const chestAt = [];
  for (let k = 1; k <= PLAN_MONTHS; k++) chestAt.push(addMonths(start, k, tz));
  const end = chestAt[PLAN_MONTHS - 1];
  const P = op.vault;
  return {
    id: op.id, ts: op.ts, start, end, plan, chestAt,
    totalSteps: Math.floor((end - start) / STEP_MS),
    P0: P, P,
    cap: Math.floor((plan.th[PLAN_MONTHS - 1] * P) / 10_000),
    r: 0n, stepsDone: 0, mined: 0, chestSum: 0, bonus: 0,
    chests: [], exhausted: false, giftNow: op.now || 0,
  };
}

const soFar = (d) => d.mined + d.chestSum + d.bonus;

/** Mining still to come for a deposit with its current base, clamped to its budget. */
function futureMine(d) {
  if (d.P <= 0 || d.exhausted) return 0;
  const n = d.totalSteps - d.stepsDone;
  if (n <= 0) return 0;
  const raw = Number((d.r + BigInt(n) * BigInt(d.P) * BigInt(d.plan.rate)) / BIG_DIV);
  return Math.max(0, Math.min(raw, d.cap - soFar(d)));
}

/**
 * Derive the state of a child's vault at time `at`.
 * @param {Array} ops normalized operations (see README / backend-*.js)
 * @param {{at:number, tz?:string}} opts
 */
export function derive(ops, { at, tz = DEFAULT_TZ } = {}) {
  const live = ops.filter((o) => !o.voided).slice().sort((a, b) => a.ts - b.ts || (a.seq || 0) - (b.seq || 0));
  const firstDep = live.find((o) => o.kind === 'deposit' && o.vault > 0);
  const anchor = firstDep ? firstDep.ts : null;

  const deposits = new Map();
  const events = [];
  let free = 0, nowPool = 0, unlocked = 0;
  let nowEver = false;

  // Settle mining for one deposit up to time t (step boundaries ≤ t).
  const settle = (d, t) => {
    if (t < d.start) return;
    const target = Math.floor((Math.min(t, d.end) - d.start) / STEP_MS);
    if (target <= d.stepsDone) return;
    const n = target - d.stepsDone;
    d.stepsDone = target;
    if (d.P <= 0 || d.exhausted) return;
    const total = d.r + BigInt(n) * BigInt(d.P) * BigInt(d.plan.rate);
    let units = Number(total / BIG_DIV);
    d.r = total % BIG_DIV;
    const allowed = d.cap - soFar(d);
    if (units >= allowed) { units = Math.max(0, allowed); d.exhausted = true; }
    d.mined += units;
    free += units;
  };
  const settleAll = (t) => { for (const d of deposits.values()) settle(d, t); };

  // Build the timeline: operations + chest openings.
  const queue = [];
  for (const op of live) if (op.ts <= at) queue.push({ t: op.ts, pri: 1, op });

  // Chests are scheduled once their deposit exists; we insert them lazily.
  const pending = []; // chest events not yet consumed
  const pushChests = (d) => {
    d.chestAt.forEach((t, i) => { if (t <= at) pending.push({ t, pri: 0, dep: d, k: i + 1 }); });
  };

  let qi = 0;
  const nextEvent = () => {
    // merge `queue` (sorted) and `pending` (unsorted, small) by (t, pri)
    let best = -1;
    for (let i = 0; i < pending.length; i++) {
      const e = pending[i];
      if (best < 0 || e.t < pending[best].t) best = i;
    }
    const q = queue[qi];
    if (best >= 0 && (!q || pending[best].t < q.t || (pending[best].t === q.t))) {
      return pending.splice(best, 1)[0];
    }
    if (q) { qi++; return q; }
    return null;
  };

  let anchorUsed = anchor;
  for (let e = nextEvent(); e; e = nextEvent()) {
    settleAll(e.t);
    if (e.dep) { openChest(e.dep, e.k, e.t); continue; }
    applyOp(e.op);
  }
  settleAll(at);

  function openChest(d, k, t) {
    let amount = 0;
    if (d.P > 0) {
      const threshold = Math.floor((d.plan.th[k - 1] * d.P) / 10_000);
      const due = threshold - soFar(d);
      const reserve = k < PLAN_MONTHS ? futureMine(d) : 0;
      amount = Math.max(0, Math.min(due, d.cap - soFar(d) - reserve));
    }
    d.chestSum += amount;
    free += amount;
    d.chests.push({ k, at: t, amount });
    if (amount > 0) events.push({ type: 'chest', at: t, depositId: d.id, k, amount, stage: k });
  }

  function applyOp(op) {
    switch (op.kind) {
      case 'deposit': {
        nowPool += op.now || 0;
        if (op.now > 0) nowEver = true;
        if (op.vault > 0) {
          const d = newDeposit(op, anchorUsed, tz);
          deposits.set(op.id, d);
          pushChests(d);
          unlocked = Math.min(MAX_GROSZAKI, unlocked + 1);
          events.push({ type: 'deposit', at: op.ts, depositId: op.id, amount: op.vault, now: op.now || 0, groszak: unlocked });
        } else if (op.now > 0) {
          events.push({ type: 'deposit', at: op.ts, depositId: op.id, amount: 0, now: op.now });
        }
        break;
      }
      case 'bonus': {
        const d = deposits.get(op.ref);
        if (!d) break;
        settle(d, op.ts);
        const max = Math.max(0, d.cap - soFar(d) - futureMine(d));
        const amount = Math.max(0, Math.min(op.vault, max));
        d.bonus += amount;
        free += amount;
        events.push({ type: 'bonus', at: op.ts, depositId: d.id, amount, requested: op.vault });
        break;
      }
      case 'withdrawal':
      case 'correction': {
        if (op.vault > 0) { free += op.vault; }
        else if (op.vault < 0 || op.kind === 'withdrawal') applyAlloc(op.alloc || { free: 0, principal: {} });
        if (op.now) { nowPool += op.now; if (op.now > 0) nowEver = true; }
        events.push({ type: op.kind, at: op.ts, amount: op.vault, now: op.now || 0, alloc: op.alloc, requestId: op.requestId });
        break;
      }
      case 'now_out': {
        nowPool -= op.now;
        events.push({ type: 'now_out', at: op.ts, now: -op.now });
        break;
      }
      default: break;
    }
  }

  function applyAlloc(alloc) {
    free -= alloc.free || 0;
    for (const [id, amt] of Object.entries(alloc.principal || {})) {
      const d = deposits.get(id);
      if (!d) continue;
      d.P = Math.max(0, d.P - amt);
      d.cap = Math.floor((d.plan.th[PLAN_MONTHS - 1] * d.P) / 10_000);
      if (d.P === 0 || soFar(d) >= d.cap) d.exhausted = true;
    }
  }

  // Summary
  const list = [...deposits.values()];
  let principal = 0;
  for (const d of list) principal += d.P;
  const vault = principal + free;
  const activeDeps = list.filter((d) => d.P > 0 && !d.exhausted && at < d.end && futureMine(d) > 0);

  return {
    at, tz, anchor,
    vault, free, principal, now: nowPool, nowEver,
    available: floorToGrosz(vault),
    deposits: list.map((d) => ({
      id: d.id, ts: d.ts, start: d.start, end: d.end, plan: d.plan,
      P0: d.P0, P: d.P, cap: d.cap, mined: d.mined, chestSum: d.chestSum, bonus: d.bonus,
      chests: d.chests.slice(), chestAt: d.chestAt.slice(),
      remainder: d.r, stepsDone: d.stepsDone, totalSteps: d.totalSteps,
      active: activeDeps.includes(d), finished: at >= d.end, exhausted: d.exhausted,
      futureMine: futureMine(d),
    })),
    events,
    unlocked,
    miningActive: activeDeps.length > 0,
    microPerStep: activeDeps.reduce((s, d) => s + (d.P * d.plan.rate) / RATE_DIVISOR, 0),
    nextIncrementAt: nextIncrement(activeDeps, at),
  };
}

/** Earliest time a visible unit (1 µg) lands in the vault from mining. */
function nextIncrement(active, at) {
  let best = null;
  for (const d of active) {
    const perStep = BigInt(d.P) * BigInt(d.plan.rate);
    if (perStep <= 0n) continue;
    const need = (BIG_DIV - d.r + perStep - 1n) / perStep; // steps until the remainder overflows
    const t = d.start + (d.stepsDone + Number(need)) * STEP_MS;
    if (t <= d.end && t > at && (best == null || t < best)) best = t;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Projections                                                        */
/* ------------------------------------------------------------------ */

/**
 * Upcoming chests after `from`, grouped per local day, positive only.
 * Each group keeps the per-deposit breakdown for the parent panel.
 */
export function upcomingChests(ops, { from, tz = DEFAULT_TZ, limit = 3 } = {}) {
  const horizon = from + 400 * 86400_000;
  const st = derive(ops, { at: horizon, tz });
  const groups = new Map();
  for (const e of st.events) {
    if (e.type !== 'chest' || e.at <= from || e.amount <= 0) continue;
    const key = dayKey(e.at, tz);
    let g = groups.get(key);
    if (!g) { g = { day: key, at: e.at, amount: 0, stage: 0, parts: [] }; groups.set(key, g); }
    g.amount += e.amount;
    g.stage = Math.max(g.stage, e.stage);
    g.at = Math.min(g.at, e.at);
    g.parts.push({ depositId: e.depositId, k: e.k, amount: e.amount, at: e.at });
  }
  const out = [...groups.values()].sort((a, b) => a.at - b.at);
  out.forEach((g) => { g.skin = chestSkin(g.stage); });
  return limit ? out.slice(0, limit) : out;
}

/** Chests that opened in (since, until], grouped by day (for the "while you were away" celebration). */
export function chestsBetween(ops, { since, until, tz = DEFAULT_TZ }) {
  const st = derive(ops, { at: until, tz });
  const list = st.events.filter((e) => e.type === 'chest' && e.at > since && e.at <= until && e.amount > 0);
  if (!list.length) return null;
  return {
    amount: list.reduce((s, e) => s + e.amount, 0),
    stage: Math.max(...list.map((e) => e.stage)),
    count: new Set(list.map((e) => dayKey(e.at, tz))).size,
    last: Math.max(...list.map((e) => e.at)),
  };
}

/**
 * Split a withdrawal: available bonuses first, then principal from the oldest deposit.
 * Returns null when the amount is not available.
 */
export function allocateWithdrawal(state, amount) {
  if (!(amount > 0) || amount % MICRO_PER_GROSZ !== 0 || amount > state.available) return null;
  const fromFree = Math.max(0, Math.min(amount, state.free));
  let rest = amount - fromFree;
  const principal = {};
  const deps = state.deposits.filter((d) => d.P > 0).sort((a, b) => a.ts - b.ts);
  for (const d of deps) {
    if (rest <= 0) break;
    const take = Math.min(rest, d.P);
    principal[d.id] = take;
    rest -= take;
  }
  if (rest > 0) return null;
  return { free: fromFree, principal };
}

/** Preview of a single new deposit under a plan: chest dates, amounts, mining and total cost. */
export function previewDeposit({ amount, plan = DEFAULT_PLAN, bonus = 0, start, tz = DEFAULT_TZ }) {
  const ops = [{ id: 'preview', kind: 'deposit', ts: start, vault: amount, now: 0, plan, seq: 0 }];
  if (bonus > 0) ops.push({ id: 'preview-bonus', kind: 'bonus', ref: 'preview', ts: start, vault: bonus, seq: 1 });
  const base = derive(ops.slice(0, 1), { at: start, tz }).deposits[0];
  const maxBonus = base ? floorToGrosz(Math.max(0, base.cap - base.futureMine)) : 0;
  const end = base ? base.end : start;
  const st = derive(ops, { at: end, tz });
  const d = st.deposits[0];
  if (!d) return { chests: [], mined: 0, bonus: 0, chestTotal: 0, total: 0, cap: 0, maxBonus: 0, end };
  return {
    chests: d.chests.map((c) => ({ ...c, skin: chestSkin(c.k) })),
    mined: d.mined, bonus: d.bonus, chestTotal: d.chestSum,
    total: d.mined + d.chestSum + d.bonus, cap: d.cap, maxBonus, end: d.end,
  };
}

/**
 * Forecast when the vault reaches `price` with regular deposits (schedule).
 * Returns a timestamp or null (not within ~5 years). Assumes no withdrawals.
 */
export function forecastReach(ops, { from, price, schedule, plan = DEFAULT_PLAN, tz = DEFAULT_TZ }) {
  const now = derive(ops, { at: from, tz });
  if (now.available >= price) return from;
  if (!schedule || !(schedule.amount > 0)) return null;
  const vaultPart = Math.round((schedule.amount * (schedule.vaultPct ?? 100)) / 100 / MICRO_PER_GROSZ) * MICRO_PER_GROSZ;
  if (vaultPart <= 0) return null;
  const extra = [];
  const limit = from + 5 * 366 * 86400_000;
  for (let i = 1; ; i++) {
    const t = schedule.every === 'month' ? addMonths(from, i, tz) : from + i * 7 * 86400_000;
    if (t > limit) break;
    extra.push({ id: `f${i}`, kind: 'deposit', ts: t, vault: vaultPart, now: 0, plan, seq: 1e6 + i });
  }
  const all = ops.concat(extra);
  const reached = (t) => derive(all, { at: t, tz }).available >= price;
  if (!reached(limit)) return null;
  let lo = from, hi = limit;
  while (hi - lo > 3600_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (reached(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

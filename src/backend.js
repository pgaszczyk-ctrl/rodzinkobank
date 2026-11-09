// Two interchangeable backends with the same API:
//  * LocalBackend – trial mode, everything in this browser (localStorage).
//  * CloudBackend – shared family vault on Supabase (see supabase/schema.sql).
// Both return the same snapshot shape as private.kid_json in the database and
// apply the same rules (idempotent op ids, revision checks, 24 h approval).

import { DEFAULT_PLAN, validatePlan, previewDeposit, derive } from './engine.js';
import { DEFAULT_TZ } from './calendar.js';
import { zlToMicro, MICRO_PER_GROSZ } from './money.js';

export class AppError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}

export const newId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

const DAY = 86400_000;
const SESSION_MS = 30 * 60_000;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const ssGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* private mode */ } };

export const DEFAULT_DREAMS = [
  { slot: 0, name: 'Klocki LEGO', price: 89, img: null },
  { slot: 1, name: 'Hulajnoga', price: 349, img: null },
  { slot: 2, name: 'Konsola do gier', price: 1499, img: null },
];

async function sha256(text) {
  if (globalThis.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0; return 'weak' + h;
}

/* ===================================================================== */
/*  Local (trial) backend                                                 */
/* ===================================================================== */
const LOCAL_KEY = 'groszaki.v2';

function blankKid(name, now) {
  return {
    id: newId(), name, rev: 0, plan: { ...DEFAULT_PLAN }, schedule: null, settings: { bonusPct: 20 },
    seenUntil: now, createdAt: now, ops: [], requests: [], dreams: DEFAULT_DREAMS.map((d) => ({ ...d })), viewToken: newId(),
  };
}

export class LocalBackend {
  constructor({ now = () => Date.now() } = {}) {
    this.kind = 'local';
    this.now = now;
    this.session = null;
    this.listeners = new Set();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => { if (e.key === LOCAL_KEY) this.listeners.forEach((f) => f()); });
    }
  }
  onExternalChange(fn) { this.listeners.add(fn); }

  read() {
    let data = null;
    try { data = JSON.parse(lsGet(LOCAL_KEY)); } catch { data = null; }
    if (!data || !Array.isArray(data.kids) || !data.kids.length) {
      data = this.fresh();
      lsSet(LOCAL_KEY, JSON.stringify(data)); // keep ids stable between reads
    }
    return data;
  }
  write(data) {
    if (!lsSet(LOCAL_KEY, JSON.stringify(data))) throw new AppError('storage_full');
  }
  fresh() {
    const now = this.now();
    const data = { v: 2, tz: DEFAULT_TZ, seq: 0, pinHash: null, pinSalt: null, pinFails: 0, pinLockedUntil: 0, kids: [blankKid('Skarbnik', now)] };
    // Bring over a Rodzinobank trial vault from this browser, if there is one.
    try {
      const old = JSON.parse(lsGet('rodzinobank.v1'));
      if (old && Array.isArray(old.deposits)) {
        const kid = data.kids[0];
        if (old.kidName) kid.name = String(old.kidName).slice(0, 30);
        for (const d of old.deposits) {
          const v = zlToMicro(d.amount);
          if (v > 0) kid.ops.push({ id: newId(), seq: ++data.seq, kind: 'deposit', ts: Math.min(d.ts, now), vault: v, now: 0, gift: v, plan: { ...DEFAULT_PLAN }, principal_left: v });
        }
        if (Array.isArray(old.dreams)) {
          kid.dreams = old.dreams.slice(0, 3).map((d, i) => ({ slot: i, name: d.name, price: d.price, img: d.img || null }));
        }
      }
    } catch { /* nothing to migrate */ }
    return data;
  }

  family() {
    const d = this.read();
    return { id: 'local', tz: d.tz, has_pin: !!d.pinHash, kids: d.kids.map((k) => ({ id: k.id, name: k.name })) };
  }

  snapshot(kid, data) {
    return {
      kid: { id: kid.id, name: kid.name, view_token: null },
      tz: data.tz, rev: kid.rev, plan: kid.plan, schedule: kid.schedule, settings: kid.settings,
      seen_until: kid.seenUntil, server_now: this.now(),
      ops: kid.ops.slice().sort((a, b) => a.ts - b.ts || a.seq - b.seq),
      requests: kid.requests.slice().sort((a, b) => b.created_at - a.created_at).slice(0, 20),
      dreams: kid.dreams,
    };
  }
  kidOf(data, kidId) {
    const kid = data.kids.find((k) => k.id === kidId);
    if (!kid) throw new AppError('no_access');
    return kid;
  }
  async load(kidId) { const data = this.read(); return this.snapshot(this.kidOf(data, kidId), data); }
  async version(kidId) { const data = this.read(); return String(this.kidOf(data, kidId).rev); }

  // ---- PIN ----
  checkSession(token) {
    if (!this.session || this.session.token !== token || this.session.exp < this.now()) throw new AppError('pin_required');
    this.session.exp = this.now() + SESSION_MS;
  }
  async setPin(pin, token) {
    if (!/^[0-9]{4,8}$/.test(pin)) throw new AppError('pin_format');
    const data = this.read();
    if (data.pinHash) this.checkSession(token);
    data.pinSalt = newId();
    data.pinHash = await sha256(data.pinSalt + pin);
    data.pinFails = 0; data.pinLockedUntil = 0;
    this.write(data);
    this.session = { token: newId(), exp: this.now() + SESSION_MS };
    return this.session.token;
  }
  async verifyPin(pin) {
    const data = this.read();
    if (!data.pinHash) throw new AppError('pin_not_set');
    if (data.pinLockedUntil > this.now()) return { ok: false, locked_until: data.pinLockedUntil };
    if (await sha256(data.pinSalt + pin) !== data.pinHash) {
      data.pinFails = (data.pinFails || 0) + 1;
      if (data.pinFails >= 5) { data.pinFails = 0; data.pinLockedUntil = this.now() + 5 * 60_000; }
      this.write(data);
      return { ok: false };
    }
    data.pinFails = 0; data.pinLockedUntil = 0; this.write(data);
    this.session = { token: newId(), exp: this.now() + SESSION_MS };
    return { ok: true, token: this.session.token };
  }
  async endSession() { this.session = null; }

  // ---- generic mutation with idempotency + revision check ----
  mutate(token, kidId, { opId = null, expectedRev = null, exists = null } = {}, fn) {
    if (token !== false) this.checkSession(token);
    const data = this.read();
    const kid = this.kidOf(data, kidId);
    if (opId && (exists ? exists(kid) : kid.ops.some((o) => o.id === opId))) return this.snapshot(kid, data);
    if (expectedRev != null && kid.rev !== expectedRev) throw new AppError('stale_state');
    fn(kid, data);
    kid.rev += 1;
    this.write(data);
    return this.snapshot(kid, data);
  }

  async addDeposit(token, kidId, { opId, gift, vault, now, planV, bonusId = null, bonus = 0, note = null }) {
    return this.mutate(token, kidId, { opId }, (kid, data) => {
      if (!(gift > 0) || vault < 0 || now < 0 || vault + now !== gift || gift % MICRO_PER_GROSZ || vault % MICRO_PER_GROSZ) throw new AppError('amount_invalid');
      if (vault > 0 && planV != null && kid.plan.v !== planV) throw new AppError('plan_changed');
      const ts = this.now();
      kid.ops.push({ id: opId, seq: ++data.seq, kind: 'deposit', ts, vault, now, gift, plan: vault > 0 ? { ...kid.plan } : null, principal_left: vault > 0 ? vault : null, note: note || null });
      if (bonus > 0) {
        if (now !== 0 || vault === 0 || !bonusId || bonus % MICRO_PER_GROSZ) throw new AppError('bonus_not_allowed');
        const p = previewDeposit({ amount: vault, plan: kid.plan, start: ts, tz: data.tz });
        if (bonus > p.maxBonus + MICRO_PER_GROSZ) throw new AppError('bonus_over_budget');
        kid.ops.push({ id: bonusId, seq: ++data.seq, kind: 'bonus', ts, vault: bonus, ref: opId });
      }
    });
  }

  async voidDeposit(token, kidId, { opId, expectedRev }) {
    this.checkSession(token);
    const data = this.read();
    const kid = this.kidOf(data, kidId);
    const op = kid.ops.find((o) => o.id === opId && o.kind === 'deposit');
    if (!op) return this.snapshot(kid, data);
    return this.mutate(false, kidId, { expectedRev }, (k) => {
      const o = k.ops.find((x) => x.id === opId);
      if (o.ts < this.now() - DAY) throw new AppError('void_too_old');
      if (k.ops.some((x) => x.seq > o.seq && x.ref !== o.id)) throw new AppError('void_not_last');
      k.ops = k.ops.filter((x) => x.id !== opId && x.ref !== opId);
    });
  }

  applyAlloc(kid, amount, alloc) {
    if (!alloc || typeof alloc !== 'object' || !(alloc.free >= 0)) throw new AppError('alloc_invalid');
    let sum = 0;
    for (const [id, amt] of Object.entries(alloc.principal || {})) {
      const d = kid.ops.find((o) => o.id === id && o.kind === 'deposit');
      if (!(amt > 0) || !d || d.principal_left < amt) throw new AppError('alloc_invalid');
      sum += amt;
    }
    if (alloc.free + sum !== amount) throw new AppError('alloc_invalid');
    for (const [id, amt] of Object.entries(alloc.principal || {})) kid.ops.find((o) => o.id === id).principal_left -= amt;
  }
  nowPool(kid) { return kid.ops.reduce((s, o) => s + (o.kind === 'now_out' ? -o.now : (o.now || 0)), 0); }

  async addCorrection(token, kidId, { opId, expectedRev, vault = 0, now = 0, alloc = null, note = null }) {
    return this.mutate(token, kidId, { opId, expectedRev }, (kid, data) => {
      if ((!vault && !now) || vault % MICRO_PER_GROSZ || now % MICRO_PER_GROSZ) throw new AppError('amount_invalid');
      if (now < 0 && this.nowPool(kid) + now < 0) throw new AppError('now_insufficient');
      if (vault < 0) this.applyAlloc(kid, -vault, alloc);
      kid.ops.push({ id: opId, seq: ++data.seq, kind: 'correction', ts: this.now(), vault, now, alloc: vault < 0 ? alloc : null, note: note || null });
    });
  }

  async spendNow(token, kidId, { opId, expectedRev, amount, note = null }) {
    return this.mutate(token, kidId, { opId, expectedRev }, (kid, data) => {
      if (!(amount > 0) || amount % MICRO_PER_GROSZ) throw new AppError('amount_invalid');
      if (this.nowPool(kid) < amount) throw new AppError('now_insufficient');
      kid.ops.push({ id: opId, seq: ++data.seq, kind: 'now_out', ts: this.now(), vault: 0, now: amount, note: note || null });
    });
  }

  async approveWithdrawal(token, kidId, { requestId, opId, expectedRev, alloc }) {
    this.checkSession(token);
    const data = this.read();
    const kid = this.kidOf(data, kidId);
    const r = kid.requests.find((x) => x.id === requestId);
    if (!r) throw new AppError('request_unknown');
    if (r.status === 'approved' && r.op_id === opId) return this.snapshot(kid, data);
    if (r.status !== 'pending') throw new AppError('request_closed');
    if (this.now() < r.created_at + DAY) throw new AppError('request_too_early');
    return this.mutate(false, kidId, { expectedRev }, (k, dd) => {
      const req = k.requests.find((x) => x.id === requestId);
      this.applyAlloc(k, req.amount, alloc);
      k.ops.push({ id: opId, seq: ++dd.seq, kind: 'withdrawal', ts: this.now(), vault: -req.amount, alloc, request_id: req.id });
      Object.assign(req, { status: 'approved', decided_at: this.now(), op_id: opId });
    });
  }

  async rejectWithdrawal(token, kidId, { requestId }) {
    return this.mutate(token, kidId, { opId: requestId, exists: (k) => !k.requests.some((r) => r.id === requestId && r.status === 'pending') }, (k) => {
      Object.assign(k.requests.find((r) => r.id === requestId), { status: 'rejected', decided_at: this.now() });
    });
  }

  async savePlan(token, kidId, { th, rate, bonusPct = null }) {
    return this.mutate(token, kidId, {}, (kid) => {
      const errs = validatePlan({ th, rate });
      if (errs.length) throw new AppError(errs[0]);
      kid.plan = { v: (kid.plan.v || 0) + 1, th: th.slice(), rate };
      if (bonusPct != null) kid.settings = { ...kid.settings, bonusPct: Math.max(0, Math.min(50, bonusPct)) };
    });
  }

  async saveSchedule(token, kidId, schedule) {
    return this.mutate(token, kidId, {}, (kid) => {
      if (schedule && (!(schedule.amount > 0) || schedule.amount % MICRO_PER_GROSZ || !['week', 'month'].includes(schedule.every))) throw new AppError('schedule_invalid');
      kid.schedule = schedule ? { amount: schedule.amount, every: schedule.every, vaultPct: schedule.vaultPct ?? 100 } : null;
    });
  }

  async saveDream(token, kidId, { slot, name, price, img }) {
    return this.mutate(token, kidId, {}, (kid) => {
      if (!(price > 0) || price > 1_000_000 || !name) throw new AppError('dream_invalid');
      kid.dreams[slot] = { slot, name: name.slice(0, 40), price: Math.round(price * 100) / 100, img: img || null };
    });
  }

  async requestWithdrawal(kidId, { id, amount }) {
    return this.mutate(false, kidId, { opId: id, exists: (k) => k.requests.some((r) => r.id === id) }, (kid) => {
      if (!(amount > 0) || amount % MICRO_PER_GROSZ) throw new AppError('amount_invalid');
      if (kid.requests.some((r) => r.status === 'pending')) throw new AppError('request_pending');
      const st = derive(kid.ops.map(normalizeOp), { at: this.now(), tz: this.read().tz });
      if (amount > st.available) throw new AppError('amount_invalid');
      kid.requests.push({ id, amount, status: 'pending', created_at: this.now(), decided_at: null });
    });
  }
  async cancelWithdrawal(kidId, { id }) {
    return this.mutate(false, kidId, { opId: id, exists: (k) => !k.requests.some((r) => r.id === id && r.status === 'pending') }, (kid) => {
      Object.assign(kid.requests.find((r) => r.id === id), { status: 'cancelled', decided_at: this.now() });
    });
  }
  async markSeen(kidId, until) {
    const data = this.read();
    const kid = this.kidOf(data, kidId);
    kid.seenUntil = Math.max(kid.seenUntil || 0, Math.min(until, this.now()));
    this.write(data);
  }

  // ---- family management (trial) ----
  async addKid(token, name) {
    this.checkSession(token);
    const data = this.read();
    const kid = blankKid(name.slice(0, 30), this.now());
    data.kids.push(kid); this.write(data);
    return kid.id;
  }
  async renameKid(token, kidId, name) {
    return this.mutate(token, kidId, {}, (kid) => { kid.name = name.slice(0, 30); });
  }
  async resetAll(token) {
    this.checkSession(token);
    const data = this.fresh();
    const old = this.read();
    data.pinHash = old.pinHash; data.pinSalt = old.pinSalt;
    try { localStorage.removeItem('rodzinobank.v1'); } catch { /* ignore */ }
    data.kids = [blankKid('Skarbnik', this.now())];
    this.write(data);
    return data.kids[0].id;
  }
  async loadDemo(token, kidId) {
    this.checkSession(token);
    const data = this.read();
    const kid = this.kidOf(data, kidId);
    const now = this.now();
    const plan = { ...kid.plan };
    const g1 = newId(), d2 = newId(), d3 = newId();
    kid.ops = [
      { id: g1, seq: ++data.seq, kind: 'deposit', ts: now - 75 * DAY, vault: 30_000_000, now: 10_000_000, gift: 40_000_000, plan, principal_left: 30_000_000, note: 'Prezent od babci' },
      { id: newId(), seq: ++data.seq, kind: 'now_out', ts: now - 70 * DAY, vault: 0, now: 4_000_000, note: 'Lody' },
      { id: d2, seq: ++data.seq, kind: 'deposit', ts: now - 20 * DAY, vault: 25_000_000, now: 0, gift: 25_000_000, plan, principal_left: 25_000_000, note: 'Kieszonkowe' },
      { id: newId(), seq: ++data.seq, kind: 'bonus', ts: now - 20 * DAY, vault: 5_000_000, ref: d2 },
      { id: d3, seq: ++data.seq, kind: 'deposit', ts: now - 2 * DAY, vault: 10_000_000, now: 0, gift: 10_000_000, plan, principal_left: 10_000_000 },
    ];
    kid.requests = [{ id: newId(), amount: 5_000_000, status: 'pending', created_at: now - 26 * 3600_000, decided_at: null }];
    kid.seenUntil = now - 40 * DAY;
    kid.rev += 1;
    this.write(data);
  }
}

/* ===================================================================== */
/*  Cloud backend (Supabase RPC)                                          */
/* ===================================================================== */
export class CloudBackend {
  constructor(sb, { role = 'parent', token = null } = {}) {
    this.kind = 'cloud';
    this.sb = sb;
    this.role = role;          // 'parent' (logged in) | 'kid' (link token)
    this.viewToken = token;
    this.listeners = new Set();
  }
  onExternalChange(fn) { this.listeners.add(fn); }

  async rpc(fn, args = {}) {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) {
      const code = /^[a-z_]+$/.test(error.message || '') ? error.message : (/fetch|network/i.test(error.message || '') ? 'network' : 'server');
      throw new AppError(code, { detail: error.message });
    }
    return data;
  }

  get session() {
    try {
      const s = JSON.parse(ssGet('groszaki.pin'));
      if (s && s.exp > Date.now()) return s;
    } catch { /* none */ }
    return null;
  }
  keepSession(token) { ssSet('groszaki.pin', token ? JSON.stringify({ token, exp: Date.now() + SESSION_MS - 60_000 }) : null); }

  async family() { return this.rpc('my_family'); }
  async load(kidId) {
    return this.role === 'kid' ? this.rpc('kid_state_by_token', { p_token: this.viewToken }) : this.rpc('kid_state', { p_kid: kidId });
  }
  async version(kidId) {
    return this.role === 'kid' ? this.rpc('kid_version_by_token', { p_token: this.viewToken }) : this.rpc('kid_version', { p_kid: kidId });
  }

  async setPin(pin, token) { const t = await this.rpc('set_pin', { p_pin: pin, p_session: token || null }); this.keepSession(t); return t; }
  async verifyPin(pin) {
    const r = await this.rpc('verify_pin', { p_pin: pin });
    if (r && r.ok) this.keepSession(r.token);
    return r;
  }
  async endSession(token) { this.keepSession(null); if (token) await this.rpc('end_parent_session', { p_session: token }).catch(() => {}); }

  // Each parent call refreshes the local session expiry (the server slides it too).
  async p(fn, args) { const r = await this.rpc(fn, args); if (args.p_session) this.keepSession(args.p_session); return r; }

  addDeposit(token, kidId, o) {
    return this.p('add_deposit', { p_session: token, p_kid: kidId, p_op_id: o.opId, p_gift: o.gift, p_vault: o.vault, p_now: o.now, p_plan_v: o.planV ?? null, p_bonus_id: o.bonusId || null, p_bonus: o.bonus || 0, p_note: o.note || null });
  }
  voidDeposit(token, kidId, o) { return this.p('void_deposit', { p_session: token, p_kid: kidId, p_op_id: o.opId, p_expected_rev: o.expectedRev }); }
  addCorrection(token, kidId, o) {
    return this.p('add_correction', { p_session: token, p_kid: kidId, p_op_id: o.opId, p_expected_rev: o.expectedRev, p_vault: o.vault || 0, p_now: o.now || 0, p_alloc: o.alloc || null, p_note: o.note || null });
  }
  spendNow(token, kidId, o) { return this.p('spend_now', { p_session: token, p_kid: kidId, p_op_id: o.opId, p_expected_rev: o.expectedRev, p_amount: o.amount, p_note: o.note || null }); }
  approveWithdrawal(token, _kidId, o) { return this.p('approve_withdrawal', { p_session: token, p_request: o.requestId, p_op_id: o.opId, p_expected_rev: o.expectedRev, p_alloc: o.alloc }); }
  rejectWithdrawal(token, _kidId, o) { return this.p('reject_withdrawal', { p_session: token, p_request: o.requestId }); }
  savePlan(token, kidId, o) { return this.p('save_plan', { p_session: token, p_kid: kidId, p_th: o.th, p_rate: o.rate, p_bonus_pct: o.bonusPct ?? null }); }
  saveSchedule(token, kidId, s) { return this.p('save_schedule', { p_session: token, p_kid: kidId, p_schedule: s }); }
  saveDream(token, kidId, d) { return this.p('save_dream', { p_session: token, p_kid: kidId, p_slot: d.slot, p_name: d.name, p_price: d.price, p_img: d.img || null }); }

  requestWithdrawal(kidId, o) {
    return this.role === 'kid'
      ? this.rpc('request_withdrawal_by_token', { p_token: this.viewToken, p_id: o.id, p_amount: o.amount })
      : this.rpc('request_withdrawal', { p_kid: kidId, p_id: o.id, p_amount: o.amount });
  }
  cancelWithdrawal(kidId, o) {
    return this.role === 'kid'
      ? this.rpc('cancel_withdrawal_by_token', { p_token: this.viewToken, p_id: o.id })
      : this.rpc('cancel_withdrawal', { p_kid: kidId, p_id: o.id });
  }
  markSeen(kidId, until) {
    return (this.role === 'kid'
      ? this.rpc('mark_seen_by_token', { p_token: this.viewToken, p_until: Math.floor(until) })
      : this.rpc('mark_seen', { p_kid: kidId, p_until: Math.floor(until) })).catch(() => {});
  }

  async addKid(token, name) { const f = await this.p('add_kid', { p_session: token, p_name: name }); return f.kids[f.kids.length - 1].id; }
  renameKid(token, kidId, name) { return this.p('rename_kid', { p_session: token, p_kid: kidId, p_name: name }); }
  regenerateLink(token, kidId) { return this.p('regenerate_kid_link', { p_session: token, p_kid: kidId }); }
}

/** Database/local op → engine op. */
export function normalizeOp(o) {
  return {
    id: o.id, seq: Number(o.seq || 0), kind: o.kind, ts: Number(o.ts),
    vault: Number(o.vault || 0), now: Number(o.now || 0), gift: o.gift != null ? Number(o.gift) : null,
    plan: o.plan || null, ref: o.ref || null, requestId: o.request_id || null, note: o.note || null,
    alloc: o.alloc ? { free: Number(o.alloc.free || 0), principal: Object.fromEntries(Object.entries(o.alloc.principal || {}).map(([k, v]) => [k, Number(v)])) } : null,
  };
}

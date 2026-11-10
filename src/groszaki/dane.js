// Warstwa danych Groszaków: ten sam interfejs dla trzech trybów.
//   'parent' – zalogowany rodzic, Supabase (funkcje gr_* z migracji),
//   'kid'    – dziecko z tajnym linkiem, Supabase (tylko odczyt + cele),
//   'local'  – tryb próbny, wszystko w localStorage tej przeglądarki.
//
// Stan w pamięci (wspólny kształt):
//   kid:      { id, name, ferie: { start, end } | null, viewToken? }
//   events:   [{ id, type, ts, amount?, rates?, note? }]   – jak w finanse.js
//   goals:    [{ id, nazwa, kwota, ikona, img? }]
//   plans:    [{ id, amount, every, startDay }]
//   calendar: [{ id, nazwa, day, ikona }]
//
// Każdy zapis ma identyfikator nadany tutaj (crypto.randomUUID), więc ponowienie
// po błędzie sieci niczego nie dubluje.

import { validateEvent, MICRO_PER_GROSZ } from './finanse.js';
import { dayNumberOf, dateOfDay, dayOf, dayStart } from './czas.js';

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  }));

/** '2027-02-15' → numer dnia i z powrotem. */
export const isoToDay = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return dayNumberOf(y, m, d); };
export const dayToIso = (n) => { const d = dateOfDay(n); return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`; };

const ERR = {
  BAD_AMOUNT: 'Nieprawidłowa kwota',
  NOT_FULL_GROSZ: 'Kwota musi być w pełnych groszach',
  IN_FUTURE: 'Data nie może być w przyszłości',
  INSUFFICIENT: 'Za mało pieniędzy w Skarbcu',
  RATE_RETROACTIVE: 'Zmiana może obowiązywać najwcześniej od jutra',
  BAD_RATES: 'Nieprawidłowa stawka',
  RATE_NOT_MIDNIGHT: 'Nieprawidłowa data zmiany',
  BAD_TYPE: 'Nieznany rodzaj operacji',
};

function fromServer(js) {
  return {
    kid: {
      id: js.kid.id, name: js.kid.name, viewToken: js.kid.view_token || null,
      ferie: js.kid.ferie ? { start: isoToDay(js.kid.ferie.start), end: isoToDay(js.kid.ferie.end) } : null,
    },
    events: js.events.map((e) => {
      const o = { id: e.id, type: e.type, ts: Number(e.ts), note: e.note || '' };
      if (e.type === 'rate') o.rates = { low: Number(e.rates.low), high: Number(e.rates.high), threshold: Number(e.rates.threshold) };
      else o.amount = Number(e.amount);
      return o;
    }),
    goals: js.goals.map((g) => ({ id: g.id, nazwa: g.name, kwota: Number(g.amount), ikona: g.icon || '', img: g.img || '' })),
    plans: js.plans.map((p) => ({ id: p.id, amount: Number(p.amount), every: p.every, startDay: isoToDay(p.start) })),
    calendar: js.calendar.map((c) => ({ id: c.id, nazwa: c.name, day: isoToDay(c.day), ikona: c.icon || '' })),
    version: js.version,
  };
}

// ---------------------------------------------------------------------------
//  Tryb próbny
// ---------------------------------------------------------------------------
const LOCAL_KEY = 'groszaki.v1';
const OLD_LOCAL_KEY = 'rodzinobank.v1';

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* prywatne okno */ } }

/** Stara „Premia za cierpliwość” – tylko do przeniesienia danych z Rodzinobanku. */
export function legacyValue(amount, days) {
  const MD = 365 / 12, CYC = MD * 6;
  const T = [0, 0.05, 0.10, 0.18, 0.27, 0.38, 0.50];
  if (days <= 0) return amount;
  const n = Math.floor(days / CYC);
  const m = (days - n * CYC) / MD;
  const b = m >= 6 ? 0.5 : T[Math.floor(m)] + (T[Math.floor(m) + 1] - T[Math.floor(m)]) * (m - Math.floor(m));
  return amount * Math.pow(1.5, n) * (1 + b);
}

function demoState(now) {
  const today = dayOf(now);
  return {
    kid: { id: 'local', name: 'Skarbnik', ferie: null },
    events: [
      { id: uuid(), type: 'deposit', ts: now - 40 * 86400000, amount: 50_000_000, note: 'od babci' },
      { id: uuid(), type: 'deposit', ts: now - 12 * 86400000, amount: 20_000_000, note: 'kieszonkowe' },
    ],
    goals: [
      { id: uuid(), nazwa: 'Klocki', kwota: 89_000_000, ikona: '🧩' },
      { id: uuid(), nazwa: 'Hulajnoga', kwota: 349_000_000, ikona: '🛴' },
    ],
    plans: [],
    calendar: [{ id: uuid(), nazwa: 'Urodziny', day: today + 60, ikona: '🎂' }],
  };
}

function loadLocal(now) {
  try {
    const s = JSON.parse(lsGet(LOCAL_KEY));
    if (s && Array.isArray(s.events)) return s;
  } catch { /* uszkodzone dane – zaczynamy od nowa */ }
  // przeniesienie trybu próbnego starego Rodzinobanku
  try {
    const old = JSON.parse(lsGet(OLD_LOCAL_KEY));
    if (old && Array.isArray(old.deposits)) {
      const val = old.deposits.reduce((s, d) => s + legacyValue(Number(d.amount), (now - d.ts) / 86400000), 0);
      const micro = Math.floor(val * 100) * MICRO_PER_GROSZ;
      return {
        kid: { id: 'local', name: old.kidName || 'Skarbnik', ferie: null },
        events: micro > 0 ? [{ id: uuid(), type: 'deposit', ts: now, amount: micro, note: 'Przeniesione z Rodzinobanku' }] : [],
        goals: (old.dreams || []).filter((d) => d && d.name).map((d) => ({
          id: uuid(), nazwa: String(d.name).slice(0, 40), kwota: Math.round(Number(d.price) * 100) * MICRO_PER_GROSZ,
          ikona: d.img ? '' : '⭐', img: d.img || '' })),
        plans: [], calendar: [],
      };
    }
  } catch { /* brak starych danych */ }
  return demoState(now);
}

// ---------------------------------------------------------------------------
//  Magazyn
// ---------------------------------------------------------------------------
export class Store {
  /** opts: { mode, sb, kidId, token } */
  constructor(opts) {
    Object.assign(this, opts);
    this.state = null;
    this.version = null;
  }

  async rpc(fn, args) {
    const { data, error } = await this.sb.rpc(fn, args || {});
    if (error) throw new Error(error.message || 'Błąd połączenia');
    return data;
  }

  /** Zapis z ponowieniem przy chwilowym braku sieci (ten sam id = bez dublowania). */
  async rpcRetry(fn, args) {
    let last;
    for (let i = 0; i < 3; i++) {
      try { return await this.rpc(fn, args); }
      catch (e) {
        last = e;
        if (!/fetch|network|Failed|timeout/i.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    throw last;
  }

  async load() {
    if (this.mode === 'local') { this.state = loadLocal(Date.now()); this.saveLocal(); return this.state; }
    const js = this.mode === 'kid'
      ? await this.rpc('gr_kid_state_by_token', { p_token: this.token })
      : await this.rpc('gr_kid_state', { p_kid: this.kidId });
    if (!js) throw new Error('Nie znaleziono skarbca');
    this.state = fromServer(js);
    this.version = this.state.version;
    return this.state;
  }

  /** Czy na serwerze coś się zmieniło (polling co kilkanaście sekund). */
  async changed() {
    if (this.mode === 'local') return false;
    const v = this.mode === 'kid'
      ? await this.rpc('gr_kid_version_by_token', { p_token: this.token })
      : await this.rpc('gr_kid_version', { p_kid: this.kidId });
    return v !== this.version;
  }

  saveLocal() { if (this.mode === 'local') lsSet(LOCAL_KEY, JSON.stringify(this.state)); }
  resetLocal() { this.state = demoState(Date.now()); this.saveLocal(); }

  // ------------------------------------------------------------ pieniądze (rodzic)
  /** type: 'deposit' | 'withdrawal' | 'adjustment'; amount w µg (pełne grosze). */
  async addMoney(type, ts, amount, note = '') {
    const ev = { id: uuid(), type, ts: Math.min(ts, Date.now()), amount, note };
    const err = validateEvent(this.state.events, ev, Date.now());
    if (err) throw new Error(ERR[err] || err);
    if (this.mode === 'local') { this.state.events.push(ev); this.saveLocal(); return ev; }
    await this.rpcRetry('gr_add_money', { p_kid: this.kidId, p_id: ev.id, p_type: type, p_ts: new Date(ev.ts).toISOString(), p_amount: amount, p_note: note || null });
    await this.load();
    return ev;
  }

  /** Nowe stawki od północy dnia fromDay (najwcześniej jutro). */
  async setRates(fromDay, low, high, threshold) {
    const ev = { id: uuid(), type: 'rate', ts: dayStart(fromDay), rates: { low, high, threshold } };
    const err = validateEvent(this.state.events, ev, Date.now());
    if (err) throw new Error(ERR[err] || err);
    if (this.mode === 'local') { this.state.events.push(ev); this.saveLocal(); return; }
    await this.rpcRetry('gr_set_rates', { p_kid: this.kidId, p_id: ev.id, p_from: dayToIso(fromDay), p_low: low, p_high: high, p_threshold: threshold });
    await this.load();
  }

  async deleteEvent(id) {
    if (this.mode === 'local') {
      const ev = this.state.events.find((e) => e.id === id);
      if (ev?.type === 'rate' && ev.ts <= Date.now()) throw new Error('Ta zmiana stawek już obowiązuje – ustaw nową od jutra');
      const rest = this.state.events.filter((e) => e.id !== id);
      // usunięcie nie może zrobić debetu w żadnym momencie
      const probe = rest.filter((e) => e.type !== 'rate');
      for (const e of probe) {
        if (e.type === 'withdrawal' || e.amount < 0) {
          const others = rest.filter((x) => x !== e);
          if (validateEvent(others, e, Date.now())) throw new Error('Po usunięciu tej wpłaty saldo byłoby ujemne');
        }
      }
      this.state.events = rest; this.saveLocal(); return;
    }
    await this.rpcRetry('gr_delete_event', { p_kid: this.kidId, p_id: id });
    await this.load();
  }

  // ------------------------------------------------------------ cele (rodzic i dziecko)
  async saveGoal(g) {
    const goal = { id: g.id || uuid(), nazwa: g.nazwa.trim().slice(0, 40), kwota: g.kwota, ikona: g.ikona || '', img: g.img || '' };
    if (!goal.nazwa || !(goal.kwota > 0) || goal.kwota % MICRO_PER_GROSZ) throw new Error('Nieprawidłowy cel');
    if (this.mode === 'local') {
      const i = this.state.goals.findIndex((x) => x.id === goal.id);
      if (i >= 0) this.state.goals[i] = goal; else this.state.goals.push(goal);
      this.saveLocal(); return;
    }
    if (this.mode === 'kid') await this.rpcRetry('gr_save_goal_by_token', { p_token: this.token, p_id: goal.id, p_name: goal.nazwa, p_amount: goal.kwota, p_icon: goal.ikona });
    else await this.rpcRetry('gr_save_goal', { p_kid: this.kidId, p_id: goal.id, p_name: goal.nazwa, p_amount: goal.kwota, p_icon: goal.ikona });
    await this.load();
  }

  async deleteGoal(id) {
    if (this.mode === 'local') { this.state.goals = this.state.goals.filter((g) => g.id !== id); this.saveLocal(); return; }
    if (this.mode === 'kid') await this.rpcRetry('gr_delete_goal_by_token', { p_token: this.token, p_id: id });
    else await this.rpcRetry('gr_delete_goal', { p_kid: this.kidId, p_id: id });
    await this.load();
  }

  // ------------------------------------------------------------ plany, kalendarz, ferie (rodzic)
  async savePlan(p) {
    const plan = { id: p.id || uuid(), amount: p.amount, every: p.every, startDay: p.startDay };
    if (!(plan.amount > 0) || plan.amount % MICRO_PER_GROSZ) throw new Error('Nieprawidłowa kwota');
    if (this.mode === 'local') {
      const i = this.state.plans.findIndex((x) => x.id === plan.id);
      if (i >= 0) this.state.plans[i] = plan; else this.state.plans.push(plan);
      this.saveLocal(); return;
    }
    await this.rpcRetry('gr_save_plan', { p_kid: this.kidId, p_id: plan.id, p_amount: plan.amount, p_every: plan.every, p_start: dayToIso(plan.startDay) });
    await this.load();
  }
  async deletePlan(id) {
    if (this.mode === 'local') { this.state.plans = this.state.plans.filter((p) => p.id !== id); this.saveLocal(); return; }
    await this.rpcRetry('gr_delete_plan', { p_kid: this.kidId, p_id: id });
    await this.load();
  }
  async saveCalendar(c) {
    const item = { id: c.id || uuid(), nazwa: c.nazwa.trim().slice(0, 40), day: c.day, ikona: c.ikona || '' };
    if (!item.nazwa || !Number.isInteger(item.day)) throw new Error('Uzupełnij nazwę i datę');
    if (this.mode === 'local') {
      const i = this.state.calendar.findIndex((x) => x.id === item.id);
      if (i >= 0) this.state.calendar[i] = item; else this.state.calendar.push(item);
      this.saveLocal(); return;
    }
    await this.rpcRetry('gr_save_calendar', { p_kid: this.kidId, p_id: item.id, p_name: item.nazwa, p_day: dayToIso(item.day), p_icon: item.ikona });
    await this.load();
  }
  async deleteCalendar(id) {
    if (this.mode === 'local') { this.state.calendar = this.state.calendar.filter((c) => c.id !== id); this.saveLocal(); return; }
    await this.rpcRetry('gr_delete_calendar', { p_kid: this.kidId, p_id: id });
    await this.load();
  }
  async setFerie(ferie) {
    if (ferie && !(ferie.end >= ferie.start)) throw new Error('Nieprawidłowy termin ferii');
    if (this.mode === 'local') { this.state.kid.ferie = ferie; this.saveLocal(); return; }
    await this.rpcRetry('gr_set_ferie', { p_kid: this.kidId, p_start: ferie ? dayToIso(ferie.start) : null, p_end: ferie ? dayToIso(ferie.end) : null });
    await this.load();
  }
  async renameKid(name) {
    if (this.mode === 'local') { this.state.kid.name = name; this.saveLocal(); return; }
    await this.rpcRetry('rename_kid', { p_kid: this.kidId, p_name: name });
    await this.load();
  }
}

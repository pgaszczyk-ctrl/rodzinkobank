// Groszaki – model pieniędzy. Czyste funkcje: bez DOM, bez Supabase.
//
// Jednostka: całkowite mikrogrosze (µg). 1 zł = 100 gr, 1 gr = 10 000 µg.
// Źródło prawdy: dziennik zdarzeń. Saldo zawsze wyliczamy z dziennika
// i upływu czasu, więc odświeżenie strony, druga karta czy ponowiony zapis
// (to samo `id`) nie mogą niczego naliczyć podwójnie.
//
// Zdarzenie:
//   { id, type: 'deposit' | 'withdrawal' | 'adjustment' | 'rate', ts, amount?, rates?, note? }
//   - deposit     – wpłata, amount > 0
//   - withdrawal  – wypłata, amount > 0, tylko pełne grosze
//   - adjustment  – korekta, amount ≠ 0 (może być ujemna)
//   - rate        – zmiana oprocentowania od chwili ts (północ wybranego dnia):
//                   rates = { low, high, threshold } – stawki miesięczne i próg w µg
//
// Oprocentowanie progowe, składane, z kapitalizacją dzienną:
//   stawka dzienna = (1 + stawka miesięczna)^(1/30,4375) − 1,
//   osobno dla części salda do progu i ponad próg.
// Wewnątrz doby odsetki rosną liniowo do kwoty należnej na koniec doby
// (proporcjonalnie do czasu, z podziałem na odcinki między zdarzeniami).
// Na koniec doby odsetki są dopisywane do salda (zaokrąglone w dół do 1 µg).

import { DEFAULT_TZ, dayOf, dayStart } from './czas.js';

export const MICRO_PER_GROSZ = 10_000;
export const MICRO_PER_ZL = 1_000_000;
export const DAYS_PER_MONTH = 30.4375;
export const TICK_MS = 10_000;

/** Złote (liczba, np. 12.5) → µg. */
export const zl = (x) => Math.round(x * MICRO_PER_ZL);
/** µg → złote (liczba zmiennoprzecinkowa, tylko do wyświetlania). */
export const toZl = (micro) => micro / MICRO_PER_ZL;

export const DEFAULT_RATES = Object.freeze({ low: 0.05, high: 0.03, threshold: zl(1000) });

export function dailyRate(monthly) {
  return Math.pow(1 + monthly, 1 / DAYS_PER_MONTH) - 1;
}

const TYPE_ORDER = { rate: 0, deposit: 1, adjustment: 2, withdrawal: 3 };

/** Usuwa duplikaty (to samo id = ten sam zapis) i sortuje chronologicznie. */
export function normalizeEvents(events) {
  const seen = new Set();
  const out = [];
  for (const e of events || []) {
    if (!e) continue;
    if (e.id != null) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
    }
    out.push(e);
  }
  return out.sort((a, b) =>
    a.ts - b.ts
    || (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
    || String(a.id ?? '').localeCompare(String(b.id ?? '')));
}

function compileRates(r) {
  return { low: r.low, high: r.high, threshold: r.threshold, dLow: dailyRate(r.low), dHigh: dailyRate(r.high) };
}

/** Odsetki za pełną dobę od salda `base`. */
function dayInterest(base, r) {
  if (base <= 0) return 0;
  const low = Math.min(base, r.threshold);
  return low * r.dLow + (base - low) * r.dHigh;
}

function snapshot(st) {
  const accrued = Math.floor(st.accrued);
  return {
    total: st.balance + accrued,          // saldo do pokazania (µg, całkowite)
    deposited: st.deposited,
    withdrawn: st.withdrawn,
    adjusted: st.adjusted,
    interest: st.interest + accrued,      // odsetki łącznie (µg)
    rates: { low: st.rates.low, high: st.rates.high, threshold: st.rates.threshold },
  };
}

/**
 * Przelicza dziennik do chwili `until` (włącznie ze zdarzeniami o ts ≤ until).
 * opts: { tz, rates, onDayEnd(day, snap), onEvent(e, before, after) }
 */
export function simulate(events, until, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TZ;
  const list = opts.normalized ? events : normalizeEvents(events);
  const st = { balance: 0, accrued: 0, deposited: 0, withdrawn: 0, adjusted: 0, interest: 0,
               rates: compileRates(opts.rates ?? DEFAULT_RATES) };
  if (!list.length || until < list[0].ts) return snapshot(st);

  let i = 0;
  let day = dayOf(list[0].ts, tz);
  for (;;) {
    const ds = dayStart(day, tz);
    const de = dayStart(day + 1, tz);
    const len = de - ds;
    let seg = ds;
    while (i < list.length && list[i].ts < de && list[i].ts <= until) {
      const e = list[i++];
      st.accrued += dayInterest(st.balance, st.rates) * (e.ts - seg) / len;
      seg = e.ts;
      const before = opts.onEvent ? snapshot(st) : null;
      switch (e.type) {
        case 'deposit':    st.balance += e.amount; st.deposited += e.amount; break;
        case 'withdrawal': st.balance -= e.amount; st.withdrawn += e.amount; break;
        case 'adjustment': st.balance += e.amount; st.adjusted += e.amount; break;
        case 'rate':       st.rates = compileRates(e.rates); break;
        default: break;
      }
      if (opts.onEvent) opts.onEvent(e, before, snapshot(st));
    }
    if (until < de) {
      st.accrued += dayInterest(st.balance, st.rates) * (until - seg) / len;
      return snapshot(st);
    }
    st.accrued += dayInterest(st.balance, st.rates) * (de - seg) / len;
    const cap = Math.floor(st.accrued);
    st.balance += cap;
    st.interest += cap;
    st.accrued = 0;
    if (opts.onDayEnd && opts.onDayEnd(day, snapshot(st)) === false) return snapshot(st);
    day++;
  }
}

/** Saldo (µg) w chwili `t`. */
export function balanceAt(events, t, opts) {
  return simulate(events, t, opts).total;
}

/** Chwila, dla której pokazujemy saldo: licznik zmienia się co 10 s. */
export function tickTime(t) {
  return Math.floor(t / TICK_MS) * TICK_MS;
}

/** Czy między dwoma saldami przekroczono pełny grosz (do podświetlenia dużej kwoty). */
export function crossedFullGrosz(prev, next) {
  return Math.floor(prev / MICRO_PER_GROSZ) !== Math.floor(next / MICRO_PER_GROSZ);
}

/** Najwyższa możliwa wypłata w chwili `t`: tylko pełne grosze. */
export function maxWithdrawal(events, t, opts) {
  const total = balanceAt(events, t, opts);
  return Math.max(0, Math.floor(total / MICRO_PER_GROSZ) * MICRO_PER_GROSZ);
}

/** Bieżące stawki w chwili `t`. */
export function ratesAt(events, t, opts) {
  return simulate(events, t, opts).rates;
}

/**
 * Sprawdza nowe zdarzenie przed zapisem. Zwraca null albo kod błędu:
 * 'BAD_TYPE', 'BAD_AMOUNT', 'NOT_FULL_GROSZ', 'IN_FUTURE', 'INSUFFICIENT',
 * 'BAD_RATES', 'RATE_NOT_MIDNIGHT', 'RATE_RETROACTIVE'.
 */
export function validateEvent(events, ev, now, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TZ;
  if (!ev || !(ev.type in TYPE_ORDER)) return 'BAD_TYPE';
  if (!Number.isFinite(ev.ts)) return 'BAD_TYPE';

  if (ev.type === 'rate') {
    const r = ev.rates;
    if (!r || !(r.low >= 0 && r.low <= 1) || !(r.high >= 0 && r.high <= 1)
        || !Number.isInteger(r.threshold) || r.threshold < 0) return 'BAD_RATES';
    if (dayStart(dayOf(ev.ts, tz), tz) !== ev.ts) return 'RATE_NOT_MIDNIGHT';
    // Najwcześniej od jutra: dzisiejsze odsetki już rosną według starych stawek.
    if (ev.ts < dayStart(dayOf(now, tz) + 1, tz)) return 'RATE_RETROACTIVE';
    return null;
  }

  if (!Number.isInteger(ev.amount) || ev.amount === 0) return 'BAD_AMOUNT';
  if (ev.type !== 'adjustment' && ev.amount < 0) return 'BAD_AMOUNT';
  if (ev.type === 'withdrawal' && ev.amount % MICRO_PER_GROSZ !== 0) return 'NOT_FULL_GROSZ';
  if (ev.ts > now) return 'IN_FUTURE';

  if (ev.type === 'withdrawal' || ev.amount < 0) {
    // Saldo nie może spaść poniżej zera w żadnym momencie (także przy datach wstecznych).
    let ok = true;
    simulate([...events, ev], now, { ...opts, onEvent: (_e, _b, after) => { if (after.total < 0) ok = false; } });
    if (!ok) return 'INSUFFICIENT';
  }
  return null;
}

/**
 * Historia operacji pieniężnych z rozbiciem: saldo przed i po,
 * odsetki naliczone od poprzedniej operacji.
 */
export function history(events, now, opts = {}) {
  const rows = [];
  let lastInterest = 0;
  simulate(events, now, { ...opts, onEvent: (e, before, after) => {
    if (e.type === 'rate') {
      rows.push({ event: e, balanceBefore: before.total, balanceAfter: after.total, interestSincePrev: 0 });
      return;
    }
    rows.push({
      event: e,
      balanceBefore: before.total,
      balanceAfter: after.total,
      interestSincePrev: before.interest - lastInterest,
    });
    lastInterest = before.interest;
  } });
  return rows;
}

// ---------------------------------------------------------------------------
//  Prognozy
// ---------------------------------------------------------------------------

/**
 * Regularne wpłaty jako zdarzenia syntetyczne w przedziale (fromTs, toTs].
 * plan: { id?, amount (µg), every: 'week' | '2weeks' | 'month', startDay (numer dnia) }
 */
export function regularDepositEvents(plans, fromTs, toTs, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TZ;
  const out = [];
  for (const [pi, p] of (plans || []).entries()) {
    if (!(p.amount > 0)) continue;
    const startDate = new Date(p.startDay * 86400000);
    for (let k = 0; k < 10000; k++) {
      let day;
      if (p.every === 'month') {
        const y = startDate.getUTCFullYear();
        const m = startDate.getUTCMonth() + k;
        const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        day = Math.floor(Date.UTC(y, m, Math.min(startDate.getUTCDate(), last)) / 86400000);
      } else {
        day = p.startDay + k * (p.every === '2weeks' ? 14 : 7);
      }
      const ts = dayStart(day, tz) + 12 * 3600000; // w południe
      if (ts > toTs) break;
      if (ts > fromTs) out.push({ id: `plan:${p.id ?? pi}:${day}`, type: 'deposit', ts, amount: p.amount, synthetic: true });
    }
  }
  return out;
}

/** Saldo prognozowane na chwilę `toTs` (jeśli nic nie zostanie wypłacone). */
export function forecastAt(events, now, toTs, opts = {}) {
  const extra = regularDepositEvents(opts.plans, now, toTs, opts);
  return balanceAt([...events, ...extra], toTs, opts);
}

/**
 * Prognoza dzienna: saldo na koniec każdego dnia od dziś przez `days` dni.
 * Zwraca tablicę { day, total } (pierwszy element: koniec dzisiejszego dnia).
 */
export function dailyForecast(events, now, days, opts = {}) {
  const tz = opts.tz ?? DEFAULT_TZ;
  const today = dayOf(now, tz);
  const endTs = dayStart(today + days + 1, tz);
  const extra = regularDepositEvents(opts.plans, now, endTs, opts);
  const out = [];
  simulate([...events, ...extra], endTs, { ...opts, onDayEnd: (day, snap) => {
    if (day >= today) out.push({ day, total: snap.total });
  } });
  if (!out.length) {
    // brak zdarzeń – saldo zerowe przez cały okres
    for (let d = today; d <= today + days; d++) out.push({ day: d, total: 0 });
  }
  return out;
}

/** Pierwszy dzień prognozy, w którym saldo osiąga `target` (µg), albo null. */
export function reachDay(forecast, target) {
  for (const f of forecast) if (f.total >= target) return f.day;
  return null;
}

/**
 * Podgląd kosztu dla rodzica przy wpłacie `amount`:
 * ile odsetek dołoży przez rok, jeśli nic nie zostanie wypłacone.
 */
export function depositCostPreview(events, now, amount, opts = {}) {
  const yearTs = now + 365 * 86400000;
  const before = balanceAt(events, now, opts);
  const withDep = [...events, { id: '__preview__', type: 'deposit', ts: now, amount }];
  const fWith = forecastAt(withDep, now, yearTs, opts);
  const fWithout = forecastAt(events, now, yearTs, opts);
  return {
    yearInterestTotal: fWith - before - amount,      // wszystkie odsetki przez rok
    yearInterestFromDeposit: fWith - fWithout - amount, // część wynikająca z tej wpłaty
  };
}

// ---------------------------------------------------------------------------
//  Wyświetlanie
// ---------------------------------------------------------------------------

/** Rozbija kwotę na złote, grosze (2 cyfry) i mikrogrosze (4 cyfry). */
export function splitAmount(micro) {
  const negative = micro < 0;
  const a = Math.abs(Math.trunc(micro));
  const zlPart = Math.floor(a / MICRO_PER_ZL);
  const rest = a - zlPart * MICRO_PER_ZL;
  const gr = Math.floor(rest / MICRO_PER_GROSZ);
  const mic = rest - gr * MICRO_PER_GROSZ;
  return { negative, zl: zlPart, gr: String(gr).padStart(2, '0'), micro: String(mic).padStart(4, '0') };
}

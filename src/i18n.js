// Localisation: UI strings, plural rules, money, dates and durations.
// Polish is the primary language; add a new locale by adding a file in ./locales
// and registering it in LOCALES below.

import pl from './locales/pl.js';
import en from './locales/en.js';
import { splitMicro, MICRO_PER_ZL } from './money.js';

export const LOCALES = {
  pl: { dict: pl, intl: 'pl-PL', currency: 'PLN' },
  en: { dict: en, intl: 'en-GB', currency: 'PLN' },
};

let lang = 'pl';
let cfg = LOCALES.pl;
let plural = new Intl.PluralRules(cfg.intl);
const cache = new Map();

export function setLang(l) {
  lang = LOCALES[l] ? l : 'pl';
  cfg = LOCALES[lang];
  plural = new Intl.PluralRules(cfg.intl);
  cache.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
export const getLang = () => lang;
export const intlLocale = () => cfg.intl;

export function detectLang(search = '', stored = null) {
  const q = new URLSearchParams(search).get('lang');
  if (q && LOCALES[q]) return q;
  if (stored && LOCALES[stored]) return stored;
  return 'pl';
}

/** Translate a key. Values may be plural objects {one, few, many, other}; `n` selects the form. */
export function t(key, vars = {}) {
  let v = cfg.dict[key];
  if (v === undefined) v = LOCALES.pl.dict[key];
  if (v === undefined) return key;
  if (typeof v === 'object') {
    const form = plural.select(Number(vars.n ?? 0));
    v = v[form] ?? v.other ?? v.many ?? '';
  }
  return String(v).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

export const hasKey = (key) => cfg.dict[key] !== undefined;

function nf(opts) {
  const k = JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat(cfg.intl, opts); cache.set(k, f); }
  return f;
}
function df(opts) {
  const k = 'd' + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) { f = new Intl.DateTimeFormat(cfg.intl, opts); cache.set(k, f); }
  return f;
}

const currencyFmt = () => nf({ style: 'currency', currency: cfg.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "10,24 zł" – rounded down to whole grosze unless `exact` (then normal rounding). */
export function money(m, { sign = false } = {}) {
  const p = splitMicro(m);
  const v = p.zl + Number(p.gr) / 100;
  const s = currencyFmt().format(v);
  if (sign && m > 0) return '+' + s;
  if (m < 0 && v > 0) return '−' + s;
  return s;
}

/** Money with the four micro digits: returns { main, micro, tail, label }. */
export function moneyParts(m) {
  const p = splitMicro(m);
  const v = p.zl + Number(p.gr) / 100;
  const parts = currencyFmt().formatToParts(v);
  const fi = parts.findIndex((x) => x.type === 'fraction');
  const main = parts.slice(0, fi + 1).map((x) => x.value).join('');
  const tail = parts.slice(fi + 1).map((x) => x.value).join('');
  return { main: (p.neg ? '−' : '') + main, micro: p.micro, tail, label: moneyLabel(m) };
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const toSub = (digits) => String(digits).replace(/\d/g, (d) => SUB[d]);

/** Text form with subscript micro digits: "10,00₀₀₀₁ zł". */
export function moneyMicro(m) {
  const { main, micro, tail } = moneyParts(m);
  return main + toSub(micro) + tail;
}

/** Spoken form for screen readers. */
export function moneyLabel(m) {
  const p = splitMicro(m);
  return t('a11y.money', { zl: nf({}).format(p.zl), gr: Number(p.gr), micro: Number(p.micro) });
}

export const pct = (bp) => nf({ maximumFractionDigits: 1 }).format(bp / 100) + '%';
export const num = (n, d = 0) => nf({ maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
export const zlPlain = (m) => nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.floor(m / 10_000) / 100);
export const microToZlNumber = (m) => m / MICRO_PER_ZL;

export const fmtDate = (ms, tz, style = 'long') => df(
  style === 'long' ? { timeZone: tz, day: 'numeric', month: 'long' }
  : style === 'longYear' ? { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' }
  : style === 'short' ? { timeZone: tz, day: 'numeric', month: 'short' }
  : style === 'month' ? { timeZone: tz, month: 'short' }
  : style === 'monthYear' ? { timeZone: tz, month: 'short', year: 'numeric' }
  : style === 'dateTime' ? { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  : { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' },
).format(new Date(ms));

/** Human countdown: "7 s", "1 min 40 s", "3 h 5 min", "2 dni". */
export function duration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return t('dur.s', { n: s });
  const m = Math.floor(s / 60), rs = s % 60;
  if (m < 60) return rs ? t('dur.ms', { m, s: rs }) : t('dur.m', { n: m });
  const h = Math.floor(m / 60), rm = m % 60;
  if (h < 48) return rm ? t('dur.hm', { h, m: rm }) : t('dur.h', { n: h });
  const d = Math.floor(h / 24);
  return t('dur.d', { n: d });
}

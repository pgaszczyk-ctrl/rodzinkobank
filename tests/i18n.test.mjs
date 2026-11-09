import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import pl from '../src/locales/pl.js';
import en from '../src/locales/en.js';
import { setLang, t, moneyMicro, money, duration } from '../src/i18n.js';

const root = new URL('..', import.meta.url);
const sources = readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js'))
  .map((f) => readFileSync(new URL('src/' + f, root), 'utf8')).join('\n');
const html = readFileSync(new URL('index.html', root), 'utf8');
const NS = Object.keys(pl).map((k) => k.split('.')[0]).filter((v, i, a) => a.indexOf(v) === i);

// Prefixes completed at runtime, with every suffix the code can produce.
const DYNAMIC = {
  'dream.': ['easy', 'medium', 'awesome'],
  'goal.art.': ['bricks', 'scooter', 'console', 'bike', 'teddy', 'ball'],
  'kid.crew.': ['first', 'working', 'resting'],
  'kid.req.': ['approved', 'rejected'],
  'kid.tick.': ['first', 'empty', 'done', 'resting', 'mining'],
  'lang.': ['pl', 'en'],
  'pay.status.': ['approved', 'rejected', 'cancelled'],
  'pz.tab.': ['deposit', 'payouts', 'history', 'plan', 'goals', 'family'],
  'season.': ['winter', 'spring', 'summer', 'autumn'],
};
const ERROR_CODES = [...new Set([
  ...[...readFileSync(new URL('supabase/schema.sql', root), 'utf8').matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]),
  ...[...sources.matchAll(/AppError\('([a-z_]+)'/g)].map((m) => m[1]),
  'network', 'server', 'generic', 'insufficient',
])];

function usedKeys() {
  const keys = new Set();
  for (const m of sources.matchAll(/'([a-zA-Z]+\.[a-zA-Z0-9_.]+)'/g)) if (NS.includes(m[1].split('.')[0]) && !m[1].endsWith('.')) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) keys.add(m[1]);
  for (const [p, list] of Object.entries(DYNAMIC)) for (const s of list) keys.add(p + s);
  for (const c of ERROR_CODES) keys.add('err.' + c);
  return [...keys];
}

test('every key used in the code exists in Polish and English', () => {
  const missingPl = usedKeys().filter((k) => !(k in pl));
  const missingEn = usedKeys().filter((k) => !(k in en));
  assert.deepEqual(missingPl, []);
  assert.deepEqual(missingEn, []);
});

test('both dictionaries have the same keys', () => {
  assert.deepEqual(Object.keys(pl).filter((k) => !(k in en)), []);
  assert.deepEqual(Object.keys(en).filter((k) => !(k in pl)), []);
});

test('Polish plurals and formats', () => {
  setLang('pl');
  assert.equal(t('dur.d', { n: 1 }), '1 dzień');
  assert.equal(t('dur.d', { n: 3 }), '3 dni');
  assert.equal(moneyMicro(10_000_001).replace(/ /g, ' '), '10,00₀₀₀₁ zł');
  assert.equal(money(240_800, { sign: true }).replace(/ /g, ' '), '+0,24 zł');
  assert.equal(duration(7000), '7 s');
  assert.equal(t('brand.name'), 'Groszaki');
  setLang('en');
  assert.equal(t('brand.name'), 'Coinlings');
  assert.equal(t('dur.d', { n: 2 }), '2 days');
  setLang('pl');
});

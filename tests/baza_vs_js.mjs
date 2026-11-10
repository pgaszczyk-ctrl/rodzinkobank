// Porównuje saldo liczone w bazie (private.simulate) z src/groszaki/finanse.js.
// Uruchamia tools/test_bazy.sh (potrzebny lokalny Postgres z migracją).
import { execFileSync } from 'node:child_process';
import { balanceAt, zl } from '../src/groszaki/finanse.js';
import { dayOf, dayStart } from '../src/groszaki/czas.js';

const psqlArgs = (process.env.PSQL_ARGS || '').split(' ').filter(Boolean);
const sql = (q) => execFileSync('psql', [...psqlArgs, '-At', '-v', 'ON_ERROR_STOP=1', '-c', q], { encoding: 'utf8' }).trim();

let seed = 12345;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const KID = '20000000-0000-0000-0000-0000000000ff';
const FAM = '10000000-0000-0000-0000-000000000001';
sql(`insert into public.kids (id, family_id, name) values ('${KID}', '${FAM}', 'Porównanie') on conflict do nothing`);

const DAY = 86400000;
const now = Date.now();
let worst = 0;
for (let s = 0; s < 12; s++) {
  sql(`delete from public.kid_events where kid_id = '${KID}'`);
  const events = [];
  const start = now - Math.floor(30 + rnd() * 700) * DAY;
  let bal = 0;
  for (let i = 0; i < 6 + rnd() * 20; i++) {
    const ts = Math.floor(start + rnd() * (now - start));
    const r = rnd();
    let e;
    if (r < 0.65) e = { type: 'deposit', amount: Math.round(1 + rnd() * 900) * 10000 * (rnd() < 0.3 ? 100 : 1) };
    else if (r < 0.8) e = { type: 'withdrawal', amount: 10000 * Math.round(1 + rnd() * 50) };
    else if (r < 0.9) e = { type: 'adjustment', amount: 10000 * Math.round(rnd() * 400 - 100) || 10000 };
    else {
      const d = dayOf(ts) + 1;
      e = { type: 'rate', ts: dayStart(d), rates: { low: Math.round(rnd() * 80) / 1000, high: Math.round(rnd() * 50) / 1000, threshold: zl(Math.round(200 + rnd() * 1500)) } };
    }
    e.id = `00000000-0000-4000-8000-${String(s * 100 + i).padStart(12, '0')}`;
    e.ts ??= ts;
    if (e.type === 'withdrawal' || (e.type === 'adjustment' && e.amount < 0)) {
      // tylko jeśli stać – żeby dziennik był sensowny
      if (balanceAt([...events, e], now) < 0) continue;
    }
    events.push(e);
    const amount = e.amount ?? 'null';
    const rates = e.rates ? `${e.rates.low}, ${e.rates.high}, ${e.rates.threshold}` : 'null, null, null';
    sql(`insert into public.kid_events (id, kid_id, type, ts, amount, rate_low, rate_high, threshold)
         values ('${e.id}', '${KID}', '${e.type}', to_timestamp(${e.ts} / 1000.0), ${amount}, ${rates})`);
  }
  for (const at of [now, now - 3 * DAY + 12345, start + 40 * DAY]) {
    const js = balanceAt(events, at);
    const db = Number(sql(`select balance from private.simulate('${KID}', to_timestamp(${at} / 1000.0))`));
    const diff = Math.abs(js - db);
    worst = Math.max(worst, diff);
    if (diff > 10) {
      console.error(`Scenariusz ${s}: JS ${js} ≠ baza ${db} (różnica ${diff} µg)`);
      process.exit(1);
    }
  }
}
sql(`delete from public.kid_events where kid_id = '${KID}'; delete from public.kids where id = '${KID}'`);
console.log(`OK: saldo w bazie zgodne z JS w 36 punktach (największa różnica ${worst} µg)`);

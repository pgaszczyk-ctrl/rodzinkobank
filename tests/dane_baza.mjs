// Sprawdza src/groszaki/dane.js z prawdziwą bazą: atrapa klienta Supabase
// wywołuje te same funkcje gr_* przez psql (lokalny Postgres po migracji).
// Uruchamia tools/test_bazy.sh.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { Store } from '../src/groszaki/dane.js';
import { balanceAt } from '../src/groszaki/finanse.js';
import { dayOf } from '../src/groszaki/czas.js';

const psqlArgs = (process.env.PSQL_ARGS || '').split(' ').filter(Boolean);
const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
function fakeSb(role, sub) {
  return {
    async rpc(fn, args) {
      const call = `select public.${fn}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(', ')})`;
      const pre = `set role ${role};` + (sub ? ` set request.jwt.claim.sub = '${sub}';` : '');
      try {
        const out = execFileSync('psql', [...psqlArgs, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', pre, '-c', call], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        return { data: out === '' ? null : (out.startsWith('{') || out.startsWith('[') ? JSON.parse(out) : out), error: null };
      } catch (e) {
        return { data: null, error: { message: String(e.stderr).replace(/^.*ERROR:\s*/s, '').split('\n')[0] } };
      }
    },
  };
}

const PARENT = '00000000-0000-0000-0000-00000000000a';
const KID = '20000000-0000-0000-0000-000000000002';
const TOKEN = '30000000-0000-0000-0000-000000000002';

const parent = new Store({ mode: 'parent', sb: fakeSb('authenticated', PARENT), kidId: KID });
await parent.load();
const start = balanceAt(parent.state.events, Date.now());

await parent.addMoney('deposit', Date.now(), 25_000_000, 'test');
const afterDep = balanceAt(parent.state.events, Date.now());
assert.ok(afterDep - start >= 25_000_000, 'wpłata nie dotarła');

await assert.rejects(parent.addMoney('withdrawal', Date.now(), 999_000_000), /Za mało/);
await parent.addMoney('withdrawal', Date.now(), 5_000_000, 'lody');
await parent.setRates(dayOf(Date.now()) + 2, 0.045, 0.025, 800_000_000);
assert.ok(parent.state.events.some((e) => e.type === 'rate' && e.rates.low === 0.045));
await parent.savePlan({ amount: 10_000_000, every: 'month', startDay: dayOf(Date.now()) + 1 });
await parent.saveCalendar({ nazwa: 'Kolonie', day: dayOf(Date.now()) + 100, ikona: '⛺' });
await parent.setFerie({ start: dayOf(Date.now()) + 90, end: dayOf(Date.now()) + 103 });
await parent.saveGoal({ nazwa: 'Słuchawki', kwota: 120_000_000, ikona: '🎧' });
const st = parent.state;
assert.ok(st.plans.some((p) => p.every === 'month' && p.amount === 10_000_000));
assert.ok(st.calendar.some((c) => c.nazwa === 'Kolonie'));
assert.equal(st.kid.ferie.end - st.kid.ferie.start, 13);
assert.ok(st.kid.viewToken);

// saldo liczone w przeglądarce = saldo, które sprawdza baza (wypłata całości przechodzi)
const max = Math.floor(balanceAt(st.events, Date.now()) / 10000) * 10000;
const probe = new Store({ mode: 'parent', sb: fakeSb('authenticated', PARENT), kidId: KID });
await probe.load();
const rateId = st.events.find((e) => e.type === 'rate').id;
await parent.deleteEvent(rateId);
assert.ok(!parent.state.events.some((e) => e.id === rateId), 'nie cofnięto zmiany stawek');

// dziecko: widzi to samo saldo, edytuje cele, nie ma dostępu do pieniędzy
const kid = new Store({ mode: 'kid', sb: fakeSb('anon'), token: TOKEN });
await kid.load();
assert.equal(kid.state.events.length, parent.state.events.length);
assert.equal(kid.state.kid.viewToken, null);
await kid.saveGoal({ nazwa: 'Książka', kwota: 30_000_000, ikona: '📚' });
assert.ok(kid.state.goals.some((g) => g.nazwa === 'Książka'));
const fake = kid.sb;
const r = await fake.rpc('gr_add_money', { p_kid: KID, p_id: '99999999-0000-0000-0000-000000000001', p_type: 'deposit', p_ts: new Date().toISOString(), p_amount: 10000, p_note: null });
assert.ok(r.error && /permission denied/.test(r.error.message), 'dziecko nie może wpłacać');

// wersja zmienia się po zapisie z innego urządzenia
assert.equal(await kid.changed(), false);
await parent.addMoney('deposit', Date.now(), 1_000_000);
assert.equal(await kid.changed(), true);
console.log(`OK: warstwa danych współpracuje z bazą (saldo do wypłaty ${max / 1e6} zł)`);

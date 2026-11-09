// Strefa rodzica: PIN, deposits with gift split and bonus, payouts, history,
// reward plan, goals and family settings.

import { derive, previewDeposit, upcomingChests, allocateWithdrawal, validatePlan, chestSkin, DEFAULT_PLAN, PLAN_MONTHS, MAX_CAP_BP, maxMineShareBp } from './engine.js';
import { dayKey } from './calendar.js';
import { parseZl, MICRO_PER_GROSZ, floorToGrosz } from './money.js';
import { t, money, moneyMicro, fmtDate, pct, num, duration, getLang } from './i18n.js';
import { chestIcon, DREAM_ART, DREAM_ART_KEYS, dreamImage } from './art.js';
import { newId } from './backend.js';

const DAY = 86400_000;
const TABS = ['deposit', 'payouts', 'history', 'plan', 'goals', 'family'];

export function initParentZone(ctx, { cloudReady, openAuth, logout }) {
  const { $, esc } = ctx;
  const dlg = $('parentDialog');
  let tab = 'deposit';
  let focusSlot = null;
  let depIds = { op: newId(), bonus: newId() };
  let miscIds = { spend: newId(), corr: newId(), approve: newId() };
  let pinBuffer = '';

  const token = () => {
    const b = ctx.backend;
    if (!b) return null;
    if (b.kind === 'local') return b.session && b.session.exp > Date.now() ? b.session.token : null;
    return b.session ? b.session.token : null;
  };
  const hasPin = () => (ctx.backend.kind === 'local' ? ctx.backend.family().has_pin : !!(ctx.family && ctx.family.has_pin));
  const fmtIn = (m) => (m / 1e6).toFixed(2).replace('.', getLang() === 'pl' ? ',' : '.');
  const st = () => ctx.stateAt(ctx.nowMs());
  const onErr = async (e) => {
    if (e && e.code === 'pin_required') { if (ctx.backend.keepSession) ctx.backend.keepSession(null); if (ctx.backend.kind === 'local') ctx.backend.session = null; render(); }
  };
  const act = (fn) => ctx.run(async () => { try { return await fn(); } catch (e) { await onErr(e); throw e; } });

  function open(which, opts = {}) {
    if (which) tab = which;
    focusSlot = opts.slot ?? null;
    if (!dlg.open) dlg.showModal();
    render();
  }
  $('pzClose').addEventListener('click', () => dlg.close());
  $('pzLock').addEventListener('click', async () => { await ctx.backend.endSession(token()); render(); });

  function render() {
    if (!dlg.open) return;
    const unlocked = ctx.mode !== 'kid' && !!token();
    $('pzGate').hidden = unlocked;
    $('pzMain').hidden = !unlocked;
    $('pzLock').hidden = !unlocked;
    $('pzSub').textContent = unlocked && ctx.snap ? t('pz.sub', { name: ctx.snap.kid.name }) : t('pz.subLocked');
    if (!unlocked) { renderGate(); return; }
    renderKids();
    renderTabs();
    renderTab();
  }

  /* ---------------- PIN gate ---------------- */
  function renderGate() {
    const g = $('pzGate');
    if (ctx.mode === 'kid') {
      g.innerHTML = `<div class="rounded-2xl bg-sun-50 p-4"><p class="font-bold">${esc(t('pz.kidDevice'))}</p>
        <button id="gLogin" class="btn bg-grape-500 hover:bg-grape-600 text-white mt-3">${esc(t('auth.login'))}</button></div>`;
      $('gLogin').addEventListener('click', () => { dlg.close(); openAuth('login'); });
      return;
    }
    const setting = !hasPin();
    pinBuffer = '';
    g.innerHTML = `<form id="pinForm" class="rounded-2xl bg-sun-50 p-4 grid gap-3 max-w-sm">
      <p class="font-bold">${esc(t(setting ? 'pin.setTitle' : 'pin.enterTitle'))}</p>
      <p class="text-sm font-semibold text-ink/60">${esc(t(setting ? 'pin.setHint' : 'pin.enterHint'))}</p>
      <input id="pin1" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="${setting ? 'new-password' : 'current-password'}" maxlength="8" class="field text-2xl tracking-[.5em] text-center" aria-label="${esc(t('pin.label'))}" />
      ${setting ? `<input id="pin2" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="8" class="field text-2xl tracking-[.5em] text-center" aria-label="${esc(t('pin.repeat'))}" placeholder="${esc(t('pin.repeat'))}" />` : ''}
      <p id="pinErr" class="text-sm font-bold text-berry-600" hidden></p>
      <button class="btn bg-sun-400 hover:bg-sun-500 justify-self-start">${esc(t(setting ? 'pin.set' : 'pin.enter'))}</button>
    </form>`;
    setTimeout(() => $('pin1') && $('pin1').focus(), 50);
    $('pinForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = $('pin1').value.trim();
      const err = (m) => { $('pinErr').hidden = false; $('pinErr').textContent = m; };
      if (!/^[0-9]{4,8}$/.test(p1)) { err(t('err.pin_format')); return; }
      try {
        if (setting) {
          if ($('pin2').value.trim() !== p1) { err(t('pin.mismatch')); return; }
          await ctx.backend.setPin(p1, null);
          if (ctx.family) ctx.family.has_pin = true;
          ctx.toast(t('pin.saved'));
        } else {
          const r = await ctx.backend.verifyPin(p1);
          if (!r.ok) { err(r.locked_until ? t('pin.locked', { time: duration(r.locked_until - Date.now()) }) : t('pin.wrong')); $('pin1').value = ''; return; }
        }
        render();
      } catch (ex) { err(ctx.errMsg(ex)); }
    });
  }

  /* ---------------- kid picker + tabs ---------------- */
  function renderKids() {
    const kids = ctx.family ? ctx.family.kids : [];
    $('pzKids').innerHTML = kids.length ? `<span class="text-sm font-bold text-ink/50 self-center mr-1">${esc(t('pz.kid'))}</span>` + kids.map((k) =>
      `<button data-k="${esc(k.id)}" class="px-3 py-1.5 rounded-xl font-display font-extrabold text-sm ${k.id === ctx.kidId ? 'bg-sun-400 text-ink shadow-brickSm' : 'bg-sun-50 text-ink/60 hover:bg-sun-100'}">${esc(k.name)}</button>`).join('') : '';
    $('pzKids').querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => { await ctx.switchKid(b.dataset.k); render(); }));
  }
  function renderTabs() {
    const pending = ctx.requests.some((r) => r.status === 'pending');
    $('pzTabs').innerHTML = TABS.map((k) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}" class="shrink-0 px-3 py-2 -mb-0.5 font-display font-extrabold text-sm sm:text-base border-b-4 ${k === tab ? 'border-berry-400 text-ink' : 'border-transparent text-ink/50 hover:text-ink'}">${esc(t('pz.tab.' + k))}${k === 'payouts' && pending ? ' <span class="inline-block w-2.5 h-2.5 rounded-full bg-berry-500 align-middle"></span>' : ''}</button>`).join('');
    $('pzTabs').querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  }
  function renderTab() {
    const body = $('pzBody');
    ({ deposit: tabDeposit, payouts: tabPayouts, history: tabHistory, plan: tabPlan, goals: tabGoals, family: tabFamily })[tab](body);
  }

  /* ---------------- helpers ---------------- */
  const card = (inner, cls = 'bg-sky-50') => `<div class="rounded-3xl ${cls} p-4 sm:p-5">${inner}</div>`;
  const h = (txt) => `<h4 class="font-display font-extrabold text-lg">${esc(txt)}</h4>`;
  const planText = (plan) => plan.th.map((v) => pct(v)).join(' · ');

  function chestTable(rows) {
    return `<div class="overflow-x-auto"><table class="w-full text-sm num"><thead class="text-xs uppercase text-ink/50"><tr>
      <th class="text-left py-1">${esc(t('pv.chest'))}</th><th class="text-left py-1">${esc(t('pv.date'))}</th><th class="text-right py-1">${esc(t('pv.amount'))}</th></tr></thead>
      <tbody class="font-bold">${rows.join('')}</tbody></table></div>`;
  }

  function previewHtml(p, base, amount) {
    const rows = p.chests.map((c, i) => {
      const old = base ? base.chests[i].amount : c.amount;
      const changed = base && old !== c.amount;
      const val = c.amount > 0 ? money(c.amount, { sign: true }) : t('pv.skipped');
      return `<tr class="border-t border-white"><td class="py-1.5"><span class="inline-flex items-center gap-1.5">${chestIcon(c.skin, 'w-6 h-5')}${esc(t('pv.stage', { k: c.k }))}</span></td>
        <td>${esc(fmtDate(c.at, ctx.tz, 'longYear'))}</td>
        <td class="text-right">${changed ? `<s class="text-ink/40 mr-1">${esc(money(old, { sign: true }))}</s>` : ''}<span class="${c.amount > 0 ? 'text-mint-700' : 'text-ink/40'}">${esc(val)}</span>${changed && c.amount === 0 ? ` <span class="text-xs text-berry-600">${esc(t('pv.vanishes'))}</span>` : ''}</td></tr>`;
    });
    return `${chestTable(rows)}
      <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm font-bold num">
        <dt class="text-ink/60">${esc(t('pv.mine'))}</dt><dd class="text-right">${esc(money(p.mined, { sign: true }))}</dd>
        <dt class="text-ink/60">${esc(t('pv.chests'))}</dt><dd class="text-right">${esc(money(p.chestTotal, { sign: true }))}</dd>
        <dt class="text-ink/60">${esc(t('pv.bonus'))}</dt><dd class="text-right">${esc(money(p.bonus, { sign: true }))}</dd>
        <dt class="text-ink">${esc(t('pv.total'))}</dt><dd class="text-right text-ink">${esc(money(p.total))} <span class="text-ink/50">(${esc(pct(amount ? Math.round((p.total * 10000) / amount) : 0))})</span></dd>
        <dt class="text-ink/60">${esc(t('pv.after'))}</dt><dd class="text-right">${esc(money(amount + p.total))}</dd>
      </dl>`;
  }

  /* ---------------- Deposit / gift ---------------- */
  function tabDeposit(body) {
    const bonusPct = ctx.settings.bonusPct ?? 20;
    body.innerHTML = `<form id="depForm" class="grid gap-4 lg:grid-cols-2">
      <div class="grid gap-4 content-start">
        ${card(`${h(t('dep.title'))}
          <label class="block mt-2"><span class="text-sm font-bold text-ink/70">${esc(t('dep.gift'))}</span>
            <input id="dGift" inputmode="decimal" autocomplete="off" class="field mt-1 text-xl font-display" value="10,00" /></label>
          <div class="mt-4"><div class="flex justify-between text-sm font-bold text-ink/70"><span>${esc(t('dep.split'))}</span><span id="dSplitPct"></span></div>
            <input id="dSplit" type="range" min="0" max="1000" value="1000" step="1" class="w-full mt-2" aria-label="${esc(t('dep.split'))}" />
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div class="rounded-2xl bg-white p-3"><p class="text-xs font-extrabold uppercase text-sky-700">${esc(t('kid.nowTitle'))}</p><p id="dNow" class="font-display font-extrabold text-xl num"></p></div>
              <div class="rounded-2xl bg-white p-3"><p class="text-xs font-extrabold uppercase text-berry-600">${esc(t('dep.vault'))}</p><p id="dVault" class="font-display font-extrabold text-xl num"></p></div>
            </div>
            <p id="dSum" class="text-xs font-bold text-ink/50 mt-1"></p>
          </div>`)}
        ${card(`<label class="flex items-start gap-3"><input id="dBonusOn" type="checkbox" class="mt-1 w-5 h-5 accent-pink-500" />
            <span><span class="font-display font-extrabold">${esc(t('dep.bonus'))}</span><span id="dBonusHint" class="block text-sm font-semibold text-ink/60"></span></span></label>
          <div class="mt-3 flex items-center gap-2"><input id="dBonusPct" type="number" min="0" max="50" step="1" value="${bonusPct}" class="field w-24" aria-label="${esc(t('dep.bonusPct'))}" /><span class="font-bold">%</span>
            <span id="dBonusAmt" class="font-display font-extrabold text-lg text-mint-700 num"></span></div>
          <p id="dBonusErr" class="text-sm font-bold text-berry-600 mt-2" hidden></p>`, 'bg-mint-50')}
        <label class="block"><span class="text-sm font-bold text-ink/70">${esc(t('dep.note'))}</span><input id="dNote" maxlength="120" class="field mt-1" /></label>
        <button id="dSave" class="btn bg-berry-500 hover:bg-berry-600 text-white justify-self-start text-lg px-6">${esc(t('dep.save'))}</button>
      </div>
      ${card(`${h(t('dep.preview'))}<p class="text-xs font-bold text-ink/50 mb-2">${esc(t('dep.planInfo', { v: ctx.plan.v, plan: planText(ctx.plan) }))}</p><div id="dPreview"></div>`, 'bg-sun-50')}
    </form>`;

    const upd = () => {
      const gift = parseZl($('dGift').value);
      const okGift = gift > 0;
      const giftGr = okGift ? gift / MICRO_PER_GROSZ : 0;
      const share = Number($('dSplit').value) / 1000;
      const vault = Math.round(giftGr * share) * MICRO_PER_GROSZ;
      const now = okGift ? gift - vault : 0;
      $('dSplitPct').textContent = t('dep.splitPct', { n: Math.round(share * 100) });
      $('dNow').textContent = money(now);
      $('dVault').textContent = money(vault);
      $('dSum').textContent = okGift ? t('dep.sum', { now: money(now), vault: money(vault), gift: money(gift) }) : t('err.amount_invalid');
      const whole = okGift && vault === gift;
      $('dBonusOn').disabled = !whole;
      if (!whole) $('dBonusOn').checked = false;
      $('dBonusHint').textContent = whole ? t('dep.bonusHint') : t('dep.bonusOnlyWhole');
      const start = ctx.nowMs();
      const base = vault > 0 ? previewDeposit({ amount: vault, plan: ctx.plan, start, tz: ctx.tz }) : null;
      let bonus = 0, err = '';
      if ($('dBonusOn').checked && base) {
        const bp = Math.max(0, Math.min(50, Number($('dBonusPct').value) || 0));
        bonus = Math.round((vault * bp) / 100 / MICRO_PER_GROSZ) * MICRO_PER_GROSZ;
        if (bonus > base.maxBonus) err = t('dep.bonusMax', { max: money(base.maxBonus), pct: pct(Math.floor((base.maxBonus * 10000) / vault)) });
      }
      $('dBonusAmt').textContent = $('dBonusOn').checked ? money(bonus, { sign: true }) : '';
      $('dBonusErr').hidden = !err;
      $('dBonusErr').innerHTML = err ? `${esc(err)} <button type="button" id="dUseMax" class="underline">${esc(t('dep.useMax'))}</button>` : '';
      if (err) $('dUseMax').addEventListener('click', () => { $('dBonusPct').value = Math.floor((base.maxBonus * 100) / vault); upd(); });
      $('dSave').disabled = !okGift || !!err;
      if (!base) { $('dPreview').innerHTML = `<p class="text-sm font-bold text-ink/60">${esc(t('dep.noVault'))}</p>`; return { gift, vault, now, bonus: 0 }; }
      const withBonus = bonus > 0 && !err ? previewDeposit({ amount: vault, plan: ctx.plan, bonus, start, tz: ctx.tz }) : null;
      $('dPreview').innerHTML = previewHtml(withBonus || base, withBonus ? base : null, vault);
      return { gift, vault, now, bonus: err ? 0 : bonus };
    };
    ['dGift', 'dSplit', 'dBonusPct'].forEach((id) => $(id).addEventListener('input', upd));
    $('dBonusOn').addEventListener('change', upd);
    upd();
    $('depForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = upd();
      if (!(v.gift > 0)) return;
      act(async () => {
        const snap = await ctx.backend.addDeposit(token(), ctx.kidId, {
          opId: depIds.op, gift: v.gift, vault: v.vault, now: v.now, planV: v.vault > 0 ? ctx.plan.v : null,
          bonusId: v.bonus > 0 ? depIds.bonus : null, bonus: v.bonus, note: $('dNote').value.trim() || null,
        });
        depIds = { op: newId(), bonus: newId() };
        ctx.setSnapshot(snap);
        ctx.toast(t('toast.deposited', { amount: money(v.gift) }));
      });
    });
  }

  /* ---------------- Payouts ---------------- */
  function allocText(alloc) {
    const fromPrincipal = Object.values(alloc.principal || {}).reduce((s, x) => s + x, 0);
    return t('pay.alloc', { bonus: money(alloc.free), capital: money(fromPrincipal) });
  }
  function tabPayouts(body) {
    const now = ctx.nowMs();
    const s = st();
    const pend = ctx.requests.find((r) => r.status === 'pending');
    let reqHtml;
    if (pend) {
      const readyAt = pend.created_at + DAY;
      const ready = now >= readyAt;
      const alloc = allocateWithdrawal(s, pend.amount);
      const before = upcomingChests(ctx.ops, { from: now, tz: ctx.tz, limit: 1 })[0];
      let impact = '';
      if (alloc) {
        const after = upcomingChests(ctx.ops.concat([{ id: 'pv', kind: 'withdrawal', ts: now, vault: -pend.amount, alloc, seq: 1e12 }]), { from: now, tz: ctx.tz, limit: 3 })
          .find((c) => before && dayKey(c.at, ctx.tz) === dayKey(before.at, ctx.tz));
        impact = `<p class="text-sm font-bold text-ink/70 mt-1">${esc(allocText(alloc))}</p>` +
          (before ? `<p class="text-sm font-bold text-ink/70">${esc(after ? t('pay.chestImpact', { date: fmtDate(before.at, ctx.tz, 'long'), from: money(before.amount), to: money(after.amount) }) : t('wd.chestGone', { date: fmtDate(before.at, ctx.tz, 'long'), amount: money(before.amount) }))}</p>` : '');
      } else impact = `<p class="text-sm font-bold text-berry-600 mt-1">${esc(t('pay.insufficient', { amount: money(s.available) }))}</p>`;
      reqHtml = card(`${h(t('pay.request', { amount: money(pend.amount) }))}
        <p class="text-sm font-semibold text-ink/60">${esc(t('pay.requested', { date: fmtDate(pend.created_at, ctx.tz, 'dateTime') }))}</p>${impact}
        <p class="text-sm font-bold mt-1 ${ready ? 'text-mint-700' : 'text-sun-700'}">${esc(ready ? t('pay.ready') : t('pay.waitUntil', { date: fmtDate(readyAt, ctx.tz, 'dateTime'), time: duration(readyAt - now) }))}</p>
        <div class="mt-3 flex flex-wrap gap-2"><button id="pApprove" class="btn bg-mint-500 hover:bg-mint-600 text-white" ${ready && alloc ? '' : 'disabled'}>${esc(t('pay.approve'))}</button>
          <button id="pReject" class="btn bg-white text-berry-600 hover:bg-berry-50">${esc(t('pay.reject'))}</button></div>`, 'bg-grape-50');
    } else reqHtml = card(`${h(t('pay.noRequest'))}<p class="text-sm font-semibold text-ink/60">${esc(t('pay.noRequestHint'))}</p>`, 'bg-grape-50');

    const recent = ctx.requests.filter((r) => r.status !== 'pending').slice(0, 5);
    body.innerHTML = `<div class="grid gap-4 lg:grid-cols-2">
      <div class="grid gap-4 content-start">${reqHtml}
        ${recent.length ? card(`${h(t('pay.recent'))}<ul class="mt-2 text-sm font-bold grid gap-1">${recent.map((r) => `<li class="flex justify-between gap-2"><span>${esc(fmtDate(r.created_at, ctx.tz, 'dateTime'))}</span><span>${esc(money(r.amount))} · ${esc(t('pay.status.' + r.status))}</span></li>`).join('')}</ul>`, 'bg-white ring-2 ring-sky-100') : ''}
      </div>
      <div class="grid gap-4 content-start">
        ${card(`${h(t('pay.nowTitle'))}<p class="text-sm font-semibold text-ink/60">${esc(t('pay.nowHint', { amount: money(s.now) }))}</p>
          <form id="spendForm" class="mt-3 flex flex-wrap gap-2 items-end"><label class="block"><span class="text-xs font-bold text-ink/60">${esc(t('pay.amount'))}</span><input id="spAmt" inputmode="decimal" class="field mt-1 w-32" /></label>
            <label class="block flex-1 min-w-[8rem]"><span class="text-xs font-bold text-ink/60">${esc(t('dep.note'))}</span><input id="spNote" maxlength="120" class="field mt-1" /></label>
            <button class="btn bg-sky-500 hover:bg-sky-600 text-white">${esc(t('pay.spend'))}</button></form>`)}
        ${card(`${h(t('corr.title'))}<p class="text-sm font-semibold text-ink/60">${esc(t('corr.hint'))}</p>
          <form id="corrForm" class="mt-3 grid gap-2">
            <div class="flex flex-wrap gap-2"><select id="cTarget" class="field w-auto"><option value="vault">${esc(t('dep.vault'))}</option><option value="now">${esc(t('kid.nowTitle'))}</option></select>
              <select id="cSign" class="field w-auto"><option value="1">+</option><option value="-1">−</option></select>
              <input id="cAmt" inputmode="decimal" class="field w-32" aria-label="${esc(t('pay.amount'))}" /></div>
            <input id="cNote" maxlength="120" class="field" placeholder="${esc(t('corr.note'))}" />
            <p id="cPreview" class="text-sm font-bold text-ink/60"></p>
            <button class="btn bg-sun-400 hover:bg-sun-500 justify-self-start">${esc(t('corr.save'))}</button></form>`, 'bg-sun-50')}
      </div></div>`;

    if (pend) {
      $('pApprove').addEventListener('click', () => act(async () => {
        await ctx.reload();             // check the balance again on fresh data
        const fresh = st();
        const alloc = allocateWithdrawal(fresh, pend.amount);
        if (!alloc) throw Object.assign(new Error('insufficient'), { code: 'insufficient' });
        if (!confirm(t('pay.confirm', { amount: money(pend.amount), alloc: allocText(alloc) }))) return;
        const snap = await ctx.backend.approveWithdrawal(token(), ctx.kidId, { requestId: pend.id, opId: miscIds.approve, expectedRev: ctx.rev, alloc });
        miscIds.approve = newId();
        ctx.setSnapshot(snap);
        ctx.toast(t('toast.approved', { amount: money(pend.amount) }));
      }));
      $('pReject').addEventListener('click', () => act(async () => {
        if (!confirm(t('pay.rejectConfirm'))) return;
        ctx.setSnapshot(await ctx.backend.rejectWithdrawal(token(), ctx.kidId, { requestId: pend.id }));
      }));
    }
    $('spendForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseZl($('spAmt').value);
      if (!(amount > 0)) { ctx.toast(t('err.amount_invalid'), 'error'); return; }
      act(async () => {
        const snap = await ctx.backend.spendNow(token(), ctx.kidId, { opId: miscIds.spend, expectedRev: ctx.rev, amount, note: $('spNote').value.trim() || null });
        miscIds.spend = newId();
        ctx.setSnapshot(snap); ctx.toast(t('toast.spent', { amount: money(amount) }));
      });
    });
    const corrVals = () => {
      const amount = parseZl($('cAmt').value);
      const sign = Number($('cSign').value);
      const target = $('cTarget').value;
      let alloc = null, msg = '';
      if (amount > 0 && target === 'vault' && sign < 0) {
        alloc = allocateWithdrawal(st(), amount);
        msg = alloc ? allocText(alloc) : t('pay.insufficient', { amount: money(st().available) });
      }
      $('cPreview').textContent = msg;
      return { amount, sign, target, alloc };
    };
    ['cAmt', 'cSign', 'cTarget'].forEach((id) => $(id).addEventListener('input', corrVals));
    $('corrForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = corrVals();
      if (!(v.amount > 0) || (v.target === 'vault' && v.sign < 0 && !v.alloc)) { ctx.toast(t('err.amount_invalid'), 'error'); return; }
      act(async () => {
        const snap = await ctx.backend.addCorrection(token(), ctx.kidId, {
          opId: miscIds.corr, expectedRev: ctx.rev,
          vault: v.target === 'vault' ? v.sign * v.amount : 0, now: v.target === 'now' ? v.sign * v.amount : 0,
          alloc: v.alloc, note: $('cNote').value.trim() || null,
        });
        miscIds.corr = newId();
        ctx.setSnapshot(snap); ctx.toast(t('toast.corrected'));
      });
    });
  }

  /* ---------------- History + budget ---------------- */
  function tabHistory(body) {
    const now = ctx.nowMs();
    const cur = st();
    const lastEnd = Math.max(now, ...cur.deposits.map((d) => d.end));
    const fin = ctx.stateAt(lastEnd + 1000);
    const depOps = new Map(ctx.ops.filter((o) => o.kind === 'deposit').map((o) => [o.id, o]));
    const label = (id) => { const o = depOps.get(id); return o ? fmtDate(o.ts, ctx.tz, 'short') : '?'; };

    const budgetRows = cur.deposits.slice().reverse().map((d) => {
      const f = fin.deposits.find((x) => x.id === d.id) || d;
      return `<tr class="border-t border-sky-100 align-top">
        <td class="py-2 pr-2">${esc(fmtDate(d.ts, ctx.tz, 'short'))}<span class="block text-xs text-ink/50">v${esc(d.plan.v ?? 1)} · ${esc(t(d.finished ? 'hist.finished' : d.active ? 'hist.active' : 'hist.paused'))}</span></td>
        <td class="text-right pr-2">${esc(money(d.P))}${d.P !== d.P0 ? `<span class="block text-xs text-ink/50">${esc(t('hist.of', { amount: money(d.P0) }))}</span>` : ''}</td>
        <td class="text-right pr-2">${esc(money(f.cap))}</td>
        <td class="text-right pr-2">${esc(moneyMicro(d.mined))}<span class="block text-xs text-ink/50">${esc(t('hist.forecast', { amount: money(f.mined) }))}</span></td>
        <td class="text-right pr-2">${esc(money(d.chestSum))}<span class="block text-xs text-ink/50">${esc(t('hist.forecast', { amount: money(f.chestSum) }))}</span></td>
        <td class="text-right">${esc(money(d.bonus))}</td></tr>`;
    }).join('');

    // timeline: stored operations + derived chests (grouped by day, with per-deposit breakdown)
    const items = [];
    const lastOp = ctx.ops.filter((o) => o.kind !== 'bonus').slice(-1)[0];
    for (const o of ctx.ops) {
      if (o.kind === 'deposit') {
        const voidable = lastOp && lastOp.id === o.id && now - o.ts < DAY;
        items.push({ at: o.ts, html: `<b>${esc(t('hist.deposit', { amount: money(o.gift ?? (o.vault + o.now)) }))}</b>
          <span class="text-ink/60">${o.now > 0 ? esc(t('hist.split', { vault: money(o.vault), now: money(o.now) })) : ''}${o.vault > 0 ? ' · ' + esc(t('hist.plan', { v: (o.plan && o.plan.v) || 1 })) : ''}${o.note ? ' · ' + esc(o.note) : ''}</span>
          ${voidable ? `<button data-void="${esc(o.id)}" class="ml-2 text-xs underline text-berry-600">${esc(t('hist.void'))}</button>` : ''}` });
      } else if (o.kind === 'bonus') {
        const ev = cur.events.find((e) => e.type === 'bonus' && e.depositId === o.ref && e.at === o.ts);
        const applied = ev ? ev.amount : o.vault;
        items.push({ at: o.ts + 1, html: `<b class="text-mint-700">${esc(t('hist.bonus', { amount: money(applied) }))}</b> <span class="text-ink/60">${esc(t('hist.forDeposit', { date: label(o.ref) }))}${applied < o.vault ? ' · ' + esc(t('hist.bonusClamped', { amount: money(o.vault) })) : ''}</span>` });
      } else if (o.kind === 'withdrawal') {
        items.push({ at: o.ts, html: `<b class="text-berry-600">${esc(t('hist.withdrawal', { amount: money(-o.vault) }))}</b> <span class="text-ink/60">${esc(allocText(o.alloc || { free: 0, principal: {} }))}</span>` });
      } else if (o.kind === 'correction') {
        items.push({ at: o.ts, html: `<b>${esc(t('hist.correction'))}</b> <span class="text-ink/60">${o.vault ? esc(t('dep.vault')) + ' ' + esc(money(o.vault, { sign: true })) : ''} ${o.now ? esc(t('kid.nowTitle')) + ' ' + esc(money(o.now, { sign: true })) : ''}${o.note ? ' · ' + esc(o.note) : ''}</span>` });
      } else if (o.kind === 'now_out') {
        items.push({ at: o.ts, html: `<b>${esc(t('hist.spent', { amount: money(o.now) }))}</b>${o.note ? ` <span class="text-ink/60">· ${esc(o.note)}</span>` : ''}` });
      }
    }
    const byDay = new Map();
    for (const e of cur.events.filter((x) => x.type === 'chest')) {
      const k = dayKey(e.at, ctx.tz);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(e);
    }
    for (const list of byDay.values()) {
      const total = list.reduce((s, e) => s + e.amount, 0);
      const stage = Math.max(...list.map((e) => e.stage));
      items.push({ at: list[0].at, html: `<span class="inline-flex items-center gap-1.5">${chestIcon(chestSkin(stage), 'w-6 h-5')}<b class="text-sun-700">${esc(t('hist.chest', { amount: money(total) }))}</b></span>
        <ul class="text-xs text-ink/60 ml-7">${list.map((e) => `<li>${esc(t('hist.chestPart', { date: label(e.depositId), k: e.k, amount: money(e.amount) }))}</li>`).join('')}</ul>` });
    }
    items.sort((a, b) => b.at - a.at);
    const minedTotal = cur.deposits.reduce((s, d) => s + d.mined, 0);

    body.innerHTML = `<div class="grid gap-4">
      ${card(`${h(t('hist.summary'))}<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-sm font-bold num">
        <div class="bg-white rounded-2xl p-3"><p class="text-xs text-ink/50 uppercase">${esc(t('dep.vault'))}</p><p class="font-display text-lg">${esc(moneyMicro(cur.vault))}</p></div>
        <div class="bg-white rounded-2xl p-3"><p class="text-xs text-ink/50 uppercase">${esc(t('hist.capital'))}</p><p class="font-display text-lg">${esc(money(cur.principal))}</p></div>
        <div class="bg-white rounded-2xl p-3"><p class="text-xs text-ink/50 uppercase">${esc(t('hist.mined'))}</p><p class="font-display text-lg">${esc(moneyMicro(minedTotal))}</p></div>
        <div class="bg-white rounded-2xl p-3"><p class="text-xs text-ink/50 uppercase">${esc(t('kid.nowTitle'))}</p><p class="font-display text-lg">${esc(money(cur.now))}</p></div></div>
        <p class="text-xs font-bold text-ink/50 mt-2">${esc(t('hist.rate', { rate: num(cur.microPerStep, 4) }))}</p>`)}
      ${card(`${h(t('hist.budget'))}<p class="text-xs font-semibold text-ink/50">${esc(t('hist.budgetHint'))}</p>
        <div class="overflow-x-auto mt-2"><table class="w-full text-sm font-bold num min-w-[560px]"><thead class="text-xs uppercase text-ink/50"><tr>
          <th class="text-left py-1">${esc(t('hist.col.deposit'))}</th><th class="text-right">${esc(t('hist.col.capital'))}</th><th class="text-right">${esc(t('hist.col.cap'))}</th>
          <th class="text-right">${esc(t('hist.col.mine'))}</th><th class="text-right">${esc(t('hist.col.chests'))}</th><th class="text-right">${esc(t('hist.col.bonus'))}</th></tr></thead>
          <tbody>${budgetRows || `<tr><td colspan="6" class="py-3 text-center text-ink/50">${esc(t('hist.empty'))}</td></tr>`}</tbody></table></div>`, 'bg-white ring-2 ring-sky-100')}
      ${card(`${h(t('hist.timeline'))}<ol class="mt-2 grid gap-2 text-sm">${items.map((it) => `<li class="flex gap-3"><span class="shrink-0 w-24 text-xs font-bold text-ink/50 pt-0.5">${esc(fmtDate(it.at, ctx.tz, 'dateTime'))}</span><div class="font-semibold">${it.html}</div></li>`).join('') || `<li class="text-ink/50">${esc(t('hist.empty'))}</li>`}</ol>`, 'bg-white ring-2 ring-sky-100')}
    </div>`;
    body.querySelectorAll('[data-void]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(t('hist.voidConfirm'))) return;
      act(async () => { ctx.setSnapshot(await ctx.backend.voidDeposit(token(), ctx.kidId, { opId: b.dataset.void, expectedRev: ctx.rev })); ctx.toast(t('toast.voided')); });
    }));
  }

  /* ---------------- Reward plan ---------------- */
  function tabPlan(body) {
    const plan = ctx.plan || DEFAULT_PLAN;
    body.innerHTML = `<div class="grid gap-4 lg:grid-cols-2">
      ${card(`${h(t('plan.title'))}<p class="text-sm font-semibold text-ink/60">${esc(t('plan.hint'))}</p>
        <p class="text-xs font-bold text-ink/50 mt-1">${esc(t('plan.current', { v: plan.v }))}</p>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">${plan.th.map((v, i) => `<label class="block"><span class="text-xs font-bold text-ink/60">${esc(t('plan.month', { n: i + 1 }))}</span>
          <div class="flex items-center gap-1 mt-1"><input data-th="${i}" type="number" min="0" max="50" step="0.5" value="${v / 100}" class="field px-2 text-center" /><span class="text-sm font-bold">%</span></div></label>`).join('')}</div>
        <label class="block mt-3"><span class="text-sm font-bold text-ink/70">${esc(t('plan.rate'))}</span>
          <select id="plRate" class="field mt-1">${[1, 2, 3].map((r) => `<option value="${r}" ${r === plan.rate ? 'selected' : ''}>${esc(t('plan.rateOpt', { n: r, share: pct(maxMineShareBp(r)) }))}</option>`).join('')}</select></label>
        <label class="block mt-3"><span class="text-sm font-bold text-ink/70">${esc(t('plan.bonusDefault'))}</span>
          <div class="flex items-center gap-1 mt-1"><input id="plBonus" type="number" min="0" max="50" step="1" value="${ctx.settings.bonusPct ?? 20}" class="field w-24" /><span class="font-bold">%</span></div></label>
        <p id="plErr" class="text-sm font-bold text-berry-600 mt-3" hidden></p>
        <button id="plSave" class="btn bg-grape-500 hover:bg-grape-600 text-white mt-4">${esc(t('plan.save'))}</button>
        <p class="text-xs font-bold text-ink/50 mt-2">${esc(t('plan.appliesNew'))}</p>`, 'bg-grape-50')}
      ${card(`${h(t('plan.preview'))}<label class="flex items-center gap-2 mt-1 text-sm font-bold text-ink/70">${esc(t('plan.sample'))}
          <input id="plAmt" inputmode="decimal" class="field w-28" value="10,00" /></label><div id="plPreview" class="mt-3"></div>`, 'bg-sun-50')}
    </div>`;
    const read = () => ({
      v: plan.v + 1,
      th: [...body.querySelectorAll('[data-th]')].map((el) => Math.round((Number(el.value.replace(',', '.')) || 0) * 100)),
      rate: Number($('plRate').value),
    });
    const upd = () => {
      const p = read();
      const errs = validatePlan(p);
      $('plErr').hidden = !errs.length;
      $('plErr').textContent = errs.map((e) => t('err.' + e, { max: pct(MAX_CAP_BP), share: pct(maxMineShareBp(p.rate)) })).join(' ');
      $('plSave').disabled = !!errs.length;
      const amount = parseZl($('plAmt').value);
      if (!(amount > 0) || errs.length) { $('plPreview').innerHTML = ''; return; }
      const pv = previewDeposit({ amount, plan: p, start: ctx.nowMs(), tz: ctx.tz });
      $('plPreview').innerHTML = previewHtml(pv, null, amount) + `<p class="text-xs font-bold text-ink/50 mt-2">${esc(t('plan.maxBonus', { amount: money(pv.maxBonus) }))}</p>`;
    };
    body.querySelectorAll('input,select').forEach((el) => el.addEventListener('input', upd));
    upd();
    $('plSave').addEventListener('click', () => act(async () => {
      const p = read();
      const snap = await ctx.backend.savePlan(token(), ctx.kidId, { th: p.th, rate: p.rate, bonusPct: Number($('plBonus').value) || 0 });
      ctx.setSnapshot(snap); ctx.toast(t('toast.planSaved', { v: snap.plan.v }));
    }));
  }

  /* ---------------- Goals ---------------- */
  function tabGoals(body) {
    const sch = ctx.schedule;
    body.innerHTML = `<div class="grid gap-4 md:grid-cols-3">${ctx.dreams.map((d, i) => `
      <form data-dream="${i}" class="rounded-3xl ${['bg-mint-50', 'bg-sky-50', 'bg-grape-50'][i]} p-4 grid gap-2 content-start ${focusSlot === i ? 'ring-4 ring-berry-300' : ''}">
        <p class="font-display font-extrabold">${esc(t('dream.' + ['easy', 'medium', 'awesome'][i]))}</p>
        <img data-prev="${i}" src="${esc(dreamImage(d.img, i))}" alt="" class="w-full aspect-[4/3] object-cover rounded-2xl bg-white" />
        <div class="flex flex-wrap gap-1">${DREAM_ART_KEYS.map((k) => `<button type="button" data-art="${k}" class="w-10 h-8 rounded-lg overflow-hidden ring-2 ${d.img === 'art:' + k ? 'ring-berry-400' : 'ring-white'}" aria-label="${esc(t('goal.art.' + k))}"><img src="${DREAM_ART[k]}" alt="" class="w-full h-full object-cover"/></button>`).join('')}</div>
        <label class="text-xs font-bold text-ink/60">${esc(t('goal.name'))}<input name="dname" maxlength="40" required class="field mt-1" value="${esc(d.name)}" /></label>
        <label class="text-xs font-bold text-ink/60">${esc(t('goal.price'))}<input name="dprice" inputmode="decimal" required class="field mt-1" value="${esc(fmtIn(Math.round(d.price * 100) * MICRO_PER_GROSZ))}" /></label>
        <label class="text-xs font-bold text-ink/60">${esc(t('goal.upload'))}<input name="dfile" type="file" accept="image/*" class="block mt-1 text-xs" /></label>
        <input type="hidden" name="dimg" value="${esc(d.img || '')}" />
        <button class="btn bg-white hover:bg-ink/5 justify-self-start">${esc(t('goal.save'))}</button>
      </form>`).join('')}</div>
      ${card(`${h(t('sched.title'))}<p class="text-sm font-semibold text-ink/60">${esc(t('sched.hint'))}</p>
        <form id="schedForm" class="mt-3 flex flex-wrap gap-3 items-end">
          <label class="flex items-center gap-2 font-bold"><input id="scOn" type="checkbox" class="w-5 h-5" ${sch ? 'checked' : ''}/> ${esc(t('sched.on'))}</label>
          <label class="block"><span class="text-xs font-bold text-ink/60">${esc(t('pay.amount'))}</span><input id="scAmt" inputmode="decimal" class="field mt-1 w-28" value="${sch ? esc(fmtIn(sch.amount)) : '10,00'}" /></label>
          <label class="block"><span class="text-xs font-bold text-ink/60">${esc(t('sched.every'))}</span><select id="scEvery" class="field mt-1"><option value="week" ${sch && sch.every === 'week' ? 'selected' : ''}>${esc(t('sched.week'))}</option><option value="month" ${sch && sch.every === 'month' ? 'selected' : ''}>${esc(t('sched.month'))}</option></select></label>
          <label class="block"><span class="text-xs font-bold text-ink/60">${esc(t('sched.vaultPct'))}</span><input id="scPct" type="number" min="0" max="100" class="field mt-1 w-24" value="${sch ? sch.vaultPct ?? 100 : 100}" /></label>
          <button class="btn bg-sky-500 hover:bg-sky-600 text-white">${esc(t('goal.save'))}</button></form>`, 'bg-sun-50 mt-4')}`;

    body.querySelectorAll('form[data-dream]').forEach((f) => {
      const i = Number(f.dataset.dream);
      const setImg = (v) => { f.dimg.value = v; f.querySelector('[data-prev]').src = dreamImage(v || null, i); };
      f.querySelectorAll('[data-art]').forEach((b) => b.addEventListener('click', () => {
        setImg('art:' + b.dataset.art);
        f.querySelectorAll('[data-art]').forEach((x) => x.classList.replace('ring-berry-400', 'ring-white'));
        b.classList.replace('ring-white', 'ring-berry-400');
      }));
      f.dfile.addEventListener('change', () => {
        const file = f.dfile.files && f.dfile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const k = Math.min(1, 480 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            setImg(c.toDataURL('image/jpeg', 0.82));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const price = parseZl(f.dprice.value);
        if (!(price > 0)) { ctx.toast(t('err.dream_invalid'), 'error'); return; }
        act(async () => {
          ctx.setSnapshot(await ctx.backend.saveDream(token(), ctx.kidId, { slot: i, name: f.dname.value.trim(), price: price / 1e6, img: f.dimg.value || null }));
          ctx.toast(t('toast.dreamSaved'));
        });
      });
    });
    if (focusSlot != null) setTimeout(() => { const f = body.querySelector(`form[data-dream="${focusSlot}"]`); if (f) { f.scrollIntoView({ block: 'nearest' }); f.dname.focus(); } focusSlot = null; }, 50);
    $('schedForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseZl($('scAmt').value);
      const s = $('scOn').checked ? { amount, every: $('scEvery').value, vaultPct: Math.max(0, Math.min(100, Number($('scPct').value) || 0)) } : null;
      if (s && !(amount > 0)) { ctx.toast(t('err.schedule_invalid'), 'error'); return; }
      act(async () => { ctx.setSnapshot(await ctx.backend.saveSchedule(token(), ctx.kidId, s)); ctx.toast(t('toast.scheduleSaved')); });
    });
  }

  /* ---------------- Family / settings ---------------- */
  function tabFamily(body) {
    const local = ctx.backend.kind === 'local';
    const kid = ctx.family && ctx.family.kids.find((k) => k.id === ctx.kidId);
    const link = !local && kid && kid.view_token ? `${location.origin}${location.pathname}?dziecko=${kid.view_token}` : '';
    body.innerHTML = `<div class="grid gap-4 lg:grid-cols-2">
      <div class="grid gap-4 content-start">
        ${card(`${h(t('fam.kids'))}<div class="flex flex-wrap gap-2 mt-2">
            <button id="fRename" class="btn bg-white text-sm">${esc(t('fam.rename', { name: ctx.snap.kid.name }))}</button>
            <button id="fAdd" class="btn bg-white text-sm">${esc(t('fam.add'))}</button></div>`, 'bg-sun-50')}
        ${link ? card(`${h(t('fam.link', { name: kid.name }))}<p class="text-xs font-semibold text-ink/60">${esc(t('fam.linkHint'))}</p>
          <div class="mt-3 flex gap-3 items-start"><div id="kidQr" class="w-28 h-28 shrink-0 bg-white rounded-xl p-1.5"></div>
            <div class="flex-1 min-w-0 grid gap-2"><input id="fLink" readonly value="${esc(link)}" class="field text-xs" />
              <div class="flex flex-wrap gap-2"><button id="fCopy" class="btn bg-mint-500 hover:bg-mint-600 text-white text-sm">${esc(t('fam.copy'))}</button>
              <button id="fNewLink" class="btn bg-white text-mint-700 text-sm">${esc(t('fam.newLink'))}</button></div></div></div>`, 'bg-mint-50') : ''}
        ${!local && ctx.family ? card(`${h(t('fam.second'))}<p class="text-sm font-semibold text-ink/70">${esc(t('fam.secondHint'))} <span class="font-display font-extrabold text-lg tracking-widest text-sky-700 bg-white rounded-lg px-2">${esc(ctx.family.join_code)}</span></p>
          <p class="text-xs font-bold text-ink/50 mt-1">${esc(t('fam.members', { n: ctx.family.members }))}</p>`) : ''}
      </div>
      <div class="grid gap-4 content-start">
        ${card(`${h(t('fam.pin'))}<form id="fPinForm" class="mt-2 flex flex-wrap gap-2 items-end"><input id="fPin" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password" class="field w-36" placeholder="${esc(t('fam.newPin'))}" />
          <button class="btn bg-white text-sm">${esc(t('fam.changePin'))}</button></form>`, 'bg-grape-50')}
        ${local ? card(`${h(t('fam.trial'))}<p class="text-sm font-semibold text-ink/70">${esc(t('fam.trialHint'))}</p>
          <div class="flex flex-wrap gap-2 mt-3">${cloudReady ? `<button id="fAccount" class="btn bg-grape-500 hover:bg-grape-600 text-white text-sm">${esc(t('fam.createAccount'))}</button>` : ''}
          <button id="fDemo" class="btn bg-white text-sm">${esc(t('fam.demo'))}</button>
          <button id="fReset" class="btn bg-white text-berry-600 text-sm">${esc(t('fam.reset'))}</button></div>`) :
          card(`<div class="flex justify-between items-center gap-2 text-sm font-bold text-ink/60"><span>${esc(t('fam.loggedIn', { email: ctx.userEmail }))}</span><button id="fLogout" class="underline">${esc(t('auth.logout'))}</button></div>`)}
      </div></div>`;

    $('fRename').addEventListener('click', () => {
      const n = prompt(t('fam.renamePrompt'), ctx.snap.kid.name);
      if (!n || !n.trim()) return;
      act(async () => { await ctx.backend.renameKid(token(), ctx.kidId, n.trim().slice(0, 30)); await ctx.refreshFamily(); await ctx.reload(); });
    });
    $('fAdd').addEventListener('click', () => {
      const n = prompt(t('fam.addPrompt'));
      if (!n || !n.trim()) return;
      act(async () => { const id = await ctx.backend.addKid(token(), n.trim().slice(0, 30)); await ctx.refreshFamily(); await ctx.switchKid(id); render(); });
    });
    $('fPinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = $('fPin').value.trim();
      act(async () => { await ctx.backend.setPin(p, token()); $('fPin').value = ''; ctx.toast(t('pin.saved')); render(); });
    });
    if (link) {
      try { if (window.QRCode) new window.QRCode($('kidQr'), { text: link, width: 256, height: 256, colorDark: '#2b3a55', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M }); } catch { /* optional */ }
      $('fCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(link); ctx.toast(t('fam.copied')); } catch { $('fLink').select(); }
      });
      $('fNewLink').addEventListener('click', () => {
        if (!confirm(t('fam.newLinkConfirm'))) return;
        act(async () => { await ctx.backend.regenerateLink(token(), ctx.kidId); await ctx.refreshFamily(); render(); });
      });
    }
    if (local) {
      const acc = $('fAccount'); if (acc) acc.addEventListener('click', () => { dlg.close(); openAuth('signup'); });
      $('fDemo').addEventListener('click', () => {
        if (!confirm(t('fam.demoConfirm'))) return;
        act(async () => { await ctx.backend.loadDemo(token(), ctx.kidId); await ctx.reload(); ctx.toast(t('fam.demoLoaded')); });
      });
      $('fReset').addEventListener('click', () => {
        if (!confirm(t('fam.resetConfirm'))) return;
        act(async () => { const id = await ctx.backend.resetAll(token()); await ctx.refreshFamily(); await ctx.switchKid(id); render(); });
      });
    } else {
      $('fLogout').addEventListener('click', logout);
    }
  }

  function refresh() {
    if (!dlg.open) return;
    const a = document.activeElement;
    if (a && $('pzBody').contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { renderTabs(); return; }
    render();
  }

  return { open, refresh };
}

// Cele dziecka (karty z paskiem postępu, dodawanie) i Groszak Księgowy w dymku.

import { accountantLine } from './droga.js';
import { t, plural } from './teksty.js';

export const GOAL_ICONS = ['🛴', '🚲', '🧸', '🎮', '📚', '🎨', '⚽', '🎧', '🐶', '🧩', '🛼', '🎹', '🏕️', '🎁', '🦄', '🚀'];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Rysuje karty celów. opts: { formatMoney, formatDate, onTap(flag), onAdd({nazwa,kwotaZl,ikona}), onRemove(goal), canEdit }
 */
export function renderGoals(el, road, opts) {
  const fm = opts.formatMoney, fd = opts.formatDate;
  const cards = road.goals.map((g) => {
    const pct = Math.round(g.progress * 100);
    const status = g.reachedNow
      ? `<div class="gr-goal-ok">${esc(t('cele.mozesz'))}</div>`
      : `<div class="gr-goal-miss">${esc(t('cele.brakuje', { kwota: fm(g.missing) }))}</div>
         <div class="gr-goal-when">${esc(g.beyond ? t('cele.ponadRok') : t('cele.prognozaDnia', { dzien: fd(g.day) }))}</div>`;
    return `<button class="gr-goal${g.reachedNow ? ' done' : ''}" data-goal="${esc(g.goal.id)}">
      <span class="gr-goal-icon">${esc(g.goal.ikona || '⭐')}</span>
      <span class="gr-goal-body">
        <span class="gr-goal-name">${esc(g.goal.nazwa)}</span>
        <span class="gr-goal-price">${esc(fm(g.goal.kwota))}</span>
        <span class="gr-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></span>
        ${status}
      </span>
      ${opts.canEdit ? `<span class="gr-goal-x" data-remove="${esc(g.goal.id)}" aria-label="${esc(t('cele.usun'))}" role="button">×</span>` : ''}
    </button>`;
  }).join('');
  el.innerHTML = `<div class="gr-goals">${cards}
    ${opts.canEdit ? `<button class="gr-goal gr-goal-add" data-add>＋ ${esc(t('cele.dodaj'))}</button>` : ''}</div>
    <form class="gr-goal-form" hidden>
      <label>${esc(t('cele.nazwa'))}<input name="nazwa" maxlength="40" required></label>
      <label>${esc(t('cele.kwota'))}<input name="kwota" type="number" min="1" step="1" inputmode="numeric" required></label>
      <div class="gr-icons" role="radiogroup" aria-label="${esc(t('cele.ikona'))}">${GOAL_ICONS.map((i, k) =>
        `<label><input type="radio" name="ikona" value="${i}"${k === 0 ? ' checked' : ''}><span>${i}</span></label>`).join('')}</div>
      <div class="gr-form-btns"><button type="submit">${esc(t('cele.zapisz'))}</button><button type="button" data-cancel>${esc(t('cele.anuluj'))}</button></div>
    </form>`;
  const form = el.querySelector('form');
  el.querySelectorAll('[data-goal]').forEach((b) => b.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    const g = road.goals.find((x) => String(x.goal.id) === b.dataset.goal);
    if (rm) { e.stopPropagation(); if (confirm(t('cele.usun') + '?')) opts.onRemove?.(g.goal); return; }
    opts.onTap?.(g);
  }));
  el.querySelector('[data-add]')?.addEventListener('click', () => { form.hidden = false; form.nazwa.focus(); });
  form.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nazwa = form.nazwa.value.trim();
    const kwotaZl = Number(form.kwota.value);
    if (!nazwa || !(kwotaZl > 0)) return;
    opts.onAdd?.({ nazwa, kwotaZl, ikona: form.ikona.value });
    form.hidden = true;
  });
}

/** Groszak Księgowy: większa postać w rogu ekranu z dymkiem. */
export class Ksiegowy {
  constructor(base, manifest) {
    const poses = manifest.postacie?.ksiegowy || {};
    this.poses = Object.values(poses).map((p) => base + p.plik);
    this.el = document.createElement('div');
    this.el.className = 'gr-ksiegowy';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="gr-k-bubble"><p class="gr-k-line"></p><p class="gr-k-note"></p></div><img alt="" class="gr-k-img">`;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', () => this.hide());
    this.n = 0;
  }
  say(flag, road, formatDate) {
    const { key, params } = accountantLine(flag, road);
    const p = { ...params };
    if (p.dzien !== undefined) p.dzien = formatDate(p.dzien);
    if (p.noce !== undefined) p.nocy = plural(p.noce, 'noc', 'noce', 'nocy');
    this.el.querySelector('.gr-k-line').textContent = t(key, p);
    this.el.querySelector('.gr-k-note').textContent = flag.reachedNow ? '' : t('ksiegowy.dopisek');
    this.el.querySelector('.gr-k-img').src = this.poses[this.n++ % Math.max(1, this.poses.length)] || '';
    this.el.hidden = false;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), 9000);
  }
  hide() { this.el.hidden = true; }
}

export const CELE_CSS = `
.gr-goals { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.gr-goal { position: relative; display: flex; gap: 10px; align-items: center; text-align: left; font: inherit; color: #4a2c1a;
  background: #fffaf0; border: 2px solid #ecd9b8; border-radius: 14px; padding: 10px 12px; cursor: pointer; }
.gr-goal.done { border-color: #8fc98f; background: #f2fbef; }
.gr-goal-add { justify-content: center; font-weight: 700; border-style: dashed; min-height: 64px; }
.gr-goal-icon { font-size: 34px; line-height: 1; }
.gr-goal-body { display: grid; gap: 3px; flex: 1; min-width: 0; }
.gr-goal-name { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gr-goal-price { font-size: 13px; opacity: .75; }
.gr-bar { display: block; height: 10px; border-radius: 99px; background: #f1e3c6; overflow: hidden; border: 1px solid #e3cfa6; }
.gr-bar > span { display: block; height: 100%; background: linear-gradient(90deg, #f0b23c, #e8902f); border-radius: 99px; }
.gr-goal.done .gr-bar > span { background: #5cb85c; }
.gr-goal-miss { font-size: 13px; font-weight: 700; }
.gr-goal-when { font-size: 12px; opacity: .7; }
.gr-goal-ok { font-size: 14px; font-weight: 800; color: #2f7a3a; }
.gr-goal-x { position: absolute; top: 4px; right: 8px; font-size: 18px; opacity: .45; padding: 2px 4px; }
.gr-goal-form { margin-top: 10px; background: #fffaf0; border: 2px solid #ecd9b8; border-radius: 14px; padding: 12px; display: grid; gap: 8px; }
.gr-goal-form[hidden] { display: none; }
.gr-goal-form label { display: grid; gap: 4px; font-weight: 700; font-size: 14px; }
.gr-goal-form input[name] { font: inherit; padding: 8px 10px; border: 2px solid #ecd9b8; border-radius: 10px; }
.gr-icons { display: flex; flex-wrap: wrap; gap: 6px; }
.gr-icons label { display: block; }
.gr-icons input { position: absolute; opacity: 0; }
.gr-icons span { display: grid; place-items: center; width: 42px; height: 42px; font-size: 24px; border: 2px solid #ecd9b8; border-radius: 10px; background: #fff; cursor: pointer; }
.gr-icons input:checked + span { border-color: #4a2c1a; background: #fff2cc; }
.gr-form-btns { display: flex; gap: 8px; }
.gr-form-btns button { font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 999px; border: 2px solid #4a2c1a; background: #4a2c1a; color: #fff; }
.gr-form-btns button[data-cancel] { background: #fff; color: #4a2c1a; }
.gr-ksiegowy { position: fixed; right: 10px; bottom: 10px; z-index: 40; display: flex; align-items: flex-end; gap: 0;
  max-width: min(460px, calc(100vw - 20px)); pointer-events: auto; cursor: pointer; }
.gr-ksiegowy[hidden] { display: none; }
.gr-ksiegowy.in { animation: grKIn .45s cubic-bezier(.2,1.4,.4,1); }
@keyframes grKIn { from { transform: translateY(40px) scale(.9); opacity: 0; } to { transform: none; opacity: 1; } }
.gr-k-img { width: clamp(120px, 34vw, 190px); height: auto; filter: drop-shadow(0 4px 8px rgba(0,0,0,.15)); }
.gr-k-bubble { position: relative; background: #fff; border: 2px solid #4a2c1a; border-radius: 16px; padding: 10px 12px;
  margin-bottom: 60%; margin-right: -12px; font: 600 15px/1.35 system-ui, sans-serif; color: #4a2c1a; max-width: 260px; }
.gr-k-bubble::after { content: ''; position: absolute; right: -10px; bottom: 18px; border: 8px solid transparent; border-left-color: #4a2c1a; }
.gr-k-line { margin: 0; }
.gr-k-note { margin: 6px 0 0; font-size: 12px; font-weight: 500; opacity: .7; }
.gr-k-note:empty { display: none; }
@media (max-width: 600px) {
  .gr-ksiegowy { flex-direction: column; align-items: flex-end; max-width: min(300px, calc(100vw - 20px)); }
  .gr-k-bubble { margin: 0 6px -6px 0; font-size: 14px; padding: 8px 10px; }
  .gr-k-bubble::after { right: 40px; bottom: -16px; border-left-color: transparent; border-top-color: #4a2c1a; }
  .gr-k-img { width: 120px; }
}
@media (prefers-reduced-motion: reduce) { .gr-ksiegowy.in { animation: none; } }
`;

// Zgody na cookies i podobne technologie (analityka, reklamy).
// Wybór leży w localStorage tej przeglądarki ('gr.zgody'). Bez zgody nie ładujemy żadnych skryptów
// analitycznych ani reklamowych. Ekran dziecka nie pyta o zgodę i nigdy ich nie ładuje.

import { t } from './teksty.js';

const KEY = 'gr.zgody';
const VERSION = 1; // podbić, gdy zmieni się lista celów – wtedy pytamy ponownie
const listeners = new Set();

function read() {
  try {
    const z = JSON.parse(localStorage.getItem(KEY));
    return z && z.v === VERSION ? z : null;
  } catch { return null; }
}

/** Aktualny wybór albo null, jeśli jeszcze nie wybrano. */

export function saveConsent({ analityka, marketing }) {
  const prev = read();
  const z = { v: VERSION, analityka: !!analityka, marketing: !!marketing, ts: new Date().toISOString() };
  try { localStorage.setItem(KEY, JSON.stringify(z)); } catch { /* prywatne okno – zgoda tylko na tę wizytę */ }
  memory = z;
  hideBanner();
  // Wycofanej zgody nie da się „odładować” ze strony – przeładowanie usuwa skrypty z pamięci.
  if (prev && ((prev.analityka && !z.analityka) || (prev.marketing && !z.marketing))) { location.reload(); return; }
  listeners.forEach((f) => f(z));
}

// Gdy localStorage nie działa (prywatne okno), pamiętamy wybór do końca wizyty.
let memory = null;
const current = () => read() || memory;

/** Aktualny wybór albo null, jeśli jeszcze nie wybrano. */
export const consent = () => current();
export const allows = (cel) => !!current()?.[cel];

export function onConsent(f) { listeners.add(f); }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function hideBanner() { document.getElementById('consent')?.remove(); }

/** Pokazuje okienko zgody. details=true od razu otwiera wybór kategorii. */
export function openConsent(details = false) {
  hideBanner();
  const z = current();
  const el = document.createElement('section');
  el.id = 'consent';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('zg.tytul'));
  el.innerHTML = `<div class="consent-box">
    <h3>${esc(t('zg.tytul'))}</h3>
    <p>${esc(t('zg.opis'))} <a href="./polityka.html" target="_blank" rel="noopener">${esc(t('zg.polityka'))}</a></p>
    <form class="consent-details" ${details ? '' : 'hidden'}>
      <label><input type="checkbox" checked disabled> <span><b>${esc(t('zg.niezbedne'))}</b><small>${esc(t('zg.niezbedneOpis'))}</small></span></label>
      <label><input type="checkbox" name="analityka" ${z?.analityka ? 'checked' : ''}> <span><b>${esc(t('zg.analityka'))}</b><small>${esc(t('zg.analitykaOpis'))}</small></span></label>
      <label><input type="checkbox" name="marketing" ${z?.marketing ? 'checked' : ''}> <span><b>${esc(t('zg.marketing'))}</b><small>${esc(t('zg.marketingOpis'))}</small></span></label>
    </form>
    <div class="consent-actions">
      <button type="button" class="btn" data-z="all">${esc(t('zg.wszystkie'))}</button>
      <button type="button" class="btn" data-z="none">${esc(t('zg.niezbedneTylko'))}</button>
      <button type="button" class="btn light" data-z="more" ${details ? 'hidden' : ''}>${esc(t('zg.ustawienia'))}</button>
      <button type="button" class="btn light" data-z="save" ${details ? '' : 'hidden'}>${esc(t('zg.zapisz'))}</button>
    </div>
  </div>`;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-z]')?.dataset.z;
    if (!a) return;
    const form = el.querySelector('form');
    if (a === 'all') saveConsent({ analityka: true, marketing: true });
    if (a === 'none') saveConsent({ analityka: false, marketing: false });
    if (a === 'save') saveConsent({ analityka: form.analityka.checked, marketing: form.marketing.checked });
    if (a === 'more') {
      form.hidden = false;
      el.querySelector('[data-z="more"]').hidden = true;
      el.querySelector('[data-z="save"]').hidden = false;
    }
  });
  document.body.appendChild(el);
}

/** Pyta tylko wtedy, gdy wyboru jeszcze nie ma. */
export function askIfNeeded() { if (!current()) openConsent(false); }

// ---------------------------------------------------------------- analityka (Google Analytics 4)

let gaReady = false;

/** Ładuje GA4, jeśli jest identyfikator i zgoda. Bez reklamowych sygnałów Google. */
export function startAnalytics(id) {
  if (gaReady || !/^G-[A-Z0-9]{4,}$/.test(id || '') || !current()?.analityka) return;
  gaReady = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
}

/** Zdarzenie analityczne – bez kwot, imion i innych danych rodziny. Bez zgody nic nie robi. */
export function track(name, params = {}) {
  if (gaReady && window.gtag) window.gtag('event', name, params);
}

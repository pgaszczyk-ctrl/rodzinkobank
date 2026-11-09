// Teksty interfejsu Groszaków. Wszystkie napisy w jednym miejscu,
// przygotowane do tłumaczenia: t('klucz', { parametry }).

export const TEKSTY = {
  pl: {
    'dymek.doPracy': 'Idę do pracy: {miejsce}',
    'dymek.wracam': 'Wracam z okruszkiem',
    'dymek.niose': 'Niosę okruszek do Skarbca!',
    'dymek.kolejka': 'Czekam, aż Skarbiec przyjmie okruszek',
    'dymek.oddaje': 'Okruszek w Skarbcu!',
    'dymek.biegne': 'Biegnę do pracy!',
    'dymek.marzenie': 'Idę po marzenie!',
    'dymek.sen': 'Chrr… Pierwsza wpłata obudzi Groszaki',
    'dymek.wartosc': 'Każdy z nas to ok. {kwota}',
    'pusty': 'Pierwsza wpłata obudzi Groszaki',
  },
};

let lang = 'pl';
export function setLang(l) { if (TEKSTY[l]) lang = l; }

export function t(key, params = {}) {
  const s = (TEKSTY[lang] && TEKSTY[lang][key]) || TEKSTY.pl[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

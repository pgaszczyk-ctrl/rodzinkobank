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

    'saldo.mikro': '10 000 mikrogroszy to 1 grosz',

    'droga.tytul': 'Droga przez rok',
    'droga.dzis': 'Dziś',
    'droga.jesliNic': 'jeśli nic nie wydasz',
    'droga.noce': 'jeszcze {n} {noce}',
    'droga.ponadRok': 'za ponad rok',
    'droga.prognoza': 'prognoza',
    'wp.mikolajki': 'Mikołajki',
    'wp.wigilia': 'Wigilia',
    'wp.wielkanoc': 'Wielkanoc',
    'wp.dzienDziecka': 'Dzień Dziecka',
    'wp.koniecRoku': 'Koniec roku szkolnego',
    'wp.wakacje': 'Wakacje',
    'wp.poczatekRoku': '1 września',
    'wp.ferie': 'Ferie',

    'cele.tytul': 'Moje cele',
    'cele.brakuje': 'Brakuje {kwota}',
    'cele.mozesz': 'Możesz spełnić to marzenie!',
    'cele.dodaj': 'Dodaj cel',
    'cele.nazwa': 'Na co zbierasz?',
    'cele.kwota': 'Ile kosztuje (zł)?',
    'cele.ikona': 'Obrazek',
    'cele.zapisz': 'Zapisz',
    'cele.anuluj': 'Anuluj',
    'cele.usun': 'Usuń cel',
    'cele.prognozaDnia': 'Prognoza: {dzien}',
    'cele.ponadRok': 'Prognoza: za ponad rok',

    'ksiegowy.juz': 'Policzyłem! Masz już tyle, ile trzeba na „{nazwa}”. Możesz spełnić to marzenie!',
    'ksiegowy.ponadRok': 'Policzyłem! Na „{nazwa}” potrzeba więcej niż rok odkładania. Stawiam flagę na końcu drogi.',
    'ksiegowy.noce': 'Policzyłem! Na „{nazwa}” uzbierasz już za {noce} {nocy}.',
    'ksiegowy.przed': 'Policzyłem! Na „{nazwa}” uzbierasz przed {wydarzenie} – około {dzien}.',
    'ksiegowy.przedWlasnym': 'Policzyłem! Na „{nazwa}” uzbierasz przed wydarzeniem „{wydarzenie}” – około {dzien}.',
    'ksiegowy.dnia': 'Policzyłem! Na „{nazwa}” uzbierasz około {dzien}.',
    'ksiegowy.dopisek': 'To prognoza, jeśli nic nie wydasz.',
  },
};

let lang = 'pl';
export function setLang(l) { if (TEKSTY[l]) lang = l; }

export function t(key, params = {}) {
  const s = (TEKSTY[lang] && TEKSTY[lang][key]) || TEKSTY.pl[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ''));
}

/** Polska odmiana liczebnika: plural(5, 'noc', 'noce', 'nocy'). */
export function plural(n, one, few, many) {
  if (n === 1) return one;
  const d = n % 10, h = n % 100;
  return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

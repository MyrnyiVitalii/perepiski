import ru from '../lang/ru.js';

const LANGS = { ru };
let dict = ru;

export function setLang(code) {
  dict = LANGS[code] || ru;
}

export function t(key, vars = {}) {
  let s = dict[key] ?? ru[key] ?? key;
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

// Русские окончания: 1 участник, 2 участника, 5 участников
export function plural(key, n) {
  const forms = dict[key] || ru[key];
  const n10 = n % 10, n100 = n % 100;
  let f = 'many';
  if (n10 === 1 && n100 !== 11) f = 'one';
  else if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) f = 'few';
  return forms[f].replace('{n}', n);
}

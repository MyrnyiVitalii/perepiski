// Полоска загрузки внизу списка историй (просьба Виталика 24.11.2026):
// видно, как приложение подтягивает свежую версию, истории и картинки, и когда всё загружено.
// Версия – время выкладки сайта на GitHub Pages (заголовок Last-Modified).
// В чате полоска не показывается: экран переписки записывают на видео.
import { h } from './ui.js';
import { t } from './i18n.js';

let bar, text, fill;
let ver = null;            // { date } – время выкладки сайта
let installing = false;    // сейчас скачивается новая версия приложения
let finished = false;
let hideTimer = 0, stuckTimer = 0;

const onLibrary = () => !location.hash || location.hash === '#';

function verLabel() {
  return ver ? t('loadVersion', { n: ver.n, date: ver.date }) : '';
}

function render(msg, part, state = '') {
  if (!bar) return;
  text.textContent = msg;
  fill.style.width = part == null ? '' : Math.round(Math.max(0, Math.min(1, part)) * 100) + '%';
  bar.classList.toggle('indet', part == null && state === '');
  bar.classList.toggle('ok', state === 'ok');
  bar.classList.toggle('warn', state === 'warn');
  bar.classList.remove('gone');
  sync();
}

function sync() {
  if (bar) bar.classList.toggle('hidden', !onLibrary());
}

function finish(msg, state) {
  finished = true;
  clearTimeout(stuckTimer);
  render(msg, 1, state);
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => bar && bar.classList.add('gone'), 6000);
}

function onProgress(d) {
  if (finished && d.stage !== 'shell') return;
  // загрузка идёт – «зависла» считаем только 45 секунд тишины подряд
  clearTimeout(stuckTimer);
  if (d.stage !== 'done') stuckTimer = setTimeout(() => { if (!finished) finish(t('loadStuck'), 'warn'); }, 45000);
  if (d.stage === 'shell') {
    installing = d.done < d.total;
    finished = false;
    clearTimeout(hideTimer);
    render(t('loadApp', { done: d.done, total: d.total }), d.total ? d.done / d.total : null);
  } else if (d.stage === 'sync') {
    if (installing) return;
    render(t('loadStories', { done: d.done, total: d.total }), d.total ? d.done / d.total : null);
  } else if (d.stage === 'done') {
    if (installing) return;
    if (d.offline || navigator.onLine === false) finish(t('loadOffline') + (ver ? ' · ' + verLabel() : ''), 'warn');
    else finish('✓ ' + t('loadDone') + (ver ? ' · ' + verLabel() : ''), 'ok');
  }
}

export function startUpdateBar() {
  bar = h('div', { class: 'loadbar indet', role: 'status' },
    text = h('div', { class: 'lb-text' }, t('loadCheck')),
    h('div', { class: 'lb-track' }, fill = h('div', { class: 'lb-fill' })));
  document.body.append(bar);
  sync();
  window.addEventListener('hashchange', sync);
  bar.addEventListener('click', () => { if (finished) bar.classList.add('gone'); });

  // Версия = время, когда сайт выложили (GitHub Pages ставит его всем файлам в заголовок Last-Modified).
  // Запрос HEAD помощник не перехватывает – он идёт прямо в сеть; без интернета версии не будет.
  fetch('index.html', { method: 'HEAD', cache: 'no-cache' }).then((r) => {
    const lm = r.ok && r.headers.get('last-modified');
    const d = lm ? new Date(lm) : null;
    if (!d || isNaN(d)) return;
    const p = (x) => String(x).padStart(2, '0');
    ver = { date: `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}` };
    if (finished && !text.textContent.includes(verLabel())) text.textContent += ' · ' + verLabel();
  }).catch(() => {});

  const swc = navigator.serviceWorker;
  if (!swc || typeof swc.register !== 'function') { finish(verLabel() || t('loadDone'), 'ok'); return; }
  swc.addEventListener('message', (e) => { if (e.data && e.data.type === 'progress') onProgress(e.data); });
  if (navigator.onLine === false) { finish(t('loadOffline'), 'warn'); return; }
  // если помощник долго молчит (старая версия без полоски или сеть совсем плохая) – не висим вечно
  stuckTimer = setTimeout(() => { if (!finished && !installing) finish(t('loadStuck'), 'warn'); }, 45000);
}

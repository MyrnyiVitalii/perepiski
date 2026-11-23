// Главный файл: запуск приложения и переходы между экранами.
import { parseStory } from './parser.js';
import { askPersistent, db } from './storage.js';
import { loadSettings } from './settings.js';
import { renderLibrary } from './library.js';
import { openChat } from './chat.js';
import { openNotes } from './notes.js';
import { h, clearOverlays } from './ui.js';
import { t } from './i18n.js';

const root = document.getElementById('app');
let records = [];
let openedFromList = false;

// Встроенная история: папка с story.txt и assets.json (картинки рядом).
// Демо лежит в папке demo, остальные истории – в stories/<папка>, список в stories/index.json
async function loadBundled(id, folder, isDemo, v = 1) {
  const [text, map] = await Promise.all([
    fetch(folder + '/story.txt', { cache: 'no-cache' }).then((r) => r.text()),
    fetch(folder + '/assets.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const { story, errors } = parseStory(text);
  if (errors.length) console.warn('Ошибки в истории ' + id, errors);
  return {
    id, isDemo, story, errors, sig: textSig(text), v,
    resolve: (file) => (file && map[file] ? folder + '/' + map[file] : ''),
  };
}

const loadDemo = () => loadBundled('demo', 'demo', true);

async function loadStoryList() {
  try {
    const list = await fetch('stories/index.json', { cache: 'no-cache' }).then((r) => r.json());
    // все истории грузим одновременно (без интернета так быстрее открывается)
    const loaded = await Promise.all(list.filter((s) => !isDeleted(s.id, s.v || 1)).map((s) =>
      loadBundled(s.id, 'stories/' + s.folder, false, s.v || 1).catch((e) => { console.error(e); return null; })));
    return loaded.filter(Boolean);
  } catch (e) {
    return [];
  }
}

// «Отпечаток» текста истории: если историю поменяли, старый прогресс не подойдёт
function textSig(text) {
  let x = 0;
  for (let i = 0; i < text.length; i++) x = (x * 31 + text.charCodeAt(i)) | 0;
  return text.length + ':' + x;
}

function showErrors(rec) {
  root.replaceChildren(h('div', { class: 'library' },
    h('div', { class: 'lib-head' }, h('h1', {}, t('storyError'))),
    h('ul', { class: 'errors' }, rec.errors.map((e) => h('li', {}, (e.line ? `Строка ${e.line}: ` : '') + e.msg))),
  ));
}

async function route() {
  // При переходе между экранами закрываем открытые шторки, меню и просмотр фото
  document.querySelectorAll('.sheet-back, .menu-back, .viewer, .tbc, .scene-cover').forEach((el) => el.remove());
  clearOverlays();
  if (location.hash === '#notes') {
    await openNotes(root, {
      onExit: () => { if (openedFromList) { openedFromList = false; history.back(); } else location.replace('#'); },
    });
    return;
  }
  const m = location.hash.match(/^#chat\/(.+)$/);
  if (m) {
    const rec = records.find((r) => r.id === decodeURIComponent(m[1]));
    if (rec) {
      if (rec.errors.length && !rec.isDemo) { showErrors(rec); return; }
      await openChat(root, rec, {
        // Назад в список: если пришли из списка – шаг назад по истории (тогда кнопка «Назад» телефона работает правильно)
        onExit: () => {
          if (openedFromList) { openedFromList = false; history.back(); } else location.replace('#');
        },
        onNext: (id) => { openedFromList = false; location.replace('#chat/' + encodeURIComponent(id)); },
      });
      return;
    }
  }
  openedFromList = false;
  await renderLibrary(root, records, {
    onOpen: (rec) => { openedFromList = true; location.hash = '#chat/' + encodeURIComponent(rec.id); },
    onDelete: deleteStory,
    onOpenNotes: () => { openedFromList = true; location.hash = '#notes'; },
  });
}

// ---------- Удалённые переписки ----------
// Удаление – только на этом телефоне и навсегда: история не вернётся, даже когда на сайте выйдут обновления.
// Список удалённых: { id: v } в памяти телефона. Вернуть историю можно только с компьютера:
// в stories/index.json у неё поднимают номер "v" (было 1 – ставим 2), тогда она снова появится.
let deleted = {};
const isDeleted = (id, v) => deleted[id] != null && deleted[id] >= v;

async function deleteStory(rec) {
  deleted[rec.id] = rec.v || 1;
  try { await db.set('settings', 'deleted', { ...deleted }); } catch (e) { /* нет */ }
  // Стираем прогресс и свои фото героев/чата этой истории
  try { await db.del('progress', rec.id); } catch (e) { /* нет */ }
  try {
    for (const { key } of await db.all('assets')) if (typeof key === 'string' && key.startsWith(`av|${rec.id}|`)) await db.del('assets', key);
  } catch (e) { /* нет */ }
  const i = records.indexOf(rec);
  if (i >= 0) records.splice(i, 1);
  linkSeries(records);
}

// ---------- Работа без интернета ----------
function startOffline() {
  const swc = navigator.serviceWorker;
  if (!swc || typeof swc.register !== 'function') return;
  // Просим помощника докачать картинки новых историй (удалённые – пропустить)
  const askSync = () => swc.ready
    .then((reg) => reg.active && reg.active.postMessage({ type: 'sync', skip: Object.keys(deleted) }))
    .catch(() => {});
  swc.register('sw.js').then(askSync).catch((e) => console.warn('Без интернета не заработает:', e));
  window.addEventListener('online', askSync);
}

async function start() {
  await loadSettings();
  askPersistent();
  try { deleted = (await db.get('settings', 'deleted')) || {}; } catch (e) { deleted = {}; }
  const [stories, demo] = await Promise.all([
    loadStoryList(),
    isDeleted('demo', 1) ? null : loadDemo().catch((e) => { console.error(e); return null; }),
  ]);
  records.push(...stories);
  if (demo) records.push(demo);
  linkSeries(records);
  window.addEventListener('hashchange', route);
  await route();
  try { startOffline(); } catch (e) { console.warn(e); }
}

// Серии одного сериала: у каждой серии запоминаем следующую (для кнопки «Следующая серия»)
function linkSeries(list) {
  for (const r of list) {
    const s = r.story;
    if (!s.series) { r.next = null; continue; }
    const next = list.find((x) => x.story.series && x.story.series.toLowerCase() === s.series.toLowerCase() && x.story.episode === s.episode + 1);
    r.next = next ? next.id : null;
  }
}

start();

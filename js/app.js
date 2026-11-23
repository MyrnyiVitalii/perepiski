// Главный файл: запуск приложения и переходы между экранами.
import { parseStory } from './parser.js';
import { askPersistent } from './storage.js';
import { loadSettings } from './settings.js';
import { renderLibrary } from './library.js';
import { openChat } from './chat.js';
import { h } from './ui.js';
import { t } from './i18n.js';

const root = document.getElementById('app');
let records = [];

// Встроенная история: папка с story.txt и assets.json (картинки рядом).
// Демо лежит в папке demo, остальные истории — в stories/<папка>, список в stories/index.json
async function loadBundled(id, folder, isDemo) {
  const [text, map] = await Promise.all([
    fetch(folder + '/story.txt', { cache: 'no-cache' }).then((r) => r.text()),
    fetch(folder + '/assets.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);
  const { story, errors } = parseStory(text);
  if (errors.length) console.warn('Ошибки в истории ' + id, errors);
  return {
    id, isDemo, story, errors, sig: textSig(text),
    resolve: (file) => (file && map[file] ? folder + '/' + map[file] : ''),
  };
}

const loadDemo = () => loadBundled('demo', 'demo', true);

async function loadStoryList() {
  try {
    const list = await fetch('stories/index.json', { cache: 'no-cache' }).then((r) => r.json());
    const out = [];
    for (const s of list) {
      try { out.push(await loadBundled(s.id, 'stories/' + s.folder, false)); } catch (e) { console.error(e); }
    }
    return out;
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
  document.querySelectorAll('.sheet-back, .menu-back, .viewer').forEach((el) => el.remove());
  const m = location.hash.match(/^#chat\/(.+)$/);
  if (m) {
    const rec = records.find((r) => r.id === decodeURIComponent(m[1]));
    if (rec) {
      if (rec.errors.length && !rec.isDemo) { showErrors(rec); return; }
      await openChat(root, rec, {
        onExit: () => { location.hash = ''; },
        onNext: (id) => { location.hash = '#chat/' + encodeURIComponent(id); },
      });
      return;
    }
  }
  await renderLibrary(root, records, { onOpen: (rec) => { location.hash = '#chat/' + encodeURIComponent(rec.id); } });
}

async function start() {
  await loadSettings();
  askPersistent();
  records.push(...(await loadStoryList()));
  try {
    records.push(await loadDemo());
  } catch (e) {
    console.error(e);
  }
  linkSeries(records);
  window.addEventListener('hashchange', route);
  await route();
}

// Серии одного сериала: у каждой серии запоминаем следующую (для кнопки «Следующая серия»)
function linkSeries(list) {
  for (const r of list) {
    const s = r.story;
    if (!s.series) continue;
    const next = list.find((x) => x.story.series && x.story.series.toLowerCase() === s.series.toLowerCase() && x.story.episode === s.episode + 1);
    r.next = next ? next.id : null;
  }
}

start();

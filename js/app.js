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

// Демо-история лежит в папке demo вместе с картинками
async function loadDemo() {
  const [text, map] = await Promise.all([
    fetch('demo/story.txt', { cache: 'no-cache' }).then((r) => r.text()),
    fetch('demo/assets.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  const { story, errors } = parseStory(text);
  if (errors.length) console.warn('Ошибки в демо-истории', errors);
  return {
    id: 'demo', isDemo: true, story, errors, sig: textSig(text),
    resolve: (file) => (file && map[file] ? 'demo/' + map[file] : ''),
  };
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
      await openChat(root, rec, { onExit: () => { location.hash = ''; } });
      return;
    }
  }
  await renderLibrary(root, records, { onOpen: (rec) => { location.hash = '#chat/' + encodeURIComponent(rec.id); } });
}

async function start() {
  await loadSettings();
  askPersistent();
  try {
    records.push(await loadDemo());
  } catch (e) {
    console.error(e);
  }
  window.addEventListener('hashchange', route);
  await route();
}

start();

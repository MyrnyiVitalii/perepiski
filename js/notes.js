// «Избранное» – чат с самим собой, как «Избранное» в Telegram: свои идеи, правки, правила, фото.
// Всё хранится только на этом телефоне (IndexedDB): settings → 'notes', фото – assets → 'note|<id>'.
// С сайтом не синхронизируется и при обновлениях приложения не пропадает.
import { h, ICONS, iconBtn, flashMsg, viewer, pushOverlay, popOverlay, askYesNo } from './ui.js';
import { t, plural } from './i18n.js';
import { db } from './storage.js';
import { paintChatBg } from './settings.js';
import { pickImage, saveAsset, assetUrl, removeAsset, LIMITS } from './images.js';
import { vibrate } from './sounds.js';

const KEY = 'notes';
const LONG_PRESS = 450;
const PHOTO_MAX = 1600; // фото уменьшаем до 1600 px по длинной стороне – хватает и для экрана, и для чтения текста

export async function loadNotes() {
  try {
    const d = await db.get('settings', KEY);
    if (d && Array.isArray(d.items)) return d;
  } catch (e) { /* нет */ }
  return { seq: 0, items: [], pin: null };
}
const saveNotes = (d) => db.set('settings', KEY, d).catch(() => flashMsg(t('notesSaveFail')));

// Аватарка «Избранного»: закладка на круге
export function savedAvatar() {
  return h('div', { class: 'ava saved-ava', html: ICONS.bookmark });
}

export function noteSnippet(n) {
  if (!n) return '';
  const first = (n.text || '').split('\n')[0];
  return n.photo ? '🖼 ' + (first || t('photo')) : first;
}

const two = (x) => String(x).padStart(2, '0');
const hm = (ts) => { const d = new Date(ts); return two(d.getHours()) + ':' + two(d.getMinutes()); };
const dayKey = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); };
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(now)) return t('today');
  if (dayKey(ts) === dayKey(y)) return t('yesterday');
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
}

// Фото с телефона → уменьшенный JPG
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.88));
}

export async function openNotes(root, { onExit }) {
  const data = await loadNotes();
  let editing = null; // id заметки, которую сейчас меняем
  let pendingPhoto = null; // { blob, url } – фото, выбранное, но ещё не отправленное

  // ---------- Каркас ----------
  const subEl = h('div', { class: 'top-sub' });
  const top = h('header', { class: 'top' },
    iconBtn('back', () => onExit()), savedAvatar(),
    h('div', { class: 'top-titles' }, h('div', { class: 'top-title' }, t('savedTitle')), subEl));
  const pinBar = h('div', { class: 'pin-bar' });
  const list = h('div', { class: 'feed-list' });
  const feed = h('div', { class: 'feed' }, list);
  const bgLayer = h('div', { class: 'chat-bg' });
  const editBar = h('div', { class: 'reply-bar' });
  const photoBar = h('div', { class: 'reply-bar' });

  const input = h('textarea', { class: 'real-input', rows: '1', placeholder: t('notesPlaceholder'), enterkeyhint: 'enter' });
  const send = h('button', { type: 'button', class: 'send-btn', 'aria-label': t('send'), html: ICONS.send });
  const clip = h('button', { type: 'button', class: 'ib notes-clip', 'aria-label': t('photo'), html: ICONS.clip });
  const bar = h('div', { class: 'inputbar manual notes-bar' }, clip, h('div', { class: 'input-wrap' }, input), send);
  const bottom = h('div', { class: 'bottom' }, editBar, photoBar, bar);
  const chat = h('div', { class: 'chat notes' }, bgLayer, h('div', { class: 'chat-shade' }), top, pinBar, feed, bottom);
  root.replaceChildren(chat);
  paintChatBg(bgLayer);

  const byId = (id) => data.items.find((n) => n.id === id);
  const rows = new Map();

  // ---------- Лента ----------
  async function rowFor(n) {
    const meta = h('span', { class: 'meta' },
      n.edited ? h('span', { class: 'edited' }, t('edited')) : null,
      h('span', { class: 'tm' }, hm(n.ts)),
      h('span', { class: 'tick', html: ICONS.tick2 }));
    let b;
    if (n.photo) {
      const url = await assetUrl('note|' + n.id);
      const img = url ? h('img', { src: url, alt: '', draggable: 'false', onclick: () => viewer(url) }) : h('div', { class: 'photo-missing' }, t('photo'));
      b = h('div', { class: 'bubble photo' + (n.text ? '' : ' no-caption') }, img);
      if (n.text) b.append(h('div', { class: 'caption text' }, n.text, meta));
      else b.append(meta);
    } else {
      b = h('div', { class: 'bubble' }, h('div', { class: 'text' }, n.text, meta));
    }
    b.dataset.id = n.id;
    const row = h('div', { class: 'row out run-start run-end' }, b);
    rows.set(n.id, row);
    return row;
  }

  async function renderAll() {
    rows.clear();
    const out = [];
    let lastDay = null;
    for (const n of data.items) {
      const dk = dayKey(n.ts);
      if (dk !== lastDay) { out.push(h('div', { class: 'sys' }, dayLabel(n.ts))); lastDay = dk; }
      out.push(await rowFor(n));
    }
    if (!data.items.length) {
      out.push(h('div', { class: 'notes-empty' },
        h('div', { class: 'ne-icon', html: ICONS.bookmark }),
        h('div', { class: 'ne-title' }, t('notesEmptyTitle')),
        h('div', { class: 'ne-text' }, t('notesEmptyText'))));
    }
    list.replaceChildren(...out);
    subEl.textContent = data.items.length ? plural('notesCount', data.items.length) : '';
    drawPinBar();
    requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
  }

  // ---------- Закреп ----------
  function drawPinBar() {
    const n = data.pin != null ? byId(data.pin) : null;
    pinBar.classList.toggle('on', !!n);
    if (!n) { pinBar.replaceChildren(); return; }
    pinBar.replaceChildren(
      h('div', { class: 'pb-line' }),
      h('div', { class: 'pb-body', onclick: () => jumpTo(n.id) },
        h('div', { class: 'pb-title' }, t('pinnedTitle')),
        h('div', { class: 'pb-text' }, noteSnippet(n))),
      h('span', { class: 'pb-icon', html: ICONS.pin }));
  }
  function jumpTo(id) {
    const row = rows.get(id);
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  }

  // ---------- Поле ввода ----------
  const syncInput = () => {
    send.classList.toggle('ready', input.value.trim().length > 0 || !!pendingPhoto);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  };
  input.addEventListener('input', syncInput);
  // Enter на телефоне – новая строка (заметки бывают длинными); на компьютере Ctrl+Enter – отправить
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); } });
  send.addEventListener('click', () => doSend());
  bar.addEventListener('click', (e) => { if (!send.contains(e.target) && !clip.contains(e.target)) input.focus(); });

  clip.addEventListener('click', async () => {
    const file = await pickImage();
    if (!file) return;
    if (file.size > LIMITS.maxFileMB * 1024 * 1024) { flashMsg(t('notesPhotoBig', { n: LIMITS.maxFileMB })); return; }
    try {
      const blob = await shrinkPhoto(file);
      setPendingPhoto(blob);
    } catch (e) { flashMsg(t('notesPhotoFail')); }
  });

  function setPendingPhoto(blob) {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
    pendingPhoto = blob ? { blob, url: URL.createObjectURL(blob) } : null;
    photoBar.classList.toggle('on', !!pendingPhoto);
    photoBar.replaceChildren(...(pendingPhoto ? [
      h('img', { class: 'np-thumb', src: pendingPhoto.url, alt: '' }),
      h('div', { class: 'rb-body' }, h('div', { class: 'q-name' }, t('notesPhotoReady')), h('div', { class: 'q-text' }, t('notesPhotoHint'))),
      h('button', { type: 'button', class: 'rb-close', onclick: () => setPendingPhoto(null) }, '✕'),
    ] : []));
    syncInput();
  }

  function setEditing(id) {
    editing = id;
    const n = id != null ? byId(id) : null;
    editBar.classList.toggle('on', !!n);
    editBar.replaceChildren(...(n ? [
      h('span', { class: 'rb-icon', html: ICONS.edit }),
      h('div', { class: 'rb-body' }, h('div', { class: 'q-name' }, t('notesEditing')), h('div', { class: 'q-text' }, noteSnippet(n))),
      h('button', { type: 'button', class: 'rb-close', onclick: () => { setEditing(null); input.value = ''; syncInput(); } }, '✕'),
    ] : []));
    if (n) { input.value = n.text || ''; syncInput(); input.focus(); }
  }

  async function doSend() {
    const text = input.value.replace(/\s+$/, '').replace(/^\n+/, '');
    if (editing != null) {
      const n = byId(editing);
      if (n) {
        if (!text && !n.photo) { flashMsg(t('typeFirst')); return; }
        if (text !== n.text) { n.text = text; n.edited = true; await saveNotes(data); }
      }
      setEditing(null);
    } else {
      if (!text.trim() && !pendingPhoto) { vibrate([30]); flashMsg(t('typeFirst')); input.focus(); return; }
      const n = { id: ++data.seq, ts: Date.now(), text: text.trim() ? text : '' };
      if (pendingPhoto) { await saveAsset('note|' + n.id, pendingPhoto.blob); n.photo = true; }
      data.items.push(n);
      await saveNotes(data);
      setPendingPhoto(null);
    }
    input.value = '';
    syncInput();
    await renderAll();
  }

  // ---------- Долгое нажатие на заметку – меню ----------
  function openMenu(holder) {
    const id = +holder.dataset.id;
    const n = byId(id);
    if (!n) return;
    const r = holder.getBoundingClientRect();
    const act = (icon, label, fn, cls = '') => h('button', { type: 'button', class: cls, onclick: () => { close(); fn(); } }, h('span', { html: ICONS[icon] }), label);
    const actions = h('div', { class: 'react-actions' },
      n.text ? act('copy', t('reactCopy'), () => {
        navigator.clipboard?.writeText(n.text).then(() => flashMsg(t('copied'))).catch(() => {});
      }) : null,
      act('edit', t('notesEdit'), () => setEditing(id)),
      act('pin', data.pin === id ? t('unpinAction') : t('pinAction'), async () => {
        data.pin = data.pin === id ? null : id;
        await saveNotes(data);
        drawPinBar();
        flashMsg(data.pin === id ? t('pinned') : t('unpinned'));
      }),
      act('trash', t('deleteChat'), () => removeNote(id), 'danger'));
    const pop = h('div', { class: 'react-pop' }, actions);
    const back = h('div', { class: 'menu-back react-back', onclick: (e) => { if (e.target === back) close(); } }, pop);
    let closed = false;
    function close(fromBack) {
      if (closed) return;
      closed = true;
      back.remove(); holder.classList.remove('lifted');
      if (fromBack !== true) popOverlay(close);
    }
    document.body.append(back);
    pushOverlay(close);
    holder.classList.add('lifted');
    const h_ = pop.offsetHeight;
    pop.style.top = Math.max(70, Math.min(window.innerHeight - h_ - 12, r.bottom + 6)) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    vibrate([15]);
  }

  async function removeNote(id) {
    const ok = await askYesNo(t('notesDeleteTitle'), t('notesDeleteText'), { yes: t('yes'), no: t('no'), danger: true });
    if (!ok) return;
    const i = data.items.findIndex((n) => n.id === id);
    if (i < 0) return;
    if (data.items[i].photo) await removeAsset('note|' + id);
    data.items.splice(i, 1);
    if (data.pin === id) data.pin = null;
    if (editing === id) { setEditing(null); input.value = ''; syncInput(); }
    await saveNotes(data);
    await renderAll();
  }

  // ---------- Жесты: долгое нажатие – меню; свайп вправо – назад ----------
  let g = null;
  chat.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0 || e.target.closest('.bottom, .top, .pin-bar')) return;
    const holder = e.target.closest('.bubble[data-id]');
    g = { x: e.clientX, y: e.clientY, t: performance.now(), mode: null, dx: 0 };
    if (holder) g.timer = setTimeout(() => { if (g && !g.mode) { g = null; openMenu(holder); } }, LONG_PRESS);
  });
  chat.addEventListener('pointermove', (e) => {
    if (!g) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 10) return;
      clearTimeout(g.timer);
      g.mode = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.4 ? 'back' : 'none';
    }
    g.dx = dx;
    if (g.mode === 'back') { chat.style.transition = 'none'; chat.style.transform = `translateX(${Math.max(0, dx)}px)`; }
  });
  const end = () => {
    if (!g) return;
    clearTimeout(g.timer);
    if (g.mode === 'back') {
      const W = chat.clientWidth, quick = performance.now() - g.t < 250;
      chat.style.transition = 'transform .22s ease-out';
      if (g.dx > W * 0.33 || (quick && g.dx > 60)) { chat.style.transform = `translateX(${W}px)`; setTimeout(() => onExit(), 200); }
      else chat.style.transform = '';
    }
    g = null;
  };
  chat.addEventListener('pointerup', end);
  chat.addEventListener('pointercancel', () => {
    if (g && g.mode === 'back') { chat.style.transition = 'transform .2s'; chat.style.transform = ''; }
    if (g) clearTimeout(g.timer);
    g = null;
  });
  feed.addEventListener('contextmenu', (e) => { if (e.target.closest('.bubble')) e.preventDefault(); });

  syncInput();
  await renderAll();
}

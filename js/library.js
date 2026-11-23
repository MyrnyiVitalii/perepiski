// Экран «Истории» – список всех историй, как список чатов в мессенджере.
import { h, iconBtn, avatar, ICONS, askYesNo } from './ui.js';
import { loadNotes, savedAvatar, noteSnippet } from './notes.js';
import { t, plural } from './i18n.js';
import { db } from './storage.js';
import { settings, openSettings, emo } from './settings.js';

function lastText(log) {
  for (let i = log.length - 1; i >= 0; i--) {
    const it = log[i];
    if (it.t !== 'msg') continue;
    const who = it.me ? '' : it.who + ': ';
    if (it.kind === 'photo') return who + '🖼 ' + (it.text || t('photo'));
    if (it.kind === 'sticker') return who + t('sticker');
    if (it.kind === 'deleted') return who + t('deleted');
    return who + it.text;
  }
  return '';
}

export async function renderLibrary(root, records, { onOpen, onDelete, onOpenNotes }) {
  openRow = null;
  const title = h('h1', {}, settings.appName);
  const head = h('div', { class: 'lib-head' }, title, iconBtn('gear', () => openSettings(() => { title.textContent = settings.appName; })));

  const listEl = h('div', { class: 'lib-list' });
  root.replaceChildren(h('div', { class: 'library' }, head, listEl));

  // «Избранное» – всегда первым и закреплено (как в Telegram), удалить нельзя
  const notes = await loadNotes();
  const lastNote = notes.items[notes.items.length - 1];
  listEl.append(h('div', { class: 'story-row' }, h('button', { class: 'story saved', type: 'button', onclick: () => onOpenNotes() },
    savedAvatar(),
    h('div', { class: 'story-body' },
      h('div', { class: 'story-title' }, h('span', {}, t('savedTitle')), h('span', { class: 'pin-mark', html: ICONS.pin })),
      h('div', { class: 'story-sub' }, emo(noteSnippet(lastNote) || t('savedSub'))),
      h('div', { class: 'story-progress' }, notes.items.length ? plural('notesCount', notes.items.length) : ' ')))));

  if (!records.length) { listEl.append(h('div', { class: 'lib-empty' }, t('emptyLibrary'))); return; }

  for (const r of records) {
    const st = r.story;
    let prog = null;
    try { prog = await db.get('progress', r.id); } catch (e) { /* нет */ }
    if (prog && r.sig && prog.sig !== r.sig) prog = null;
    const log = prog?.state?.log || [];
    let progressText = t('progressNew');
    if (prog?.state?.ended != null) progressText = t('progressEnded', { title: prog.state.ended || t('endTitle') });
    else if (log.length) progressText = t('progressMessages', { n: log.filter((x) => x.t === 'msg').length });

    let avaUrl = '';
    try {
      const blob = await db.get('assets', `av|${r.id}|__chat__`);
      if (blob) avaUrl = URL.createObjectURL(blob);
    } catch (e) { /* нет */ }
    if (!avaUrl) avaUrl = r.resolve(st.chatAvatar || (st.others[0] && st.characters[st.others[0]].avatar));

    const row = h('div', { class: 'story-row' });
    const delBtn = h('button', { type: 'button', class: 'story-del', html: ICONS.trash, onclick: () => askDelete(r, row) }, t('deleteChat'));
    const item = h('button', { class: 'story', type: 'button', onclick: () => {
      if (row.dataset.justDragged) return;
      if (openRow) { closeRow(); return; }
      onOpen(r);
    } },
      avatar(avaUrl, st.title, '#5c6bc0'),
      h('div', { class: 'story-body' },
        h('div', { class: 'story-title' }, h('span', {}, st.title), r.isDemo ? h('span', { class: 'badge' }, t('demoBadge')) : null),
        h('div', { class: 'story-sub' }, emo(lastText(log) || st.description || '')),
        h('div', { class: 'story-progress' }, progressText)),
    );
    row.append(delBtn, item);
    swipeRow(row, item);
    listEl.append(row);
  }

  async function askDelete(r, row) {
    const ok = await askYesNo(t('deleteChatTitle'), t('deleteChatText', { title: r.story.title }), { yes: t('yes'), no: t('no'), danger: true });
    if (!ok) { closeRow(); return; }
    openRow = null;
    row.style.maxHeight = row.offsetHeight + 'px';
    row.classList.add('removing');
    requestAnimationFrame(() => { row.style.maxHeight = '0px'; });
    await onDelete(r);
    setTimeout(() => {
      row.remove();
      if (!listEl.querySelector('.story-row .story:not(.saved)')) listEl.append(h('div', { class: 'lib-empty' }, t('emptyLibrary')));
    }, 260);
  }
}

// ---------- Свайп строки влево – показать кнопку «Удалить» ----------
const DEL_W = 88;
let openRow = null; // { row, item } – открытая строка (открыта только одна)

function closeRow() {
  if (!openRow) return;
  openRow.item.style.transform = '';
  openRow = null;
}

function swipeRow(row, item) {
  let st = null;
  row.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.story-del')) return;
    if (openRow && openRow.row !== row) closeRow();
    const base = openRow && openRow.row === row ? -DEL_W : 0;
    st = { x: e.clientX, y: e.clientY, base, dx: 0, horiz: null };
  });
  row.addEventListener('pointermove', (e) => {
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (st.horiz == null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      st.horiz = Math.abs(dx) > Math.abs(dy);
      if (!st.horiz) { st = null; return; }
      row.classList.add('dragging');
      try { row.setPointerCapture(e.pointerId); } catch (err) { /* нет */ }
    }
    st.dx = dx;
    const x = Math.min(0, Math.max(-DEL_W * 1.3, st.base + dx));
    item.style.transform = `translateX(${x}px)`;
  });
  const end = () => {
    if (!st) return;
    const was = st;
    st = null;
    row.classList.remove('dragging');
    if (!was.horiz) return;
    // после перетаскивания не открываем чат по случайному «клику»
    row.dataset.justDragged = '1';
    setTimeout(() => { delete row.dataset.justDragged; }, 60);
    const x = was.base + was.dx;
    if (x < -DEL_W / 2) {
      item.style.transform = `translateX(${-DEL_W}px)`;
      openRow = { row, item };
    } else {
      item.style.transform = '';
      if (openRow && openRow.row === row) openRow = null;
    }
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', () => {
    if (!st) return;
    if (st.horiz) { end(); return; }
    st = null;
  });
}

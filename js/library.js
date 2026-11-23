// Экран «Истории» — список всех историй, как список чатов в мессенджере.
import { h, iconBtn, avatar } from './ui.js';
import { t } from './i18n.js';
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

export async function renderLibrary(root, records, { onOpen }) {
  const title = h('h1', {}, settings.appName);
  const head = h('div', { class: 'lib-head' }, title, iconBtn('gear', () => openSettings(() => { title.textContent = settings.appName; })));

  const listEl = h('div', { class: 'lib-list' });
  root.replaceChildren(h('div', { class: 'library' }, head, listEl));

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

    listEl.append(h('button', { class: 'story', type: 'button', onclick: () => onOpen(r) },
      avatar(avaUrl, st.title, '#5c6bc0'),
      h('div', { class: 'story-body' },
        h('div', { class: 'story-title' }, h('span', {}, st.title), r.isDemo ? h('span', { class: 'badge' }, t('demoBadge')) : null),
        h('div', { class: 'story-sub' }, emo(lastText(log) || st.description || '')),
        h('div', { class: 'story-progress' }, progressText)),
    ));
  }
}

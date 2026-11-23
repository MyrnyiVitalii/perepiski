// Экран «Истории» — список всех историй, как список чатов в мессенджере, и кнопка съёмки.
import { h, iconBtn, avatar, flashMsg } from './ui.js';
import { t } from './i18n.js';
import { db } from './storage.js';
import { settings, saveSettings, openSettings, emo } from './settings.js';

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

const standalone = () => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

// Отсчёт 3, 2, 1 перед съёмкой
function countdown() {
  return new Promise((resolve) => {
    const num = h('div', { class: 'cd-num' }, '3');
    const box = h('div', { class: 'countdown' }, num);
    document.body.append(box);
    const steps = ['3', '2', '1', t('recGo')];
    let i = 0;
    const tick = () => {
      num.textContent = steps[i];
      num.classList.toggle('go', i === steps.length - 1);
      num.classList.remove('beat'); void num.offsetWidth; num.classList.add('beat');
      i += 1;
      if (i < steps.length) setTimeout(tick, 1000);
      else setTimeout(() => { box.remove(); resolve(); }, 700);
    };
    tick();
  });
}

async function startRecording(rerender) {
  // Полный экран (без адресной строки), если приложение открыто в браузере
  if (!standalone() && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  await countdown();
  settings.recording = true;
  await saveSettings();
  rerender();
}

async function stopRecording(rerender) {
  settings.recording = false;
  await saveSettings();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  flashMsg(t('recordOff'));
  rerender();
}

export async function renderLibrary(root, records, { onOpen }) {
  const rerender = () => renderLibrary(root, records, { onOpen });
  const title = h('h1', {}, settings.appName);
  const head = h('div', { class: 'lib-head' }, title, iconBtn('gear', () => openSettings(() => { title.textContent = settings.appName; })));

  const rec = settings.recording
    ? h('div', { class: 'rec-banner' },
      h('div', { class: 'rec-info' },
        h('div', { class: 'rec-title' }, h('span', { class: 'rec-dot' }), t('recBanner')),
        h('div', { class: 'rec-hint' }, t('recBannerHint'))),
      h('button', { type: 'button', class: 'rec-stop', onclick: () => stopRecording(rerender) }, t('recStop')))
    : h('button', { type: 'button', class: 'rec-start', onclick: () => startRecording(rerender) },
      h('span', { class: 'rec-dot' }), t('recStart'));

  const listEl = h('div', { class: 'lib-list' });
  root.replaceChildren(h('div', { class: 'library' }, head, rec, listEl));

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

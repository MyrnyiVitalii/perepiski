// Экран чата: лента сообщений, тапы, «печатает…», выборы, меню, настройки чата.
import { h, ICONS, iconBtn, avatar, flashMsg, sheet, viewer, pushOverlay, popOverlay } from './ui.js';
import { t, plural } from './i18n.js';
import { Engine, snippet } from './engine.js';
import { db } from './storage.js';
import { settings, saveSettings, paintChatBg, themeSection, backgroundSection, togglesSection, soundSection, emo, hiddenBySettings } from './settings.js';
import { pickImage, makeAvatar, saveAsset, assetUrl, removeAsset, LIMITS } from './images.js';
import { play, vibrate, vibrateForEffect, unlockAudio } from './sounds.js';
import { signalGlitch } from './fx.js';

const TAP_MAX_MOVE = 10;     // пикселей: если палец сдвинулся больше — это прокрутка, а не тап
const TAP_MAX_TIME = 350;    // миллисекунд: дольше — это долгое нажатие (выделение текста)
const LONG_PRESS = 450;      // миллисекунд: долгое нажатие на сообщение — реакции
const CHAT_KEY = '__chat__'; // ключ для фото самого чата
const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '😱', '🔥', '👎'];

export const carryKey = (series, episode) => `carry|${series.toLowerCase()}|${episode}`;

export async function openChat(root, rec, { onExit, onNext }) {
  const { story, resolve } = rec;
  let saved = null;
  try { saved = await db.get('progress', rec.id); } catch (e) { /* нет сохранения */ }
  if (saved && rec.sig && saved.sig !== rec.sig) saved = null; // историю изменили — начинаем с начала
  // Серия 2, 3…: доверие и «запомненное» приходят из конца прошлой серии
  let carry = null;
  if (story.series && story.episode > 1) {
    try { carry = await db.get('progress', carryKey(story.series, story.episode)); } catch (e) { /* нет */ }
  }
  const engine = new Engine(story, saved, carry);
  if (!engine.state.myReact) engine.state.myReact = {};

  // Фото, которые пользователь поставил сам, важнее фото из истории
  const avKey = (name) => `av|${rec.id}|${name}`;
  const custom = new Map();
  for (const name of [...story.charOrder, CHAT_KEY]) {
    const u = await assetUrl(avKey(name));
    if (u) custom.set(name, u);
  }
  const char = (name) => story.characters[name] || { name, color: '#90a4ae', avatar: '', about: '' };
  const avaUrl = (name) => custom.get(name) || resolve(char(name).avatar);
  const avaOf = (name) => { const c = char(name); return avatar(avaUrl(name), c.name, c.color); };
  const chatAvaUrl = () => custom.get(CHAT_KEY) || resolve(story.chatAvatar);
  const headAvatar = () => (story.isGroup
    ? avatar(chatAvaUrl(), story.chatTitle, '#5c6bc0')
    : avaOf(story.others[0] || story.chatTitle));

  // ---------- Каркас экрана ----------
  const titleEl = h('div', { class: 'top-title' }, story.chatTitle);
  const subEl = h('div', { class: 'top-sub' });
  let headAva = headAvatar();
  // Нажатие на аватарку или название чата — информация о чате (как в Telegram)
  const titles = h('div', { class: 'top-titles', onclick: () => openChatInfo() }, titleEl, subEl);
  const top = h('header', { class: 'top' },
    iconBtn('back', () => onExit()), headAva, titles,
    iconBtn('people', openTrust, 'hide-rec'),
    iconBtn('dots', openMenu, 'hide-rec'),
  );
  headAva.addEventListener('click', () => openChatInfo());
  // Закреплённое сообщение под шапкой
  const pinBar = h('div', { class: 'pin-bar' });
  const list = h('div', { class: 'feed-list' });
  const feed = h('div', { class: 'feed' }, list);
  // Кнопка «вниз» с числом новых сообщений
  const downCount = h('span', { class: 'down-count' });
  const downBtn = h('button', { type: 'button', class: 'down-btn', onclick: () => { scrollDown(true); } },
    h('span', { html: ICONS.down }), downCount);
  const replyBar = h('div', { class: 'reply-bar' });
  const bottom = h('div', { class: 'bottom' });
  const toasts = h('div', { class: 'toasts' });
  const bgLayer = h('div', { class: 'chat-bg' });
  // Фоны сцен ([фон ...]): два слоя, чтобы новый фон плавно проявлялся поверх старого
  const sceneA = h('div', { class: 'scene-bg' });
  const sceneB = h('div', { class: 'scene-bg' });
  const sceneShade = h('div', { class: 'scene-shade' });
  const chat = h('div', { class: 'chat' + (settings.recording ? ' rec' : '') },
    bgLayer, h('div', { class: 'chat-shade' }), sceneA, sceneB, sceneShade, top, pinBar, feed, downBtn, replyBar, bottom, toasts);
  root.replaceChildren(chat);
  paintChatBg(bgLayer);

  let sceneFront = sceneA, sceneCur = null;
  function applySceneBg(instant) {
    const file = settings.sceneBgs ? engine.state.bg : '';
    const url = file ? resolve(file) : '';
    if (url === sceneCur) return;
    sceneCur = url;
    const back = sceneFront === sceneA ? sceneB : sceneA;
    if (!url) {
      sceneA.classList.remove('on'); sceneB.classList.remove('on'); sceneShade.classList.remove('on');
      return;
    }
    back.style.transition = instant ? 'none' : '';
    back.style.backgroundImage = `url("${url}")`;
    void back.offsetWidth;
    back.classList.add('on');
    sceneFront.classList.remove('on');
    sceneShade.classList.add('on');
    sceneFront = back;
  }

  const idleSub = () => (story.isGroup ? plural('members', story.charOrder.length) : '');
  const setSub = (text, typing = false) => { subEl.textContent = text; subEl.classList.toggle('typing', typing); };
  setSub(idleSub());

  const save = () => db.set('progress', rec.id, { ...engine.serialize(), sig: rec.sig }).catch(() => {});

  // ---------- Рисование сообщений ----------
  const rows = new Map();

  function metaEl(item, read) {
    const m = h('span', { class: 'meta' },
      isEdited(item) ? h('span', { class: 'edited' }, t('edited')) : null,
      h('span', { class: 'tm' }, item.time));
    if (item.me) m.insertAdjacentHTML('beforeend', `<span class="tick">${read ? ICONS.tick2 : ICONS.tick1}</span>`);
    return m;
  }

  // Исправления сообщений ([изменить Аня: …]): берём самый свежий текст
  function editOf(id) {
    let last = null;
    for (const it of engine.state.log) if (it.t === 'edit' && it.target === id) last = it;
    return last;
  }
  const isEdited = (item) => item.edited || !!editOf(item.id);
  const textOf = (item) => { const e = editOf(item.id); return e ? e.text : item.text; };

  // Оформление текста как в Telegram: **жирный**, __курсив__, ~~зачёркнутый~~, ||спойлер||
  // ||текст|| — обычный спойлер, ||!текст|| — «страшный»: при открытии удар, тряска, вспышка, вибрация.
  // Открытые спойлеры запоминаются (key = номер сообщения + номер спойлера в нём).
  function rich(str, itemId = 0) {
    const frag = document.createDocumentFragment();
    const re = /(\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\|\|([^|]+)\|\|)/g;
    let last = 0, m, n = 0;
    str = emo(str || '');
    while ((m = re.exec(str))) {
      if (m.index > last) frag.append(str.slice(last, m.index));
      if (m[2]) frag.append(h('b', {}, m[2]));
      else if (m[3]) frag.append(h('i', {}, m[3]));
      else if (m[4]) frag.append(h('s', {}, m[4]));
      else if (m[5]) {
        const scary = m[5].startsWith('!');
        const key = `${itemId}:${n++}`;
        const sp = h('span', { class: 'spoiler' + (isOpen(key) ? ' open' : '') }, scary ? m[5].slice(1) : m[5]);
        sp.addEventListener('click', (e) => {
          e.stopPropagation();
          if (sp.classList.contains('open')) return;
          sp.classList.add('open', 'opening');
          setOpen(key);
          reveal(scary);
        });
        frag.append(sp);
      }
      last = m.index + m[0].length;
    }
    if (last < str.length) frag.append(str.slice(last));
    return frag;
  }

  // Что открыто: спойлеры и скрытые фото
  const isOpen = (key) => !!(engine.state.opened && engine.state.opened[key]);
  function setOpen(key) {
    if (!engine.state.opened) engine.state.opened = {};
    engine.state.opened[key] = true;
    save();
  }
  // Что происходит при открытии скрытого
  function reveal(scary) {
    if (scary) {
      play('удар');
      runEffects(['тряска', 'вспышка']);
    } else {
      play('реакция', { auto: true });
      vibrate([20]);
    }
  }

  // Цитата сверху сообщения (ответ на сообщение), нажатие — прокрутить к нему
  function quoteEl(id) {
    const it = engine.state.log.find((x) => x.id === id);
    if (!it) return null;
    const c = char(it.who);
    return h('div', { class: 'quote', style: { borderColor: c.color }, onclick: (e) => { e.stopPropagation(); jumpTo(id); } },
      h('div', { class: 'q-name', style: { color: c.color } }, it.who),
      h('div', { class: 'q-text' }, emo(snippet({ ...it, text: textOf(it) }))));
  }

  function jumpTo(id) {
    const row = rows.get(id);
    if (!row) return;
    stick = false;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  }

  function imgEl(file, item) {
    const url = resolve(file);
    if (!url) return h('div', { class: 'photo-missing' }, `${t('photo')}: ${file}`);
    const img = h('img', { src: url, alt: '', draggable: 'false' });
    img.addEventListener('load', () => { if (nearBottom()) scrollDown(false); });
    // Скрытое фото (как в Telegram): размыто и в «шуме», первое нажатие открывает, второе — на весь экран
    if (item && item.hidden) {
      const key = `${item.id}:photo`;
      const box = h('div', { class: 'photo-spoiler' + (isOpen(key) ? ' open' : '') }, img,
        h('div', { class: 'ps-noise' }), h('div', { class: 'ps-label' }, t('tapToOpen')));
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        if (box.classList.contains('open')) { viewer(url); return; }
        box.classList.add('open', 'opening');
        setOpen(key);
        reveal(item.hidden === 'scary');
      });
      return box;
    }
    img.addEventListener('click', () => viewer(url));
    return img;
  }

  function videoEl(file) {
    const url = resolve(file);
    if (!url) return h('div', { class: 'photo-missing' }, `${t('video')}: ${file}`);
    const v = h('video', { src: url + '#t=0.1', muted: true, playsinline: true, preload: 'metadata' });
    v.addEventListener('loadedmetadata', () => { if (nearBottom()) scrollDown(false); });
    return h('div', { class: 'video-box', onclick: () => viewer(url, true) }, v, h('div', { class: 'play-icon' }, '▶'));
  }

  function renderItem(item, prev, next, read, animate) {
    if (hiddenBySettings(item)) return null;
    // Фото или видео выключены, но есть подпись — показываем только подпись
    if (item.t === 'msg' && ((item.kind === 'photo' && !settings.showPhotos) || (item.kind === 'video' && !settings.showVideos))) {
      item = { ...item, kind: 'text' };
    }
    if (item.t === 'date' || item.t === 'system') {
      return h('div', { class: 'sys' + (animate ? ' new' : '') }, rich(item.text));
    }
    if (item.t === 'end') {
      const isEpisode = !!story.series;
      return h('div', { class: 'endcard' },
        h('div', { class: 'end-big' }, isEpisode ? t('episodeEnd', { n: story.episode }) : t('endTitle')),
        item.title ? h('div', { class: 'end-name' }, emo(item.title)) : null,
        h('div', { class: 'end-btns col' },
          rec.next ? h('button', { type: 'button', class: 'primary', onclick: () => onNext && onNext(rec.next) }, t('nextEpisode')) : null,
          h('button', { type: 'button', class: rec.next ? '' : 'primary', onclick: showToBeContinued }, t('tbcButton')),
          h('div', { class: 'end-row' },
            h('button', { type: 'button', onclick: restart }, t('endRestart')),
            h('button', { type: 'button', onclick: onExit }, t('endLibrary')))),
      );
    }
    const runStart = !(prev && prev.t === 'msg' && prev.who === item.who);
    const runEnd = !(next && next.t === 'msg' && next.who === item.who);
    const row = h('div', { class: `row ${item.me ? 'out' : 'in'}${runStart ? ' run-start' : ''}${runEnd ? ' run-end' : ''}${animate ? ' new' : ''}` });
    if (!item.me && story.isGroup) row.append(runEnd ? avaOf(item.who) : h('div', { class: 'ava spacer' }));

    const c = char(item.who);
    const nameEl = (!item.me && story.isGroup && runStart) ? h('div', { class: 'name', style: { color: c.color } }, item.who) : null;
    // «Переслано от …» и цитата ответа — над текстом, как в Telegram
    const fwdEl = item.forwarded ? h('div', { class: 'fwd' }, t('forwardedFrom'), h('b', {}, item.forwarded)) : null;
    const replyId = item.reply ?? engine.state.myReply?.[item.id];
    const qEl = replyId ? quoteEl(replyId) : null;
    const text = textOf(item);

    if (item.kind === 'sticker') {
      row.append(h('div', { class: 'sticker' }, nameEl, imgEl(item.file), metaEl(item, read)));
    } else if (item.kind === 'photo' || item.kind === 'video') {
      const media = item.kind === 'photo' ? imgEl(item.file, item) : videoEl(item.file);
      const b = h('div', { class: 'bubble photo' + (text ? '' : ' no-caption') }, nameEl, fwdEl, qEl, media);
      if (text) b.append(h('div', { class: 'caption text' }, rich(text, item.id), metaEl(item, read)));
      else b.append(metaEl(item, read));
      row.append(b);
    } else if (item.kind === 'deleted') {
      row.append(h('div', { class: 'bubble' }, nameEl, h('div', { class: 'text deleted' }, emo('🚫 ' + t('deleted')), metaEl(item, read))));
    } else {
      row.append(h('div', { class: 'bubble' }, nameEl, fwdEl, qEl, h('div', { class: 'text' }, rich(text, item.id), metaEl(item, read))));
    }
    const holder = row.querySelector('.bubble, .sticker');
    holder.dataset.id = item.id;
    holder.append(h('div', { class: 'reacts' }));
    rows.set(item.id, row);
    drawReacts(item.id, false);
    return row;
  }

  // ---------- Реакции ----------
  // Реакции героев приходят из истории ([реакция Аня 😱]), моя — долгим нажатием или двойным тапом
  function reactsFor(id) {
    const out = [];
    for (const it of engine.state.log) if (it.t === 'react' && it.target === id) out.push({ who: it.who, emoji: it.emoji });
    const mine = engine.state.myReact[id];
    if (mine) out.push({ who: story.me, emoji: mine, me: true });
    return out;
  }

  function drawReacts(id, animate) {
    const row = rows.get(id);
    const box = row && row.querySelector('.reacts');
    if (!box) return;
    box.replaceChildren();
    if (!settings.showEmoji) return;
    // одинаковые эмодзи складываем в одну «таблетку»
    const groups = new Map();
    for (const r of reactsFor(id)) {
      if (!groups.has(r.emoji)) groups.set(r.emoji, []);
      groups.get(r.emoji).push(r);
    }
    for (const [emoji, list_] of groups) {
      const chip = h('span', { class: 'react' + (list_.some((r) => r.me) ? ' mine' : '') + (animate ? ' pop' : '') }, h('span', { class: 'r-emoji' }, emoji));
      if (story.isGroup && list_.length <= 2) list_.forEach((r) => { const a = avaOf(r.who); a.classList.add('r-ava'); chip.append(a); });
      else if (list_.length > 1) chip.append(h('span', { class: 'r-count' }, String(list_.length)));
      box.append(chip);
    }
  }

  function setMyReaction(id, emoji) {
    const cur = engine.state.myReact[id];
    if (cur === emoji) delete engine.state.myReact[id];
    else engine.state.myReact[id] = emoji;
    save();
    drawReacts(id, true);
    play('реакция', { auto: true });
  }

  function openReactPicker(holder) {
    const id = +holder.dataset.id;
    const r = holder.getBoundingClientRect();
    const item = engine.state.log.find((x) => x.id === id);
    const bar = h('div', { class: 'react-bar' },
      ...REACTIONS.map((e) => h('button', { type: 'button', class: 'rb-emoji', onclick: () => { close(); setMyReaction(id, e); } }, e)));
    const pinnedNow = currentPin() === id;
    const act = (icon, label, fn) => h('button', { type: 'button', onclick: () => { close(); fn(); } }, h('span', { html: ICONS[icon] }), label);
    const actions = h('div', { class: 'react-actions' },
      item && !item.me ? act('reply', t('replyAction'), () => setReply(id)) : null,
      act('pin', pinnedNow ? t('unpinAction') : t('pinAction'), () => togglePin(id)),
      item && item.text ? act('copy', t('reactCopy'), () => {
        navigator.clipboard?.writeText(textOf(item).replace(/\*\*|__|~~|\|\|/g, '')).then(() => flashMsg(t('copied'))).catch(() => {});
      }) : null);
    const pop = h('div', { class: 'react-pop' }, bar, actions);
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
    const top_ = Math.max(70, r.top - 62);
    pop.style.top = top_ + 'px';
    const w = pop.offsetWidth;
    pop.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
    vibrate([15]);
  }

  // ---------- Жесты, как в Telegram ----------
  // Долгое нажатие — реакции и меню; двойной тап — ❤️;
  // свайп сообщения влево — ответить на него; свайп всего чата вправо — назад к списку историй.
  function attachGestures() {
    let g = null, lastTap = { id: null, t: 0 };
    const W = () => chat.clientWidth;
    chat.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button > 0) return;
      if (e.target.closest('.sheet-back, .menu-back, .choices button, .start-zone, input')) return;
      const holder = e.target.closest('.bubble[data-id], .sticker[data-id]');
      g = { x: e.clientX, y: e.clientY, t: performance.now(), holder, mode: null, dx: 0 };
      if (holder) g.timer = setTimeout(() => { if (g && !g.mode) { const h_ = g.holder; g = null; openReactPicker(h_); } }, LONG_PRESS);
    });
    chat.addEventListener('pointermove', (e) => {
      if (!g) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.mode) {
        if (Math.hypot(dx, dy) < TAP_MAX_MOVE) return;
        clearTimeout(g.timer);
        if (Math.abs(dx) > Math.abs(dy) * 1.4) {
          if (dx > 0 && !chat.classList.contains('rec-lock')) g.mode = 'back';
          else if (dx < 0 && g.holder && !engine.state.ended && g.holder.closest('.row.in')) g.mode = 'reply';
          else g.mode = 'none';
        } else g.mode = 'none';
      }
      g.dx = dx;
      if (g.mode === 'back') {
        chat.style.transition = 'none';
        chat.style.transform = `translateX(${Math.max(0, dx)}px)`;
      } else if (g.mode === 'reply') {
        const d = Math.max(-80, Math.min(0, dx));
        const row = g.holder.closest('.row');
        row.style.transition = 'none';
        row.style.transform = `translateX(${d}px)`;
        row.classList.toggle('reply-ready', d < -55);
      }
    });
    const end = (e) => {
      if (!g) return;
      clearTimeout(g.timer);
      const { mode, dx, holder } = g;
      const quick = performance.now() - g.t < 250;
      if (mode === 'back') {
        chat.style.transition = 'transform .22s ease-out';
        if (dx > W() * 0.33 || (quick && dx > 60)) {
          chat.style.transform = `translateX(${W()}px)`;
          setTimeout(() => onExit(), 200);
        } else chat.style.transform = '';
      } else if (mode === 'reply') {
        const row = holder.closest('.row');
        row.style.transition = 'transform .2s';
        row.style.transform = '';
        row.classList.remove('reply-ready');
        if (dx < -55) setReply(+holder.dataset.id);
      } else if (!mode && holder && e && e.type === 'pointerup' && !e.target.closest('img, video, .video-box, .spoiler, .quote')) {
        // двойной тап по сообщению — ❤️
        const id = +holder.dataset.id, now = performance.now();
        if (lastTap.id === id && now - lastTap.t < 320) { lastTap = { id: null, t: 0 }; setMyReaction(id, '❤️'); }
        else lastTap = { id, t: now };
      }
      g = null;
    };
    chat.addEventListener('pointerup', end);
    chat.addEventListener('pointercancel', (e) => {
      // браузер забрал жест себе (началась прокрутка) — возвращаем всё на место
      if (g && g.mode === 'back') { chat.style.transition = 'transform .2s'; chat.style.transform = ''; }
      if (g && g.mode === 'reply') { const r = g.holder.closest('.row'); r.style.transform = ''; r.classList.remove('reply-ready'); }
      if (g) clearTimeout(g.timer);
      g = null;
    });
    feed.addEventListener('contextmenu', (e) => { if (e.target.closest('.bubble, .sticker')) e.preventDefault(); });
  }

  // ---------- Ответ на сообщение (свайп влево или «Ответить» в меню) ----------
  let replyTo = null;
  function setReply(id) {
    const it = engine.state.log.find((x) => x.id === id);
    if (!it) return;
    replyTo = id;
    vibrate([12]);
    drawReplyBar();
  }
  function drawReplyBar() {
    const it = replyTo && engine.state.log.find((x) => x.id === replyTo);
    if (!it) { replyTo = null; replyBar.replaceChildren(); replyBar.classList.remove('on'); return; }
    const c = char(it.who);
    replyBar.replaceChildren(
      h('span', { class: 'rb-icon', html: ICONS.reply }),
      h('div', { class: 'rb-body', style: { borderColor: c.color } },
        h('div', { class: 'q-name', style: { color: c.color } }, t('replyTo', { name: it.who })),
        h('div', { class: 'q-text' }, emo(snippet({ ...it, text: textOf(it) })))),
      h('button', { type: 'button', class: 'rb-close', onclick: () => { replyTo = null; drawReplyBar(); } }, '✕'));
    replyBar.classList.add('on');
  }

  // ---------- Закреплённое сообщение ----------
  // Закреп из истории ([закрепить]) или свой (долгое нажатие → «Закрепить»)
  function currentPin() {
    const s = engine.state;
    if (s.myPin === 0) return null; // своё «открепить»
    return s.myPin ?? s.pinned ?? null;
  }
  function togglePin(id) {
    engine.state.myPin = currentPin() === id ? 0 : id;
    save();
    drawPinBar();
    flashMsg(engine.state.myPin ? t('pinned') : t('unpinned'));
  }
  function drawPinBar() {
    const id = currentPin();
    const it = id && engine.state.log.find((x) => x.id === id);
    if (!it) { pinBar.replaceChildren(); pinBar.classList.remove('on'); return; }
    pinBar.replaceChildren(
      h('div', { class: 'pb-line' }),
      h('div', { class: 'pb-body', onclick: () => jumpTo(id) },
        h('div', { class: 'pb-title' }, t('pinnedTitle')),
        h('div', { class: 'pb-text' }, emo(snippet({ ...it, text: textOf(it) })))),
      h('span', { class: 'pb-icon', html: ICONS.pin }));
    pinBar.classList.add('on');
  }

  // ---------- Кнопка «вниз» ----------
  let unseen = 0;
  function updateDownBtn() {
    const far = feed.scrollHeight - feed.scrollTop - feed.clientHeight > 250;
    if (!far) unseen = 0;
    downBtn.classList.toggle('on', far);
    downCount.textContent = unseen ? String(unseen) : '';
    downCount.classList.toggle('on', unseen > 0);
  }
  feed.addEventListener('scroll', updateDownBtn, { passive: true });

  // ---------- Информация о чате (нажатие на шапку) ----------
  function openChatInfo() {
    if (!story.isGroup) { openProfile(story.others[0]); return; }
    const big = avatar(chatAvaUrl(), story.chatTitle, '#5c6bc0');
    const box = h('div', { class: 'profile' },
      big,
      h('div', { class: 'p-name' }, emo(story.chatTitle)),
      h('div', { class: 'p-sub' }, plural('members', story.charOrder.length)),
      story.description ? h('div', { class: 'p-section' }, h('div', { class: 'p-label' }, t('chatAbout')), emo(story.description)) : null,
      h('div', { class: 'p-section members' }, h('div', { class: 'p-label' }, t('membersTitle')),
        ...story.charOrder.map((name) => {
          const c = char(name);
          return h('button', { type: 'button', class: 'member', onclick: () => { s.close(); openProfile(name); } },
            avaOf(name),
            h('div', { class: 'm-body' },
              h('div', { class: 'm-name', style: { color: c.color } }, name + (name === story.me ? ` (${t('you')})` : '')),
              h('div', { class: 'm-about' }, emo(c.about || ''))));
        })),
    );
    big.addEventListener('click', () => { const u = chatAvaUrl(); if (u) viewer(u); });
    const s = sheet(box);
  }

  // ---------- Конец серии: «Продолжение следует…» ----------
  // Чёрный экран не исчезает сам: надпись «дышит», а закрывается только нажатием
  function showToBeContinued() {
    const text = h('div', { class: 'tbc-text' }, t('toBeContinuedWord'), h('span', { class: 'tbc-dots' }, h('i', {}, '.'), h('i', {}, '.'), h('i', {}, '.')));
    const ov = h('div', { class: 'tbc' }, text);
    const shownAt = performance.now();
    let closed = false;
    const close = (fromBack) => {
      if (closed) return;
      closed = true;
      ov.remove();
      if (fromBack !== true) popOverlay(close);
    };
    // случайное касание в первую секунду не закрывает
    ov.addEventListener('click', () => { if (performance.now() - shownAt > 1000) close(); });
    document.body.append(ov);
    pushOverlay(close);
    play('финал');
  }

  async function saveCarry() {
    if (!story.series) return;
    const s = engine.state;
    try { await db.set('progress', carryKey(story.series, story.episode + 1), { trust: { ...s.trust }, flags: { ...s.flags } }); } catch (e) { /* нет */ }
  }

  function computeRead(log) {
    const read = new Set();
    let seenIncoming = false;
    for (let i = log.length - 1; i >= 0; i--) {
      const it = log[i];
      if (it.t !== 'msg') continue;
      if (!it.me) seenIncoming = true;
      else if (seenIncoming) read.add(it.id);
    }
    return read;
  }

  let gen = 0; // меняется при полной перерисовке, чтобы отменить незаконченную анимацию
  function renderAll() {
    gen += 1;
    cancelTyping();
    rows.clear();
    list.replaceChildren();
    titleEl.textContent = emo(story.chatTitle);
    const log = rowItems();
    const read = computeRead(log);
    log.forEach((it, i) => { const el = renderItem(it, log[i - 1], log[i + 1], read.has(it.id), false); if (el) list.append(el); });
    applySceneBg(true);
    if (engine.state.ended !== null) saveCarry();
    drawPinBar();
    drawReplyBar();
    renderBottom();
    setSub(idleSub());
    requestAnimationFrame(() => { scrollDown(false); updateDownBtn(); });
  }

  function refreshHeader() {
    const a = headAvatar();
    headAva.replaceWith(a);
    headAva = a;
  }

  // То, что рисуется отдельной строкой в ленте (реакции рисуются на сообщениях)
  const rowItems = () => engine.state.log.filter((it) => it.t !== 'react' && it.t !== 'edit' && !hiddenBySettings(it));

  // Перерисовать одно сообщение на месте (после исправления текста)
  function redrawRow(id, flash) {
    const old = rows.get(id);
    if (!old) return;
    const log = rowItems();
    const i = log.findIndex((x) => x.id === id);
    if (i < 0) return;
    const read = computeRead(log);
    const el = renderItem(log[i], log[i - 1], log[i + 1], read.has(id), false);
    old.replaceWith(el);
    if (flash) { el.classList.add('flash'); }
  }

  function appendItem(item) {
    if (hiddenBySettings(item)) return;
    if (item.t === 'react') {
      drawReacts(item.target, true);
      play('реакция', { auto: true });
      return;
    }
    if (item.t === 'edit') {
      redrawRow(item.target, true);
      play('реакция', { auto: true });
      return;
    }
    const log = rowItems();
    const prev = log[log.length - 2];
    if (prev && prev.t === 'msg' && item.t === 'msg' && prev.who === item.who) {
      const pr = rows.get(prev.id);
      if (pr) {
        pr.classList.remove('run-end');
        const a = pr.querySelector(':scope > .ava');
        if (a) a.replaceWith(h('div', { class: 'ava spacer' }));
      }
    }
    if (item.t === 'msg' && !item.me) {
      list.querySelectorAll('.row.out .tick').forEach((el) => { el.innerHTML = ICONS.tick2; });
    }
    const el = renderItem(item, prev, null, false, true);
    if (el) list.append(el);
    if (item.t === 'msg') play(item.me ? 'отправка' : 'уведомление', { auto: true });
    if (item.t === 'end') { saveCarry(); play('финал'); }
    if (item.t === 'system') drawPinBar();
    scrollDown(true);
  }

  const nearBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  // «Прилипание» к низу: если человек не листал вверх, лента всегда держится внизу,
  // даже когда снизу появляются высокие кнопки выбора
  let stick = true, autoUntil = 0;
  function scrollDown(smooth) {
    stick = true;
    autoUntil = performance.now() + 700;
    feed.scrollTo({ top: feed.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }
  feed.addEventListener('scroll', () => {
    if (performance.now() < autoUntil) return;
    stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  }, { passive: true });
  new ResizeObserver(() => { if (stick) feed.scrollTop = feed.scrollHeight; }).observe(feed);
  new ResizeObserver(() => { if (stick) feed.scrollTop = feed.scrollHeight; }).observe(list);

  // ---------- Нижняя панель: Start, поле ввода или кнопки выбора ----------
  let typeTimer = null;
  const isFresh = () => engine.state.log.length === 0 && engine.state.ended === null && !engine.state.atChoice;

  function fakeInputBar(extra = []) {
    return h('div', { class: 'inputbar' },
      h('div', { class: 'ib', html: ICONS.smile }),
      h('div', { class: 'fake-input' }, t('inputPlaceholder')),
      h('div', { class: 'ib', html: ICONS.clip }),
      h('div', { class: 'ib', html: ICONS.mic }),
      ...extra);
  }

  function renderBottom() {
    clearInterval(typeTimer);
    const choice = engine.currentChoice();
    if (isFresh()) {
      bottom.replaceChildren(h('div', { class: 'start-zone' },
        h('button', { class: 'start-btn', type: 'button', onclick: () => onTap(true) }, t('start'))));
    } else if (choice && choice.options.length === 1 && choice.options[0].text) {
      // Один вариант: текст сам «печатается» в поле ввода, нажатие — отправить
      const opt = choice.options[0];
      const field = h('div', { class: 'fake-input typed' });
      const send = h('div', { class: 'send-btn', html: ICONS.send });
      const bar = h('div', { class: 'inputbar choice-zone single', role: 'button', onclick: () => choose(0) },
        h('div', { class: 'ib', html: ICONS.smile }), field, send);
      bottom.replaceChildren(opt.desc ? h('div', { class: 'single-desc' }, `(${emo(opt.desc)})`) : '', bar);
      let i = 0;
      const full = emo(opt.text);
      typeTimer = setInterval(() => {
        i += Math.max(1, Math.ceil(full.length / 40));
        field.textContent = full.slice(0, i);
        if (i % 3 === 0) play('клавиша', { auto: true });
        if (i >= full.length) { clearInterval(typeTimer); send.classList.add('ready'); }
      }, 28);
    } else if (choice) {
      const box = h('div', { class: 'choices choice-zone' + (choice.options.length > 1 ? ' many' : '') });
      choice.options.forEach((o, i) => box.append(h('button', { class: 'choice', type: 'button', onclick: () => choose(i) },
        h('span', { class: 'choice-label' }, emo(o.label)),
        o.desc ? h('span', { class: 'choice-desc' }, `(${emo(o.desc)})`) : null)));
      bottom.replaceChildren(box);
    } else {
      bottom.replaceChildren(fakeInputBar());
    }
    requestAnimationFrame(() => { if (nearBottom()) scrollDown(false); });
  }

  // ---------- «печатает…» ----------
  let typing = null;
  function showTyping(who, seconds) {
    return new Promise((resolveP) => {
      const row = h('div', { class: 'row in run-start run-end new typing-row' });
      if (story.isGroup) row.append(avaOf(who));
      row.append(h('div', { class: 'bubble' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i'))));
      list.append(row);
      scrollDown(true);
      setSub(story.isGroup ? t('typing', { name: who }) + '…' : t('typing', { name: '' }).trim() + '…', true);
      const done = () => {
        clearTimeout(timer);
        row.remove();
        setSub(idleSub());
        typing = null;
        resolveP();
      };
      const timer = setTimeout(done, Math.max(0.3, seconds) * 1000);
      typing = { done };
    });
  }
  function cancelTyping() { if (typing) typing.done(); }

  // ---------- Эффекты и надписи ----------
  function runEffects(names) {
    for (const n of names) {
      vibrateForEffect(n);
      if (n.startsWith('тряс')) {
        chat.classList.remove('fx-shake'); void chat.offsetWidth; chat.classList.add('fx-shake');
        setTimeout(() => chat.classList.remove('fx-shake'), 600);
      } else if (n.startsWith('помех')) {
        // небольшая пауза, чтобы новое сообщение («… вступил в чат») успело появиться и тоже «сломалось»
        setTimeout(() => signalGlitch(chat), 120);
      } else if (n.startsWith('вспыш')) {
        const layer = h('div', { class: 'fx-layer fx-flash' });
        chat.append(layer);
        setTimeout(() => layer.remove(), 750);
      }
    }
  }

  function showToasts(items) {
    if (!settings.trustToast) return;
    items.filter((x) => x.who !== story.me).forEach((x, i) => {
      setTimeout(() => {
        const el = h('div', { class: 'toast' },
          h('span', { class: 'arrow ' + (x.delta >= 0 ? 'up' : 'down') }, x.delta >= 0 ? '▲' : '▼'),
          t('trustToast', { name: x.who }));
        toasts.append(el);
        setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2200);
      }, i * 350);
    });
  }

  // ---------- Тап по свободному месту ----------
  let busy = false;
  async function onTap(fromStart = false) {
    if (typing) { typing.done(); return; }
    if (busy) return;
    const s = engine.state;
    if (s.ended !== null) return;
    if (isFresh() && !fromStart) { pulse(bottom.querySelector('.start-btn')); return; }
    if (s.atChoice) { pulse(bottom.querySelector('.choice-zone')); return; }
    let ctx;
    try {
      ctx = engine.step();
      // Сообщение скрыто настройками (например, выключены фото) — сразу берём следующее
      while (ctx && ctx.item && hiddenBySettings(ctx.item) && !ctx.choice && s.ended === null) {
        const more = engine.step();
        if (!more) break;
        for (const k of ['effects', 'toasts', 'sounds', 'vibro']) more[k] = [...ctx[k], ...more[k]];
        more.bgChanged = more.bgChanged || ctx.bgChanged;
        ctx = more;
      }
    } catch (e) { flashMsg(e.message, 4000); return; }
    if (!ctx) return;
    save();
    if (fromStart) renderBottom();
    busy = true;
    const myGen = gen;
    try {
      if (ctx.bgChanged) applySceneBg(false);
      if (ctx.item) {
        const it = ctx.item;
        if (it.t === 'msg' && !it.me && settings.typing && ctx.typing) {
          await showTyping(ctx.typingWho, ctx.typing);
          if (myGen !== gen) return;
        }
        appendItem(it);
      }
      ctx.sounds.forEach((n) => play(n));
      ctx.vibro.forEach((p) => vibrate(p));
      runEffects(ctx.effects);
      showToasts(ctx.toasts);
      if (ctx.choice || s.ended !== null) renderBottom();
    } finally { busy = false; }
  }

  function pulse(el) {
    if (!el) return;
    el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge');
  }

  function choose(i) {
    if (typing || busy) return;
    const ctx = engine.choose(i);
    if (!ctx) return;
    // если перед этим смахнули сообщение — мой ответ будет с цитатой
    if (ctx.item && replyTo) ctx.item.reply = replyTo;
    replyTo = null;
    drawReplyBar();
    save();
    renderBottom();
    if (ctx.item) appendItem(ctx.item);
    ctx.vibro.forEach((p) => vibrate(p));
    runEffects(ctx.effects);
    showToasts(ctx.toasts);
  }

  // Защита от случайных нажатий: только короткий тап без сдвига пальца и без прокрутки
  function attachTap(el) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      unlockAudio();
      if (!e.isPrimary || e.button > 0) { down = null; return; }
      const sel = window.getSelection();
      down = { x: e.clientX, y: e.clientY, t: performance.now(), scroll: feed.scrollTop, hadSel: !!(sel && sel.toString()) };
    });
    el.addEventListener('pointermove', (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_MAX_MOVE) down.moved = true;
    });
    el.addEventListener('pointercancel', () => { down = null; });
    el.addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d || d.moved || d.hadSel) return;
      if (performance.now() - d.t > TAP_MAX_TIME) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE) return;
      if (Math.abs(feed.scrollTop - d.scroll) > 2) return;
      if (e.target.closest('.bubble:not(.typing-row .bubble), .sticker, button, a, input, .endcard, .choice-zone, .start-zone')) return;
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      onTap();
    });
  }
  attachTap(feed);
  attachTap(bottom);
  attachGestures();
  top.addEventListener('pointerdown', unlockAudio);

  // ---------- Меню ----------
  function openMenu() {
    let closed = false;
    const close = (fromBack) => { if (closed) return; closed = true; back.remove(); if (fromBack !== true) popOverlay(close); };
    const item = (icon, label, fn) => h('button', { type: 'button', onclick: () => { close(); fn(); } },
      h('span', { html: ICONS[icon] }), label);
    const menu = h('div', { class: 'menu' },
      item(settings.sound ? 'volume' : 'mute', settings.sound ? t('soundIsOn') : t('soundIsOff'), () => {
        settings.sound = !settings.sound;
        saveSettings();
        flashMsg(settings.sound ? t('soundIsOn') : t('soundIsOff'));
        if (settings.sound) play('уведомление');
      }),
      item('palette', t('chatSettings'), openChatSettings),
      item('restart', t('menuRestart'), () => { if (confirm(t('confirmRestart'))) restart(); }),
      item('undo', t('menuBackOne'), backOne),
      item('undoChoice', t('menuBackChoice'), backChoice),
    );
    const back = h('div', { class: 'menu-back', onclick: (e) => { if (e.target === back) close(); } }, menu);
    document.body.append(back);
    pushOverlay(close);
  }

  function restart() {
    engine.reset();
    save();
    renderAll();
  }
  function backOne() {
    if (!engine.backOne()) { flashMsg(t('nothingToUndo')); return; }
    // Скрытые настройками сообщения пропускаем и при откате
    const lastHidden = () => { const l = engine.state.log; return l.length && hiddenBySettings(l[l.length - 1]); };
    while (lastHidden() && engine.snapshots.length) engine.backOne();
    save(); renderAll();
  }
  function backChoice() {
    if (!engine.backChoice()) { flashMsg(t('noPrevChoice')); return; }
    save(); renderAll();
  }

  // ---------- Смена фото героя или чата ----------
  async function changePhoto(name) {
    const file = await pickImage();
    if (!file) return false;
    try {
      const blob = await makeAvatar(file);
      custom.set(name, await saveAsset(avKey(name), blob));
      refreshHeader();
      renderAll();
      flashMsg(t('photoSaved'));
      return true;
    } catch (e) { flashMsg(e.message, 4000); return false; }
  }
  async function resetPhoto(name) {
    await removeAsset(avKey(name));
    custom.delete(name);
    refreshHeader();
    renderAll();
  }

  function heroRow(name, label, color, url) {
    const a = avatar(url, label, color);
    const row = h('div', { class: 'hero-row' },
      a,
      h('div', { class: 'hero-name', style: { color } }, label),
      h('button', { type: 'button', class: 'btn-small', onclick: async () => {
        if (await changePhoto(name)) row.replaceWith(heroRow(name, label, color, name === CHAT_KEY ? chatAvaUrl() : avaUrl(name)));
      } }, t('changePhoto')),
      custom.has(name) ? h('button', { type: 'button', class: 'btn-small ghost', onclick: async () => {
        await resetPhoto(name);
        row.replaceWith(heroRow(name, label, color, name === CHAT_KEY ? chatAvaUrl() : avaUrl(name)));
      } }, t('photoReset')) : null,
    );
    return row;
  }

  // ---------- Настройки чата: тема, фон, фото героев ----------
  function openChatSettings() {
    const onChange = () => paintChatBg(bgLayer);
    const heroes = h('div', { class: 'set-block' }, h('div', { class: 'set-title' }, t('heroes')));
    if (story.isGroup) heroes.append(heroRow(CHAT_KEY, t('chatPhoto'), '#5c6bc0', chatAvaUrl()));
    for (const name of story.charOrder) {
      const c = char(name);
      heroes.append(heroRow(name, name, c.color, avaUrl(name)));
    }
    heroes.append(h('div', { class: 'set-hint small' }, LIMITS.avatar.hint));
    const content = h('div', {},
      h('h2', {}, t('chatSettings')),
      themeSection(onChange),
      backgroundSection(onChange),
      heroes,
      togglesSection(renderAll),
    );
    const s = sheet(content);
    const closeBtn = h('button', { class: 'btn-wide', type: 'button', onclick: () => s.close() }, t('close'));
    content.append(closeBtn);
    soundSection().then((sec) => content.insertBefore(sec, closeBtn));
  }

  // ---------- Персонажи и доверие ----------
  function openTrust() {
    const box = h('div', {}, h('h2', {}, t('trustTitle')));
    for (const name of story.others) {
      const v = engine.state.trust[name] ?? 5;
      const c = char(name);
      box.append(h('button', { class: 'trust-item', type: 'button', onclick: () => { s.close(); openProfile(name); } },
        avaOf(name),
        h('div', { class: 'trust-body' },
          h('div', { class: 'trust-name', style: { color: c.color } }, name),
          h('div', { class: 'bar' }, h('i', { style: barStyle(v) }))),
        h('div', { class: 'trust-val' }, `${v}/10`)));
    }
    const s = sheet(box);
  }

  function openProfile(name) {
    const c = char(name);
    const v = engine.state.trust[name] ?? 5;
    const big = avaOf(name);
    big.addEventListener('click', () => { const u = avaUrl(name); if (u) viewer(u); });
    const s = sheet(h('div', { class: 'profile' },
      big,
      h('div', { class: 'p-name', style: { color: c.color } }, name),
      h('button', { type: 'button', class: 'btn-small', onclick: async () => {
        if (await changePhoto(name)) { s.close(); openProfile(name); }
      } }, t('changePhoto')),
      h('div', { class: 'p-section' }, h('div', { class: 'p-label' }, t('about')), c.about || t('noAbout')),
      h('div', { class: 'p-section' }, h('div', { class: 'p-label' }, `${t('trustLabel')}: ${v}/10`),
        h('div', { class: 'bar' }, h('i', { style: barStyle(v) }))),
    ));
  }

  // Полоска доверия: 0 — красная, 5 — жёлтая, 10 — зелёная
  function barStyle(v) {
    return { width: Math.max(4, v * 10) + '%', background: `hsl(${v * 12}, 70%, 48%)` };
  }

  renderAll();
}

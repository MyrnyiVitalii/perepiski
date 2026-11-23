// Экран чата: лента сообщений, тапы, «печатает…», выборы, меню, настройки чата.
import { h, ICONS, iconBtn, avatar, flashMsg, sheet, viewer } from './ui.js';
import { t, plural } from './i18n.js';
import { Engine } from './engine.js';
import { db } from './storage.js';
import { settings, saveSettings, paintChatBg, themeSection, backgroundSection, togglesSection, soundSection, emo, hiddenBySettings } from './settings.js';
import { pickImage, makeAvatar, saveAsset, assetUrl, removeAsset, LIMITS } from './images.js';
import { play, vibrate, vibrateForEffect, unlockAudio } from './sounds.js';

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
  const top = h('header', { class: 'top' },
    iconBtn('back', () => onExit()), headAva, h('div', { class: 'top-titles' }, titleEl, subEl),
    iconBtn('people', openTrust, 'hide-rec'),
    iconBtn('dots', openMenu, 'hide-rec'),
  );
  const list = h('div', { class: 'feed-list' });
  const feed = h('div', { class: 'feed' }, list);
  const bottom = h('div', { class: 'bottom' });
  const toasts = h('div', { class: 'toasts' });
  const bgLayer = h('div', { class: 'chat-bg' });
  // Фоны сцен ([фон ...]): два слоя, чтобы новый фон плавно проявлялся поверх старого
  const sceneA = h('div', { class: 'scene-bg' });
  const sceneB = h('div', { class: 'scene-bg' });
  const sceneShade = h('div', { class: 'scene-shade' });
  const chat = h('div', { class: 'chat' + (settings.recording ? ' rec' : '') },
    bgLayer, h('div', { class: 'chat-shade' }), sceneA, sceneB, sceneShade, top, feed, bottom, toasts);
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
    const m = h('span', { class: 'meta' }, h('span', { class: 'tm' }, item.time));
    if (item.me) m.insertAdjacentHTML('beforeend', `<span class="tick">${read ? ICONS.tick2 : ICONS.tick1}</span>`);
    return m;
  }

  function imgEl(file) {
    const url = resolve(file);
    if (!url) return h('div', { class: 'photo-missing' }, `${t('photo')}: ${file}`);
    const img = h('img', { src: url, alt: '', draggable: 'false' });
    img.addEventListener('load', () => { if (nearBottom()) scrollDown(false); });
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
      return h('div', { class: 'sys' + (animate ? ' new' : '') }, emo(item.text));
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

    if (item.kind === 'sticker') {
      row.append(h('div', { class: 'sticker' }, nameEl, imgEl(item.file), metaEl(item, read)));
    } else if (item.kind === 'photo' || item.kind === 'video') {
      const media = item.kind === 'photo' ? imgEl(item.file) : videoEl(item.file);
      const b = h('div', { class: 'bubble photo' + (item.text ? '' : ' no-caption') }, nameEl, media);
      if (item.text) b.append(h('div', { class: 'caption text' }, emo(item.text), metaEl(item, read)));
      else b.append(metaEl(item, read));
      row.append(b);
    } else if (item.kind === 'deleted') {
      row.append(h('div', { class: 'bubble' }, nameEl, h('div', { class: 'text deleted' }, emo('🚫 ' + t('deleted')), metaEl(item, read))));
    } else {
      row.append(h('div', { class: 'bubble' }, nameEl, h('div', { class: 'text' }, emo(item.text), metaEl(item, read))));
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
    const actions = h('div', { class: 'react-actions' },
      item && item.text ? h('button', { type: 'button', onclick: () => {
        close();
        navigator.clipboard?.writeText(item.text).then(() => flashMsg(t('copied'))).catch(() => {});
      } }, t('reactCopy')) : null);
    const pop = h('div', { class: 'react-pop' }, bar, actions);
    const back = h('div', { class: 'menu-back react-back', onclick: (e) => { if (e.target === back) close(); } }, pop);
    function close() { back.remove(); holder.classList.remove('lifted'); }
    document.body.append(back);
    holder.classList.add('lifted');
    const top_ = Math.max(70, r.top - 62);
    pop.style.top = top_ + 'px';
    const w = pop.offsetWidth;
    pop.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
    vibrate([15]);
  }

  // Долгое нажатие и двойной тап по сообщению
  function attachBubbleGestures() {
    let lp = null, lastTap = { id: null, t: 0 };
    feed.addEventListener('pointerdown', (e) => {
      const holder = e.target.closest('.bubble[data-id], .sticker[data-id]');
      if (!holder || !e.isPrimary) return;
      const x = e.clientX, y = e.clientY;
      lp = { holder, x, y, timer: setTimeout(() => { lp = null; openReactPicker(holder); }, LONG_PRESS) };
    });
    const cancel = () => { if (lp) { clearTimeout(lp.timer); lp = null; } };
    feed.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > TAP_MAX_MOVE) cancel(); });
    feed.addEventListener('pointercancel', cancel);
    feed.addEventListener('scroll', cancel, { passive: true });
    feed.addEventListener('pointerup', (e) => {
      if (!lp) return;
      cancel();
      const holder = e.target.closest('.bubble[data-id], .sticker[data-id]');
      if (!holder || e.target.closest('img, video, .video-box')) return;
      const id = +holder.dataset.id, now = performance.now();
      if (lastTap.id === id && now - lastTap.t < 320) { lastTap = { id: null, t: 0 }; setMyReaction(id, '❤️'); }
      else lastTap = { id, t: now };
    });
    feed.addEventListener('contextmenu', (e) => { if (e.target.closest('.bubble, .sticker')) e.preventDefault(); });
  }

  // ---------- Конец серии: «Продолжение следует…» ----------
  function showToBeContinued() {
    const ov = h('div', { class: 'tbc', onclick: () => ov.remove() }, h('div', { class: 'tbc-text' }, t('toBeContinued')));
    document.body.append(ov);
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
    renderBottom();
    setSub(idleSub());
    requestAnimationFrame(() => scrollDown(false));
  }

  function refreshHeader() {
    const a = headAvatar();
    headAva.replaceWith(a);
    headAva = a;
  }

  // То, что рисуется отдельной строкой в ленте (реакции рисуются на сообщениях)
  const rowItems = () => engine.state.log.filter((it) => it.t !== 'react' && !hiddenBySettings(it));

  function appendItem(item) {
    if (hiddenBySettings(item)) return;
    if (item.t === 'react') {
      drawReacts(item.target, true);
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
        const layer = h('div', { class: 'fx-layer fx-glitch' });
        chat.append(layer); chat.classList.add('fx-glitching');
        setTimeout(() => { layer.remove(); chat.classList.remove('fx-glitching'); }, 750);
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
  attachBubbleGestures();
  top.addEventListener('pointerdown', unlockAudio);

  // ---------- Меню ----------
  function openMenu() {
    const item = (icon, label, fn) => h('button', { type: 'button', onclick: () => { back.remove(); fn(); } },
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
    const back = h('div', { class: 'menu-back', onclick: (e) => { if (e.target === back) back.remove(); } }, menu);
    document.body.append(back);
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

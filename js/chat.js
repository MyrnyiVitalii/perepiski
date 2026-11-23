// Экран чата: лента сообщений, тапы, «печатает…», выборы, меню, режим съёмки.
import { h, ICONS, iconBtn, avatar, flashMsg, sheet, viewer } from './ui.js';
import { t, plural } from './i18n.js';
import { Engine } from './engine.js';
import { db } from './storage.js';
import { settings, openSettings } from './settings.js';

const TAP_MAX_MOVE = 10;     // пикселей: если палец сдвинулся больше — это прокрутка, а не тап
const TAP_MAX_TIME = 350;    // миллисекунд: дольше — это долгое нажатие (выделение текста)
const LONG_PRESS = 700;      // миллисекунд: долгое нажатие на шапку — выход из режима съёмки

export async function openChat(root, rec, { onExit }) {
  const { story, resolve } = rec;
  let saved = null;
  try { saved = await db.get('progress', rec.id); } catch (e) { /* нет сохранения */ }
  if (saved && rec.sig && saved.sig !== rec.sig) saved = null; // историю изменили — начинаем с начала
  const engine = new Engine(story, saved);

  const char = (name) => story.characters[name] || { name, color: '#90a4ae', avatar: '', about: '' };
  const avaOf = (name) => { const c = char(name); return avatar(resolve(c.avatar), c.name, c.color); };

  // ---------- Каркас экрана ----------
  const titleEl = h('div', { class: 'top-title' }, story.chatTitle);
  const subEl = h('div', { class: 'top-sub' });
  const headAva = story.isGroup
    ? avatar(resolve(story.chatAvatar), story.chatTitle, '#5c6bc0')
    : avaOf(story.others[0] || story.chatTitle);
  const backBtn = iconBtn('back', () => { if (!chat.classList.contains('rec')) onExit(); });
  const top = h('header', { class: 'top' },
    backBtn, headAva, h('div', { class: 'top-titles' }, titleEl, subEl),
    iconBtn('people', openTrust, 'hide-rec'),
    iconBtn('dots', openMenu, 'hide-rec'),
  );
  const list = h('div', { class: 'feed-list' });
  const feed = h('div', { class: 'feed' }, list);
  const bottom = h('div', { class: 'bottom' });
  const toasts = h('div', { class: 'toasts' });
  const chat = h('div', { class: 'chat' }, h('div', { class: 'chat-bg' }), top, feed, bottom, toasts);
  root.replaceChildren(chat);

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

  function imgEl(file, cls) {
    const url = resolve(file);
    if (!url) return h('div', { class: 'photo-missing' }, `${t('photo')}: ${file}`);
    const img = h('img', { src: url, alt: '', draggable: 'false', class: cls || null });
    img.addEventListener('load', () => { if (nearBottom()) scrollDown(false); });
    img.addEventListener('click', () => viewer(url));
    return img;
  }

  function renderItem(item, prev, next, read, animate) {
    if (item.t === 'date' || item.t === 'system') {
      return h('div', { class: 'sys' + (animate ? ' new' : '') }, item.text);
    }
    if (item.t === 'end') {
      return h('div', { class: 'endcard' },
        h('div', { class: 'end-big' }, t('endTitle')),
        item.title ? h('div', { class: 'end-name' }, item.title) : null,
        h('div', { class: 'end-btns' },
          h('button', { type: 'button', onclick: restart }, t('endRestart')),
          h('button', { type: 'button', onclick: onExit }, t('endLibrary'))),
      );
    }
    const runStart = !(prev && prev.t === 'msg' && prev.who === item.who);
    const runEnd = !(next && next.t === 'msg' && next.who === item.who);
    const row = h('div', { class: `row ${item.me ? 'out' : 'in'}${runStart ? ' run-start' : ''}${runEnd ? ' run-end' : ''}${animate ? ' new' : ''}` });
    if (!item.me && story.isGroup) row.append(runEnd ? avaOf(item.who) : h('div', { class: 'ava spacer' }));

    const c = char(item.who);
    const nameEl = (!item.me && story.isGroup && runStart) ? h('div', { class: 'name', style: { color: c.color } }, item.who) : null;

    if (item.kind === 'sticker') {
      const st = h('div', { class: 'sticker' }, nameEl, imgEl(item.file), metaEl(item, read));
      row.append(st);
    } else if (item.kind === 'photo') {
      const b = h('div', { class: 'bubble photo' + (item.text ? '' : ' no-caption') }, nameEl, imgEl(item.file));
      if (item.text) b.append(h('div', { class: 'caption text' }, item.text, metaEl(item, read)));
      else b.append(metaEl(item, read));
      row.append(b);
    } else if (item.kind === 'deleted') {
      row.append(h('div', { class: 'bubble' }, nameEl, h('div', { class: 'text deleted' }, '🚫 ' + t('deleted'), metaEl(item, read))));
    } else {
      row.append(h('div', { class: 'bubble' }, nameEl, h('div', { class: 'text' }, item.text, metaEl(item, read))));
    }
    rows.set(item.id, row);
    return row;
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
    const log = engine.state.log;
    const read = computeRead(log);
    log.forEach((it, i) => list.append(renderItem(it, log[i - 1], log[i + 1], read.has(it.id), false)));
    renderBottom();
    setSub(idleSub());
    requestAnimationFrame(() => scrollDown(false));
  }

  function appendItem(item) {
    const log = engine.state.log;
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
    list.append(renderItem(item, prev, null, false, true));
    scrollDown(true);
  }

  const nearBottom = () => feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  function scrollDown(smooth) {
    feed.scrollTo({ top: feed.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---------- Нижняя панель: поле ввода или кнопки выбора ----------
  function renderBottom() {
    const choice = engine.currentChoice();
    if (choice) {
      const box = h('div', { class: 'choices' });
      choice.options.forEach((o, i) => box.append(h('button', { class: 'choice', type: 'button', onclick: () => choose(i) }, o.label)));
      bottom.replaceChildren(box);
    } else {
      bottom.replaceChildren(h('div', { class: 'inputbar' },
        h('div', { class: 'ib', html: ICONS.smile }),
        h('div', { class: 'fake-input' }, t('inputPlaceholder')),
        h('div', { class: 'ib', html: ICONS.clip }),
        h('div', { class: 'ib', html: ICONS.mic }),
      ));
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

  function showToasts(list_) {
    if (!settings.trustToast) return;
    list_.filter((x) => x.who !== story.me).forEach((x, i) => {
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
  async function onTap() {
    if (typing) { typing.done(); return; }
    if (busy) return;
    const s = engine.state;
    if (s.ended !== null) return;
    if (s.atChoice) { nudgeChoices(); return; }
    let ctx;
    try { ctx = engine.step(); } catch (e) { flashMsg(e.message, 4000); return; }
    if (!ctx) return;
    save();
    busy = true;
    const myGen = gen;
    try {
      if (ctx.item) {
        const it = ctx.item;
        if (it.t === 'msg' && !it.me && settings.typing && ctx.typing) {
          await showTyping(ctx.typingWho, ctx.typing);
          if (myGen !== gen) return;
        }
        appendItem(it);
      }
      runEffects(ctx.effects);
      showToasts(ctx.toasts);
      if (ctx.choice || s.ended !== null) renderBottom();
    } finally { busy = false; }
  }

  function nudgeChoices() {
    const box = bottom.querySelector('.choices');
    if (!box) return;
    box.classList.remove('nudge'); void box.offsetWidth; box.classList.add('nudge');
  }

  function choose(i) {
    if (typing || busy) return;
    const ctx = engine.choose(i);
    if (!ctx) return;
    save();
    renderBottom();
    if (ctx.item) appendItem(ctx.item);
    runEffects(ctx.effects);
    showToasts(ctx.toasts);
  }

  // Защита от случайных нажатий: только короткий тап без сдвига пальца и без прокрутки
  function attachTap(el) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
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
      if (e.target.closest('.bubble:not(.typing-row .bubble), .sticker, button, a, input, .endcard, .choices')) return;
      const sel = window.getSelection();
      if (sel && sel.toString()) return;
      onTap();
    });
  }
  attachTap(feed);
  attachTap(bottom);

  // ---------- Меню ----------
  function openMenu() {
    const item = (icon, label, fn) => h('button', { type: 'button', onclick: () => { back.remove(); fn(); } },
      h('span', { html: ICONS[icon] }), label);
    const menu = h('div', { class: 'menu' },
      item('restart', t('menuRestart'), () => { if (confirm(t('confirmRestart'))) restart(); }),
      item('undo', t('menuBackOne'), backOne),
      item('undoChoice', t('menuBackChoice'), backChoice),
      item('camera', t('menuRecord'), recordOn),
      item('gear', t('menuSettings'), () => openSettings(renderAll)),
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
    save(); renderAll();
  }
  function backChoice() {
    if (!engine.backChoice()) { flashMsg(t('noPrevChoice')); return; }
    save(); renderAll();
  }

  // ---------- Режим съёмки ----------
  const standalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  function recordOn() {
    chat.classList.add('rec');
    if (!standalone && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    }
    flashMsg(t('recordOn'), 2600);
  }
  function recordOff() {
    chat.classList.remove('rec');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    flashMsg(t('recordOff'));
  }
  let lpTimer = null;
  top.addEventListener('pointerdown', () => {
    if (!chat.classList.contains('rec')) return;
    lpTimer = setTimeout(recordOff, LONG_PRESS);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => top.addEventListener(ev, () => clearTimeout(lpTimer)));
  top.addEventListener('contextmenu', (e) => e.preventDefault());

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
    big.addEventListener('click', () => { const u = resolve(c.avatar); if (u) viewer(u); });
    sheet(h('div', { class: 'profile' },
      big,
      h('div', { class: 'p-name', style: { color: c.color } }, name),
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

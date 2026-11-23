// Мелкие помощники для построения экрана.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const svg = (path, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const ICONS = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  dots: svg('<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>'),
  people: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  undo: svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
  undoChoice: svg('<path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/>'),
  camera: svg('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  smile: svg('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>'),
  clip: svg('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  mic: svg('<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>'),
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.45-7.48a1 1 0 0 0 0-1.84L3.4 3.6a.99.99 0 0 0-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg>',
  palette: svg('<circle cx="13.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.2" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  bookmark: svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  reply: svg('<path d="M9 17l-5-5 5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>'),
  pin: svg('<path d="M12 17v5"/><path d="M9 10.76V6h6v4.76l2.5 3.24H6.5z"/><path d="M8 2h8"/>'),
  volume: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'),
  mute: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'),
  tick1: '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6l3 3L12 2"/></svg>',
  tick2: '<svg viewBox="0 0 16 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3 3L10.5 2"/><path d="M7.5 8.6L8 9l6.5-7"/></svg>',
};

export function iconBtn(name, onClick, cls = '') {
  return h('button', { class: 'icon-btn ' + cls, html: ICONS[name], onclick: onClick, type: 'button' });
}

// Круглая аватарка: картинка или первая буква имени на цветном фоне
export function avatar(url, name = '', color = '#455a64') {
  const el = h('div', { class: 'ava' });
  if (url) {
    el.append(h('img', { src: url, alt: '', loading: 'lazy', draggable: 'false' }));
  } else {
    el.style.background = color;
    el.textContent = (name.trim()[0] || '?').toUpperCase();
  }
  return el;
}

export function flashMsg(text, ms = 2200) {
  const el = h('div', { class: 'flash-msg' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

// ---------- Кнопка «Назад» на Android ----------
// Открытые окошки (шторки, меню, просмотр фото) закрываются кнопкой «Назад» телефона по очереди,
// а не выкидывают из чата.
const overlays = [];
let ignorePop = 0;
let deferredPush = 0; // окошко открыли, пока браузер ещё не закончил шаг «назад» от прошлого окошка
export function pushOverlay(closeFn) {
  overlays.push(closeFn);
  // Если предыдущее окошко только что закрылось и браузер ещё делает «назад» –
  // новую запись в историю добавим после этого шага, иначе следующий «назад» уведёт с экрана.
  if (ignorePop > 0) deferredPush += 1;
  else history.pushState({ overlay: overlays.length }, '');
}
export function popOverlay(closeFn) {
  const i = overlays.indexOf(closeFn);
  if (i < 0) return;
  overlays.splice(i, 1);
  if (deferredPush > 0) { deferredPush -= 1; return; } // запись ещё не добавлена – и убирать нечего
  ignorePop += 1;
  history.back();
}
export function clearOverlays() { overlays.length = 0; deferredPush = 0; }
window.addEventListener('popstate', () => {
  if (ignorePop > 0) {
    ignorePop -= 1;
    if (ignorePop === 0) for (; deferredPush > 0; deferredPush -= 1) history.pushState({ overlay: overlays.length }, '');
    return;
  }
  const fn = overlays.pop();
  if (fn) fn(true);
});
export const hasOverlay = () => overlays.length > 0;

// Свайп вниз закрывает окошко (как в Telegram)
function swipeDownToClose(el, close, handle = el) {
  let st = null;
  handle.addEventListener('pointerdown', (e) => {
    // если окошко прокручено вниз, сначала пусть прокрутится к началу
    if (el.scrollTop > 0 || e.target.closest('input, .slider, .theme-list')) { st = null; return; }
    st = { y: e.clientY, x: e.clientX, t: performance.now(), dy: 0 };
  });
  handle.addEventListener('pointermove', (e) => {
    if (!st) return;
    st.dy = e.clientY - st.y;
    if (st.dy > 0 && Math.abs(e.clientX - st.x) < st.dy && el.scrollTop <= 0) {
      el.style.transition = 'none';
      el.style.transform = `translateY(${st.dy}px)`;
    }
  });
  const end = () => {
    if (!st) return;
    const fast = st.dy > 40 && performance.now() - st.t < 250;
    el.style.transition = '';
    if (st.dy > 120 || fast) close();
    else el.style.transform = '';
    st = null;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

export function sheet(content, onClose) {
  const back = h('div', { class: 'sheet-back' });
  const panel = h('div', { class: 'sheet' }, h('div', { class: 'sheet-grip' }), content);
  back.append(panel);
  let closed = false;
  const close = (fromBack) => {
    if (closed) return;
    closed = true;
    back.remove();
    if (fromBack !== true) popOverlay(close);
    onClose && onClose();
  };
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  swipeDownToClose(panel, close, panel);
  document.body.append(back);
  pushOverlay(close);
  return { close, panel };
}

export function viewer(url, isVideo = false) {
  const media = isVideo
    ? h('video', { src: url, controls: true, autoplay: true, playsinline: true })
    : h('img', { src: url, alt: '' });
  let closed = false;
  const close = (fromBack) => {
    if (closed) return;
    closed = true;
    v.remove();
    if (fromBack !== true) popOverlay(close);
  };
  const btn = h('button', { type: 'button', class: 'viewer-close', onclick: () => close() }, '✕');
  const v = h('div', { class: 'viewer', onclick: (e) => { if (e.target === v || (!isVideo && !moved)) close(); } }, media, btn);
  let moved = false, sx = 0, sy = 0;
  v.addEventListener('pointerdown', (e) => { moved = false; sx = e.clientX; sy = e.clientY; });
  v.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) moved = true; });
  swipeDownToClose(media, close, v);
  document.body.append(v);
  pushOverlay(close);
}

// Окошко-вопрос с кнопками «Да» / «Нет» (вместо стандартного confirm браузера).
// Возвращает Promise: true – «Да», false – «Нет», нажатие мимо окна или кнопка «Назад» телефона.
export function askYesNo(title, text, { yes = 'Да', no = 'Нет', danger = false } = {}) {
  return new Promise((resolve) => {
    let closed = false;
    const close = (answer, fromBack) => {
      if (closed) return;
      closed = true;
      back.remove();
      if (fromBack !== true) popOverlay(onBack);
      resolve(answer);
    };
    const onBack = (fromBack) => close(false, fromBack);
    const box = h('div', { class: 'dlg', role: 'dialog' },
      h('div', { class: 'dlg-title' }, title),
      text ? h('div', { class: 'dlg-text' }, text) : null,
      h('div', { class: 'dlg-btns' },
        h('button', { type: 'button', class: 'dlg-btn', onclick: () => close(false) }, no),
        h('button', { type: 'button', class: 'dlg-btn' + (danger ? ' danger' : ''), onclick: () => close(true) }, yes)),
    );
    const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back) close(false); } }, box);
    document.body.append(back);
    pushOverlay(onBack);
  });
}

// Заставка серии после «Start»: чёрный экран, название сериала, «Серия N» и мрачно проступающее название серии.
// ~4,5 секунды; нажатие (или кнопка «Назад» телефона) пропускает. Шрифты лежат в fonts/ — работает без интернета.
import { h, pushOverlay, popOverlay } from './ui.js';
import { play, vibrate, unlockAudio } from './sounds.js';

// «Светлый. Серия 1: Фура» → { series: 'Светлый', ep: 1, name: 'Фура' }
export function introParts(story) {
  const title = story.title || '';
  const m = title.match(/серия\s*\d+\s*[:.—–-]\s*(.+)$/i);
  if (story.series && story.episode) return { series: story.series, ep: story.episode, name: m ? m[1].trim() : '' };
  return { series: '', ep: 0, name: title };
}

// Переход между сценами: экран уходит в чёрное, по центру место и время, потом чат с новым фоном.
// text: «Посёлок Светлый · 16:41» (часть после «·» — мелко). Нажатие пропускает. onDark — вызвать, пока экран чёрный.
export function showTransition(text, onDark) {
  return new Promise((resolve) => {
    const [place, ...rest] = String(text || '').split('·');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // только надпись без места и времени («ЗА ШЕСТЬ ЧАСОВ ДО») – крупно, как титр в кино
    const big = !rest.length;
    const box = h('div', { class: 'scene-cut' + (big ? ' big' : '') + (reduce ? ' reduce' : '') },
      h('div', { class: 'intro-grain' }),
      h('div', { class: 'sc-inner' },
        h('div', { class: 'sc-place' }, place.trim().toUpperCase()),
        rest.length ? h('div', { class: 'sc-time' }, rest.join('·').trim()) : null));
    let finished = false;
    const timers = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      box.classList.add('out');
      setTimeout(() => { box.remove(); resolve(); }, 380);
    };
    box.addEventListener('click', () => { if (onDark) { onDark(); onDark = null; } finish(); });
    document.body.append(box);
    timers.push(setTimeout(() => { if (onDark) { onDark(); onDark = null; } }, 400));
    // длинный текст («За шесть часов до этого · Школьный автобус · 15:47») держим дольше, чтобы успели прочитать
    timers.push(setTimeout(finish, reduce ? 900 : big || String(text || '').length > 24 ? 2700 : 2200));
  });
}

export function showIntro(story, done) {
  const { series, ep, name } = introParts(story);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Буквы названия появляются вразнобой, как лампа, которая не сразу загорается
  const letters = [...(name || series || '').toUpperCase()].map((ch, i, arr) => {
    const span = h('span', { class: 'il' }, ch === ' ' ? ' ' : ch);
    const base = 1.45 + (i / Math.max(1, arr.length - 1)) * 0.55;
    span.style.animationDelay = (reduce ? 0.6 : base + Math.random() * 0.35).toFixed(2) + 's';
    return span;
  });

  const box = h('div', { class: 'intro' + (reduce ? ' reduce' : ''), role: 'dialog', 'aria-label': [series, ep ? 'Серия ' + ep : '', name].filter(Boolean).join('. ') },
    h('div', { class: 'intro-grain' }),
    h('div', { class: 'intro-vignette' }),
    h('div', { class: 'intro-inner' },
      series && name ? h('div', { class: 'intro-series' }, series.toUpperCase()) : null,
      ep ? h('div', { class: 'intro-ep' }, h('i'), 'СЕРИЯ ' + ep, h('i')) : null,
      h('h1', { class: 'intro-title' + ((name || series).length > 9 ? ' long' : '') }, letters),
      h('div', { class: 'intro-scratch' })),
    h('div', { class: 'intro-skip' }, 'нажмите, чтобы пропустить'),
  );

  let finished = false;
  const timers = [];
  const finish = (fromBack, fast) => {
    if (finished) return;
    finished = true;
    timers.forEach(clearTimeout);
    if (fromBack !== true) popOverlay(onBack);
    box.classList.add(fast ? 'out-fast' : 'out');
    setTimeout(() => { box.remove(); done && done(); }, fast ? 260 : 900);
  };
  const onBack = (fromBack) => finish(fromBack, true);

  box.addEventListener('click', () => finish(false, true));
  document.body.append(box);
  pushOverlay(onBack);

  unlockAudio();
  play('гул');
  timers.push(setTimeout(() => vibrate([40, 60, 90]), reduce ? 600 : 1700));
  timers.push(setTimeout(() => finish(false, false), reduce ? 2600 : 4600));
}

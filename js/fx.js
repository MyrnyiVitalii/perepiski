// Эффект «помехи»: экран чата будто ломается, как сбой сигнала.
// Полосы, сдвиги и смена цвета — готовая библиотека PowerGlitch (лицензия MIT, автор Benjamin Raymond,
// https://github.com/7PH/powerglitch, файл vendor/powerglitch). Сверху — телевизионный шум и полосы развёртки.
import { PowerGlitch } from '../vendor/powerglitch/powerglitch.esm.js';

export function signalGlitch(chat, duration = 1100) {
  if (!chat || chat.querySelector('.glitch-host')) return;
  const feed = chat.querySelector('.feed');
  const scroll = feed ? feed.scrollTop : 0;

  // «Снимок» экрана чата: копия, которую ломаем, а настоящий чат под ней не трогаем
  const snap = chat.cloneNode(true);
  snap.classList.remove('fx-shake', 'fx-glitching');
  snap.querySelectorAll('.fx-layer, .glitch-host, video').forEach((el) => el.remove());
  const sf = snap.querySelector('.feed');
  if (sf) {
    sf.style.overflow = 'hidden';
    const lst = sf.querySelector('.feed-list');
    if (lst) lst.style.transform = `translateY(${-scroll}px)`;
  }

  const host = document.createElement('div');
  host.className = 'glitch-host';
  host.append(snap);
  chat.append(host);

  const g = PowerGlitch.glitch(snap, {
    playMode: 'manual',
    createContainers: true,
    hideOverflow: true,
    optimizeSeo: false,
    timing: { duration, iterations: 1 },
    glitchTimeSpan: { start: 0, end: 1 },
    shake: { velocity: 22, amplitudeX: 0.025, amplitudeY: 0.012 },
    slice: { count: 10, velocity: 24, minHeight: 0.015, maxHeight: 0.11, hueRotate: true },
    pulse: false,
  });
  g.startGlitch();

  // Шум как на старом телевизоре + полосы развёртки + короткое «пропадание» сигнала
  const noise = document.createElement('canvas');
  noise.className = 'glitch-noise';
  noise.width = 120; noise.height = 240;
  const scan = document.createElement('div');
  scan.className = 'glitch-scan';
  const drop = document.createElement('div');
  drop.className = 'glitch-drop';
  host.append(noise, scan, drop);
  const ctx = noise.getContext('2d');
  const img = ctx.createImageData(noise.width, noise.height);
  const tick = () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  };
  tick();
  const timer = setInterval(tick, 45);

  setTimeout(() => { clearInterval(timer); host.remove(); }, duration + 60);
}

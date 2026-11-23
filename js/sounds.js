// Звуки и вибрация.
// Встроенные звуки не лежат файлами: телефон «рисует» их сам (Web Audio), поэтому они
// работают без интернета и их можно спокойно использовать в видео на YouTube.
// Свои звуки (mp3, ogg, wav, m4a) можно загрузить в настройках, тогда [звук имя] играет их.
import { settings } from './settings.js';
import { db } from './storage.js';

let ac = null, master = null, noiseBuf = null;
const customBuffers = new Map();

function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  master.gain.value = (settings.volume ?? 80) / 100;
  return ac;
}

// Разбудить звук после первого нажатия (так требует браузер)
let preloaded = false;
export function unlockAudio() {
  ctx();
  if (!preloaded && ac) { preloaded = true; preloadSounds(); }
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = ac.sampleRate * 2;
  noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// --- Маленькие строительные кирпичики ---
function env(t0, attack, peak, decay, dest) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(dest || master);
  return g;
}
function tone(type, f0, f1, t0, attack, peak, decay, dest) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + attack + decay);
  o.connect(env(t0, attack, peak, decay, dest));
  o.start(t0);
  o.stop(t0 + attack + decay + 0.05);
  return o;
}
function burst(t0, dur, peak, filterType, freq, q = 1, f1, dest) {
  const s = ac.createBufferSource();
  s.buffer = noise();
  const f = ac.createBiquadFilter();
  f.type = filterType;
  f.frequency.setValueAtTime(freq, t0);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  f.Q.value = q;
  s.connect(f);
  f.connect(env(t0, Math.min(0.01, dur / 4), peak, dur, dest));
  s.start(t0, Math.random());
  s.stop(t0 + dur + 0.05);
}

// --- Встроенные звуки ---
const SYNTH = {
  // входящее сообщение: мягкий «дзинь» в два тона
  'уведомление'(t) {
    tone('sine', 880, 880, t, 0.005, 0.25, 0.18);
    tone('sine', 1320, 1320, t + 0.09, 0.005, 0.22, 0.3);
  },
  // отправка: короткий «вжух»
  'отправка'(t) { burst(t, 0.2, 0.35, 'bandpass', 500, 1.2, 3500); },
  // одно нажатие клавиши
  'клавиша'(t) { burst(t, 0.03, 0.18, 'highpass', 2500 + Math.random() * 1500, 0.7); },
  // набор на клавиатуре
  'клавиатура'(t) { for (let i = 0; i < 8; i++) SYNTH['клавиша'](t + i * 0.09 + Math.random() * 0.04); },
  // реакция на сообщение
  'реакция'(t) { tone('sine', 600, 1100, t, 0.005, 0.25, 0.12); },
  // телефон вибрирует на столе
  'вибрация'(t) {
    for (let i = 0; i < 2; i++) {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.connect(master);
      tone('square', 150, 150, t + i * 0.55, 0.02, 0.18, 0.4, lp);
    }
  },
  // сердцебиение: тук-тук ×3
  'сердце'(t) {
    for (let i = 0; i < 3; i++) {
      const b = t + i * 0.95;
      tone('sine', 70, 40, b, 0.01, 0.9, 0.18);
      tone('sine', 62, 38, b + 0.22, 0.01, 0.65, 0.2);
    }
  },
  // стук в дверь ×3
  'стук'(t) {
    for (let i = 0; i < 3; i++) {
      const k = t + i * 0.28;
      burst(k, 0.08, 0.9, 'bandpass', 320, 3);
      tone('sine', 190, 120, k, 0.003, 0.6, 0.1);
    }
  },
  // скрип двери
  'скрип'(t) {
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    for (let i = 1; i <= 12; i++) o.frequency.linearRampToValueAtTime(60 + Math.random() * 60, t + i * 0.12);
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.15);
    for (let i = 1; i <= 12; i++) g.gain.linearRampToValueAtTime(0.3 + Math.random() * 0.7, t + 0.15 + i * 0.1);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    o.connect(bp); bp.connect(g); g.connect(master);
    o.start(t); o.stop(t + 1.6);
  },
  // шаги ×4
  'шаги'(t) {
    for (let i = 0; i < 4; i++) {
      const s = t + i * 0.55;
      burst(s, 0.12, 0.7, 'lowpass', 500);
      tone('sine', 80, 50, s, 0.005, 0.5, 0.12);
    }
  },
  // помехи, «сломанная» связь
  'помехи'(t) {
    for (let i = 0; i < 9; i++) {
      const s = t + i * 0.09 + Math.random() * 0.03;
      burst(s, 0.04 + Math.random() * 0.08, 0.35 + Math.random() * 0.4, 'bandpass', 800 + Math.random() * 4000, 0.6);
    }
    tone('square', 60, 60, t, 0.01, 0.06, 0.8);
  },
  // жуткий низкий гул
  'гул'(t) {
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(master);
    const g = ac.createGain(); g.connect(lp);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    for (const f of [55, 55.8, 82.4]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(g); o.start(t); o.stop(t + 3.3);
    }
  },
  // резкий удар (скример)
  'удар'(t) {
    tone('sine', 90, 30, t, 0.005, 1, 0.6);
    burst(t, 0.25, 0.8, 'lowpass', 2000);
    for (const f of [1190, 1265, 1410, 1680]) tone('sawtooth', f, f * 0.97, t + 0.01, 0.01, 0.07, 1.4);
  },
  // «конец серии»: низкий тревожный аккорд
  'финал'(t) {
    for (const f of [65.4, 77.8, 98]) tone('triangle', f, f, t, 0.3, 0.3, 2.6);
  },
};

// Звуки-файлы: настоящие звуки сообщений Telegram (из его открытого кода, см. sounds/telegram/ОТКУДА_ЗВУКИ.txt)
const FILE_SOUNDS = {
  'уведомление': 'sounds/telegram/sound_in.wav',   // пришло сообщение (чат открыт)
  'отправка': 'sounds/telegram/sound_out.wav',     // отправлено
  'пуш': 'sounds/telegram/msg_incoming.mp3',       // уведомление, как на компьютере
};
const fileBuffers = new Map();
async function fileBuffer(name) {
  const url = FILE_SOUNDS[name];
  if (!url) return null;
  if (fileBuffers.has(name)) return fileBuffers.get(name);
  const p = fetch(url).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).catch(() => null);
  fileBuffers.set(name, p);
  return p;
}

// Вибрация к звукам (на «страшных» звуках — обязательно)
const VIBRO = {
  'вибрация': [400, 150, 400],
  'сердце': [70, 150, 90, 680, 70, 150, 90, 680, 70, 150, 90],
  'стук': [60, 220, 60, 220, 60],
  'шаги': [40, 510, 40, 510, 40, 510, 40],
  'помехи': [30, 40, 50, 30, 80, 40, 30],
  'гул': [800],
  'удар': [500],
  'финал': [200, 100, 600],
};
const FX_VIBRO = { 'тряска': [250, 60, 250, 60, 300], 'помехи': [30, 40, 60, 30, 90], 'сбой': [40, 30, 80, 30, 120], 'вспышка': [350] };

export function vibrate(pattern) {
  if (!settings.vibration || !navigator.vibrate || !pattern) return;
  try { navigator.vibrate(pattern); } catch (e) { /* нет вибрации */ }
}

export function vibrateForEffect(name) {
  const key = Object.keys(FX_VIBRO).find((k) => name.startsWith(k.slice(0, 4)));
  if (key) vibrate(FX_VIBRO[key]);
}

// Сыграть звук по имени: свой загруженный или встроенный
export async function play(name, { auto = false } = {}) {
  name = (name || '').trim().toLowerCase();
  if (!name || !settings.sound) return;
  if (auto && !settings.msgSounds) return;
  const a = ctx();
  if (!a) return;
  if (!auto) vibrate(VIBRO[name]);
  const buf = (await customBuffer(name)) || (await fileBuffer(name));
  if (buf) {
    const s = a.createBufferSource();
    s.buffer = buf;
    s.connect(master);
    s.start();
    return;
  }
  const fn = SYNTH[name];
  if (fn) fn(a.currentTime + 0.02);
}

// Заранее загрузить звуки Telegram, чтобы первый звук не опаздывал
export function preloadSounds() {
  if (!ctx()) return;
  Object.keys(FILE_SOUNDS).forEach((n) => fileBuffer(n));
}

// ---- Свои звуки ----
export const SOUND_LIMITS = { maxMB: 3, maxSec: 30 };

async function customBuffer(name) {
  if (customBuffers.has(name)) return customBuffers.get(name);
  let buf = null;
  try {
    const blob = await db.get('assets', 'snd|' + name);
    if (blob) buf = await ac.decodeAudioData(await blob.arrayBuffer());
  } catch (e) { buf = null; }
  customBuffers.set(name, buf);
  return buf;
}

export async function addCustomSound(name, file) {
  name = name.trim().toLowerCase();
  if (!name) throw new Error('Дайте звуку имя');
  if (!/^audio\//.test(file.type) && !/\.(mp3|ogg|wav|m4a)$/i.test(file.name)) throw new Error('Нужен звук MP3, OGG, WAV или M4A');
  if (file.size > SOUND_LIMITS.maxMB * 1024 * 1024) throw new Error(`Файл больше ${SOUND_LIMITS.maxMB} МБ`);
  const a = ctx();
  const buf = await a.decodeAudioData(await file.arrayBuffer()).catch(() => null);
  if (!buf) throw new Error('Не получилось прочитать этот звук');
  if (buf.duration > SOUND_LIMITS.maxSec) throw new Error(`Звук длиннее ${SOUND_LIMITS.maxSec} секунд`);
  await db.set('assets', 'snd|' + name, file);
  customBuffers.set(name, buf);
  const list = new Set(settings.customSounds || []);
  list.add(name);
  settings.customSounds = [...list];
}

export async function removeCustomSound(name) {
  await db.del('assets', 'snd|' + name);
  customBuffers.delete(name);
  settings.customSounds = (settings.customSounds || []).filter((n) => n !== name);
}

export const BUILTIN_SOUNDS = [...new Set([...Object.keys(FILE_SOUNDS), ...Object.keys(SYNTH)])].filter((n) => n !== 'клавиша');

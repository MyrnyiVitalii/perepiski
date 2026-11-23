// Настройки приложения: тема, фон, переключатели, режим съёмки.
import { db } from './storage.js';
import { t } from './i18n.js';
import { h, sheet, flashMsg } from './ui.js';
import { THEMES, applyTheme } from './themes.js';
import { pickImage, makeBackground, saveAsset, assetUrl, removeAsset, LIMITS } from './images.js';

export const settings = {
  appName: t('appName'),
  lang: 'ru',
  theme: 'night',
  bgImage: false,   // своя картинка на фоне чата
  bgBlur: 0,        // размытие фона, 0–20
  bgDim: 0,         // -60 (светлее) … 0 … 60 (темнее)
  typing: true,
  trustToast: true,
  showTime: true,
  showAvatars: true,
  showEmoji: true,  // смайлики в сообщениях
  showPhotos: true, // фото в чате
  showVideos: true, // видео в чате
  recording: false, // режим съёмки
};

export async function loadSettings() {
  try {
    const s = await db.get('settings', 'main');
    if (s) Object.assign(settings, s);
  } catch (e) { /* первый запуск */ }
  applySettings();
}

export async function saveSettings() {
  applySettings();
  try { await db.set('settings', 'main', { ...settings }); } catch (e) { /* ничего */ }
}

export function applySettings() {
  applyTheme(settings.theme);
  document.body.classList.toggle('no-time', !settings.showTime);
  document.body.classList.toggle('no-avatars', !settings.showAvatars);
  document.body.classList.toggle('recording', !!settings.recording);
  document.title = settings.appName;
}

// Нарисовать фон чата в слое .chat-bg
export async function paintChatBg(layer) {
  if (!layer) return;
  const url = settings.bgImage ? await assetUrl('bg') : '';
  layer.style.backgroundImage = url ? `url("${url}")` : '';
  layer.classList.toggle('has-image', !!url);
  const blur = settings.bgBlur || 0;
  layer.style.filter = blur ? `blur(${blur}px)` : '';
  layer.style.transform = blur ? `scale(${1 + blur / 100})` : '';
  const dim = settings.bgDim || 0;
  const shade = layer.parentElement && layer.parentElement.querySelector('.chat-shade');
  if (shade) shade.style.background = dim > 0 ? `rgba(0,0,0,${dim / 100})` : dim < 0 ? `rgba(255,255,255,${-dim / 100})` : 'transparent';
}

// ---------- Части панели настроек ----------

export function toggleRow(label, key, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!settings[key];
  input.addEventListener('change', () => { settings[key] = input.checked; saveSettings(); onChange && onChange(); });
  return h('div', { class: 'set-row' }, h('label', {}, label), h('label', { class: 'switch' }, input, h('span')));
}

function themeCard(id, th, onChange, refresh) {
  const v = th.vars;
  const card = h('button', { type: 'button', class: 'theme-card' + (settings.theme === id ? ' active' : ''), onclick: () => {
    settings.theme = id; saveSettings(); onChange && onChange(); refresh();
  } },
  h('div', { class: 'theme-preview', style: { background: v['--chat-bg'] } },
    h('div', { class: 'tp-in', style: { background: v['--in-bg'] } }),
    h('div', { class: 'tp-out', style: { background: v['--out-bg'] } }),
    h('div', { class: 'tp-in short', style: { background: v['--in-bg'] } })),
  h('div', { class: 'theme-name' }, th.name));
  return card;
}

export function themeSection(onChange) {
  const box = h('div', { class: 'theme-list' });
  const refresh = () => box.querySelectorAll('.theme-card').forEach((c, i) => c.classList.toggle('active', Object.keys(THEMES)[i] === settings.theme));
  for (const [id, th] of Object.entries(THEMES)) box.append(themeCard(id, th, onChange, refresh));
  return h('div', { class: 'set-block' }, h('div', { class: 'set-title' }, t('setTheme')), box);
}

function slider(label, key, min, max, onChange) {
  const val = h('span', { class: 'slider-val' }, String(settings[key]));
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(settings[key]), class: 'slider' });
  input.addEventListener('input', () => { settings[key] = +input.value; val.textContent = input.value; onChange && onChange(); });
  input.addEventListener('change', () => saveSettings());
  return h('div', { class: 'slider-row' }, h('div', { class: 'slider-head' }, h('span', {}, label), val), input);
}

export function backgroundSection(onChange) {
  const status = h('div', { class: 'set-hint' }, settings.bgImage ? t('bgOwn') : t('bgFromTheme'));
  const pick = h('button', { type: 'button', class: 'btn-small', onclick: async () => {
    const file = await pickImage();
    if (!file) return;
    try {
      const blob = await makeBackground(file);
      await saveAsset('bg', blob);
      settings.bgImage = true;
      await saveSettings();
      status.textContent = t('bgOwn');
      onChange && onChange();
    } catch (e) { flashMsg(e.message, 4000); }
  } }, t('bgPick'));
  const reset = h('button', { type: 'button', class: 'btn-small ghost', onclick: async () => {
    await removeAsset('bg');
    settings.bgImage = false;
    await saveSettings();
    status.textContent = t('bgFromTheme');
    onChange && onChange();
  } }, t('bgReset'));
  return h('div', { class: 'set-block' },
    h('div', { class: 'set-title' }, t('setBackground')),
    status,
    h('div', { class: 'btn-row' }, pick, reset),
    h('div', { class: 'set-hint small' }, LIMITS.bg.hint),
    slider(t('bgBlur'), 'bgBlur', 0, 20, onChange),
    slider(t('bgDim'), 'bgDim', -60, 60, onChange),
  );
}

export function togglesSection(onChange) {
  return h('div', { class: 'set-block' },
    h('div', { class: 'set-title' }, t('setOther')),
    toggleRow(t('setTyping'), 'typing', onChange),
    toggleRow(t('setTrustToast'), 'trustToast', onChange),
    toggleRow(t('setTime'), 'showTime', onChange),
    toggleRow(t('setAvatars'), 'showAvatars', onChange),
    toggleRow(t('setEmoji'), 'showEmoji', onChange),
    toggleRow(t('setPhotos'), 'showPhotos', onChange),
    toggleRow(t('setVideos'), 'showVideos', onChange),
  );
}

// Убрать смайлики из текста (если они выключены в настройках)
const EMOJI_RE = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{1F3FB}-\u{1F3FF}]|‍|️|︎|⃣)/gu;
export function emo(text) {
  if (settings.showEmoji || !text) return text;
  return text.replace(EMOJI_RE, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([.,!?…])/g, '$1').trim();
}

// Скрыто ли сообщение настройками (фото или видео выключены, а подписи нет)
export function hiddenBySettings(item) {
  if (!item || item.t !== 'msg') return false;
  if (item.kind === 'photo' && !settings.showPhotos) return !item.text;
  if (item.kind === 'video' && !settings.showVideos) return !item.text;
  return false;
}

// Настройки с главного экрана
export function openSettings(onChange) {
  const name = h('input', { class: 'set-input', type: 'text', value: settings.appName, maxlength: '40' });
  name.addEventListener('change', () => {
    settings.appName = name.value.trim() || t('appName');
    saveSettings();
    onChange && onChange();
  });
  const content = h('div', {},
    h('h2', {}, t('settingsTitle')),
    h('div', { class: 'set-block' }, h('div', { class: 'set-title' }, t('setAppName')), name),
    themeSection(onChange),
    backgroundSection(onChange),
    togglesSection(onChange),
  );
  const s = sheet(content);
  content.append(h('button', { class: 'btn-wide', type: 'button', onclick: () => s.close() }, t('close')));
}

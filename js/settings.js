// Настройки приложения (этап 1: основные переключатели; полная панель дизайна — этап 3).
import { db } from './storage.js';
import { t } from './i18n.js';
import { h, sheet } from './ui.js';

export const settings = {
  appName: t('appName'),
  lang: 'ru',
  typing: true,
  trustToast: true,
  showTime: true,
  showAvatars: true,
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
  document.body.classList.toggle('no-time', !settings.showTime);
  document.body.classList.toggle('no-avatars', !settings.showAvatars);
  document.title = settings.appName;
}

function toggleRow(label, key, onChange) {
  const input = h('input', { type: 'checkbox' });
  input.checked = !!settings[key];
  input.addEventListener('change', () => { settings[key] = input.checked; saveSettings(); onChange && onChange(); });
  return h('div', { class: 'set-row' }, h('label', {}, label), h('label', { class: 'switch' }, input, h('span')));
}

export function openSettings(onChange) {
  const name = h('input', { class: 'set-input', type: 'text', value: settings.appName, maxlength: '40' });
  name.addEventListener('change', () => {
    settings.appName = name.value.trim() || t('appName');
    saveSettings();
    onChange && onChange();
  });
  const content = h('div', {},
    h('h2', {}, t('settingsTitle')),
    h('div', { class: 'set-row', style: { display: 'block' } }, h('label', {}, t('setAppName')), name),
    toggleRow(t('setTyping'), 'typing', onChange),
    toggleRow(t('setTrustToast'), 'trustToast', onChange),
    toggleRow(t('setTime'), 'showTime', onChange),
    toggleRow(t('setAvatars'), 'showAvatars', onChange),
  );
  const s = sheet(content);
  content.append(h('button', { class: 'btn-wide', type: 'button', onclick: () => s.close() }, t('close')));
}

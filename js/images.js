// Загрузка картинок с телефона: проверка размера, обрезка, уменьшение, хранение.
import { db } from './storage.js';
import { h, pushOverlay, popOverlay } from './ui.js';

export const LIMITS = {
  maxFileMB: 25,
  avatar: { min: 200, out: 512, hint: 'Лучше квадрат 512×512. Меньше 200×200 не подойдёт (будет мутно). JPG, PNG или WebP.' },
  bg: { minShort: 720, minLong: 1280, maxW: 1440, maxH: 3200, hint: 'Лучше вертикальная 1080×2400 (как экран телефона). Меньше 720×1280 не подойдёт. JPG, PNG или WebP.' },
};

// Открыть выбор файла на телефоне
export function pickImage() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    // если в галерее нажали «назад» и ничего не выбрали
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// Окно на весь экран с кнопками «Отмена» и «Готово». Кнопка «Назад» телефона = «Отмена».
function dialog(title, body, okLabel) {
  return new Promise((resolve) => {
    let closed = false;
    const close = (result, fromBack) => {
      if (closed) return;
      closed = true;
      box.remove();
      if (fromBack !== true) popOverlay(onBack);
      resolve(result);
    };
    const onBack = (fromBack) => close(false, fromBack);
    const box = h('div', { class: 'img-dialog' },
      h('div', { class: 'imd-head' },
        h('button', { type: 'button', class: 'imd-btn', onclick: () => close(false) }, 'Отмена'),
        h('div', { class: 'imd-title' }, title),
        h('button', { type: 'button', class: 'imd-btn ok', onclick: () => close(true) }, okLabel)),
      body);
    document.body.append(box);
    pushOverlay(onBack);
  });
}

// Аватарка: окно, где фото можно сдвинуть пальцем и приблизить; круг показывает, что попадёт в аватарку.
// Возвращает готовую картинку 512×512 или null, если нажали «Отмена».
export async function cropAvatar(file) {
  const bmp = await decode(file);
  const W = bmp.width, H = bmp.height;
  if (Math.min(W, H) < LIMITS.avatar.min) throw new Error(`Картинка слишком маленькая (${W}×${H}). Нужно хотя бы ${LIMITS.avatar.min}×${LIMITS.avatar.min}`);
  const S = Math.min(window.innerWidth - 32, 360);           // размер квадрата на экране
  const base = S / Math.min(W, H);                             // при «приближении 1» фото ровно закрывает квадрат
  let z = 1, k = base, ox = (S - W * k) / 2, oy = (S - H * k) / 2;

  const url = URL.createObjectURL(file);
  const img = h('img', { src: url, alt: '', draggable: 'false', class: 'crop-img' });
  const stage = h('div', { class: 'crop-stage', style: { width: S + 'px', height: S + 'px' } }, img, h('div', { class: 'crop-mask' }));
  const zoom = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', class: 'slider crop-zoom' });
  const body = h('div', { class: 'imd-body' }, stage,
    h('div', { class: 'crop-hint' }, 'Сдвиньте фото пальцем, ползунком – приблизить'), zoom);

  const clamp = () => {
    ox = Math.min(0, Math.max(S - W * k, ox));
    oy = Math.min(0, Math.max(S - H * k, oy));
  };
  const draw = () => {
    clamp();
    img.style.width = W * k + 'px';
    img.style.height = H * k + 'px';
    img.style.transform = `translate(${ox}px, ${oy}px)`;
  };
  // приближение вокруг центра квадрата
  const setZoom = (nz) => {
    nz = Math.max(1, Math.min(4, nz));
    const cx = (S / 2 - ox) / k, cy = (S / 2 - oy) / k;
    z = nz; k = base * z;
    ox = S / 2 - cx * k; oy = S / 2 - cy * k;
    zoom.value = String(z);
    draw();
  };
  zoom.addEventListener('input', () => setZoom(+zoom.value));

  // перетаскивание одним пальцем и приближение двумя
  const pts = new Map();
  let pinch = null;
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) { ox += e.clientX - p.x; oy += e.clientY - p.y; draw(); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) setZoom(pinch.z * d / pinch.d); else pinch = { d, z };
    }
  });
  const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(z * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });
  draw();

  const ok = await dialog('Фото', body, 'Готово');
  URL.revokeObjectURL(url);
  if (!ok) return null;
  const side = S / k, sx = -ox / k, sy = -oy / k;
  const out = Math.round(Math.min(LIMITS.avatar.out, side));
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, out, out);
  return toBlob(c, 0.88);
}

// Фон: предпросмотр «как будет в чате» с кнопками «Отмена» и «Поставить»
export async function confirmBackground(blob) {
  const url = URL.createObjectURL(blob);
  const body = h('div', { class: 'imd-body' },
    h('div', { class: 'bg-preview', style: { backgroundImage: `url("${url}")` } },
      h('div', { class: 'bgp-msg in' }), h('div', { class: 'bgp-msg out' }), h('div', { class: 'bgp-msg in short' })),
    h('div', { class: 'crop-hint' }, 'Так фон будет выглядеть в чате'));
  const ok = await dialog('Фон чата', body, 'Поставить');
  URL.revokeObjectURL(url);
  return ok;
}

async function decode(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Нужна картинка JPG, PNG или WebP');
  if (file.size > LIMITS.maxFileMB * 1024 * 1024) throw new Error(`Файл больше ${LIMITS.maxFileMB} МБ. Выберите картинку поменьше`);
  return await createImageBitmap(file);
}

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Аватарка: обрезаем по центру до квадрата и уменьшаем до 512×512
export async function makeAvatar(file) {
  const img = await decode(file);
  const side = Math.min(img.width, img.height);
  if (side < LIMITS.avatar.min) throw new Error(`Картинка слишком маленькая (${img.width}×${img.height}). Нужно хотя бы ${LIMITS.avatar.min}×${LIMITS.avatar.min}`);
  const out = Math.min(LIMITS.avatar.out, side);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  return toBlob(c, 0.88);
}

// Фон: проверяем, что не слишком маленький, и уменьшаем, если слишком большой
export async function makeBackground(file) {
  const img = await decode(file);
  const short = Math.min(img.width, img.height), long = Math.max(img.width, img.height);
  if (short < LIMITS.bg.minShort || long < LIMITS.bg.minLong) {
    throw new Error(`Картинка слишком маленькая (${img.width}×${img.height}). Нужно хотя бы 720×1280`);
  }
  // короткая сторона не больше 1440, длинная не больше 3200
  const scale = Math.min(1, LIMITS.bg.maxW / short, LIMITS.bg.maxH / long);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return toBlob(c, 0.92);
}

// ---- Хранение картинок, которые загрузил пользователь ----
const urls = new Map();

export async function saveAsset(key, blob) {
  await db.set('assets', key, blob);
  if (urls.has(key)) URL.revokeObjectURL(urls.get(key));
  urls.set(key, URL.createObjectURL(blob));
  return urls.get(key);
}

export async function assetUrl(key) {
  if (urls.has(key)) return urls.get(key);
  try {
    const blob = await db.get('assets', key);
    if (!blob) return '';
    urls.set(key, URL.createObjectURL(blob));
    return urls.get(key);
  } catch (e) { return ''; }
}

export async function removeAsset(key) {
  try { await db.del('assets', key); } catch (e) { /* нет */ }
  if (urls.has(key)) { URL.revokeObjectURL(urls.get(key)); urls.delete(key); }
}

// Загрузка картинок с телефона: проверка размера, обрезка, уменьшение, хранение.
import { db } from './storage.js';

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
    document.body.append(input);
    input.click();
  });
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

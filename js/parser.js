// Читает текстовый файл истории (формат описан в ФОРМАТ_ИСТОРИИ.md) и превращает его в данные для приложения.

const PALETTE = ['#FF8A65', '#81C784', '#BA68C8', '#4DD0E1', '#FFD54F', '#F06292', '#9575CD', '#4DB6AC', '#E57373', '#AED581'];

export const sceneKey = (s) => s.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

const HEADER_KEYS = {
  'название': 'title',
  'описание': 'description',
  'чат': 'chatTitle',
  'аватар чата': 'chatAvatar',
  'тип': 'type',
  'я': 'me',
  'язык': 'lang',
  'сериал': 'series',
  'серия': 'episode',
};

export function parseStory(text) {
  const story = {
    title: '', description: '', chatTitle: '', chatAvatar: '', type: '', me: '', lang: 'ru',
    characters: {}, charOrder: [], scenes: {}, sceneOrder: [],
  };
  const errors = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  let mode = 'header';
  let scene = null;
  let lastMsg = null;

  const err = (ln, msg) => errors.push({ line: ln, msg });

  const addChar = (name, props = {}) => {
    if (!story.characters[name]) {
      story.characters[name] = { name, color: '', avatar: '', about: '', trust: 5, side: '', declared: false };
      story.charOrder.push(name);
    }
    Object.assign(story.characters[name], props);
    return story.characters[name];
  };

  const push = (node) => { scene.items.push(node); };

  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    // Новая сцена
    const sm = line.match(/^==\s*(.+?)\s*==$/);
    if (sm) {
      const key = sceneKey(sm[1]);
      if (story.scenes[key]) err(ln, `Сцена «${sm[1]}» уже есть выше`);
      scene = { key, name: sm[1], items: [], line: ln };
      story.scenes[key] = scene;
      story.sceneOrder.push(key);
      mode = 'scene';
      lastMsg = null;
      continue;
    }

    if (mode !== 'scene') {
      if (/^персонажи\s*:?\s*$/i.test(line)) { mode = 'chars'; continue; }
      if (mode === 'chars' && line.startsWith('-')) {
        const parts = line.replace(/^-\s*/, '').split('|').map((p) => p.trim());
        const name = parts.shift();
        if (!name) { err(ln, 'Нет имени персонажа'); continue; }
        const props = { declared: true };
        for (const p of parts) {
          if (p.toLowerCase() === 'я') { story.me = story.me || name; continue; }
          const m = p.match(/^([^:]+):\s*(.*)$/);
          if (!m) { err(ln, `Не понял «${p}» у персонажа ${name}`); continue; }
          const k = m[1].trim().toLowerCase(), v = m[2].trim();
          if (k === 'цвет') props.color = v;
          else if (k === 'аватар') props.avatar = v.toLowerCase() === 'нет' ? '' : v;
          else if (k === 'о себе') props.about = v;
          else if (k === 'доверие') props.trust = clamp(parseInt(v, 10) || 0);
          else if (k === 'сторона') props.side = v.toLowerCase().startsWith('спр') ? 'right' : 'left';
          else err(ln, `Неизвестное свойство «${m[1]}» у персонажа ${name}`);
        }
        addChar(name, props);
        continue;
      }
      const hm = line.match(/^([^:]+):\s*(.*)$/);
      if (hm && HEADER_KEYS[hm[1].trim().toLowerCase()]) {
        story[HEADER_KEYS[hm[1].trim().toLowerCase()]] = hm[2].trim();
        mode = 'header';
        continue;
      }
      // Если сцены ещё нет, а пошли сообщения, создаём сцену «начало» сами
      scene = { key: 'начало', name: 'начало', items: [], line: ln };
      story.scenes[scene.key] = scene;
      story.sceneOrder.push(scene.key);
      mode = 'scene';
    }

    // ---- Внутри сцены ----

    // Продолжение сообщения на новой строке
    if (line.startsWith('|')) {
      if (lastMsg && lastMsg.kind === 'text') lastMsg.text += '\n' + line.slice(1).trim();
      else if (lastMsg) lastMsg.text = (lastMsg.text ? lastMsg.text + '\n' : '') + line.slice(1).trim();
      else err(ln, 'Строка с «|» должна идти сразу после сообщения');
      continue;
    }

    // Кнопка выбора
    if (line.startsWith('?')) {
      const m = line.slice(1).match(/^\s*(.+?)\s*->\s*(.+)$/);
      if (!m) { err(ln, 'У кнопки выбора нет перехода: нужно «? текст -> сцена»'); continue; }
      let last = scene.items[scene.items.length - 1];
      if (!last || last.t !== 'choice') { last = { t: 'choice', options: [], line: ln }; push(last); }
      if (last.options.length >= 3) err(ln, 'Больше 3 кнопок выбора подряд');
      // «Текст кнопки (пояснение)» — пояснение в скобках показывается мелко под кнопкой
      let label = m[1], desc = '';
      const pm = label.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      if (pm && pm[1]) { label = pm[1]; desc = pm[2].trim(); }
      last.options.push({ label, desc, text: label, target: sceneKey(m[2]), trust: [], flags: [], line: ln });
      lastMsg = null;
      continue;
    }

    // Уточнения к кнопке
    const dm = line.match(/^(текст|доверие|запомнить|пояснение)\s*:\s*(.*)$/i);
    const lastNode = scene.items[scene.items.length - 1];
    if (dm && lastNode && lastNode.t === 'choice') {
      const opt = lastNode.options[lastNode.options.length - 1];
      const k = dm[1].toLowerCase(), v = dm[2].trim();
      if (k === 'текст') {
        if (v === '-') { opt.text = ''; opt.msgs = []; }
        else {
          // каждая строка «текст:» — отдельное сообщение героини; первая заменяет текст кнопки
          const node = parseSceneLine('Я: ' + v, ln, err);
          if (!opt.msgs || !opt.msgsFromText) { opt.msgs = []; opt.msgsFromText = true; }
          if (node && node.t === 'msg') opt.msgs.push(node);
          opt.text = opt.msgs.length ? opt.msgs[0].text : v;
        }
      }
      else if (k === 'пояснение') opt.desc = v;
      else if (k === 'доверие') {
        for (const part of v.split(',')) {
          const tm = part.trim().match(/^(.+?)\s*([+-]\d+)$/);
          if (tm) opt.trust.push({ who: tm[1].trim(), delta: parseInt(tm[2], 10) });
          else err(ln, `Не понял доверие «${part.trim()}» (нужно «Имя +1»)`);
        }
      } else if (k === 'запомнить') {
        v.split(',').map((s) => s.trim()).filter(Boolean).forEach((f) => opt.flags.push(f));
      }
      continue;
    }

    const node = parseSceneLine(line, ln, err);
    if (!node) continue;
    push(node);
    lastMsg = node.t === 'msg' ? node : (node.t === 'cond' && node.node.t === 'msg' ? node.node : null);
  }

  // ---- Проверки и доводка ----
  if (!story.title) err(0, 'Нет строки «Название: …» в начале файла');
  if (!story.sceneOrder.length) err(0, 'В истории нет ни одной сцены (строка вида «== начало ==»)');

  const speakers = new Set();
  const visit = (n) => {
    if (n.t === 'msg') speakers.add(n.who);
    if (n.t === 'cond') visit(n.node);
  };
  for (const key of story.sceneOrder) {
    for (const n of story.scenes[key].items) {
      visit(n);
      const targets = [];
      if (n.t === 'jump') targets.push(n);
      if (n.t === 'choice') targets.push(...n.options);
      for (const tg of targets) {
        if (!story.scenes[tg.target]) err(tg.line, `Нет сцены «${tg.target}» (нужна строка «== ${tg.target} ==»)`);
      }
    }
  }
  if (!story.me) {
    // Если главный герой не указан, считаем им того, кто пишет «Я:»
    story.me = 'Я';
  }
  for (const who of speakers) {
    if (who === 'Я') continue;
    if (!story.characters[who]) addChar(who);
  }
  if (!story.characters[story.me] && story.me !== 'Я') addChar(story.me);

  let pi = 0;
  for (const name of story.charOrder) {
    const c = story.characters[name];
    if (!c.color) c.color = PALETTE[pi++ % PALETTE.length];
    if (!c.side) c.side = name === story.me ? 'right' : 'left';
  }

  story.others = story.charOrder.filter((n) => n !== story.me);
  if (!story.type) story.type = story.others.length > 1 ? 'группа' : 'личный';
  story.isGroup = story.type.toLowerCase().startsWith('гр');
  if (!story.chatTitle) story.chatTitle = story.isGroup ? story.title : (story.others[0] || story.title);

  // Серии: «Сериал: Светлый» + «Серия: 2», или название вида «Светлый. Серия 2: Вежливые»
  if (!story.series || !story.episode) {
    const sm2 = story.title.match(/^(.*?)[\s.,:—-]*серия\s*(\d+)/i);
    if (sm2 && sm2[1].trim()) {
      story.series = story.series || sm2[1].trim();
      story.episode = story.episode || sm2[2];
    }
  }
  story.episode = parseInt(story.episode, 10) || 0;
  if (!story.episode) story.series = '';

  return { story, errors };
}

const clamp = (n) => Math.max(0, Math.min(10, n));

function parseCond(s, ln, err) {
  s = s.trim();
  const tm = s.match(/^доверие\s+(.+?)\s*(>=|<=|>|<|=)\s*(-?\d+)$/i);
  if (tm) return { type: 'trust', who: tm[1].trim(), op: tm[2], value: parseInt(tm[3], 10) };
  const nm = s.match(/^не\s+(\S+)$/i);
  if (nm) return { type: 'flag', name: nm[1], neg: true };
  if (/^\S+$/.test(s)) return { type: 'flag', name: s, neg: false };
  err(ln, `Не понял условие «${s}»`);
  return { type: 'flag', name: s, neg: false };
}

function parseSceneLine(line, ln, err) {
  // Переход
  let m = line.match(/^->\s*(.+)$/);
  if (m) return { t: 'jump', target: sceneKey(m[1]), line: ln };

  // Условие
  m = line.match(/^если\s+(.*)$/i);
  if (m) {
    const rest = m[1];
    const iArrow = rest.indexOf('->');
    const iColon = rest.indexOf(':');
    if (iArrow >= 0 && (iColon < 0 || iArrow < iColon)) {
      return { t: 'jump', target: sceneKey(rest.slice(iArrow + 2)), cond: parseCond(rest.slice(0, iArrow), ln, err), line: ln };
    }
    if (iColon >= 0) {
      const inner = parseSceneLine(rest.slice(iColon + 1).trim(), ln, err);
      if (!inner) return null;
      return { t: 'cond', cond: parseCond(rest.slice(0, iColon), ln, err), node: inner, line: ln };
    }
    err(ln, 'После «если …» нужно «-> сцена» или «: сообщение»');
    return null;
  }

  // Команда в квадратных скобках
  m = line.match(/^\[\s*([^\s\]]+)\s*(.*?)\s*\]$/);
  if (m) {
    const cmd = m[1].toLowerCase(), arg = m[2];
    switch (cmd) {
      case 'время': return { t: 'time', value: arg, line: ln };
      case 'дата': return { t: 'date', text: arg, line: ln };
      case 'система': return { t: 'system', text: arg, line: ln };
      case 'печатает': return { t: 'typing', sec: parseFloat(arg.replace(',', '.').match(/[\d.]+/)?.[0] || '2'), line: ln };
      case 'звук': return { t: 'sound', name: arg.toLowerCase(), line: ln };
      case 'эффект': return { t: 'effect', name: arg.toLowerCase(), line: ln };
      case 'доверие': {
        const tm = arg.match(/^(.+?)\s*([+-]\d+)$/);
        if (!tm) { err(ln, 'Нужно «[доверие Имя +1]»'); return null; }
        return { t: 'trust', who: tm[1].trim(), delta: parseInt(tm[2], 10), line: ln };
      }
      case 'запомнить': return { t: 'flag', name: arg, on: true, line: ln };
      case 'забыть': return { t: 'flag', name: arg, on: false, line: ln };
      case 'конец': return { t: 'end', title: arg, line: ln };
      case 'вибрация': {
        const ms = parseInt(arg, 10);
        return { t: 'vibrate', pattern: ms > 0 ? [Math.min(ms, 3000)] : [400, 150, 400], line: ln };
      }
      case 'фон': return { t: 'bg', file: /^нет$/i.test(arg) ? '' : arg, line: ln };
      // [закрепить] или [закрепить Аня] — закрепить последнее сообщение; [открепить]
      case 'закрепить': return { t: 'pin', who: arg, line: ln };
      case 'открепить': return { t: 'unpin', line: ln };
      // [изменить Аня: новый текст] — Аня исправляет своё последнее сообщение
      case 'изменить': {
        const em = arg.match(/^([^:]+):\s*(.+)$/);
        if (!em) { err(ln, 'Нужно «[изменить Имя: новый текст]»'); return null; }
        return { t: 'edit', who: em[1].trim(), text: em[2], line: ln };
      }
      case 'реакция': {
        // [реакция Аня 😱] — последний «кусок» строки это эмодзи, перед ним имя
        const rm = arg.match(/^(.+?)\s+(\S+)$/u);
        if (!rm) { err(ln, 'Нужно «[реакция Имя 😱]»'); return null; }
        return { t: 'react', who: rm[1].trim(), emoji: rm[2], line: ln };
      }
      default:
        err(ln, `Неизвестная команда «[${m[1]}]»`);
        return null;
    }
  }

  // Сообщение «Имя: текст»
  const ci = line.indexOf(':');
  if (ci > 0 && ci <= 40) {
    const who = line.slice(0, ci).trim();
    let body = line.slice(ci + 1).trim();
    const msg = { t: 'msg', who, kind: 'text', text: body, file: '', line: ln };
    // Пометки в начале сообщения (можно несколько): [ответ Имя], [переслано Имя], [изменено]
    for (;;) {
      let pm = body.match(/^\[\s*ответ\s+([^\]]+?)\s*\]\s*/i);
      if (pm) { msg.replyTo = pm[1]; body = body.slice(pm[0].length); continue; }
      pm = body.match(/^\[\s*переслано(?:\s+от)?\s+([^\]]+?)\s*\]\s*/i);
      if (pm) { msg.forwarded = pm[1]; body = body.slice(pm[0].length); continue; }
      pm = body.match(/^\[\s*изменено\s*\]\s*/i);
      if (pm) { msg.edited = true; body = body.slice(pm[0].length); continue; }
      break;
    }
    msg.text = body;
    // [фото скрыто файл] — размытое фото, открывается нажатием; [фото скрыто! файл] — страшное открытие
    let bm = body.match(/^\[\s*фото\s+скрыто(!?)\s+([^\]]+?)\s*\]\s*(.*)$/i);
    if (bm) { msg.kind = 'photo'; msg.hidden = bm[1] ? 'scary' : 'soft'; msg.file = bm[2]; msg.text = bm[3]; return msg; }
    bm = body.match(/^\[\s*фото\s+([^\]]+?)\s*\]\s*(.*)$/i);
    if (bm) { msg.kind = 'photo'; msg.file = bm[1]; msg.text = bm[2]; return msg; }
    bm = body.match(/^\[\s*видео\s+([^\]]+?)\s*\]\s*(.*)$/i);
    if (bm) { msg.kind = 'video'; msg.file = bm[1]; msg.text = bm[2]; return msg; }
    bm = body.match(/^\[\s*стикер\s+([^\]]+?)\s*\]\s*$/i);
    if (bm) { msg.kind = 'sticker'; msg.file = bm[1]; msg.text = ''; return msg; }
    if (/^\[\s*удалено\s*\]$/i.test(body)) { msg.kind = 'deleted'; msg.text = ''; return msg; }
    if (!body) { err(ln, `Пустое сообщение у «${who}»`); return null; }
    return msg;
  }

  err(ln, `Не понял строку: «${line.slice(0, 60)}»`);
  return null;
}

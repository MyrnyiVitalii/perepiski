// «Двигатель» истории: где мы сейчас, что запомнено, доверие, откат назад.

const MAX_SNAPSHOTS = 400;
const clamp = (n) => Math.max(0, Math.min(10, n));

export function nowTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export class Engine {
  constructor(story, saved, carry = null) {
    this.story = story;
    this.carry = carry; // доверие и «запомненное» из прошлой серии
    if (saved && saved.state && story.scenes[saved.state.scene]) {
      this.state = saved.state;
      this.snapshots = saved.snapshots || [];
    } else {
      this.reset();
    }
  }

  freshState() {
    const trust = {};
    for (const name of this.story.charOrder) trust[name] = this.story.characters[name].trust;
    let flags = {};
    if (this.carry) {
      for (const [name, v] of Object.entries(this.carry.trust || {})) if (name in trust) trust[name] = v;
      flags = { ...(this.carry.flags || {}) };
    }
    return {
      scene: this.story.sceneOrder[0], index: 0,
      flags, trust, time: '', nextTyping: null, bg: '',
      log: [], atChoice: false, ended: null, seq: 0, myReact: {},
    };
  }

  reset() {
    this.state = this.freshState();
    this.snapshots = [];
  }

  serialize() {
    return { state: this.state, snapshots: this.snapshots };
  }

  isMe(who) {
    return who === 'Я' || who === this.story.me;
  }

  current() {
    const sc = this.story.scenes[this.state.scene];
    return sc ? sc.items[this.state.index] : null;
  }

  currentChoice() {
    const n = this.current();
    return this.state.atChoice && n && n.t === 'choice' ? n : null;
  }

  pushSnap() {
    const s = this.state;
    this.snapshots.push({
      scene: s.scene, index: s.index, flags: { ...s.flags }, trust: { ...s.trust },
      time: s.time, nextTyping: s.nextTyping, logLen: s.log.length,
      atChoice: s.atChoice, ended: s.ended, seq: s.seq, bg: s.bg || '',
    });
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  restore(snap) {
    const s = this.state;
    Object.assign(s, {
      scene: snap.scene, index: snap.index, flags: { ...snap.flags }, trust: { ...snap.trust },
      time: snap.time, nextTyping: snap.nextTyping, atChoice: snap.atChoice, ended: snap.ended, seq: snap.seq,
      bg: snap.bg || '',
    });
    s.log.length = snap.logLen;
  }

  backOne() {
    const snap = this.snapshots.pop();
    if (!snap) return false;
    this.restore(snap);
    return true;
  }

  backChoice() {
    for (let i = this.snapshots.length - 1; i >= 0; i--) {
      if (this.snapshots[i].atChoice) {
        const snap = this.snapshots[i];
        this.snapshots.length = i;
        this.restore(snap);
        return true;
      }
    }
    return false;
  }

  evalCond(c) {
    if (c.type === 'flag') return !!this.state.flags[c.name] !== c.neg;
    const v = this.state.trust[c.who] ?? 5;
    switch (c.op) {
      case '>=': return v >= c.value;
      case '<=': return v <= c.value;
      case '>': return v > c.value;
      case '<': return v < c.value;
      default: return v === c.value;
    }
  }

  goto(key) {
    this.state.scene = key;
    this.state.index = 0;
  }

  nextScene() {
    const order = this.story.sceneOrder;
    const i = order.indexOf(this.state.scene);
    if (i < 0 || i + 1 >= order.length) return false;
    this.goto(order[i + 1]);
    return true;
  }

  applyTrust(who, delta, ctx) {
    this.state.trust[who] = clamp((this.state.trust[who] ?? 5) + delta);
    ctx.toasts.push({ who, delta });
  }

  makeItem(fields) {
    this.state.seq += 1;
    return { id: this.state.seq, time: this.state.time || nowTime(), ...fields };
  }

  // Обработка одной строки сцены. Возвращает: 'next', 'jumped', 'choice' или готовый элемент для ленты
  process(node, ctx) {
    const s = this.state;
    switch (node.t) {
      case 'time': s.time = node.value; return 'next';
      case 'typing': s.nextTyping = node.sec; return 'next';
      case 'sound': ctx.sounds.push(node.name); return 'next';
      case 'effect': ctx.effects.push(node.name); return 'next';
      case 'vibrate': ctx.vibro.push(node.pattern); return 'next';
      case 'bg': s.bg = node.file; ctx.bgChanged = true; return 'next';
      case 'react': {
        // реакция ставится на последнее сообщение в ленте
        let target = null;
        for (let i = s.log.length - 1; i >= 0; i--) if (s.log[i].t === 'msg') { target = s.log[i].id; break; }
        if (target == null) return 'next';
        return this.makeItem({ t: 'react', who: node.who, emoji: node.emoji, target });
      }
      case 'trust': this.applyTrust(node.who, node.delta, ctx); return 'next';
      case 'flag':
        if (node.on) s.flags[node.name] = true; else delete s.flags[node.name];
        return 'next';
      case 'jump':
        if (node.cond && !this.evalCond(node.cond)) return 'next';
        this.goto(node.target);
        return 'jumped';
      case 'cond':
        if (!this.evalCond(node.cond)) return 'next';
        return this.process(node.node, ctx);
      case 'choice':
        return 'choice';
      case 'date':
        return this.makeItem({ t: 'date', text: node.text });
      case 'system':
        return this.makeItem({ t: 'system', text: node.text });
      case 'end':
        s.ended = node.title || '';
        return this.makeItem({ t: 'end', title: node.title || '' });
      case 'msg': {
        const me = this.isMe(node.who);
        const item = this.makeItem({
          t: 'msg', who: me ? this.story.me : node.who, me,
          kind: node.kind, text: node.text, file: node.file, line: node.line,
        });
        if (!me) {
          ctx.typing = s.nextTyping != null ? s.nextTyping : 1 + Math.random();
          ctx.typingWho = node.who;
        }
        s.nextTyping = null;
        return item;
      }
      default:
        return 'next';
    }
  }

  // Один тап: выполнить команды до следующего видимого сообщения
  step() {
    const s = this.state;
    if (s.ended !== null || s.atChoice) return null;
    this.pushSnap();
    const ctx = { effects: [], sounds: [], toasts: [], vibro: [], typing: 0, typingWho: '', item: null, choice: false, bgChanged: false };
    for (let guard = 0; guard < 20000; guard++) {
      const node = this.current();
      if (!node) {
        if (this.nextScene()) continue;
        s.ended = '';
        ctx.item = this.makeItem({ t: 'end', title: '' });
        s.log.push(ctx.item);
        return ctx;
      }
      const r = this.process(node, ctx);
      if (r === 'jumped') continue;
      if (r === 'choice') {
        // Видимых изменений нет, поэтому этот шаг не нужно запоминать для отката
        this.snapshots.pop();
        s.atChoice = true;
        ctx.choice = true;
        return ctx;
      }
      s.index += 1;
      if (r !== 'next') {
        ctx.item = r;
        s.log.push(r);
        // Если сразу после сообщения идёт выбор, кнопки появляются без лишнего тапа
        const nx = this.current();
        if (s.ended === null && nx && nx.t === 'choice') {
          s.atChoice = true;
          ctx.choice = true;
        }
        return ctx;
      }
    }
    throw new Error('История зациклилась: проверьте переходы «->»');
  }

  // Нажата кнопка выбора
  choose(i) {
    const node = this.currentChoice();
    if (!node) return null;
    const opt = node.options[i];
    this.pushSnap();
    const ctx = { effects: [], sounds: [], toasts: [], vibro: [], item: null, bgChanged: false };
    if (opt.text) {
      ctx.item = this.makeItem({ t: 'msg', who: this.story.me, me: true, kind: 'text', text: opt.text, file: '' });
      this.state.log.push(ctx.item);
    }
    for (const tr of opt.trust) this.applyTrust(tr.who, tr.delta, ctx);
    for (const f of opt.flags) this.state.flags[f] = true;
    this.state.atChoice = false;
    this.goto(opt.target);
    return ctx;
  }
}

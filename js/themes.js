// Готовые темы оформления (как темы чата в мессенджере).
// Каждая тема — набор цветов. Их можно менять и добавлять новые.

const base = {
  '--r': '16px', '--rc': '16px', '--bubble-opacity': '1',
  // цвета имён в группе, как в Telegram (тёмные темы); светлые темы ниже переопределяют их
  '--peer-0': '#E88878', '--peer-1': '#E8AB5A', '--peer-2': '#8C8DEA', '--peer-3': '#7DD071', '--peer-4': '#53CCC6', '--peer-5': '#5CADEA', '--peer-6': '#E8749A',
};

export const THEMES = {
  night: {
    name: 'Ночная',
    vars: {
      '--bg': '#0e1621', '--chat-bg': 'linear-gradient(160deg, #0f1b2a 0%, #0e1621 55%, #121a24 100%)',
      '--header-bg': '#17212b', '--header-text': '#f5f5f5', '--header-sub': '#7f91a4', '--icon': '#8b9aa9', '--accent': '#5eb5f7',
      '--bottom-bg': '#17212b', '--bottom-text': '#7f91a4', '--bottom-icon': '#8b9aa9',
      '--list-text': '#f5f5f5', '--list-sub': '#7f91a4',
      '--in-bg': '#182533', '--in-text': '#f5f5f5', '--out-bg': '#2b5278', '--out-text': '#f5f5f5',
      '--meta': '#7d8e9e', '--out-meta': '#7da8d3', '--sys-bg': 'rgba(0,0,0,.35)', '--sys-text': '#e6edf3',
      '--choice-bg': '#2b5278', '--choice-text': '#ffffff', '--choice-sub': 'rgba(255,255,255,.7)', '--choice-border': 'rgba(255,255,255,.08)',
      '--sheet-bg': '#17212b', '--sheet-text': '#f5f5f5', '--line': 'rgba(255,255,255,.07)', '--field-bg': 'rgba(0,0,0,.25)',
    },
    themeColor: '#17212b',
  },
  day: {
    name: 'Светлая',
    vars: {
      '--bg': '#ffffff', '--chat-bg': 'linear-gradient(160deg, #cfe3b8 0%, #b9d6a3 50%, #a9cf9a 100%)',
      '--header-bg': '#517da2', '--header-text': '#ffffff', '--header-sub': 'rgba(255,255,255,.75)', '--icon': '#ffffff', '--accent': '#3a8fd6',
      '--bottom-bg': '#ffffff', '--bottom-text': '#9aa4ad', '--bottom-icon': '#8a97a3',
      '--list-text': '#1c1c1c', '--list-sub': '#8a8a8a',
      '--peer-0': '#CC5049', '--peer-1': '#D67722', '--peer-2': '#955CDB', '--peer-3': '#40A920', '--peer-4': '#309EBA', '--peer-5': '#368AD1', '--peer-6': '#C7508B',
      '--in-bg': '#ffffff', '--in-text': '#111111', '--out-bg': '#effedd', '--out-text': '#111111',
      '--meta': '#a0acb6', '--out-meta': '#5fa95f', '--sys-bg': 'rgba(60,90,50,.45)', '--sys-text': '#ffffff',
      '--choice-bg': '#517da2', '--choice-text': '#ffffff', '--choice-sub': 'rgba(255,255,255,.8)', '--choice-border': 'rgba(0,0,0,.06)',
      '--sheet-bg': '#ffffff', '--sheet-text': '#1c1c1c', '--line': 'rgba(0,0,0,.08)', '--field-bg': 'rgba(0,0,0,.05)',
    },
    themeColor: '#517da2',
  },
  horror: {
    name: 'Хоррор',
    vars: {
      '--bg': '#0a0505', '--chat-bg': 'radial-gradient(ellipse at 50% 20%, #3a0a0d 0%, #140405 55%, #050202 100%)',
      '--header-bg': '#120607', '--header-text': '#f3e3e3', '--header-sub': '#a86b6b', '--icon': '#b07a7a', '--accent': '#e53935',
      '--bottom-bg': '#120607', '--bottom-text': '#8d5a5a', '--bottom-icon': '#a06a6a',
      '--list-text': '#f3e3e3', '--list-sub': '#a07575',
      '--in-bg': '#1f0c0d', '--in-text': '#f1dede', '--out-bg': '#5c1016', '--out-text': '#ffffff',
      '--meta': '#9a6a6a', '--out-meta': '#e89a9a', '--sys-bg': 'rgba(120,0,0,.35)', '--sys-text': '#ffdede',
      '--choice-bg': '#6d1219', '--choice-text': '#ffffff', '--choice-sub': 'rgba(255,220,220,.75)', '--choice-border': 'rgba(255,60,60,.25)',
      '--sheet-bg': '#160809', '--sheet-text': '#f3e3e3', '--line': 'rgba(255,120,120,.1)', '--field-bg': 'rgba(0,0,0,.35)',
    },
    themeColor: '#120607',
  },
  pink: {
    name: 'Розовая',
    vars: {
      '--bg': '#fff7fb', '--chat-bg': 'linear-gradient(160deg, #fde4ef 0%, #f9d2e4 50%, #f3c2dc 100%)',
      '--header-bg': '#d9578e', '--header-text': '#ffffff', '--header-sub': 'rgba(255,255,255,.8)', '--icon': '#ffffff', '--accent': '#d9578e',
      '--bottom-bg': '#ffffff', '--bottom-text': '#c79aae', '--bottom-icon': '#d07aa0',
      '--list-text': '#3a2330', '--list-sub': '#a07d8e',
      '--peer-0': '#CC5049', '--peer-1': '#D67722', '--peer-2': '#955CDB', '--peer-3': '#40A920', '--peer-4': '#309EBA', '--peer-5': '#368AD1', '--peer-6': '#C7508B',
      '--in-bg': '#ffffff', '--in-text': '#3a2330', '--out-bg': '#ffd1e3', '--out-text': '#3a2330',
      '--meta': '#c098aa', '--out-meta': '#c9628f', '--sys-bg': 'rgba(180,60,110,.45)', '--sys-text': '#ffffff',
      '--choice-bg': '#d9578e', '--choice-text': '#ffffff', '--choice-sub': 'rgba(255,255,255,.85)', '--choice-border': 'rgba(0,0,0,.05)',
      '--sheet-bg': '#ffffff', '--sheet-text': '#3a2330', '--line': 'rgba(120,40,80,.1)', '--field-bg': 'rgba(217,87,142,.07)',
    },
    themeColor: '#d9578e',
  },
  emerald: {
    name: 'Изумрудная',
    vars: {
      '--bg': '#0b1a17', '--chat-bg': 'linear-gradient(160deg, #0f2a24 0%, #0b1f1a 55%, #081512 100%)',
      '--header-bg': '#10302a', '--header-text': '#eafff7', '--header-sub': '#7fb3a3', '--icon': '#8cc4b2', '--accent': '#4fd1a5',
      '--bottom-bg': '#10302a', '--bottom-text': '#6f9e90', '--bottom-icon': '#8cc4b2',
      '--list-text': '#eafff7', '--list-sub': '#7fb3a3',
      '--in-bg': '#143a32', '--in-text': '#eafff7', '--out-bg': '#1f6b57', '--out-text': '#ffffff',
      '--meta': '#7fae9f', '--out-meta': '#a4e6cf', '--sys-bg': 'rgba(0,0,0,.35)', '--sys-text': '#e0fff4',
      '--choice-bg': '#1f6b57', '--choice-text': '#ffffff', '--choice-sub': 'rgba(255,255,255,.75)', '--choice-border': 'rgba(255,255,255,.08)',
      '--sheet-bg': '#10302a', '--sheet-text': '#eafff7', '--line': 'rgba(255,255,255,.08)', '--field-bg': 'rgba(0,0,0,.25)',
    },
    themeColor: '#10302a',
  },
};

export function applyTheme(id) {
  const th = THEMES[id] || THEMES.night;
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries({ ...base, ...th.vars })) root.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', th.themeColor);
}

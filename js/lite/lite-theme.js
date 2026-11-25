/**
 * js/lite-theme.js
 * Bảng màu chuẩn 60 – 30 – 10 (Nền Đen Than Lạnh chủ đạo + Ánh màu môn tinh tế):
 * - Khử hoàn toàn màu nâu bùn của môn Hóa bằng nền Đen Chàm Lạnh (#070912 -> #121320) kết hợp quầng Vàng Hổ Phách (#f59e0b) trong trẻo.
 * - Các môn Toán, Lý, Sinh, Tin đều giữ nền tối sâu sang trọng, chỉ điểm ánh màu môn ở góc.
 */
(function (global) {
  'use strict';

  const { SUBJECTS } = global.StudyData;
  const Icons = global.LiteIcons;

  const PALETTES = {
    home: {
      bg: ['#03040a', '#060812', '#090d19'],
      support: '#1d5be0',
      accent: '#dfe5eb',
      spark: '#d4ff24',
      soft: '#9aa6ba',
      deco: ['star', 'planet', 'integral', 'orbit', 'atom', 'comet', 'star', 'benzene', 'constellation', 'dna', 'planet', 'code', 'star', 'orbit'],
    },
    'Toán': {
      bg: ['#03060e', '#06101f', '#0a182d'],
      support: '#0284c7',
      spark: '#38bdf8',
      soft: '#a8c5e2',
      deco: ['integral', 'triangle', 'pi', 'parabola', 'sigma', 'compass', 'infinity', 'sqrt', 'axes', 'pi', 'integral', 'triangle', 'sigma', 'parabola'],
    },
    'Lý': {
      bg: ['#05040d', '#0c081c', '#130d2a'],
      support: '#7c3aed',
      spark: '#c084fc',
      soft: '#c4b2e4',
      deco: ['atom', 'bolt', 'wave', 'magnet', 'emc', 'lens', 'pendulum', 'spring', 'atom', 'wave', 'bolt', 'magnet', 'emc', 'lens'],
    },
    'Hóa': {
      // Nền Đen Chàm Lạnh kết hợp ánh Vàng Cam Hổ Phách -> không bao giờ bị xỉn màu nâu đất
      bg: ['#05060c', '#0a0b15', '#100f1b'],
      support: '#f59e0b',
      spark: '#fbbf24',
      soft: '#d8c9ae',
      deco: ['benzene', 'flask', 'tile', 'molecule', 'water', 'tube', 'bubbles', 'benzene', 'flask', 'molecule', 'tile', 'tube', 'water', 'bubbles'],
    },
    'Sinh': {
      bg: ['#030907', '#061511', '#091f19'],
      support: '#10b981',
      spark: '#34d399',
      soft: '#a6d6c2',
      deco: ['dna', 'leaf', 'cell', 'microscope', 'chromosome', 'pulse', 'leaf', 'dna', 'cell', 'chromosome', 'microscope', 'leaf', 'pulse', 'cell'],
    },
    'Tin': {
      bg: ['#07040a', '#120715', '#1b0b1e'],
      support: '#db2777',
      spark: '#f472b6',
      soft: '#dfb2c8',
      deco: ['code', 'chip', 'binary', 'cursor', 'wifi', 'database', 'terminal', 'gear', 'code', 'binary', 'chip', 'terminal', 'cursor', 'database'],
    },
  };

  const FALLBACK = {
    bg: ['#03040a', '#070a14', '#0a0f1f'],
    support: '#3b4a8c',
    spark: '#7dd3fc',
    soft: '#9aa6ba',
    deco: ['star', 'planet', 'orbit', 'comet', 'constellation', 'star', 'planet'],
  };

  const TILE = 440;
  const SLOTS = [
    [44, 52, 34, -12, 0.08], [156, 34, 26, 18, 0.055], [276, 72, 40, 8, 0.07], [392, 44, 28, -20, 0.05],
    [92, 166, 30, 24, 0.06], [216, 178, 46, -6, 0.08], [346, 176, 32, 14, 0.055], [38, 290, 40, 6, 0.07],
    [146, 270, 28, -18, 0.05], [266, 300, 34, 22, 0.075], [392, 290, 42, -10, 0.06], [86, 392, 30, 12, 0.055],
    [206, 400, 26, -24, 0.07], [326, 396, 36, 4, 0.05],
  ];

  const cache = new Map();

  function slugOf(name) {
    return String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function nameOfSlug(slug) {
    return Object.keys(SUBJECTS).find((n) => slugOf(n) === slug) || null;
  }

  function rgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function getTheme(key) {
    if (cache.has(key)) return cache.get(key);
    const isHome = key === 'home';
    const info = isHome ? null : SUBJECTS[key];
    const base = PALETTES[key] || FALLBACK;
    const theme = {
      key,
      slug: isHome ? 'home' : slugOf(key),
      bg: base.bg,
      support: base.support,
      accent: base.accent || (info && info.accent) || '#dfe5eb',
      spark: base.spark,
      soft: base.soft,
      deco: base.deco,
      background: '',
    };
    cache.set(key, theme);
    return theme;
  }

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const url = (markup) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}")`;
  const FONT = "Georgia, 'Times New Roman', serif";

  function decoMarkup(ic, color, strokeWidth) {
    let out = '';
    if (ic.d) {
      out += `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ic.d.replace(/%C%/g, color).replace(/currentColor/g, color)}</g>`;
    }
    if (ic.t) {
      out += `<text x="12" y="${ic.y || 17}" text-anchor="middle" font-family="${FONT}" font-size="${ic.size || 16}"${ic.italic ? ' font-style="italic"' : ''} fill="${color}">${esc(ic.t)}</text>`;
    }
    if (ic.texts) {
      for (const t of ic.texts) {
        out += `<text x="${t.x}" y="${t.y}" text-anchor="middle" font-family="${FONT}" font-size="${t.size}" fill="${color}">${esc(t.t)}</text>`;
      }
    }
    return out;
  }

  function buildPattern(theme) {
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">`;
    SLOTS.forEach(([x, y, size, rot, op], i) => {
      const ic = Icons.deco[theme.deco[i % theme.deco.length]];
      if (!ic) return;
      const k = size / 24;
      const sw = (1.32 / k).toFixed(2);
      s += `<g opacity="${op}" transform="translate(${x} ${y}) rotate(${rot}) scale(${k.toFixed(3)}) translate(-12 -12)">${decoMarkup(ic, theme.accent, sw)}</g>`;
    });
    return s + '</svg>';
  }

  function buildMark(theme) {
    const inner = theme.key === 'home'
      ? Icons.deco.planet.d
      : Icons.subjectInner(theme.key);
    const markup = inner.replace(/currentColor/g, theme.accent).replace(/%C%/g, theme.accent);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 26 26"><g fill="none" stroke="${theme.accent}" stroke-width=".42" stroke-linecap="round" stroke-linejoin="round" opacity=".06">${markup}</g></svg>`;
  }

  function buildBackground(theme) {
    if (theme.background) return theme.background;
    const [c0, c1, c2] = theme.bg;
    const layers = [
      `${url(buildMark(theme))} right -12vmin bottom -10vmin / min(80vmin, 640px) no-repeat`,
      `${url(buildPattern(theme))} 0 0 / ${TILE}px ${TILE}px repeat`,
      `radial-gradient(54% 42% at 88% 4%, rgba(${rgb(theme.support)}, .09), transparent 68%)`,
      `radial-gradient(48% 40% at 6% 96%, rgba(${rgb(theme.accent)}, .035), transparent 66%)`,
      `linear-gradient(160deg, ${c0} 0%, ${c1} 54%, ${c2} 100%)`,
    ];
    theme.background = layers.join(', ');
    return theme.background;
  }

  let layers = [];
  let activeIndex = -1;
  let currentKey = null;

  function init(layerEls) {
    layers = Array.from(layerEls);
  }

  function setVars(theme) {
    const st = document.documentElement.style;
    st.setProperty('--accent', theme.accent);
    st.setProperty('--accent-rgb', rgb(theme.accent));
    st.setProperty('--support', theme.support);
    st.setProperty('--support-rgb', rgb(theme.support));
    st.setProperty('--spark', theme.spark);
    st.setProperty('--spark-rgb', rgb(theme.spark));
    st.setProperty('--soft', theme.soft);
    st.setProperty('--base-rgb', rgb(theme.bg[0]));
    st.setProperty('--mid-rgb', rgb(theme.bg[1]));
    document.body.dataset.theme = theme.slug;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.bg[0]);
  }

  function applyTheme(key) {
    const theme = getTheme(key);
    if (currentKey === theme.key) return theme;
    currentKey = theme.key;
    setVars(theme);
    if (!layers.length) return theme;

    const nextIndex = activeIndex === 0 ? 1 : 0;
    const next = layers[nextIndex];
    const prev = activeIndex >= 0 ? layers[activeIndex] : null;
    next.style.background = buildBackground(theme);

    if (!prev) {
      next.classList.add('is-on', 'no-fade');
      requestAnimationFrame(() => next.classList.remove('no-fade'));
    } else {
      next.classList.add('is-on');
      prev.classList.remove('is-on');
    }
    activeIndex = nextIndex;
    return theme;
  }

  global.LiteTheme = { init, getTheme, applyTheme, slugOf, nameOfSlug, rgb };
})(window);

/**
 * js/lite-icons.js
 * Bộ icon SVG inline cho Giao diện Nhẹ (KnowVerse):
 *  - ui:      icon nút bấm (quay về, mũi tên, tìm kiếm, thêm, khóa, đăng xuất, logo, Google)
 *  - subject: icon đại diện 5 môn với đường nét thoáng, tách biệt rõ ràng, không chồng chéo nét
 *  - deco:    icon trang trí nền chìm tĩnh (vẽ 1 lần bởi lite-theme.js)
 */
(function (global) {
  'use strict';

  const svg = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

  const STAR_PATH = 'M12 2.5l2.1 7.4 7.4 2.1-7.4 2.1L12 21.5l-2.1-7.4L2.5 12l7.4-2.1z';

  const ui = {
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    chevronDown: svg('<path d="M6 9l6 6 6-6"/>'),
    arrow: svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    logout: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>'),
    brand: svg(`<path d="${STAR_PATH}"/>`),
    google: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      + '<path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>'
      + '<path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>'
      + '<path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>'
      + '<path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>'
      + '</svg>',
  };

  /** Phần ruột icon 5 môn: thiết kế tối giản, khoảng hở rộng, không có nét nhỏ chồng lên nhau. */
  const SUBJECT_INNER = {
    'Toán':
      '<path d="M15.5 4c-1.6-1-3.4-.2-3.7 1.7l-1.6 12.6c-.3 1.9-2.1 2.7-3.7 1.7"/>'
      + '<path d="M8.2 12h7.6"/>',
    'Lý':
      '<circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>'
      + '<ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(30 12 12)"/>'
      + '<ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(-30 12 12)"/>',
    'Hóa':
      '<path d="M9 3h6"/>'
      + '<path d="M10 3v5.8L4.8 18a2.2 2.2 0 0 0 1.9 3.3h10.6a2.2 2.2 0 0 0 1.9-3.3L14 8.8V3"/>'
      + '<path d="M6.8 15.5h10.4"/>',
    'Sinh':
      '<path d="M7 3c0 4.5 10 4.5 10 9s-10 4.5-10 9"/>'
      + '<path d="M17 3c0 4.5-10 4.5-10 9s10 4.5 10 9"/>'
      + '<path d="M8.5 5h7M8.5 19h7"/>',
    'Tin':
      '<path d="M8 7.5L3.5 12 8 16.5"/>'
      + '<path d="M16 7.5l4.5 4.5-4.5 4.5"/>'
      + '<path d="M13.5 5l-3 14"/>',
  };

  function subjectInner(name) {
    return SUBJECT_INNER[name] || `<path d="${STAR_PATH}"/>`;
  }

  function subject(name) {
    return svg(subjectInner(name));
  }

  /** Icon trang trí nền chìm (khung 24×24). */
  const deco = {
    star: { d: `<path d="${STAR_PATH}"/>` },
    planet: { d: '<circle cx="12" cy="12" r="5.2"/><ellipse cx="12" cy="12" rx="10.5" ry="3.4" transform="rotate(-22 12 12)"/>' },
    orbit: { d: '<circle cx="12" cy="12" r="9.5" stroke-dasharray="2 2.6"/><circle cx="21.5" cy="12" r="1.4" fill="%C%"/>' },
    comet: { d: '<path d="M3 21L14.5 9.5"/><circle cx="17" cy="7" r="2.8"/>' },
    constellation: { d: '<path d="M3 17l5-7 6 3 7-9"/><circle cx="3" cy="17" r="1.2" fill="%C%"/><circle cx="8" cy="10" r="1.2" fill="%C%"/><circle cx="14" cy="13" r="1.2" fill="%C%"/><circle cx="21" cy="4" r="1.2" fill="%C%"/>' },

    // Toán
    integral: { t: '∫', size: 20, italic: true },
    pi: { t: 'π', size: 17 },
    sigma: { t: 'Σ', size: 16 },
    sqrt: { d: '<path d="M2 13h3l3 7 5-16h9"/>' },
    infinity: { d: '<path d="M12 12c-2-2.6-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.4 5.5-4zm0 0c2 2.6 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1.4-5.5 4z"/>' },
    triangle: { d: '<path d="M3 20h18L8 5z"/>' },
    parabola: { d: '<path d="M2 20h20M12 22V2"/><path d="M4.5 5c2.2 9 4.6 12 7.5 12s5.3-3 7.5-12"/>' },
    axes: { d: '<path d="M12 13V3M12 13l8 5M12 13l-8 5"/>' },
    compass: { d: '<circle cx="12" cy="4" r="1.6"/><path d="M11.2 5.5L6 21M12.8 5.5L18 21M8 15h8"/>' },

    // Lý
    atom: { d: '<circle cx="12" cy="12" r="1.5" fill="%C%"/><ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.7" transform="rotate(-30 12 12)"/>' },
    bolt: { d: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>' },
    magnet: { d: '<path d="M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3z"/>' },
    wave: { d: '<path d="M1 12c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 6.6 0"/>' },
    lens: { d: '<path d="M12 2c2.6 3 2.6 17 0 20M12 2c-2.6 3-2.6 17 0 20"/>' },
    pendulum: { d: '<path d="M4 3h16M12 3l5 13"/><circle cx="17.8" cy="18" r="2.4"/>' },
    spring: { d: '<path d="M12 1v3l-5 2 10 3-10 3 10 3-5 2v6"/>' },
    emc: { t: 'E=mc²', size: 8 },

    // Hóa
    benzene: { d: '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><circle cx="12" cy="12" r="4.4"/>' },
    flask: { d: '<path d="M9 3h6M10 3v5.8L4.8 18a2.2 2.2 0 0 0 1.9 3.3h10.6a2.2 2.2 0 0 0 1.9-3.3L14 8.8V3"/><path d="M6.8 15.5h10.4"/>' },
    tube: { d: '<path d="M8 3h8M9.5 3v14.5a2.5 2.5 0 0 0 5 0V3"/><path d="M9.5 12h5"/>' },
    molecule: { d: '<circle cx="6" cy="7" r="2.4"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="17" r="2.8"/><path d="M7.4 9.3l3.2 5.2M16.9 8.7l-3.4 5.8"/>' },
    bubbles: { d: '<circle cx="8" cy="15" r="3.6"/><circle cx="16" cy="8" r="2.4"/>' },
    tile: { d: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/>', texts: [{ t: 'Fe', x: 12.5, y: 15.5, size: 8 }] },
    water: { t: 'H₂O', size: 9 },

    // Sinh
    dna: { d: SUBJECT_INNER['Sinh'] },
    leaf: { d: '<path d="M5 19C5 9.5 11 4 20 4c0 9-5.5 15-15 15z"/><path d="M5 19l9-9"/>' },
    cell: { d: '<circle cx="12" cy="12" r="9.2"/><circle cx="12.5" cy="11.5" r="3"/>' },
    microscope: { d: '<path d="M5 21h14M8 21a6.5 6.5 0 0 1 9.5-9"/><path d="M9.5 3.5l4 2-3.2 6.5-4-2z"/>' },
    chromosome: { d: '<path d="M7 3c2.5 4 2.5 5 5 9s2.5 5 5 9M17 3c-2.5 4-2.5 5-5 9s-2.5 5-5 9"/>' },
    pulse: { d: '<path d="M2 12h4.5l2-5 4 10 2.5-6 1.5 1H22"/>' },

    // Tin
    code: { d: SUBJECT_INNER['Tin'] },
    chip: { d: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/>' },
    cursor: { d: '<path d="M5 3l14 7.5-6.2 1.8L10 19z"/>' },
    binary: { t: '0101', size: 8 },
    wifi: { d: '<path d="M2 9a14.5 14.5 0 0 1 20 0M6 13a9 9 0 0 1 12 0"/><circle cx="12" cy="18.5" r="1" fill="%C%"/>' },
    database: { d: '<ellipse cx="12" cy="5" rx="8" ry="2.8"/><path d="M4 5v14c0 1.6 3.6 2.8 8 2.8s8-1.2 8-2.8V5"/>' },
    terminal: { d: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M7 10l3 2.5L7 15M12.5 15.5H17"/>' },
    gear: { d: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/>' },
  };

  global.LiteIcons = { ui, subject, subjectInner, deco };
})(window);

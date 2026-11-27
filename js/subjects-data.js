/**
 * js/subjects-data.js
 * Cấu hình dữ liệu Khối lớp, Môn học, Công thức vệ tinh bay quanh,
 * và dữ liệu danh sách mẫu cho 3 phân hệ (Lý thuyết, Tự luyện, Tóm tắt & Công thức).
 */
(function (global) {
  'use strict';

  const GRADES = [
    { grade: 10, label: 'Khối 10', status: 'Sắp mở', active: false },
    { grade: 11, label: 'Khối 11', status: 'Sắp mở', active: false },
    { grade: 12, label: 'Khối 12', status: 'Đang mở', active: true },
  ];

  const SUBJECTS = {
    'Toán': {
      count: 8,
      accent: '#7dd3fc',
      glow: 'rgba(125, 211, 252, 0.34)',
      satellites: [
        { text: '∫ f(x)dx', kind: 'formula' },
        { text: 'π ≈ 3.14', kind: 'symbol' },
        { text: '∑ aₙ', kind: 'symbol' },
        { text: "f'(x) = 0", kind: 'formula' },
        { text: 'z = a + bi', kind: 'formula' },
        { text: 'log₂(x)', kind: 'formula' },
        { text: 'Oxyz', kind: 'symbol' },
        { text: 'lim x→∞', kind: 'formula' },
      ],
      lessons: [],
      quizzes: [],
      summaries: [],
    },
    'Lý': {
      count: 8,
      accent: '#c084fc',
      glow: 'rgba(192, 132, 252, 0.34)',
      satellites: [
        { text: 'E = mc²', kind: 'formula' },
        { text: 'Φ = B·S·cosα', kind: 'formula' },
        { text: 'λ = v / f', kind: 'formula' },
        { text: '⚛', kind: 'icon' },
        { text: 'pV = nRT', kind: 'formula' },
        { text: 'F = qvB', kind: 'formula' },
        { text: 'ΔU = A + Q', kind: 'formula' },
        { text: 'ω = 2πf', kind: 'symbol' },
      ],
      lessons: [],
      quizzes: [],
      summaries: [],
    },
    'Hóa': {
      count: 8,
      accent: '#fbbf24',
      glow: 'rgba(251, 191, 36, 0.34)',
      satellites: [
        { text: 'H₂SO₄', kind: 'formula' },
        { text: 'C₆H₆', kind: 'formula' },
        { text: 'pH = -lg[H⁺]', kind: 'formula' },
        { text: '⬢', kind: 'icon' },
        { text: 'R-COO-R\'', kind: 'formula' },
        { text: '⇄ Kc', kind: 'symbol' },
        { text: 'Fe³⁺ + 3e', kind: 'formula' },
        { text: 'ΔH°₂₉₈', kind: 'symbol' },
      ],
      lessons: [],
      quizzes: [],
      summaries: [],
    },
    'Sinh': {
      count: 9,
      accent: '#34d399',
      glow: 'rgba(52, 211, 153, 0.34)',
      satellites: [
        { text: 'DNA ⇋ RNA', kind: 'formula' },
        { text: 'ATP ⚡', kind: 'symbol' },
        { text: 'AaBb × aabb', kind: 'formula' },
        { text: '🧬', kind: 'icon' },
        { text: 'mARN → Chuỗi', kind: 'formula' },
        { text: '2n = 46', kind: 'symbol' },
        { text: 'p²+2pq+q²=1', kind: 'formula' },
        { text: 'Operon Lac', kind: 'symbol' },
      ],
      lessons: [],
      quizzes: [],
      summaries: [],
    },
    'Tin': {
      count: 6,
      accent: '#f472b6',
      glow: 'rgba(244, 114, 182, 0.34)',
      satellites: [
        { text: '</>', kind: 'icon' },
        { text: 'O(n log n)', kind: 'formula' },
        { text: '{ JSON }', kind: 'symbol' },
        { text: '010110', kind: 'symbol' },
        { text: 'SELECT *', kind: 'formula' },
        { text: 'AI / ML', kind: 'symbol' },
        { text: 'TCP/IP', kind: 'symbol' },
        { text: 'fn(x) => y', kind: 'formula' },
      ],
      lessons: [],
      quizzes: [],
      summaries: [],
    },
  };

  /**
   * 3 Hành tinh mục tiêu & Bảng rút gọn (khi vừa bấm vào môn chỉ hiện Tiêu đề + Mô tả).
   * Khi bấm vào bảng bất kỳ sẽ phóng to thành Modal List ở giữa màn hình.
   */
  const SUBJECT_SECTIONS = [
    {
      key: 'ly-thuyet',
      title: 'Lý thuyết',
      desc: 'Bài học theo chương trình, mọi người cùng đóng góp.',
      uploadLabel: '+ Đóng góp bài học',
      angleDeg: -145,
      iconLabel: 'Lý thuyết',
      iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>`,
    },
    {
      key: 'tu-luyen',
      title: 'Tự luyện',
      desc: 'Làm theo bộ đề hoặc câu hỏi ngẫu nhiên.',
      uploadLabel: '+ Thêm bộ đề Quiz',
      angleDeg: -35,
      iconLabel: 'Tự luyện',
      iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9"/>
        <circle cx="12" cy="12" r="5"/>
        <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      </svg>`,
    },
    {
      key: 'tai-len',
      title: 'Tóm tắt và công thức',
      desc: 'Tóm tắt, công thức do mọi người tải lên.',
      uploadLabel: '+ Tải lên file HTML',
      angleDeg: 90,
      iconLabel: 'Công thức',
      iconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>`,
    },
  ];

  function getSectionItems(subjectName, sectionKey) {
    const info = SUBJECTS[subjectName];
    if (!info) return [];
    if (sectionKey === 'ly-thuyet') {
      return (info.lessons || []).map((name, i) => ({
        index: i + 1,
        title: `Bài ${i + 1}: ${name}`,
        meta: `Môn ${subjectName} · Lý thuyết`,
        tag: 'Bài học',
        action: 'Đọc bài ↗',
      }));
    }
    if (sectionKey === 'tu-luyen') {
      return (info.quizzes || []).map((q, i) => ({
        index: i + 1,
        title: q.title,
        meta: q.meta,
        tag: q.tag,
        action: 'Làm bài →',
      }));
    }
    return (info.summaries || []).map((s, i) => ({
      index: i + 1,
      title: s.title,
      meta: s.meta,
      tag: s.tag,
      action: 'Mở xem ↗',
    }));
  }

  function buildGraphFromSubjects() {
    const nodes = [];
    const edges = [];
    const regions = {};

    for (const [name, info] of Object.entries(SUBJECTS)) {
      regions[name] = {
        center: [0, 0, 0],
        spread: [0.2, 0.2, 0.2],
        density: 900,
        accent: info.accent,
        glow: info.glow,
      };
      const first = nodes.length;
      for (let i = 0; i < info.count; i++) {
        const lessonTitle = info.lessons[i] || `Bài ${i + 1}`;
        nodes.push({
          title: `${name} · Bài ${i + 1}: ${lessonTitle}`,
          shortTitle: `Bài ${i + 1}`,
          region: name,
          degree: 0,
          isPrimaryStar: i === 0,
          ideas: [],
        });
        if (i > 0) edges.push([first + i - 1, first + i]);
      }
    }

    for (const [a, b] of edges) {
      nodes[a].degree++;
      nodes[b].degree++;
    }

    return { nodes, edges, regions };
  }

  global.StudyData = {
    GRADES,
    SUBJECTS,
    SUBJECT_SECTIONS,
    getSectionItems,
    buildGraphFromSubjects,
  };
})(window);

/**
 * js/lite-app.js
 * Điều phối chính của Giao diện Nhẹ (window.LiteApp) kết hợp GSAP + CustomEase + Lenis + Apple Fluid Interfaces:
 * - Góc trái trên: Nút Chọn Khối (Khối 12) bấm bung menu 10 / 11 / 12. Góc phải trên: Avatar tài khoản.
 * - Trang chủ: Khung Title + Info ở giữa trên; bên dưới là 5 thẻ Môn học dạng dọc trên cùng 1 hàng ngang (chỉ gồm Icon + Tên môn).
 * - Khi bấm vào 1 thẻ môn: Chính thẻ đó giữ nguyên độ đặc (opacity = 1, tuyệt đối không mờ rồi hiện), trượt và nở kích thước
 *   trực tiếp thành khung Môn lớn ở bên trái; 4 thẻ môn kia + khung Title thu đi; 3 khung Phân hệ bung đàn hồi ra bên phải.
 * - Khi bấm vào 1 trong 3 khung Phân hệ: Khung đó giữ nguyên độ đặc (opacity = 1), biến hình nở to ra chính giữa màn hình
 *   thành bảng List chi tiết (có tìm kiếm, đăng tải, cuộn mượt Lenis) và thu khớp 100% về lại khung nhỏ khi đóng.
 */
(function (global) {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const { GRADES, SUBJECTS, SUBJECT_SECTIONS, getSectionItems } = global.StudyData;
  const Icons = global.LiteIcons;
  const Theme = global.LiteTheme;

  const gsap = global.gsap;
  const CustomEase = global.CustomEase;
  const Lenis = global.Lenis;
  const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)');
  const STACK_MQ = '(max-width: 900px) and (min-height: 501px)';

  if (gsap && CustomEase) {
    gsap.registerPlugin(CustomEase);
    CustomEase.create('appleSpring', 'M0,0 C0.16,1 0.3,1 1,1');
    CustomEase.create('appleBounce', 'M0,0 C0.175,0.885 0.32,1.15 1,1');
  }

  // Đồng bộ vòng lặp Lenis với gsap.ticker
  const activeLenisInstances = new Set();
  if (gsap) {
    gsap.ticker.lagSmoothing(500, 33);
    gsap.ticker.add((time) => {
      const ms = time * 1000;
      for (const l of activeLenisInstances) {
        l.raf(ms);
      }
    });
  }

  function attachSmoothScroll(wrapperEl, contentEl) {
    if (!Lenis || !wrapperEl || isReduced()) return null;
    try {
      const instance = new Lenis({
        wrapper: wrapperEl,
        content: contentEl || wrapperEl.firstElementChild || wrapperEl,
        lerp: 0.14,
        wheelMultiplier: 0.92,
        touchMultiplier: 1.08,
        autoRaf: !gsap,
      });
      activeLenisInstances.add(instance);
      return {
        instance,
        destroy() {
          activeLenisInstances.delete(instance);
          instance.destroy();
        },
      };
    } catch (_) {
      return null;
    }
  }

  const state = {
    grade: (GRADES.find((g) => g.active) || GRADES[GRADES.length - 1] || { grade: 12 }).grade,
    user: null,
    subject: null,
    section: null,
    gradePopoverOpen: false,
  };

  let toastTimer = 0;
  let stageMorphTl = null;
  let stageDir = null;
  let stageSubject = null;
  let homeScrollY = 0;
  let detailLenis = null;
  let detailTl = null;
  let detailOpen = false;
  let detailClosing = false;
  let detailSubject = null;
  let detailSection = null;
  let activeSectionCardEl = null;
  let introPrepared = false;

  // ---------- 3 chế độ Chuyển động & Hiệu ứng: 'full' (Đầy đủ) | 'reduced' (Giảm) | 'fast' (Nhanh - cắt 0ms) ----------
  const MOTION_KEY = 'knowverse_lite_motion';
  const FADE_IN_S = 0.24;
  const FADE_OUT_S = 0.2;
  let motionPref = reducedMotion.matches ? 'reduced' : 'full';
  try {
    const saved = global.localStorage.getItem(MOTION_KEY);
    if (saved === 'full' || saved === 'reduced' || saved === 'fast') {
      motionPref = saved;
    }
  } catch (_) {
    /* trình duyệt chặn localStorage: dùng mặc định */
  }

  function isReduced() {
    return motionPref !== 'full';
  }

  /** Chế độ Giảm: giữ chuyển cảnh mờ nhanh (fade) thay cho morph nặng. Chế độ Nhanh ('fast') trả về false để cắt 0ms. */
  function useFade() {
    return !!gsap && motionPref === 'reduced';
  }

  function applyMotionAttr() {
    if (document.body.classList.contains('lite') || document.documentElement.classList.contains('lite-root')) {
      document.documentElement.dataset.motion = motionPref;
    }
  }

  function getMotionPref() {
    return motionPref;
  }

  function setMotionPref(value) {
    if (value !== 'full' && value !== 'reduced' && value !== 'fast') return;
    motionPref = value;
    try {
      global.localStorage.setItem(MOTION_KEY, value);
    } catch (_) {
      /* không lưu được thì áp dụng trong phiên */
    }
    applyMotionAttr();
    if (value !== 'full') {
      destroyDetailLenis();
      clearAllHomeVisibility(true);
    }
  }

  function fadeInEl(el) {
    if (!el || !gsap) return;
    gsap.killTweensOf(el);
    gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: FADE_IN_S, ease: 'power1.out', clearProps: 'opacity' });
  }

  applyMotionAttr();

  /** Bật/tắt khóa con trỏ trên toàn vùng chuyển cảnh để thẻ đang bay không bị dính pointerleave/hover. */
  function setStageMorphing(active) {
    const view = $('#liteView');
    if (view) view.classList.toggle('is-morphing', !!active);
  }

  /** Dọn sạch riêng thuộc tính transform còn sót (hover/nhấn), không chạm opacity để tránh cắt ngang animation. */
  function resetCardTransforms(card) {
    if (!card || !gsap) return;
    const targets = [
      card,
      ...$$('.lite-subject-icon, .lite-subject-arrow, .lite-section-icon, .lite-section-arrow', card),
    ];
    gsap.killTweensOf(targets, 'x,y,scale,scaleX,scaleY,rotation');
    gsap.set(targets, { clearProps: 'transform' });
  }

  // ---------- Phản hồi nhấn tức thì (Kill Latency) & Gợn sóng Ripple ----------
  function bindFluidInteractions(root) {
    let pressedEl = null;

    const releasePress = () => {
      if (!pressedEl) return;
      const el = pressedEl;
      pressedEl = null;
      el.classList.remove('is-pressed');

      const isCard =
        el.classList.contains('lite-subject-card') ||
        el.classList.contains('lite-section-card');

      // Nếu thẻ đang ẩn hoặc trong lúc chuyển cảnh, chỉ reset transform để tránh cắt ngang opacity
      if (isCard && (stageMorphTl || detailOpen || detailClosing || el.style.visibility === 'hidden')) {
        resetCardTransforms(el);
        return;
      }

      if (gsap && !isReduced()) {
        const isHovered = el.matches(':hover') && global.matchMedia('(hover: hover)').matches;
        let targetScale = 1;
        if (isHovered) {
          if (el.classList.contains('lite-subject-card')) targetScale = 1.022;
          else if (el.classList.contains('lite-section-card')) targetScale = 1.012;
          else if (el.id === 'liteBack') targetScale = 1.05;
          else if (el.id === 'liteGradeBtn') targetScale = 1.04;
          else if (el.id === 'liteAvatar') targetScale = 1.08;
          else if (el.classList.contains('lite-upload-btn')) targetScale = 1.03;
          else if (el.classList.contains('lite-detail-close')) targetScale = 1.16;
        }
        gsap.to(el, {
          scale: targetScale,
          duration: 0.34,
          ease: 'appleSpring',
          overwrite: 'auto',
          clearProps: targetScale === 1 && !el.classList.contains('lite-row') ? 'transform' : '',
        });
      }
    };

    root.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (stageMorphTl || detailClosing) return;

      const pressTarget = e.target.closest(
        '.lite-press, .lite-subject-card, .lite-section-card, .lite-row, .lite-grade-option, .lite-detail-close'
      );
      if (pressTarget && !pressTarget.disabled) {
        releasePress();
        pressedEl = pressTarget;
        pressedEl.classList.add('is-pressed');

        if (gsap && !isReduced()) {
          const isCard =
            pressTarget.classList.contains('lite-subject-card') ||
            pressTarget.classList.contains('lite-section-card') ||
            pressTarget.classList.contains('lite-row');
          gsap.to(pressTarget, {
            scale: isCard ? 0.965 : 0.91,
            duration: 0.085,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        }
      }

      const rippleTarget = e.target.closest('.lite-ripple, .lite-subject-card, .lite-section-card');
      if (rippleTarget && !isReduced()) {
        const rect = rippleTarget.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 0.85;
        const wave = document.createElement('span');
        wave.className = 'lite-ripple-wave';
        wave.style.width = `${size}px`;
        wave.style.height = `${size}px`;
        wave.style.left = `${e.clientX - rect.left}px`;
        wave.style.top = `${e.clientY - rect.top}px`;
        rippleTarget.appendChild(wave);
        wave.addEventListener('animationend', () => wave.remove(), { once: true });
      }
    }, { passive: true });

    window.addEventListener('pointerup', releasePress, { passive: true });
    window.addEventListener('pointercancel', releasePress, { passive: true });
  }

  // ---------- Toast thông báo ----------
  function toast(text) {
    const el = $('#liteToast');
    if (!el) return;
    clearTimeout(toastTimer);

    el.textContent = text;
    el.hidden = false;

    if (gsap && !isReduced()) {
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { y: -16, autoAlpha: 0, scale: 0.88 },
        { y: 0, autoAlpha: 1, scale: 1, duration: 0.38, ease: 'appleBounce', overwrite: 'auto' }
      );
    } else if (useFade()) {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform,visibility' });
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out', clearProps: 'opacity' });
    } else if (gsap) {
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform,opacity,visibility' });
    }

    toastTimer = setTimeout(() => {
      if (gsap && !isReduced()) {
        gsap.to(el, {
          y: -10,
          autoAlpha: 0,
          scale: 0.94,
          duration: 0.24,
          ease: 'appleSpring',
          overwrite: 'auto',
          onComplete: () => {
            el.hidden = true;
            gsap.set(el, { clearProps: 'transform,opacity,visibility' });
          },
        });
      } else if (useFade()) {
        gsap.to(el, {
          opacity: 0,
          duration: 0.18,
          ease: 'power1.in',
          onComplete: () => {
            el.hidden = true;
            gsap.set(el, { clearProps: 'opacity' });
          },
        });
      } else {
        el.hidden = true;
      }
    }, 2500);
  }

  // ---------- Chọn Khối gộp ở góc trái Header ----------
  function buildGradePopover() {
    const pop = $('#liteGradePopover');
    const lbl = $('#liteGradeLabel');
    if (!pop) return;

    if (lbl) lbl.textContent = `Khối ${state.grade}`;
    pop.replaceChildren();

    GRADES.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = item.active && item.grade === state.grade;
      btn.className = `lite-grade-option${isActive ? ' is-active' : ''}${!item.active ? ' is-locked' : ''}`;
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', String(isActive));

      const left = document.createElement('span');
      left.className = 'lite-grade-option-left';

      if (item.active) {
        const dot = document.createElement('span');
        dot.className = 'grade-dot';
        left.appendChild(dot);
      } else {
        const lock = document.createElement('span');
        lock.className = 'grade-lock';
        lock.innerHTML = Icons.ui.lock;
        left.appendChild(lock);
      }

      const name = document.createElement('span');
      name.textContent = item.label;
      left.appendChild(name);

      const st = document.createElement('span');
      st.className = 'grade-state';
      st.textContent = item.status;

      btn.append(left, st);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.active) {
          if (gsap && !isReduced()) {
            gsap.fromTo(
              btn,
              { x: -7 },
              { x: 0, duration: 0.46, ease: 'elastic.out(1.45, 0.28)', overwrite: 'auto' }
            );
          }
          toast(`${item.label} sắp mở — hiện đang mở Khối ${state.grade}`);
          return;
        }
        state.grade = item.grade;
        buildGradePopover();
        closeGradePopover();
        toast(`Đã chọn ${item.label}`);
      });

      pop.appendChild(btn);
    });
  }

  function openGradePopover() {
    const pop = $('#liteGradePopover');
    const btn = $('#liteGradeBtn');
    if (!pop || !btn || state.gradePopoverOpen) return;

    state.gradePopoverOpen = true;
    btn.setAttribute('aria-expanded', 'true');
    pop.hidden = false;

    if (gsap && !isReduced()) {
      const items = $$('.lite-grade-option', pop);
      gsap.killTweensOf([pop, ...items]);
      gsap.fromTo(
        pop,
        { autoAlpha: 0, scale: 0.72, y: -8 },
        { autoAlpha: 1, scale: 1, y: 0, duration: 0.38, ease: 'appleBounce', overwrite: 'auto' }
      );
      gsap.fromTo(
        items,
        { autoAlpha: 0, x: -10, scale: 0.9 },
        { autoAlpha: 1, x: 0, scale: 1, duration: 0.4, stagger: 0.04, ease: 'back.out(1.9)', overwrite: 'auto' }
      );
    } else if (gsap) {
      const items = $$('.lite-grade-option', pop);
      gsap.killTweensOf([pop, ...items]);
      gsap.set([pop, ...items], { clearProps: 'transform,opacity,visibility' });
      if (useFade()) fadeInEl(pop);
    }
  }

  function closeGradePopover(immediate = false) {
    const pop = $('#liteGradePopover');
    const btn = $('#liteGradeBtn');
    if (!pop || !btn || !state.gradePopoverOpen) return;

    state.gradePopoverOpen = false;
    btn.setAttribute('aria-expanded', 'false');

    if (gsap && !isReduced() && !immediate) {
      gsap.killTweensOf(pop);
      gsap.to(pop, {
        autoAlpha: 0,
        scale: 0.78,
        y: -6,
        duration: 0.22,
        ease: 'appleSpring',
        overwrite: 'auto',
        onComplete: () => {
          if (!state.gradePopoverOpen) pop.hidden = true;
        },
      });
    } else if (!immediate && useFade()) {
      gsap.killTweensOf(pop);
      gsap.to(pop, {
        opacity: 0,
        duration: 0.16,
        ease: 'power1.in',
        onComplete: () => {
          gsap.set(pop, { clearProps: 'opacity' });
          if (!state.gradePopoverOpen) pop.hidden = true;
        },
      });
    } else {
      pop.hidden = true;
    }
  }

  function toggleGradePopover() {
    if (state.gradePopoverOpen) closeGradePopover();
    else openGradePopover();
  }

  // ---------- 1. Dựng Màn hình Trang chủ (Cụm tiêu đề KnowVerse không đóng hộp + 5 thẻ dọc 1 hàng ngang) ----------
  function initHomeStage() {
    const stage = $('#liteHomeStage');
    if (!stage) return;
    stage.replaceChildren();

    const banner = document.createElement('div');
    banner.className = 'lite-home-banner';

    const kicker = document.createElement('span');
    kicker.className = 'lite-home-kicker';
    kicker.textContent = 'Không gian học tập';

    const title = document.createElement('h1');
    title.className = 'lite-home-title';
    title.textContent = 'KnowVerse';

    const info = document.createElement('p');
    info.className = 'lite-home-info';
    info.textContent = 'Lý thuyết · Tự luyện · Tóm tắt và công thức';

    const divider = document.createElement('span');
    divider.className = 'lite-home-divider';
    divider.setAttribute('aria-hidden', 'true');

    banner.append(kicker, title, info, divider);

    const row = document.createElement('div');
    row.className = 'lite-subjects-row';
    row.setAttribute('aria-label', 'Các môn học');

    Object.keys(SUBJECTS).forEach((name) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lite-subject-card';
      card.dataset.subject = name;

      // Lớp trang trí chìm (vòng quỹ đạo mảnh + watermark icon môn) làm rõ nền trong khung
      const deco = document.createElement('span');
      deco.className = 'lite-card-deco';
      deco.setAttribute('aria-hidden', 'true');
      const orbit = document.createElement('span');
      orbit.className = 'lite-card-orbit';
      const wm = document.createElement('span');
      wm.className = 'lite-card-wm';
      wm.innerHTML = Icons.subject(name);
      deco.append(orbit, wm);

      const iconBox = document.createElement('span');
      iconBox.className = 'lite-subject-icon';
      iconBox.innerHTML = Icons.subject(name);

      const h2 = document.createElement('h2');
      h2.className = 'lite-subject-name';
      h2.textContent = name;

      // Mũi tên tròn: nằm ở đáy thẻ đứng trên PC, và ở mép phải thẻ ngang trên ĐT
      const arrow = document.createElement('span');
      arrow.className = 'lite-subject-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = Icons.ui.arrow;

      card.append(deco, iconBox, h2, arrow);

      if (gsap && global.matchMedia('(hover: hover)').matches) {
        card.addEventListener('pointerenter', () => {
          if (isReduced() || stageMorphTl || card.style.visibility === 'hidden') return;
          gsap.to(card, { y: -5, scale: 1.022, duration: 0.34, ease: 'appleSpring', overwrite: 'auto' });
          gsap.to(iconBox, { y: -3, scale: 1.12, duration: 0.38, ease: 'back.out(2.0)', overwrite: 'auto' });
          gsap.to(arrow, { x: 3, scale: 1.08, duration: 0.34, ease: 'back.out(2.0)', overwrite: 'auto' });
        });
        card.addEventListener('pointerleave', () => {
          if (stageMorphTl || card.style.visibility === 'hidden') return;
          if (isReduced()) {
            resetCardTransforms(card);
            return;
          }
          gsap.to(card, { y: 0, scale: 1, duration: 0.3, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(iconBox, { y: 0, scale: 1, duration: 0.3, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(arrow, { x: 0, scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
        });
      }

      card.addEventListener('click', () => navigate(name, null));
      row.appendChild(card);
    });

    stage.append(banner, row);
  }

  function getHomeCard(subjectName) {
    return $(`.lite-subject-card[data-subject="${subjectName}"]`, $('#liteHomeStage'));
  }

  // ---------- 2. Dựng Màn hình Trang Môn (Cột trái Khung Môn lớn + Cột phải 3 khung Phân hệ lớn) ----------
  function populateSubjectStage(subjectName) {
    const wrap = $('#liteSubjectStage');
    const info = SUBJECTS[subjectName];
    if (!wrap || !info) return;
    wrap.replaceChildren();

    const stage = document.createElement('div');
    stage.className = 'lite-subject-stage';

    const heroSlot = document.createElement('div');
    heroSlot.className = 'lite-hero-slot';

    const hero = document.createElement('section');
    hero.className = 'lite-subject-hero';
    hero.dataset.subject = subjectName;

    const heroDeco = document.createElement('span');
    heroDeco.className = 'lite-card-deco';
    heroDeco.setAttribute('aria-hidden', 'true');
    const heroOrbit = document.createElement('span');
    heroOrbit.className = 'lite-card-orbit lite-hero-orbit';
    const heroCardWm = document.createElement('span');
    heroCardWm.className = 'lite-card-wm lite-hero-card-wm';
    heroCardWm.style.opacity = '0';
    heroCardWm.innerHTML = Icons.subject(subjectName);
    const heroWm = document.createElement('span');
    heroWm.className = 'lite-card-wm lite-card-wm--center';
    heroWm.innerHTML = Icons.subject(subjectName);
    heroDeco.append(heroOrbit, heroCardWm, heroWm);

    const emblem = document.createElement('div');
    emblem.className = 'lite-hero-emblem';

    const ringOuter = document.createElement('span');
    ringOuter.className = 'lite-hero-ring lite-hero-ring--outer';
    const ringInner = document.createElement('span');
    ringInner.className = 'lite-hero-ring';
    const core = document.createElement('span');
    core.className = 'lite-hero-core';
    core.innerHTML = Icons.subject(subjectName);

    emblem.append(ringOuter, ringInner, core);

    const h1 = document.createElement('h1');
    h1.className = 'lite-hero-title';
    h1.textContent = subjectName;

    const heroArrow = document.createElement('span');
    heroArrow.className = 'lite-subject-arrow lite-hero-arrow';
    heroArrow.setAttribute('aria-hidden', 'true');
    heroArrow.innerHTML = Icons.ui.arrow;

    hero.append(heroDeco, emblem, h1, heroArrow);
    heroSlot.appendChild(hero);

    if (gsap && global.matchMedia('(hover: hover)').matches) {
      hero.addEventListener('pointerenter', () => {
        if (isReduced() || hero.classList.contains('is-morphing')) return;
        gsap.to(core, { y: -3, scale: 1.1, duration: 0.42, ease: 'back.out(2.1)', overwrite: 'auto' });
        gsap.to(ringInner, { rotation: 30, scale: 1.04, duration: 0.5, ease: 'appleBounce', overwrite: 'auto' });
        gsap.to(ringOuter, { rotation: -20, scale: 1.03, duration: 0.5, ease: 'appleBounce', overwrite: 'auto' });
      });
      hero.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set([core, ringInner, ringOuter], { clearProps: 'transform' });
          return;
        }
        gsap.to(core, { y: 0, scale: 1, duration: 0.34, ease: 'appleSpring', overwrite: 'auto' });
        gsap.to(ringInner, { rotation: 0, scale: 1, duration: 0.38, ease: 'appleSpring', overwrite: 'auto' });
        gsap.to(ringOuter, { rotation: 0, scale: 1, duration: 0.38, ease: 'appleSpring', overwrite: 'auto' });
      });
    }

    const secStack = document.createElement('div');
    secStack.className = 'lite-sections-stack';

    SUBJECT_SECTIONS.forEach((sec) => {
      const items = getSectionItems(subjectName, sec.key);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lite-section-card';
      card.dataset.key = sec.key;

      const secDeco = document.createElement('span');
      secDeco.className = 'lite-card-deco';
      secDeco.setAttribute('aria-hidden', 'true');
      const secWm = document.createElement('span');
      secWm.className = 'lite-card-wm lite-card-wm--side';
      secWm.innerHTML = sec.iconSvg;
      secDeco.appendChild(secWm);

      const main = document.createElement('div');
      main.className = 'lite-section-main';

      const iconWrap = document.createElement('span');
      iconWrap.className = 'lite-section-icon';
      iconWrap.innerHTML = sec.iconSvg;

      const body = document.createElement('div');
      body.className = 'lite-section-body';

      const title = document.createElement('h2');
      title.className = 'lite-section-title';
      title.textContent = sec.title;

      const desc = document.createElement('p');
      desc.className = 'lite-section-desc';
      desc.textContent = sec.desc;

      body.append(title, desc);
      main.append(iconWrap, body);

      const side = document.createElement('div');
      side.className = 'lite-section-side';

      const countBadge = document.createElement('span');
      countBadge.className = 'lite-section-count';
      countBadge.textContent = `${items.length} mục`;

      const arrow = document.createElement('span');
      arrow.className = 'lite-section-arrow';
      arrow.innerHTML = Icons.ui.arrow;

      side.append(countBadge, arrow);

      card.append(secDeco, main, side);

      if (gsap && global.matchMedia('(hover: hover)').matches) {
        card.addEventListener('pointerenter', () => {
          if (isReduced() || stageMorphTl || detailOpen || detailClosing || card.style.visibility === 'hidden') return;
          gsap.to(card, { y: -3, x: 4, scale: 1.012, duration: 0.34, ease: 'appleSpring', overwrite: 'auto' });
          gsap.to(iconWrap, { scale: 1.14, rotation: -7, duration: 0.38, ease: 'back.out(2.1)', overwrite: 'auto' });
          gsap.to(arrow, { x: 4, scale: 1.1, duration: 0.34, ease: 'back.out(2.0)', overwrite: 'auto' });
        });
        card.addEventListener('pointerleave', () => {
          if (stageMorphTl || detailOpen || detailClosing || card.style.visibility === 'hidden') return;
          if (isReduced()) {
            resetCardTransforms(card);
            return;
          }
          gsap.to(card, { y: 0, x: 0, scale: 1, duration: 0.3, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(iconWrap, { scale: 1, rotation: 0, duration: 0.3, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(arrow, { x: 0, scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
        });
      }

      card.addEventListener('click', () => navigate(subjectName, sec.key));
      secStack.appendChild(card);
    });

    stage.append(heroSlot, secStack);
    wrap.appendChild(stage);
  }

  // ---------- Hiệu ứng Biến hình đặc liên tục trên GPU (opacity = 1, cùng thời gian, 0 reflow trong onUpdate) ----------
  const STAGE_OPEN_DURATION = 0.46;
  const STAGE_CLOSE_DURATION = 0.44;
  const STAGE_EASE = CustomEase ? CustomEase.create('liteFluid', 'M0,0 C0.22,1 0.36,1 1,1') : 'power2.out';

  function clearAllHomeVisibility(resetTransforms = false) {
    $$('.lite-subject-card', $('#liteHomeStage')).forEach((c) => {
      c.style.visibility = '';
      if (resetTransforms) resetCardTransforms(c);
    });
  }

  /**
   * Đo trước toàn bộ tọa độ tĩnh giữa Thẻ Trang chủ (t = 0) và Khung Môn lớn (t = 1),
   * sau đó chạy hoàn toàn bằng transform GPU + opacity ở 60–120fps (không gọi getBoundingClientRect trong onUpdate).
   */
  function buildHeroCardMorpher(hero, heroSlot, cardEl, fixedHeroRect, fixedCardRect) {
    const heroEmblem = $('.lite-hero-emblem', hero);
    const heroCore = $('.lite-hero-core', hero);
    const heroTitle = $('.lite-hero-title', hero);
    const heroRings = $$('.lite-hero-ring', hero);
    const heroArrow = $('.lite-hero-arrow', hero);
    const heroOrbit = $('.lite-hero-orbit', hero);
    const heroWm = $('.lite-card-wm--center', hero);
    const heroCardWm = $('.lite-hero-card-wm', hero);

    const animChildren = [
      heroEmblem,
      heroCore,
      heroTitle,
      ...heroRings,
      heroArrow,
      heroOrbit,
      heroWm,
      heroCardWm,
    ].filter(Boolean);

    // Đọc toàn bộ tọa độ và style trong 1 pass duy nhất trước khi ghi style (tránh layout thrashing)
    const heroRect = fixedHeroRect || heroSlot.getBoundingClientRect();
    const baseW = Math.max(1, heroRect.width);
    const baseH = Math.max(1, heroRect.height);
    const baseRadius = parseFloat(getComputedStyle(hero).borderTopLeftRadius) || 26;
    const heroCoreRect1 = heroCore ? heroCore.getBoundingClientRect() : heroRect;
    const heroTitleRect1 = heroTitle ? heroTitle.getBoundingClientRect() : heroRect;
    const heroCoreW = heroCoreRect1.width || 92;
    const heroTitlePx = heroTitle ? parseFloat(getComputedStyle(heroTitle).fontSize) || 38 : 38;
    const heroBorderL = hero.clientLeft || 1.5;
    const heroBorderT = hero.clientTop || 1.5;

    const rawCardRect = cardEl.getBoundingClientRect();
    const shiftX = fixedCardRect ? fixedCardRect.left - rawCardRect.left : 0;
    const shiftY = fixedCardRect ? fixedCardRect.top - rawCardRect.top : 0;
    const cardRect = fixedCardRect || rawCardRect;
    const sx0 = Math.max(0.05, cardRect.width / baseW);
    const sy0 = Math.max(0.05, cardRect.height / baseH);
    const isStackMode = global.matchMedia(STACK_MQ).matches;
    const cardIconEl = $('.lite-subject-icon', cardEl);
    const cardTitleEl = $('.lite-subject-name', cardEl);
    const cardArrowEl = $('.lite-subject-arrow', cardEl);
    const cardOrbitEl = $('.lite-card-orbit', cardEl);
    const cardWmEl = $('.lite-card-wm', cardEl);

    const shiftRect = (r) => (r ? { left: r.left + shiftX, top: r.top + shiftY, width: r.width, height: r.height } : null);
    const cardIconRect = cardIconEl ? shiftRect(cardIconEl.getBoundingClientRect()) : cardRect;
    const cardTitleRect = cardTitleEl ? shiftRect(cardTitleEl.getBoundingClientRect()) : cardRect;
    const cardArrowRect = cardArrowEl ? shiftRect(cardArrowEl.getBoundingClientRect()) : null;
    const cardOrbitRect = cardOrbitEl ? shiftRect(cardOrbitEl.getBoundingClientRect()) : null;
    const cardWmRect = cardWmEl ? shiftRect(cardWmEl.getBoundingClientRect()) : null;
    const wmW = cardWmEl ? cardWmEl.offsetWidth || 120 : 120;
    const wmH = cardWmEl ? cardWmEl.offsetHeight || 120 : 120;

    const cardIconW = cardIconRect.width || 78;
    const cardTitlePx = cardTitleEl ? parseFloat(getComputedStyle(cardTitleEl).fontSize) || 23 : 23;

    const arrowW = cardArrowRect ? cardArrowRect.width : 50;
    const arrowH = cardArrowRect ? cardArrowRect.height : 50;

    // Sau khi đã đọc xong toàn bộ rect, mới bắt đầu ghi style
    if (heroArrow) {
      heroArrow.style.left = '0px';
      heroArrow.style.top = '0px';
      heroArrow.style.width = `${arrowW.toFixed(1)}px`;
      heroArrow.style.height = `${arrowH.toFixed(1)}px`;
    }

    if (heroOrbit && cardOrbitRect) {
      const orbitRelCx0 = cardOrbitRect.left + cardOrbitRect.width * 0.5 - cardRect.left;
      const orbitRelCy0 = cardOrbitRect.top + cardOrbitRect.height * 0.5 - cardRect.top;
      const localOrbitCx = orbitRelCx0 / sx0 - heroBorderL;
      const localOrbitCy = orbitRelCy0 / sy0 - heroBorderT;
      heroOrbit.style.left = `${(localOrbitCx - cardOrbitRect.width * 0.5).toFixed(1)}px`;
      heroOrbit.style.top = `${(localOrbitCy - cardOrbitRect.height * 0.5).toFixed(1)}px`;
      heroOrbit.style.width = `${cardOrbitRect.width.toFixed(1)}px`;
      heroOrbit.style.height = `${cardOrbitRect.height.toFixed(1)}px`;
      heroOrbit.style.transform = `scale(${(1 / sx0).toFixed(4)}, ${(1 / sy0).toFixed(4)})`;
    }

    const cardWmRot = isStackMode ? 'rotate(-8deg)' : 'rotate(-10deg)';
    if (heroCardWm && cardWmEl && cardWmRect) {
      const wmRelCx0 = cardWmRect.left + cardWmRect.width * 0.5 - cardRect.left;
      const wmRelCy0 = cardWmRect.top + cardWmRect.height * 0.5 - cardRect.top;
      const localWmCx = wmRelCx0 / sx0 - heroBorderL;
      const localWmCy = wmRelCy0 / sy0 - heroBorderT;
      heroCardWm.style.left = `${(localWmCx - wmW * 0.5).toFixed(1)}px`;
      heroCardWm.style.top = `${(localWmCy - wmH * 0.5).toFixed(1)}px`;
      heroCardWm.style.right = 'auto';
      heroCardWm.style.bottom = 'auto';
      heroCardWm.style.width = `${wmW}px`;
      heroCardWm.style.height = `${wmH}px`;
      heroCardWm.style.transform = `scale(${(1 / sx0).toFixed(4)}, ${(1 / sy0).toFixed(4)}) ${cardWmRot}`;
    }

    // Khóa kích thước layout của hero ở baseW × baseH (t = 1) và nội suy hoàn toàn bằng scale(sx, sy) trên GPU
    if (heroSlot) heroSlot.style.height = `${heroRect.height}px`;
    hero.classList.add('is-morphing');
    hero.style.transformOrigin = '0 0';
    hero.style.width = `${baseW.toFixed(2)}px`;
    hero.style.height = `${baseH.toFixed(2)}px`;
    hero.style.opacity = '1';
    if (heroTitle) heroTitle.style.whiteSpace = 'nowrap';

    const coreRelCx = heroCoreRect1.left + heroCoreRect1.width * 0.5 - heroRect.left;
    const coreRelCy = heroCoreRect1.top + heroCoreRect1.height * 0.5 - heroRect.top;
    const titleRelCx = heroTitleRect1.left + heroTitleRect1.width * 0.5 - heroRect.left;
    const titleRelCy = heroTitleRect1.top + heroTitleRect1.height * 0.5 - heroRect.top;

    const coreScale0 = cardIconW / heroCoreW;
    const cardIconCx = cardIconRect.left + cardIconRect.width * 0.5;
    const cardIconCy = cardIconRect.top + cardIconRect.height * 0.5;
    const heroCoreCx1 = heroRect.left + coreRelCx;
    const heroCoreCy1 = heroRect.top + coreRelCy;

    const titleScale0 = cardTitlePx / heroTitlePx;
    const cardTitleCx = cardTitleRect.left + cardTitleRect.width * 0.5;
    const cardTitleCy = cardTitleRect.top + cardTitleRect.height * 0.5;
    const heroTitleCx1 = heroRect.left + titleRelCx;
    const heroTitleCy1 = heroRect.top + titleRelCy;

    const cardArrowCx = cardArrowRect
      ? cardArrowRect.left + arrowW * 0.5
      : cardRect.left + cardRect.width * 0.5;
    const cardArrowCy = cardArrowRect
      ? cardArrowRect.top + arrowH * 0.5
      : cardRect.top + cardRect.height * 0.78;
    const arrowRx = (cardArrowCx - cardRect.left) / Math.max(1, cardRect.width);
    const arrowRy = (cardArrowCy - cardRect.top) / Math.max(1, cardRect.height);
    const arrowAx = arrowRx * baseW - (heroBorderL + arrowW * 0.5);
    const arrowAy = arrowRy * baseH - (heroBorderT + arrowH * 0.5);

    function applyFrame(t) {
      const u = 1 - t;
      const curLeft = cardRect.left + (heroRect.left - cardRect.left) * t;
      const curTop = cardRect.top + (heroRect.top - cardRect.top) * t;
      const curW = cardRect.width + (baseW - cardRect.width) * t;
      const curH = cardRect.height + (baseH - cardRect.height) * t;
      const sx = curW / baseW;
      const sy = curH / baseH;

      hero.style.transform = `translate3d(${curLeft.toFixed(2)}px, ${curTop.toFixed(2)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`;
      hero.style.borderRadius = `${(baseRadius / sx).toFixed(2)}px / ${(baseRadius / sy).toFixed(2)}px`;

      if (heroEmblem) {
        const es = coreScale0 + (1 - coreScale0) * t;
        const desiredCx = cardIconCx + (heroCoreCx1 - cardIconCx) * t;
        const desiredCy = cardIconCy + (heroCoreCy1 - cardIconCy) * t;
        const tx = (desiredCx - curLeft) / sx - coreRelCx;
        const ty = (desiredCy - curTop) / sy - coreRelCy;
        heroEmblem.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${(es / sx).toFixed(4)}, ${(es / sy).toFixed(4)})`;
      }

      if (heroTitle) {
        const ts = titleScale0 + (1 - titleScale0) * t;
        const desiredCx = cardTitleCx + (heroTitleCx1 - cardTitleCx) * t;
        const desiredCy = cardTitleCy + (heroTitleCy1 - cardTitleCy) * t;
        const tx = (desiredCx - curLeft) / sx - titleRelCx;
        const ty = (desiredCy - curTop) / sy - titleRelCy;
        heroTitle.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${(ts / sx).toFixed(4)}, ${(ts / sy).toFixed(4)})`;
      }

      if (heroRings.length) {
        const ringOp = Math.max(0, Math.min(1, t * 1.12 - 0.06));
        const ringScale = 0.76 + 0.24 * t;
        heroRings.forEach((ring) => {
          ring.style.opacity = ringOp.toFixed(3);
          ring.style.transform = `scale(${ringScale.toFixed(3)})`;
        });
      }

      if (heroArrow) {
        const arrowOp = Math.max(0, Math.min(1, (u - 0.14) / 0.86));
        const arrowScale = 0.6 + 0.4 * arrowOp;
        heroArrow.style.opacity = arrowOp.toFixed(3);
        heroArrow.style.transform = `translate3d(${arrowAx.toFixed(2)}px, ${arrowAy.toFixed(2)}px, 0) scale(${(arrowScale / sx).toFixed(4)}, ${(arrowScale / sy).toFixed(4)})`;
      }

      if (heroOrbit) {
        heroOrbit.style.opacity = u.toFixed(3);
        heroOrbit.style.transform = `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`;
      }
      if (heroWm) {
        heroWm.style.opacity = (0.055 * t).toFixed(3);
        heroWm.style.transform = `translate(-50%, -50%) scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)}) rotate(-8deg)`;
      }
      if (heroCardWm) {
        heroCardWm.style.opacity = (0.065 * u).toFixed(3);
        heroCardWm.style.transform = `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)}) ${cardWmRot}`;
      }
    }

    function cleanup() {
      hero.classList.remove('is-morphing');
      if (heroSlot) heroSlot.style.height = '';
      if (heroTitle) heroTitle.style.whiteSpace = '';
      gsap.set(hero, { clearProps: 'left,top,width,height,borderRadius,transform,transformOrigin,opacity' });
      gsap.set(animChildren, {
        clearProps: 'width,height,padding,fontSize,transform,transformOrigin,opacity,visibility,left,top,right,bottom',
      });
      if (heroCardWm) heroCardWm.style.opacity = '0';
    }

    return { cardRect, heroRect, applyFrame, cleanup };
  }

  function lockOutgoingWrap(wrapEl, rect) {
    if (!wrapEl || !rect) return;
    wrapEl.style.setProperty('position', 'fixed', 'important');
    wrapEl.style.setProperty('left', `${rect.left}px`, 'important');
    wrapEl.style.setProperty('top', `${rect.top}px`, 'important');
    wrapEl.style.setProperty('right', 'auto', 'important');
    wrapEl.style.setProperty('bottom', 'auto', 'important');
    wrapEl.style.width = `${rect.width}px`;
    wrapEl.style.height = `${rect.height}px`;
  }

  function unlockOutgoingWrap(wrapEl) {
    if (!wrapEl) return;
    wrapEl.style.removeProperty('position');
    wrapEl.style.removeProperty('left');
    wrapEl.style.removeProperty('top');
    wrapEl.style.removeProperty('right');
    wrapEl.style.removeProperty('bottom');
    wrapEl.style.width = '';
    wrapEl.style.height = '';
  }

  function completeStageMorph() {
    if (!stageMorphTl) return;
    const tl = stageMorphTl;
    tl.progress(tl.reversed() ? 0 : 1);
    if (stageMorphTl === tl) {
      if (tl._cleanupFn) tl._cleanupFn(tl.reversed());
      tl.kill();
      stageMorphTl = null;
    }
  }

  function completeDetailMorph() {
    if (!detailTl) return;
    const tl = detailTl;
    tl.progress(tl.reversed() ? 0 : 1);
    if (detailTl === tl) {
      if (tl._cleanupFn) tl._cleanupFn(tl.reversed());
      tl.kill();
      detailTl = null;
    }
  }

  function finishStage(finalState, morpher, ctx) {
    const homeStage = $('#liteHomeStage');
    const subjectWrap = $('#liteSubjectStage');
    if (morpher) morpher.cleanup();
    if (homeStage) unlockOutgoingWrap(homeStage);
    if (subjectWrap) unlockOutgoingWrap(subjectWrap);
    clearAllHomeVisibility(true);

    if (homeStage) {
      const allHomeEls = [$('.lite-home-banner', homeStage), ...$$('.lite-subject-card', homeStage)].filter(Boolean);
      if (gsap && allHomeEls.length) gsap.set(allHomeEls, { clearProps: 'transform,opacity,visibility' });
      if (gsap) gsap.set(homeStage, { clearProps: 'opacity' });
      homeStage.classList.remove('lite-stage-outgoing');
    }
    if (subjectWrap) {
      const secCardsNow = $$('.lite-section-card', subjectWrap);
      if (gsap && secCardsNow.length) gsap.set(secCardsNow, { clearProps: 'transform,opacity,visibility' });
      if (gsap) gsap.set(subjectWrap, { clearProps: 'opacity' });
      subjectWrap.classList.remove('lite-stage-outgoing');
    }

    if (finalState === 'subject') {
      if (homeStage) homeStage.hidden = true;
      if (subjectWrap) subjectWrap.hidden = false;
      const targetScroll = ctx && typeof ctx.subjectScrollY === 'number' ? ctx.subjectScrollY : 0;
      if (global.scrollY !== targetScroll) {
        global.scrollTo({ top: targetScroll, left: 0, behavior: 'instant' });
      }
    } else {
      if (subjectWrap) subjectWrap.hidden = true;
      if (homeStage) homeStage.hidden = false;
      if (global.scrollY !== homeScrollY) {
        global.scrollTo({ top: homeScrollY, left: 0, behavior: 'instant' });
      }
    }

    setStageMorphing(false);
    stageMorphTl = null;
    stageDir = null;
    stageSubject = null;
  }

  function transitionHomeToSubject(subjectName, animate = true) {
    const homeStage = $('#liteHomeStage');
    const subjectWrap = $('#liteSubjectStage');
    if (!homeStage || !subjectWrap) return;

    if (stageMorphTl && animate && gsap && !isReduced()) {
      if (stageSubject === subjectName) {
        stageDir = 'open';
        Theme.applyTheme(subjectName);
        showBackButton(true);
        if (stageMorphTl._origin === 'open') stageMorphTl.play();
        else stageMorphTl.reverse();
        return;
      }
      completeStageMorph();
    } else if (stageMorphTl) {
      completeStageMorph();
    }

    if (!homeStage.hidden) {
      homeScrollY = animate ? global.scrollY : 0;
    }

    const allHomeElsInit = [$('.lite-home-banner', homeStage), ...$$('.lite-subject-card', homeStage)].filter(Boolean);
    if (gsap && allHomeElsInit.length) {
      gsap.killTweensOf(allHomeElsInit);
      gsap.set(allHomeElsInit, { clearProps: 'transform,opacity,visibility' });
    }

    const clickedCard = getHomeCard(subjectName);
    clearAllHomeVisibility(true);
    const startCardRect = clickedCard ? clickedCard.getBoundingClientRect() : null;
    const startHomeRect = !homeStage.hidden ? homeStage.getBoundingClientRect() : null;

    if (global.scrollY > 0) global.scrollTo({ top: 0, left: 0, behavior: 'instant' });

    Theme.applyTheme(subjectName);
    showBackButton(true);
    populateSubjectStage(subjectName);

    if (!animate || !gsap || isReduced() || !clickedCard || !startCardRect || startCardRect.width < 10) {
      if (animate && useFade() && startHomeRect && startHomeRect.width > 10) {
        homeStage.classList.add('lite-stage-outgoing');
        lockOutgoingWrap(homeStage, startHomeRect);
        unlockOutgoingWrap(subjectWrap);
        subjectWrap.classList.remove('lite-stage-outgoing');
        subjectWrap.hidden = false;
        setStageMorphing(true);
        const ctx = { subjectScrollY: 0 };
        const tl = gsap.timeline({
          onComplete: () => finishStage('subject', null, ctx),
        });
        tl._origin = 'open';
        tl._cleanupFn = () => finishStage('subject', null, ctx);
        stageMorphTl = tl;
        tl.fromTo(homeStage, { opacity: 1 }, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
        tl.fromTo(subjectWrap, { opacity: 0 }, { opacity: 1, duration: 0.26, ease: 'power2.out' }, 0.06);
        return;
      }
      unlockOutgoingWrap(homeStage);
      unlockOutgoingWrap(subjectWrap);
      clearAllHomeVisibility(true);
      homeStage.classList.remove('lite-stage-outgoing');
      homeStage.hidden = true;
      subjectWrap.classList.remove('lite-stage-outgoing');
      subjectWrap.hidden = false;
      stageDir = null;
      stageSubject = null;
      if (animate && useFade()) fadeInEl(subjectWrap);
      return;
    }

    homeStage.classList.add('lite-stage-outgoing');
    if (startHomeRect) lockOutgoingWrap(homeStage, startHomeRect);
    unlockOutgoingWrap(subjectWrap);
    subjectWrap.classList.remove('lite-stage-outgoing');
    subjectWrap.hidden = false;

    const heroSlot = $('.lite-hero-slot', subjectWrap);
    const hero = $('.lite-subject-hero', subjectWrap);
    const secCards = $$('.lite-section-card', subjectWrap);
    const secRects = secCards.map((card) => card.getBoundingClientRect());

    const morpher = buildHeroCardMorpher(hero, heroSlot, clickedCard, null, startCardRect);
    morpher.applyFrame(0);
    clickedCard.style.visibility = 'hidden';

    setStageMorphing(true);
    stageDir = 'open';
    stageSubject = subjectName;
    const morphState = { t: 0 };
    const ctx = { subjectScrollY: 0 };
    const tl = gsap.timeline({
      onComplete: () => finishStage('subject', morpher, ctx),
      onReverseComplete: () => finishStage('home', morpher, ctx),
    });
    tl._origin = 'open';
    tl._cleanupFn = (isRev) => finishStage(isRev ? 'home' : 'subject', morpher, ctx);
    stageMorphTl = tl;

    // 1. Khung Môn giữ nguyên độ đặc 100%, trượt & co giãn GPU mượt đều (cùng thời gian cho mọi môn)
    tl.to(
      morphState,
      {
        t: 1,
        duration: STAGE_OPEN_DURATION,
        ease: STAGE_EASE,
        onUpdate: () => morpher.applyFrame(morphState.t),
      },
      0
    );

    // 2. 4 thẻ môn còn lại + tiêu đề ở Trang chủ thu gọn mượt đi
    const banner = $('.lite-home-banner', homeStage);
    const otherHomeCards = $$('.lite-subject-card', homeStage).filter((c) => c !== clickedCard);
    const outgoingEls = [banner, ...otherHomeCards].filter(Boolean);
    if (outgoingEls.length) {
      tl.to(
        outgoingEls,
        {
          scale: 0.84,
          y: 12,
          autoAlpha: 0,
          duration: 0.24,
          stagger: 0.015,
          ease: 'power2.out',
        },
        0
      );
    }

    // 3. 3 khung Phân hệ nằm lớp dưới, bung trực tiếp từ chính khung Môn và khớp kết thúc đúng bằng STAGE_OPEN_DURATION
    if (secCards.length) {
      const startCx = startCardRect.left + startCardRect.width * 0.5;
      const startCy = startCardRect.top + startCardRect.height * 0.5;

      secCards.forEach((card, i) => {
        const r = secRects[i];
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        const staggerDelay = i * 0.025;

        tl.fromTo(
          card,
          { x: startCx - cx, y: startCy - cy, scale: 0.44, autoAlpha: 0 },
          {
            x: 0,
            y: 0,
            scale: 1,
            autoAlpha: 1,
            duration: STAGE_OPEN_DURATION - staggerDelay,
            ease: STAGE_EASE,
          },
          staggerDelay
        );
      });
    }
  }

  function transitionSubjectToHome(prevSubject, animate = true) {
    const homeStage = $('#liteHomeStage');
    const subjectWrap = $('#liteSubjectStage');
    if (!homeStage || !subjectWrap) return;

    if (stageMorphTl && animate && gsap && !isReduced()) {
      if (stageSubject === prevSubject) {
        stageDir = 'close';
        Theme.applyTheme('home');
        showBackButton(false);
        if (stageMorphTl._origin === 'open') stageMorphTl.reverse();
        else stageMorphTl.play();
        return;
      }
      completeStageMorph();
    } else if (stageMorphTl) {
      completeStageMorph();
    }

    Theme.applyTheme('home');
    showBackButton(false);

    const subjectScrollY = global.scrollY;
    const hero = $('.lite-subject-hero', subjectWrap);
    const heroSlot = $('.lite-hero-slot', subjectWrap);
    const startHeroRect = hero ? hero.getBoundingClientRect() : null;
    const startWrapRect = subjectWrap.getBoundingClientRect();
    const secCards = $$('.lite-section-card', subjectWrap);
    const secRects = secCards.map((card) => card.getBoundingClientRect());

    if (!animate || !gsap || isReduced() || !hero || !startHeroRect || startHeroRect.width < 10) {
      if (hero) {
        hero.classList.remove('is-morphing');
        gsap && gsap.set(hero, { clearProps: 'left,top,width,height,transform,opacity' });
      }
      if (heroSlot) heroSlot.style.height = '';
      if (animate && useFade() && startWrapRect && startWrapRect.width > 10) {
        subjectWrap.classList.add('lite-stage-outgoing');
        lockOutgoingWrap(subjectWrap, startWrapRect);
        unlockOutgoingWrap(homeStage);
        homeStage.classList.remove('lite-stage-outgoing');
        homeStage.hidden = false;
        global.scrollTo({ top: homeScrollY, left: 0, behavior: 'instant' });
        clearAllHomeVisibility(true);
        const allHomeEls = [$('.lite-home-banner', homeStage), ...$$('.lite-subject-card', homeStage)].filter(Boolean);
        if (allHomeEls.length) gsap.set(allHomeEls, { clearProps: 'transform,opacity,visibility' });
        setStageMorphing(true);
        const ctx = { subjectScrollY };
        const tl = gsap.timeline({
          onComplete: () => finishStage('home', null, ctx),
        });
        tl._origin = 'close';
        tl._cleanupFn = () => finishStage('home', null, ctx);
        stageMorphTl = tl;
        tl.fromTo(subjectWrap, { opacity: 1 }, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
        tl.fromTo(homeStage, { opacity: 0 }, { opacity: 1, duration: 0.26, ease: 'power2.out' }, 0.06);
        return;
      }
      unlockOutgoingWrap(subjectWrap);
      unlockOutgoingWrap(homeStage);
      subjectWrap.hidden = true;
      subjectWrap.classList.remove('lite-stage-outgoing');
      homeStage.hidden = false;
      homeStage.classList.remove('lite-stage-outgoing');
      global.scrollTo({ top: homeScrollY, left: 0, behavior: 'instant' });
      clearAllHomeVisibility(true);
      const allHomeEls = [$('.lite-home-banner', homeStage), ...$$('.lite-subject-card', homeStage)].filter(Boolean);
      if (gsap && allHomeEls.length) gsap.set(allHomeEls, { clearProps: 'transform,opacity,visibility' });
      stageDir = null;
      stageSubject = null;
      if (animate && useFade()) fadeInEl(homeStage);
      return;
    }

    subjectWrap.classList.add('lite-stage-outgoing');
    lockOutgoingWrap(subjectWrap, startWrapRect);
    unlockOutgoingWrap(homeStage);
    homeStage.classList.remove('lite-stage-outgoing');
    homeStage.hidden = false;

    global.scrollTo({ top: homeScrollY, left: 0, behavior: 'instant' });

    const allHomeEls = [$('.lite-home-banner', homeStage), ...$$('.lite-subject-card', homeStage)].filter(Boolean);
    if (allHomeEls.length) gsap.set(allHomeEls, { clearProps: 'transform,opacity,visibility' });
    clearAllHomeVisibility(true);

    const targetCard = getHomeCard(prevSubject);
    if (!targetCard) {
      unlockOutgoingWrap(subjectWrap);
      subjectWrap.hidden = true;
      subjectWrap.classList.remove('lite-stage-outgoing');
      return;
    }

    const destCardRect = targetCard.getBoundingClientRect();
    const morpher = buildHeroCardMorpher(hero, heroSlot, targetCard, startHeroRect);
    morpher.applyFrame(1);
    targetCard.style.visibility = 'hidden';

    setStageMorphing(true);
    stageDir = 'close';
    stageSubject = prevSubject;
    const morphState = { t: 1 };
    const ctx = { subjectScrollY };
    const tl = gsap.timeline({
      onComplete: () => finishStage('home', morpher, ctx),
      onReverseComplete: () => finishStage('subject', morpher, ctx),
    });
    tl._origin = 'close';
    tl._cleanupFn = (isRev) => finishStage(isRev ? 'subject' : 'home', morpher, ctx);
    stageMorphTl = tl;

    // 1. 3 khung Phân hệ bên phải thu gọn trực tiếp vào đúng tâm thẻ môn đích (ngược lại hệt lúc mở, nằm dưới khung Môn)
    if (secCards.length) {
      const destCx = destCardRect.left + destCardRect.width * 0.5;
      const destCy = destCardRect.top + destCardRect.height * 0.5;

      secCards.forEach((card, i) => {
        const r = secRects[i];
        const cx = r.left + r.width * 0.5;
        const cy = r.top + r.height * 0.5;
        const staggerDelay = i * 0.015;
        tl.to(
          card,
          {
            x: destCx - cx,
            y: destCy - cy,
            scale: 0.44,
            autoAlpha: 0,
            duration: STAGE_CLOSE_DURATION * 0.85 - staggerDelay,
            ease: STAGE_EASE,
          },
          staggerDelay
        );
      });
    }

    // 2. Khung Môn giữ độ đặc 100% và thu về khít 0.00px lên thẻ đích (không đứng chờ onComplete)
    tl.to(
      morphState,
      {
        t: 0,
        duration: STAGE_CLOSE_DURATION,
        ease: STAGE_EASE,
        onUpdate: () => morpher.applyFrame(morphState.t),
      },
      0
    );

    // 3. Khung Title + 4 thẻ môn còn lại bung mượt và kết thúc ĐÚNG BẰNG STAGE_CLOSE_DURATION (không trễ nhịp cuối)
    const banner = $('.lite-home-banner', homeStage);
    const otherHomeCards = $$('.lite-subject-card', homeStage).filter((c) => c !== targetCard);
    const incomingEls = [banner, ...otherHomeCards].filter(Boolean);
    if (incomingEls.length) {
      incomingEls.forEach((el, idx) => {
        const delay = 0.02 + idx * 0.02;
        tl.fromTo(
          el,
          { scale: 0.86, y: 12, autoAlpha: 0 },
          {
            scale: 1,
            y: 0,
            autoAlpha: 1,
            duration: STAGE_CLOSE_DURATION - delay,
            ease: STAGE_EASE,
          },
          delay
        );
      });
    }
  }

  // ---------- 3. Bảng phóng to dạng List ở giữa màn hình (Biến hình đặc opacity = 1 từ khung Phân hệ) ----------
  function getScrollbarWidth() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden;';
    document.body.appendChild(probe);
    const sbw = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return Math.max(0, sbw);
  }

  function updateScrollLockVar(hadVisibleScrollbar) {
    const hasOverflow =
      hadVisibleScrollbar !== undefined
        ? hadVisibleScrollbar
        : document.body.scrollHeight > global.innerHeight;
    const sbw = hasOverflow ? getScrollbarWidth() : 0;
    document.documentElement.style.setProperty('--sbw', `${sbw}px`);
  }

  function lockScroll() {
    if (document.body.classList.contains('scroll-locked')) return;
    const hadVisibleScrollbar =
      global.innerWidth - document.documentElement.clientWidth > 0 ||
      document.documentElement.scrollHeight > global.innerHeight;
    updateScrollLockVar(hadVisibleScrollbar);
    document.body.classList.add('scroll-locked');
  }

  function unlockScroll() {
    document.body.classList.remove('scroll-locked');
    document.documentElement.style.removeProperty('--sbw');
  }

  function destroyDetailLenis() {
    if (detailLenis) {
      detailLenis.destroy();
      detailLenis = null;
    }
  }

  function restoreActiveSectionCard() {
    if (activeSectionCardEl) {
      resetCardTransforms(activeSectionCardEl);
      activeSectionCardEl.style.visibility = '';
      activeSectionCardEl = null;
    }
  }

  function readSectionCardSpec(cardEl) {
    if (!cardEl) return null;
    const rect = cardEl.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return null;
    const cs = getComputedStyle(cardEl);
    const titleEl = $('.lite-section-title', cardEl);
    const descEl = $('.lite-section-desc', cardEl);
    const iconEl = $('.lite-section-icon', cardEl);
    const sideEl = $('.lite-section-side', cardEl);

    const titleRect = titleEl ? titleEl.getBoundingClientRect() : rect;
    const descRect = descEl ? descEl.getBoundingClientRect() : rect;
    const iconRect = iconEl ? iconEl.getBoundingClientRect() : null;
    const sideRect = sideEl ? sideEl.getBoundingClientRect() : null;

    const titleFontSize = titleEl ? getComputedStyle(titleEl).fontSize : '22px';
    const descFontSize = descEl ? getComputedStyle(descEl).fontSize : '15px';
    const titlePx = parseFloat(titleFontSize) || 22;
    const descPx = parseFloat(descFontSize) || 15;

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      padding: cs.padding,
      borderRadius: cs.borderRadius,
      titleFontSize,
      descFontSize,
      titlePx,
      descPx,
      titleMultiLine: titleRect.height > titlePx * 1.75,
      descMultiLine: descRect.height > descPx * 1.85,
      titleLeft: titleRect.left - rect.left,
      titleTop: titleRect.top - rect.top,
      descLeft: descRect.left - rect.left,
      descTop: descRect.top - rect.top,
      iconLeft: iconRect ? iconRect.left - rect.left : 28,
      iconTop: iconRect ? iconRect.top - rect.top : 40,
      iconW: iconRect ? iconRect.width : 58,
      iconH: iconRect ? iconRect.height : 58,
      sideRight: sideRect ? rect.right - sideRect.right : 28,
      sideTop: sideRect ? sideRect.top - rect.top : 48,
    };
  }

  function measurePanelMorphRest(panel, rectOverride) {
    if (!panel) return null;
    const h2 = $('#liteDetailTitle', panel);
    const desc = $('.lite-panel-desc', panel);
    if (!h2 || !desc) return null;
    const targetRect = rectOverride || panel.getBoundingClientRect();
    const h2Rect = h2.getBoundingClientRect();
    const pDescRect = desc.getBoundingClientRect();
    const baseRadius = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 26;
    panel._morphRest = {
      targetRect,
      baseRadius,
      targetTitlePx: parseFloat(getComputedStyle(h2).fontSize) || 28,
      targetDescPx: parseFloat(getComputedStyle(desc).fontSize) || 15,
      panelTitleLeft: h2Rect.left - targetRect.left,
      panelTitleTop: h2Rect.top - targetRect.top,
      panelDescLeft: pDescRect.left - targetRect.left,
      panelDescTop: pDescRect.top - targetRect.top,
      borderL: panel.clientLeft || 1.5,
      borderT: panel.clientTop || 1.5,
      borderR: panel.clientLeft || 1.5,
    };
    return panel._morphRest;
  }

  function setupDetailMorphChrome(panel, compact, modalRect) {
    const rest = panel._morphRest;
    if (!rest || !compact) return;
    const baseW = Math.max(1, modalRect.width);
    const baseH = Math.max(1, modalRect.height);
    panel.style.transformOrigin = '0 0';
    panel.style.width = `${baseW.toFixed(2)}px`;
    panel.style.height = `${baseH.toFixed(2)}px`;

    const morphIcon = $('.lite-morph-sec-icon', panel);
    const morphSide = $('.lite-morph-sec-side', panel);
    const borderL = rest.borderL || 1.5;
    const borderT = rest.borderT || 1.5;
    const borderR = rest.borderR || 1.5;
    if (morphIcon) {
      morphIcon.style.left = `${(compact.iconLeft - borderL).toFixed(1)}px`;
      morphIcon.style.top = `${(compact.iconTop - borderT).toFixed(1)}px`;
      morphIcon.style.width = `${compact.iconW.toFixed(1)}px`;
      morphIcon.style.height = `${compact.iconH.toFixed(1)}px`;
    }
    if (morphSide) {
      morphSide.style.right = `${(compact.sideRight - borderR).toFixed(1)}px`;
      morphSide.style.top = `${(compact.sideTop - borderT).toFixed(1)}px`;
    }
  }

  /**
   * Nội suy liên tục giữa Khung Phân hệ (t = 0) và Bảng List (t = 1) hoàn toàn trên GPU:
   * không đổi width/height hay fontSize trong onUpdate (tránh reflow), giữ opacity = 1 suốt hành trình.
   */
  function applyDetailMorphFrame(panel, compact, modalRect, t) {
    const rest = panel._morphRest;
    if (!rest || !compact) return;
    const u = 1 - t;

    const h2 = $('#liteDetailTitle', panel);
    const desc = $('.lite-panel-desc', panel);
    const pills = $('.lite-pills', panel);
    const closeBtn = $('.lite-detail-close', panel);
    const extra = $('.lite-detail-extra', panel);
    const morphIcon = $('.lite-morph-sec-icon', panel);
    const morphSide = $('.lite-morph-sec-side', panel);

    const baseW = Math.max(1, modalRect.width);
    const baseH = Math.max(1, modalRect.height);
    const baseRadius = rest.baseRadius || 26;
    const curLeft = compact.left + (modalRect.left - compact.left) * t;
    const curTop = compact.top + (modalRect.top - compact.top) * t;
    const curW = compact.width + (baseW - compact.width) * t;
    const curH = compact.height + (baseH - compact.height) * t;
    const sx = curW / baseW;
    const sy = curH / baseH;

    panel.style.transform = `translate3d(${curLeft.toFixed(2)}px, ${curTop.toFixed(2)}px, 0) scale(${sx.toFixed(5)}, ${sy.toFixed(5)})`;
    panel.style.borderRadius = `${(baseRadius / sx).toFixed(2)}px / ${(baseRadius / sy).toFixed(2)}px`;
    panel.style.opacity = '1';

    if (h2) {
      const desiredTitleLeft = rest.panelTitleLeft + (compact.titleLeft - rest.panelTitleLeft) * u;
      const desiredTitleTop = rest.panelTitleTop + (compact.titleTop - rest.panelTitleTop) * u;
      const titleTx = desiredTitleLeft / sx - rest.panelTitleLeft;
      const titleTy = desiredTitleTop / sy - rest.panelTitleTop;
      const titleScale0 = compact.titlePx / rest.targetTitlePx;
      const ts = titleScale0 + (1 - titleScale0) * t;
      h2.style.transform = `translate3d(${titleTx.toFixed(2)}px, ${titleTy.toFixed(2)}px, 0) scale(${(ts / sx).toFixed(4)}, ${(ts / sy).toFixed(4)})`;
      h2.style.opacity = compact.titleMultiLine ? Math.max(0.22, t).toFixed(3) : '1';
    }

    if (desc) {
      const desiredDescLeft = rest.panelDescLeft + (compact.descLeft - rest.panelDescLeft) * u;
      const desiredDescTop = rest.panelDescTop + (compact.descTop - rest.panelDescTop) * u;
      const descTx = desiredDescLeft / sx - rest.panelDescLeft;
      const descTy = desiredDescTop / sy - rest.panelDescTop;
      const descScale0 = compact.descPx / rest.targetDescPx;
      const ds = descScale0 + (1 - descScale0) * t;
      desc.style.transform = `translate3d(${descTx.toFixed(2)}px, ${descTy.toFixed(2)}px, 0) scale(${(ds / sx).toFixed(4)}, ${(ds / sy).toFixed(4)})`;
      desc.style.opacity = compact.descMultiLine ? Math.max(0.18, t).toFixed(3) : '1';
    }

    const cardChromeOp = Math.max(0, Math.min(1, (u - 0.35) / 0.65));
    const cardChromeScale = 0.78 + 0.22 * cardChromeOp;
    if (morphIcon) {
      const iconRelCx = compact.iconLeft + compact.iconW * 0.5;
      const iconRelCy = compact.iconTop + compact.iconH * 0.5;
      const iconTx = iconRelCx * (1 / sx - 1);
      const iconTy = iconRelCy * (1 / sy - 1);
      morphIcon.style.opacity = cardChromeOp.toFixed(3);
      morphIcon.style.transform = `translate3d(${iconTx.toFixed(2)}px, ${iconTy.toFixed(2)}px, 0) scale(${(cardChromeScale / sx).toFixed(4)}, ${(cardChromeScale / sy).toFixed(4)})`;
    }
    if (morphSide) {
      const sideTx = compact.sideRight * (1 - 1 / sx);
      const sideTy = compact.sideTop * (1 / sy - 1);
      morphSide.style.opacity = cardChromeOp.toFixed(3);
      morphSide.style.transform = `translate3d(${sideTx.toFixed(2)}px, ${sideTy.toFixed(2)}px, 0) scale(${(cardChromeScale / sx).toFixed(4)}, ${(cardChromeScale / sy).toFixed(4)})`;
    }

    const modalChromeOp = Math.max(0, Math.min(1, (t - 0.28) / 0.72));
    if (pills) {
      pills.style.opacity = modalChromeOp.toFixed(3);
      pills.style.transform = `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`;
    }
    if (closeBtn) {
      closeBtn.style.opacity = modalChromeOp.toFixed(3);
      closeBtn.style.transform = `scale(${(1 / sx).toFixed(4)}, ${(1 / sy).toFixed(4)})`;
    }
    if (extra) {
      extra.style.opacity = modalChromeOp.toFixed(3);
      extra.style.transform = `scale(1, ${(sx / sy).toFixed(4)})`;
    }
  }

  function renderDetailRows(listEl, subjectName, sec, items, query, animateRows = true) {
    const q = (query || '').trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            (it.meta && it.meta.toLowerCase().includes(q))
        )
      : items;

    listEl.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'lite-empty';

      const emptyIcon = document.createElement('span');
      emptyIcon.className = 'lite-empty-icon';
      emptyIcon.innerHTML = sec.iconSvg;

      const emptyText = document.createElement('p');
      emptyText.className = 'lite-empty-text';
      emptyText.textContent = items.length === 0
        ? 'Chưa có nội dung nào.'
        : 'Không tìm thấy nội dung phù hợp.';

      empty.append(emptyIcon, emptyText);
      listEl.appendChild(empty);
      return;
    }

    filtered.forEach((item, n) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'lite-row';

      const left = document.createElement('span');
      left.className = 'lite-row-left';

      const idxBadge = document.createElement('span');
      idxBadge.className = 'lite-row-idx';
      idxBadge.textContent = String(item.index);

      const textWrap = document.createElement('span');
      textWrap.className = 'lite-row-text';

      const titleEl = document.createElement('span');
      titleEl.className = 'lite-row-title';
      titleEl.textContent = item.title;

      const metaEl = document.createElement('span');
      metaEl.className = 'lite-row-meta';
      metaEl.textContent = item.meta;

      textWrap.append(titleEl, metaEl);
      left.append(idxBadge, textWrap);

      const right = document.createElement('span');
      right.className = 'lite-row-right';

      if (item.tag) {
        const tag = document.createElement('span');
        tag.className = 'lite-row-tag';
        tag.textContent = item.tag;
        right.appendChild(tag);
      }

      const go = document.createElement('span');
      go.className = 'lite-row-go';
      go.textContent = item.action || 'Mở →';
      right.appendChild(go);

      row.append(left, right);
      row.addEventListener('click', () => {
        toast(`${subjectName} · ${item.title} (nối nội dung thật ở bước sau)`);
      });

      if (gsap && global.matchMedia('(hover: hover)').matches) {
        row.addEventListener('pointerenter', () => {
          if (isReduced()) return;
          gsap.to(row, { x: 5, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
          gsap.to(idxBadge, { scale: 1.1, rotation: -5, duration: 0.36, ease: 'back.out(2.2)', overwrite: 'auto' });
          gsap.to(go, { x: 3, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
        });
        row.addEventListener('pointerleave', () => {
          if (isReduced()) {
            gsap.set([row, idxBadge, go], { clearProps: 'transform' });
            return;
          }
          gsap.to(row, { x: 0, scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(idxBadge, { scale: 1, rotation: 0, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
          gsap.to(go, { x: 0, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
        });
      }

      listEl.appendChild(row);

      if (animateRows && gsap && !isReduced() && n < 10) {
        gsap.fromTo(
          row,
          { y: 10, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.34, delay: Math.min(n, 8) * 0.03, ease: 'appleSpring', overwrite: 'auto' }
        );
      }
    });
  }

  function finishDetailOpenState(overlayEl) {
    const panel = overlayEl ? $('.lite-detail-panel', overlayEl) : null;
    if (panel) {
      const h2 = $('#liteDetailTitle', panel);
      const desc = $('.lite-panel-desc', panel);
      const pills = $('.lite-pills', panel);
      const closeBtn = $('.lite-detail-close', panel);
      const extra = $('.lite-detail-extra', panel);
      const morphIcon = $('.lite-morph-sec-icon', panel);
      const morphSide = $('.lite-morph-sec-side', panel);
      panel.classList.remove('is-morphing');
      if (gsap) {
        gsap.set(panel, { clearProps: 'left,top,width,height,padding,borderRadius,transform,transformOrigin,opacity' });
        gsap.set([h2, desc, pills, closeBtn, extra].filter(Boolean), { clearProps: 'fontSize,transform,transformOrigin,opacity,visibility' });
        gsap.set([morphIcon, morphSide].filter(Boolean), { clearProps: 'transform,opacity,left,right,top,width,height' });
      }
    }
    if (overlayEl) overlayEl.style.pointerEvents = '';
    detailClosing = false;
    detailTl = null;
  }

  function getSubjectBackgroundPeers(excludeKey) {
    const subjectWrap = $('#liteSubjectStage');
    if (!subjectWrap) return [];
    const hero = $('.lite-subject-hero', subjectWrap);
    const otherCards = $$('.lite-section-card', subjectWrap).filter((c) => c.dataset.key !== excludeKey);
    return [hero, ...otherCards].filter(Boolean);
  }

  function resetSubjectStageItems() {
    const subjectWrap = $('#liteSubjectStage');
    if (!subjectWrap) return;
    const hero = $('.lite-subject-hero', subjectWrap);
    const cards = $$('.lite-section-card', subjectWrap);
    const all = [subjectWrap, hero, ...cards].filter(Boolean);
    if (gsap) {
      gsap.killTweensOf(all);
      gsap.set(all, { clearProps: 'transform,opacity,visibility' });
    } else {
      all.forEach((el) => {
        el.style.visibility = '';
        el.style.opacity = '';
        el.style.transform = '';
      });
    }
  }

  function finishDetailCloseState(overlayEl) {
    detailTl = null;
    detailOpen = false;
    detailClosing = false;
    detailSubject = null;
    detailSection = null;
    document.body.classList.remove('detail-open');
    restoreActiveSectionCard();
    resetSubjectStageItems();
    if (overlayEl) {
      if (gsap) {
        gsap.killTweensOf(overlayEl);
        gsap.set(overlayEl, { clearProps: 'opacity' });
      }
      overlayEl.hidden = true;
      overlayEl.style.backgroundColor = '';
      overlayEl.style.pointerEvents = '';
      overlayEl.replaceChildren();
    }
    unlockScroll();
  }

  function openDetailModal(subjectName, sectionKey, animate = true) {
    const overlayEl = $('#liteDetailOverlay');
    const sec = SUBJECT_SECTIONS.find((s) => s.key === sectionKey);
    if (!overlayEl || !sec || !SUBJECTS[subjectName]) return;

    if (
      animate &&
      gsap &&
      !isReduced() &&
      detailOpen &&
      detailTl &&
      detailSubject === subjectName &&
      detailSection === sectionKey &&
      (detailClosing || detailTl.reversed())
    ) {
      detailClosing = false;
      document.body.classList.add('detail-open');
      overlayEl.style.pointerEvents = '';
      const listWrapExisting = $('.lite-list-wrap', overlayEl);
      const listElExisting = $('.lite-list', overlayEl);
      if (!detailLenis && listWrapExisting && listElExisting) {
        detailLenis = attachSmoothScroll(listWrapExisting, listElExisting);
      }
      if (detailTl._origin === 'open') detailTl.play();
      else detailTl.reverse();
      $('.lite-detail-close', overlayEl)?.focus({ preventScroll: true });
      return;
    }

    destroyDetailLenis();
    if (stageMorphTl) {
      completeStageMorph();
    }
    if (detailTl) {
      detailTl.kill();
      detailTl = null;
    }
    if (gsap) {
      gsap.killTweensOf(overlayEl);
      gsap.set(overlayEl, { clearProps: 'opacity' });
    }
    restoreActiveSectionCard();

    const items = getSectionItems(subjectName, sectionKey);
    const anchorCard = $(`.lite-section-card[data-key="${sectionKey}"]`, $('#liteSubjectStage'));
    activeSectionCardEl = anchorCard;
    if (activeSectionCardEl) resetCardTransforms(activeSectionCardEl);
    lockScroll();
    const compact = readSectionCardSpec(activeSectionCardEl);

    detailOpen = true;
    detailClosing = false;
    detailSubject = subjectName;
    detailSection = sectionKey;
    document.body.classList.add('detail-open');
    overlayEl.style.pointerEvents = '';

    overlayEl.replaceChildren();
    overlayEl.hidden = false;

    const panel = document.createElement('section');
    panel.className = 'lite-detail-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'liteDetailTitle');

    const top = document.createElement('div');
    top.className = 'lite-detail-top';

    const heading = document.createElement('div');
    heading.className = 'lite-detail-heading';

    const pills = document.createElement('div');
    pills.className = 'lite-pills';

    const subPill = document.createElement('span');
    subPill.className = 'lite-pill-subject';
    subPill.textContent = subjectName;

    const countPill = document.createElement('span');
    countPill.className = 'lite-pill-count';
    countPill.textContent = `${items.length} mục`;

    pills.append(subPill, countPill);

    const h2 = document.createElement('h2');
    h2.id = 'liteDetailTitle';
    h2.className = 'lite-panel-title';
    h2.textContent = sec.title;

    const desc = document.createElement('p');
    desc.className = 'lite-panel-desc';
    desc.textContent = sec.desc;

    heading.append(pills, h2, desc);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lite-detail-close';
    closeBtn.setAttribute('aria-label', 'Đóng bảng chi tiết');
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener('click', () => navigate(subjectName, null));

    if (gsap && global.matchMedia('(hover: hover)').matches) {
      closeBtn.addEventListener('pointerenter', () => {
        if (isReduced()) return;
        gsap.to(closeBtn, { scale: 1.16, rotation: 90, duration: 0.34, ease: 'back.out(2.2)', overwrite: 'auto' });
      });
      closeBtn.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set(closeBtn, { clearProps: 'transform' });
          return;
        }
        gsap.to(closeBtn, { scale: 1, rotation: 0, duration: 0.3, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
      });
    }

    top.append(heading, closeBtn);
    panel.appendChild(top);

    const extra = document.createElement('div');
    extra.className = 'lite-detail-extra';

    const tools = document.createElement('div');
    tools.className = 'lite-panel-tools';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'lite-search';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'lite-search-icon';
    searchIcon.innerHTML = Icons.ui.search;

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'lite-search-input';
    searchInput.placeholder = `Tìm nhanh trong ${sec.title.toLowerCase()}…`;
    searchInput.autocomplete = 'off';

    searchWrap.append(searchIcon, searchInput);

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'lite-upload-btn lite-press lite-ripple';

    const uploadIcon = document.createElement('span');
    uploadIcon.className = 'lite-upload-icon';
    uploadIcon.innerHTML = Icons.ui.plus;

    const uploadText = document.createElement('span');
    uploadText.textContent = (sec.uploadLabel || '+ Đăng tải').replace(/^\+\s*/, '');

    uploadBtn.append(uploadIcon, uploadText);
    uploadBtn.onclick = () => {
      toast(`Đăng tải vào "${sec.title}" môn ${subjectName} (làm ở bước nối Supabase)`);
    };

    if (gsap && global.matchMedia('(hover: hover)').matches) {
      uploadBtn.addEventListener('pointerenter', () => {
        if (isReduced()) return;
        gsap.to(uploadBtn, { y: -2, scale: 1.03, duration: 0.32, ease: 'appleBounce', overwrite: 'auto' });
        gsap.to(uploadIcon, { rotation: 90, scale: 1.15, duration: 0.4, ease: 'back.out(2.2)', overwrite: 'auto' });
      });
      uploadBtn.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set([uploadBtn, uploadIcon], { clearProps: 'transform' });
          return;
        }
        gsap.to(uploadBtn, { y: 0, scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
        gsap.to(uploadIcon, { rotation: 0, scale: 1, duration: 0.32, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
      });
    }

    tools.append(searchWrap, uploadBtn);
    extra.appendChild(tools);

    const listWrap = document.createElement('div');
    listWrap.className = 'lite-list-wrap';
    listWrap.setAttribute('data-lenis-prevent', '');

    const listEl = document.createElement('div');
    listEl.className = 'lite-list';

    listWrap.appendChild(listEl);
    extra.appendChild(listWrap);
    panel.appendChild(extra);

    const morphIcon = document.createElement('span');
    morphIcon.className = 'lite-section-icon lite-morph-sec-icon';
    morphIcon.setAttribute('aria-hidden', 'true');
    morphIcon.innerHTML = sec.iconSvg;

    const morphSide = document.createElement('div');
    morphSide.className = 'lite-section-side lite-morph-sec-side';
    morphSide.setAttribute('aria-hidden', 'true');
    const morphCount = document.createElement('span');
    morphCount.className = 'lite-section-count';
    morphCount.textContent = `${items.length} mục`;
    const morphArrow = document.createElement('span');
    morphArrow.className = 'lite-section-arrow';
    morphArrow.innerHTML = Icons.ui.arrow;
    morphSide.append(morphCount, morphArrow);

    panel.append(morphIcon, morphSide);
    overlayEl.appendChild(panel);

    renderDetailRows(listEl, subjectName, sec, items, '');
    detailLenis = attachSmoothScroll(listWrap, listEl);

    searchInput.oninput = () => {
      renderDetailRows(listEl, subjectName, sec, items, searchInput.value, false);
    };

    const targetRect = panel.getBoundingClientRect();
    measurePanelMorphRest(panel, targetRect);

    const subjectWrap = $('#liteSubjectStage');
    const bgPeers = getSubjectBackgroundPeers(sectionKey);

    if (animate && gsap && !isReduced() && compact) {
      if (detailTl) {
        detailTl.kill();
        detailTl = null;
      }
      gsap.killTweensOf([overlayEl, panel, h2, desc, pills, closeBtn, extra, morphIcon, morphSide, ...bgPeers]);
      gsap.set(bgPeers, { clearProps: 'transform,opacity,visibility' });
      const peerRects = bgPeers.map((el) => el.getBoundingClientRect());
      if (activeSectionCardEl) activeSectionCardEl.style.visibility = 'hidden';

      panel.classList.add('is-morphing');
      setupDetailMorphChrome(panel, compact, targetRect);
      applyDetailMorphFrame(panel, compact, targetRect, 0);

      const morphState = { t: 0 };
      const tl = gsap.timeline({
        onComplete: () => finishDetailOpenState(overlayEl),
        onReverseComplete: () => finishDetailCloseState(overlayEl),
      });
      tl._origin = 'open';
      tl._cleanupFn = (isRev) => (isRev ? finishDetailCloseState(overlayEl) : finishDetailOpenState(overlayEl));
      detailTl = tl;

      tl.fromTo(
        overlayEl,
        { backgroundColor: 'rgba(4, 5, 10, 0)' },
        { backgroundColor: 'rgba(4, 5, 10, 0.56)', duration: 0.34, ease: 'power2.out' },
        0
      );

      tl.to(
        morphState,
        {
          t: 1,
          duration: 0.42,
          ease: STAGE_EASE,
          onUpdate: () => applyDetailMorphFrame(panel, compact, targetRect, morphState.t),
        },
        0
      );

      // Thu gọn Khung Môn lớn & 2 mục còn lại về hướng tâm bảng chi tiết và ẩn hẳn phía sau
      if (bgPeers.length) {
        const cx = targetRect.left + targetRect.width * 0.5;
        const cy = targetRect.top + targetRect.height * 0.5;
        bgPeers.forEach((el, i) => {
          const r = peerRects[i];
          const dx = (cx - (r.left + r.width * 0.5)) * 0.34;
          const dy = (cy - (r.top + r.height * 0.5)) * 0.34;
          tl.fromTo(
            el,
            { x: 0, y: 0, scale: 1, autoAlpha: 1 },
            { x: dx, y: dy, scale: 0.82, autoAlpha: 0, duration: 0.3, ease: 'power2.out' },
            i * 0.018
          );
        });
      }
    } else if (animate && useFade()) {
      // Mức Giảm: ẩn mượt khung môn & 3 mục phía sau bằng Fade đồng bộ với bảng chi tiết
      if (subjectWrap) {
        gsap.killTweensOf(subjectWrap);
        gsap.to(subjectWrap, { opacity: 0, duration: 0.2, ease: 'power2.out' });
      }
      gsap.killTweensOf(overlayEl);
      gsap.fromTo(overlayEl, { opacity: 0 }, { opacity: 1, duration: FADE_IN_S, ease: 'power2.out', clearProps: 'opacity' });
    } else {
      // Mức Nhanh hoặc mở không hiệu ứng: ẩn gọn nền sau tức thì 0ms
      if (!isReduced()) {
        if (activeSectionCardEl) activeSectionCardEl.style.visibility = 'hidden';
        bgPeers.forEach((el) => {
          el.style.visibility = 'hidden';
        });
      } else if (subjectWrap) {
        subjectWrap.style.visibility = 'hidden';
      }
    }

    closeBtn.focus({ preventScroll: true });
  }

  /** Đổi phân hệ ngay bên trong bảng List đang mở (không nhấp nháy khung nền). */
  function switchDetailSection(subjectName, sectionKey) {
    const overlayEl = $('#liteDetailOverlay');
    const panel = overlayEl ? $('.lite-detail-panel', overlayEl) : null;
    const sec = SUBJECT_SECTIONS.find((s) => s.key === sectionKey);
    if (!panel || !sec || !detailOpen || detailClosing) {
      closeDetailModal(true);
      openDetailModal(subjectName, sectionKey, false);
      return;
    }

    destroyDetailLenis();
    if (detailTl) {
      detailTl.kill();
      finishDetailOpenState(overlayEl);
    }
    restoreActiveSectionCard();

    const anchorCard = $(`.lite-section-card[data-key="${sectionKey}"]`, $('#liteSubjectStage'));
    activeSectionCardEl = anchorCard;
    detailSubject = subjectName;
    detailSection = sectionKey;
    if (!isReduced()) {
      if (activeSectionCardEl) {
        resetCardTransforms(activeSectionCardEl);
        activeSectionCardEl.style.visibility = 'hidden';
      }
      getSubjectBackgroundPeers(sectionKey).forEach((el) => {
        el.style.visibility = 'hidden';
      });
    }

    const items = getSectionItems(subjectName, sectionKey);
    const countPill = $('.lite-pill-count', panel);
    const h2 = $('#liteDetailTitle', panel);
    const desc = $('.lite-panel-desc', panel);
    const searchInput = $('.lite-search-input', panel);
    const uploadBtn = $('.lite-upload-btn', panel);
    const listWrap = $('.lite-list-wrap', panel);
    const listEl = $('.lite-list', panel);
    const extra = $('.lite-detail-extra', panel);

    if (countPill) countPill.textContent = `${items.length} mục`;
    if (h2) h2.textContent = sec.title;
    if (desc) desc.textContent = sec.desc;
    measurePanelMorphRest(panel);

    const morphIcon = $('.lite-morph-sec-icon', panel);
    const morphCount = $('.lite-morph-sec-side .lite-section-count', panel);
    if (morphIcon) morphIcon.innerHTML = sec.iconSvg;
    if (morphCount) morphCount.textContent = `${items.length} mục`;

    if (searchInput) {
      searchInput.value = '';
      searchInput.placeholder = `Tìm nhanh trong ${sec.title.toLowerCase()}…`;
      searchInput.oninput = () => renderDetailRows(listEl, subjectName, sec, items, searchInput.value, false);
    }

    if (uploadBtn) {
      const txtEl = uploadBtn.querySelector('span:last-child');
      if (txtEl) txtEl.textContent = (sec.uploadLabel || '+ Đăng tải').replace(/^\+\s*/, '');
      uploadBtn.onclick = () => toast(`Đăng tải vào "${sec.title}" môn ${subjectName} (làm ở bước nối Supabase)`);
    }

    if (listEl && listWrap) {
      renderDetailRows(listEl, subjectName, sec, items, '');
      detailLenis = attachSmoothScroll(listWrap, listEl);
    }

    if (gsap && !isReduced() && extra) {
      gsap.fromTo(
        extra,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.28, ease: 'appleSpring', clearProps: 'transform,opacity,visibility' }
      );
    } else if (useFade() && extra) {
      fadeInEl(extra);
    }
  }

  function closeDetailModal(immediate = false) {
    const overlayEl = $('#liteDetailOverlay');
    if (!overlayEl || !detailOpen) return;

    destroyDetailLenis();

    if (immediate || !gsap || isReduced() || !activeSectionCardEl) {
      if (detailTl) {
        detailTl.kill();
        detailTl = null;
      }
      if (!immediate && useFade()) {
        if (detailClosing) return;
        detailClosing = true;
        overlayEl.style.pointerEvents = 'none';
        document.body.classList.remove('detail-open');
        const subjectWrap = $('#liteSubjectStage');
        if (subjectWrap) {
          subjectWrap.style.visibility = '';
          gsap.killTweensOf(subjectWrap);
          gsap.fromTo(subjectWrap, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'opacity' });
        }
        gsap.killTweensOf(overlayEl);
        gsap.to(overlayEl, {
          opacity: 0,
          duration: FADE_OUT_S,
          ease: 'power2.in',
          onComplete: () => {
            finishDetailCloseState(overlayEl);
          },
        });
        return;
      }
      finishDetailCloseState(overlayEl);
      return;
    }

    if (detailTl) {
      if (detailClosing) return;
      detailClosing = true;
      document.body.classList.remove('detail-open');
      overlayEl.style.pointerEvents = 'none';
      if (detailTl._origin === 'open') detailTl.reverse();
      else detailTl.play();
      return;
    }

    if (detailClosing) return;
    detailClosing = true;
    overlayEl.style.pointerEvents = 'none';

    const secKey = detailSection || state.section;
    const sec = SUBJECT_SECTIONS.find((s) => s.key === secKey);
    const panel = $('.lite-detail-panel', overlayEl);
    const h2 = $('#liteDetailTitle', panel);
    const desc = $('.lite-panel-desc', panel);
    const top = $('.lite-detail-top', panel);
    const pills = $('.lite-pills', panel);
    const closeBtn = $('.lite-detail-close', panel);
    const extra = $('.lite-detail-extra', panel);
    const morphIcon = $('.lite-morph-sec-icon', panel);
    const morphSide = $('.lite-morph-sec-side', panel);

    document.body.classList.remove('detail-open');
    resetCardTransforms(activeSectionCardEl);

    // Đo vị trí nghỉ của Khung Môn lớn & 2 thẻ còn lại để bung ngược từ tâm ra khớp vị trí cũ
    const bgPeers = getSubjectBackgroundPeers(secKey);
    if (bgPeers.length) {
      gsap.killTweensOf(bgPeers);
      gsap.set(bgPeers, { clearProps: 'transform,opacity,visibility' });
    }
    const peerRects = bgPeers.map((el) => el.getBoundingClientRect());

    const startRect = panel.getBoundingClientRect();
    const compact = readSectionCardSpec(activeSectionCardEl);
    if (!compact) {
      finishDetailCloseState(overlayEl);
      return;
    }

    if (sec && h2 && desc) {
      h2.textContent = sec.title;
      desc.textContent = sec.desc;
    }

    measurePanelMorphRest(panel, startRect);

    gsap.killTweensOf([overlayEl, panel, h2, desc, top, pills, closeBtn, extra, morphIcon, morphSide]);

    panel.classList.add('is-morphing');
    setupDetailMorphChrome(panel, compact, startRect);
    applyDetailMorphFrame(panel, compact, startRect, 1);

    // Giữ thẻ đích ẩn hoàn toàn suốt hành trình thu về (không hiện sớm hay mờ rồi đổi)
    activeSectionCardEl.style.visibility = 'hidden';

    const morphState = { t: 1 };
    const tl = gsap.timeline({
      onComplete: () => finishDetailCloseState(overlayEl),
      onReverseComplete: () => finishDetailOpenState(overlayEl),
    });
    tl._origin = 'close';
    tl._cleanupFn = (isRev) => (isRev ? finishDetailOpenState(overlayEl) : finishDetailCloseState(overlayEl));
    detailTl = tl;

    tl.to(
      overlayEl,
      {
        backgroundColor: 'rgba(4, 5, 10, 0)',
        duration: 0.3,
        ease: 'power2.out',
      },
      0
    );

    tl.to(
      morphState,
      {
        t: 0,
        duration: 0.36,
        ease: STAGE_EASE,
        onUpdate: () => applyDetailMorphFrame(panel, compact, startRect, morphState.t),
      },
      0
    );

    if (bgPeers.length) {
      const cx = startRect.left + startRect.width * 0.5;
      const cy = startRect.top + startRect.height * 0.5;
      bgPeers.forEach((el, i) => {
        const r = peerRects[i];
        const dx = (cx - (r.left + r.width * 0.5)) * 0.34;
        const dy = (cy - (r.top + r.height * 0.5)) * 0.34;
        tl.fromTo(
          el,
          { x: dx, y: dy, scale: 0.82, autoAlpha: 0 },
          { x: 0, y: 0, scale: 1, autoAlpha: 1, duration: 0.34, ease: STAGE_EASE },
          0.02 + i * 0.018
        );
      });
    }
  }

  // ---------- Router Hash & Điều hướng ----------
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '').trim();
    if (!raw) return { subject: null, section: null };

    const params = new URLSearchParams(raw);
    const subSlug = params.get('mon');
    const secKey = params.get('muc');
    const subjectName = subSlug ? Theme.nameOfSlug(subSlug) : null;
    const validSection =
      subjectName && secKey && SUBJECT_SECTIONS.some((s) => s.key === secKey) ? secKey : null;

    return { subject: subjectName, section: validSection };
  }

  function buildHash(subjectName, sectionKey) {
    if (!subjectName) return '#/';
    const slug = Theme.slugOf(subjectName);
    if (!sectionKey) return `#mon=${slug}`;
    return `#mon=${slug}&muc=${encodeURIComponent(sectionKey)}`;
  }

  function navigate(subjectName, sectionKey) {
    const targetHash = buildHash(subjectName, sectionKey);
    if (location.hash === targetHash) {
      syncRoute(true);
    } else {
      location.hash = targetHash;
    }
  }

  function stepBack() {
    if (state.subject && state.section && !detailClosing) {
      navigate(state.subject, null);
    } else if (state.subject) {
      navigate(null, null);
    }
  }

  function showBackButton(show) {
    const backBtn = $('#liteBack');
    if (!backBtn) return;
    if (show && backBtn.hidden) {
      if (gsap) gsap.killTweensOf(backBtn);
      backBtn.hidden = false;
      if (gsap && !isReduced()) {
        gsap.fromTo(
          backBtn,
          { x: -12, scale: 0.82, autoAlpha: 0 },
          { x: 0, scale: 1, autoAlpha: 1, duration: 0.38, ease: 'back.out(1.9)', clearProps: 'transform,opacity,visibility' }
        );
      } else if (useFade()) {
        gsap.set(backBtn, { clearProps: 'transform,visibility' });
        gsap.fromTo(backBtn, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out', clearProps: 'opacity' });
      } else if (gsap) {
        gsap.set(backBtn, { clearProps: 'transform,opacity,visibility' });
      }
    } else if (!show && !backBtn.hidden) {
      if (gsap) gsap.killTweensOf(backBtn);
      if (useFade()) {
        gsap.to(backBtn, {
          opacity: 0,
          duration: 0.14,
          ease: 'power1.in',
          onComplete: () => {
            if (!state.subject) backBtn.hidden = true;
            gsap.set(backBtn, { clearProps: 'opacity' });
          },
        });
      } else {
        backBtn.hidden = true;
      }
    }
  }

  function syncRoute(animate = true) {
    const prevSubject = state.subject;
    const prevSection = state.section;
    const { subject: nextSubject, section: nextSection } = parseHash();

    closeGradePopover(true);

    // 1. Mở hoặc đóng Bảng List chi tiết trên cùng một môn
    if (prevSubject && nextSubject === prevSubject) {
      if (!prevSection && nextSection) {
        state.section = nextSection;
        openDetailModal(nextSubject, nextSection, animate);
        return;
      }
      if (prevSection && !nextSection) {
        closeDetailModal(!animate);
        state.section = null;
        return;
      }
      if (prevSection && nextSection && prevSection !== nextSection) {
        state.section = nextSection;
        switchDetailSection(nextSubject, nextSection);
        return;
      }
    }

    // Nếu đang mở bảng List mà nhảy thẳng về Trang chủ hoặc sang môn khác thì đóng bảng List ngay
    if (detailOpen) {
      closeDetailModal(true);
    }

    state.subject = nextSubject;
    state.section = nextSection;

    // 2. Từ Trang chủ bấm vào 1 Môn -> Trượt đặc thẻ môn sang cột trái + bung 3 khung phân hệ bên phải
    if (!prevSubject && nextSubject) {
      transitionHomeToSubject(nextSubject, animate);
      if (nextSection) {
        openDetailModal(nextSubject, nextSection, false);
      }
      return;
    }

    // 3. Từ Trang Môn bấm Quay về Trang chủ -> Khung môn trượt đặc về đúng thẻ dọc trong hàng 5 môn
    if (prevSubject && !nextSubject) {
      transitionSubjectToHome(prevSubject, animate);
      return;
    }

    // 4. Trạng thái khởi tạo lần đầu
    if (!nextSubject) {
      Theme.applyTheme('home');
      showBackButton(false);
      $('#liteSubjectStage').hidden = true;
      $('#liteHomeStage').hidden = false;
    } else {
      transitionHomeToSubject(nextSubject, false);
      if (nextSection) {
        openDetailModal(nextSubject, nextSection, false);
      }
    }
  }

  function render() {
    initHomeStage();
    if (state.subject) {
      populateSubjectStage(state.subject);
      if (state.section) {
        openDetailModal(state.subject, state.section, false);
      }
    }
  }

  // ---------- Đăng nhập / Đăng xuất ----------
  function closeAccountMenu() {
    const menu = $('#liteMenu');
    const avatar = $('#liteAvatar');
    if (!menu || menu.hidden) return;
    if (avatar) avatar.setAttribute('aria-expanded', 'false');

    if (gsap && !isReduced()) {
      gsap.to(menu, {
        autoAlpha: 0,
        scale: 0.85,
        y: -6,
        duration: 0.2,
        ease: 'appleSpring',
        overwrite: 'auto',
        onComplete: () => {
          menu.hidden = true;
        },
      });
    } else {
      menu.hidden = true;
    }
  }

  function prepareHomeIntro() {
    const homeStage = $('#liteHomeStage');
    const banner = $('.lite-home-banner', homeStage);
    const cards = $$('.lite-subject-card', homeStage);
    if (!gsap || state.subject) {
      introPrepared = false;
      if (gsap) gsap.set([homeStage, banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      return;
    }
    if (useFade()) {
      gsap.set([banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      if (homeStage) gsap.set(homeStage, { opacity: 0 });
      introPrepared = true;
      return;
    }
    if (isReduced()) {
      introPrepared = false;
      gsap.set([homeStage, banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      return;
    }
    if (homeStage) gsap.set(homeStage, { clearProps: 'opacity' });
    if (banner) gsap.set(banner, { y: -18, scale: 0.9, autoAlpha: 0 });
    if (cards.length) gsap.set(cards, { y: 24, scale: 0.86, autoAlpha: 0 });
    introPrepared = true;
  }

  function playHomeIntroBounce() {
    const homeStage = $('#liteHomeStage');
    const banner = $('.lite-home-banner', homeStage);
    const cards = $$('.lite-subject-card', homeStage);
    if (!gsap || state.subject) {
      if (introPrepared && gsap) {
        gsap.set([homeStage, banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      }
      introPrepared = false;
      return;
    }
    if (useFade()) {
      introPrepared = false;
      gsap.set([banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      if (homeStage) {
        gsap.killTweensOf(homeStage);
        gsap.fromTo(homeStage, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'opacity' });
      }
      return;
    }
    if (isReduced()) {
      if (introPrepared) {
        gsap.set([homeStage, banner, ...cards].filter(Boolean), { clearProps: 'transform,opacity,visibility' });
      }
      introPrepared = false;
      return;
    }
    introPrepared = false;
    if (homeStage) gsap.set(homeStage, { clearProps: 'opacity' });
    if (banner) {
      gsap.fromTo(
        banner,
        { y: -18, scale: 0.9, autoAlpha: 0 },
        { y: 0, scale: 1, autoAlpha: 1, duration: 0.48, ease: 'appleBounce', clearProps: 'transform,opacity,visibility' }
      );
    }
    if (cards.length) {
      gsap.fromTo(
        cards,
        { y: 24, scale: 0.86, autoAlpha: 0 },
        {
          y: 0,
          scale: 1,
          autoAlpha: 1,
          duration: 0.54,
          stagger: 0.05,
          ease: 'back.out(1.75)',
          clearProps: 'transform,opacity,visibility',
        }
      );
    }
  }

  function login(name, options = {}) {
    const cleanName = (name || 'Bạn').trim() || 'Bạn';
    state.user = cleanName;
    applyMotionAttr();
    document.body.classList.remove('is-locked');

    const loginEl = $('#liteLogin');
    if (loginEl) {
      if (gsap && !isReduced()) {
        gsap.to(loginEl, {
          autoAlpha: 0,
          scale: 0.94,
          duration: 0.3,
          ease: 'appleSpring',
          onComplete: () => {
            loginEl.hidden = true;
            gsap.set(loginEl, { clearProps: 'all' });
          },
        });
      } else {
        loginEl.hidden = true;
      }
    }

    const accountEl = $('#liteAccount');
    if (accountEl) accountEl.hidden = false;

    const letterEl = $('#liteAvatarLetter');
    if (letterEl) letterEl.textContent = cleanName[0].toUpperCase();

    const whoEl = $('#liteWho');
    if (whoEl) whoEl.textContent = cleanName;

    if (options && options.deferIntro) {
      prepareHomeIntro();
    } else {
      playHomeIntroBounce();
    }
  }

  function logout() {
    state.user = null;
    closeAccountMenu();
    closeGradePopover(true);
    closeDetailModal(true);
    unlockScroll();
    const accountEl = $('#liteAccount');
    if (accountEl) accountEl.hidden = true;

    navigate(null, null);
    document.body.classList.add('is-locked');

    const loginEl = $('#liteLogin');
    if (loginEl) {
      loginEl.hidden = false;
      const sheet = $('.lite-sheet', loginEl);
      if (sheet && gsap && !isReduced()) {
        gsap.fromTo(
          sheet,
          { scale: 0.88, autoAlpha: 0, y: 12 },
          { scale: 1, autoAlpha: 1, y: 0, duration: 0.42, ease: 'appleBounce' }
        );
      }
    }

    $('#liteEmail')?.focus();
  }

  // ---------- Khởi tạo ----------
  function initStaticIcons() {
    const setIcon = (id, html) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    };
    setIcon('liteSheetMark', Icons.ui.brand);
    setIcon('liteBackIcon', Icons.ui.back);
    setIcon('liteGradeChev', Icons.ui.chevronDown);
    setIcon('liteLogoutIcon', Icons.ui.logout);
    setIcon('liteGoogleIcon', Icons.ui.google);
  }

  function initHeaderButtonSprings() {
    if (!gsap || !global.matchMedia('(hover: hover)').matches) return;

    const backBtn = $('#liteBack');
    const backIc = $('#liteBackIcon');
    if (backBtn) {
      backBtn.addEventListener('pointerenter', () => {
        if (isReduced()) return;
        gsap.to(backBtn, { scale: 1.05, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
        if (backIc) gsap.to(backIc, { x: -3.5, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
      });
      backBtn.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set([backBtn, backIc].filter(Boolean), { clearProps: 'transform' });
          return;
        }
        gsap.to(backBtn, { scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
        if (backIc) gsap.to(backIc, { x: 0, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
      });
    }

    const gradeBtn = $('#liteGradeBtn');
    if (gradeBtn) {
      gradeBtn.addEventListener('pointerenter', () => {
        if (isReduced()) return;
        gsap.to(gradeBtn, { scale: 1.04, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
      });
      gradeBtn.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set(gradeBtn, { clearProps: 'transform' });
          return;
        }
        gsap.to(gradeBtn, { scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
      });
    }

    const avatar = $('#liteAvatar');
    if (avatar) {
      avatar.addEventListener('pointerenter', () => {
        if (isReduced()) return;
        gsap.to(avatar, { scale: 1.08, duration: 0.3, ease: 'appleBounce', overwrite: 'auto' });
      });
      avatar.addEventListener('pointerleave', () => {
        if (isReduced()) {
          gsap.set(avatar, { clearProps: 'transform' });
          return;
        }
        gsap.to(avatar, { scale: 1, duration: 0.28, ease: 'appleSpring', overwrite: 'auto', clearProps: 'transform' });
      });
    }
  }

  function initScrollHeader() {
    const sentinel = $('#liteSentinel');
    const header = $('#liteHeader');
    if (!sentinel || !header || typeof IntersectionObserver !== 'function') return;

    const io = new IntersectionObserver(
      ([entry]) => {
        header.classList.toggle('is-scrolled', !entry.isIntersecting);
      },
      { threshold: 0 }
    );
    io.observe(sentinel);
  }

  function init() {
    initStaticIcons();
    buildGradePopover();
    initHomeStage();
    Theme.init(document.querySelectorAll('.lite-bg-layer'));
    bindFluidInteractions(document.body);
    initHeaderButtonSprings();
    initScrollHeader();

    $('#liteBack')?.addEventListener('click', stepBack);

    $('#liteGradeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleGradePopover();
    });

    $('#liteDetailOverlay')?.addEventListener('click', (e) => {
      if (e.target === $('#liteDetailOverlay') && state.subject) {
        navigate(state.subject, null);
      }
    });

    $('#liteLoginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = $('#liteEmail')?.value || '';
      login(raw.split('@')[0] || 'Bạn');
    });

    $('#liteGoogle')?.addEventListener('click', () => login('Bạn'));

    $('#liteAvatar')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = $('#liteMenu');
      const avatar = $('#liteAvatar');
      if (!menu || !avatar) return;
      const willOpen = menu.hidden;
      if (!willOpen) {
        closeAccountMenu();
        return;
      }
      closeGradePopover();
      menu.hidden = false;
      avatar.setAttribute('aria-expanded', 'true');
      if (gsap && !isReduced()) {
        gsap.killTweensOf(menu);
        gsap.fromTo(
          menu,
          { autoAlpha: 0, scale: 0.84, y: -8 },
          { autoAlpha: 1, scale: 1, y: 0, duration: 0.34, ease: 'appleBounce', overwrite: 'auto' }
        );
      } else if (gsap) {
        gsap.killTweensOf(menu);
        gsap.set(menu, { clearProps: 'transform,opacity,visibility' });
      }
    });

    $('#liteLogout')?.addEventListener('click', logout);

    document.addEventListener('pointerdown', (e) => {
      if (state.gradePopoverOpen && !e.target.closest('#liteGradePicker')) {
        closeGradePopover();
      }
      if (!e.target.closest('#liteAccount')) {
        closeAccountMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (detailOpen && !detailClosing && state.subject) {
        navigate(state.subject, null);
      } else if (state.gradePopoverOpen) {
        closeGradePopover();
      } else if ($('#liteMenu') && !$('#liteMenu').hidden) {
        closeAccountMenu();
      } else if (state.user && state.subject) {
        stepBack();
      }
    });

    window.addEventListener('hashchange', () => syncRoute(true));

    let resizeRaf = 0;
    const onViewportResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        if (stageMorphTl) completeStageMorph();
        if (detailTl) completeDetailMorph();
        if (detailOpen && !detailClosing) {
          const openPanel = $('#liteDetailOverlay .lite-detail-panel');
          if (openPanel) measurePanelMorphRest(openPanel);
        }
        if (document.body.classList.contains('scroll-locked')) {
          updateScrollLockVar();
        }
      });
    };
    window.addEventListener('resize', onViewportResize, { passive: true });
    window.addEventListener('orientationchange', onViewportResize, { passive: true });

    // Mở khung đăng nhập ban đầu
    const loginEl = $('#liteLogin');
    if (loginEl) {
      loginEl.hidden = false;
      const sheet = $('.lite-sheet', loginEl);
      if (sheet && gsap && !isReduced()) {
        gsap.fromTo(
          sheet,
          { scale: 0.88, autoAlpha: 0, y: 12 },
          { scale: 1, autoAlpha: 1, y: 0, duration: 0.44, ease: 'appleBounce' }
        );
      }
    }

    syncRoute(false);
    $('#liteEmail')?.focus();
  }

  init();

  global.LiteApp = {
    state,
    render,
    navigate,
    login,
    logout,
    toast,
    prepareHomeIntro,
    playHomeIntroBounce,
    getMotionPref,
    setMotionPref,
  };
})(window);

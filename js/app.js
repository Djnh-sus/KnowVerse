/**
 * js/app.js
 * Điều phối chính của ứng dụng Học tập:
 * - Tiêu đề "Học tập" ở giữa phía trên (bỏ Khối 12 khỏi tiêu đề).
 * - Khung môn học hình tròn + hào quang mặt trời + hành tinh bung ra khi hover.
 * - Số Khối (12) nằm trực tiếp trong lõi hố đen, bấm bung vòng 10 · 11 · 12.
 * - Khi vào môn: 3 bảng rút gọn (chỉ Tiêu đề + Mô tả) có mũi chỉa vào hành tinh + nút Quay về ở giữa phía dưới.
 * - Khi bấm vào 1 bảng: ẩn nút Quay về, phóng to bảng thành List Modal kiểu #home-panel ở giữa màn hình, nút X zoom/nảy.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const { SUBJECTS, buildGraphFromSubjects } = window.StudyData;
  const { clamp, bindPressFeedback } = window.UIMotion;

  const state = {
    grade: 12,
    user: null,
    subject: null,
  };

  let bh = null;
  let toastTimer = 0;

  function updateResponsiveScale() {
    const w = window.innerWidth || 1024;
    const h = window.innerHeight || 768;
    const minDim = Math.min(w, h);
    const ui = clamp(minDim / 840, 0.56, 1.04);
    document.documentElement.style.setProperty('--ui', ui.toFixed(3));
  }
  updateResponsiveScale();
  window.addEventListener('resize', updateResponsiveScale, { passive: true });

  bindPressFeedback(document.body);

  function toast(text) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    if (window.gsap) {
      window.gsap.killTweensOf(el);
      window.gsap.fromTo(
        el,
        { y: -14, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.34, ease: 'appleBounce' }
      );
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (window.gsap) {
        window.gsap.to(el, {
          y: -10,
          opacity: 0,
          scale: 0.95,
          duration: 0.24,
          ease: 'appleSpring',
          onComplete: () => { el.hidden = true; },
        });
      } else {
        el.hidden = true;
      }
    }, 2600);
  }

  function showBackButton(show) {
    const backBtn = $('#back');
    if (!backBtn) return;
    if (show) {
      backBtn.hidden = false;
      if (window.gsap) {
        window.gsap.killTweensOf(backBtn);
        window.gsap.fromTo(
          backBtn,
          { y: 16, opacity: 0, scale: 0.9 },
          { y: 0, opacity: 1, scale: 1, duration: 0.38, ease: 'appleBounce', clearProps: 'transform' }
        );
      }
    } else if (!backBtn.hidden) {
      if (window.gsap) {
        window.gsap.killTweensOf(backBtn);
        window.gsap.to(backBtn, {
          y: 12,
          opacity: 0,
          scale: 0.92,
          duration: 0.2,
          ease: 'appleSpring',
          onComplete: () => {
            backBtn.hidden = true;
            backBtn.style.opacity = '';
            backBtn.style.transform = '';
          },
        });
      } else {
        backBtn.hidden = true;
      }
    }
  }

  let panelsController = null;
  let subjectSystem = null;
  let hubsController = null;

  // Modal phóng to dạng List kiểu dự án gốc (#home-panel), mở từ bảng nhỏ và hút ngược về đúng bảng nhỏ
  const detailModal = window.UIDetailModal.createDetailModal($('#detailOverlay'), {
    getAnchorElement: (sectionKey) => panelsController?.getCardElement(sectionKey),
    onOpenChange(isOpen) {
      document.body.classList.toggle('detail-open', isOpen);
      if (state.subject) {
        showBackButton(!isOpen);
      }
    },
    onItemSelect({ subject, item }) {
      toast(`${subject} · ${item.title} (nối nội dung thật ở bước sau)`);
    },
    onUploadClick({ subject, sectionTitle }) {
      toast(`Đăng tải vào "${sectionTitle}" môn ${subject} (làm ở bước nối Supabase)`);
    },
  });

  function openSectionModal(subjectName, sectionKey, triggerEl) {
    setLinkedHover(null);
    detailModal.open(subjectName, sectionKey, triggerEl);
  }

  function setLinkedHover(key) {
    panelsController?.setHoveredKey(key);
    subjectSystem?.setHoveredKey(key);
  }

  panelsController = window.UIPanels.createPanelsController($('#panelLayer'), {
    onOpenSection: openSectionModal,
    onHoverSection: setLinkedHover,
  });

  hubsController = window.UIHubs.createHubsController($('#hubLayer'), {
    onSelectSubject(name) {
      gradeCore.close();
      if (bh) bh.focusRegion(name);
      else onSubjectChanged(name);
    },
  });

  subjectSystem = window.UISubjectSystem.createSubjectSystem(
    $('#systemLayer'),
    panelsController,
    {
      getHubPosition: (name) => hubsController?.getHubPosition(name),
      onOpenSection: openSectionModal,
      onHoverSection: setLinkedHover,
    }
  );

  const gradeCore = window.UIGradeCore.createGradeCore($('#gradeLayer'), {
    initialGrade: state.grade,
    onChangeGrade(g) {
      state.grade = g;
      toast(`Đã chọn Khối ${g}`);
    },
    onLockedGrade(item) {
      toast(`${item.label} sắp mở — hiện đang mở Khối 12`);
    },
  });

  function onSubjectChanged(name) {
    state.subject = name || null;
    const hint = $('#hint');

    if (!name) {
      detailModal.close(true);
      document.body.classList.remove('in-subject');
      showBackButton(false);
      if (state.user) hint.hidden = false;
      if (!bh) subjectSystem.hide();
      return;
    }

    document.body.classList.add('in-subject');
    hint.hidden = true;
    showBackButton(!detailModal.isOpen);
  }

  function backToAll() {
    if (detailModal.isOpen) detailModal.close(true);
    if (bh && bh.region) bh.focusRegion(null);
    else onSubjectChanged(null);
  }

  $('#back').addEventListener('click', backToAll);

  // Đăng nhập mẫu
  function login(name) {
    const cleanName = (name || 'Bạn').trim() || 'Bạn';
    state.user = cleanName;
    document.body.classList.remove('locked');

    const loginEl = $('#login');
    if (loginEl && !loginEl.hidden) {
      if (window.gsap) {
        window.gsap.to(loginEl, {
          opacity: 0,
          scale: 0.96,
          duration: 0.32,
          ease: 'appleSpring',
          onComplete: () => {
            loginEl.hidden = true;
            loginEl.style.opacity = '';
            loginEl.style.transform = '';
          },
        });
      } else {
        loginEl.hidden = true;
      }
    }

    $('#me').hidden = false;
    $('#hint').hidden = !!state.subject;
    $('#avatarLetter').textContent = cleanName[0].toUpperCase();
    $('#who').textContent = cleanName;
  }

  function logout() {
    state.user = null;
    detailModal.close();
    gradeCore.close();
    backToAll();
    $('#menu').hidden = true;
    $('#me').hidden = true;
    $('#hint').hidden = true;
    document.body.classList.add('locked');

    const loginEl = $('#login');
    loginEl.hidden = false;
    if (window.gsap) {
      window.gsap.fromTo(
        loginEl.querySelector('.sheet'),
        { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.38, ease: 'appleBounce' }
      );
    }
    $('#email').focus();
  }

  if (window.KnowVersePortal) {
    // Portal điều phối đăng nhập, chọn giao diện và thanh tài khoản dùng chung
    window.KnowVerse3D = {
      enter: (name) => login(name),
      setOverlayOpen: (open) => bh?.setOverlayOpen?.(open),
      logout,
    };
  } else {
    $('#loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      login($('#email').value.split('@')[0] || 'Bạn');
    });
    $('#google').addEventListener('click', () => login('Bạn'));

    $('#avatar').addEventListener('click', () => {
      const menu = $('#menu');
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      $('#avatar').setAttribute('aria-expanded', String(willOpen));
      if (willOpen && window.gsap) {
        window.gsap.fromTo(
          menu,
          { scale: 0.88, opacity: 0, y: -6 },
          { scale: 1, opacity: 1, y: 0, duration: 0.28, ease: 'appleBounce' }
        );
      }
    });

    $('#logout').addEventListener('click', logout);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#me')) $('#menu').hidden = true;
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (detailModal.isOpen) detailModal.close();
    else if (gradeCore.isOpen) gradeCore.close();
    else if (!$('#menu').hidden) $('#menu').hidden = true;
    else if (state.user && state.subject) backToAll();
  });

  // Bản đồ Hố đen 3D
  if (typeof supportsWebGL2 === 'function' && supportsWebGL2(document)) {
    bh = createBlackHole($('#scene'), buildGraphFromSubjects(), {
      lockCamera: true,
      nativeHubs: false,
      readingPanel: false,
      showLinks: false,     // Tắt tia nối & chấm lộn xộn; thay bằng các ngôi sao trang trí đẹp
      horizon: true,
      spinRate: 2.15,
      precession: 0,
      tiltRange: [0.085, 0.038],
      onRegionChange: (name) => onSubjectChanged(name),
      onFrame: (frame) => {
        hubsController.updateFrame(frame);
        gradeCore.updateFrame(frame);
        subjectSystem.updateFrame(frame);
      },
      label: 'Bản đồ vũ trụ các môn học. Bấm số khối trong hố đen để chọn khối, bấm tên môn để vào học.',
    });

    window.addEventListener('pointermove', (e) => {
      if (!bh || document.body.classList.contains('locked')) return;
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      bh.setTilt(nx, ny);
    }, { passive: true });

    document.addEventListener('pointerleave', () => {
      bh?.setTilt(0, 0);
    });
  } else {
    const list = $('#fallback');
    list.hidden = false;
    for (const name of Object.keys(SUBJECTS)) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: name });
      b.addEventListener('click', () => onSubjectChanged(name));
      list.append(b);
    }
  }

  $('#email').focus();
})();

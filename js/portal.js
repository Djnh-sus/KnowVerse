/* js/portal.js
 * Bộ điều phối đăng nhập, chọn giao diện mỗi lần đăng nhập và thanh tài khoản dùng chung (3D Hố đen vs Giao diện Nhẹ).
 * - Trước khi đăng nhập (body.locked) và lúc chọn giao diện (body.choosing-mode):
 *   chỉ hiển thị nền 1 màu (#000000), không nạp hay dựng bất kỳ giao diện nào phía sau.
 * - Hiện bảng chọn giao diện sau mỗi lần đăng nhập; đồng thời vẫn lưu lựa chọn gần nhất theo thiết bị (localStorage)
 *   để sẵn sàng nối đồng bộ người dùng qua Supabase về sau.
 * - Quản lý menu Avatar 3 lựa chọn:
 *   1) Thông tin tài khoản (kèm khung Bài đăng của bản thân để trống)
 *   2) Cài đặt (danh sách các thanh ngang; thanh đầu là Giao diện hiển thị, bấm nút Đổi mới mở bảng chọn giao diện)
 *   3) Đăng xuất
 */
(() => {
  'use strict';

  const MODE_STORAGE_KEY = 'knowverse_device_ui_mode';
  // Cờ "đã chọn giao diện cho lượt đăng nhập này" (lưu id user). Xóa khi đăng xuất / đăng nhập mới.
  const MODE_CHOSEN_KEY = 'knowverse_mode_chosen_uid';
  const LITE_MOTION_KEY = 'knowverse_lite_motion';
  const SWITCH_HANDOFF_KEY = 'knowverse_switch_handoff';
  const WINDOW_NAME_PREFIX = 'KV_SWITCH_HANDOFF:';
  const ALWAYS_ASK_MODE_ON_LOGIN = true;
  const IS_FILE_PROTOCOL = window.location.protocol === 'file:';

  const LITE_MOTION_CHOICES = [
    { key: 'full', label: 'Đầy đủ' },
    { key: 'reduced', label: 'Giảm' },
    { key: 'fast', label: 'Nhanh' },
  ];

  const MODE_CSS = {
    '3d': [
      'styles/blackhole.css',
      'styles/hubs.css',
      'styles/grade-core.css',
      'styles/subject-system.css',
      'styles/panel.css',
      'styles/detail-modal.css',
      'styles/responsive.css',
    ],
    lite: [
      'styles/lite.css',
      'styles/lite-themes.css',
      'styles/lite-motion.css',
    ],
  };

  const MODE_JS = {
    '3d': [
      'js/engine/sky.js',
      'js/engine/accretion.js',
      'js/engine/lens.js',
      'js/engine/blackhole.js',
      'js/ui/motion.js',
      'js/ui/hubs.js',
      'js/ui/grade-core.js',
      'js/ui/panel.js',
      'js/ui/detail-modal.js',
      'js/ui/subject-system.js',
      'js/app.js',
    ],
    lite: [
      'js/lite/lite-icons.js',
      'js/lite/lite-theme.js',
      'js/lite/lite-app.js',
    ],
  };

  const MODE_LABELS = {
    '3d': 'Không gian 3D (Hố đen)',
    lite: 'Giao diện Nhẹ (2D)',
  };

  const $ = (s) => document.querySelector(s);

  const memoryStore = {};
  const state = {
    user: null,
    mode: null,
    isBooting: false,
    bootedMode: null,
    handoffActive: false,
    isLoggingOut: false,
  };

  let toastTimer = 0;

  // ---------- Lưu trữ an toàn trên file:/// + Điểm nối Supabase sau này ----------
  function isValidMode(mode) {
    return mode === '3d' || mode === 'lite';
  }

  function getSavedMode() {
    try {
      const val = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (isValidMode(val)) return val;
    } catch {
      // Dự phòng trong bộ nhớ nếu trình duyệt khóa storage trên file:///
    }
    const mem = memoryStore[MODE_STORAGE_KEY];
    return isValidMode(mem) ? mem : null;
  }

  function saveMode(mode) {
    if (!isValidMode(mode)) return;
    memoryStore[MODE_STORAGE_KEY] = mode;
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, mode);
    } catch {
      // Bỏ qua khi không ghi được localStorage
    }
    if (typeof portal.onModeSaved === 'function') {
      portal.onModeSaved(mode, state.user);
    }
  }

  function isModeChosenFor(user) {
    if (!user || !user.id) return false;
    try {
      return window.localStorage.getItem(MODE_CHOSEN_KEY) === user.id;
    } catch {
      return memoryStore[MODE_CHOSEN_KEY] === user.id;
    }
  }

  function markModeChosen(user) {
    if (!user || !user.id) return;
    memoryStore[MODE_CHOSEN_KEY] = user.id;
    try {
      window.localStorage.setItem(MODE_CHOSEN_KEY, user.id);
    } catch {
      // Bỏ qua
    }
  }

  function clearModeChosen() {
    delete memoryStore[MODE_CHOSEN_KEY];
    try {
      window.localStorage.removeItem(MODE_CHOSEN_KEY);
    } catch {
      // Bỏ qua
    }
  }

  function clearSavedMode() {
    delete memoryStore[MODE_STORAGE_KEY];
    try {
      window.localStorage.removeItem(MODE_STORAGE_KEY);
    } catch {
      // Bỏ qua
    }
  }

  function isValidLiteMotion(val) {
    return val === 'full' || val === 'reduced' || val === 'fast';
  }

  function getLiteMotionPref() {
    try {
      const saved = window.localStorage.getItem(LITE_MOTION_KEY);
      if (isValidLiteMotion(saved)) return saved;
    } catch {
      // Bỏ qua
    }
    const mem = memoryStore[LITE_MOTION_KEY];
    if (isValidLiteMotion(mem)) return mem;
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  }

  function syncDocumentMotionAttr() {
    if (state.mode === 'lite') {
      document.documentElement.dataset.motion = getLiteMotionPref();
    } else {
      delete document.documentElement.dataset.motion;
    }
  }

  function setLiteMotionPref(val) {
    if (!isValidLiteMotion(val)) return;
    memoryStore[LITE_MOTION_KEY] = val;
    try {
      window.localStorage.setItem(LITE_MOTION_KEY, val);
    } catch {
      // Bỏ qua
    }
    syncDocumentMotionAttr();
    if (state.mode === 'lite' && window.LiteApp && typeof window.LiteApp.setMotionPref === 'function') {
      window.LiteApp.setMotionPref(val);
    }
    syncSettingsDisplayUI();
  }

  // Ở chế độ 3D luôn giữ nguyên 100% chuyển động mặc định; chỉ đọc mức hiệu ứng khi đang ở Giao diện Nhẹ
  function effectivePortalMotion() {
    return state.mode === 'lite' ? getLiteMotionPref() : 'full';
  }

  function writeSwitchHandoff(payload) {
    const raw = JSON.stringify(payload);
    try {
      window.sessionStorage.setItem(SWITCH_HANDOFF_KEY, raw);
    } catch {
      // Fallback sang window.name cho môi trường hạn chế sessionStorage
    }
    try {
      window.name = WINDOW_NAME_PREFIX + raw;
    } catch {
      // Bỏ qua
    }
  }

  function consumeSwitchHandoff() {
    let raw = null;
    try {
      raw = window.sessionStorage.getItem(SWITCH_HANDOFF_KEY);
      window.sessionStorage.removeItem(SWITCH_HANDOFF_KEY);
    } catch {
      raw = null;
    }
    try {
      if (typeof window.name === 'string' && window.name.startsWith(WINDOW_NAME_PREFIX)) {
        if (!raw) raw = window.name.slice(WINDOW_NAME_PREFIX.length);
        window.name = '';
      }
    } catch {
      // Bỏ qua
    }
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data && data.user && data.user.name && isValidMode(data.mode)) {
        return data;
      }
    } catch {
      return null;
    }
    return null;
  }

  function clearUrlHash() {
    if (!window.location.hash) return;
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      window.location.hash = '';
    }
  }

  // ---------- Toast dùng chung ----------
  function toast(text) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    const motion = effectivePortalMotion();
    if (window.gsap) {
      window.gsap.killTweensOf(el);
      if (motion === 'full') {
        window.gsap.fromTo(
          el,
          { opacity: 0, y: 10, scale: 0.94 },
          { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' }
        );
      } else if (motion === 'reduced') {
        window.gsap.set(el, { clearProps: 'transform' });
        window.gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power1.out' });
      } else {
        window.gsap.set(el, { clearProps: 'transform,opacity' });
      }
    }
    toastTimer = setTimeout(() => {
      const m = effectivePortalMotion();
      if (window.gsap && m !== 'fast') {
        window.gsap.to(el, {
          opacity: 0,
          y: m === 'full' ? -6 : 0,
          duration: m === 'full' ? 0.22 : 0.14,
          ease: 'power2.in',
          onComplete: () => {
            el.hidden = true;
            el.style.opacity = '';
            el.style.transform = '';
          },
        });
      } else {
        el.hidden = true;
        el.style.opacity = '';
        el.style.transform = '';
      }
    }, 2400);
  }

  // ---------- Màn chờ đen kèm vòng xoay (#kvBoot) ----------
  let bootEnded = false;
  let bootSafetyTimer = 0;
  let veilOutTimer = 0;

  const afterPaint = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));

  function isBootVeilOn() {
    const c = document.documentElement.classList;
    const veil = $('#kvBoot');
    return (
      (c.contains('kv-boot') && !c.contains('kv-reveal')) ||
      !!(veil && veil.classList.contains('is-active') && !veil.classList.contains('is-out'))
    );
  }

  function showVeil() {
    clearTimeout(veilOutTimer);
    clearTimeout(bootSafetyTimer);
    bootEnded = false;
    bootSafetyTimer = setTimeout(endBoot, 6000);
    const veil = $('#kvBoot');
    if (!veil || isBootVeilOn()) return Promise.resolve();

    veil.hidden = false;
    veil.classList.remove('is-out', 'is-dots-on', 'is-dots-Instant');
    if (effectivePortalMotion() === 'fast') {
      veil.classList.remove('is-enter');
      veil.classList.add('is-active', 'is-dots-Instant', 'is-dots-on');
      return Promise.resolve();
    }

    // Bước 1: Fade màn đen phủ kín xong -> Bước 2: Pop up vòng chấm xoay lên ở chính tâm
    return new Promise((resolve) => {
      let fadedIn = false;
      const onFadeDone = () => {
        if (fadedIn) return;
        fadedIn = true;
        veil.classList.add('is-dots-on');
        setTimeout(resolve, 210);
      };
      veil.classList.add('is-active', 'is-enter');
      void veil.offsetWidth;
      requestAnimationFrame(() => {
        veil.classList.remove('is-enter');
      });
      veil.addEventListener('transitionend', (e) => {
        if (e.target === veil) onFadeDone();
      });
      setTimeout(onFadeDone, 360);
    });
  }

  function endBoot(onRevealed) {
    if (bootEnded) {
      if (typeof onRevealed === 'function') onRevealed();
      return;
    }
    bootEnded = true;
    clearTimeout(bootSafetyTimer);
    clearTimeout(veilOutTimer);

    const root = document.documentElement;
    delete root.dataset.kvSwitching;
    const veil = $('#kvBoot');
    const wasActive = veil && (root.classList.contains('kv-boot') || veil.classList.contains('is-active'));
    if (!wasActive) {
      root.classList.remove('kv-boot', 'kv-reveal');
      if (typeof onRevealed === 'function') onRevealed();
      return;
    }

    if (effectivePortalMotion() === 'fast') {
      root.classList.remove('kv-boot', 'kv-reveal');
      veil.classList.remove('is-active', 'is-out', 'is-enter', 'is-dots-on', 'is-dots-Instant');
      veil.hidden = true;
      if (typeof onRevealed === 'function') onRevealed();
      return;
    }

    // Bước 1: Thu ẩn vòng chấm xoay trước trên nền đen -> Bước 2: Fade out màn đen mượt ra giao diện
    veil.hidden = false;
    const hadDots = veil.classList.contains('is-dots-on');
    veil.classList.remove('is-dots-Instant', 'is-dots-on');

    const startFadeOut = () => {
      root.classList.add('kv-reveal');
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(veilOutTimer);
        root.classList.remove('kv-boot', 'kv-reveal');
        veil.classList.remove('is-active', 'is-out', 'is-enter', 'is-dots-on', 'is-dots-Instant');
        veil.hidden = true;
        if (typeof onRevealed === 'function') onRevealed();
      };
      requestAnimationFrame(() => veil.classList.add('is-out'));
      veil.addEventListener('transitionend', (e) => {
        if (e.target === veil) done();
      });
      veilOutTimer = setTimeout(done, 460);
    };

    if (hadDots) {
      setTimeout(startFadeOut, 150);
    } else {
      startFadeOut();
    }
  }

  // ---------- Nạp CSS / JS theo chế độ đã chọn ----------
  function loadStylesheet(href) {
    const existing = document.querySelector(`link[rel="stylesheet"][data-portal-href="${href}"]`);
    if (existing) {
      existing.disabled = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.portalHref = href;
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      link.addEventListener('load', done, { once: true });
      link.addEventListener('error', done, { once: true });
      setTimeout(done, 4000);
      const portalCssLink = document.querySelector('link[href^="styles/portal.css"]');
      if (portalCssLink && portalCssLink.parentNode) {
        portalCssLink.parentNode.insertBefore(link, portalCssLink);
      } else {
        document.head.appendChild(link);
      }
      if (link.sheet) done();
    });
  }

  function loadScript(src) {
    const existing = document.querySelector(`script[data-portal-src="${src}"]`);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.dataset.portalSrc = src;
      s.addEventListener('load', () => resolve(), { once: true });
      s.addEventListener('error', () => reject(new Error(`Không nạp được script: ${src}`)), { once: true });
      setTimeout(() => reject(new Error(`Quá thời gian nạp script: ${src}`)), 10000);
      document.body.appendChild(s);
    });
  }

  async function loadModeAssets(mode) {
    const cssList = MODE_CSS[mode] || [];
    const jsList = MODE_JS[mode] || [];
    if (mode === 'lite') {
      // Nhẹ: CSS và JS tải song song; script có async=false nên vẫn thực thi đúng thứ tự khai báo
      await Promise.all([...cssList.map(loadStylesheet), ...jsList.map(loadScript)]);
      return;
    }
    // 3D: nạp song song CSS trước để .sbbh có kích thước chuẩn, sau đó tải song song 11 script (giữ nguyên thứ tự thực thi nhờ async=false)
    await Promise.all(cssList.map(loadStylesheet));
    await Promise.all(jsList.map(loadScript));
  }

  // ---------- Tiện ích Modal chung ----------
  function closeIconMarkup() {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;
  }

  function animateModalOpen(overlay) {
    if (!overlay) return;
    overlay._closing = false;
    overlay.style.pointerEvents = '';
    const panel = overlay.querySelector('.kv-modal-panel');
    if (!window.gsap) return;

    window.gsap.killTweensOf([overlay, panel].filter(Boolean));
    const motion = effectivePortalMotion();
    if (motion === 'fast') {
      window.gsap.set([overlay, panel].filter(Boolean), { clearProps: 'transform,opacity' });
      return;
    }
    if (motion === 'reduced') {
      window.gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out', clearProps: 'opacity' });
      if (panel) {
        window.gsap.set(panel, { clearProps: 'transform' });
        window.gsap.fromTo(panel, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out', clearProps: 'opacity' });
      }
      return;
    }
    window.gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.24, ease: 'power2.out', clearProps: 'opacity' });
    if (panel) {
      window.gsap.fromTo(
        panel,
        { opacity: 0, y: 20, scale: 0.87 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.36,
          ease: 'back.out(1.3)',
          clearProps: 'transform,opacity',
        }
      );
    }
  }

  function syncModalBodyState() {
    const hasOpen = ['#accountOverlay', '#settingsOverlay', '#modeSwitchOverlay'].some((sel) => {
      const el = $(sel);
      return el && !el.hidden && !el._closing;
    });
    document.body.classList.toggle('kv-modal-open', hasOpen);
    window.KnowVerse3D?.setOverlayOpen?.(hasOpen);
  }

  function closePortalModal(overlay, options = {}) {
    if (!overlay || overlay.hidden) return;
    const immediate = !!(options && options.immediate);
    const panel = overlay.querySelector('.kv-modal-panel');
    const finish = () => {
      overlay._closing = false;
      overlay.hidden = true;
      overlay.style.pointerEvents = '';
      if (window.gsap) {
        window.gsap.set([overlay, panel].filter(Boolean), { clearProps: 'transform,opacity' });
      }
      syncModalBodyState();
    };

    const motion = effectivePortalMotion();
    if (immediate || !window.gsap || motion === 'fast') {
      if (window.gsap) window.gsap.killTweensOf([overlay, panel].filter(Boolean));
      finish();
      return;
    }

    if (overlay._closing) return;
    overlay._closing = true;
    overlay.style.pointerEvents = 'none';
    syncModalBodyState();
    window.gsap.killTweensOf([overlay, panel].filter(Boolean));

    if (motion === 'reduced') {
      window.gsap.to([panel, overlay].filter(Boolean), {
        opacity: 0,
        duration: 0.18,
        ease: 'power1.in',
        onComplete: finish,
      });
      return;
    }

    if (panel) {
      window.gsap.to(panel, {
        opacity: 0,
        y: 16,
        scale: 0.88,
        duration: 0.22,
        ease: 'power2.in',
      });
    }
    window.gsap.to(overlay, {
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: finish,
    });
  }

  function closeAnyInfoModal() {
    const sw = $('#modeSwitchOverlay');
    if (sw && !sw.hidden && !sw._closing) {
      closePortalModal(sw, { immediate: true });
      openSettingsModal({ expandDisplay: true });
      return true;
    }
    const acc = $('#accountOverlay');
    if (acc && !acc.hidden && !acc._closing) {
      closePortalModal(acc);
      return true;
    }
    const set = $('#settingsOverlay');
    if (set && !set.hidden && !set._closing) {
      closePortalModal(set);
      return true;
    }
    return false;
  }

  // ---------- Modal 1: Thông tin tài khoản & Bài đăng của bản thân ----------
  function ensureAccountOverlay() {
    let overlay = $('#accountOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'accountOverlay';
    overlay.className = 'kv-portal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kvAccountTitle');

    overlay.innerHTML = `
      <div class="kv-modal-panel is-narrow">
        <div class="kv-sheet-top">
          <div>
            <div class="kv-eyebrow">Hồ sơ cá nhân</div>
            <h2 id="kvAccountTitle" class="kv-modal-title">Thông tin tài khoản</h2>
          </div>
          <button type="button" class="kv-close-btn" data-close-modal aria-label="Đóng bảng tài khoản">
            ${closeIconMarkup()}
          </button>
        </div>

        <div class="kv-profile-card">
          <div id="kvProfileAvatar" class="kv-profile-avatar">B</div>
          <div class="kv-profile-info">
            <h3 id="kvProfileName" class="kv-profile-name">Bạn</h3>
            <p id="kvProfileEmail" class="kv-profile-email">Chưa liên kết email</p>
            <div class="kv-pill-row">
              <span id="kvProfileProvider" class="kv-chip">Đăng nhập nhanh</span>
              <span id="kvProfileRole" class="kv-chip" hidden>Thành viên</span>
            </div>
          </div>
          <div class="kv-profile-stars" title="Điểm đánh giá trung bình (0–5) và số lượt đánh giá" aria-label="Điểm đánh giá trung bình">
            <svg class="kv-star-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2.4l2.92 5.92 6.53.95-4.72 4.6 1.11 6.5L12 17.3l-5.84 3.07 1.11-6.5-4.72-4.6 6.53-.95L12 2.4z"/>
            </svg>
            <span id="kvProfileStarsAvg" class="kv-star-avg">0.0</span>
            <span id="kvProfileStarsCount" class="kv-star-count">(0)</span>
          </div>
        </div>

        <div class="kv-section">
          <div class="kv-section-head">
            <div class="kv-section-title-wrap">
              <h3 class="kv-section-title">Bài đăng của bản thân</h3>
              <span id="kvPostsCount" class="kv-chip">0</span>
            </div>
            <button type="button" id="kvNewPostStub" class="kv-action-btn">+ Tạo bài đăng</button>
          </div>

          <div class="kv-empty-stage">
            <span class="kv-empty-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </span>
            <p class="kv-empty-title">Chưa có bài đăng nào</p>
            <p class="kv-empty-desc">
              Vùng hiển thị bài đăng của bản thân đã thiết kế sẵn (để trống chờ kết nối dữ liệu).
            </p>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close-modal]')) {
        closePortalModal(overlay);
      }
    });

    $('#kvNewPostStub')?.addEventListener('click', () => {
      toast('Chức năng đăng bài sẽ hoạt động khi nối Supabase.');
    });

    return overlay;
  }

  function openAccountModal() {
    closeAccountMenu(true);
    ['#settingsOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s), { immediate: true }));
    const overlay = ensureAccountOverlay();
    const user = state.user || { name: 'Bạn', email: '', provider: 'email' };

    const avatarEl = $('#kvProfileAvatar');
    const nameEl = $('#kvProfileName');
    const emailEl = $('#kvProfileEmail');
    const providerEl = $('#kvProfileProvider');
    const roleEl = $('#kvProfileRole');
    const starsAvgEl = $('#kvProfileStarsAvg');
    const starsCountEl = $('#kvProfileStarsCount');
    const postsCountEl = $('#kvPostsCount');

    if (avatarEl) avatarEl.textContent = (user.name || 'B')[0].toUpperCase();
    if (nameEl) nameEl.textContent = user.name || 'Bạn';
    if (emailEl) {
      emailEl.textContent = user.email || (user.id ? 'Đăng nhập bằng Google' : 'Chưa liên kết email (chế độ mẫu)');
    }
    if (providerEl) {
      providerEl.textContent = user.provider === 'google' ? 'Google' : user.id ? 'Email Supabase' : 'Email mẫu';
    }
    if (roleEl) {
      if (user.id) {
        roleEl.hidden = false;
        roleEl.textContent = user.role === 'admin' ? 'Quản trị viên' : 'Thành viên';
      } else {
        roleEl.hidden = true;
      }
    }
    if (starsAvgEl) starsAvgEl.textContent = '0.0';
    if (starsCountEl) starsCountEl.textContent = '(0)';
    if (postsCountEl) postsCountEl.textContent = '0';

    if (user.id && window.KV_AUTH) {
      if (typeof window.KV_AUTH.fetchMyContributions === 'function') {
        window.KV_AUTH.fetchMyContributions(user.id)
          .then((rows) => {
            if (postsCountEl && Array.isArray(rows)) {
              postsCountEl.textContent = String(rows.length);
            }
          })
          .catch(() => {});
      }
      if (typeof window.KV_AUTH.fetchMyStarStats === 'function') {
        window.KV_AUTH.fetchMyStarStats(user.id)
          .then((stats) => {
            if (!stats || typeof stats !== 'object') return;
            const rawAvg = Number(stats.avg);
            const rawCount = Number(stats.count);
            if (starsAvgEl && Number.isFinite(rawAvg)) {
              const clamped = Math.max(0, Math.min(5, rawAvg));
              starsAvgEl.textContent = clamped.toFixed(1);
            }
            if (starsCountEl && Number.isFinite(rawCount) && rawCount >= 0) {
              starsCountEl.textContent = `(${Math.floor(rawCount)})`;
            }
          })
          .catch(() => {});
      }
    }

    overlay.hidden = false;
    syncModalBodyState();
    animateModalOpen(overlay);
  }

  // ---------- Modal 2: Cài đặt (Mục mở rộng "Giao diện & Hiển thị" + các mục mẫu) ----------
  function syncSettingsDisplayUI() {
    const overlay = $('#settingsOverlay');
    if (!overlay) return;

    const modeLabel = MODE_LABELS[state.mode] || 'Chưa chọn';
    const motionPref = getLiteMotionPref();
    const activeIdx = Math.max(0, LITE_MOTION_CHOICES.findIndex((c) => c.key === motionPref));
    const choice = LITE_MOTION_CHOICES[activeIdx] || LITE_MOTION_CHOICES[0];

    const summaryEl = overlay.querySelector('#kvDisplayGroupSummary');
    if (summaryEl) {
      summaryEl.textContent =
        state.mode === 'lite'
          ? `${modeLabel} · Hiệu ứng: ${choice.label}`
          : `${modeLabel} · Hiệu ứng Nhẹ: ${choice.label}`;
    }

    const modeDescEl = overlay.querySelector('#kvSettingModeDesc');
    if (modeDescEl) {
      modeDescEl.textContent = `Đang dùng: ${modeLabel}`;
    }

    const segEl = overlay.querySelector('.kv-seg');
    if (segEl) {
      segEl.style.setProperty('--seg-idx', String(activeIdx));
    }

    overlay.querySelectorAll('.kv-seg-btn[data-motion-choice]').forEach((btn) => {
      const active = btn.dataset.motionChoice === motionPref;
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
  }

  function setDisplayGroupExpanded(overlay, expanded) {
    if (!overlay) return;
    const group = overlay.querySelector('#kvDisplayGroup');
    const headBtn = overlay.querySelector('#kvDisplayGroupBtn');
    const wrap = overlay.querySelector('#kvDisplayGroupWrap');
    if (!group || !headBtn || !wrap) return;

    const open = !!expanded;
    group.classList.toggle('is-open', open);
    headBtn.setAttribute('aria-expanded', String(open));
    if ('inert' in wrap) wrap.inert = !open;
  }

  function ensureSettingsOverlay() {
    let overlay = $('#settingsOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'settingsOverlay';
    overlay.className = 'kv-portal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kvSettingsTitle');

    const motionButtonsMarkup = LITE_MOTION_CHOICES.map(
      (c) => `<button type="button" class="kv-seg-btn" role="radio" data-motion-choice="${c.key}">${c.label}</button>`
    ).join('');

    overlay.innerHTML = `
      <div class="kv-modal-panel is-narrow">
        <div class="kv-sheet-top">
          <div>
            <div class="kv-eyebrow">Tùy chỉnh hệ thống</div>
            <h2 id="kvSettingsTitle" class="kv-modal-title">Cài đặt</h2>
            <p class="kv-modal-sub">Các tùy chọn thiết lập của KnowVerse trên thiết bị này.</p>
          </div>
          <button type="button" class="kv-close-btn" data-close-modal aria-label="Đóng cài đặt">
            ${closeIconMarkup()}
          </button>
        </div>

        <div class="kv-setting-list">
          <!-- Mục gộp 1: Giao diện & Hiển thị (bấm vào để mở rộng các tùy chọn bên trong) -->
          <div id="kvDisplayGroup" class="kv-setting-group is-primary-row">
            <button type="button" id="kvDisplayGroupBtn" class="kv-setting-group-head" aria-expanded="false" aria-controls="kvDisplayGroupBody">
              <div class="kv-setting-left">
                <span class="kv-setting-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2.5" y="3.5" width="19" height="13" rx="2.2"/>
                    <line x1="8" y1="20.5" x2="16" y2="20.5"/>
                    <line x1="12" y1="16.5" x2="12" y2="20.5"/>
                  </svg>
                </span>
                <div class="kv-setting-meta">
                  <h3 class="kv-setting-name">Giao diện &amp; Hiển thị</h3>
                  <p id="kvDisplayGroupSummary" class="kv-setting-desc">Chế độ giao diện và mức hiệu ứng hiển thị</p>
                </div>
              </div>
              <span class="kv-setting-chev" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </span>
            </button>

            <div id="kvDisplayGroupWrap" class="kv-setting-group-wrap">
              <div class="kv-setting-group-inner">
                <div id="kvDisplayGroupBody" class="kv-setting-group-body">
                  <div class="kv-setting-subrow">
                    <div class="kv-setting-submeta">
                      <h4 class="kv-setting-subname">Chế độ giao diện</h4>
                      <p id="kvSettingModeDesc" class="kv-setting-desc">Đang dùng: Không gian 3D (Hố đen)</p>
                    </div>
                    <div class="kv-setting-right">
                      <button type="button" id="kvOpenModeSwitchBtn" class="kv-row-btn">Đổi giao diện</button>
                    </div>
                  </div>

                  <div class="kv-setting-subrow" data-lite-motion-row>
                    <div class="kv-setting-submeta">
                      <h4 class="kv-setting-subname">Chuyển động &amp; Hiệu ứng</h4>
                      <p id="kvMotionSettingDesc" class="kv-setting-desc">Mức hiệu ứng áp dụng cho Giao diện Nhẹ</p>
                    </div>
                    <div class="kv-setting-right">
                      <div class="kv-seg" role="radiogroup" aria-label="Chuyển động và hiệu ứng Giao diện Nhẹ" style="--seg-idx: 0">
                        <span class="kv-seg-thumb" aria-hidden="true"></span>
                        ${motionButtonsMarkup}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Các thanh ngang mẫu (để sẵn cho bước mở rộng sau) -->
          <div class="kv-setting-row is-sample-row" data-sample-setting="Thông báo học tập">
            <div class="kv-setting-left">
              <span class="kv-setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </span>
              <div class="kv-setting-meta">
                <h3 class="kv-setting-name">Thông báo học tập</h3>
                <p class="kv-setting-desc">Nhắc lịch ôn tập và cập nhật tài liệu mới theo khối</p>
              </div>
            </div>
            <div class="kv-setting-right">
              <span class="kv-row-pill">Mẫu</span>
            </div>
          </div>

          <div class="kv-setting-row is-sample-row" data-sample-setting="Tài khoản & bảo mật">
            <div class="kv-setting-left">
              <span class="kv-setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </span>
              <div class="kv-setting-meta">
                <h3 class="kv-setting-name">Tài khoản &amp; Bảo mật</h3>
                <p class="kv-setting-desc">Liên kết email, đổi mật khẩu và quản lý phiên đăng nhập</p>
              </div>
            </div>
            <div class="kv-setting-right">
              <span class="kv-row-pill">Mẫu</span>
            </div>
          </div>

          <div class="kv-setting-row is-sample-row" data-sample-setting="Đồng bộ dữ liệu đám mây">
            <div class="kv-setting-left">
              <span class="kv-setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
                </svg>
              </span>
              <div class="kv-setting-meta">
                <h3 class="kv-setting-name">Đồng bộ dữ liệu đám mây</h3>
                <p class="kv-setting-desc">Tự động lưu giao diện ưa thích và bài học trên mọi thiết bị</p>
              </div>
            </div>
            <div class="kv-setting-right">
              <span class="kv-row-pill">Mẫu</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close-modal]')) {
        closePortalModal(overlay);
      }
    });

    const initWrap = overlay.querySelector('#kvDisplayGroupWrap');
    if (initWrap && 'inert' in initWrap) initWrap.inert = true;

    overlay.querySelector('#kvDisplayGroupBtn')?.addEventListener('click', () => {
      const isOpen = overlay.querySelector('#kvDisplayGroup')?.classList.contains('is-open');
      setDisplayGroupExpanded(overlay, !isOpen);
    });

    overlay.querySelector('#kvOpenModeSwitchBtn')?.addEventListener('click', () => {
      closePortalModal(overlay, { immediate: true });
      openModeSwitchModal();
    });

    const segGroup = overlay.querySelector('.kv-seg');
    if (segGroup) {
      segGroup.querySelectorAll('.kv-seg-btn[data-motion-choice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          setLiteMotionPref(btn.dataset.motionChoice);
        });
      });

      segGroup.addEventListener('keydown', (e) => {
        const dir =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? -1
              : 0;
        if (!dir) return;
        e.preventDefault();
        const cur = getLiteMotionPref();
        const idx = LITE_MOTION_CHOICES.findIndex((c) => c.key === cur);
        const next = LITE_MOTION_CHOICES[(idx + dir + LITE_MOTION_CHOICES.length) % LITE_MOTION_CHOICES.length];
        setLiteMotionPref(next.key);
        segGroup.querySelector(`.kv-seg-btn[data-motion-choice="${next.key}"]`)?.focus();
      });
    }

    overlay.querySelectorAll('[data-sample-setting]').forEach((row) => {
      row.addEventListener('click', () => {
        toast(`Mục "${row.dataset.sampleSetting}" là khung mẫu chờ kết nối.`);
      });
    });

    return overlay;
  }

  function openSettingsModal(options = {}) {
    closeAccountMenu(true);
    ['#accountOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s), { immediate: true }));
    const overlay = ensureSettingsOverlay();
    if (options && options.expandDisplay) {
      setDisplayGroupExpanded(overlay, true);
    }
    syncSettingsDisplayUI();

    overlay.hidden = false;
    syncModalBodyState();
    animateModalOpen(overlay);
  }

  // ---------- Modal 2B: Bảng đổi giao diện (chỉ mở khi bấm nút Đổi trong Cài đặt) ----------
  function ensureModeSwitchOverlay() {
    let overlay = $('#modeSwitchOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modeSwitchOverlay';
    overlay.className = 'kv-portal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kvSwitchTitle');

    overlay.innerHTML = `
      <div class="kv-modal-panel kv-mode-panel">
        <div class="kv-sheet-top">
          <div>
            <div class="kv-eyebrow">Đổi giao diện hiển thị</div>
            <h2 id="kvSwitchTitle" class="kv-modal-title">Chọn giao diện bạn muốn dùng</h2>
          </div>
          <button type="button" class="kv-close-btn" data-close-switch aria-label="Đóng bảng đổi giao diện">
            ${closeIconMarkup()}
          </button>
        </div>

        <div class="kv-mode-grid">
          <button type="button" class="kv-mode-card" data-switch-mode="3d">
            <div class="kv-mode-top">
              <div class="kv-mode-heading">
                <span class="kv-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4.2"/>
                    <ellipse cx="12" cy="12" rx="10.2" ry="4" transform="rotate(-18 12 12)"/>
                  </svg>
                </span>
                <h3 class="kv-mode-name">Không gian 3D (Hố đen)</h3>
              </div>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-active-badge="3d" hidden>Đang dùng</span>
                <span class="kv-mode-tag" data-idle-tag="3d">Đồ họa 3D</span>
              </span>
            </div>
            <p class="kv-mode-desc">Không gian vũ trụ 3D sống động với hiệu ứng chiều sâu.</p>
            <span class="kv-mode-cta" data-switch-cta="3d">Chuyển sang 3D →</span>
          </button>

          <button type="button" class="kv-mode-card" data-switch-mode="lite">
            <div class="kv-mode-top">
              <div class="kv-mode-heading">
                <span class="kv-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3.5" y="4.5" width="7.2" height="15" rx="2"/>
                    <rect x="13.3" y="4.5" width="7.2" height="6.4" rx="2"/>
                    <rect x="13.3" y="13.1" width="7.2" height="6.4" rx="2"/>
                  </svg>
                </span>
                <h3 class="kv-mode-name">Giao diện Nhẹ (2D)</h3>
              </div>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-active-badge="lite" hidden>Đang dùng</span>
                <span class="kv-mode-tag" data-idle-tag="lite">Tối ưu tốc độ</span>
              </span>
            </div>
            <p class="kv-mode-desc">Bố cục thẻ 2D gọn nhẹ, phản hồi nhanh và tiết kiệm pin.</p>
            <span class="kv-mode-cta" data-switch-cta="lite">Chuyển sang Nhẹ →</span>
          </button>
        </div>

        <div class="kv-mode-foot">
          <button type="button" id="kvBackToSettingsBtn" class="kv-link-btn">← Quay lại Cài đặt</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('[data-close-switch]')) {
        closePortalModal(overlay);
      }
    });

    overlay.querySelector('#kvBackToSettingsBtn')?.addEventListener('click', () => {
      closePortalModal(overlay, { immediate: true });
      openSettingsModal({ expandDisplay: true });
    });

    overlay.querySelectorAll('[data-switch-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMode = btn.dataset.switchMode;
        if (!isValidMode(targetMode) || targetMode === state.mode) return;
        closePortalModal(overlay, { immediate: true });
        switchMode(targetMode);
      });
    });

    return overlay;
  }

  function openModeSwitchModal() {
    closeAccountMenu(true);
    ['#accountOverlay', '#settingsOverlay'].forEach((s) => closePortalModal($(s), { immediate: true }));
    const overlay = ensureModeSwitchOverlay();
    const current = state.mode;

    overlay.querySelectorAll('[data-switch-mode]').forEach((btn) => {
      const m = btn.dataset.switchMode;
      const isCurrent = m === current;
      btn.classList.toggle('is-active', isCurrent);
      btn.disabled = isCurrent;
      const badge = btn.querySelector(`[data-active-badge="${m}"]`);
      const idleTag = btn.querySelector(`[data-idle-tag="${m}"]`);
      const cta = btn.querySelector(`[data-switch-cta="${m}"]`);
      if (badge) badge.hidden = !isCurrent;
      if (idleTag) idleTag.hidden = isCurrent;
      if (cta) {
        cta.textContent = isCurrent
          ? 'Đang sử dụng'
          : m === '3d'
            ? 'Chuyển sang 3D →'
            : 'Chuyển sang Nhẹ →';
      }
    });

    overlay.hidden = false;
    syncModalBodyState();
    animateModalOpen(overlay);
  }

  // ---------- Tài khoản góc phải (#me / #avatar / #menu — bung ra và thu vào từ phía sau #avatar) ----------
  function closeAccountMenu(immediate = false) {
    const menu = $('#menu');
    const avatar = $('#avatar');
    if (!menu || menu.hidden) return;
    if (avatar) avatar.setAttribute('aria-expanded', 'false');

    const finish = () => {
      menu._closing = false;
      menu.hidden = true;
      menu.style.pointerEvents = '';
      if (window.gsap) window.gsap.set(menu, { clearProps: 'transform,opacity' });
    };

    const motion = effectivePortalMotion();
    if (immediate || !window.gsap || motion === 'fast') {
      if (window.gsap) window.gsap.killTweensOf(menu);
      finish();
      return;
    }

    if (menu._closing) return;
    menu._closing = true;
    menu.style.pointerEvents = 'none';
    window.gsap.killTweensOf(menu);

    if (motion === 'reduced') {
      window.gsap.to(menu, { opacity: 0, duration: 0.16, ease: 'power1.in', onComplete: finish });
      return;
    }

    window.gsap.to(menu, {
      opacity: 0,
      scale: 0.16,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: finish,
    });
  }

  function openAccountMenu() {
    const menu = $('#menu');
    const avatar = $('#avatar');
    if (!menu || !avatar) return;

    menu._closing = false;
    menu.style.pointerEvents = '';
    menu.hidden = false;
    avatar.setAttribute('aria-expanded', 'true');

    if (!window.gsap) return;
    window.gsap.killTweensOf(menu);
    const motion = effectivePortalMotion();
    if (motion === 'fast') {
      window.gsap.set(menu, { clearProps: 'transform,opacity' });
      return;
    }
    if (motion === 'reduced') {
      window.gsap.set(menu, { clearProps: 'transform' });
      window.gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: 'power2.out', clearProps: 'opacity' });
      return;
    }
    window.gsap.fromTo(
      menu,
      { opacity: 0, scale: 0.16 },
      { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.28)', clearProps: 'transform,opacity' }
    );
  }

  function syncTopAccount(user) {
    const me = $('#me');
    const letterEl = $('#avatarLetter');
    const whoEl = $('#who');
    if (letterEl) letterEl.textContent = (user.name || 'B')[0].toUpperCase();
    if (whoEl) whoEl.textContent = user.name || 'Bạn';
    if (me) me.hidden = false;
  }

  function bindAccountControls() {
    const avatar = $('#avatar');
    const menu = $('#menu');

    if (avatar && menu) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.hidden || menu._closing) {
          openAccountMenu();
        } else {
          closeAccountMenu();
        }
      });
    }

    $('#openAccount')?.addEventListener('click', openAccountModal);
    $('#openSettings')?.addEventListener('click', () => openSettingsModal());
    $('#logout')?.addEventListener('click', logout);

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#me')) closeAccountMenu();
    });

    // Capture phase để đóng modal/menu của portal trước khi Esc ảnh hưởng tới 3D hoặc Lite bên dưới
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Escape') return;
        if (closeAnyInfoModal()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        const m = $('#menu');
        if (m && !m.hidden) {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeAccountMenu();
        }
      },
      true
    );
  }

  // ---------- Bảng hỏi chọn giao diện sau mỗi lần đăng nhập (Mode Picker) ----------
  function ensureModeOverlay() {
    let overlay = $('#modeOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'modeOverlay';
    overlay.className = 'kv-portal-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'kvModeTitle');

    overlay.innerHTML = `
      <div class="kv-modal-panel kv-mode-panel">
        <div class="kv-modal-head">
          <div class="kv-eyebrow">Chọn giao diện hiển thị</div>
          <h2 id="kvModeTitle" class="kv-modal-title">Bạn muốn chạy KnowVerse bằng giao diện nào?</h2>
        </div>

        <div class="kv-mode-grid">
          <button type="button" class="kv-mode-card" data-mode="3d">
            <div class="kv-mode-top">
              <div class="kv-mode-heading">
                <span class="kv-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4.2"/>
                    <ellipse cx="12" cy="12" rx="10.2" ry="4" transform="rotate(-18 12 12)"/>
                    <circle cx="18.5" cy="7.2" r="1" fill="currentColor" stroke="none"/>
                  </svg>
                </span>
                <h3 class="kv-mode-name">Không gian 3D (Hố đen)</h3>
              </div>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag">Đồ họa 3D</span>
              </span>
            </div>
            <p class="kv-mode-desc">Không gian vũ trụ 3D sống động với hiệu ứng chiều sâu.</p>
            <span class="kv-mode-cta">Vào giao diện 3D →</span>
          </button>

          <button type="button" class="kv-mode-card" data-mode="lite">
            <div class="kv-mode-top">
              <div class="kv-mode-heading">
                <span class="kv-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3.5" y="4.5" width="7.2" height="15" rx="2"/>
                    <rect x="13.3" y="4.5" width="7.2" height="6.4" rx="2"/>
                    <rect x="13.3" y="13.1" width="7.2" height="6.4" rx="2"/>
                  </svg>
                </span>
                <h3 class="kv-mode-name">Giao diện Nhẹ (2D)</h3>
              </div>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag">Tối ưu tốc độ</span>
              </span>
            </div>
            <p class="kv-mode-desc">Bố cục thẻ 2D gọn nhẹ, phản hồi nhanh và tiết kiệm pin.</p>
            <span class="kv-mode-cta">Vào Giao diện Nhẹ →</span>
          </button>
        </div>

        <div class="kv-mode-foot">
          <span id="kvModeUserLabel">Tài khoản: Bạn</span>
          <button type="button" id="kvModeBackLogin" class="kv-link-btn">Đổi tài khoản khác</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('.kv-mode-card[data-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.isBooting) return;
        const chosen = btn.dataset.mode;
        if (!isValidMode(chosen)) return;
        saveMode(chosen);
        markModeChosen(state.user);
        overlay.querySelectorAll('.kv-mode-card[data-mode]').forEach((b) => {
          b.disabled = true;
        });
        await showVeil();
        document.body.classList.remove('choosing-mode');
        overlay.hidden = true;
        bootMode(chosen, state.user, { showToast: true, reason: 'saved', settleMs: 140 });
      });
    });

    $('#kvModeBackLogin')?.addEventListener('click', async () => {
      if (state.isBooting || state.isLoggingOut) return;
      state.isLoggingOut = true;
      try {
        await window.KV_AUTH?.signOut?.();
      } catch {
        // Bỏ qua lỗi mạng nếu chỉ đang đổi tài khoản cục bộ
      } finally {
        state.isLoggingOut = false;
      }
      state.user = null;
      overlay.hidden = true;
      showLoginStep();
    });

    return overlay;
  }

  function showModePicker(user) {
    const overlay = ensureModeOverlay();
    const label = $('#kvModeUserLabel');
    if (label) {
      label.textContent = user.email ? `Đang đăng nhập: ${user.name} (${user.email})` : `Đang đăng nhập: ${user.name}`;
    }

    overlay.querySelectorAll('.kv-mode-card[data-mode]').forEach((b) => {
      b.disabled = false;
    });

    document.body.classList.remove('locked');
    document.body.classList.add('choosing-mode');
    overlay.hidden = false;
    animateModalOpen(overlay);
    endBoot();
  }

  // ---------- Khởi chạy chế độ đã chọn (3D hoặc Nhẹ) ----------
  async function bootMode(mode, user, options = {}) {
    if (!isValidMode(mode) || !user || state.isBooting) return;
    state.isBooting = true;
    state.mode = mode;
    state.user = user;
    syncDocumentMotionAttr();

    const sceneEl = $('#scene');
    const uiEl = $('#ui');
    const hintEl = $('#hint');
    const liteShell = $('#liteShell');
    let deferLiteIntro = false;

    try {
      if (mode === 'lite') {
        if (sceneEl) sceneEl.hidden = true;
        if (uiEl) uiEl.hidden = true;
        if (hintEl) hintEl.hidden = true;
        if (liteShell) {
          liteShell.style.visibility = 'hidden';
          liteShell.hidden = false;
        }

        document.documentElement.classList.add('lite-root');
        document.body.classList.remove('locked', 'choosing-mode', 'booting-3d');
        document.body.classList.add('lite', 'is-locked');

        await loadModeAssets('lite');
        if (liteShell) liteShell.style.visibility = '';
        deferLiteIntro = getLiteMotionPref() !== 'fast' && isBootVeilOn();
        if (window.LiteApp && typeof window.LiteApp.login === 'function') {
          window.LiteApp.login(user.name, { deferIntro: deferLiteIntro });
        } else {
          document.body.classList.remove('is-locked');
        }
      } else {
        if (liteShell) liteShell.hidden = true;
        if (sceneEl) sceneEl.hidden = false;
        if (uiEl) uiEl.hidden = false;

        document.documentElement.classList.remove('lite-root');
        // Gỡ locked trước khi nạp blackhole.js để #scene có clientWidth/clientHeight thật (không bị 0x0)
        document.body.classList.remove('lite', 'is-locked', 'choosing-mode', 'locked');
        document.body.classList.add('booting-3d');

        await loadModeAssets('3d');
        document.body.classList.remove('booting-3d');
        if (window.KnowVerse3D && typeof window.KnowVerse3D.enter === 'function') {
          window.KnowVerse3D.enter(user.name);
        }
      }

      state.bootedMode = mode;
      syncTopAccount(user);
      syncSettingsDisplayUI();

      if (options.settleMs > 0) {
        await waitMs(options.settleMs);
      }

      afterPaint(() => {
        endBoot(() => {
          if (deferLiteIntro && window.LiteApp && typeof window.LiteApp.playHomeIntroBounce === 'function') {
            window.LiteApp.playHomeIntroBounce();
          }
          if (options.showToast) {
            const prefix = options.reason === 'switch' ? 'Đã chuyển sang' : 'Đã mở';
            toast(`${prefix}: ${MODE_LABELS[mode]}`);
          }
        });
      });
    } catch (err) {
      if (liteShell) liteShell.style.visibility = '';
      endBoot(() => {
        toast((err && err.message) || 'Không khởi tạo được giao diện.');
      });
    } finally {
      state.isBooting = false;
    }
  }

  // ---------- Đăng nhập / Chuyển chế độ / Đăng xuất ----------
  function handleAuthenticated(user) {
    state.user = user;
    const loginEl = $('#login');
    const proceed = () => {
      if (loginEl) {
        loginEl.hidden = true;
        loginEl.style.opacity = '';
        loginEl.style.transform = '';
      }
      const savedMode = getSavedMode();
      // Hỏi giao diện 1 lần sau mỗi lượt đăng nhập; tải lại / vào lại web khi còn phiên thì vào thẳng giao diện đã lưu (không hiện Toast)
      if (savedMode && (!ALWAYS_ASK_MODE_ON_LOGIN || isModeChosenFor(user))) {
        bootMode(savedMode, user, { showToast: false, reason: 'auto' });
      } else {
        showModePicker(user);
      }
    };

    if (loginEl && !loginEl.hidden && window.gsap && !isBootVeilOn()) {
      window.gsap.to(loginEl, {
        opacity: 0,
        scale: 0.96,
        duration: 0.26,
        ease: 'power2.in',
        onComplete: proceed,
      });
    } else {
      proceed();
    }
  }

  function showLoginStep() {
    delete document.documentElement.dataset.motion;
    document.body.classList.remove('choosing-mode', 'booting-3d', 'kv-modal-open');
    document.body.classList.add('locked');
    const modeOverlay = $('#modeOverlay');
    if (modeOverlay) modeOverlay.hidden = true;
    const loginEl = $('#login');
    if (loginEl) {
      loginEl.hidden = false;
      loginEl.style.opacity = '';
      loginEl.style.transform = '';
    }
    endBoot();
  }

  function loginFromAuth(authUser) {
    if (!authUser) return;
    // Nếu vừa reload để đổi giao diện 3D <-> Nhẹ thì chỉ cập nhật hồ sơ mới, không mở lại bảng hỏi giao diện
    if (state.bootedMode || state.isBooting || state.handoffActive) {
      state.user = authUser;
      syncTopAccount(authUser);
      return;
    }
    handleAuthenticated(authUser);
  }

  function onRemoteSignOut() {
    if (state.isLoggingOut) return;
    if (state.bootedMode || state.isBooting || document.body.classList.contains('choosing-mode')) {
      consumeSwitchHandoff();
      clearUrlHash();
      window.location.reload();
    }
  }

  async function switchMode(newMode) {
    if (!isValidMode(newMode) || !state.user || state.isBooting) return;
    saveMode(newMode);
    markModeChosen(state.user);
    if (state.bootedMode === newMode) {
      toast(`Đang sử dụng ${MODE_LABELS[newMode]}`);
      return;
    }
    closeAccountMenu(true);
    ['#accountOverlay', '#settingsOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s), { immediate: true }));
    await showVeil();
    writeSwitchHandoff({ user: state.user, mode: newMode });
    clearUrlHash();
    window.location.reload();
  }

  async function logout() {
    if (state.isLoggingOut) return;
    state.isLoggingOut = true;
    closeAccountMenu(true);
    ['#accountOverlay', '#settingsOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s), { immediate: true }));
    try {
      await window.KV_AUTH?.signOut?.();
    } catch {
      // Vẫn tiếp tục dọn phiên trình duyệt để người dùng thoát hẳn về màn đăng nhập
    }
    state.user = null;
    state.mode = null;
    clearUrlHash();
    window.location.reload();
  }

  // ---------- Khởi tạo Portal ----------
  function init() {
    bindAccountControls();
    bootSafetyTimer = setTimeout(endBoot, 6000); // chốt an toàn: mạng treo / lỗi nạp cũng không che mãi

    // Kiểm tra xem có đang chuyển thẳng giữa 3D <-> Nhẹ sau khi đổi trong Cài đặt không
    const handoff = consumeSwitchHandoff();
    if (handoff) {
      state.handoffActive = true;
      const loginEl = $('#login');
      if (loginEl) loginEl.hidden = true;
      bootMode(handoff.mode, handoff.user, { showToast: true, reason: 'switch', settleMs: 160 }).finally(() => {
        state.handoffActive = false;
      });
      return;
    }

    // Luôn bắt đầu sạch ở màn hình đăng nhập 1 màu
    clearUrlHash();
    document.body.className = 'locked';

    if (IS_FILE_PROTOCOL) {
      endBoot(); // chạy cục bộ không có bước khôi phục phiên
      // Dự phòng đăng nhập mẫu khi người dùng mở trực tiếp bằng file:/// (trình duyệt chặn ES module)
      const noteEl = $('#loginForm .note');
      if (noteEl) {
        noteEl.textContent = 'Đang chạy cục bộ (file://): dùng đăng nhập mẫu. Chạy "npm run dev" để dùng Supabase.';
      }
      $('#loginForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (state.isBooting) return;
        const email = ($('#email')?.value || '').trim();
        const name = (email.split('@')[0] || 'Bạn').trim() || 'Bạn';
        handleAuthenticated({ name, email, provider: 'email' });
      });

      $('#google')?.addEventListener('click', () => {
        if (state.isBooting) return;
        handleAuthenticated({ name: 'Bạn', email: '', provider: 'google' });
      });
    } else {
      // Khi chạy trên HTTP/Vite: chặn submit thuần đề phòng user bấm trước khi /src/main.js nạp xong
      $('#loginForm')?.addEventListener('submit', (e) => e.preventDefault());
    }
  }

  const portal = {
    state,
    get currentUser() {
      return state.user;
    },
    get currentMode() {
      return state.mode;
    },
    getSavedMode,
    saveMode,
    clearSavedMode,
    getLiteMotionPref,
    setLiteMotionPref,
    showLoginStep,
    loginFromAuth,
    onRemoteSignOut,
    clearModeChosen,
    showVeil,
    endBoot,
    openAccountModal,
    openSettingsModal,
    openModeSwitchModal,
    switchMode,
    logout,
    toast,
    onModeSaved: null,
  };

  window.KnowVersePortal = portal;
  init();
})();

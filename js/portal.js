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
  const SWITCH_HANDOFF_KEY = 'knowverse_switch_handoff';
  const WINDOW_NAME_PREFIX = 'KV_SWITCH_HANDOFF:';
  const ALWAYS_ASK_MODE_ON_LOGIN = true;
  const IS_FILE_PROTOCOL = window.location.protocol === 'file:';

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
    if (window.gsap) {
      window.gsap.killTweensOf(el);
      window.gsap.fromTo(
        el,
        { opacity: 0, y: 10, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'power3.out' }
      );
    }
    toastTimer = setTimeout(() => {
      if (window.gsap) {
        window.gsap.to(el, {
          opacity: 0,
          y: -6,
          duration: 0.22,
          ease: 'power2.in',
          onComplete: () => {
            el.hidden = true;
            el.style.opacity = '';
            el.style.transform = '';
          },
        });
      } else {
        el.hidden = true;
      }
    }, 2400);
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
      const portalCssLink = document.querySelector('link[href="styles/portal.css"]');
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
      document.body.appendChild(s);
    });
  }

  async function loadModeAssets(mode) {
    const cssList = MODE_CSS[mode] || [];
    const jsList = MODE_JS[mode] || [];
    await Promise.all(cssList.map(loadStylesheet));
    for (const src of jsList) {
      await loadScript(src);
    }
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
    const panel = overlay.querySelector('.kv-modal-panel');
    if (panel && window.gsap) {
      window.gsap.killTweensOf(panel);
      window.gsap.fromTo(
        panel,
        { opacity: 0, y: 14, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.28,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        }
      );
    }
  }

  function syncModalBodyState() {
    const hasOpen = ['#accountOverlay', '#settingsOverlay', '#modeSwitchOverlay'].some((sel) => {
      const el = $(sel);
      return el && !el.hidden;
    });
    document.body.classList.toggle('kv-modal-open', hasOpen);
    window.KnowVerse3D?.setOverlayOpen?.(hasOpen);
  }

  function closePortalModal(overlay) {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    syncModalBodyState();
  }

  function closeAnyInfoModal() {
    const sw = $('#modeSwitchOverlay');
    if (sw && !sw.hidden) {
      closePortalModal(sw);
      openSettingsModal();
      return true;
    }
    const acc = $('#accountOverlay');
    if (acc && !acc.hidden) {
      closePortalModal(acc);
      return true;
    }
    const set = $('#settingsOverlay');
    if (set && !set.hidden) {
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
            <p class="kv-modal-sub">Thông tin cơ bản và danh sách bài đăng do bạn tạo trên KnowVerse.</p>
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
              <span id="kvProfileModeChip" class="kv-chip is-accent">Giao diện</span>
            </div>
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
    closeAccountMenu();
    ['#settingsOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s)));
    const overlay = ensureAccountOverlay();
    const user = state.user || { name: 'Bạn', email: '', provider: 'email' };

    const avatarEl = $('#kvProfileAvatar');
    const nameEl = $('#kvProfileName');
    const emailEl = $('#kvProfileEmail');
    const providerEl = $('#kvProfileProvider');
    const roleEl = $('#kvProfileRole');
    const modeChipEl = $('#kvProfileModeChip');
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
    if (modeChipEl) modeChipEl.textContent = `Giao diện: ${MODE_LABELS[state.mode] || 'Chưa chọn'}`;
    if (postsCountEl) postsCountEl.textContent = '0';

    if (user.id && window.KV_AUTH && typeof window.KV_AUTH.fetchMyContributions === 'function') {
      window.KV_AUTH.fetchMyContributions(user.id)
        .then((rows) => {
          if (postsCountEl && Array.isArray(rows)) {
            postsCountEl.textContent = String(rows.length);
          }
        })
        .catch(() => {});
    }

    overlay.hidden = false;
    syncModalBodyState();
    animateModalOpen(overlay);
  }

  // ---------- Modal 2: Cài đặt (Các thanh ngang option; thanh đầu là Giao diện có nút Đổi) ----------
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
          <!-- Thanh ngang 1: Giao diện hiển thị (bấm Đổi mới hiện bảng chọn giao diện) -->
          <div class="kv-setting-row is-primary-row">
            <div class="kv-setting-left">
              <span class="kv-setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2.5" y="3.5" width="19" height="13" rx="2.2"/>
                  <line x1="8" y1="20.5" x2="16" y2="20.5"/>
                  <line x1="12" y1="16.5" x2="12" y2="20.5"/>
                </svg>
              </span>
              <div class="kv-setting-meta">
                <h3 class="kv-setting-name">Giao diện hiển thị</h3>
                <p id="kvSettingModeDesc" class="kv-setting-desc">Đang dùng: Không gian 3D (Hố đen)</p>
              </div>
            </div>
            <div class="kv-setting-right">
              <button type="button" id="kvOpenModeSwitchBtn" class="kv-row-btn">Đổi giao diện</button>
            </div>
          </div>

          <!-- Các thanh ngang mẫu (để sẵn cho bước mở rộng sau) -->
          <div class="kv-setting-row is-sample-row" data-sample-setting="Chuyển động & hiệu ứng">
            <div class="kv-setting-left">
              <span class="kv-setting-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/>
                </svg>
              </span>
              <div class="kv-setting-meta">
                <h3 class="kv-setting-name">Chuyển động &amp; Hiệu ứng</h3>
                <p class="kv-setting-desc">Tùy chỉnh độ mượt chuyển cảnh và mật độ hiệu ứng hạt</p>
              </div>
            </div>
            <div class="kv-setting-right">
              <span class="kv-row-pill">Mẫu</span>
            </div>
          </div>

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

    overlay.querySelector('#kvOpenModeSwitchBtn')?.addEventListener('click', () => {
      closePortalModal(overlay);
      openModeSwitchModal();
    });

    overlay.querySelectorAll('[data-sample-setting]').forEach((row) => {
      row.addEventListener('click', () => {
        toast(`Mục "${row.dataset.sampleSetting}" là khung mẫu chờ kết nối.`);
      });
    });

    return overlay;
  }

  function openSettingsModal() {
    closeAccountMenu();
    ['#accountOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s)));
    const overlay = ensureSettingsOverlay();
    const descEl = $('#kvSettingModeDesc');
    if (descEl) {
      descEl.textContent = `Đang dùng: ${MODE_LABELS[state.mode] || 'Chưa chọn'}`;
    }

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
      <div class="kv-modal-panel is-narrow">
        <div class="kv-sheet-top">
          <div>
            <div class="kv-eyebrow">Đổi giao diện hiển thị</div>
            <h2 id="kvSwitchTitle" class="kv-modal-title">Chọn giao diện bạn muốn dùng</h2>
            <p class="kv-modal-sub">Hệ thống sẽ chuyển ngay sang giao diện mới mà không cần đăng nhập lại.</p>
          </div>
          <button type="button" class="kv-close-btn" data-close-switch aria-label="Đóng bảng đổi giao diện">
            ${closeIconMarkup()}
          </button>
        </div>

        <div class="kv-mode-grid">
          <button type="button" class="kv-mode-card" data-switch-mode="3d">
            <div class="kv-mode-top">
              <span class="kv-mode-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4.2"/>
                  <ellipse cx="12" cy="12" rx="10.2" ry="4" transform="rotate(-18 12 12)"/>
                </svg>
              </span>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-active-badge="3d" hidden>Đang dùng</span>
              </span>
            </div>
            <h3 class="kv-mode-name">Không gian 3D (Hố đen)</h3>
            <p class="kv-mode-desc">Cảnh vũ trụ WebGL2 với hố đen trung tâm, dải Ngân Hà và chuyển cảnh chiều sâu.</p>
            <span class="kv-mode-cta" data-switch-cta="3d">Chuyển sang 3D →</span>
          </button>

          <button type="button" class="kv-mode-card" data-switch-mode="lite">
            <div class="kv-mode-top">
              <span class="kv-mode-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3.5" y="4.5" width="7.2" height="15" rx="2"/>
                  <rect x="13.3" y="4.5" width="7.2" height="6.4" rx="2"/>
                  <rect x="13.3" y="13.1" width="7.2" height="6.4" rx="2"/>
                </svg>
              </span>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-active-badge="lite" hidden>Đang dùng</span>
              </span>
            </div>
            <h3 class="kv-mode-name">Giao diện Nhẹ (2D)</h3>
            <p class="kv-mode-desc">Bố cục thẻ phẳng sắc nét, nhẹ máy, mở tức thì và tiết kiệm pin.</p>
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
      closePortalModal(overlay);
      openSettingsModal();
    });

    overlay.querySelectorAll('[data-switch-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMode = btn.dataset.switchMode;
        if (!isValidMode(targetMode) || targetMode === state.mode) return;
        closePortalModal(overlay);
        switchMode(targetMode);
      });
    });

    return overlay;
  }

  function openModeSwitchModal() {
    closeAccountMenu();
    ['#accountOverlay', '#settingsOverlay'].forEach((s) => closePortalModal($(s)));
    const overlay = ensureModeSwitchOverlay();
    const current = state.mode;

    overlay.querySelectorAll('[data-switch-mode]').forEach((btn) => {
      const m = btn.dataset.switchMode;
      const isCurrent = m === current;
      btn.classList.toggle('is-active', isCurrent);
      btn.disabled = isCurrent;
      const badge = btn.querySelector(`[data-active-badge="${m}"]`);
      const cta = btn.querySelector(`[data-switch-cta="${m}"]`);
      if (badge) badge.hidden = !isCurrent;
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

  // ---------- Tài khoản góc phải (#me / #avatar / #menu) ----------
  function closeAccountMenu() {
    const menu = $('#menu');
    const avatar = $('#avatar');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (avatar) avatar.setAttribute('aria-expanded', 'false');
  }

  function syncTopAccount(user) {
    const me = $('#me');
    const letterEl = $('#avatarLetter');
    const whoEl = $('#who');
    const modeEl = $('#menuModeBadge');
    if (letterEl) letterEl.textContent = (user.name || 'B')[0].toUpperCase();
    if (whoEl) whoEl.textContent = user.email ? `${user.name} · ${user.email}` : user.name;
    if (modeEl) modeEl.textContent = `Đang dùng: ${MODE_LABELS[state.mode] || ''}`;
    if (me) me.hidden = false;
  }

  function bindAccountControls() {
    const avatar = $('#avatar');
    const menu = $('#menu');

    if (avatar && menu) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        avatar.setAttribute('aria-expanded', String(willOpen));
        if (willOpen && window.gsap) {
          window.gsap.killTweensOf(menu);
          window.gsap.fromTo(
            menu,
            { opacity: 0, y: -8, scale: 0.92 },
            { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform,opacity' }
          );
        }
      });
    }

    $('#openAccount')?.addEventListener('click', openAccountModal);
    $('#openSettings')?.addEventListener('click', openSettingsModal);
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
          <p class="kv-modal-sub">
            Lựa chọn gần nhất cũng được ghi nhớ trên thiết bị (sẵn sàng đồng bộ tự động ở bước sau), và luôn đổi được trong Cài đặt.
          </p>
        </div>

        <div class="kv-mode-grid">
          <button type="button" class="kv-mode-card" data-mode="3d">
            <div class="kv-mode-top">
              <span class="kv-mode-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="4.2"/>
                  <ellipse cx="12" cy="12" rx="10.2" ry="4" transform="rotate(-18 12 12)"/>
                  <circle cx="18.5" cy="7.2" r="1" fill="currentColor" stroke="none"/>
                </svg>
              </span>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-saved-badge="3d" hidden>Lựa chọn gần nhất</span>
                <span class="kv-mode-tag">Đồ họa 3D</span>
              </span>
            </div>
            <h3 class="kv-mode-name">Không gian 3D (Hố đen)</h3>
            <p class="kv-mode-desc">
              Bản đồ vũ trụ WebGL2 với hố đen trung tâm, nền dải Ngân Hà 3D và hiệu ứng chuyển cảnh chiều sâu.
            </p>
            <span class="kv-mode-cta">Vào giao diện 3D →</span>
          </button>

          <button type="button" class="kv-mode-card" data-mode="lite">
            <div class="kv-mode-top">
              <span class="kv-mode-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3.5" y="4.5" width="7.2" height="15" rx="2"/>
                  <rect x="13.3" y="4.5" width="7.2" height="6.4" rx="2"/>
                  <rect x="13.3" y="13.1" width="7.2" height="6.4" rx="2"/>
                </svg>
              </span>
              <span class="kv-mode-tags">
                <span class="kv-mode-tag is-highlight" data-saved-badge="lite" hidden>Lựa chọn gần nhất</span>
                <span class="kv-mode-tag">Tối ưu tốc độ</span>
              </span>
            </div>
            <h3 class="kv-mode-name">Giao diện Nhẹ (2D)</h3>
            <p class="kv-mode-desc">
              Thẻ môn học 2D sắc nét, mở tức thì không dùng GPU 3D, phản hồi mượt mà và tiết kiệm pin trên mọi thiết bị.
            </p>
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
      btn.addEventListener('click', () => {
        if (state.isBooting) return;
        const chosen = btn.dataset.mode;
        if (!isValidMode(chosen)) return;
        saveMode(chosen);
        markModeChosen(state.user);
        overlay.querySelectorAll('.kv-mode-card[data-mode]').forEach((b) => {
          b.disabled = true;
        });
        document.body.classList.remove('choosing-mode');
        overlay.hidden = true;
        bootMode(chosen, state.user, { showToast: true, reason: 'saved' });
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
    const savedMode = getSavedMode();
    const label = $('#kvModeUserLabel');
    if (label) {
      label.textContent = user.email ? `Đang đăng nhập: ${user.name} (${user.email})` : `Đang đăng nhập: ${user.name}`;
    }

    overlay.querySelectorAll('.kv-mode-card[data-mode]').forEach((b) => {
      const m = b.dataset.mode;
      const isLast = m === savedMode;
      b.disabled = false;
      b.classList.toggle('is-saved', isLast);
      const badge = b.querySelector(`[data-saved-badge="${m}"]`);
      if (badge) badge.hidden = !isLast;
    });

    document.body.classList.remove('locked');
    document.body.classList.add('choosing-mode');
    overlay.hidden = false;
    animateModalOpen(overlay);
  }

  // ---------- Khởi chạy chế độ đã chọn (3D hoặc Nhẹ) ----------
  async function bootMode(mode, user, options = {}) {
    if (!isValidMode(mode) || !user || state.isBooting) return;
    state.isBooting = true;
    state.mode = mode;
    state.user = user;

    const sceneEl = $('#scene');
    const uiEl = $('#ui');
    const hintEl = $('#hint');
    const liteShell = $('#liteShell');

    try {
      if (mode === 'lite') {
        if (sceneEl) sceneEl.hidden = true;
        if (uiEl) uiEl.hidden = true;
        if (hintEl) hintEl.hidden = true;
        if (liteShell) liteShell.hidden = false;

        document.documentElement.classList.add('lite-root');
        document.body.classList.remove('locked', 'choosing-mode', 'booting-3d');
        document.body.classList.add('lite', 'is-locked');

        await loadModeAssets('lite');
        if (window.LiteApp && typeof window.LiteApp.login === 'function') {
          window.LiteApp.login(user.name);
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

      if (options.showToast) {
        const prefix = options.reason === 'switch' ? 'Đã chuyển sang' : 'Đã mở';
        toast(`${prefix}: ${MODE_LABELS[mode]}`);
      }
    } catch (err) {
      toast((err && err.message) || 'Không khởi tạo được giao diện.');
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
      // Hỏi giao diện 1 lần sau mỗi lượt đăng nhập; tải lại / vào lại web khi còn phiên thì vào thẳng giao diện đã lưu
      if (savedMode && (!ALWAYS_ASK_MODE_ON_LOGIN || isModeChosenFor(user))) {
        bootMode(savedMode, user, { showToast: true, reason: 'auto' });
      } else {
        showModePicker(user);
      }
    };

    if (loginEl && !loginEl.hidden && window.gsap) {
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

  function switchMode(newMode) {
    if (!isValidMode(newMode) || !state.user) return;
    saveMode(newMode);
    markModeChosen(state.user);
    if (state.bootedMode === newMode) {
      toast(`Đang sử dụng ${MODE_LABELS[newMode]}`);
      return;
    }
    writeSwitchHandoff({ user: state.user, mode: newMode });
    clearUrlHash();
    window.location.reload();
  }

  async function logout() {
    if (state.isLoggingOut) return;
    state.isLoggingOut = true;
    closeAccountMenu();
    ['#accountOverlay', '#settingsOverlay', '#modeSwitchOverlay'].forEach((s) => closePortalModal($(s)));
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

    // Kiểm tra xem có đang chuyển thẳng giữa 3D <-> Nhẹ sau khi đổi trong Cài đặt không
    const handoff = consumeSwitchHandoff();
    if (handoff) {
      state.handoffActive = true;
      const loginEl = $('#login');
      if (loginEl) loginEl.hidden = true;
      bootMode(handoff.mode, handoff.user, { showToast: true, reason: 'switch' }).finally(() => {
        state.handoffActive = false;
      });
      return;
    }

    // Luôn bắt đầu sạch ở màn hình đăng nhập 1 màu
    clearUrlHash();
    document.body.className = 'locked';

    if (IS_FILE_PROTOCOL) {
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
    showLoginStep,
    loginFromAuth,
    onRemoteSignOut,
    clearModeChosen,
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

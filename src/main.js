// src/main.js — Xác thực & hồ sơ Supabase nối vào bộ điều phối KnowVersePortal (3D & Giao diện Nhẹ).
import { createClient } from '@supabase/supabase-js';

const $ = (s) => document.querySelector(s);
const form = $('#loginForm');

if (form) {
  form.noValidate = true;
  const portal = window.KnowVersePortal;
  const note = form.querySelector('.note');
  if (note) note.textContent = '';

  // Thông báo chung không gắn với từng ô input -> bật popup #toast như khi đổi giao diện
  const popup = (text, duration = 3400) => {
    if (!text) return;
    if (portal && typeof portal.toast === 'function') {
      portal.toast(text, { duration });
    } else if (note) {
      note.textContent = text;
    }
  };

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    portal?.endBoot?.();
    popup('Thiếu cấu hình Supabase: kiểm tra file .env.local (xem README.md).', 5000);
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  const sb = createClient(url, key, { auth: { flowType: 'pkce' } });

  // Tham số trên URL lúc nạp trang: liên kết trong email (token_hash), Google OAuth quay về (code) hoặc báo lỗi.
  const urlParams = new URLSearchParams(window.location.search);
  const linkTokenHash = urlParams.get('token_hash');
  const linkType = urlParams.get('type');
  const linkErrorCode = urlParams.get('error_code');
  const linkHasError = Boolean(linkErrorCode || urlParams.get('error_description') || urlParams.get('error'));
  const hasOAuthCode = urlParams.has('code');
  const cameFromLink = Boolean(linkTokenHash || hasOAuthCode);
  const OTP_TYPES = ['signup', 'email', 'recovery'];

  const cleanUrl = () => window.history.replaceState({}, '', window.location.pathname + window.location.hash);

  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  };

  const backAuthBtn = $('#kvBackAuth');
  const titleEl = $('#lTitle');
  const mutedEl = form.querySelector('.muted');
  const googleBtn = $('#google');
  const orRow = form.querySelector('.or');
  const emailEntryBtn = $('#kvEmailEntry');
  const emailEl = $('#email');
  const passEl = $('#pass');
  const submitBtn = form.querySelector('button[type="submit"]');

  const nameLabel = el(`
    <label hidden>
      <span class="kv-field-head"><span>Tên hiển thị</span><span class="kv-field-err" data-err="name"></span></span>
      <input id="kvName" type="text" maxlength="30" autocomplete="nickname" placeholder="2-30 ký tự">
    </label>
  `);
  const pass2Label = el(`
    <label hidden>
      <span class="kv-field-head"><span>Nhập lại mật khẩu</span><span class="kv-field-err" data-err="pass2"></span></span>
      <input id="kvPass2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu">
    </label>
  `);
  const forgotBtn = el('<button type="button" class="kv-link" id="kvForgot" hidden>Quên mật khẩu?</button>');
  const toggleBtn = el('<button type="button" class="btn ghost" id="kvToggle" style="margin-top:10px" hidden></button>');

  emailEl.closest('label').before(nameLabel);
  passEl.closest('label').after(pass2Label);
  pass2Label.after(forgotBtn);
  submitBtn.after(toggleBtn);

  const nameEl = $('#kvName');
  const pass2El = $('#kvPass2');

  const FIELDS = {
    name: { input: nameEl, err: form.querySelector('[data-err="name"]') },
    email: { input: emailEl, err: form.querySelector('[data-err="email"]') },
    pass: { input: passEl, err: form.querySelector('[data-err="pass"]') },
    pass2: { input: pass2El, err: form.querySelector('[data-err="pass2"]') },
  };

  function setFieldError(key, msg) {
    const f = FIELDS[key];
    if (!f) return;
    if (f.err) f.err.textContent = msg || '';
    if (f.input) f.input.classList.toggle('is-invalid', Boolean(msg));
  }

  function clearFieldErrors() {
    Object.keys(FIELDS).forEach((k) => setFieldError(k, ''));
  }

  function focusFirstInvalid(keys) {
    for (const k of keys) {
      const f = FIELDS[k];
      if (f?.input && f.input.classList.contains('is-invalid')) {
        f.input.focus();
        return;
      }
    }
  }

  Object.entries(FIELDS).forEach(([key, f]) => {
    f.input?.addEventListener('input', () => {
      setFieldError(key, '');
      if (key === 'pass' && pass2El.value && passEl.value === pass2El.value) {
        setFieldError('pass2', '');
      }
    });
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // [tiêu đề, nút chính, nút phụ bên dưới]
  const TEXT = {
    welcome: ['Đăng nhập', '', 'Chưa có tài khoản? Tạo tài khoản'],
    signin: ['Đăng nhập', 'Đăng nhập', ''],
    signup: ['Tạo tài khoản', 'Tạo tài khoản', 'Đã có tài khoản? Đăng nhập'],
    profile: ['Chọn tên hiển thị', 'Vào học', 'Đăng xuất'],
    forgot: ['Quên mật khẩu', 'Gửi liên kết', 'Quay lại đăng nhập'],
    verify: ['Kiểm tra hộp thư', 'Gửi lại thư xác nhận', 'Quay lại đăng nhập'],
    reset: ['Đặt mật khẩu mới', 'Lưu mật khẩu', 'Hủy'],
  };

  let mode = 'welcome';
  let pendingUser = null;
  let manualSignOut = false;
  let needPassword = false;
  let verifyEmail = '';
  let verifyJustSent = true;
  let resetting = false;

  // Đếm ngược 60s khi gửi thư xác nhận / đặt lại mật khẩu
  let cooldownTimer = null;
  let cooldownUntil = 0;
  const cooling = () => Date.now() < cooldownUntil;

  function stopCooldown() {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
    cooldownUntil = 0;
  }

  function startCooldown(seconds = 60) {
    stopCooldown();
    cooldownUntil = Date.now() + seconds * 1000;
    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (left <= 0) {
        stopCooldown();
        submitBtn.disabled = false;
        submitBtn.textContent = TEXT[mode][1];
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = `${TEXT[mode][1]} (${left}s)`;
    };
    tick();
    cooldownTimer = setInterval(tick, 500);
  }

  function syncVerifySubtitle() {
    if (!mutedEl) return;
    if (mode !== 'verify') {
      mutedEl.textContent = '';
      mutedEl.hidden = true;
      return;
    }
    mutedEl.hidden = false;
    mutedEl.textContent = verifyJustSent
      ? `Đã gửi thư xác nhận tới ${verifyEmail}. Bấm liên kết trong thư (kiểm tra cả mục Spam) để kích hoạt.`
      : `Tài khoản ${verifyEmail} chưa xác nhận email. Mở thư đã nhận hoặc bấm gửi lại bên dưới.`;
  }

  function setMode(nextMode, options = {}) {
    stopCooldown();
    clearFieldErrors();
    mode = nextMode;

    const [title, submitText, toggleText] = TEXT[nextMode];
    const isWelcome = nextMode === 'welcome';
    const askPw = nextMode === 'profile' && needPassword;
    const showEmail = nextMode === 'signin' || nextMode === 'signup' || nextMode === 'forgot';
    const showPass = nextMode === 'signin' || nextMode === 'signup' || nextMode === 'reset' || askPw;
    const newPw = nextMode === 'signup' || nextMode === 'reset' || askPw;
    const showName = nextMode === 'signup' || nextMode === 'profile';
    const showBack = nextMode === 'signin';

    if (isWelcome) {
      passEl.value = '';
      pass2El.value = '';
    } else if (!newPw) {
      pass2El.value = '';
    }

    if (titleEl) titleEl.textContent = askPw ? 'Hoàn tất tài khoản' : title;
    syncVerifySubtitle();

    if (backAuthBtn) backAuthBtn.hidden = !showBack;
    if (googleBtn) googleBtn.hidden = !isWelcome;
    if (orRow) orRow.hidden = !isWelcome;
    if (emailEntryBtn) emailEntryBtn.hidden = !isWelcome;

    emailEl.closest('label').hidden = !showEmail;
    passEl.closest('label').hidden = !showPass;
    nameLabel.hidden = !showName;
    pass2Label.hidden = !newPw;
    forgotBtn.hidden = nextMode !== 'signin';

    submitBtn.hidden = isWelcome;
    submitBtn.textContent = submitText;
    submitBtn.disabled = false;

    toggleBtn.hidden = !toggleText;
    toggleBtn.textContent = toggleText;
    toggleBtn.disabled = false;

    passEl.autocomplete = newPw ? 'new-password' : 'current-password';
    passEl.placeholder = newPw ? 'Tối thiểu 8 ký tự' : 'Nhập mật khẩu';

    if (options.animate && window.gsap && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      window.gsap.killTweensOf(form);
      window.gsap.fromTo(
        form,
        { opacity: 0.72, y: 6 },
        { opacity: 1, y: 0, duration: 0.18, ease: 'power2.out', clearProps: 'transform,opacity' }
      );
    }
  }
  setMode('welcome');

  const viError = (err) => {
    const msg = (typeof err === 'string' ? err : err?.message) || '';
    const code = (typeof err === 'object' && err?.code) || '';
    const wait = msg.match(/after (\d+) seconds?/i);

    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) return 'Sai email hoặc mật khẩu.';
    if (code === 'email_not_confirmed' || /not confirmed/i.test(msg)) {
      return 'Email chưa được xác nhận. Hãy mở thư xác nhận (kiểm tra cả mục Spam).';
    }
    if (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered/i.test(msg)) {
      return 'Email này đã có tài khoản.';
    }
    if (code === 'same_password' || /different from the old/i.test(msg)) return 'Mật khẩu mới phải khác mật khẩu cũ.';
    if (code === 'otp_expired' || /(email link|token).*(expired|invalid)/i.test(msg)) {
      return 'Liên kết đã hết hạn hoặc đã được dùng rồi.';
    }
    if (code === 'over_email_send_rate_limit' || wait) {
      return wait ? `Vừa gửi thư xong, đợi ${wait[1]} giây rồi thử lại.` : 'Gửi thư quá nhiều, đợi một lát rồi thử lại.';
    }
    if (code === 'email_address_not_authorized') return 'Máy chủ chưa được phép gửi thư tới email này.';
    if (code === 'weak_password' || /at least|weak/i.test(msg)) return 'Mật khẩu quá ngắn hoặc quá yếu.';
    if (/rate limit|too many/i.test(msg)) return 'Thử quá nhiều lần, đợi một lát rồi thử lại.';
    if (/fetch|network/i.test(msg)) return 'Không kết nối được máy chủ Supabase.';
    return `Có lỗi: ${msg}`;
  };

  // Phân loại lỗi từ Supabase: nếu gắn trực tiếp với 1 trường đang hiển thị thì hiện đỏ kế bên nhãn, ngược lại bật popup #toast
  function reportAuthError(err) {
    const msg = (typeof err === 'string' ? err : err?.message) || '';
    const code = (typeof err === 'object' && err?.code) || '';

    if (mode === 'signin' && (code === 'invalid_credentials' || /invalid login/i.test(msg))) {
      setFieldError('pass', 'Sai email hoặc mật khẩu');
      focusFirstInvalid(['pass']);
      return;
    }
    if ((mode === 'signup' || mode === 'signin' || mode === 'forgot') &&
        (code === 'user_already_exists' || code === 'email_exists' || /already (been )?registered/i.test(msg))) {
      setFieldError('email', 'Email đã có tài khoản');
      focusFirstInvalid(['email']);
      return;
    }
    if ((mode === 'signup' || mode === 'forgot') && code === 'email_address_not_authorized') {
      setFieldError('email', 'Không gửi được tới email này');
      focusFirstInvalid(['email']);
      return;
    }
    if ((mode === 'reset' || mode === 'profile') && (code === 'same_password' || /different from the old/i.test(msg))) {
      setFieldError('pass', 'Phải khác mật khẩu cũ');
      focusFirstInvalid(['pass']);
      return;
    }
    if ((mode === 'signup' || mode === 'reset' || mode === 'profile') &&
        (code === 'weak_password' || /at least|weak/i.test(msg))) {
      setFieldError('pass', 'Mật khẩu quá yếu');
      focusFirstInvalid(['pass']);
      return;
    }
    popup(viError(err), 3600);
  }

  function buildAuthUser(user, profile) {
    return {
      id: user.id,
      name: profile.display_name || 'Bạn',
      email: user.email || '',
      role: profile.role || 'user',
      createdAt: profile.created_at || null,
      avatarPath: profile.avatar_path || null,
      provider: user.app_metadata?.provider === 'google' ? 'google' : 'email',
    };
  }

  function enterPortal(user, profile) {
    const authUser = buildAuthUser(user, profile);
    passEl.value = '';
    pass2El.value = '';
    setMode('welcome');
    pendingUser = null;
    needPassword = false;
    resetting = false;

    if (portal && typeof portal.loginFromAuth === 'function') {
      portal.loginFromAuth(authUser);
    } else if (window.KV_APP && typeof window.KV_APP.login === 'function') {
      window.KV_APP.login(authUser.name);
    }
  }

  async function createProfile(user, rawName) {
    const cleanName = (rawName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 30) {
      portal?.showLoginStep?.();
      if (mode !== 'profile' && mode !== 'signup') setMode('profile');
      setFieldError('name', cleanName ? 'Từ 2–30 ký tự' : 'Chưa nhập tên');
      focusFirstInvalid(['name']);
      return;
    }
    const { data, error } = await sb
      .from('profiles')
      .insert({ id: user.id, display_name: cleanName })
      .select('display_name, role, created_at, avatar_path')
      .single();

    if (!error) {
      return enterPortal(user, data || { display_name: cleanName, role: 'user' });
    }
    if (error.code === '23505') {
      pendingUser = user;
      nameEl.value = cleanName;
      portal?.showLoginStep?.();
      setMode('profile');
      setFieldError('name', 'Tên này đã có người dùng');
      focusFirstInvalid(['name']);
      return;
    }
    portal?.showLoginStep?.();
    popup(viError(error), 3600);
  }

  async function afterAuth(user) {
    const { data, error } = await sb
      .from('profiles')
      .select('display_name, role, created_at, avatar_path')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      portal?.showLoginStep?.();
      return popup(viError(error), 3600);
    }
    if (data) {
      return enterPortal(user, data);
    }

    const meta = user.user_metadata || {};
    const signupName = (meta.display_name || '').trim();
    if (user.app_metadata?.provider !== 'google' && signupName.length >= 2 && signupName.length <= 30) {
      return createProfile(user, signupName);
    }

    pendingUser = user;
    needPassword = user.app_metadata?.provider === 'google';
    portal?.showLoginStep?.();
    nameEl.value = (meta.display_name || meta.full_name || meta.name || '').slice(0, 30);
    setMode('profile');
  }

  function enterResetMode() {
    resetting = true;
    pendingUser = null;
    needPassword = false;
    portal?.showLoginStep?.();
    setMode('reset');
  }

  function validateCurrentForm() {
    clearFieldErrors();
    const email = emailEl.value.trim();
    const pw = passEl.value;
    const pw2 = pass2El.value;
    const nm = nameEl.value.trim();
    const order = [];

    if (mode === 'signup' || mode === 'profile') {
      order.push('name');
      if (!nm) setFieldError('name', 'Chưa nhập tên');
      else if (nm.length < 2 || nm.length > 30) setFieldError('name', 'Từ 2–30 ký tự');
    }

    if (mode === 'signin' || mode === 'signup' || mode === 'forgot') {
      order.push('email');
      if (!email) setFieldError('email', 'Chưa nhập email');
      else if (!EMAIL_RE.test(email)) setFieldError('email', 'Email không hợp lệ');
    }

    if (mode === 'signin') {
      order.push('pass');
      if (!pw) setFieldError('pass', 'Chưa nhập mật khẩu');
    }

    if (mode === 'signup' || mode === 'reset' || (mode === 'profile' && needPassword)) {
      order.push('pass', 'pass2');
      if (!pw) setFieldError('pass', 'Chưa nhập mật khẩu');
      else if (pw.length < 8) setFieldError('pass', 'Tối thiểu 8 ký tự');

      if (!pw2) setFieldError('pass2', 'Chưa nhập lại');
      else if (pw && pw !== pw2) setFieldError('pass2', 'Mật khẩu chưa khớp');
    }

    const hasInvalid = order.some((k) => FIELDS[k]?.input?.classList.contains('is-invalid'));
    if (hasInvalid) {
      focusFirstInvalid(order);
      return false;
    }
    return true;
  }

  emailEntryBtn?.addEventListener('click', () => {
    setMode('signin', { animate: true });
    emailEl.focus();
  });

  backAuthBtn?.addEventListener('click', () => {
    setMode('welcome', { animate: true });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (mode === 'welcome' || submitBtn.disabled) return;
    if (!validateCurrentForm()) return;

    const email = emailEl.value.trim();
    const pw = passEl.value;
    const nm = nameEl.value.trim();

    submitBtn.disabled = true;
    try {
      if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        popup('Nếu email có tài khoản, đã gửi liên kết đặt lại mật khẩu (kiểm tra cả mục Spam).', 4000);
        return startCooldown(60);
      }
      if (mode === 'verify') {
        const { error } = await sb.auth.resend({
          type: 'signup',
          email: verifyEmail,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        verifyJustSent = true;
        syncVerifySubtitle();
        popup('Đã gửi lại thư xác nhận. Kiểm tra cả mục Spam.', 3400);
        return startCooldown(60);
      }
      if (mode === 'reset') {
        const { data, error } = await sb.auth.updateUser({ password: pw });
        if (error) throw error;
        resetting = false;
        portal?.clearModeChosen?.();
        popup('Đã đổi mật khẩu', 2600);
        return await afterAuth(data.user);
      }
      if (mode === 'profile') {
        if (!pendingUser) return setMode('welcome');
        if (needPassword) {
          const { error: pwErr } = await sb.auth.updateUser({ password: pw });
          if (pwErr && pwErr.code !== 'same_password' && !/different from the old/i.test(pwErr.message || '')) throw pwErr;
        }
        return await createProfile(pendingUser, nm);
      }
      if (mode === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) {
          if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message || '')) {
            verifyEmail = email;
            verifyJustSent = false;
            passEl.value = '';
            setMode('verify', { animate: true });
            return popup('Email chưa được xác nhận — mở thư hoặc bấm gửi lại.', 3600);
          }
          throw error;
        }
        portal?.clearModeChosen?.();
        return await afterAuth(data.user);
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password: pw,
        options: { data: { display_name: nm }, emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        setFieldError('email', 'Email đã có tài khoản');
        focusFirstInvalid(['email']);
        popup('Nếu bạn từng đăng nhập bằng Google, hãy dùng Google hoặc Quên mật khẩu.', 4000);
        return;
      }
      if (!data.session) {
        verifyEmail = email;
        verifyJustSent = true;
        passEl.value = '';
        pass2El.value = '';
        setMode('verify', { animate: true });
        startCooldown(60);
        return popup('Đã gửi thư xác nhận — kiểm tra cả mục Spam.', 3400);
      }
      portal?.clearModeChosen?.();
      await createProfile(data.user, nm);
    } catch (err) {
      reportAuthError(err);
    } finally {
      submitBtn.disabled = cooling();
    }
  });

  toggleBtn.addEventListener('click', async () => {
    if (toggleBtn.disabled) return;
    if (mode === 'profile' || mode === 'reset') {
      toggleBtn.disabled = true;
      manualSignOut = true;
      try {
        await sb.auth.signOut();
      } finally {
        manualSignOut = false;
        toggleBtn.disabled = false;
      }
      pendingUser = null;
      needPassword = false;
      resetting = false;
      return setMode('welcome', { animate: true });
    }
    if (mode === 'forgot' || mode === 'verify') {
      setMode('signin', { animate: true });
      if (!emailEl.value.trim()) emailEl.focus();
      return;
    }
    if (mode === 'welcome') {
      setMode('signup', { animate: true });
      nameEl.focus();
      return;
    }
    if (mode === 'signup') {
      setMode('welcome', { animate: true });
    }
  });

  forgotBtn.addEventListener('click', () => {
    setMode('forgot', { animate: true });
    if (!emailEl.value.trim()) emailEl.focus();
  });

  googleBtn?.addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) popup(viError(error), 3600);
  });

  // Cổng Auth cho portal.js (đăng xuất & tải danh sách đóng góp của bản thân khi cần)
  window.KV_AUTH = {
    async signOut() {
      portal?.clearModeChosen?.();
      manualSignOut = true;
      try {
        await sb.auth.signOut();
      } finally {
        manualSignOut = false;
      }
    },
    async fetchMyContributions(userId) {
      if (!userId) return [];
      const { data, error } = await sb
        .from('contributions')
        .select('id, kind, state, created_at, lessons(title, subjects(name, grade_id))')
        .eq('author_id', userId)
        .neq('state', 'deleted')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error || !Array.isArray(data)) return [];
      return data;
    },
    async fetchMyStarStats(userId) {
      if (!userId) return { avg: 0, count: 0 };
      try {
        const { data, error } = await sb.rpc('my_star_stats');
        if (!error && data && typeof data === 'object') {
          const row = Array.isArray(data) ? data[0] : data;
          if (row) {
            return {
              avg: Number(row.avg_stars ?? row.avg ?? 0) || 0,
              count: Number(row.rating_count ?? row.count ?? 0) || 0,
            };
          }
        }
      } catch {
        // Sẽ tự hoạt động khi tạo hàm RPC my_star_stats trên Supabase
      }
      return { avg: 0, count: 0 };
    },
  };

  sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') portal?.clearModeChosen?.();
    if (event === 'SIGNED_OUT' && !manualSignOut) {
      portal?.onRemoteSignOut?.();
    }
    if (event === 'PASSWORD_RECOVERY' && cameFromLink) enterResetMode();
  });

  // Khôi phục phiên đăng nhập hiện có, hoặc xử lý liên kết người dùng vừa bấm từ email / Google
  (async () => {
    if (linkTokenHash && OTP_TYPES.includes(linkType)) {
      cleanUrl();
      try {
        const { data, error } = await sb.auth.verifyOtp({ token_hash: linkTokenHash, type: linkType });
        if (error) throw error;
        if (!data?.user) throw new Error('Liên kết không hợp lệ');
        portal?.clearModeChosen?.();
        if (linkType === 'recovery') return enterResetMode();
        return await afterAuth(data.user);
      } catch (err) {
        const isRecovery = linkType === 'recovery';
        setMode(isRecovery ? 'forgot' : 'signin');
        portal?.showLoginStep?.();
        const hint = isRecovery ? 'Nhập email để nhận liên kết mới.' : 'Đăng nhập để nhận lại thư xác nhận.';
        return popup(`${viError(err)} ${hint}`, 4200);
      }
    }

    const startupError = linkHasError
      ? linkErrorCode === 'otp_expired'
        ? 'Liên kết đã hết hạn hoặc đã được dùng rồi. Hãy gửi yêu cầu mới.'
        : 'Đăng nhập không thành công, hãy thử lại.'
      : '';
    if (linkHasError) cleanUrl();

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (resetting) {
        if (hasOAuthCode) cleanUrl();
        return;
      }
      if (hasOAuthCode) {
        portal?.clearModeChosen?.();
        cleanUrl();
      }
      if (session?.user) {
        await afterAuth(session.user);
      } else {
        portal?.endBoot?.();
        if (startupError) {
          popup(startupError, 4000);
        } else if (hasOAuthCode) {
          popup('Không hoàn tất được đăng nhập. Hãy mở liên kết trên cùng trình duyệt lúc bấm yêu cầu.', 4200);
        }
      }
    } catch (err) {
      portal?.endBoot?.();
      popup(viError(err), 3800);
    }
  })();
}

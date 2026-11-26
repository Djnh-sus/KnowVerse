// src/main.js — Xác thực & hồ sơ Supabase nối vào bộ điều phối KnowVersePortal (3D & Giao diện Nhẹ).
import { createClient } from '@supabase/supabase-js';

const $ = (s) => document.querySelector(s);
const form = $('#loginForm');

if (form) {
  const portal = window.KnowVersePortal;
  const note = form.querySelector('.note');
  const say = (text, isError = false) => {
    if (!note) return;
    note.textContent = text;
    note.style.color = isError ? '#fca5a5' : '';
  };

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    say('Thiếu cấu hình Supabase: kiểm tra file .env.local (xem README.md).', true);
    portal?.endBoot?.();
    throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  const sb = createClient(url, key, { auth: { flowType: 'pkce' } });

  // Gắn các ô bổ sung (Tên hiển thị, Nhập lại mật khẩu, Chuyển Đăng ký/Đăng nhập) vào #loginForm sẵn có
  const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  };

  const emailEl = $('#email');
  const passEl = $('#pass');
  const submitBtn = form.querySelector('button[type="submit"]');
  const googleBtn = $('#google');
  const orRow = form.querySelector('.or');

  const nameLabel = el(
    '<label>Tên hiển thị<input id="kvName" type="text" maxlength="30" autocomplete="nickname" placeholder="2-30 ký tự"></label>'
  );
  const pass2Label = el(
    '<label>Nhập lại mật khẩu<input id="kvPass2" type="password" autocomplete="new-password" placeholder="Nhập lại mật khẩu"></label>'
  );
  const toggleBtn = el('<button type="button" class="btn ghost" id="kvToggle" style="margin-top:10px"></button>');

  emailEl.closest('label').before(nameLabel);
  passEl.closest('label').after(pass2Label);
  submitBtn.after(toggleBtn);

  const nameEl = $('#kvName');
  const pass2El = $('#kvPass2');

  const TEXT = {
    signin: ['Đăng nhập', 'Đăng nhập để vào học', 'Đăng nhập', 'Chưa có tài khoản? Tạo tài khoản'],
    signup: ['Tạo tài khoản', 'Tạo tài khoản để vào học', 'Tạo tài khoản', 'Đã có tài khoản? Đăng nhập'],
    profile: ['Chọn tên hiển thị', 'Tên này sẽ hiện cho mọi người thấy', 'Vào học', 'Đăng xuất'],
  };

  let mode = 'signin';
  let pendingUser = null; // Người vừa đăng nhập Google lần đầu nhưng chưa có bản ghi trong profiles
  let manualSignOut = false;
  let needPassword = false; // Google lần đầu: bắt buộc đặt mật khẩu cùng lúc chọn tên

  function setMode(nextMode) {
    mode = nextMode;
    const [title, subtitle, submitText, toggleText] = TEXT[nextMode];
    const titleEl = $('#lTitle');
    const mutedEl = form.querySelector('.muted');
    if (titleEl) titleEl.textContent = title;
    if (mutedEl) mutedEl.textContent = subtitle;
    submitBtn.textContent = submitText;
    toggleBtn.textContent = toggleText;

    const showCreds = nextMode !== 'profile';
    const askPw = nextMode === 'profile' && needPassword; // ô mật khẩu cho Google lần đầu
    const newPw = nextMode === 'signup' || askPw;
    emailEl.closest('label').hidden = !showCreds;
    passEl.closest('label').hidden = !(showCreds || askPw);
    emailEl.required = showCreds;
    passEl.required = showCreds || askPw;
    nameLabel.hidden = nextMode === 'signin';
    nameEl.required = nextMode !== 'signin';
    pass2Label.hidden = !newPw;
    pass2El.required = newPw;
    if (googleBtn) googleBtn.hidden = !showCreds;
    if (orRow) orRow.hidden = !showCreds;
    passEl.autocomplete = newPw ? 'new-password' : 'current-password';
    if (askPw) {
      if (titleEl) titleEl.textContent = 'Hoàn tất tài khoản';
      if (mutedEl) mutedEl.textContent = 'Chọn tên hiển thị và đặt mật khẩu để lần sau đăng nhập được cả bằng email';
    }
    say('');
  }
  setMode('signin');

  const viError = (msg = '') =>
    /invalid login/i.test(msg)
      ? 'Sai email hoặc mật khẩu.'
      : /already (been )?registered/i.test(msg)
        ? 'Email này đã có tài khoản, hãy đăng nhập.'
        : /at least|weak|password/i.test(msg)
          ? 'Mật khẩu quá ngắn hoặc quá yếu.'
          : /rate limit|too many/i.test(msg)
            ? 'Thử quá nhiều lần, đợi một lát rồi thử lại.'
            : /fetch|network/i.test(msg)
              ? 'Không kết nối được máy chủ Supabase.'
              : `Có lỗi: ${msg}`;

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
    setMode('signin');
    pendingUser = null;
    needPassword = false;

    if (portal && typeof portal.loginFromAuth === 'function') {
      portal.loginFromAuth(authUser);
    } else if (window.KV_APP && typeof window.KV_APP.login === 'function') {
      window.KV_APP.login(authUser.name);
    }
  }

  async function createProfile(user, rawName) {
    const cleanName = (rawName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 30) {
      return say('Tên hiển thị dài 2-30 ký tự.', true);
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
      return say('Tên hiển thị này đã có người dùng, vui lòng chọn tên khác.', true);
    }
    say(viError(error.message), true);
  }

  async function afterAuth(user) {
    const { data, error } = await sb
      .from('profiles')
      .select('display_name, role, created_at, avatar_path')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      portal?.showLoginStep?.();
      return say(viError(error.message), true);
    }
    if (data) {
      return enterPortal(user, data);
    }

    // Đăng nhập Google lần đầu: hiện bước chọn tên hiển thị
    const meta = user.user_metadata || {};
    pendingUser = user;
    needPassword = user.app_metadata?.provider === 'google';
    portal?.showLoginStep?.();
    nameEl.value = (meta.display_name || meta.full_name || meta.name || '').slice(0, 30);
    setMode('profile');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailEl.value.trim();
    const pw = passEl.value;
    const nm = nameEl.value.trim();
    say('');

    if (mode === 'profile') {
      if (nm.length < 2 || nm.length > 30) return say('Tên hiển thị dài 2-30 ký tự.', true);
      if (needPassword) {
        if (pw.length < 8) return say('Mật khẩu tối thiểu 8 ký tự.', true);
        if (pw !== pass2El.value) return say('Hai mật khẩu chưa giống nhau.', true);
      }
    }

    if (mode === 'signup') {
      if (nm.length < 2 || nm.length > 30) return say('Tên hiển thị dài 2-30 ký tự.', true);
      if (pw.length < 8) return say('Mật khẩu tối thiểu 8 ký tự.', true);
      if (pw !== pass2El.value) return say('Hai mật khẩu chưa giống nhau.', true);
    }

    submitBtn.disabled = true;
    try {
      if (mode === 'profile') {
        if (!pendingUser) return setMode('signin');
        if (needPassword) {
          const { error: pwErr } = await sb.auth.updateUser({ password: pw });
          // Bấm lại sau khi trùng tên: mật khẩu đã đặt rồi thì bỏ qua lỗi "trùng mật khẩu cũ"
          if (pwErr && pwErr.code !== 'same_password' && !/different from the old/i.test(pwErr.message || '')) throw pwErr;
        }
        return await createProfile(pendingUser, nm);
      }
      if (mode === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        portal?.clearModeChosen?.(); // đăng nhập mới => hỏi lại giao diện
        return await afterAuth(data.user);
      }
      const { data, error } = await sb.auth.signUp({
        email,
        password: pw,
        options: { data: { display_name: nm } },
      });
      if (error) throw error;
      if (!data.session) {
        return say('Đã gửi email xác nhận, vui lòng mở hộp thư rồi đăng nhập.');
      }
      portal?.clearModeChosen?.();
      await createProfile(data.user, nm);
    } catch (err) {
      say(viError(err?.message), true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  toggleBtn.addEventListener('click', async () => {
    if (mode === 'profile') {
      manualSignOut = true;
      try {
        await sb.auth.signOut();
      } finally {
        manualSignOut = false;
      }
      pendingUser = null;
      needPassword = false;
      return setMode('signin');
    }
    setMode(mode === 'signin' ? 'signup' : 'signin');
  });

  googleBtn?.addEventListener('click', async () => {
    say('');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) say(viError(error.message), true);
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
  });

  // Khôi phục phiên đăng nhập hiện có (kể cả khi vừa quay về từ Google OAuth)
  (async () => {
    const hasOAuthCode = window.location.search.includes('code=');
    if (hasOAuthCode) {
      say('Đang hoàn tất đăng nhập Google...');
    }
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (hasOAuthCode) {
        portal?.clearModeChosen?.(); // vừa quay về từ Google = đăng nhập mới
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      }
      if (session?.user) {
        await afterAuth(session.user);
      } else {
        if (hasOAuthCode) say('');
        portal?.endBoot?.();
      }
    } catch (err) {
      say(viError(err?.message), true);
      portal?.endBoot?.();
    }
  })();
}

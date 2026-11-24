/**
 * js/ui/motion.js
 * Hệ thống chuyển động kết hợp GSAP + Lenis + Triết lý Apple Fluid Interfaces (WWDC 2018):
 * 1. Phản hồi tức thì ngay khi nhấn (pointerdown, không chờ click).
 * 2. Luôn có thể ngắt giữa chừng (interruptible, overwrite: 'auto', bắt đầu từ giá trị thực trên màn hình).
 * 3. Lò xo chuẩn Apple:
 *    - Mặc định: critically damped (damping 1.0, response 0.36s -> 'expo.out' / custom spring).
 *    - Có quán tính / bung thẻ từ tâm: under-damped nhẹ (damping 0.8, response 0.42s -> 'back.out(1.35)').
 */
(function (global) {
  'use strict';

  const hasGSAP = typeof global.gsap !== 'undefined';
  const hasLenis = typeof global.Lenis !== 'undefined';
  const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)');

  if (hasGSAP && typeof global.CustomEase !== 'undefined') {
    global.gsap.registerPlugin(global.CustomEase);
    // Đường cong lò xo chuẩn Apple (damping = 1.0, response = 0.35s)
    global.CustomEase.create('appleSpring', 'M0,0 C0.16,1 0.3,1 1,1');
    // Đường cong lò xo có độ nảy nhẹ khi bung từ ngôi sao/hành tinh (damping = 0.82)
    global.CustomEase.create('appleBounce', 'M0,0 C0.175,0.885 0.32,1.12 1,1');
  }

  // Đồng bộ vòng lặp Lenis với gsap.ticker nếu có
  const activeLenisInstances = new Set();
  if (hasGSAP) {
    global.gsap.ticker.lagSmoothing(500, 33);
    global.gsap.ticker.add((time) => {
      const ms = time * 1000;
      for (const lenis of activeLenisInstances) {
        lenis.raf(ms);
      }
    });
  }

  /**
   * Di chuyển / biến đổi phần tử theo nguyên lý Apple Spring (có thể ngắt bất cứ lúc nào).
   */
  function springTo(target, vars, options = {}) {
    if (!target) return null;
    const bounce = options.bounce ?? false;
    const duration = reducedMotion.matches ? 0.14 : (options.duration ?? (bounce ? 0.52 : 0.38));
    const ease = reducedMotion.matches
      ? 'power1.out'
      : (options.ease || (bounce ? 'appleBounce' : 'appleSpring'));

    if (hasGSAP) {
      return global.gsap.to(target, {
        ...vars,
        duration,
        ease,
        overwrite: 'auto',
      });
    }
    Object.assign(target.style || {}, vars);
    return null;
  }

  /**
   * Tạo phản hồi nhấn tức thì ngay ở pointerdown (Kill Latency - Apple Design Rule #1).
   */
  function bindPressFeedback(root) {
    if (!root) return;
    root.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button, .hub, .planet, .grade-opt, .sec-card-action, .lesson-item');
      if (!btn || btn.disabled) return;
      btn.classList.add('is-pressed');
      const clear = () => {
        btn.classList.remove('is-pressed');
        global.removeEventListener('pointerup', clear);
        global.removeEventListener('pointercancel', clear);
      };
      global.addEventListener('pointerup', clear, { once: true });
      global.addEventListener('pointercancel', clear, { once: true });
    }, { passive: true });
  }

  /**
   * Gắn cuộn mượt Lenis cho một khung cuộn con (ví dụ danh sách bài học trong bảng Lý thuyết).
   */
  function attachSmoothScroll(wrapperEl, contentEl) {
    if (!hasLenis || !wrapperEl || reducedMotion.matches) return null;
    try {
      const lenis = new global.Lenis({
        wrapper: wrapperEl,
        content: contentEl || wrapperEl.firstElementChild || wrapperEl,
        lerp: 0.14,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.1,
        autoRaf: !hasGSAP,
      });
      activeLenisInstances.add(lenis);
      return {
        instance: lenis,
        destroy() {
          activeLenisInstances.delete(lenis);
          lenis.destroy();
        },
      };
    } catch (_) {
      return null;
    }
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  global.UIMotion = {
    springTo,
    bindPressFeedback,
    attachSmoothScroll,
    clamp,
    lerp,
    get isReduced() { return reducedMotion.matches; },
  };
})(window);

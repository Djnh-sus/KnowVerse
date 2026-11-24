/**
 * js/ui/grade-core.js
 * Hiển thị số Khối (12) nằm ngay bên trong bóng đen của Hố đen, luôn hướng thẳng về phía người dùng.
 * Khi bấm vào tâm hố đen: 3 lựa chọn (10 Sắp mở · 11 Sắp mở · 12 Đang mở) bung ra quanh vành chân trời sự kiện
 * bằng hiệu ứng lò xo Apple (xuất phát từ đúng tâm hố đen và thu về lại tâm khi đóng).
 */
(function (global) {
  'use strict';

  function createGradeCore(layerEl, options = {}) {
    const {
      grades = global.StudyData.GRADES,
      initialGrade = 12,
      onChangeGrade,
      onLockedGrade,
    } = options;
    const { springTo, clamp } = global.UIMotion;

    let currentGrade = initialGrade;
    let isOpen = false;
    let lastRadius = 48;

    const root = document.createElement('div');
    root.id = 'gradeCore';
    root.className = 'pin';

    // Nút số khối nằm trong tâm hố đen
    const coreBtn = document.createElement('button');
    coreBtn.type = 'button';
    coreBtn.className = 'core-btn';
    coreBtn.setAttribute('aria-haspopup', 'true');
    coreBtn.setAttribute('aria-expanded', 'false');
    coreBtn.setAttribute('aria-label', `Khối ${currentGrade}. Bấm để chọn khối.`);

    const capEl = document.createElement('span');
    capEl.className = 'core-cap';
    capEl.textContent = 'KHỐI';

    const numEl = document.createElement('span');
    numEl.className = 'core-num';
    numEl.textContent = String(currentGrade);

    coreBtn.append(capEl, numEl);

    // Vòng lựa chọn 10 - 11 - 12 bung quanh chân trời sự kiện
    const picker = document.createElement('div');
    picker.className = 'grade-picker';
    picker.hidden = true;

    // Góc bố trí 3 khối quanh vành trên của hố đen (-145°, -90°, -35°)
    const anglesDeg = [-145, -90, -35];
    const optButtons = grades.map((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'grade-opt' + (item.grade === currentGrade ? ' is-active' : '') + (!item.active ? ' is-locked' : '');
      btn.dataset.grade = String(item.grade);
      btn.setAttribute('aria-label', `${item.label} (${item.status})`);

      const press = document.createElement('span');
      press.className = 'press';

      const b = document.createElement('b');
      b.textContent = String(item.grade);

      const small = document.createElement('small');
      small.textContent = item.status;

      press.append(b, small);
      btn.appendChild(press);
      picker.appendChild(btn);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.active) {
          // Hiệu ứng lắc đàn hồi khi bấm vào khối Sắp mở (10, 11)
          if (global.gsap) {
            global.gsap.fromTo(press, { x: -5 }, { x: 0, duration: 0.42, ease: 'elastic.out(1.4, 0.3)' });
          }
          onLockedGrade?.(item);
          return;
        }
        setGrade(item.grade);
        close();
      });

      return { btn, item, angleRad: (anglesDeg[idx] ?? (-140 + idx * 50)) * (Math.PI / 180) };
    });

    root.append(picker, coreBtn);
    layerEl.appendChild(root);

    function targetRingRadius() {
      const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      return Math.max(lastRadius * 1.62, 68 * uiScale);
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      root.classList.add('is-open');
      coreBtn.setAttribute('aria-expanded', 'true');
      picker.hidden = false;

      const R = targetRingRadius();
      optButtons.forEach(({ btn, angleRad }, i) => {
        const tx = Math.cos(angleRad) * R;
        const ty = Math.sin(angleRad) * R;
        if (global.gsap) {
          global.gsap.killTweensOf(btn);
          global.gsap.fromTo(
            btn,
            { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 0.25, opacity: 0 },
            {
              xPercent: -50,
              yPercent: -50,
              x: tx,
              y: ty,
              scale: 1,
              opacity: 1,
              duration: 0.48,
              delay: i * 0.035,
              ease: 'appleBounce',
              overwrite: 'auto',
            }
          );
        } else {
          btn.style.transform = `translate3d(calc(-50% + ${tx}px), calc(-50% + ${ty}px), 0)`;
          btn.style.opacity = '1';
        }
      });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      root.classList.remove('is-open');
      coreBtn.setAttribute('aria-expanded', 'false');

      optButtons.forEach(({ btn }, i) => {
        if (global.gsap) {
          global.gsap.to(btn, {
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: 0,
            scale: 0.25,
            opacity: 0,
            duration: 0.28,
             ease: 'appleSpring',
            overwrite: 'auto',
            onComplete: () => {
              if (!isOpen && i === optButtons.length - 1) picker.hidden = true;
            },
          });
        } else {
          picker.hidden = true;
        }
      });
    }

    function toggle() {
      if (isOpen) close();
      else open();
    }

    function setGrade(g) {
      currentGrade = g;
      numEl.textContent = String(g);
      coreBtn.setAttribute('aria-label', `Khối ${g}. Bấm để chọn khối.`);
      for (const { btn, item } of optButtons) {
        btn.classList.toggle('is-active', item.grade === g);
      }
      onChangeGrade?.(g);
    }

    coreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });

    document.addEventListener('pointerdown', (e) => {
      if (isOpen && !root.contains(e.target)) close();
    });

    function updateFrame(frame) {
      const { core, focusProgress = 0, region } = frame;
      const overviewProgress = clamp(1 - focusProgress, 0, 1);
      const show = overviewProgress > 0.02;
      layerEl.hidden = !show;
      layerEl.inert = !!region || overviewProgress < 0.85;
      if (!show) {
        if (isOpen) close();
        return;
      }

      layerEl.style.opacity = '1';
      lastRadius = Math.max(26, core.r);
      const diameter = clamp(core.r * 1.92, 46, 175);

      root.style.transform = `translate3d(${core.x.toFixed(1)}px, ${core.y.toFixed(1)}px, 0) scale(${overviewProgress.toFixed(3)})`;
      root.classList.toggle('is-small', diameter < 56);
      coreBtn.style.setProperty('--core-d', `${diameter.toFixed(1)}px`);

      // Nếu đang mở vòng chọn khối và cửa sổ co giãn, cập nhật bán kính các nút chọn khối
      if (isOpen && !global.gsap?.isTweening(optButtons[0].btn)) {
        const R = targetRingRadius();
        for (const { btn, angleRad } of optButtons) {
          const tx = Math.cos(angleRad) * R;
          const ty = Math.sin(angleRad) * R;
          if (global.gsap) {
            global.gsap.set(btn, { xPercent: -50, yPercent: -50, x: tx, y: ty });
          }
        }
      }
    }

    return {
      updateFrame,
      setGrade,
      close,
      get isOpen() { return isOpen; },
      get grade() { return currentGrade; },
    };
  }

  global.UIGradeCore = { createGradeCore };
})(window);

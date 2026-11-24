/**
 * js/ui/panel.js
 * Tạo và định vị 3 Bảng rút gọn (chỉ Tiêu đề + Mô tả) neo cạnh 3 Icon Hành tinh.
 * Hỗ trợ đồng bộ hover: khi di chuột vào bảng hoặc hành tinh tương ứng, cả hai cùng phóng to.
 */
(function (global) {
  'use strict';

  function createPanelsController(layerEl, options = {}) {
    const {
      sections = global.StudyData.SUBJECT_SECTIONS,
      subjects = global.StudyData.SUBJECTS,
      onOpenSection,
      onHoverSection,
    } = options;
    const { clamp } = global.UIMotion;
    const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)');

    const cards = new Map();
    let activeSubject = null;
    let isShown = false;
    let lastTime = null;

    function buildCardsForSubject(subjectName) {
      layerEl.replaceChildren();
      cards.clear();

      const info = subjects[subjectName];
      if (!info) return;

      sections.forEach((sec, idx) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'sec-card pin';
        card.dataset.key = sec.key;
        card.style.setProperty('--accent', info.accent);
        card.style.setProperty('--glow', info.glow);
        card.setAttribute('aria-label', `${sec.title}: ${sec.desc}. Bấm để mở danh sách chi tiết.`);

        const beak = document.createElement('span');
        beak.className = 'card-beak';
        beak.setAttribute('aria-hidden', 'true');

        const title = document.createElement('h2');
        title.className = 'sec-card-title';
        title.textContent = sec.title;

        const desc = document.createElement('p');
        desc.className = 'sec-card-desc';
        desc.textContent = sec.desc;

        card.append(beak, title, desc);

        const entry = {
          key: sec.key,
          sec,
          idx,
          card,
          beak,
          visible: true,
          hovered: false,
          linkedHovered: false,
          focused: false,
          hoverScale: 1,
          x: 0,
          y: 0,
          w: 220,
          h: 88,
          tipX: 0,
          tipY: 0,
          lastTransform: '',
          lastOpacity: '',
          lastOriginX: '',
          lastOriginY: '',
          lastBeakTransform: '',
        };

        card.addEventListener('pointerenter', () => {
          entry.hovered = true;
          onHoverSection?.(sec.key);
        });
        card.addEventListener('pointerleave', () => {
          entry.hovered = false;
          onHoverSection?.(null);
        });
        card.addEventListener('focus', () => {
          entry.focused = card.matches(':focus-visible');
        });
        card.addEventListener('blur', () => {
          entry.focused = false;
        });
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          onOpenSection?.(subjectName, sec.key, card);
        });

        layerEl.appendChild(card);
        cards.set(sec.key, entry);
      });
    }

    function showForSubject(subjectName) {
      if (activeSubject !== subjectName) {
        activeSubject = subjectName;
        buildCardsForSubject(subjectName);
      }
      isShown = true;
      lastTime = null;
      layerEl.hidden = false;
      for (const entry of cards.values()) {
        entry.visible = true;
        entry.card.hidden = false;
      }
    }

    function hideAll() {
      if (!isShown) return;
      isShown = false;
      activeSubject = null;
      lastTime = null;
      layerEl.hidden = true;
      layerEl.replaceChildren();
      cards.clear();
    }

    function setHoveredKey(key) {
      for (const [k, entry] of cards.entries()) {
        const active = k === key;
        entry.linkedHovered = active;
        entry.card.classList.toggle('is-linked-hover', active);
      }
    }

    function layoutCards(frame, planetPositions) {
      if (!isShown || !cards.size) return;
      const { width, height, focus, cardProgress = 1 } = frame;
      if (!focus) return;
      layerEl.hidden = cardProgress <= 0.01;
      layerEl.inert = cardProgress < 0.85;
      if (cardProgress <= 0.01) return;

      const now = performance.now();
      const dt = lastTime === null ? 0.016 : clamp((now - lastTime) / 1000, 0, 0.1);
      lastTime = now;
      const hoverEase = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 18);

      const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      const isNarrow = width < 700;
      const isShort = height < 540;

      const padX = Math.max(10, 16 * uiScale);
      const padTop = Math.max(54, 68 * uiScale);
      const padBottom = Math.max(56, 66 * uiScale);
      const gapFromPlanet = Math.max(18, (isNarrow ? 20 : 30) * uiScale);

      for (const [key, entry] of cards.entries()) {
        if (!entry.visible) continue;
        const p = planetPositions.get(key);
        if (!p) continue;

        // Dùng offsetWidth/offsetHeight (kích thước chưa qua transform scale) để tránh nhảy vị trí và lặp hover
        const w = entry.card.offsetWidth || 220 * uiScale;
        const h = entry.card.offsetHeight || 88 * uiScale;
        entry.w = w;
        entry.h = h;

        // Tính hướng và chống chạm viền theo vị trí đích ổn định (restX, restY) của hành tinh để khi môn ở sát mép dưới/trên đang bay lên không bị đẩy lệch bảng sang một bên
        const anchorPx = p.restX ?? p.x;
        const anchorPy = p.restY ?? p.y;
        const anchorFx = frame.restFocus ? frame.restFocus.x : focus.x;
        const anchorFy = frame.restFocus ? frame.restFocus.y : focus.y;

        const vx = anchorPx - anchorFx;
        const vy = anchorPy - anchorFy;

        let restCx;
        let restCy;

        if (key === 'ly-thuyet') {
          if (isNarrow) {
            restCx = clamp(anchorPx - w * 0.55, padX, width * 0.5 - w - 4);
            restCy = anchorPy - h - gapFromPlanet;
          } else {
            restCx = anchorPx - w - gapFromPlanet;
            restCy = anchorPy - h * 0.5;
          }
        } else if (key === 'tu-luyen') {
          if (isNarrow) {
            restCx = clamp(anchorPx - w * 0.45, width * 0.5 + 4, width - w - padX);
            restCy = anchorPy - h - gapFromPlanet;
          } else {
            restCx = anchorPx + gapFromPlanet;
            restCy = anchorPy - h * 0.5;
          }
        } else {
          // Hành tinh dưới có nhãn "Công thức" nằm bên dưới quả cầu (~43px * uiScale từ tâm), nên đặt bảng thấp xuống để mũi bảng không đè lên chữ "Công thức"
          restCx = anchorPx - w * 0.5;
          restCy = anchorPy + Math.max(46, (isShort ? 50 : 58) * uiScale);
        }

        restCx = clamp(restCx, padX, Math.max(padX, width - w - padX));
        restCy = clamp(restCy, padTop, Math.max(padTop, height - h - padBottom));

        const planetR = Math.max(24, 32 * uiScale);
        const bottomPlanetClear = Math.max(46, (isShort ? 50 : 58) * uiScale);
        const nearestX = clamp(anchorPx, restCx, restCx + w);
        const nearestY = clamp(anchorPy, restCy, restCy + h);
        const distToCard = Math.hypot(anchorPx - nearestX, anchorPy - nearestY);
        if (distToCard < planetR) {
          if (vy < 0 && restCy + h > anchorPy - planetR) {
            const tryTop = anchorPy - planetR - h - 6;
            if (tryTop >= padTop) restCy = tryTop;
            else if (vx < 0) restCx = clamp(anchorPx - planetR - w - 8, padX, width - w - padX);
            else restCx = clamp(anchorPx + planetR + 8, padX, width - w - padX);
          } else if (vy >= 0 && restCy < anchorPy + bottomPlanetClear) {
            const tryBot = anchorPy + bottomPlanetClear;
            if (tryBot + h <= height - padBottom) restCy = tryBot;
            else if (vx >= 0) restCx = clamp(anchorPx + planetR + 10, padX, width - w - padX);
            else restCx = clamp(anchorPx - planetR - w - 10, padX, width - w - padX);
          }
        }

        const cx = p.x + (restCx - anchorPx);
        const cy = p.y + (restCy - anchorPy);

        entry.x = cx;
        entry.y = cy;

        const centerCardX = cx + w * 0.5;
        const centerCardY = cy + h * 0.5;
        const dx = p.x - centerCardX;
        const dy = p.y - centerCardY;

        const normX = dx / Math.max(1, w * 0.5);
        const normY = dy / Math.max(1, h * 0.5);
        const beakSize = Math.max(9, 12 * uiScale);
        const halfBeak = beakSize * 0.5;
        const cornerPad = 16;

        let bx = 0;
        let by = 0;
        let rot = 45;
        let originX = '50%';
        let originY = '50%';

        if (Math.abs(normX) > Math.abs(normY)) {
          if (normX > 0) {
            bx = w - halfBeak;
            by = clamp(p.y - cy, cornerPad, Math.max(cornerPad, h - cornerPad)) - halfBeak;
            rot = 135;
            entry.tipX = cx + w + halfBeak * 0.7;
            entry.tipY = cy + by + halfBeak;
            originX = '100%';
            originY = `${((by / h) * 100).toFixed(0)}%`;
          } else {
            bx = -halfBeak;
            by = clamp(p.y - cy, cornerPad, Math.max(cornerPad, h - cornerPad)) - halfBeak;
            rot = -45;
            entry.tipX = cx - halfBeak * 0.7;
            entry.tipY = cy + by + halfBeak;
            originX = '0%';
            originY = `${((by / h) * 100).toFixed(0)}%`;
          }
        } else {
          if (normY > 0) {
            bx = clamp(p.x - cx, cornerPad, Math.max(cornerPad, w - cornerPad)) - halfBeak;
            by = h - halfBeak;
            rot = -135;
            entry.tipX = cx + bx + halfBeak;
            entry.tipY = cy + h + halfBeak * 0.7;
            originX = `${((bx / w) * 100).toFixed(0)}%`;
            originY = '100%';
          } else {
            bx = clamp(p.x - cx, cornerPad, Math.max(cornerPad, w - cornerPad)) - halfBeak;
            by = -halfBeak;
            rot = 45;
            entry.tipX = cx + bx + halfBeak;
            entry.tipY = cy - halfBeak * 0.7;
            originX = `${((bx / w) * 100).toFixed(0)}%`;
            originY = '0%';
          }
        }

        if (entry.lastOriginX !== originX) {
          entry.lastOriginX = originX;
          entry.card.style.setProperty('--origin-x', originX);
        }
        if (entry.lastOriginY !== originY) {
          entry.lastOriginY = originY;
          entry.card.style.setProperty('--origin-y', originY);
        }

        const nextBeakTransform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0) rotate(${rot}deg)`;
        if (entry.lastBeakTransform !== nextBeakTransform) {
          entry.lastBeakTransform = nextBeakTransform;
          entry.beak.style.transform = nextBeakTransform;
        }

        // Điều phối vị trí + scale mượt hoàn toàn trên GPU, không xung đột CSS transition
        const isHidden = entry.card.style.visibility === 'hidden';
        if (isHidden) {
          entry.hovered = false;
          entry.focused = false;
          entry.hoverScale = 1;
        } else {
          const isPressed = !layerEl.inert && entry.card.classList.contains('is-pressed');
          const isHovered = !layerEl.inert && (entry.hovered || entry.linkedHovered || entry.focused);
          const targetHoverScale = isPressed ? 0.96 : (isHovered ? 1.09 : 1);
          entry.hoverScale += (targetHoverScale - entry.hoverScale) * hoverEase;
          if (Math.abs(targetHoverScale - entry.hoverScale) < 0.0005) {
            entry.hoverScale = targetHoverScale;
          }
        }

        const totalScale = cardProgress * entry.hoverScale;
        const scalePart = Math.abs(totalScale - 1) > 0.0005 ? ` scale(${totalScale.toFixed(4)})` : '';
        const nextTransform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)${scalePart}`;
        if (entry.lastTransform !== nextTransform) {
          entry.lastTransform = nextTransform;
          entry.card.style.transform = nextTransform;
        }

        const nextOpacity = cardProgress < 0.998 ? clamp(cardProgress * 1.35, 0, 1).toFixed(2) : '';
        if (entry.lastOpacity !== nextOpacity) {
          entry.lastOpacity = nextOpacity;
          entry.card.style.opacity = nextOpacity;
        }
      }
    }

    function getCardTip(key) {
      const entry = cards.get(key);
      if (!entry || !entry.visible) return null;
      return { x: entry.tipX, y: entry.tipY };
    }

    function getCardElement(key) {
      return cards.get(key)?.card || null;
    }

    return {
      showForSubject,
      hideAll,
      setHoveredKey,
      layoutCards,
      getCardTip,
      getCardElement,
      get isShown() { return isShown; },
    };
  }

  global.UIPanels = { createPanelsController };
})(window);

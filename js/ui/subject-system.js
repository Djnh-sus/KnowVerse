/**
 * js/ui/subject-system.js
 * Hệ sao môn học khi zoom vào (và thu lại đồng thời khi phóng camera ra lúc bấm Quay về):
 * - Không đặt scale trên root để tọa độ màn hình của hành tinh, tia SVG và mũi chỉa của bảng luôn khớp 1:1 tuyệt đối.
 * - Khi bấm phóng to vào môn: 4 vòng quỹ đạo, 3 hành tinh, các công thức và 3 bảng bung ra có độ nảy lò xo.
 * - Khi bấm Quay về: vừa lùi camera vừa hút 3 bảng vào 3 hành tinh, đồng thời thu 3 hành tinh + công thức + 4 vòng
 *   vào đúng tâm vòng tròn của môn đó trên quỹ đạo hố đen.
 */
(function (global) {
  'use strict';

  function createSubjectSystem(systemLayerEl, panelsController, options = {}) {
    const {
      subjects = global.StudyData.SUBJECTS,
      sections = global.StudyData.SUBJECT_SECTIONS,
      getHubPosition,
      onOpenSection,
      onHoverSection,
    } = options;
    const { clamp } = global.UIMotion;

    const svgNS = 'http://www.w3.org/2000/svg';
    let currentSubject = null;
    let isRetracting = false;
    let retractFrom = null;
    let retractBaseProgress = 1;
    let root = null;
    let inner = null;
    let starEl = null;
    let haloEl = null;
    let coronaEl = null;
    let orbitRings = [];
    let svgEl = null;
    let planetNodes = [];
    let formulaOrbs = [];
    let hoveredKey = null;
    const planetScreenCoords = new Map();

    const spring = {
      star: 0,
      halo: 0,
      r0: 0,
      r1: 0,
      r2: 0,
      r3: 0,
      p0: 0,
      p1: 0,
      p2: 0,
      orbs: 0,
      cards: 0,
    };

    const RING_FACTORS = [
      { cls: 'r-inner', mul: 0.54 },
      { cls: 'r-main', mul: 1.00 },
      { cls: 'r-mid', mul: 1.28 },
      { cls: 'r-outer', mul: 1.54 },
    ];

    // 8 góc đặt trong 3 khe thoáng giữa 3 hành tinh (-145°, -35°, 90°) và 3 bảng để không bao giờ bị bảng hoặc hành tinh đè lên
    const FORMULA_SPOKE_ANGLES_DEG = [-90, -112, -68, -175, 140, -5, 18, 40];
    const FORMULA_REACHES = [1.28, 1.52, 1.52, 1.30, 1.52, 1.30, 1.54, 1.30];

    function triggerBounceIn(initialValues = null) {
      isRetracting = false;
      retractFrom = null;
      retractBaseProgress = 1;
      if (global.gsap) {
        global.gsap.killTweensOf(spring);
        // Bắt đầu star ở 0.84 (khớp kích thước thực tế trên màn hình của vòng tròn .hub),
        // còn halo bắt đầu ở 0.30 (nằm gọn trong lòng hình tròn .sys-label) rồi bung tỏa ra ngoài
        Object.assign(
          spring,
          initialValues || { star: 0.84, halo: 0.30, r0: 0, r1: 0, r2: 0, r3: 0, p0: 0, p1: 0, p2: 0, orbs: 0, cards: 0 }
        );

        global.gsap.to(spring, { star: 1, duration: 0.52, delay: 0, ease: 'appleSpring' });
        global.gsap.to(spring, { halo: 1, duration: 0.58, delay: 0.04, ease: 'back.out(1.65)' });
        global.gsap.to(spring, { r0: 1, duration: 0.60, delay: 0.12, ease: 'back.out(2.1)' });
        global.gsap.to(spring, { r1: 1, duration: 0.66, delay: 0.18, ease: 'back.out(1.85)' });
        global.gsap.to(spring, { r2: 1, duration: 0.72, delay: 0.24, ease: 'back.out(1.75)' });
        global.gsap.to(spring, { r3: 1, duration: 0.78, delay: 0.30, ease: 'back.out(1.65)' });

        global.gsap.to(spring, { p0: 1, duration: 0.70, delay: 0.20, ease: 'back.out(1.95)' });
        global.gsap.to(spring, { p1: 1, duration: 0.72, delay: 0.26, ease: 'back.out(1.95)' });
        global.gsap.to(spring, { p2: 1, duration: 0.74, delay: 0.32, ease: 'back.out(1.95)' });

        global.gsap.to(spring, { orbs: 1, duration: 0.76, delay: 0.28, ease: 'back.out(1.75)' });
        global.gsap.to(spring, { cards: 1, duration: 0.60, delay: 0.42, ease: 'back.out(1.8)' });
      } else {
        Object.assign(spring, { star: 1, halo: 1, r0: 1, r1: 1, r2: 1, r3: 1, p0: 1, p1: 1, p2: 1, orbs: 1, cards: 1 });
      }
    }

    function buildForSubject(subjectName) {
      systemLayerEl.replaceChildren();
      orbitRings = [];
      planetNodes = [];
      formulaOrbs = [];
      planetScreenCoords.clear();
      currentSubject = subjectName;
      hoveredKey = null;

      const info = subjects[subjectName];
      if (!info) return;

      svgEl = document.createElementNS(svgNS, 'svg');
      svgEl.setAttribute('class', 'sys-svg');
      systemLayerEl.appendChild(svgEl);

      root = document.createElement('div');
      root.className = 'sys pin';
      root.style.setProperty('--accent', info.accent);
      root.style.setProperty('--glow', info.glow);

      inner = document.createElement('div');
      inner.className = 'sys-inner';

      RING_FACTORS.forEach((rf) => {
        const rEl = document.createElement('div');
        rEl.className = `sys-orbit ${rf.cls}`;
        inner.appendChild(rEl);
        orbitRings.push({ el: rEl, mul: rf.mul });
      });

      starEl = document.createElement('div');
      starEl.className = 'sys-star';
      coronaEl = document.createElement('div');
      coronaEl.className = 'sys-corona';
      haloEl = document.createElement('div');
      haloEl.className = 'sys-halo';
      const flare = document.createElement('div');
      flare.className = 'flare';
      haloEl.appendChild(flare);
      starEl.append(coronaEl, haloEl);

      const starLabel = document.createElement('div');
      starLabel.className = 'sys-label';
      starLabel.textContent = subjectName;
      starEl.appendChild(starLabel);
      inner.appendChild(starEl);

      const sats = info.satellites || [];
      sats.forEach((sat, idx) => {
        const orb = document.createElement('span');
        orb.className = 'orb';
        orb.textContent = sat.text;
        orb.setAttribute('aria-hidden', 'true');
        inner.appendChild(orb);

        const fLine = document.createElementNS(svgNS, 'line');
        fLine.setAttribute('stroke', info.accent);
        fLine.setAttribute('stroke-width', '0.85');
        fLine.setAttribute('stroke-opacity', '0.26');
        svgEl.appendChild(fLine);

        const deg = FORMULA_SPOKE_ANGLES_DEG[idx % FORMULA_SPOKE_ANGLES_DEG.length];
        const reach = FORMULA_REACHES[idx % FORMULA_REACHES.length];
        formulaOrbs.push({
          el: orb,
          line: fLine,
          baseAngle: deg * (Math.PI / 180),
          reach,
          phase: idx * 1.43 + 0.5,
        });
      });

      sections.forEach((sec, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'planet';
        btn.dataset.key = sec.key;
        btn.setAttribute('aria-label', `${sec.title}: bấm để mở chi tiết`);

        const scaleWrap = document.createElement('span');
        scaleWrap.className = 'planet-scale';

        const body = document.createElement('span');
        body.className = 'planet-body';
        body.innerHTML = sec.iconSvg;

        const label = document.createElement('span');
        label.className = 'planet-label';
        label.textContent = sec.iconLabel;

        scaleWrap.append(body, label);
        btn.appendChild(scaleWrap);
        inner.appendChild(btn);

        const spokeLine = document.createElementNS(svgNS, 'line');
        spokeLine.setAttribute('stroke', info.accent);
        spokeLine.setAttribute('stroke-width', '1.6');
        spokeLine.setAttribute('stroke-dasharray', '4 4');
        spokeLine.setAttribute('stroke-opacity', '0.62');

        const glowLine = document.createElementNS(svgNS, 'line');
        glowLine.setAttribute('stroke', '#ffffff');
        glowLine.setAttribute('stroke-width', '1.2');
        glowLine.setAttribute('stroke-opacity', '0.38');

        const beakLine = document.createElementNS(svgNS, 'line');
        beakLine.setAttribute('stroke', info.accent);
        beakLine.setAttribute('stroke-width', '1.8');
        beakLine.setAttribute('stroke-opacity', '0.82');

        svgEl.append(spokeLine, glowLine, beakLine);

        btn.addEventListener('pointerenter', () => onHoverSection?.(sec.key));
        btn.addEventListener('pointerleave', () => onHoverSection?.(null));
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onOpenSection?.(subjectName, sec.key);
        });

        planetNodes.push({
          sec,
          idx,
          btn,
          spokeLine,
          glowLine,
          beakLine,
          baseAngleRad: sec.angleDeg * (Math.PI / 180),
        });
      });

      root.appendChild(inner);
      systemLayerEl.appendChild(root);

      triggerBounceIn();
    }

    function setHoveredKey(key) {
      hoveredKey = key;
      for (const p of planetNodes) {
        const active = p.sec.key === key;
        p.btn.classList.toggle('is-linked-hover', active);
        p.spokeLine.setAttribute('stroke-width', active ? '2.6' : '1.6');
        p.spokeLine.setAttribute('stroke-opacity', active ? '0.98' : '0.62');
        p.glowLine.setAttribute('stroke-width', active ? '2.0' : '1.2');
        p.glowLine.setAttribute('stroke-opacity', active ? '0.75' : '0.38');
        p.beakLine.setAttribute('stroke-width', active ? '2.8' : '1.8');
        p.beakLine.setAttribute('stroke-opacity', active ? '1' : '0.82');
      }
    }

    function hide() {
      currentSubject = null;
      hoveredKey = null;
      isRetracting = false;
      retractFrom = null;
      retractBaseProgress = 1;
      if (global.gsap) global.gsap.killTweensOf(spring);
      systemLayerEl.hidden = true;
      systemLayerEl.replaceChildren();
      panelsController.hideAll();
    }

    function updateFrame(frame) {
      const { width, height, time, region, focus, core } = frame;
      const rawProgress = focus ? clamp(focus.progress ?? 1, 0, 1) : 0;

      if (!focus || rawProgress <= 0.004) {
        if (currentSubject !== null) hide();
        return;
      }

      if (currentSubject !== focus.name) {
        buildForSubject(focus.name);
        panelsController.showForSubject(focus.name);
      } else if (!panelsController.isShown) {
        panelsController.showForSubject(focus.name);
      }

      // Đường cong thu rút mượt: nếu bấm Quay về / Esc giữa chừng lúc chưa bung hết thì thu từ đúng tỉ lệ hiện tại (retractFrom) về 0, không bung bật ra 100%
      const smoothCollapse = (t) => {
        const c = clamp(t, 0, 1);
        return c * c * (3 - 2 * c);
      };
      const getRetractValues = (prog) => {
        const u = clamp(prog / retractBaseProgress, 0, 1);
        const body = smoothCollapse((u - 0.14) / 0.86);
        const cards = smoothCollapse((u - 0.38) / 0.62);
        const f = retractFrom || { star: 1, halo: 1, r0: 1, r1: 1, r2: 1, r3: 1, p0: 1, p1: 1, p2: 1, orbs: 1, cards: 1 };
        return {
          star: 0.84 + (f.star - 0.84) * u,
          halo: 0.30 + (f.halo - 0.30) * body,
          r0: f.r0 * body,
          r1: f.r1 * body,
          r2: f.r2 * body,
          r3: f.r3 * body,
          p0: f.p0 * body,
          p1: f.p1 * body,
          p2: f.p2 * body,
          orbs: f.orbs * body,
          cards: f.cards * cards,
        };
      };

      // Khi bấm Quay về (region === null), chuyển sang trạng thái thu rút đồng bộ theo hành trình lùi camera
      if (!region && !isRetracting) {
        isRetracting = true;
        retractBaseProgress = Math.max(0.01, rawProgress);
        retractFrom = { ...spring };
        setHoveredKey(null);
        if (global.gsap) global.gsap.killTweensOf(spring);
      } else if (region && isRetracting) {
        triggerBounceIn(getRetractValues(rawProgress));
      }

      const ret = isRetracting ? getRetractValues(rawProgress) : null;
      const kStar = ret ? ret.star : spring.star;
      const kHalo = ret ? ret.halo : spring.halo;
      const kRings = ret
        ? [ret.r0, ret.r1, ret.r2, ret.r3]
        : [spring.r0, spring.r1, spring.r2, spring.r3];
      const kPlanets = ret
        ? [ret.p0, ret.p1, ret.p2]
        : [spring.p0, spring.p1, spring.p2];
      const kOrbs = ret ? ret.orbs : spring.orbs;
      const kCards = ret ? ret.cards : spring.cards;

      systemLayerEl.hidden = false;
      systemLayerEl.style.opacity = '1';
      systemLayerEl.inert = rawProgress < 0.85 || isRetracting;

      const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      const minDim = Math.min(width, height);
      const isNarrow = width < 700;
      const isShort = height < 540;

      // Đích ở màn hình toàn cảnh chính là tọa độ đã kẹp của vòng tròn môn đó trong HubsController;
      // đích khi phóng to cố định ở tâm màn hình để đường bay thẳng mượt, không bị bẻ gãy hay trôi vị trí giữa chừng.
      const hubPos = getHubPosition?.(focus.name) || { x: focus.x, y: focus.y };
      const zoomedX = width * 0.5;
      const zoomedY = isShort ? height * 0.41 : height * 0.44;
      const starX = hubPos.x + (zoomedX - hubPos.x) * rawProgress;
      const starY = hubPos.y + (zoomedY - hubPos.y) * rawProgress;

      // KHÔNG đặt scale lên root để tránh nhân đôi tỉ lệ (double-scale) làm lệch tia nối & bảng
      const nextRootTransform = `translate3d(${starX.toFixed(2)}px, ${starY.toFixed(2)}px, 0)`;
      if (root.dataset.lastTransform !== nextRootTransform) {
        root.dataset.lastTransform = nextRootTransform;
        root.style.transform = nextRootTransform;
      }
      if (starEl) {
        const nextStarTransform = `translate(-50%, -50%) scale(${Math.max(0.01, kStar).toFixed(3)})`;
        if (starEl.dataset.lastTransform !== nextStarTransform) {
          starEl.dataset.lastTransform = nextStarTransform;
          starEl.style.transform = nextStarTransform;
        }
      }
      if (haloEl) {
        const haloNorm = clamp((kHalo - 0.30) / 0.70, 0, 1);
        const haloScale = Math.max(0.01, kHalo);
        const haloOp = clamp((kHalo - 0.34) / 0.38, 0, 1);
        const nextHaloTransform = `scale(${haloScale.toFixed(3)})`;
        const nextHaloOp = haloOp.toFixed(2);
        if (haloEl.dataset.lastTransform !== nextHaloTransform) {
          haloEl.dataset.lastTransform = nextHaloTransform;
          haloEl.style.transform = nextHaloTransform;
        }
        if (haloEl.dataset.lastOp !== nextHaloOp) {
          haloEl.dataset.lastOp = nextHaloOp;
          haloEl.style.opacity = nextHaloOp;
        }
        if (coronaEl) {
          // Viền sáng nhẹ (.sys-corona) hiện ra tương ứng nghịch đảo (1 - haloNorm) ngay khi vòng hào quang lớn thu vào
          const softProgress = clamp(1 - haloNorm, 0, 1);
          const softScale = 0.68 + 0.39 * softProgress;
          const softOp = 0.84 * softProgress;
          const nextCoronaTransform = `translate(-50%, -50%) scale(${softScale.toFixed(3)})`;
          const nextCoronaOp = softOp.toFixed(2);
          if (coronaEl.dataset.lastTransform !== nextCoronaTransform) {
            coronaEl.dataset.lastTransform = nextCoronaTransform;
            coronaEl.style.transform = nextCoronaTransform;
          }
          if (coronaEl.dataset.lastOp !== nextCoronaOp) {
            coronaEl.dataset.lastOp = nextCoronaOp;
            coronaEl.style.opacity = nextCoronaOp;
          }
        }
      }

      const baseR = clamp(minDim * (isNarrow ? 0.20 : 0.185), 64 * uiScale, 150 * uiScale);
      const planetRx = baseR;
      const planetRy = baseR * (isShort ? 0.85 : 0.92);
      const starRimR = 30 * uiScale;

      // 1. 4 vòng quỹ đạo (khi thu vào chạm mép hình tròn tâm sẽ tắt mượt để không dồn sáng gây nháy)
      orbitRings.forEach((r, idx) => {
        const kr = Math.max(0, kRings[idx] ?? 1);
        const curRadius = planetRx * r.mul * kr;
        const rimFade = isRetracting ? clamp((curRadius - starRimR) / (26 * uiScale), 0, 1) : 1;
        const wStr = `${(curRadius * 2).toFixed(1)}px`;
        const hStr = `${(planetRy * r.mul * 2 * kr).toFixed(1)}px`;
        const opStr = (clamp(kr * (isRetracting ? 1.0 : 1.4), 0, 1) * rimFade).toFixed(2);
        if (r.lastW !== wStr) { r.lastW = wStr; r.el.style.width = wStr; }
        if (r.lastH !== hStr) { r.lastH = hStr; r.el.style.height = hStr; }
        if (r.lastOp !== opStr) { r.lastOp = opStr; r.el.style.opacity = opStr; }
      });

      // 2. Các công thức nhỏ (dao động nhẹ quanh vị trí khe thoáng, không xoay xuyên qua gầm bảng hay hành tinh)
      for (const orb of formulaOrbs) {
        const ko = Math.max(0, kOrbs);
        const wobbleA = Math.sin(time * 0.48 + orb.phase) * 0.035;
        const wobbleR = 1 + Math.cos(time * 0.42 + orb.phase) * 0.035;
        const a = orb.baseAngle + wobbleA;
        const rx = planetRx * orb.reach * wobbleR * ko;
        const ry = planetRy * orb.reach * wobbleR * ko;
        const ox = Math.cos(a) * rx;
        const oy = Math.sin(a) * ry;

        const s = Math.max(0.01, clamp(ko, 0, 1.25));
        const orbOp = isRetracting
          ? clamp((ko - 0.16) / 0.72, 0, 1)
          : clamp(ko * 1.25, 0, 1);

        orb.el.style.transform = `translate3d(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px), 0) scale(${s.toFixed(3)})`;
        orb.el.style.opacity = orbOp.toFixed(2);

        orb.line.setAttribute('x1', starX.toFixed(1));
        orb.line.setAttribute('y1', starY.toFixed(1));
        orb.line.setAttribute('x2', (starX + ox).toFixed(1));
        orb.line.setAttribute('y2', (starY + oy).toFixed(1));
        orb.line.style.opacity = (isRetracting ? orbOp : clamp(ko, 0, 1)).toFixed(2);
      }

      // 3. 3 Icon Hành tinh mục
      for (const p of planetNodes) {
        const kp = Math.max(0, kPlanets[p.idx] ?? 1);
        let angle = p.baseAngleRad;
        if (isNarrow) {
          if (p.sec.key === 'ly-thuyet') angle = -132 * (Math.PI / 180);
          else if (p.sec.key === 'tu-luyen') angle = -48 * (Math.PI / 180);
          else angle = 90 * (Math.PI / 180);
        } else if (isShort) {
          if (p.sec.key === 'ly-thuyet') angle = -156 * (Math.PI / 180);
          else if (p.sec.key === 'tu-luyen') angle = -24 * (Math.PI / 180);
          else angle = 90 * (Math.PI / 180);
        }

        const lx = Math.cos(angle) * planetRx * kp;
        const ly = Math.sin(angle) * planetRy * kp;
        const pScale = Math.max(0.01, clamp(kp, 0, 1.25));

        const nextTransform = `translate3d(calc(-50% + ${lx.toFixed(2)}px), calc(-50% + ${ly.toFixed(2)}px), 0) scale(${pScale.toFixed(3)})`;
        if (p.lastTransform !== nextTransform) {
          p.lastTransform = nextTransform;
          p.btn.style.transform = nextTransform;
        }
        const planetOp = isRetracting
          ? clamp((kp - 0.18) / 0.68, 0, 1)
          : clamp(kp * 1.35, 0, 1);
        const nextOpacity = planetOp.toFixed(2);
        if (p.lastOpacity !== nextOpacity) {
          p.lastOpacity = nextOpacity;
          p.btn.style.opacity = nextOpacity;
        }

        const screenX = starX + lx;
        const screenY = starY + ly;
        const restX = zoomedX + Math.cos(angle) * planetRx;
        const restY = zoomedY + Math.sin(angle) * planetRy;
        planetScreenCoords.set(p.sec.key, { x: screenX, y: screenY, restX, restY, lx, ly });
      }

      // 4. 3 Bảng mô tả rút gọn
      panelsController.layoutCards(
        {
          ...frame,
          cardProgress: Math.max(0, kCards),
          focus: { ...focus, x: starX, y: starY },
          restFocus: { x: zoomedX, y: zoomedY },
        },
        planetScreenCoords
      );

      // 5. Tia nối từ Ngôi sao -> Hành tinh -> Mũi bảng (khớp 1:1 trên cùng hệ tọa độ màn hình)
      for (const p of planetNodes) {
        const coords = planetScreenCoords.get(p.sec.key);
        if (!coords) continue;
        const kp = clamp(kPlanets[p.idx] ?? 1, 0, 1);
        const lineOp = (isRetracting ? clamp((kp - 0.18) / 0.68, 0, 1) : kp).toFixed(2);

        p.spokeLine.setAttribute('x1', starX.toFixed(1));
        p.spokeLine.setAttribute('y1', starY.toFixed(1));
        p.spokeLine.setAttribute('x2', coords.x.toFixed(1));
        p.spokeLine.setAttribute('y2', coords.y.toFixed(1));
        p.spokeLine.style.opacity = lineOp;

        p.glowLine.setAttribute('x1', starX.toFixed(1));
        p.glowLine.setAttribute('y1', starY.toFixed(1));
        p.glowLine.setAttribute('x2', coords.x.toFixed(1));
        p.glowLine.setAttribute('y2', coords.y.toFixed(1));
        p.glowLine.style.opacity = lineOp;

        const tip = kCards > 0.04 ? panelsController.getCardTip(p.sec.key) : null;
        if (tip) {
          p.beakLine.setAttribute('x1', coords.x.toFixed(1));
          p.beakLine.setAttribute('y1', coords.y.toFixed(1));
          p.beakLine.setAttribute('x2', tip.x.toFixed(1));
          p.beakLine.setAttribute('y2', tip.y.toFixed(1));
          p.beakLine.style.display = '';
          p.beakLine.style.opacity = clamp(kCards, 0, 1).toFixed(2);
        } else {
          p.beakLine.style.display = 'none';
        }
      }
    }

    return {
      updateFrame,
      setHoveredKey,
      hide,
    };
  }

  global.UISubjectSystem = { createSubjectSystem };
})(window);

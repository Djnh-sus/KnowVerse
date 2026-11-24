/**
 * js/ui/hubs.js
 * Các hình tròn Môn học ở màn hình toàn cảnh:
 * - Vệ tinh công thức tỏa tia tròn đều đặn từ tâm môn.
 * - Khi zoom vào môn hoặc bấm Quay về: các môn không được chọn co/bung mượt theo (1 - focusProgress),
 *   riêng môn đang thu về sẽ bàn giao mượt ở cuối hành trình để không bị đè 2 lớp lên nhau.
 */
(function (global) {
  'use strict';

  function createHubsController(layerEl, options = {}) {
    const { subjects = global.StudyData.SUBJECTS, onSelectSubject } = options;
    const { clamp } = global.UIMotion;
    const svgNS = 'http://www.w3.org/2000/svg';
    const entries = [];
    const hubCoords = new Map();
    let lastTime = null;

    function build() {
      layerEl.replaceChildren();
      entries.length = 0;
      hubCoords.clear();

      const names = Object.keys(subjects);
      names.forEach((name, idx) => {
        const info = subjects[name];
        const group = document.createElement('div');
        group.className = 'hub-group pin';
        group.style.setProperty('--accent', info.accent);
        group.style.setProperty('--glow', info.glow);

        const inner = document.createElement('div');
        inner.className = 'hub-inner';

        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'hub-spokes');
        svg.setAttribute('viewBox', '-160 -160 320 320');
        inner.appendChild(svg);

        const corona = document.createElement('div');
        corona.className = 'hub-corona';
        corona.setAttribute('aria-hidden', 'true');
        inner.appendChild(corona);

        const satData = info.satellites.slice(0, 4);
        const reachList = [0.95, 1.16, 1.02, 1.22];
        const satEls = satData.map((sat, sIdx) => {
          const el = document.createElement('span');
          const isPlanet = sat.kind === 'icon' || sIdx === 3;
          el.className = 'sat' + (isPlanet ? ' is-planet' : '');
          el.textContent = sat.text;
          el.setAttribute('aria-hidden', 'true');
          inner.appendChild(el);

          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', '0');
          line.setAttribute('y1', '0');
          svg.appendChild(line);

          const baseAngle = (sIdx / satData.length) * Math.PI * 2 + 0.55 + idx * 0.48;
          return {
            el,
            line,
            isPlanet,
            baseAngle,
            reach: reachList[sIdx % reachList.length],
            phase: sIdx * 1.7 + idx * 0.9,
          };
        });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hub';
        btn.setAttribute('aria-label', `Môn ${name}`);

        const titleEl = document.createElement('span');
        titleEl.className = 'hub-name';
        titleEl.textContent = name;
        btn.appendChild(titleEl);

        inner.appendChild(btn);
        group.appendChild(inner);
        layerEl.appendChild(group);

        const entry = {
          name,
          info,
          group,
          inner,
          corona,
          btn,
          satEls,
          hovered: false,
          hoverMix: 0,
          x: 0,
          y: 0,
        };

        btn.addEventListener('pointerenter', () => {
          entry.hovered = true;
          group.classList.add('is-hover');
        });
        btn.addEventListener('pointerleave', () => {
          entry.hovered = false;
          group.classList.remove('is-hover');
        });
        btn.addEventListener('click', () => {
          onSelectSubject?.(name);
        });

        entries.push(entry);
      });
    }

    function updateFrame(frame) {
      const { width, height, time, focusProgress = 0, core, homeCore, hubs, focus } = frame;
      const dt = lastTime === null ? 0.016 : clamp(time - lastTime, 0, 0.1);
      lastTime = time;
      const hoverEase = 1 - Math.exp(-dt * 11);

      const uiScale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
      const minDim = Math.min(width, height);
      const baseRadius = Math.max(46, 62 * uiScale);

      const hCore = homeCore || core;
      const padX = Math.max(82, 114 * uiScale);
      const padTop = Math.max(74, 92 * uiScale);
      const padBottom = Math.max(70, 88 * uiScale);

      // Vùng cách ly hình elip khớp với đĩa bồi tụ nằm ngang của hố đen + khoảng vươn của vệ tinh công thức
      const diskRx = hCore.r * 3.85;
      const diskRy = hCore.r * 2.25;
      const satPadX = baseRadius * 1.28 + 38 * uiScale;
      const satPadY = baseRadius * 1.28 + 20 * uiScale;
      const maxAllowRx = Math.max(120, width * 0.5 - padX);
      const maxAllowRy = Math.max(96, height * 0.5 - Math.max(padTop, padBottom));
      const exclRx = Math.min(maxAllowRx, Math.max(diskRx + satPadX, width * 0.27));
      const exclRy = Math.min(maxAllowRy, Math.max(diskRy + satPadY, minDim * 0.32));

      const pushOutsideBlackHole = (px, py) => {
        const dx = px - hCore.x;
        const dy = py - hCore.y;
        const norm = Math.hypot(dx / exclRx, dy / exclRy);
        if (norm >= 1) return { x: px, y: py };
        const a = norm > 0.001 ? Math.atan2(dy / exclRy, dx / exclRx) : 0;
        return {
          x: hCore.x + Math.cos(a) * exclRx,
          y: hCore.y + Math.sin(a) * exclRy,
        };
      };

      // Luôn tính tọa độ gốc (ở toàn cảnh) của tất cả các môn để SubjectSystem bàn giao khớp và các môn khác bay ra chuẩn hướng
      const placed = [];
      for (const entry of entries) {
        const projected = hubs.find((h) => h.name === entry.name);
        if (!projected) continue;

        let x = projected.homeX ?? projected.x;
        let y = projected.homeY ?? projected.y;

        ({ x, y } = pushOutsideBlackHole(x, y));
        x = clamp(x, padX, Math.max(padX, width - padX));
        y = clamp(y, padTop, Math.max(padTop, height - padBottom));

        placed.push({
          entry,
          x,
          y,
          depth: projected.homeDepth ?? projected.depth,
          perspective: projected.homePerspective ?? projected.perspective,
        });
      }

      const minHubDist = Math.max(96, 144 * uiScale);
      for (let iter = 0; iter < 2; iter++) {
        for (let i = 0; i < placed.length; i++) {
          for (let j = i + 1; j < placed.length; j++) {
            const a = placed[i];
            const b = placed[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.1 && d < minHubDist) {
              const push = (minHubDist - d) * 0.5;
              const ux = dx / d;
              const uy = dy / d;
              const pa = pushOutsideBlackHole(a.x - ux * push, a.y - uy * push);
              const pb = pushOutsideBlackHole(b.x + ux * push, b.y + uy * push);
              a.x = clamp(pa.x, padX * 0.82, Math.max(padX * 0.82, width - padX * 0.82));
              a.y = clamp(pa.y, padTop * 0.86, Math.max(padTop * 0.86, height - padBottom * 0.86));
              b.x = clamp(pb.x, padX * 0.82, Math.max(padX * 0.82, width - padX * 0.82));
              b.y = clamp(pb.y, padTop * 0.86, Math.max(padTop * 0.86, height - padBottom * 0.86));
            }
          }
        }
      }

      for (const item of placed) {
        item.entry.x = item.x;
        item.entry.y = item.y;
        hubCoords.set(item.entry.name, { x: item.x, y: item.y });
      }

      const overviewProgress = clamp(1 - focusProgress, 0, 1);
      const visible = overviewProgress > 0.004;
      layerEl.hidden = !visible;
      layerEl.inert = overviewProgress < 0.85;
      if (!visible) return;
      layerEl.style.opacity = '1';

      const activeFocusName = focus?.name || null;
      const focusHome = (activeFocusName && hubCoords.get(activeFocusName)) || { x: hCore.x, y: hCore.y };

      // Vùng cấm tuyệt đối cho các thẻ vệ tinh nhỏ (.sat) để không bao giờ đè lên hố đen & đĩa bồi tụ
      const safeBhRx = core.r * 3.92 + 36 * uiScale;
      const safeBhRy = core.r * 2.32 + 22 * uiScale;
      const exitMargin = Math.max(135, 170 * uiScale);

      for (const item of placed) {
        const { entry, x, y, depth, perspective } = item;
        const isFocusedHub = activeFocusName === entry.name;

        const targetMix = entry.hovered ? 1 : 0;
        entry.hoverMix += (targetMix - entry.hoverMix) * hoverEase;
        const baseScale = clamp(0.90 + (perspective - 1) * 0.32, 0.84, 1.12);

        let drawX = x;
        let drawY = y;
        let groupScale = baseScale;
        let groupOpacity = 1;
        let satProgress = 1;

        if (isFocusedHub) {
          // Môn đang được mở / thu về:
          // Khi SubjectSystem đã hiện (focusProgress > 0.004), ẩn ngay tâm tròn .hub để không bị đè/nhảy 2 hình tròn,
          // đồng thời cho hào quang .hub-corona và cụm vệ tinh thu/bung mượt từ trong lòng hình tròn theo quỹ đạo (starX, starY).
          const isShort = height < 540;
          const targetX = width * 0.5;
          const targetY = isShort ? height * 0.41 : height * 0.44;
          drawX = x + (targetX - x) * focusProgress;
          drawY = y + (targetY - y) * focusProgress;

          satProgress = clamp((overviewProgress - 0.78) / 0.22, 0, 1);
          const systemActive = focusProgress > 0.004;
          entry.btn.style.opacity = systemActive ? '0' : '';
          entry.btn.style.pointerEvents = systemActive ? 'none' : '';
          // Khi SubjectSystem đang hoạt động, .sys-corona đã hiển thị viền sáng nhẹ nên ẩn .hub-corona để không bị chồng 2 lớp sáng gây nháy
          entry.corona.style.opacity = systemActive ? '0' : '';

          if (satProgress <= 0.005) {
            entry.group.style.opacity = '0';
            entry.group.style.pointerEvents = 'none';
            continue;
          }
          groupOpacity = 1;
        } else {
          if (entry.btn.style.opacity !== '' || entry.corona.style.opacity !== '') {
            entry.btn.style.opacity = '';
            entry.btn.style.pointerEvents = '';
            entry.corona.style.opacity = '';
          }
          if (focusProgress > 0.0005) {
          // 4 môn còn lại: bay văng ra khỏi rìa màn hình theo tia phối cảnh từ môn đang focus rồi mới biến mất
          let vx = x - focusHome.x;
          let vy = y - focusHome.y;
          let vLen = Math.hypot(vx, vy);
          if (vLen < 1) {
            vx = x - hCore.x;
            vy = y - hCore.y;
            vLen = Math.max(1, Math.hypot(vx, vy));
          }
          const ux = vx / vLen;
          const uy = vy / vLen;

          const tx = ux > 0.001 ? (width + exitMargin - x) / ux : (ux < -0.001 ? (-exitMargin - x) / ux : 1e6);
          const ty = uy > 0.001 ? (height + exitMargin - y) / uy : (uy < -0.001 ? (-exitMargin - y) / uy : 1e6);
          const tExit = clamp(Math.min(tx, ty), 240, Math.hypot(width, height) * 1.25);

          drawX = x + ux * (tExit * 1.12) * focusProgress;
          drawY = y + uy * (tExit * 1.12) * focusProgress;
          groupScale = baseScale * (1 + 0.28 * focusProgress);
          groupOpacity = focusProgress < 0.86 ? 1 : clamp((1 - focusProgress) / 0.14, 0, 1);
          satProgress = 1;

          if (groupOpacity <= 0.005) {
            entry.group.style.opacity = '0';
            entry.group.style.pointerEvents = 'none';
            continue;
          }
          }
        }

        entry.group.style.opacity = groupOpacity.toFixed(3);
        entry.group.style.pointerEvents = focusProgress > 0.15 ? 'none' : '';
        entry.group.style.transform = `translate3d(${drawX.toFixed(2)}px, ${drawY.toFixed(2)}px, 0) scale(${groupScale.toFixed(3)})`;
        entry.group.style.zIndex = String(entry.hovered ? 400 : Math.round(depth * 100 + 100));

        const burst = (1 + 0.30 * entry.hoverMix) * satProgress;

        for (const sat of entry.satEls) {
          const wobbleA = Math.sin(time * 0.32 + sat.phase) * 0.08;
          const wobbleR = 1 + Math.cos(time * 0.45 + sat.phase) * 0.06;
          const theta = sat.baseAngle + time * 0.11 + wobbleA;
          const r = baseRadius * sat.reach * wobbleR * burst;
          let lx = Math.cos(theta) * r;
          let ly = Math.sin(theta) * r;

          // Chống đè lên hố đen: nếu vệ tinh xoay vào vùng hố đen/đĩa bồi tụ thì trượt mượt dọc theo rìa ngoài
          const satScreenX = drawX + lx * groupScale;
          const satScreenY = drawY + ly * groupScale;
          const sdx = satScreenX - core.x;
          const sdy = satScreenY - core.y;
          const sNorm = Math.hypot(sdx / safeBhRx, sdy / safeBhRy);
          if (sNorm < 1 && groupScale > 0.05) {
            const sa = sNorm > 0.001 ? Math.atan2(sdy / safeBhRy, sdx / safeBhRx) : -Math.PI * 0.5;
            const pushedX = core.x + Math.cos(sa) * safeBhRx;
            const pushedY = core.y + Math.sin(sa) * safeBhRy;
            lx = (pushedX - drawX) / groupScale;
            ly = (pushedY - drawY) / groupScale;
          }

          sat.line.setAttribute('x2', lx.toFixed(1));
          sat.line.setAttribute('y2', ly.toFixed(1));

          const sScale = (1 + 0.12 * entry.hoverMix) * satProgress;
          sat.el.style.transform = `translate3d(calc(-50% + ${lx.toFixed(1)}px), calc(-50% + ${ly.toFixed(1)}px), 0) scale(${sScale.toFixed(3)})`;
          sat.el.style.opacity = clamp((0.84 + 0.16 * entry.hoverMix) * satProgress, 0, 1).toFixed(2);
        }
      }
    }

    function getHubPosition(name) {
      return hubCoords.get(name) || null;
    }

    build();
    return {
      updateFrame,
      getHubPosition,
      rebuild: build,
    };
  }

  global.UIHubs = { createHubsController };
})(window);

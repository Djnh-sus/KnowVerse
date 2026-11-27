/**
 * js/ui/detail-modal.js
 * Bảng phóng to ở giữa màn hình kiểu #home-panel của dự án gốc:
 * - Không làm mờ khung bảng (opacity của bảng luôn = 1) cả khi mở ra lẫn khi thu lại.
 * - Khi bấm mở: chiếc bảng nhỏ biến đổi kích thước (left, top, width, height, padding, radius),
 *   chữ tiêu đề + mô tả đổi trực tiếp sang nội dung chi tiết và bung danh sách List ra.
 * - Khi bấm X thu lại: đổi chữ mô tả và cỡ chữ trực tiếp về dạng bảng nhỏ, thu gọn phần danh sách
 *   và co chính xác khung bảng (opacity = 1) về khớp 100% vị trí chiếc bảng nhỏ cạnh hành tinh.
 */
(function (global) {
  'use strict';

  function createDetailModal(overlayEl, options = {}) {
    const {
      subjects = global.StudyData.SUBJECTS,
      sections = global.StudyData.SUBJECT_SECTIONS,
      getSectionItems = global.StudyData.getSectionItems,
      getAnchorElement,
      onOpenChange,
      onItemSelect,
      onUploadClick,
    } = options;
    const { attachSmoothScroll } = global.UIMotion;

    let isOpen = false;
    let isClosing = false;
    let currentSubject = null;
    let currentSection = null;
    let activeAnchorEl = null;
    let lenisCtrl = null;
    let currentItems = [];

    function destroyLenis() {
      if (lenisCtrl) {
        lenisCtrl.destroy();
        lenisCtrl = null;
      }
    }

    function restoreAnchorCard() {
      if (!activeAnchorEl) return;
      activeAnchorEl.style.visibility = '';
      activeAnchorEl = null;
    }

    /**
     * Đọc thông số hình học & kiểu chữ trực tiếp từ chiếc bảng nhỏ (.sec-card)
     * để bảng lớn biến hình khớp từng pixel mà không cần làm mờ.
     */
    function readCompactSpec(anchorEl) {
      if (!anchorEl) return null;
      const rect = anchorEl.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return null;
      const cs = getComputedStyle(anchorEl);
      const titleEl = anchorEl.querySelector('.sec-card-title');
      const descEl = anchorEl.querySelector('.sec-card-desc');
      const titleCs = titleEl ? getComputedStyle(titleEl) : null;
      const descCs = descEl ? getComputedStyle(descEl) : null;

      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        padding: cs.padding,
        borderRadius: cs.borderRadius,
        titleFontSize: titleCs ? titleCs.fontSize : '16px',
        titleMarginBottom: titleCs ? titleCs.marginBottom : '5px',
        descFontSize: descCs ? descCs.fontSize : '12.5px',
      };
    }

    function renderRows(listEl, items, query) {
      const q = (query || '').trim().toLowerCase();
      const filtered = q
        ? items.filter((it) => it.title.toLowerCase().includes(q) || it.meta.toLowerCase().includes(q))
        : items;

      listEl.replaceChildren();
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'detail-empty';
        empty.textContent = items.length === 0
          ? 'Chưa có nội dung nào.'
          : 'Không tìm thấy nội dung phù hợp.';
        listEl.appendChild(empty);
        return;
      }

      filtered.forEach((item, n) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'detail-row';

        const left = document.createElement('span');
        left.className = 'detail-row-left';

        const idxBadge = document.createElement('span');
        idxBadge.className = 'detail-row-idx';
        idxBadge.textContent = String(item.index);

        const textWrap = document.createElement('span');
        textWrap.className = 'detail-row-text';

        const titleEl = document.createElement('span');
        titleEl.className = 'detail-row-title';
        titleEl.textContent = item.title;

        const metaEl = document.createElement('span');
        metaEl.className = 'detail-row-meta';
        metaEl.textContent = item.meta;

        textWrap.append(titleEl, metaEl);
        left.append(idxBadge, textWrap);

        const right = document.createElement('span');
        right.className = 'detail-row-right';

        if (item.tag) {
          const tag = document.createElement('span');
          tag.className = 'detail-row-tag';
          tag.textContent = item.tag;
          right.appendChild(tag);
        }

        const go = document.createElement('span');
        go.className = 'detail-row-go';
        go.textContent = item.action || 'Mở →';
        right.appendChild(go);

        row.append(left, right);

        row.addEventListener('click', () => {
          onItemSelect?.({
            subject: currentSubject,
            section: currentSection,
            item,
          });
        });

        listEl.appendChild(row);

        if (global.gsap) {
          global.gsap.fromTo(
            row,
            { y: 8, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.30, delay: Math.min(n, 8) * 0.025, ease: 'appleSpring', overwrite: 'auto' }
          );
        }
      });
    }

    function open(subjectName, sectionKey, triggerEl) {
      const info = subjects[subjectName];
      const sec = sections.find((s) => s.key === sectionKey);
      if (!info || !sec) return;

      destroyLenis();
      restoreAnchorCard();

      currentSubject = subjectName;
      currentSection = sectionKey;
      currentItems = getSectionItems(subjectName, sectionKey);
      isOpen = true;
      isClosing = false;

      const anchorCard = getAnchorElement?.(sectionKey) || triggerEl || null;
      activeAnchorEl = anchorCard;
      const compact = readCompactSpec(activeAnchorEl);

      overlayEl.replaceChildren();
      overlayEl.hidden = false;

      const panel = document.createElement('section');
      panel.className = 'detail-panel';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'detailTitle');
      panel.style.setProperty('--accent', info.accent);
      panel.style.setProperty('--glow', info.glow);

      const top = document.createElement('div');
      top.className = 'detail-top';

      const heading = document.createElement('div');
      heading.className = 'detail-heading';

      const pills = document.createElement('div');
      pills.className = 'detail-pills';

      const subPill = document.createElement('span');
      subPill.className = 'detail-subject-pill';
      subPill.textContent = subjectName;

      const countPill = document.createElement('span');
      countPill.className = 'detail-count-pill';
      countPill.textContent = `${currentItems.length} mục`;

      pills.append(subPill, countPill);

      const h2 = document.createElement('h2');
      h2.id = 'detailTitle';
      h2.textContent = sec.title;

      const desc = document.createElement('p');
      desc.className = 'detail-desc';
      desc.textContent = sec.modalDesc || sec.desc;

      heading.append(pills, h2, desc);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.id = 'detailCloseBtn';
      closeBtn.className = 'detail-close';
      closeBtn.setAttribute('aria-label', 'Đóng bảng chi tiết');
      closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
        <path d="M18 6L6 18M6 6l12 12"/>
      </svg>`;
      closeBtn.addEventListener('click', () => close());

      top.append(heading, closeBtn);
      panel.appendChild(top);

      // Nhóm phần mở rộng (thanh công cụ + danh sách) vào .detail-extra để đóng/mở nội dung mượt
      const extra = document.createElement('div');
      extra.className = 'detail-extra';

      const toolbar = document.createElement('div');
      toolbar.className = 'detail-toolbar';

      const search = document.createElement('input');
      search.type = 'search';
      search.id = 'detailSearch';
      search.className = 'detail-search';
      search.placeholder = `Tìm trong ${sec.title.toLowerCase()}...`;
      search.autocomplete = 'off';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'detail-upload-btn';
      uploadBtn.textContent = sec.uploadLabel || '+ Đăng tải lên';
      uploadBtn.addEventListener('click', () => {
        onUploadClick?.({ subject: subjectName, section: sectionKey, sectionTitle: sec.title });
      });

      toolbar.append(search, uploadBtn);
      extra.appendChild(toolbar);

      const listSection = document.createElement('div');
      listSection.className = 'detail-list-section';

      const listWrap = document.createElement('div');
      listWrap.className = 'detail-list-wrap';
      listWrap.setAttribute('data-lenis-prevent', '');

      const listEl = document.createElement('div');
      listEl.className = 'detail-list';

      listWrap.appendChild(listEl);
      listSection.append(listWrap);
      extra.appendChild(listSection);

      panel.appendChild(extra);
      overlayEl.appendChild(panel);

      renderRows(listEl, currentItems, '');
      lenisCtrl = attachSmoothScroll(listWrap, listEl);

      search.addEventListener('input', () => {
        renderRows(listEl, currentItems, search.value);
      });

      // Đo kích thước đích ở giữa màn hình của bảng lớn
      const targetRect = panel.getBoundingClientRect();
      const targetCs = getComputedStyle(panel);
      const targetTitleSize = getComputedStyle(h2).fontSize;
      const targetDescSize = getComputedStyle(desc).fontSize;

      if (activeAnchorEl) activeAnchorEl.style.visibility = 'hidden';

      if (global.gsap && compact) {
        global.gsap.killTweensOf([overlayEl, panel, h2, desc, pills, closeBtn, extra]);

        // Bắt đầu với khung bảng đặt đúng tại vị trí bảng nhỏ, độ đặc 100% (không mờ bảng), chữ là chữ của bảng nhỏ
        panel.classList.add('is-morphing');
        desc.textContent = sec.desc;

        global.gsap.fromTo(
          overlayEl,
          { backgroundColor: 'rgba(4, 5, 10, 0)' },
          { backgroundColor: 'rgba(4, 5, 10, 0.48)', duration: 0.32, ease: 'power2.out' }
        );

        // Đổi chữ mô tả sang bản chi tiết ngay trong quá trình bảng đang nở rộng
        setTimeout(() => {
          if (isOpen && !isClosing) desc.textContent = sec.modalDesc || sec.desc;
        }, 110);

        global.gsap.fromTo(
          panel,
          {
            left: compact.left,
            top: compact.top,
            width: compact.width,
            height: compact.height,
            padding: compact.padding,
            borderRadius: compact.borderRadius,
          },
          {
            left: targetRect.left,
            top: targetRect.top,
            width: targetRect.width,
            height: targetRect.height,
            padding: targetCs.padding,
            borderRadius: targetCs.borderRadius,
            duration: 0.46,
            ease: 'appleBounce',
            onComplete: () => {
              panel.classList.remove('is-morphing');
              panel.style.left = '';
              panel.style.top = '';
              panel.style.width = '';
              panel.style.height = '';
              panel.style.padding = '';
              panel.style.borderRadius = '';
            },
          }
        );

        global.gsap.fromTo(
          h2,
          { fontSize: compact.titleFontSize },
          { fontSize: targetTitleSize, duration: 0.38, ease: 'appleSpring', clearProps: 'fontSize' }
        );
        global.gsap.fromTo(
          desc,
          { fontSize: compact.descFontSize, marginTop: compact.titleMarginBottom },
          { fontSize: targetDescSize, marginTop: '6px', duration: 0.38, ease: 'appleSpring', clearProps: 'fontSize,marginTop' }
        );
        global.gsap.fromTo(
          [pills, closeBtn],
          { opacity: 0, scale: 0.85 },
          { opacity: 1, scale: 1, duration: 0.28, delay: 0.14, ease: 'appleSpring', clearProps: 'all' }
        );
        global.gsap.fromTo(
          extra,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.32, delay: 0.16, ease: 'appleSpring', clearProps: 'all' }
        );
      }

      onOpenChange?.(true, { subject: subjectName, section: sectionKey });
      closeBtn.focus({ preventScroll: true });
    }

    function close(immediate = false) {
      if (!isOpen || isClosing) return;
      destroyLenis();

      const sec = sections.find((s) => s.key === currentSection);

      if (immediate || !global.gsap || !activeAnchorEl) {
        isOpen = false;
        isClosing = false;
        currentSubject = null;
        currentSection = null;
        restoreAnchorCard();
        overlayEl.hidden = true;
        overlayEl.replaceChildren();
        onOpenChange?.(false);
        return;
      }

      isClosing = true;
      const panel = overlayEl.querySelector('.detail-panel');
      const h2 = panel?.querySelector('#detailTitle');
      const desc = panel?.querySelector('.detail-desc');
      const top = panel?.querySelector('.detail-top');
      const pills = panel?.querySelector('.detail-pills');
      const closeBtn = panel?.querySelector('.detail-close');
      const extra = panel?.querySelector('.detail-extra');

      // Mở khóa độ sáng của hệ sao phía sau ngay lập tức để thấy bảng biến hình khớp về chỗ cũ
      onOpenChange?.(false);

      const startRect = panel.getBoundingClientRect();
      const compact = readCompactSpec(activeAnchorEl);
      if (!compact) {
        isOpen = false;
        isClosing = false;
        restoreAnchorCard();
        overlayEl.hidden = true;
        overlayEl.replaceChildren();
        return;
      }

      // 1. Đổi trực tiếp chữ tiêu đề và mô tả về nội dung của chiếc bảng nhỏ ngay khi bắt đầu thu lại (KHÔNG làm mờ bảng)
      if (sec && h2 && desc) {
        h2.textContent = sec.title;
        desc.textContent = sec.desc;
      }

      // 2. Ẩn gọn các phần mở rộng (pills, nút X, thanh tìm kiếm, danh sách) để bên trong chỉ còn đúng Tiêu đề + Mô tả
      if (pills) pills.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'none';
      if (top) top.style.marginBottom = '0px';
      if (extra) {
        global.gsap.to(extra, { opacity: 0, duration: 0.14, ease: 'power2.out' });
      }

      // 3. Khung bảng giữ nguyên opacity = 1, thu kích thước + cỡ chữ khớp 100% về chiếc bảng nhỏ
      panel.classList.add('is-morphing');
      global.gsap.set(panel, {
        left: startRect.left,
        top: startRect.top,
        width: startRect.width,
        height: startRect.height,
        opacity: 1,
      });

      if (h2) {
        global.gsap.to(h2, {
          fontSize: compact.titleFontSize,
          duration: 0.34,
          ease: 'appleSpring',
        });
      }
      if (desc) {
        global.gsap.to(desc, {
          fontSize: compact.descFontSize,
          marginTop: compact.titleMarginBottom,
          duration: 0.34,
          ease: 'appleSpring',
        });
      }

      // Tắt lớp nền mờ xung quanh nhưng giữ nguyên khung bảng đặc 100%
      overlayEl.style.backdropFilter = 'none';
      overlayEl.style.webkitBackdropFilter = 'none';
      global.gsap.to(overlayEl, {
        backgroundColor: 'rgba(4, 5, 10, 0)',
        duration: 0.30,
        ease: 'power2.out',
      });

      const morphState = { p: 0 };
      const startPadding = getComputedStyle(panel).padding;
      const startRadius = getComputedStyle(panel).borderRadius;

      global.gsap.to(panel, {
        padding: compact.padding,
        borderRadius: compact.borderRadius,
        duration: 0.38,
        ease: 'appleSpring',
      });

      global.gsap.to(morphState, {
        p: 1,
        duration: 0.38,
        ease: 'appleSpring',
        onUpdate: () => {
          // Bám theo tọa độ thực của chiếc bảng nhỏ trong mỗi frame để khớp tuyệt đối 100% khi chạm đích
          const liveRect = activeAnchorEl ? activeAnchorEl.getBoundingClientRect() : compact;
          const t = morphState.p;
          const curLeft = startRect.left + (liveRect.left - startRect.left) * t;
          const curTop = startRect.top + (liveRect.top - startRect.top) * t;
          const curW = startRect.width + (liveRect.width - startRect.width) * t;
          const curH = startRect.height + (liveRect.height - startRect.height) * t;

          panel.style.left = `${curLeft.toFixed(1)}px`;
          panel.style.top = `${curTop.toFixed(1)}px`;
          panel.style.width = `${curW.toFixed(1)}px`;
          panel.style.height = `${curH.toFixed(1)}px`;
        },
        onComplete: () => {
          isOpen = false;
          isClosing = false;
          currentSubject = null;
          currentSection = null;
          restoreAnchorCard();
          overlayEl.hidden = true;
          overlayEl.style.backgroundColor = '';
          overlayEl.style.backdropFilter = '';
          overlayEl.style.webkitBackdropFilter = '';
          overlayEl.replaceChildren();
        },
      });
    }

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    return {
      open,
      close,
      get isOpen() { return isOpen; },
    };
  }

  global.UIDetailModal = { createDetailModal };
})(window);

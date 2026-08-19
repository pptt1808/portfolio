(function () {
  'use strict';

  // Keep the document readable without JavaScript: the class only enables
  // progressive reveal styles when this file is actually running.
  document.documentElement.classList.add('js');

  const sections = Array.from(document.querySelectorAll('[data-case-section]'));
  const chapterLinks = Array.from(document.querySelectorAll('[data-chapter-link]'));
  const progress = document.querySelector('[data-case-progress]');
  const reveals = Array.from(document.querySelectorAll('.case-reveal'));

  const chapterMap = new Map();
  chapterLinks.forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) chapterMap.set(href.slice(1), link);
  });

  const setActiveChapter = id => {
    chapterLinks.forEach(link => {
      const active = link === chapterMap.get(id);
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  const updateProgress = () => {
    if (!progress) return;
    const root = document.documentElement;
    const range = Math.max(0, root.scrollHeight - window.innerHeight);
    const scrollTop = Math.max(0, window.scrollY || root.scrollTop || 0);
    progress.style.transform = `scaleX(${range ? Math.min(1, scrollTop / range) : 0})`;
  };

  const activeByPosition = () => {
    if (!sections.length) return;
    const marker = window.innerHeight * 0.3;
    let active = sections[0];
    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= marker) active = section;
    });
    setActiveChapter(active.id);
  };

  if (sections.length) {
    setActiveChapter(sections[0].id);
    if ('IntersectionObserver' in window) {
      const visible = new Set();
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        if (!visible.size) return;
        const marker = window.innerHeight * 0.3;
        const nearest = Array.from(visible).sort((a, b) => (
          Math.abs(a.getBoundingClientRect().top - marker)
          - Math.abs(b.getBoundingClientRect().top - marker)
        ))[0];
        if (nearest) setActiveChapter(nearest.id);
      }, { rootMargin: '-30% 0px -58% 0px', threshold: 0 });
      sections.forEach(section => observer.observe(section));
    }
  }

  let scrollFrame = null;
  const scheduleScrollUpdate = () => {
    if (scrollFrame !== null) return;
    const raf = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
    scrollFrame = raf(() => {
      scrollFrame = null;
      updateProgress();
      if (!('IntersectionObserver' in window)) activeByPosition();
    });
  };
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });
  scheduleScrollUpdate();

  const revealAll = () => reveals.forEach(element => element.classList.add('is-visible'));
  const reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealAll();
  } else if (reveals.length) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(element => revealObserver.observe(element));
    // Never leave content hidden if a browser throttles observers on a long page.
    window.setTimeout(revealAll, 4000);
  }

  // Image lightbox -------------------------------------------------------
  const dialog = document.querySelector('#case-image-dialog');
  const dialogImage = dialog && dialog.querySelector('figure img');
  const dialogCaption = dialog && dialog.querySelector('figcaption');
  const dialogCloseButtons = dialog ? Array.from(dialog.querySelectorAll('[data-dialog-close]')) : [];
  let returnFocus = null;

  const closeDialog = () => {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    dialog.removeAttribute('open');
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-case-dialog-open');
    const target = returnFocus;
    returnFocus = null;
    if (target && typeof target.focus === 'function') target.focus();
  };

  const openDialog = trigger => {
    if (!dialog || !dialogImage) return;
    const thumbnail = trigger.querySelector('img');
    const source = trigger.dataset.full || thumbnail?.currentSrc || thumbnail?.src || '';
    const alt = thumbnail?.alt || '';
    const caption = trigger.dataset.caption || alt;
    dialogImage.src = source;
    dialogImage.alt = alt;
    if (dialogCaption) dialogCaption.textContent = caption;
    returnFocus = trigger;
    dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-case-dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    const closeButton = dialog.querySelector('[data-dialog-close]:not(.case-dialog__backdrop)');
    if (closeButton) closeButton.focus();
  };

  document.querySelectorAll('[data-gallery-trigger]').forEach(trigger => {
    trigger.addEventListener('click', () => openDialog(trigger));
  });
  dialogCloseButtons.forEach(button => button.addEventListener('click', closeDialog));
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog && (dialog.open || dialog.getAttribute('aria-hidden') === 'false')) {
      event.preventDefault();
      closeDialog();
    }
  });

  // A missing local asset should fail gracefully and explain what happened.
  document.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => {
      if (image === dialogImage) {
        if (dialogCaption) dialogCaption.textContent = '这张界面截图暂时无法加载';
        return;
      }
      const frame = image.closest('figure') || image.parentElement;
      frame?.classList.add('is-image-missing');
      if (frame) frame.dataset.fallback = `${image.alt || '界面截图'} · 图片暂时无法加载`;
    });
    // If the browser finished a failed request before the listener was bound,
    // replay the same error path so the fallback remains visible.
    if (image.complete && image.naturalWidth === 0) {
      image.dispatchEvent(new Event('error'));
    }
  });

  // Runtime interaction carousel ----------------------------------------
  const runtimeCarousel = document.querySelector('[data-runtime-carousel]');
  if (runtimeCarousel) {
    const runtimeTabs = Array.from(runtimeCarousel.querySelectorAll('[data-runtime-tab]'));
    const runtimePanels = Array.from(runtimeCarousel.querySelectorAll('[data-runtime-panel]'));
    const runtimeStatus = runtimeCarousel.querySelector('[data-runtime-status]');
    const runtimeMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let runtimeIndex = Math.max(0, runtimeTabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'));
    let runtimeTimer = null;
    let runtimePointerInside = false;
    let runtimeFocusInside = false;

    const updateRuntimeStatus = () => {
      if (runtimeStatus) runtimeStatus.textContent = `${String(runtimeIndex + 1).padStart(2, '0')} / ${String(runtimeTabs.length).padStart(2, '0')}`;
    };

    const setRuntimePanel = (nextIndex, moveFocus = false) => {
      runtimeIndex = (nextIndex + runtimeTabs.length) % runtimeTabs.length;
      runtimeTabs.forEach((tab, index) => {
        const active = index === runtimeIndex;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active && moveFocus) tab.focus();
      });
      runtimePanels.forEach((panel, index) => {
        const active = index === runtimeIndex;
        panel.classList.toggle('is-active', active);
        panel.toggleAttribute('hidden', !active);
      });
      updateRuntimeStatus();
    };

    const runtimeCanAutoplay = () => (
      !runtimeMotionQuery?.matches
      && !runtimePointerInside
      && !runtimeFocusInside
      && document.visibilityState !== 'hidden'
      && runtimeTabs.length > 1
    );

    const stopRuntimeAutoplay = () => {
      if (runtimeTimer !== null) window.clearInterval(runtimeTimer);
      runtimeTimer = null;
    };

    const startRuntimeAutoplay = () => {
      stopRuntimeAutoplay();
      if (!runtimeCanAutoplay()) return;
      runtimeTimer = window.setInterval(() => setRuntimePanel(runtimeIndex + 1), 5200);
    };

    runtimeTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        setRuntimePanel(index);
        startRuntimeAutoplay();
      });
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? runtimeTabs.length - 1
            : runtimeIndex + (event.key === 'ArrowRight' ? 1 : -1);
        setRuntimePanel(nextIndex, true);
        startRuntimeAutoplay();
      });
    });

    runtimeCarousel.addEventListener('mouseenter', () => {
      runtimePointerInside = true;
      stopRuntimeAutoplay();
    });
    runtimeCarousel.addEventListener('mouseleave', () => {
      runtimePointerInside = false;
      startRuntimeAutoplay();
    });
    runtimeCarousel.addEventListener('focusin', () => {
      runtimeFocusInside = true;
      stopRuntimeAutoplay();
    });
    runtimeCarousel.addEventListener('focusout', event => {
      if (event.relatedTarget && runtimeCarousel.contains(event.relatedTarget)) return;
      runtimeFocusInside = false;
      startRuntimeAutoplay();
    });
    document.addEventListener('visibilitychange', startRuntimeAutoplay);
    runtimeMotionQuery?.addEventListener?.('change', startRuntimeAutoplay);

    setRuntimePanel(runtimeIndex);
    startRuntimeAutoplay();
  }

  // Branch map -----------------------------------------------------------
  const branchControls = Array.from(document.querySelectorAll('[data-branch]'));
  const branchPanels = Array.from(document.querySelectorAll('[data-branch-panel]'));
  const branchPaths = Array.from(document.querySelectorAll('[data-branch-path]'));

  const setBranch = key => {
    branchControls.forEach(control => {
      const active = control.dataset.branch === key;
      control.classList.toggle('is-active', active);
      if (control.tagName === 'BUTTON') control.setAttribute('aria-pressed', String(active));
    });
    branchPanels.forEach(panel => {
      const active = panel.dataset.branchPanel === key;
      panel.classList.toggle('is-active', active);
      panel.toggleAttribute('hidden', !active);
    });
    branchPaths.forEach(path => path.classList.toggle('is-active', path.dataset.branchPath === key));
  };

  const activateBranchControl = control => setBranch(control.dataset.branch);
  branchControls.forEach(control => {
    control.addEventListener('click', () => activateBranchControl(control));
    if (control.matches('svg [data-branch], g[data-branch]')) {
      control.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activateBranchControl(control);
      });
    }
  });
  const initial = document.querySelector('[data-branch][aria-pressed="true"]')?.dataset.branch
    || branchControls[0]?.dataset.branch;
  if (initial) setBranch(initial);
}());

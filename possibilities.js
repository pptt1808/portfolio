(function () {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');
  const progress = document.querySelector('[data-possibility-progress]');
  const sections = [...document.querySelectorAll('[data-possibility-section]')];
  const chapterLinks = [...document.querySelectorAll('[data-possibility-chapter-link]')];
  let activeChapterLink = null;
  let hashScrollPending = false;
  let hashScrollTimer = null;

  const setActiveChapter = (sectionId, forceScroll = false) => {
    const nextActiveLink = chapterLinks.find(link => link.getAttribute('href') === `#${sectionId}`);
    if (!nextActiveLink) return;
    if (nextActiveLink === activeChapterLink && !forceScroll) return;
    chapterLinks.forEach(link => {
      const active = link === nextActiveLink;
      link.classList.toggle('is-active', active);
      /* 与各案例页 scroll-spy 一致：aria-current 供 GooeyNav 胶囊跟随，也利于无障碍 */
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    activeChapterLink = nextActiveLink;
    if (window.matchMedia('(max-width: 720px)').matches) {
      nextActiveLink.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  };

  let progressFrame = 0;
  const updateProgress = () => {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0})`;
  };
  const scheduleProgress = () => {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(() => {
      progressFrame = 0;
      updateProgress();
    });
  };
  updateProgress();
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', scheduleProgress);

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) revealObserver.unobserve(entry.target);
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    sections.forEach(section => revealObserver.observe(section));

    const activeObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        setActiveChapter(entry.target.id);
      });
    }, { threshold: 0, rootMargin: '-30% 0px -55% 0px' });
    sections.forEach(section => activeObserver.observe(section));
  } else {
    sections.forEach(section => section.classList.add('is-visible'));
  }

  const syncChapterFromHash = () => {
    const sectionId = window.location.hash.slice(1);
    if (sectionId) setActiveChapter(sectionId, true);
    const target = sectionId ? document.getElementById(sectionId) : null;
    if (!target) return;
    hashScrollPending = true;
    const alignTarget = () => {
      const headerHeight = document.querySelector('.possibility-header')?.offsetHeight || 0;
      const chapterHeight = document.querySelector('.possibility-chapter-bar')?.offsetHeight || 0;
      const pageTop = target.getBoundingClientRect().top + window.scrollY;
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, Math.max(0, pageTop - headerHeight - chapterHeight));
      window.setTimeout(() => { document.documentElement.style.scrollBehavior = ''; }, 0);
    };
    alignTarget();
    window.setTimeout(alignTarget, 550);
    window.setTimeout(alignTarget, 1500);
    window.clearTimeout(hashScrollTimer);
    hashScrollTimer = window.setTimeout(() => { hashScrollPending = false; }, 4500);
  };
  window.addEventListener('hashchange', syncChapterFromHash);
  syncChapterFromHash();
  window.addEventListener('load', () => {
    if (hashScrollPending) {
      const target = document.getElementById(window.location.hash.slice(1));
      target?.scrollIntoView({ behavior: 'auto', block: 'start' });
    }
  });
  document.querySelectorAll('img[loading="lazy"]').forEach(image => image.addEventListener('load', () => {
    if (!hashScrollPending) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }));

  const branchControls = [...document.querySelectorAll('[data-branch-control]')];
  const branchPanels = [...document.querySelectorAll('[data-branch]')];
  let branchTransition = 0;
  const setBranch = branch => {
    const nextPanel = branchPanels.find(panel => panel.dataset.branch === branch);
    const currentPanel = branchPanels.find(panel => panel.classList.contains('is-active'));
    if (!nextPanel || nextPanel === currentPanel) return;
    branchControls.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.branchControl === branch)));
    const transitionId = ++branchTransition;
    currentPanel?.classList.remove('is-active');
    currentPanel?.classList.add('is-exiting');
    nextPanel.classList.remove('is-exiting');
    nextPanel.classList.add('is-active');
    window.setTimeout(() => {
      if (transitionId === branchTransition) currentPanel?.classList.remove('is-exiting');
    }, 300);
  };
  branchControls.forEach(control => control.addEventListener('click', () => setBranch(control.dataset.branchControl || 'group')));
  setBranch('group');

  const dialog = document.getElementById('possibility-image-dialog');
  const dialogImage = dialog?.querySelector('figure img');
  const dialogCaption = document.getElementById('possibility-dialog-caption');
  const closeButtons = [...document.querySelectorAll('[data-possibility-dialog-close]')];
  const previousButton = dialog?.querySelector('[data-possibility-dialog-prev]');
  const nextButton = dialog?.querySelector('[data-possibility-dialog-next]');
  const triggers = [...document.querySelectorAll('[data-possibility-gallery]')];
  let currentIndex = 0;
  let returnFocus = null;

  const setDialogImage = index => {
    if (!dialogImage || !triggers.length) return;
    currentIndex = (index + triggers.length) % triggers.length;
    const trigger = triggers[currentIndex];
    const image = trigger.querySelector('img');
    dialogImage.src = trigger.dataset.full || image?.currentSrc || image?.src || '';
    dialogImage.alt = image?.alt || '';
    if (dialogCaption) dialogCaption.textContent = trigger.dataset.caption || image?.alt || `界面截图 ${currentIndex + 1}`;
  };
  const openDialog = trigger => {
    if (!dialog) return;
    returnFocus = trigger;
    setDialogImage(Math.max(0, triggers.indexOf(trigger)));
    dialog.hidden = false;
    dialog.setAttribute('aria-hidden', 'false');
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else dialog.classList.add('is-open');
    (dialog.querySelector('[data-possibility-dialog-close]') || dialog).focus?.();
  };
  const closeDialog = () => {
    if (!dialog) return;
    dialog.setAttribute('aria-hidden', 'true');
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.classList.remove('is-open');
    dialog.hidden = true;
    returnFocus?.focus?.();
    returnFocus = null;
  };
  triggers.forEach(trigger => trigger.addEventListener('click', () => openDialog(trigger)));
  closeButtons.forEach(button => button.addEventListener('click', closeDialog));
  previousButton?.addEventListener('click', () => setDialogImage(currentIndex - 1));
  nextButton?.addEventListener('click', () => setDialogImage(currentIndex + 1));
  dialogImage?.addEventListener('error', () => {
    dialogImage.alt = '该界面截图暂时无法加载';
    if (dialogCaption) dialogCaption.textContent = '截图暂时无法加载，请返回页面查看其他证据';
  });
  document.addEventListener('keydown', event => {
    if (!dialog || dialog.getAttribute('aria-hidden') !== 'false') return;
    if (event.key === 'Escape') { event.preventDefault(); closeDialog(); return; }
    if (event.key === 'ArrowLeft') { event.preventDefault(); setDialogImage(currentIndex - 1); return; }
    if (event.key === 'ArrowRight') { event.preventDefault(); setDialogImage(currentIndex + 1); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  document.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => {
      const frame = image.closest('.possibility-shot-trigger, .possibility-evidence, .possibility-hero-shot');
      if (!frame) return;
      frame.classList.add('is-image-missing');
      frame.dataset.fallback = '界面截图暂时无法加载';
    });
  });
}());

(function () {
  'use strict';

  document.documentElement.classList.add('js');

  const progress = document.querySelector('[data-case-progress]');
  const sections = [...document.querySelectorAll('[data-case-section]')];
  const motionSections = [...document.querySelectorAll('[data-motion-section]')];
  const chapterLinks = [...document.querySelectorAll('[data-chapter-link]')];
  const reveals = [...document.querySelectorAll('.case-reveal')];

  const dialog = document.querySelector('#case-image-dialog');
  const dialogImage = dialog?.querySelector('figure img');
  const dialogCaption = dialog?.querySelector('figcaption');
  const triggers = [...document.querySelectorAll('[data-case-gallery]')];
  const galleries = new Map();
  let activeGallery = [];
  let activeIndex = 0;
  let returnFocus = null;

  const chapterById = new Map();
  chapterLinks.forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#')) {
      chapterById.set(href.slice(1), link);
    }
  });

  const setActiveChapter = sectionId => {
    const targetId = sectionId;
    const activeLink = chapterById.get(targetId);
    if (!activeLink) return;

    chapterLinks.forEach(link => link.removeAttribute('aria-current'));
    activeLink.setAttribute('aria-current', 'location');
  };

  if (sections.length && chapterLinks.length) {
    setActiveChapter(sections[0].id);
  }

  const updateProgress = () => {
    if (!progress) return;

    const root = document.documentElement;
    const range = Math.max(0, root.scrollHeight - window.innerHeight);
    const scrollTop = Math.max(0, window.scrollY || root.scrollTop || 0);
    const ratio = range > 0 ? Math.min(1, scrollTop / range) : 0;
    progress.style.transform = `scaleX(${ratio})`;
  };

  const updateActiveByPosition = () => {
    if (!sections.length) return;

    const marker = window.innerHeight * 0.3;
    let activeSection = sections[0];
    sections.forEach(section => {
      if (section.getBoundingClientRect().top <= marker) {
        activeSection = section;
      }
    });
    setActiveChapter(activeSection.id);
  };

  const updateMotionSections = () => {
    if (!motionSections.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    motionSections.forEach(section => {
      const rect = section.getBoundingClientRect();
      const nearViewport = rect.bottom >= -viewportHeight * 0.35 && rect.top <= viewportHeight * 1.35;
      section.toggleAttribute('data-motion-active', nearViewport);
      if (!nearViewport) return;

      const travel = Math.max(1, rect.height + viewportHeight * 0.45);
      const sectionProgress = Math.min(1, Math.max(0, (viewportHeight * 0.82 - rect.top) / travel));
      section.style.setProperty('--section-progress', sectionProgress.toFixed(3));

      const steps = [...section.querySelectorAll('[data-motion-step]')];
      steps.forEach((step, index) => {
        const stepRect = step.getBoundingClientRect();
        const stepTravel = Math.max(1, stepRect.height + viewportHeight * 0.35);
        const stepProgress = Math.min(1, Math.max(0, (viewportHeight * 0.78 - stepRect.top) / stepTravel));
        step.style.setProperty('--step-progress', stepProgress.toFixed(3));
        step.style.setProperty('--motion-index', index);
      });
    });
  };

  let chapterObserver = null;
  if ('IntersectionObserver' in window && sections.length) {
    const intersectingSections = new Set();
    chapterObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          intersectingSections.add(entry.target);
        } else {
          intersectingSections.delete(entry.target);
        }
      });

      if (!intersectingSections.size) return;

      const marker = window.innerHeight * 0.3;
      const nearest = [...intersectingSections].sort((a, b) => (
        Math.abs(a.getBoundingClientRect().top - marker)
        - Math.abs(b.getBoundingClientRect().top - marker)
      ))[0];
      if (nearest) setActiveChapter(nearest.id);
    }, { rootMargin: '-30% 0px -58% 0px', threshold: 0 });

    sections.forEach(section => chapterObserver.observe(section));
  }

  let updateQueued = false;
  const scheduleScrollUpdate = () => {
    if (updateQueued) return;
    updateQueued = true;

    const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 16));
    schedule(() => {
      updateQueued = false;
      updateProgress();
      updateMotionSections();
      if (!chapterObserver) updateActiveByPosition();
    });
  };

  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });
  scheduleScrollUpdate();

  const showAllReveals = () => {
    reveals.forEach(element => element.classList.add('is-visible'));
  };

  const revealGroup = element => {
    const scope = element.closest('.case-intro, [data-case-section]') || document;
    const group = [...scope.querySelectorAll('.case-reveal:not(.is-visible)')];
    const index = Math.max(0, group.indexOf(element));
    const delay = Math.min(index * 90, 270);
    element.style.setProperty('--reveal-delay', `${delay}ms`);
    element.classList.add('is-visible');
  };

  const prefersReducedMotion = Boolean(
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  if (prefersReducedMotion || !('IntersectionObserver' in window)) {
    showAllReveals();
  } else if (reveals.length) {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        revealGroup(entry.target);
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    reveals.forEach(element => revealObserver.observe(element));
    window.setTimeout(showAllReveals, 4000);
  }

  triggers.forEach(trigger => {
    const galleryName = trigger.dataset.caseGallery || 'default';
    const gallery = galleries.get(galleryName) || [];
    gallery.push(trigger);
    galleries.set(galleryName, gallery);
  });

  const closeButton = dialog?.querySelector('[data-case-dialog-close][type="button"]');
  const previousButton = dialog?.querySelector('[data-case-dialog-prev]');
  const nextButton = dialog?.querySelector('[data-case-dialog-next]');

  const renderActiveImage = () => {
    if (!dialogImage || !dialogCaption || !activeGallery.length) return;

    activeIndex = ((activeIndex % activeGallery.length) + activeGallery.length) % activeGallery.length;
    const trigger = activeGallery[activeIndex];
    const thumbnail = trigger.querySelector('img');
    const source = trigger.dataset.full || thumbnail?.currentSrc || thumbnail?.src || '';
    const caption = trigger.dataset.caption || thumbnail?.alt || '';

    dialogImage.alt = thumbnail?.alt || caption;
    dialogCaption.textContent = caption;
    if (source) dialogImage.src = source;
  };

  const openDialog = () => {
    if (!dialog || !activeGallery.length) return;

    renderActiveImage();
    dialog.removeAttribute('hidden');
    dialog.removeAttribute('inert');
    if ('inert' in dialog) dialog.inert = false;
    dialog.setAttribute('aria-hidden', 'false');
    document.body?.classList.add('is-case-dialog-open');
    closeButton?.focus();
  };

  const closeDialog = () => {
    if (!dialog || dialog.getAttribute('aria-hidden') !== 'false') return;

    dialog.setAttribute('aria-hidden', 'true');
    if ('inert' in dialog) {
      dialog.inert = true;
    } else {
      dialog.setAttribute('inert', '');
    }
    dialog.setAttribute('hidden', '');
    document.body?.classList.remove('is-case-dialog-open');

    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function' && !focusTarget.disabled) {
      focusTarget.focus();
    }
  };

  const moveImage = offset => {
    if (!activeGallery.length) return;
    activeIndex = (activeIndex + offset + activeGallery.length) % activeGallery.length;
    renderActiveImage();
  };

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;

      const galleryName = trigger.dataset.caseGallery || 'default';
      const gallery = galleries.get(galleryName) || [trigger];
      activeGallery = gallery.filter(item => (
        !item.disabled && item.getAttribute('aria-disabled') !== 'true'
      ));
      if (!activeGallery.length) return;
      activeIndex = Math.max(0, activeGallery.indexOf(trigger));
      returnFocus = trigger;
      openDialog();
    });
  });

  dialog?.querySelectorAll('[data-case-dialog-close]').forEach(control => {
    control.addEventListener('click', closeDialog);
  });
  previousButton?.addEventListener('click', () => moveImage(-1));
  nextButton?.addEventListener('click', () => moveImage(1));

  document.addEventListener('keydown', event => {
    if (!dialog || dialog.getAttribute('aria-hidden') !== 'false') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveImage(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveImage(1);
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true');

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  const handlePageImageError = image => {
    const fallbackTarget = image.closest('.case-shot') || image.closest('figure');
    const fallbackText = `${image.alt || '界面截图'} · 界面素材未加载`;
    if (fallbackTarget) {
      fallbackTarget.classList.add('is-image-missing');
      fallbackTarget.dataset.fallback = fallbackText;
    }

    const button = image.closest('button');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');

      const galleryName = button.dataset.caseGallery || 'default';
      const gallery = galleries.get(galleryName);
      const galleryIndex = gallery?.indexOf(button) ?? -1;
      if (gallery && galleryIndex >= 0) gallery.splice(galleryIndex, 1);

      const activeItemIndex = activeGallery.indexOf(button);
      if (activeItemIndex >= 0) {
        activeGallery.splice(activeItemIndex, 1);
        if (activeItemIndex < activeIndex) activeIndex -= 1;
        if (activeIndex >= activeGallery.length) activeIndex = 0;

        if (!activeGallery.length && dialog?.getAttribute('aria-hidden') === 'false') {
          closeDialog();
        } else if (activeGallery.length && dialog?.getAttribute('aria-hidden') === 'false') {
          renderActiveImage();
        }
      }
    }
    image.removeAttribute('src');
  };

  const handleImageError = image => {
    if (image === dialogImage) {
      image.removeAttribute('src');
      image.alt = '';
      if (dialogCaption) dialogCaption.textContent = '这张界面截图暂时无法加载';
      return;
    }

    handlePageImageError(image);
  };

  document.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => handleImageError(image));
    if (image.complete && image.naturalWidth === 0) handleImageError(image);
  });
}());

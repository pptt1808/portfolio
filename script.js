document.documentElement.classList.add('js');

(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = document.querySelector('[data-reading-progress]');
  const header = document.querySelector('[data-site-header]');
  const navLinks = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
  const projectLinks = [...document.querySelectorAll('[data-project-link]')];
  const sections = [...document.querySelectorAll('[data-section]')];
  let framePending = false;

  const updateScrollState = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, Math.max(0, scrollTop / scrollable)) : 0;

    if (progress) progress.style.transform = `scaleX(${ratio})`;
    if (header) header.classList.toggle('is-scrolled', scrollTop > 18);
    framePending = false;
  };

  const requestScrollUpdate = () => {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateScrollState);
  };

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  updateScrollState();

  const revealItems = [...document.querySelectorAll('.reveal')];
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach(item => item.classList.add('is-visible'));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -9% 0px', threshold: 0.08 });

    revealItems.forEach(item => revealObserver.observe(item));
  }

  const tiltCards = [...document.querySelectorAll('[data-tilt]')];
  const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!reduceMotion && pointerFine) {
    tiltCards.forEach(card => {
      const base = card.dataset.tiltBase || '0deg';
      const reset = () => {
        card.style.transform = `perspective(1200px) rotate(${base}) translate3d(0, 0, 0)`;
      };
      card.addEventListener('pointermove', event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `perspective(1200px) rotateX(${(-y * 1.8).toFixed(2)}deg) rotateY(${(x * 2.4).toFixed(2)}deg) rotate(${base}) translate3d(0, -3px, 0)`;
      });
      card.addEventListener('pointerleave', reset);
      card.addEventListener('pointercancel', reset);
      reset();
    });
  }

  const setCurrentSection = id => {
    navLinks.forEach(link => {
      const current = link.getAttribute('href') === `#${id}` ||
        (['citywalk', 'possibilities', 'drama', 'alexent'].includes(id) && link.getAttribute('href') === '#projects');
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });

    projectLinks.forEach(link => {
      const current = link.dataset.projectLink === id;
      link.classList.toggle('is-active', current);
      if (current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  if ('IntersectionObserver' in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]?.target.id) setCurrentSection(visible[0].target.id);
    }, { rootMargin: '-28% 0px -58% 0px', threshold: [0, 0.01, 0.2] });

    sections.forEach(section => sectionObserver.observe(section));
  }

  const dialog = document.querySelector('#image-dialog');
  const dialogImage = dialog?.querySelector('figure img');
  const dialogCaption = dialog?.querySelector('figcaption');
  const previousButton = dialog?.querySelector('[data-dialog-prev]');
  const nextButton = dialog?.querySelector('[data-dialog-next]');
  const closeButton = dialog?.querySelector('.dialog-close');
  const galleryTriggers = [...document.querySelectorAll('.gallery-trigger')];
  const galleries = new Map();
  let activeGallery = [];
  let activeIndex = 0;
  let returnFocus = null;

  galleryTriggers.forEach(trigger => {
    const galleryName = trigger.dataset.gallery;
    if (!galleries.has(galleryName)) galleries.set(galleryName, []);
    const gallery = galleries.get(galleryName);
    if (!gallery.some(item => item.full === trigger.dataset.full)) {
      gallery.push({
        full: trigger.dataset.full,
        caption: trigger.dataset.caption || trigger.querySelector('img')?.alt || '',
        alt: trigger.querySelector('img')?.alt || trigger.dataset.caption || ''
      });
    }
  });

  const renderDialogImage = () => {
    const item = activeGallery[activeIndex];
    if (!item || !dialogImage || !dialogCaption) return;

    dialogImage.src = item.full;
    dialogImage.alt = item.alt;
    dialogCaption.textContent = item.caption;
    const hasMultipleImages = activeGallery.length > 1;
    if (previousButton) previousButton.hidden = !hasMultipleImages;
    if (nextButton) nextButton.hidden = !hasMultipleImages;
  };

  const openDialog = trigger => {
    if (!dialog || trigger.disabled) return;
    activeGallery = galleries.get(trigger.dataset.gallery) || [];
    activeIndex = Math.max(0, activeGallery.findIndex(item => item.full === trigger.dataset.full));
    returnFocus = trigger;
    renderDialogImage();
    dialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-dialog-open');
    closeButton?.focus();
  };

  const closeDialog = () => {
    if (!dialog || dialog.getAttribute('aria-hidden') === 'true') return;
    dialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-dialog-open');
    returnFocus?.focus();
  };

  const moveDialog = direction => {
    if (activeGallery.length < 2) return;
    activeIndex = (activeIndex + direction + activeGallery.length) % activeGallery.length;
    renderDialogImage();
  };

  galleryTriggers.forEach(trigger => trigger.addEventListener('click', () => openDialog(trigger)));
  dialog?.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', closeDialog));
  previousButton?.addEventListener('click', () => moveDialog(-1));
  nextButton?.addEventListener('click', () => moveDialog(1));

  document.addEventListener('keydown', event => {
    if (!dialog || dialog.getAttribute('aria-hidden') === 'true') return;

    if (event.key === 'Escape') closeDialog();
    if (event.key === 'ArrowLeft') moveDialog(-1);
    if (event.key === 'ArrowRight') moveDialog(1);

    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button:not([hidden]):not([disabled])')];
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  const handleImageError = image => {
      if (image === dialogImage) {
        if (dialogCaption) dialogCaption.textContent = '这张界面截图暂时无法加载';
        return;
      }

      const container = image.closest('.gallery-trigger');
      if (!container) return;
      container.classList.add('is-image-missing');
      container.dataset.fallback = `${image.alt || '产品界面'} · 截图暂时无法加载`;
      container.disabled = true;
      container.setAttribute('aria-disabled', 'true');
  };

  document.querySelectorAll('img').forEach(image => {
    image.addEventListener('error', () => handleImageError(image), { once: true });
    if (image.complete && image.naturalWidth === 0) handleImageError(image);
  });

  const toast = document.querySelector('[data-toast]');
  let toastTimer;
  const showToast = message => {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
  };

  const fallbackCopy = text => {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  };

  const selectVisibleEmail = () => {
    const address = document.querySelector('#email-address');
    if (!address || !window.getSelection) return;
    const range = document.createRange();
    range.selectNodeContents(address);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };

  document.querySelectorAll('[data-copy-email]').forEach(button => {
    button.addEventListener('click', async () => {
      const email = button.dataset.email;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(email);
        } else if (!fallbackCopy(email)) {
          throw new Error('copy unavailable');
        }
        button.textContent = '已复制';
        showToast('邮箱已复制到剪贴板');
        window.setTimeout(() => { button.textContent = '复制邮箱'; }, 2200);
      } catch {
        selectVisibleEmail();
        showToast(`请手动复制：${email}`);
      }
    });
  });
})();

/* Hero 背景关键词网格：GridMotion 的原生 JS 移植（行随鼠标横向漂移，奇偶行反向，逐行惯性递减） */
(() => {
  'use strict';

  const container = document.querySelector('[data-grid-motion]');
  const board = container && container.querySelector('[data-grid-board]');
  if (!container || !board) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const keywords = [
    '城市探索', '路线规划', '行中记录', '手账生成', '评测体系',
    'Agent', '长期记忆', '职业体验', 'AI Mentor', '互动短剧',
    '内容 Pipeline', '剧情理解', 'RAG 治理', '权限与记忆', '五阶段交付',
    'FDE', '证据链', '真实痛点', '情绪洞察', '工程流程'
  ];

  const ROWS = 10;
  const COLS = 15;
  const rows = [];
  for (let r = 0; r < ROWS; r += 1) {
    const row = document.createElement('div');
    row.className = 'grid-motion__row';
    for (let c = 0; c < COLS; c += 1) {
      const card = document.createElement('div');
      card.className = 'grid-motion__card';
      card.textContent = keywords[(r * COLS + c) % keywords.length];
      row.appendChild(card);
    }
    board.appendChild(row);
    rows.push(row);
  }

  if (reduceMotion) return;

  const maxMove = 300;
  const inertiaFactors = [0.055, 0.04, 0.03, 0.02];
  const state = rows.map((_, index) => ({
    x: 0,
    direction: index % 2 === 0 ? 1 : -1,
    ease: inertiaFactors[index % inertiaFactors.length]
  }));

  let mouseX = null;
  let running = false;
  let rafId = 0;
  const startTime = performance.now();

  const tick = now => {
    const elapsed = (now - startTime) / 1000;
    rows.forEach((row, index) => {
      const item = state[index];
      const ratio = mouseX === null
        ? 0.5 + Math.sin(elapsed * 0.25 + index * 0.6) * 0.28
        : mouseX / window.innerWidth;
      const target = (ratio * maxMove - maxMove / 2) * item.direction;
      item.x += (target - item.x) * item.ease;
      row.style.transform = `translate3d(${item.x.toFixed(2)}px, 0, 0)`;
    });
    if (running) rafId = window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    rafId = window.requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    window.cancelAnimationFrame(rafId);
  };

  window.addEventListener('mousemove', event => { mouseX = event.clientX; }, { passive: true });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => (entry.isIntersecting ? start() : stop()));
    });
    observer.observe(container);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
})();

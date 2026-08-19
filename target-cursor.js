/*
 * TargetCursor — Vue Bits <TargetCursor /> 组件的 vanilla JS 移植（TypeScript + Tailwind 变体）。
 * 依赖 gsap（需在本文件之前加载）。
 *
 * Props 默认值与组件一致：targetSelector ".cursor-target"、spinDuration 2、
 * hideDefaultCursor true、hoverDuration 0.2、parallaxOn true。
 * 本站把选择器扩展到所有链接与按钮，作为整站的统一光标实现。
 */
(function () {
  'use strict';

  const config = {
    targetSelector: 'a[href], button, [role="button"], .cursor-target',
    spinDuration: 2,
    hideDefaultCursor: true,
    hoverDuration: 0.2,
    parallaxOn: true
  };

  const constants = {
    borderWidth: 3,
    cornerSize: 12
  };

  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 768;
  const userAgent = (navigator.userAgent || navigator.vendor || '').toLowerCase();
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isMobile = (hasTouchScreen && isSmallScreen) || mobileRegex.test(userAgent);

  if (isMobile || !window.gsap || !document.body) return;

  const gsap = window.gsap;

  /* --- DOM，对应组件 template --- */
  const cursor = document.createElement('div');
  cursor.className = 'target-cursor';
  cursor.setAttribute('aria-hidden', 'true');

  const dot = document.createElement('div');
  dot.className = 'target-cursor-dot';
  cursor.appendChild(dot);

  const cornerModifiers = [
    'target-cursor-corner--tl',
    'target-cursor-corner--tr',
    'target-cursor-corner--br',
    'target-cursor-corner--bl'
  ];
  const corners = cornerModifiers.map(modifier => {
    const corner = document.createElement('div');
    corner.className = `target-cursor-corner ${modifier}`;
    cursor.appendChild(corner);
    return corner;
  });

  document.body.appendChild(cursor);

  /* 初始角标位置，与 Tailwind translate 类（-translate-x-[150%] 等）的几何关系一致。 */
  const { cornerSize } = constants;
  const restPositions = [
    { x: -cornerSize * 1.5, y: -cornerSize * 1.5 },
    { x: cornerSize * 0.5, y: -cornerSize * 1.5 },
    { x: cornerSize * 0.5, y: cornerSize * 0.5 },
    { x: -cornerSize * 1.5, y: cornerSize * 0.5 }
  ];
  corners.forEach((corner, index) => {
    gsap.set(corner, { x: restPositions[index].x, y: restPositions[index].y });
  });
  gsap.set(dot, { xPercent: -50, yPercent: -50 });

  let spinTl = null;
  let isActive = false;
  let targetCornerPositions = null;
  const activeStrength = { current: 0 };
  let activeTarget = null;
  let currentLeaveHandler = null;
  let resumeTimeout = null;
  let dialogOpen = false;

  const moveCursor = (x, y) => {
    gsap.to(cursor, {
      x,
      y,
      duration: 0.1,
      ease: 'power3.out'
    });
  };

  const cleanupTarget = target => {
    if (currentLeaveHandler) {
      target.removeEventListener('mouseleave', currentLeaveHandler);
    }
    currentLeaveHandler = null;
  };

  gsap.set(cursor, {
    xPercent: -50,
    yPercent: -50,
    x: window.innerWidth / 2,
    y: window.innerHeight / 2
  });

  const createSpinTimeline = () => {
    if (spinTl) {
      spinTl.kill();
    }
    spinTl = gsap.timeline({ repeat: -1 }).to(cursor, {
      rotation: '+=360',
      duration: config.spinDuration,
      ease: 'none'
    });
  };

  createSpinTimeline();

  const tickerFn = () => {
    if (!targetCornerPositions) {
      return;
    }

    const strength = activeStrength.current;
    if (strength === 0) return;

    const cursorX = gsap.getProperty(cursor, 'x');
    const cursorY = gsap.getProperty(cursor, 'y');

    corners.forEach((corner, i) => {
      const currentX = gsap.getProperty(corner, 'x');
      const currentY = gsap.getProperty(corner, 'y');

      const targetX = targetCornerPositions[i].x - cursorX;
      const targetY = targetCornerPositions[i].y - cursorY;
      const finalX = currentX + (targetX - currentX) * strength;
      const finalY = currentY + (targetY - currentY) * strength;

      const duration = strength >= 0.99 ? (config.parallaxOn ? 0.2 : 0) : 0.05;

      gsap.to(corner, {
        x: finalX,
        y: finalY,
        duration,
        ease: duration === 0 ? 'none' : 'power1.out',
        overwrite: 'auto'
      });
    });
  };

  const moveHandler = event => {
    if (dialogOpen) return;
    moveCursor(event.clientX, event.clientY);
  };

  window.addEventListener('mousemove', moveHandler);

  const scrollHandler = () => {
    if (!activeTarget) return;

    const mouseX = gsap.getProperty(cursor, 'x');
    const mouseY = gsap.getProperty(cursor, 'y');

    const elementUnderMouse = document.elementFromPoint(mouseX, mouseY);

    const isStillOverTarget =
      elementUnderMouse &&
      (elementUnderMouse === activeTarget || elementUnderMouse.closest(config.targetSelector) === activeTarget);
    if (!isStillOverTarget) {
      currentLeaveHandler?.();
    }
  };

  window.addEventListener('scroll', scrollHandler, { passive: true });

  const mouseDownHandler = () => {
    if (dialogOpen) return;
    gsap.to(dot, {
      scale: 0.7,
      duration: 0.3
    });
    gsap.to(cursor, {
      scale: 0.9,
      duration: 0.2
    });
  };

  const mouseUpHandler = () => {
    gsap.to(dot, {
      scale: 1,
      duration: 0.3
    });
    gsap.to(cursor, {
      scale: 1,
      duration: 0.2
    });
  };

  window.addEventListener('mousedown', mouseDownHandler);
  window.addEventListener('mouseup', mouseUpHandler);

  const enterHandler = event => {
    if (dialogOpen) return;

    const directTarget = event.target;
    const allTargets = [];
    let current = directTarget;

    while (current && current !== document.body) {
      if (current.matches && current.matches(config.targetSelector)) {
        allTargets.push(current);
      }
      current = current.parentElement;
    }

    const target = allTargets[0] || null;
    if (!target) return;
    if (activeTarget === target) return;
    if (activeTarget) {
      cleanupTarget(activeTarget);
    }

    if (resumeTimeout) {
      clearTimeout(resumeTimeout);
      resumeTimeout = null;
    }

    activeTarget = target;

    corners.forEach(corner => gsap.killTweensOf(corner));

    gsap.killTweensOf(cursor, 'rotation');

    spinTl?.pause();

    gsap.set(cursor, {
      rotation: 0
    });

    const rect = target.getBoundingClientRect();
    const { borderWidth } = constants;

    const cursorX = gsap.getProperty(cursor, 'x');
    const cursorY = gsap.getProperty(cursor, 'y');
    targetCornerPositions = [
      {
        x: rect.left - borderWidth,
        y: rect.top - borderWidth
      },
      {
        x: rect.right + borderWidth - cornerSize,
        y: rect.top - borderWidth
      },
      {
        x: rect.right + borderWidth - cornerSize,
        y: rect.bottom + borderWidth - cornerSize
      },
      {
        x: rect.left - borderWidth,
        y: rect.bottom + borderWidth - cornerSize
      }
    ];

    isActive = true;
    gsap.ticker.add(tickerFn);

    gsap.to(activeStrength, {
      current: 1,
      duration: config.hoverDuration,
      ease: 'power2.out'
    });

    corners.forEach((corner, i) => {
      gsap.to(corner, {
        x: targetCornerPositions[i].x - cursorX,
        y: targetCornerPositions[i].y - cursorY,
        duration: 0.2,
        ease: 'power2.out'
      });
    });

    const leaveHandler = () => {
      gsap.ticker.remove(tickerFn);
      isActive = false;
      targetCornerPositions = null;
      gsap.set(activeStrength, {
        current: 0,
        overwrite: true
      });

      activeTarget = null;

      corners.forEach(corner => gsap.killTweensOf(corner));

      const tl = gsap.timeline();

      corners.forEach((corner, index) => {
        tl.to(
          corner,
          {
            x: restPositions[index].x,
            y: restPositions[index].y,
            duration: 0.3,
            ease: 'power3.out'
          },
          0
        );
      });

      resumeTimeout = setTimeout(() => {
        if (!activeTarget && spinTl) {
          const currentRotation = gsap.getProperty(cursor, 'rotation');

          const normalizedRotation = currentRotation % 360;

          spinTl.kill();

          spinTl = gsap.timeline({ repeat: -1 }).to(cursor, {
            rotation: '+=360',
            duration: config.spinDuration,
            ease: 'none'
          });

          gsap.to(cursor, {
            rotation: normalizedRotation + 360,
            duration: config.spinDuration * (1 - normalizedRotation / 360),
            ease: 'none',
            onComplete: () => {
              spinTl?.restart();
            }
          });
        }

        resumeTimeout = null;
      }, 50);

      cleanupTarget(target);
    };

    currentLeaveHandler = leaveHandler;

    target.addEventListener('mouseleave', leaveHandler);
  };

  window.addEventListener('mouseover', enterHandler);

  /*
   * <dialog> 以 showModal() 打开时进入 top layer，会盖住固定定位的自定义光标。
   * 打开期间恢复原生光标并隐藏组件，关闭后恢复（drama / alexent / possibilities 的截图查看器）。
   * 监听 open 属性即可同时覆盖 showModal()/close() 与直接写 open 属性的回退路径。
   */
  const syncDialogState = () => {
    dialogOpen = Boolean(document.querySelector('dialog[open]'));
    cursor.style.display = dialogOpen ? 'none' : '';
    if (config.hideDefaultCursor) {
      document.documentElement.classList.toggle('target-cursor-active', !dialogOpen);
      document.body.style.cursor = dialogOpen ? '' : 'none';
    }
  };

  if (config.hideDefaultCursor) {
    document.documentElement.classList.add('target-cursor-active');
    document.body.style.cursor = 'none';
  }

  const dialogObserver = new MutationObserver(mutations => {
    if (mutations.some(mutation => mutation.target instanceof HTMLDialogElement)) {
      syncDialogState();
    }
  });
  dialogObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['open'],
    subtree: true
  });
  syncDialogState();
}());

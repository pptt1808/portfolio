/*
 * ScrollStack — Vue Bits <ScrollStack /> 的 vanilla JS 移植（仅 window 滚动模式）。
 * 对带 data-scroll-stack 的容器做渐进增强：直接子级 .scroll-stack-card 在滚动中
 * 依次钉住并轻微缩小，形成层叠卡片，收敛“一图一句”板块的纵向留白。
 *
 * 与原版的差异：
 * 1. 不引入 lenis——变换完全由滚动位置驱动（scrub），原生滚动已足够平滑，
 *    也避免劫持滚轮与 GooeyNav 锁定、章节 hash 定位等既有逻辑冲突。
 * 2. 只有 useWindowScroll 模式：本站页面均为 window 滚动，内嵌滚动容器会
 *    破坏各页 scroll-spy 与章节偏移计算。
 * 3. prefers-reduced-motion 时整体跳过，卡片保持普通文档流。
 *
 * 可选 data 属性（缺省用本站调优的默认值）：
 *   data-scroll-stack-item-distance="110"       卡片间距（px）
 *   data-scroll-stack-item-scale="0.04"         每张卡片的缩放递进
 *   data-scroll-stack-item-stack-distance="26"  层叠时相邻卡片的纵向错位（px）
 *   data-scroll-stack-stack-position="20%"      开始钉住的视口位置
 *   data-scroll-stack-scale-end-position="10%"  缩放结束的视口位置
 *   data-scroll-stack-base-scale="0.92"         首张卡片的最终缩放
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const containers = [...document.querySelectorAll('[data-scroll-stack]')];
  if (!containers.length) return;

  const defaults = {
    itemDistance: 110,
    itemScale: 0.04,
    itemStackDistance: 26,
    stackPosition: '20%',
    scaleEndPosition: '10%',
    baseScale: 0.92
  };

  const calculateProgress = (scrollTop, start, end) => {
    if (scrollTop < start) return 0;
    if (scrollTop > end) return 1;
    return (scrollTop - start) / (end - start);
  };

  const parsePercentage = (value, containerHeight) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight;
    }
    return parseFloat(value);
  };

  /*
   * 与原版一致用 getBoundingClientRect 实时测量（含当前 transform）：
   * 渲染位置逐帧自校正，懒加载图片撑高卡片后也无需重算缓存。
   */
  const getElementOffset = element =>
    element.getBoundingClientRect().top + window.scrollY;

  const readConfig = element => {
    const dataset = element.dataset;
    const number = (key, fallback) => {
      const value = parseFloat(dataset[key]);
      return Number.isFinite(value) ? value : fallback;
    };
    return {
      itemDistance: number('scrollStackItemDistance', defaults.itemDistance),
      itemScale: number('scrollStackItemScale', defaults.itemScale),
      itemStackDistance: number('scrollStackItemStackDistance', defaults.itemStackDistance),
      stackPosition: dataset.scrollStackStackPosition || defaults.stackPosition,
      scaleEndPosition: dataset.scrollStackScaleEndPosition || defaults.scaleEndPosition,
      baseScale: number('scrollStackBaseScale', defaults.baseScale)
    };
  };

  const instances = containers.map(container => {
    const config = readConfig(container);
    /* 直接子元素即卡片（排除结束标记），HTML 侧无需逐个加 class */
    const cards = [...container.children].filter(
      child => !child.classList.contains('scroll-stack-end')
    );
    if (!cards.length) return null;

    cards.forEach((card, index) => {
      card.classList.add('scroll-stack-card');
      if (index < cards.length - 1) {
        card.style.marginBottom = `${config.itemDistance}px`;
      }
      card.style.willChange = 'transform';
      card.style.transformOrigin = 'top center';
    });

    let endMarker = container.querySelector(':scope > .scroll-stack-end');
    if (!endMarker) {
      endMarker = document.createElement('div');
      endMarker.className = 'scroll-stack-end';
      endMarker.setAttribute('aria-hidden', 'true');
      container.appendChild(endMarker);
    }
    container.classList.add('is-enhanced');

    return { cards, config, endMarker, lastTransforms: new Map() };
  }).filter(Boolean);

  if (!instances.length) return;

  const updateCardTransforms = () => {
    const scrollTop = window.scrollY;
    const containerHeight = window.innerHeight;

    instances.forEach(instance => {
      const { cards, config, endMarker, lastTransforms } = instance;
      const stackPositionPx = parsePercentage(config.stackPosition, containerHeight);
      const scaleEndPositionPx = parsePercentage(config.scaleEndPosition, containerHeight);
      const endElementTop = getElementOffset(endMarker);

      cards.forEach((card, i) => {
        const cardTop = getElementOffset(card);
        const triggerStart = cardTop - stackPositionPx - config.itemStackDistance * i;
        const triggerEnd = cardTop - scaleEndPositionPx;
        const pinStart = triggerStart;
        /*
         * 释放点比原版（endTop - 视口高/2）提前到堆叠末端到达视口底部：
         * 原版会让钉住的卡片悬停期间盖住随后滑入的正文（如“当前 AI 边界”），
         * 提前释放后后续内容到达时卡片恰好解除钉住，全程不遮罩、也不增加留白。
         * Math.max 钳制：超高视口 + 较矮卡片时钉住时长退化为 0，不出现负值位移。
         */
        const pinEnd = Math.max(pinStart, endElementTop - containerHeight);

        const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd);
        const targetScale = config.baseScale + i * config.itemScale;
        const scale = 1 - scaleProgress * (1 - targetScale);

        let translateY = 0;
        const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd;
        if (isPinned) {
          translateY = scrollTop - cardTop + stackPositionPx + config.itemStackDistance * i;
        } else if (scrollTop > pinEnd) {
          translateY = pinEnd - cardTop + stackPositionPx + config.itemStackDistance * i;
        }

        const newTransform = {
          translateY: Math.round(translateY * 100) / 100,
          scale: Math.round(scale * 1000) / 1000
        };
        const lastTransform = lastTransforms.get(i);
        const hasChanged = !lastTransform ||
          Math.abs(lastTransform.translateY - newTransform.translateY) > 0.1 ||
          Math.abs(lastTransform.scale - newTransform.scale) > 0.001;
        if (hasChanged) {
          card.style.transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale})`;
          lastTransforms.set(i, newTransform);
        }
      });
    });
  };

  let frame = 0;
  const scheduleUpdate = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      updateCardTransforms();
    });
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  window.addEventListener('load', scheduleUpdate);
  updateCardTransforms();
}());

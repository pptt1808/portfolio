/*
 * GooeyNav — Vue Bits <GooeyNav /> 组件的 vanilla JS 移植。
 * 不依赖框架；对带 data-gooey-nav 的 <nav> 做渐进增强：
 * 把直接子级 <a> 包进 ul > li > a（移动原节点，保留 href / aria / 既有 JS 引用），
 * 点击时播放粒子爆发，并用 aria-current="location" 同步各页面已有的滚动定位。
 * 分组导航（如 possibilities 章节条）用 data-gooey-nav-groups 指定分组容器：
 * 每组各包一个 ul，保留分组标签与分隔线，胶囊可跨组移动。
 *
 * Props 默认值与组件一致：animationTime 600、particleCount 15、
 * particleDistances [90, 10]、particleR 100、timeVariance 300、colors [1,2,3,1,2,3,1,4]。
 *
 * 与原版的两处差异（见 gooey-nav.css 开头注释）：
 * 粒子不用 blur+contrast 滤镜（保住主题色），效果层 fixed 置于吸顶导航之上。
 */
(function () {
  'use strict';

  const config = {
    animationTime: 600,
    particleCount: 15,
    particleDistances: [90, 10],
    particleR: 100,
    timeVariance: 300,
    colors: [1, 2, 3, 1, 2, 3, 1, 4]
  };

  /* 胶囊相对激活项的外扩量（视觉留白，不影响布局） */
  const PILL_INSET_X = 9;
  const PILL_INSET_Y = 3;

  const noise = (n = 1) => n / 2 - Math.random() * n;

  const getXY = (distance, pointIndex, totalPoints) => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };

  const createParticle = i => {
    const t = config.animationTime * 2 + noise(config.timeVariance * 2);
    const d = config.particleDistances;
    const r = config.particleR;
    const rotate = noise(r / 10);
    return {
      start: getXY(d[0], config.particleCount - i, config.particleCount),
      end: getXY(d[1] + noise(7), config.particleCount - i, config.particleCount),
      time: t,
      scale: 1 + noise(0.2),
      color: config.colors[Math.floor(Math.random() * config.colors.length)],
      rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10
    };
  };

  const navs = [...document.querySelectorAll('nav[data-gooey-nav]')];
  if (!navs.length) return;

  navs.forEach(setupNav);

  function setupNav(nav) {
    /*
     * 两种结构：nav > a（常规，包成一个 ul）；
     * 或 nav > 分组容器 > a（data-gooey-nav-groups 指定，每组包一个 ul）。
     * links / items 始终跨组拉平，保证激活索引与胶囊定位一致。
     */
    const groupSelector = nav.dataset.gooeyNavGroups;
    const containers = groupSelector ? [...nav.querySelectorAll(`:scope > ${groupSelector}`)] : [nav];

    const links = [];
    const items = [];
    containers.forEach(container => {
      const containerLinks = [...container.querySelectorAll(':scope > a')];
      if (!containerLinks.length) return;
      /* 包成 ul > li > a，保持原导航的 flex 布局（gap 用 inherit 继承） */
      const list = document.createElement('ul');
      list.className = 'gooey-nav__list';
      containerLinks.forEach(link => {
        const item = document.createElement('li');
        item.className = 'gooey-nav__item';
        item.appendChild(link);
        list.appendChild(item);
        links.push(link);
        items.push(item);
      });
      container.appendChild(list);
    });
    if (!links.length) return;
    nav.classList.add('gooey-nav');

    /*
     * 效果层挂在 body 下、用 position: fixed 定位：
     * 组件原版的容器内效果层会被 .case-chapters 这类 overflow-x: auto 的
     * 横向滚动导航在垂直方向裁剪，也容易被半透明吸顶导航盖住；
     * viewport 坐标还能天然兼容 sticky 定位。
     * 三层按顺序叠放：胶囊 → 粒子 → 激活项文字副本。
     */
    const pillEffect = document.createElement('span');
    pillEffect.className = 'gooey-effect pill';
    pillEffect.setAttribute('aria-hidden', 'true');
    pillEffect.hidden = true;
    const particlesEffect = document.createElement('span');
    particlesEffect.className = 'gooey-effect particles';
    particlesEffect.setAttribute('aria-hidden', 'true');
    particlesEffect.hidden = true;
    const textEffect = document.createElement('span');
    textEffect.className = 'gooey-effect text';
    textEffect.setAttribute('aria-hidden', 'true');
    textEffect.hidden = true;
    document.body.appendChild(pillEffect);
    document.body.appendChild(particlesEffect);
    document.body.appendChild(textEffect);

    let activeIndex = -1;

    /*
     * 点击锚点后的平滑滚动会途经中间章节，scroll-spy 会把它们逐个标成
     * aria-current，若直接跟随，胶囊会在目标与途经项之间反复横跳。
     * 点击后锁定目标项：spy 落到目标即解除；滚动停歇或兜底超时也解除。
     * 解除一律不同步胶囊位置——同步会把胶囊拽回滚动途中的章节（用户感知
     * 为"先跳回前一项"的横跳）；解锁后 spy 的后续变化会自然接管。
     */
    let lockedIndex = -1;
    let lockTimer = null;
    let lockGuardTimer = null;
    /* 锁定期间累计的用户滚轮量，区分 deliberate 接管与触控板惯性/误触 */
    let takeoverDelta = 0;

    const clearLock = () => {
      lockedIndex = -1;
      takeoverDelta = 0;
      if (lockTimer) {
        clearTimeout(lockTimer);
        lockTimer = null;
      }
      if (lockGuardTimer) {
        clearTimeout(lockGuardTimer);
        lockGuardTimer = null;
      }
    };

    const armLockTimers = () => {
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(clearLock, 320);
      if (!lockGuardTimer) {
        lockGuardTimer = setTimeout(clearLock, 3000);
      }
    };

    const makeParticles = element => {
      for (let i = 0; i < config.particleCount; i++) {
        const p = createParticle(i);
        setTimeout(() => {
          const particle = document.createElement('span');
          const point = document.createElement('span');
          particle.classList.add('gooey-particle');
          particle.style.setProperty('--start-x', `${p.start[0]}px`);
          particle.style.setProperty('--start-y', `${p.start[1]}px`);
          particle.style.setProperty('--end-x', `${p.end[0]}px`);
          particle.style.setProperty('--end-y', `${p.end[1]}px`);
          particle.style.setProperty('--time', `${p.time}ms`);
          particle.style.setProperty('--scale', `${p.scale}`);
          particle.style.setProperty('--color', `var(--gooey-color-${p.color}, var(--gooey-color-1))`);
          particle.style.setProperty('--rotate', `${p.rotate}deg`);
          point.classList.add('gooey-point');
          particle.appendChild(point);
          element.appendChild(particle);
          setTimeout(() => {
            try {
              element.removeChild(particle);
            } catch (error) {
              /* 粒子可能已被清理 */
            }
          }, p.time + 30);
        }, 30);
      }
    };

    const copyTextStyle = link => {
      const styles = getComputedStyle(link);
      textEffect.style.fontFamily = styles.fontFamily;
      textEffect.style.fontSize = styles.fontSize;
      textEffect.style.fontWeight = styles.fontWeight;
      textEffect.style.fontStyle = styles.fontStyle;
      textEffect.style.letterSpacing = styles.letterSpacing;
      textEffect.style.textTransform = styles.textTransform;
    };

    const updateEffectPosition = item => {
      const rect = item.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const styles = {
        left: `${rect.left - PILL_INSET_X}px`,
        top: `${rect.top + PILL_INSET_Y}px`,
        width: `${rect.width + PILL_INSET_X * 2}px`,
        height: `${rect.height - PILL_INSET_Y * 2}px`
      };
      Object.assign(pillEffect.style, styles);
      Object.assign(particlesEffect.style, styles);
      Object.assign(textEffect.style, styles);
      const link = item.querySelector('a');
      if (link) {
        textEffect.textContent = link.textContent || '';
        copyTextStyle(link);
      }
    };

    const setActive = (index, { burst = false } = {}) => {
      const changed = index !== activeIndex;
      activeIndex = index;
      items.forEach((item, i) => item.classList.toggle('active', i === activeIndex));

      if (activeIndex < 0) {
        pillEffect.hidden = true;
        particlesEffect.hidden = true;
        textEffect.hidden = true;
        return;
      }

      pillEffect.hidden = false;
      particlesEffect.hidden = false;
      textEffect.hidden = false;
      updateEffectPosition(items[activeIndex]);
      pillEffect.classList.add('active');

      if (burst && changed) {
        particlesEffect.querySelectorAll('.gooey-particle').forEach(particle => {
          particlesEffect.removeChild(particle);
        });
        /* 重新触发胶囊的弹出动画 */
        pillEffect.classList.remove('active');
        void pillEffect.offsetWidth;
        pillEffect.classList.add('active');
        makeParticles(particlesEffect);
      }
    };

    const findCurrentIndex = () =>
      links.findIndex(link => link.getAttribute('aria-current') === 'location');

    /* 点击：切换激活项 + 粒子爆发；不拦截默认行为，链接照常跳转 */
    links.forEach((link, index) => {
      link.addEventListener('click', () => {
        if (activeIndex === index) return;
        setActive(index, { burst: true });
        /* 页内锚点才需要锁定（外部链接 / mailto 不会触发 scroll-spy） */
        if ((link.getAttribute('href') || '').startsWith('#')) {
          lockedIndex = index;
          takeoverDelta = 0;
          armLockTimers();
        }
      });
      link.addEventListener('keydown', event => {
        if (event.key === ' ') {
          event.preventDefault();
          link.click();
        }
      });
    });

    /*
     * 用户主动滚动视为接管：解除锁定，胶囊随 spy 自然跟随（不同步、不跳回）。
     * 触控板惯性或误触产生的零散 wheel 不算接管——累计滚动量超过阈值才解锁，
     * 否则平滑滚动途中一次轻碰就会解锁，胶囊被拽回途经章节。
     */
    window.addEventListener('wheel', event => {
      if (lockedIndex < 0) return;
      takeoverDelta += Math.abs(event.deltaY || 0);
      if (takeoverDelta >= 80) clearLock();
    }, { passive: true });
    /* 触屏拖动一定是明确接管（无惯性噪声），立即解锁 */
    window.addEventListener('touchmove', () => {
      if (lockedIndex >= 0) clearLock();
    }, { passive: true });

    /* 锁定期间滚动仍在继续就顺延，滚动停歇 320ms 后解除锁定 */
    window.addEventListener('scroll', () => {
      if (lockedIndex >= 0) armLockTimers();
    }, { capture: true, passive: true });

    /* 各页面 scroll-spy 通过 aria-current 标记当前章节，观察属性变化并跟随（无粒子） */
    const currentObserver = new MutationObserver(() => {
      const index = findCurrentIndex();
      if (lockedIndex >= 0) {
        /* 锁定中：spy 到达点击目标才解除，途经章节一律忽略 */
        if (index === lockedIndex) clearLock();
        else return;
      }
      if (index !== activeIndex) setActive(index);
      else if (index >= 0) updateEffectPosition(items[index]);
    });
    currentObserver.observe(nav, {
      attributes: true,
      attributeFilter: ['aria-current'],
      subtree: true
    });

    /* sticky / 横向滚动 / 字体加载导致的位移，统一重定位 */
    let frame = 0;
    const schedulePosition = () => {
      if (frame || activeIndex < 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateEffectPosition(items[activeIndex]);
      });
    };
    window.addEventListener('scroll', schedulePosition, { capture: true, passive: true });
    window.addEventListener('resize', schedulePosition);

    const resizeObserver = new ResizeObserver(schedulePosition);
    resizeObserver.observe(nav);
    items.forEach(item => resizeObserver.observe(item));

    /* 初始激活项：页面已有 aria-current 则跟随，否则等首次交互再显示 */
    setActive(findCurrentIndex());
  }
}());

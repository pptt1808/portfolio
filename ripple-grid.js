/*
 * RippleGrid — Vue Bits <RippleGrid /> 的 vanilla JS 移植（citywalk 页 hero 标题区背景）。
 * 对带 data-ripple-grid 的容器做渐进增强：注入 <canvas class="ripple-grid"> 作背景层。
 *
 * 与原版的差异（勿改回）：
 * 1. 不引入 ogl——组件只用一个全屏三角形 + 一个 shader program，
 *    原生 WebGL 实现即可，站点保持零依赖。
 * 2. 固定 enableRainbow=false，网格色用页面主题陶土 #a84626——
 *    浅色纸面上彩虹/荧光绿与主题不统一；canvas 透明合成叠加纸面，
 *    勿改回彩虹 / 黑底实色输出。
 * 3. canvas pointer-events:none（背景层），鼠标交互监听挂在容器上
 *    （事件自内容冒泡），与 TargetCursor 无冲突。
 * 4. IntersectionObserver 离屏暂停渲染；prefers-reduced-motion 整体跳过。
 *    shader 为单 pass 网格计算，开销低，无需降采样；dpr 上限 1.5。
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [...document.querySelectorAll('[data-ripple-grid]')];
  if (!targets.length) return;

  /* 本站调优参数（组件默认值见 Vue Bits 文档） */
  const config = {
    gridColor: '#a84626',      /* citywalk 主题陶土，勿用高饱和亮色 */
    rippleIntensity: 0.02,     /* 中心涟漪强度（压低，动画更安静） */
    gridSize: 10,              /* 网格密度 */
    gridThickness: 15,         /* 网格线粗细 */
    fadeDistance: 1.5,         /* 中心淡出距离 */
    vignetteStrength: 2,       /* 边缘渐隐强度（兼作边缘软化，无需额外 edgeFade） */
    glowIntensity: 0.05,       /* 网格线辉光（压低，避免抢文字） */
    opacity: 0.4,              /* 整体透明度（压低，保证标题可读性） */
    timeScale: 0.5,            /* 动画速度倍率（0=冻结，1=原速） */
    gridRotation: 0,           /* 整体旋转角度 */
    mouseInteraction: true,
    mouseInteractionRadius: 1.2,
    dpr: Math.min(window.devicePixelRatio || 1, 1.5)
  };

  const vertexShader = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform vec3  gridColor;
uniform float rippleIntensity;
uniform float gridSize;
uniform float gridThickness;
uniform float fadeDistance;
uniform float vignetteStrength;
uniform float glowIntensity;
uniform float opacity;
uniform float gridRotation;
uniform float mouseInteraction;
uniform vec2  mousePosition;
uniform float mouseInfluence;
uniform float mouseInteractionRadius;

varying vec2 vUv;

float pi = 3.141592;

mat2 rotate(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  if (gridRotation != 0.0) {
    uv = rotate(gridRotation * pi / 180.0) * uv;
  }

  float dist = length(uv);
  float func = sin(pi * (iTime - dist));
  vec2 rippleUv = uv + uv * func * rippleIntensity;

  if (mouseInteraction > 0.5 && mouseInfluence > 0.0) {
    vec2 mouseUv = mousePosition * 2.0 - 1.0;
    mouseUv.x *= iResolution.x / iResolution.y;
    vec2 toMouse = uv - mouseUv;
    float mouseDist = length(toMouse);
    float influence = mouseInfluence * exp(-mouseDist * mouseDist / (mouseInteractionRadius * mouseInteractionRadius));
    float mouseWave = sin(pi * (iTime * 2.0 - mouseDist * 3.0)) * influence;
    rippleUv += normalize(toMouse) * mouseWave * rippleIntensity * 0.3;
  }

  vec2 a = sin(gridSize * 0.5 * pi * rippleUv - pi / 2.0);
  vec2 b = abs(a);

  float aaWidth = 0.5;
  vec2 smoothB = vec2(
    smoothstep(0.0, aaWidth, b.x),
    smoothstep(0.0, aaWidth, b.y)
  );

  vec3 color = vec3(0.0);
  color += exp(-gridThickness * smoothB.x * (0.8 + 0.5 * sin(pi * iTime)));
  color += exp(-gridThickness * smoothB.y);
  color += 0.5 * exp(-(gridThickness / 4.0) * sin(smoothB.x));
  color += 0.5 * exp(-(gridThickness / 3.0) * smoothB.y);

  if (glowIntensity > 0.0) {
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.x);
    color += glowIntensity * exp(-gridThickness * 0.5 * smoothB.y);
  }

  float ddd = exp(-2.0 * clamp(pow(dist, fadeDistance), 0.0, 1.0));

  vec2 vignetteCoords = vUv - 0.5;
  float vignetteDistance = length(vignetteCoords);
  float vignette = clamp(1.0 - pow(vignetteDistance * 2.0, vignetteStrength), 0.0, 1.0);

  vec3 t = gridColor;

  float finalFade = ddd * vignette;
  float alpha = length(color) * finalFade * opacity;
  gl_FragColor = vec4(color * t * finalFade * opacity, alpha);
}
`;

  const hexToRgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  targets.forEach(setup);

  function setup(container) {
    const canvas = document.createElement('canvas');
    canvas.className = 'ripple-grid';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!gl) return;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, vertexShader);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    /* 全屏三角形（ogl Triangle 等价）：3 个顶点覆盖整个裁剪空间 */
    const location = gl.getAttribLocation(program, 'position');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

    const uniform = {};
    [
      'iTime', 'iResolution', 'gridColor', 'rippleIntensity', 'gridSize', 'gridThickness',
      'fadeDistance', 'vignetteStrength', 'glowIntensity', 'opacity', 'gridRotation',
      'mouseInteraction', 'mousePosition', 'mouseInfluence', 'mouseInteractionRadius'
    ].forEach(name => {
      uniform[name] = gl.getUniformLocation(program, name);
    });

    gl.uniform3f(uniform.gridColor, ...hexToRgb(config.gridColor));
    gl.uniform1f(uniform.rippleIntensity, config.rippleIntensity);
    gl.uniform1f(uniform.gridSize, config.gridSize);
    gl.uniform1f(uniform.gridThickness, config.gridThickness);
    gl.uniform1f(uniform.fadeDistance, config.fadeDistance);
    gl.uniform1f(uniform.vignetteStrength, config.vignetteStrength);
    gl.uniform1f(uniform.glowIntensity, config.glowIntensity);
    gl.uniform1f(uniform.opacity, config.opacity);
    gl.uniform1f(uniform.gridRotation, config.gridRotation);
    gl.uniform1f(uniform.mouseInteraction, config.mouseInteraction ? 1 : 0);
    gl.uniform1f(uniform.mouseInteractionRadius, config.mouseInteractionRadius);
    gl.uniform1f(uniform.mouseInfluence, 0);
    gl.uniform2f(uniform.mousePosition, 0.5, 0.5);

    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);

    const resize = () => {
      const width = Math.max(1, Math.round(container.offsetWidth * config.dpr));
      const height = Math.max(1, Math.round(container.offsetHeight * config.dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniform.iResolution, width, height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    /* 鼠标交互：canvas 是 pointer-events:none 背景层，监听挂容器（事件自内容冒泡） */
    const mouse = { x: 0.5, y: 0.5 };
    const targetMouse = { x: 0.5, y: 0.5 };
    let influence = 0;
    let targetInfluence = 0;
    if (config.mouseInteraction) {
      container.addEventListener('mousemove', event => {
        const rect = container.getBoundingClientRect();
        targetMouse.x = (event.clientX - rect.left) / rect.width;
        targetMouse.y = 1 - (event.clientY - rect.top) / rect.height;
      }, { passive: true });
      container.addEventListener('mouseenter', () => { targetInfluence = 1; });
      container.addEventListener('mouseleave', () => { targetInfluence = 0; });
    }

    let visible = true;

    const render = now => {
      requestAnimationFrame(render);
      if (!visible) return;

      gl.uniform1f(uniform.iTime, now * 0.001 * config.timeScale);

      mouse.x += (targetMouse.x - mouse.x) * 0.1;
      mouse.y += (targetMouse.y - mouse.y) * 0.1;
      influence += (targetInfluence - influence) * 0.05;
      gl.uniform2f(uniform.mousePosition, mouse.x, mouse.y);
      gl.uniform1f(uniform.mouseInfluence, influence);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    requestAnimationFrame(render);

    const visibilityObserver = new IntersectionObserver(entries => {
      visible = !entries.length || entries[0].isIntersecting;
    });
    visibilityObserver.observe(container);
  }
}());

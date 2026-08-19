/*
 * Prism — Vue Bits <Prism /> 的 vanilla JS 移植（drama 页 hero 标题区背景）。
 * 对带 data-prism 的容器做渐进增强：注入 <canvas class="prism-canvas"> 作背景层。
 *
 * 与原版的差异（勿改回）：
 * 1. 不引入 ogl——组件只用一个全屏三角形 + 一个 shader program，
 *    原生 WebGL 实现即可，站点保持零依赖。
 * 2. 颜色改主题三色调色板（绿 #1f5c4b / 粘土 #d66c4c / 芥末黄 #d9b957，
 *    即 GooeyNav 粒子色）：原版彩虹相位色在浅色纸面上风格不统一。
 *    三个 sin 通道分别映射到三个主题色，canvas 透明合成叠加纸面，
 *    勿改回彩虹色 / 黑底实色输出。
 * 3. 只保留 rotate 模式（底座 wobble 缓慢漂移）——hero 背景要安静，
 *    hover 倾斜 / 3drotate 不自转模式不接。
 * 4. 100 步 raymarch 比 FaultyTerminal 重：renderScale 降采样渲染
 *    （发光效果经 CSS 放大无损观感）+ dpr 上限 1.5。
 * 5. IntersectionObserver 离屏暂停渲染；prefers-reduced-motion 整体跳过。
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [...document.querySelectorAll('[data-prism]')];
  if (!targets.length) return;

  /* 本站调优参数（组件默认值见 Vue Bits 文档） */
  const config = {
    height: 3.5,          /* 棱镜锥高（世界单位） */
    baseWidth: 5.5,       /* 底面宽（世界单位） */
    scale: 3.6,           /* 屏幕空间整体缩放 */
    glow: 1,              /* 发光强度 */
    bloom: 1,             /* 额外泛光 */
    colorFrequency: 1,    /* 色带频率 */
    timeScale: 0.5,       /* 全局动画速度（0=冻结） */
    noise: 0.12,          /* 胶片颗粒（原版 0.5 在纸面上太脏） */
    offset: { x: 0, y: 0 },
    /* 主题三色调色板：勿用高饱和亮色 */
    colorA: '#1f5c4b',    /* 主题绿 */
    colorB: '#d66c4c',    /* 粘土 */
    colorC: '#d9b957',    /* 芥末黄 */
    alpha: 0.9,           /* 整体不透明度上限 */
    edgeFade: 0.16,       /* 边缘淡化宽度（占各轴比例，0~0.5） */
    renderScale: 0.66,    /* 降采样比例：100 步 raymarch 全分辨率太贵 */
    dpr: Math.min(window.devicePixelRatio || 1, 1.5)
  };

  const vertexShader = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const fragmentShader = `
precision highp float;

uniform vec2  iResolution;
uniform float iTime;

uniform float uHeight;
uniform float uBaseHalf;
uniform float uGlow;
uniform vec2  uOffsetPx;
uniform float uNoise;
uniform float uColorFreq;
uniform float uBloom;
uniform float uCenterShift;
uniform float uInvBaseHalf;
uniform float uInvHeight;
uniform float uMinAxis;
uniform float uPxScale;
uniform float uTimeScale;
uniform vec3  uColA;
uniform vec3  uColB;
uniform vec3  uColC;
uniform float uAlpha;
uniform float uEdgeFade;

vec4 tanh4(vec4 x){
  vec4 e2x = exp(2.0 * x);
  return (e2x - 1.0) / (e2x + 1.0);
}

float rand(vec2 co){
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
}

float sdOctaAnisoInv(vec3 p){
  vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);
  float m = q.x + q.y + q.z - 1.0;
  return m * uMinAxis * 0.5773502691896258;
}

float sdPyramidUpInv(vec3 p){
  return max(sdOctaAnisoInv(p), -p.y);
}

void main(){
  vec2 f = (gl_FragCoord.xy - 0.5 * iResolution.xy - uOffsetPx) * uPxScale;

  float z = 5.0;
  float d = 0.0;
  vec3 p;
  vec4 o = vec4(0.0);
  float cf = uColorFreq;

  float t = iTime * uTimeScale;
  mat2 wob = mat2(cos(t), cos(t + 33.0), cos(t + 11.0), cos(t));

  const int STEPS = 100;
  for (int i = 0; i < STEPS; i++) {
    p = vec3(f, z);
    p.xz = p.xz * wob;
    vec3 q = p;
    q.y += uCenterShift;
    d = 0.1 + 0.2 * abs(sdPyramidUpInv(q));
    z -= d;
    o += (sin((p.y + z) * cf + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0) / d;
  }

  o = tanh4(o * o * (uGlow * uBloom) / 1e5);

  /* 主题调色板映射：三个 sin 通道 → 绿 / 粘土 / 芥末黄 */
  vec3 col = clamp(o.r * uColA + o.g * uColB + o.b * uColC, 0.0, 1.0);
  float alpha = clamp(o.a * uAlpha, 0.0, 1.0);

  float n = rand(gl_FragCoord.xy + vec2(iTime));
  col = clamp(col + (n - 0.5) * uNoise, 0.0, 1.0);

  /* 边缘淡化：靠近容器边缘逐渐透明，避免与区块边界硬切 */
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float ex = smoothstep(0.0, uEdgeFade, uv.x) * smoothstep(0.0, uEdgeFade, 1.0 - uv.x);
  float ey = smoothstep(0.0, uEdgeFade, uv.y) * smoothstep(0.0, uEdgeFade, 1.0 - uv.y);
  alpha *= ex * ey;

  gl_FragColor = vec4(col, alpha);
}
`;

  const hexToRgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  targets.forEach(setup);

  function setup(container) {
    const canvas = document.createElement('canvas');
    canvas.className = 'prism-canvas';
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
      'iResolution', 'iTime', 'uHeight', 'uBaseHalf', 'uGlow', 'uOffsetPx', 'uNoise',
      'uColorFreq', 'uBloom', 'uCenterShift', 'uInvBaseHalf', 'uInvHeight', 'uMinAxis',
      'uPxScale', 'uTimeScale', 'uColA', 'uColB', 'uColC', 'uAlpha', 'uEdgeFade'
    ].forEach(name => {
      uniform[name] = gl.getUniformLocation(program, name);
    });

    const H = Math.max(0.001, config.height);
    const BASE_HALF = Math.max(0.001, config.baseWidth) * 0.5;
    gl.uniform1f(uniform.uHeight, H);
    gl.uniform1f(uniform.uBaseHalf, BASE_HALF);
    gl.uniform1f(uniform.uGlow, Math.max(0, config.glow));
    gl.uniform1f(uniform.uNoise, Math.max(0, config.noise));
    gl.uniform1f(uniform.uColorFreq, Math.max(0, config.colorFrequency));
    gl.uniform1f(uniform.uBloom, Math.max(0, config.bloom));
    gl.uniform1f(uniform.uCenterShift, H * 0.25);
    gl.uniform1f(uniform.uInvBaseHalf, 1 / BASE_HALF);
    gl.uniform1f(uniform.uInvHeight, 1 / H);
    gl.uniform1f(uniform.uMinAxis, Math.min(BASE_HALF, H));
    gl.uniform1f(uniform.uTimeScale, Math.max(0, config.timeScale));
    gl.uniform3f(uniform.uColA, ...hexToRgb(config.colorA));
    gl.uniform3f(uniform.uColB, ...hexToRgb(config.colorB));
    gl.uniform3f(uniform.uColC, ...hexToRgb(config.colorC));
    gl.uniform1f(uniform.uAlpha, config.alpha);
    gl.uniform1f(uniform.uEdgeFade, config.edgeFade);

    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);

    const resize = () => {
      const px = config.dpr * config.renderScale;
      const width = Math.max(1, Math.round(container.offsetWidth * px));
      const height = Math.max(1, Math.round(container.offsetHeight * px));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform2f(uniform.iResolution, width, height);
      gl.uniform2f(uniform.uOffsetPx, config.offset.x * px, config.offset.y * px);
      gl.uniform1f(uniform.uPxScale, 1 / (height * 0.1 * Math.max(0.001, config.scale)));
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let visible = true;
    const timeOffset = Math.random() * 100;

    const render = now => {
      requestAnimationFrame(render);
      if (!visible) return;
      gl.uniform1f(uniform.iTime, now * 0.001 + timeOffset);
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

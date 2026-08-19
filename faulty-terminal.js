/*
 * FaultyTerminal — Vue Bits <FaultyTerminal /> 的 vanilla JS 移植（背景特效）。
 * 对带 data-faulty-terminal 的容器做渐进增强：注入全幅 <canvas> 作背景层。
 *
 * 与原版的差异（勿改回）：
 * 1. 不引入 ogl——组件只用一个全屏三角形 + 一个 shader program，
 *    原生 WebGL 实现即可，站点保持零依赖。
 * 2. 片元输出改 vec4(tint, 强度)（canvas 透明合成）——原版黑底白字会毁掉
 *    浅色纸面主题；透明底 + 主题色 tint 让特效融进背景。
 * 3. IntersectionObserver 离屏暂停渲染；prefers-reduced-motion 整体跳过。
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [...document.querySelectorAll('[data-faulty-terminal]')];
  if (!targets.length) return;

  /* 本站调优参数（组件默认值见 Vue Bits 文档） */
  const config = {
    scale: 1.5,
    gridMul: [2, 1],
    digitSize: 1.2,
    timeScale: 0.35,
    scanlineIntensity: 0.35,
    glitchAmount: 1,
    flickerAmount: 1,
    noiseAmp: 1,
    tint: '#17665f',        /* 主题 teal，勿用高饱和色 */
    mouseReact: true,
    mouseStrength: 0.25,
    pageLoadAnimation: true,
    brightness: 0.5,
    /* 边缘淡化宽度（占各轴比例，0~0.5）：靠近边缘逐渐透明，避免与章节条硬切 */
    edgeFade: 0.14,
    /* 片元每像素约 10 次 digit() 采样，dpr 上限 1.5 防止大画布拖垮弱 GPU */
    dpr: Math.min(window.devicePixelRatio || 1, 1.5)
  };

  const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const fragmentShader = `
precision mediump float;

varying vec2 vUv;

uniform float iTime;
uniform vec3  iResolution;
uniform float uScale;

uniform vec2  uGridMul;
uniform float uDigitSize;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3  uTint;
uniform vec2  uMouse;
uniform float uMouseStrength;
uniform float uUseMouse;
uniform float uPageLoadProgress;
uniform float uUsePageLoadAnimation;
uniform float uBrightness;
uniform float uEdgeFade;

float time;

float hash21(vec2 p){
  p = fract(p * 234.56);
  p += dot(p, p + 34.56);
  return fract(p.x * p.y);
}

float noise(vec2 p)
{
  return sin(p.x * 10.0) * sin(p.y * (3.0 + sin(time * 0.090909))) + 0.2;
}

mat2 rotate(float angle)
{
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float fbm(vec2 p)
{
  p *= 1.1;
  float f = 0.0;
  float amp = 0.5 * uNoiseAmp;

  mat2 modify0 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify0 * p * 2.0;
  amp *= 0.454545;

  mat2 modify1 = rotate(time * 0.02);
  f += amp * noise(p);
  p = modify1 * p * 2.0;
  amp *= 0.454545;

  mat2 modify2 = rotate(time * 0.08);
  f += amp * noise(p);

  return f;
}

float pattern(vec2 p, out vec2 q, out vec2 r) {
  vec2 offset1 = vec2(1.0);
  vec2 offset0 = vec2(0.0);
  mat2 rot01 = rotate(0.1 * time);
  mat2 rot1 = rotate(0.1);

  q = vec2(fbm(p + offset1), fbm(rot01 * p + offset1));
  r = vec2(fbm(rot1 * q + offset0), fbm(q + offset0));
  return fbm(p + r);
}

float digit(vec2 p){
    vec2 grid = uGridMul * 15.0;
    vec2 s = floor(p * grid) / grid;
    p = p * grid;
    vec2 q, r;
    float intensity = pattern(s * 0.1, q, r) * 1.3 - 0.03;

    if(uUseMouse > 0.5){
        vec2 mouseWorld = uMouse * uScale;
        float distToMouse = distance(s, mouseWorld);
        float mouseInfluence = exp(-distToMouse * 8.0) * uMouseStrength * 10.0;
        intensity += mouseInfluence;

        float ripple = sin(distToMouse * 20.0 - iTime * 5.0) * 0.1 * mouseInfluence;
        intensity += ripple;
    }

    if(uUsePageLoadAnimation > 0.5){
        float cellRandom = fract(sin(dot(s, vec2(12.9898, 78.233))) * 43758.5453);
        float cellDelay = cellRandom * 0.8;
        float cellProgress = clamp((uPageLoadProgress - cellDelay) / 0.2, 0.0, 1.0);

        float fadeAlpha = smoothstep(0.0, 1.0, cellProgress);
        intensity *= fadeAlpha;
    }

    p = fract(p);
    p *= uDigitSize;

    float px5 = p.x * 5.0;
    float py5 = (1.0 - p.y) * 5.0;
    float x = fract(px5);
    float y = fract(py5);

    float i = floor(py5) - 2.0;
    float j = floor(px5) - 2.0;
    float n = i * i + j * j;
    float f = n * 0.0625;

    float isOn = step(0.1, intensity - f);
    float brightness = isOn * (0.2 + y * 0.8) * (0.75 + x * 0.25);

    return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0) * brightness;
}

float onOff(float a, float b, float c)
{
  return step(c, sin(iTime + a * cos(iTime * b))) * uFlickerAmount;
}

float displace(vec2 look)
{
    float y = look.y - mod(iTime * 0.25, 1.0);
    float window = 1.0 / (1.0 + 50.0 * y * y);
    return sin(look.y * 20.0 + iTime) * 0.0125 * onOff(4.0, 2.0, 0.8) * (1.0 + cos(iTime * 60.0)) * window;
}

vec3 getColor(vec2 p){

    float bar = step(mod(p.y + time * 20.0, 1.0), 0.2) * 0.4 + 1.0;
    bar *= uScanlineIntensity;

    float displacement = displace(p);
    p.x += displacement;

    if (uGlitchAmount != 1.0) {
      float extra = displacement * (uGlitchAmount - 1.0);
      p.x += extra;
    }

    float middle = digit(p);

    const float off = 0.002;
    float sum = digit(p + vec2(-off, -off)) + digit(p + vec2(0.0, -off)) + digit(p + vec2(off, -off)) +
                digit(p + vec2(-off, 0.0)) + digit(p + vec2(0.0, 0.0)) + digit(p + vec2(off, 0.0)) +
                digit(p + vec2(-off, off)) + digit(p + vec2(0.0, off)) + digit(p + vec2(off, off));

    vec3 baseColor = vec3(0.9) * middle + sum * 0.1 * vec3(1.0) * bar;
    return baseColor;
}

vec2 barrel(vec2 uv){
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + uCurvature * r2;
  return c * 0.5 + 0.5;
}

void main() {
    time = iTime * 0.333333;
    vec2 uv = vUv;

    if(uCurvature != 0.0){
      uv = barrel(uv);
    }

    vec2 p = uv * uScale;
    vec3 col = getColor(p);

    if(uChromaticAberration != 0.0){
      vec2 ca = vec2(uChromaticAberration) / iResolution.xy;
      col.r = getColor(p + ca).r;
      col.b = getColor(p - ca).b;
    }

    col *= uBrightness;

    if(uDither > 0.0){
      float rnd = hash21(gl_FragCoord.xy);
      col += (rnd - 0.5) * (uDither * 0.003922);
    }

    /* 边缘淡化：到容器各边的距离（0~0.5）做 smoothstep 衰减，两侧相乘四角自然过渡 */
    vec2 edgeDistance = min(vUv, 1.0 - vUv);
    float edgeFade = smoothstep(0.0, uEdgeFade, edgeDistance.x)
                   * smoothstep(0.0, uEdgeFade, edgeDistance.y);

    /* 本站适配：透明合成输出——颜色固定为 tint，着色强度作 alpha，融入纸面背景 */
    gl_FragColor = vec4(uTint, clamp(col.r, 0.0, 1.0) * edgeFade);
}
`;

  const hexToRgb = hex => {
    let h = hex.replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const num = parseInt(h, 16);
    return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
  };

  targets.forEach(setup);

  function setup(container) {
    const canvas = document.createElement('canvas');
    canvas.className = 'faulty-terminal';
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
    const bindAttrib = (name, data) => {
      const location = gl.getAttribLocation(program, name);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    };
    bindAttrib('position', new Float32Array([-1, -1, 3, -1, -1, 3]));
    bindAttrib('uv', new Float32Array([0, 0, 2, 0, 0, 2]));

    const uniform = {};
    [
      'iTime', 'iResolution', 'uScale', 'uGridMul', 'uDigitSize', 'uScanlineIntensity',
      'uGlitchAmount', 'uFlickerAmount', 'uNoiseAmp', 'uChromaticAberration', 'uDither',
      'uCurvature', 'uTint', 'uMouse', 'uMouseStrength', 'uUseMouse', 'uEdgeFade',
      'uPageLoadProgress', 'uUsePageLoadAnimation', 'uBrightness'
    ].forEach(name => {
      uniform[name] = gl.getUniformLocation(program, name);
    });

    const [tintR, tintG, tintB] = hexToRgb(config.tint);
    gl.uniform1f(uniform.uScale, config.scale);
    gl.uniform2f(uniform.uGridMul, config.gridMul[0], config.gridMul[1]);
    gl.uniform1f(uniform.uDigitSize, config.digitSize);
    gl.uniform1f(uniform.uScanlineIntensity, config.scanlineIntensity);
    gl.uniform1f(uniform.uGlitchAmount, config.glitchAmount);
    gl.uniform1f(uniform.uFlickerAmount, config.flickerAmount);
    gl.uniform1f(uniform.uNoiseAmp, config.noiseAmp);
    gl.uniform1f(uniform.uChromaticAberration, 0);
    gl.uniform1f(uniform.uDither, 0);
    gl.uniform1f(uniform.uCurvature, 0);
    gl.uniform3f(uniform.uTint, tintR, tintG, tintB);
    gl.uniform1f(uniform.uMouseStrength, config.mouseStrength);
    gl.uniform1f(uniform.uUseMouse, config.mouseReact ? 1 : 0);
    gl.uniform1f(uniform.uUsePageLoadAnimation, config.pageLoadAnimation ? 1 : 0);
    gl.uniform1f(uniform.uPageLoadProgress, config.pageLoadAnimation ? 0 : 1);
    gl.uniform1f(uniform.uBrightness, config.brightness);
    gl.uniform1f(uniform.uEdgeFade, config.edgeFade);

    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);

    const resize = () => {
      const dpr = config.dpr;
      const width = Math.max(1, Math.round(container.offsetWidth * dpr));
      const height = Math.max(1, Math.round(container.offsetHeight * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform3f(uniform.iResolution, width, height, width / height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const mouse = { x: 0.5, y: 0.5 };
    const smoothMouse = { x: 0.5, y: 0.5 };
    if (config.mouseReact) {
      container.addEventListener('mousemove', event => {
        const rect = container.getBoundingClientRect();
        mouse.x = (event.clientX - rect.left) / rect.width;
        mouse.y = 1 - (event.clientY - rect.top) / rect.height;
      }, { passive: true });
    }

    let visible = true;
    let loadStart = 0;
    const timeOffset = Math.random() * 100;

    const render = now => {
      requestAnimationFrame(render);
      if (!visible) return;

      if (config.pageLoadAnimation && loadStart === 0) loadStart = now;
      gl.uniform1f(uniform.iTime, (now * 0.001 + timeOffset) * config.timeScale);
      if (config.pageLoadAnimation) {
        gl.uniform1f(uniform.uPageLoadProgress, Math.min((now - loadStart) / 2000, 1));
      }

      smoothMouse.x += (mouse.x - smoothMouse.x) * 0.08;
      smoothMouse.y += (mouse.y - smoothMouse.y) * 0.08;
      gl.uniform2f(uniform.uMouse, smoothMouse.x, smoothMouse.y);

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

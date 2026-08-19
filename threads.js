/*
 * Threads — Vue Bits <Threads /> 组件的 vanilla JS 移植（alexent 页 hero 标题区背景）。
 * 对带 data-threads 的容器做渐进增强：注入 <canvas class="threads-canvas"> 作背景层。
 *
 * 与原版的差异（勿改回）：
 * 1. 不引入 ogl——组件只用一个全屏三角形 + 一个 shader program，
 *    原生 WebGL 实现即可，站点保持零依赖。
 * 2. 线条色用 alexent 主题绿 #1d5a4b（原版默认白色在浅色纸面上不可见）；
 *    canvas 透明 alpha 合成叠加纸面，勿改回黑底实色输出。
 * 3. canvas pointer-events:none（背景层），鼠标交互监听挂在容器上
 *    （事件自内容冒泡），与 TargetCursor 无冲突。
 * 4. IntersectionObserver 离屏暂停渲染；prefers-reduced-motion 整体跳过。
 *    shader 为单 pass 线条计算（40 线 + 2D Perlin），开销低，无需降采样；dpr 上限 1.5。
 *
 * 可选 data 属性（缺省用 config 值）：data-threads-color / data-threads-amplitude /
 * data-threads-distance / data-threads-mouse（"0" 关闭鼠标交互）。
 */
(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = [...document.querySelectorAll('[data-threads]')];
  if (!targets.length) return;

  /* 本站调优参数（组件默认值见 Vue Bits 文档） */
  const config = {
    color: '#1d5a4b',        /* alexent 主题绿，勿用高饱和亮色 */
    amplitude: 1,            /* 波浪强度 */
    /* 线条束形态（替代原版 distance 平移）：
       原版 distance 只把线条垂直平移/拉开，在 alexent 这种高容器里会变成
       近似平行的横线；这里改成"左端汇聚 + 向右扇形展开"：所有线条在
       st.x=0（容器左边缘）汇聚到 centerY 一点，向右按线条序号逐渐散开，
       两端贴合边缘，中间带波浪起伏。 */
    centerY: 0.2,            /* 汇聚点垂直位置（0~1，容器顶部方向） */
    spread: 0.18,            /* 从汇聚点展开的幅度（小值让可见线条围绕汇聚点起伏） */
    mouseInteraction: true,  /* 鼠标悬停调制线条运动 */
    opacity: 0.8,            /* 整体透明度（压低，保证标题可读性） */
    timeScale: 1,            /* 动画速度倍率（0=冻结，1=原速） */
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

uniform float iTime;
uniform vec3  iResolution;
uniform vec3  uColor;
uniform float uAmplitude;
uniform float uCenterY;
uniform float uSpread;
uniform vec2  uMouse;
uniform float uOpacity;

#define PI 3.1415926538

const int u_line_count = 40;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, float offset, vec2 mouse, float time, float amplitude) {
    float split_offset = (perc * 0.4);
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float amplitude_strength = 0.5;
    float finalAmplitude = amplitude_normal * amplitude_strength
                           * amplitude * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5) * 1.0;
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    /* perc 乘以 6 放大线条间的噪声相位差：相邻线条的波动不再同步，
       避免"平行线"观感（原版 perc 系数 1 时相邻线几乎同相）。 */
    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc * 6.0) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    /* 线条束形态：左端（st.x=0）所有线汇聚到汇聚点，中间扇形展开并由
       Perlin 噪声上下起伏，右端再次收拢——两端贴合容器边缘。
       波动幅度乘 spreadFade：两端（汇聚/收拢处）平稳，中间舒展。
       注意 gl_FragCoord 的 y 轴朝上（底部=0），uCenterY 按"从顶部算起"
       的直觉语义配置，这里做 1- 翻转。 */
    float spreadFade = smoothstep(0.0, 0.3, st.x) * (1.0 - smoothstep(0.75, 1.0, st.x));
    float y = (1.0 - uCenterY) + (perc - 0.5) * uSpread * spreadFade + xnoise / 2.0 * finalAmplitude * spreadFade;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );

    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;

    float line_strength = 1.0;
    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            (PI * 1.0) * p,
            uMouse,
            iTime,
            uAmplitude
        ));
    }

    /* 原版输出 vec4(uColor * colorVal, colorVal) 是预乘 alpha；
       本站惯例 premultipliedAlpha:false，改为非预乘 RGB（合成结果一致） */
    float colorVal = 1.0 - line_strength;
    gl_FragColor = vec4(uColor, colorVal * uOpacity);
}
`;

  const hexToRgb = hex => {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  targets.forEach(setup);

  function setup(container) {
    const color = container.dataset.threadsColor || config.color;
    const amplitude = parseFloat(container.dataset.threadsAmplitude ?? '') || config.amplitude;
    const centerY = parseFloat(container.dataset.threadsCenterY ?? '') || config.centerY;
    const spread = parseFloat(container.dataset.threadsSpread ?? '') || config.spread;
    const mouseEnabled = container.dataset.threadsMouse !== '0' && config.mouseInteraction;

    const canvas = document.createElement('canvas');
    canvas.className = 'threads-canvas';
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
    ['iTime', 'iResolution', 'uColor', 'uAmplitude', 'uCenterY', 'uSpread', 'uMouse', 'uOpacity'].forEach(name => {
      uniform[name] = gl.getUniformLocation(program, name);
    });

    gl.uniform3f(uniform.uColor, ...hexToRgb(color));
    gl.uniform1f(uniform.uAmplitude, Math.max(0, amplitude));
    gl.uniform1f(uniform.uCenterY, Math.max(0, Math.min(1, centerY)));
    gl.uniform1f(uniform.uSpread, Math.max(0, spread));
    gl.uniform2f(uniform.uMouse, 0.5, 0.5);
    gl.uniform1f(uniform.uOpacity, Math.max(0, Math.min(1, config.opacity)));

    gl.clearColor(0, 0, 0, 0);
    container.appendChild(canvas);

    const resize = () => {
      const width = Math.max(1, Math.round(container.offsetWidth * config.dpr));
      const height = Math.max(1, Math.round(container.offsetHeight * config.dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform3f(uniform.iResolution, width, height, width / height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    /* 鼠标交互：canvas 是 pointer-events:none 背景层，监听挂容器（事件自内容冒泡） */
    const mouse = { x: 0.5, y: 0.5 };
    const targetMouse = { x: 0.5, y: 0.5 };
    if (mouseEnabled) {
      container.addEventListener('mousemove', event => {
        const rect = container.getBoundingClientRect();
        targetMouse.x = (event.clientX - rect.left) / rect.width;
        targetMouse.y = 1 - (event.clientY - rect.top) / rect.height;
      }, { passive: true });
      container.addEventListener('mouseleave', () => {
        targetMouse.x = 0.5;
        targetMouse.y = 0.5;
      });
    }

    let visible = true;

    const render = now => {
      requestAnimationFrame(render);
      if (!visible) return;

      mouse.x += (targetMouse.x - mouse.x) * 0.05;
      mouse.y += (targetMouse.y - mouse.y) * 0.05;
      gl.uniform2f(uniform.uMouse, mouse.x, mouse.y);
      gl.uniform1f(uniform.iTime, now * 0.001 * config.timeScale);

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

# 作品集站点 · 交接说明

> 用途：新会话开场把本文件喂给 AI，即可无缝接手。
> 最后更新：2026-08-18

## 1. 项目概况

刘子豪产品经理作品集，**纯静态站点，无构建工具、无框架**（组件均为 vanilla JS 移植，零 CDN 依赖，gsap 已本地化，可离线双击打开）。

- 源目录：`C:\Users\lion\Documents\Codex\2026-08-09\wo\outputs\portfolio\`
- 完整副本：`D:\portfolio\`（**每次改完必须把改动的文件 cp 同步过去**）
- 页面与资源对应关系：

| 页面 | CSS | JS | 说明 |
|---|---|---|---|
| `index.html` | `styles.css` | `script.js` | 主页，顶部主导航（项目/关于/联系） |
| `possibilities.html` | `possibilities.css` | `possibilities.js` | 顶部 `.possibility-top-nav`（所有项目/联系我） |
| `citywalk.html` | `styles.css` + `citywalk.css` | `citywalk.js` | 顶部 `.case-chapters` 章节导航 |
| `drama.html` | `styles.css` + `drama.css` | `drama.js` | 同上 |
| `alexent.html` | `styles.css` + `alexent.css` + `threads.css` | `alexent.js` + `threads.js` | 同上 |

- `assets/` 为全部本地图片。
- 主题色（`styles.css` `:root`）：纸面 `#eee8da`、墨 `#1b2621`、绿 `#1f5c4b`、陶土 `#a84d34`、粘土 `#d66c4c`、芥末黄 `#d9b957`、蓝 `#0f4e78`。

## 2. 已集成的动效组件（清单）

四个组件均从 Vue Bits 移植为 vanilla JS **渐进增强**：

- **TargetCursor** 全站自定义光标：`target-cursor.js`、`target-cursor.css`、`gsap.min.js`（3.12.5）。5 个页面 head 均按顺序引入：css → gsap(defer) → target-cursor(defer)，顺序不能乱。移动端/触屏小屏自动禁用。
- **GooeyNav** 顶部导航：`gooey-nav.js`、`gooey-nav.css`。页面顶部导航加 `data-gooey-nav`（挂载点见 §3）；head 加 css + js(defer)，**放在页面自身 js 之后**。参数在 `gooey-nav.js` 顶部 `config`，配色在 `gooey-nav.css` 顶部 `:root` 变量。
- **ScrollStack** 层叠卡片（possibilities 页）：`scroll-stack.js`、`scroll-stack.css`。容器加 `data-scroll-stack`，直接子元素即卡片。挂载点：`#build`、`#test`、`#hr-check`、`#hr-interview`（宽幅面谈图除外）、`#hr-followup`；单图板块与 `#discover` 不接。调优参数见 js 头部注释。
- **FaultyTerminal** 标题背景（possibilities hero）：`faulty-terminal.js`、`faulty-terminal.css`。元素加 `data-faulty-terminal`（当前挂 `.possibility-hero`），参数在 js 顶部 `config`。
- **Prism** 标题背景（drama hero）：`prism.js`、`prism.css`。元素加 `data-prism`（当前挂 `.drama-hero`），参数在 js 顶部 `config`。
- **RippleGrid** 标题背景（citywalk hero）：`ripple-grid.js`、`ripple-grid.css`。元素加 `data-ripple-grid`（当前挂 citywalk `.case-intro`），参数在 js 顶部 `config`。
- **Threads** 标题背景（alexent hero）：`threads.js`、`threads.css`。元素加 `data-threads`（当前挂 alexent `.alexent-hero`），参数在 js 顶部 `config`。

## 3. 各页面 data-gooey-nav 挂载点

| 页面 | 元素 |
|---|---|
| index.html | `<nav aria-label="主导航" data-gooey-nav>` |
| possibilities.html | `<nav class="possibility-top-nav" ... data-gooey-nav>`（无 scroll-spy，激活态只来自点击） |
| possibilities.html | 章节条 `<nav aria-label="Possibility OS 章节" data-gooey-nav data-gooey-nav-groups=".chapter-group">`（PM/HR 两组；scroll-spy 在 possibilities.js，已同步写 `aria-current`；`is-active`/`border-bottom` 指示由 gooey-nav.css 接管，保留 `:focus-visible` 边框） |
| citywalk/drama/alexent.html | `<nav class="case-chapters" ... data-gooey-nav>`（scroll-spy 由各自页面 js 驱动 aria-current） |

## 4. 关键约束（不要再改回去）

### TargetCursor
- 目标选择器 `a[href], button, [role="button"], .cursor-target`（覆盖 drama 页 SVG 分支节点）。
- 白色 + `mix-blend-mode: difference`（浅色纸面上反色清晰）。
- 隐藏原生光标用 `html.target-cursor-active * { cursor: none !important }`（覆盖 UA 样式和 zoom-in/out）。
- drama/alexent/possibilities 的图片查看器是真 `<dialog>`（top layer 盖住 fixed 光标）→ JS 用 MutationObserver 监听 `open`，打开期间恢复原生光标、隐藏组件；index/citywalk 是 div 对话框，无此问题。

### GooeyNav
- **用户明确要求：不要黑色胶囊、不要高饱和亮色**。粒子 `--gooey-color-1..4` = 绿 `#1f5c4b`、陶土 `#a84d34`、粘土 `#d66c4c`、芥末黄 `#d9b957`；胶囊 `--gooey-pill: #1f5c4b`、文字 `#f8f5ec`。
- 不用原版 gooey 滤镜（`blur+contrast` 会把主题中间色量化成纯色）；不用 blend mode（`lighten` 只适合深色背景）。
- 效果层 z-index=200：高于吸顶导航（site-header 100、case-chapters 70、possibility-header 40），低于图片对话框 500 / toast 800 / skip-link 1000 / target-cursor 9999。
- 效果层必须 body 级 fixed（导航容器 `overflow-x: auto` 会垂直裁剪），用 getBoundingClientRect 定位，scroll(capture)/resize/ResizeObserver 重定位。
- 包装是**移动原节点**（保留 href/aria/既有 JS 引用）；分组模式每组各包一个 ul、links/items 跨组拉平，胶囊可跨组移动。
- 激活态跟随各页已有 scroll-spy：MutationObserver 观察 `aria-current="location"` 变化；滚动跟随无粒子，**点击才爆发粒子**。
- 防横跳（已修复，勿改回）：hash 点击锁定目标项（spy 到达/停歇 320ms/3s 超时解锁）；**解锁一律不同步胶囊位置**；wheel 接管需 80px 累计阈值（防触控板惯性误解锁），touchmove 即时解锁。

### ScrollStack
- 不接 lenis：滚动位置 scrub 驱动，避免劫持全站滚轮与 GooeyNav 锁定、hash 定位冲突。
- 只有 useWindowScroll 模式：内嵌滚动容器会破坏 scroll-spy 与章节偏移计算。
- **pinEnd 提前到"堆叠末端到达视口底部"**（原版 `- 视口高/2` 会在钉住期间盖住后续正文），并有 `Math.max(pinStart, …)` 钳制。
- 卡片：不透明 `--surface` 底（层叠遮盖必须，勿改透明）+ `--line` 边 + 收敛投影，不用原版高饱和渐变；截图触发器投影降一档防"卡中卡"。
- `prefers-reduced-motion` 整体跳过；无 JS 回退为普通 editorial 流（无卡片底、仅间距）。

### FaultyTerminal
- 不接 ogl：原生 WebGL 全屏三角形 + 单 shader program，保持零依赖。
- 片元输出 `vec4(tint, 强度)` 透明合成（tint `#17665f`），**勿改回黑底/实色输出**。
- 内容层规则 `.possibility-hero > *:not(.faulty-terminal) { z-index: 1 }` **必须排除 canvas 自身**；canvas 100vw 满幅（`left:50% + translateX(-50%)`）、`pointer-events: none`。
- dpr 上限 1.5；离屏暂停渲染；reduced-motion 整体跳过。
- hero 标题可读性：`.possibility-hero-copy` 半透明底板（纸色 78% + `backdrop-filter: blur(10px)`，padding 与等量负 margin 保持对齐）。

### Prism（drama hero）
- 同 FaultyTerminal 惯例：不接 ogl，原生 WebGL 全屏三角形单 shader，零依赖。
- 颜色用主题三色调色板（绿/粘土/芥末黄，即 GooeyNav 粒子色）映射三个 sin 通道，透明 canvas alpha 合成叠加纸面，**勿改回彩虹相位色/黑底实色**。
- 只保留 rotate 模式（底座 wobble 慢漂移）；hover 倾斜/3drotate 不接——hero 背景要安静。
- 100 步 raymarch 较重：renderScale 0.66 降采样渲染（发光经 CSS 放大无损观感），dpr 上限 1.5。
- 内容层规则在 `drama.css`：`.drama-page .drama-hero > *:not(.prism-canvas) { z-index: 1 }`（排除 canvas 自身）。
- IntersectionObserver 离屏暂停；prefers-reduced-motion 整体跳过。

### RippleGrid（citywalk hero）
- 同上惯例：不接 ogl，单 pass 网格 shader 开销低，无需降采样；dpr 上限 1.5。
- 固定 enableRainbow=false，网格色 = citywalk 主题陶土 `#a84626`，透明 canvas alpha 合成，**勿改回彩虹/荧光绿/黑底**。
- canvas `pointer-events:none`，鼠标涟漪交互监听挂在容器上（事件自内容冒泡），与 TargetCursor 无冲突。
- 内容层规则在 `citywalk.css`：`.case-intro > *:not(.ripple-grid) { z-index: 1 }`。
- IntersectionObserver 离屏暂停；prefers-reduced-motion 整体跳过。

### Threads（alexent hero）
- 同上惯例：不接 ogl，原生 WebGL 全屏三角形单 shader，零依赖；dpr 上限 1.5。
- 线条色 = alexent 主题绿 `#1d5a4b`（原版默认白色在浅纸面不可见），透明 canvas alpha 合成，**勿改回黑底实色**。
- **线条束形态 = "两端汇聚 + 中间起伏"（勿改回平行展开）**：distance 平移会让 40 条线变成近似平行的横线（用户明确否掉）；现改为所有线在容器左端（st.x=0）汇聚到一点，中间按 `smoothstep` 包络散开并由 Perlin 噪声各自起伏（`perc*6` 放大线条间相位差，避免同相平行），右端（st.x>0.75）再次收拢。参数在 config：`centerY`（汇聚点垂直位置，按"从顶部算起"，默认 0.2）、`spread`（展开幅度，默认 0.18）。
- **坐标陷阱（勿改回）**：shader 用 `gl_FragCoord`，y 轴朝上（底部=0）；`centerY` 按顶部语义配置，lineFn 里必须做 `1.0 - uCenterY` 翻转，否则线条全部跑到容器底部（2011px 高的 hero 会落在视口外，表现为"全透明"）。
- 原版输出是预乘 alpha（`vec4(uColor*colorVal, colorVal)`），本站惯例 `premultipliedAlpha:false`，已改为非预乘 `vec4(uColor, colorVal*uOpacity)`，合成结果一致。
- canvas `pointer-events:none`，鼠标交互监听挂在容器上（事件自内容冒泡），与 TargetCursor 无冲突。
- 内容层规则在 `alexent.css`：`.alexent-page .alexent-hero > *:not(.threads-canvas) { position: relative; z-index: 1 }`。
- IntersectionObserver 离屏暂停；prefers-reduced-motion 整体跳过。

### 通用
- sticky 依赖链：body/html 的 `overflow-x` 必须用 `clip` 而非 `hidden`（hidden 会让 body 成为滚动容器，sticky 全失效）。

## 5. 维护工作流

1. 改 `C:` 源目录下的文件。
2. JS 改完跑 `node --check <file>` 验证语法。
3. 把改动文件 `cp` 到 `/mnt/d/portfolio/`（WSL 路径；即 `D:\portfolio\`）。
4. 缓存：新文件无版本号；既有 css/js 带 `?v=` 的只在改动它们时才 bump。
5. 无头截图验证（Windows Chrome）：
   ```bash
   "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --screenshot=... --window-size=1600,1000 "file:///D:/portfolio/index.html"
   ```
   **喂给 AI 查看前先把截图压缩/缩图**（如 PIL 缩到 1400px 宽转 JPEG）——全页大 PNG 会把上下文顶爆（2026-08-17 曾因此撑爆会话，超中转站 1M 单次上限）。

## 6. 可能的后续优化（未做 / 待确认）

- 胶囊绿色想再浅可考虑 `#315957`（ink-soft）。
- 粒子密度/范围：改 `gooey-nav.js` 的 `config.particleCount` / `particleDistances`。

## 7. 变更记录

### 2026-08-16
- possibilities 章节条接入 GooeyNav（分组模式，见 §3）。
- 首页 citywalk 区块移除评测面板（`.evaluation-panel`），与其他区块篇幅对齐；完整评测保留在 `citywalk.html` 第 07 章。`styles.css` 相关死代码已清理。
- possibilities 页头/章节条 sticky 修复：`overflow-x: hidden` → `clip`。
- possibilities 导航字号调大：顶部导航 12→14px（移动端 11→12.5px）、章节条链接 12→13px、组名 12→13px。
- 新增 ScrollStack 集成；释放点修正（修复钉住卡片遮盖"当前 AI 边界"等后续正文）。
- 新增 FaultyTerminal 集成：possibilities hero 标题背景。
- GooeyNav 锁定机制防横跳修正：解锁不再同步胶囊、wheel 接管加 80px 累计阈值。
- possibilities hero 文字加半透明底板（`.possibility-hero-copy`），FaultyTerminal 不再影响标题阅读；`possibilities.css` 当前 `?v=50`。

### 2026-08-17
- 首页四个项目区块统一背景板：`.project` 基础规则加 `background: #e9e0cf`（此前仅 possibilities 有）；各区块修饰类保留各自点缀色。`styles.css` bump `?v=20260816-2`。
- HANDOFF.md 压缩：删除四个已完成集成的详述章节（§2–§5），关键约束并入 §4。

### 2026-08-18
- 新增 Prism 集成：drama 页 hero 标题区背景（绿/粘土/芥末黄三色调色板，rotate-only，renderScale 降采样）。
- 新增 RippleGrid 集成：citywalk 页 hero 标题区背景（主题陶土 `#a84626`，保留鼠标涟漪交互）。
- 两者均为 Vue Bits 组件的 vanilla JS 移植（惯例同 FaultyTerminal：无 ogl、透明 canvas alpha 合成、离屏暂停、reduced-motion 跳过）。新文件无 `?v=` 版本号。
- RippleGrid 调淡：用户反馈影响文字阅读 → `opacity` 0.8→0.4、`glowIntensity` 0.1→0.05、`rippleIntensity` 0.05→0.02，新增 `timeScale: 0.5` 动画减速。
- citywalk hero 引文加半透明底板：`.case-lede` 纸面 78% + `backdrop-filter: blur(10px)` + 圆角 14px，padding 16/20 配负 margin 保持文字原位（惯例同 possibilities hero-copy，但只罩引文段不罩标题）。
- 新增 Threads 集成：alexent 页 hero 标题区背景（主题绿 `#1d5a4b` 线条，`distance:-1` 高容器适配，鼠标悬停调制）。Vue Bits 组件 vanilla JS 移植，惯例同 FaultyTerminal/Prism/RippleGrid（无 ogl、透明 alpha 合成、离屏暂停、reduced-motion 跳过）。新文件无 `?v=` 版本号。
- Threads 形态重构：用户反馈"线条几乎平行、无美感"→ 弃用 distance 平移，改为**两端汇聚 + 中间起伏**（左端全线汇聚一点、中间 Perlin 各自起伏 `perc*6` 防同相、右端收拢，`centerY`/`spread` 参数化）；并修复 gl_FragCoord 坐标系陷阱（centerY 顶部语义需 `1.0-uCenterY` 翻转，否则线条落视口外表现为全透明）。验证流程新增豆包视觉 API（`.env.local`：ARK 火山方舟 `doubao-seed-2-0-lite-260428`）辅助评审。
- alexent hero 引文加半透明底板：`.case-lede` 纸面 78%（alexent 纸面 `#f3eee4`）+ `backdrop-filter: blur(10px)` + 圆角 14px，padding 16/20 配负 margin 保持文字原位（惯例同 citywalk/possibilities，遮挡 Threads 线条提高可读性）。
- Alexent 定位口径调整：从"企业交付 Copilot / 个人主导"改为"**部门内部 AI 协作工作台 / 独立完成 MVP 开发**"（产品场景来自部门真实工作，MVP 由本人独立开发；与简历口径一致）。涉及 `index.html`（首页索引、项目区块、project-meta）与 `alexent.html`（meta、hero、gaps/memory/takeaway 等章节，"客户/企业"措辞统一为"部门/协作"）。
- 首页四个项目解释文字(lede)列增宽：`.project-header` grid 列比例 `1.1fr/.9fr → 1fr/1.1fr`（标题列回落、lede 解释列增宽，四个项目共用）。`styles.css` bump `?v=20260818-2`。

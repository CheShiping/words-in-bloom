# 词间日和 · 设计系统

> **暖粉和风 / 夜樱** —— 纯 CSS 设计系统，无 UI 框架、无 Tailwind、无 CSS-in-JS。
> 快照日期：2026-11-12（重构对齐后） · 样式规模：`app/globals.css` 1,995 行 / 156 个类选择器 / 58 个 CSS 变量。
>
> **事实源**：`app/globals.css`（全部 token 与组件样式）、`components/BloomApp.jsx`（DOM 结构、手势与动效编排）、`app/layout.jsx`（主题首帧初始化）、本文 §12（不可违反的硬约定）。
> 本文是对**现有实现**的归纳，不是新增规范。样式与本文冲突时以代码为准，并同步修订本文。
>
> **本工作区不含** `AGENTS.md` / `scripts/check_*.mjs` / `init.sh`：相关硬约定已并入 §12，缺陷修复记录见 §14。

---

## 0. 定位

把背单词的界面做成一间可以久待的纸本书房：暖粉与米白纸面、液态玻璃文本块、水彩庭园底景与三层樱花粒子；夜间切换到「夜樱」暗色主题。

**核心判断**：全站只有一种内容容器 —— 玻璃文本块。页面之间、卡片之间不靠彩色区块或边框颜色区分层级，而靠**留白、圆角、字号与玻璃叠层**区分。这决定了新增任何面板都必须「长得像既有文本块」。

---

## 1. 六条设计原则

| # | 原则 | 落地方式 | 反例（曾出现过并已修正） |
|---|---|---|---|
| 1 | 文本块主题统一 | 所有面板 = `.glass` + 内描边 + 26px 级圆角 | 自造 4px 彩色左边框、高饱和色块 |
| 2 | 变量优先 | 浅/暗色只覆盖 `:root` 变量；组件级覆盖仅用于「浅色小色块反色」 | 在组件里硬编码浅色背景，暗色下变白块 |
| 3 | 复用优先于新增 | 新面板组合 `.journal-card` / `.badge` / `.path-bar` / `.pill` | 为弹框另写一套按钮、标签、进度条 |
| 4 | 动效分层且克制 | 氛围 → CSS，状态切换 → WAAPI，编排 → GSAP；减弱动效一律降级 | 用 GSAP 做卡片切换、给入场加方向性滑入 |
| 5 | 阅读优先 | 玻璃模糊仅 11px、叠低干扰网点压塑料感、长内容 `overflow-wrap: anywhere` | 大面积高模糊导致文字发虚、长单词撑破卡片 |
| 6 | 移动端是主战场 | 触屏目标 ≥ 44px、按下态替代 hover、底部导航接管 | 桌面 hover 效果直接搬到触屏 |

---

## 2. Design Tokens

### 2.1 基础色板（浅色 / 夜樱对照）

> 全部组件色值一律引用语义变量；浅/暗色只覆盖 `:root` / `[data-theme="dark"]` 两处变量，组件层零硬编码底色（原则 2）。

| Token | 浅色「暖粉和风」 | 暗色「夜樱」 | 用途 |
|---|---|---|---|
| `--pink` | `#b56f82` | `#d691a4` | 主强调色、渐变终点、激活文字 |
| `--pink-light` | `#ddc8cd` | `#6d4d58` | 次级边框、进度条起点、CTA 描边 |
| `--pink-soft` | `#eee6e5` | `rgba(214,145,164,.15)` | 徽章底、柔和 CTA、hover 底 |
| `--gold` / `--gold-soft` | `#b38a5b` / `#eee1d0` | `#c9a373` / `rgba(201,163,115,.16)` | 第二词书、收藏、待复习 |
| `--green-soft` / `--blue-soft` | `#e7ede4` / `#e8eef0` | `rgba(156,175,148,.18)` / `rgba(160,195,214,.16)` | 已掌握 / 学习中徽章底 |
| `--plum` | `#6f4450` | `#edc9d3` | 强调文字、数值、图标（暗色反转为浅粉） |
| `--text` / `--muted` / `--light` | `#3f3739` / `#75696c` / `#94878a` | `#ece4e6` / `#b1a3a8` / `#8a7c81` | 正文 / 次要 / 提示 |
| `--ink-1…4` | `#4c3d41` → `#9d8289` | `#f3eaec` → `#8d7f85` | 标题到弱化的四级文字（组件正文一律走这四级） |
| `--accent-ink` | `#9c6b76` | `#d9a3b0` | 粉系徽章文字 |
| `--accent-ink-gold` / `--accent-ink-green` / `--accent-ink-blue` | `#8d6c44` / `#5f7a56` / `#5f7d8c` | `#d6b487` / `#a9c39b` / `#9dc0d2` | 金色 / 成功 / 学习中徽章文字 |
| `--on-accent` | `#fff7f5` | **`#1a1319`** | 强调按钮上的文字（暗色特意转深） |
| `--page-solid` | `#fdfbf8` | `#16121a` | 页面底色兜底 |
| `--card-bg` / `--card-hover` | `rgba(251,249,246,.88)` / `rgba(255,254,251,.97)` | `rgba(38,31,38,.88)` / `rgba(50,41,49,.96)` | 玻璃底 / hover |
| `--border` | `rgba(100,84,88,.22)` | `rgba(238,222,226,.13)` | 统一描边 |
| `--field-bg` / `--chip-bg` / `--raise-bg` | 白 `.72 / .6 / .55` | 白 `.06 / .08 / .045` | 输入框 / 胶囊 / 抬起面 |
| `--glass-top` / `--glass-bottom` | 白 `.78` / `rgba(246,243,239,.72)` | `rgba(50,41,49,.8)` / `rgba(31,25,32,.76)` | 玻璃渐变两端 |
| `--hairline` / `--sheen` | 白 `.5` / 白 `.4` | 白 `.07` / 白 `.06` | 1px 内描边 / 对角高光 |
| `--ok-soft` `--ok-line` `--ok-ink` `--ok-glow` | `#eef3ea` / 绿 `.55` / `#4f6a44` / 绿 `.45` | 绿 `.18` / 绿 `.42` / `#a9c39b` / 绿 `.18` | 答对 |
| `--bad-soft` `--bad-line` `--bad-ink` | `#f9e8eb` / 粉 `.5` / `#a05464` | 粉 `.18` / 粉 `.42` / `#d9a3b0` | 答错 / 同步失败 |
| `--shadow` | `0 15px 34px rgba(58,48,51,.1)` + `0 2px 5px …` + `inset 0 1px 0 rgba(255,255,255,.82)` | `0 18px 40px rgba(0,0,0,.5)` + `0 2px 6px …` + `inset 0 1px 0 rgba(255,255,255,.06)` | 玻璃统一投影（三层） |
| `--shadow-raise` / `--shadow-lift` / `--shadow-dark` | 小控件 / 文本块 / 暗色统一 | 同左 | hover 与浮窗投影 |
| `--skeleton-a` / `--skeleton-b` | `#efe7e3` / `#f7f0ec` | `#2a2230` / `#383040` | 骨架屏 shimmer |
| `--art-opacity` / `--art-filter` / `--glow-opacity` | `.6` / 水彩调色 / `.14` | `.1` / 水彩压暗 / `.1` | 底景与光斑强度 |

其它定义：`--peach #d8b495`、`--purple #b9abc8`、`--blue #bdd5e3`、`--green #9caf94` 是装饰调色板；`--bg-main/--bg-secondary` 已定义但 `body` 背景实际走独立渐变；`--petal-scale`（暗色花瓣整体压暗）。

### 2.2 尺寸与形状

| 类别 | 值 |
|---|---|
| 页面宽度 | `--page-width: 1160px`；`.topbar` = `min(1160px, 100% − 36px)`，`.main` = `min(1160px, 100% − 32px)` |
| 圆角阶梯 | 胶囊 `999px`；`.journal-card`/`.topbar`/`.dialog` `26px`；`.dashboard`/`.quiz-card`/`.quiz-setup` `30px`；`.study-card` `34px`；`.face` `40px`；`.word-card` `22px`；`.field` `14px`；`.option` `18px`；圆形按钮 `50%` |
| 间距节奏 | `6/8/10/12/14/16/18/22/26/30/34/38/42 px`；栅格间距 12–18px；`.main` 上下 `44/54px`（移动端 `26/132px`） |
| hover 投影 | 小控件 `0 10px 22px rgba(93,61,70,.16)`；文本块 `0 22px 44px rgba(93,61,70,.16)`；暗色统一 `0 20px 40px rgba(0,0,0,.42)` |
| 过渡时长 | 控件 `.15–.2s ease`；翻面 `opacity .22s`；滑动回弹 `.24s cubic-bezier(.22,1,.36,1)`；弹窗 `.2s`；页面 `appear .42s` |

---

## 3. 材质：液态玻璃与底景

### 3.1 `.glass` 基类（所有文本块的唯一配方）

```css
.glass {
  background: linear-gradient(145deg, var(--glass-top), var(--glass-bottom)), var(--card-bg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  backdrop-filter: blur(11px) saturate(108%);
}
```

**内描边层**：`.topbar / .dashboard / .filters / .journal-card / .study-card / .face / .quiz-card / .quiz-setup / .result-card / .dialog` 统一 `isolation: isolate; overflow: hidden`，并用 `::before` 铺一层 `inset: 1px` 的 1px `--hairline` 描边 + `--sheen` 对角高光；所有直接子元素 `z-index: 1` 抬到高光之上。这套结构是「文本块」的视觉签名，不要绕开。

### 3.2 页面底景（四层，全部 `pointer-events: none`）

| 层 | 实现 |
|---|---|
| 纸面 | `body` 两层 radial（右上粉 / 左下蓝，透明度 `.16/.2`）+ `linear-gradient(132deg, #fdfbf8 → #f8f1f1 → #f6f1eb)`，`background-attachment: fixed` |
| 网点 | `body::before`，7px 网格 0.7px 圆点，`opacity .26`，用来压掉渐变的塑料感 |
| 水彩庭园 | `.garden-background-art` 贴底 33.3vw / min 300px，渐隐 mask，`opacity .6`，`saturate(56%) contrast(94%)` |
| 氛围 | `.glow.g1/g2` 两团 36/30vw 光斑 `blur(24px)` + 16s 漂移；`.sakura-branch` 樱枝 `mix-blend-mode: multiply` + 8.5s 轻摆 |
| 花瓣 | 三层视差粒子，见 §7.4 |

**暗色差异**：底景渐变换成夜色 `#16121a → #1c1520 → #151119`，网点转白点 `.16`，水彩降到 `opacity .1` 且 `brightness(.55)`，**樱枝直接隐藏**（白底水彩在 `screen` 混合下会露出亮矩形），光斑降到 `.1`，花瓣整体 `.55` 并压暗。

---

## 4. 排版

| 场景 | 字体 | 字号 / 字距 |
|---|---|---|
| 全局中文 | `"Noto Serif SC", "Microsoft YaHei", serif` | 正文 13.5–16.5px，`line-height 1.7–1.95` |
| 数字 / 英文 / 斜体标注 | `Georgia, "Times New Roman", serif` | `.eyebrow` 14px 斜体 / 字距 `.26em`；`.subtitle` 17px 斜体；`.kicker` 11.5px 斜体 / `.22em`；`.footer-whisper` 13px 斜体 |
| 展示数字 | Georgia 700 | 进度环 30px、统计 26px、成绩 70px（移动端 52/44px） |
| Hero 标题 | 全局字体 | `clamp(42px, 7vw, 76px)` / `.08em`；768 → `clamp(30px,9vw,42px)`；560 → 28px；400 → 25px |
| 区块标题 | 全局字体 | `.section-head h2` 26px；卡片标题 17–21px；`.quiz-card .prompt` `clamp(24px,3.6vw,34px)` |
| 学习大字 | 全局字体 | `.study-word clamp(38px,5.4vw,58px)`；`.flip-word clamp(34px,5vw,50px)`；均 `overflow-wrap: anywhere` |
| 徽章 / 提示 | 全局字体 | 11–12.5px / `.04–.1em` |

**约定**：所有计数、成绩、时间、页码一律 `font-variant-numeric: tabular-nums`，避免数字滚动时宽度跳动；释义最多 3 行（`-webkit-line-clamp: 3`）；长单词/长例句统一 `overflow-wrap: anywhere`，避免撑破玻璃卡；`text-wrap: balance` 仅用于 Hero 副标题。

---

## 5. 组件目录

> 组件以 class 组合方式使用，没有 React 组件库。下表按用途分组，规格取桌面默认值。

### 容器与导航

| 组件 | 类名 | 关键规格 |
|---|---|---|
| 应用壳 | `.app-shell` | flex 列，`min-height: 100dvh` |
| 顶栏 | `.topbar.glass` | sticky `top:12px`，高 86px，圆角 26px，`width: min(1160px, 100%−36px)` |
| 顶栏导航 | `.nav button` | 66px 高 / min 78px 宽 / 18px 圆角；`.active` 转 `--plum`；`.nav-hover-circle` 拱形聚光灯 + 双层文字接力 |
| 工具按钮 | `.theme-btn` `.icon-btn` `.motion-toggle` | `.theme-btn` 为 38px 圆形（日/月图标由 `[data-theme]` 控制显隐，避免水合差异）；`.icon-btn`/`.motion-toggle` 为 999px 胶囊；统一 `--chip-bg` + 1px 描边，hover 升起 |
| 底部导航 | `.bottom-nav.glass` | ≤768px 接管，fixed 居中、`width: min(560px, 100vw−24px)`，含 `env(safe-area-inset-bottom)` |
| 页面容器 | `.main` / `.page.active` | `.page` 默认 `display:none`，激活时 `appear .42s` 上浮淡入 |
| 区块头 | `.section-head` | 26px 标题 + 斜体说明，右对齐工具区 |

### 文本块与数据展示

| 组件 | 类名 | 关键规格 |
|---|---|---|
| 通用文本块 | `.journal-card.glass` | 22/24px 内距、26px 圆角、min-height 190px、hover 上浮 3px；书卡片、番茄钟、词集卡、学习路径卡全部由它派生 |
| 仪表盘 | `.dashboard.glass` | 30px 圆角、26/28px 内距，148px 进度环 + `.stats` 三列 |
| 统计格 | `.stat` | 18px 圆角、`--raise-bg`、hover 上浮 2px |
| 单词卡 | `.word-card.glass` | 22px 圆角、20/22px 内距、3 行释义截断、hover 上浮 3px |
| 徽章 | `.badge` | 999px / 11px；`.collection` 金、`.num` 无底、`.s-new/learning/review/mastered` 四态 |
| 进度条 | `.path-bar` | 7px 高、999px；`i` 用 `linear-gradient(90deg, --pink-light, --pink)` 填充（唯一保留的渐变进度条） |
| 例句块 | `.example-block` | 16px 圆角、`--raise-bg`、英文斜体 15px + 中文 13px；`.compact` 用于卡片背面，max-height 104px 可滚 |
| 状态 / 页脚 | `.sync-status` / `.footer-whisper` | 999px 小胶囊 / 13px 斜体低语 |

### 控件

| 组件 | 类名 | 关键规格 |
|---|---|---|
| 主按钮 | `.pill` | 10/20px 内距、999px、13.5px；`.primary`/`.danger` 为 135° 粉/红渐变；`:disabled` 透明度 .55 |
| 柔和 CTA | `.pill.mastered-cta` / `.book-card-cta` | **纯色**：`--pink-soft` 底 + `--pink-light` 描边 + `--accent-ink` 字，无渐变、hover 不变色。用于状态型按钮：沉浸学习「已掌握」= `.mastered-cta`，选书弹窗「换这一本」= `.book-card-cta` |
| 圆形按钮 | `.round-btn` | 46px（移动端 48px），hover `scale(1.06)` |
| 输入框 | `.field` | 14px 圆角、`--field-bg`、`min-width:0`、聚焦 `0 0 0 3px rgba(181,111,130,.16)` |
| 筛选条 / 分页 | `.filters.glass` / `.pagination button` | 22px 圆角；分页 38px（移动端 44px），`.current` 粉色渐变 |
| 收藏按钮 | `.fav-btn` | 32px（移动端 44px），`.active` 转 `--pink` |
| 空状态 | `.empty.glass` | 24px 圆角、46px 内距、44px 图标字形 |

### 学习 / 测验 / 弹窗

| 组件 | 类名 | 关键规格 |
|---|---|---|
| 沉浸学习卡 | `.study-card.glass.swipe-target` | max 760px、min-height 380px、34px 圆角、居中大字；移动端 24px 圆角；**切换键固定在卡片下方一行**（`.study-nav-row`，左右各一枚圆钮），不与卡片并排、不一上一下 |
| 记忆卡片 | `.flip-scene` / `.flip-card` / `.face.front/.back` | 740×420px（移动端 340/300px）、40px 圆角；**双面交叉淡化**（opacity .22s），非 3D 翻转；`:focus-visible` 2px 粉描边 |
| 测验卡 | `.quiz-card.glass` / `.option` | max 760px / min-height 340px；选项两列（移动端单列）、`optionReveal .3s` 逐项错峰 0.04s |
| 答题反馈 | `.option.correct/.wrong/.dim` | 正确浅绿 + 柔光、错误浅粉 + `shake .35s`、其余 `.6` 透明度；暗色各自反色 |
| 结果卡 | `.result-card.glass` / `.result-score` / `.error-list` | 70px 分数、粉软底错题清单 |
| 通用弹窗 | `.modal` / `.dialog.glass` | 遮罩 `rgba(63,55,57,.32)` + `blur(4px)`；420px 宽、26px 圆角、入场 `translateY(10px) scale(.97) → none` |
| 选书弹窗 | `.book-picker.dialog.glass` | 760px 宽、max-height 86vh；卡片/标签/进度条/按钮**全部复用** `.journal-card` / `.badge` / `.path-bar` / `.pill`。列表用 `grid-auto-rows: min-content` + 卡片 `align-self: start`——默认 auto 行在容器被压缩时会把卡片压扁 |
| 骨架屏 | `.home-boot-*` | shimmer `1.6s` + 旋转环 `1.1s`，暗色用 `--skeleton-a/b` |
| 浮窗 / 光标 | `.to-top` `.pomodoro-mini.glass` `.quiz-target-cursor` | 44px 返回顶部；测验页四角瞄准光标（仅精细指针 + 未减弱动效时启用） |

---

## 6. 状态与反馈色

| 状态 | 浅色 | 暗色 |
|---|---|---|
| 未学 `.s-new` | `#eceae6` / `#8f8789` | 白 `.08` / `#9b9096` |
| 学习中 `.s-learning` | `#e8eef0` / `#5f7d8c` | 蓝 `.16` / `#9dc0d2` |
| 待复习 `.s-review` | `--gold-soft` / `--accent-ink-gold` | 同变量自动反色 |
| 已掌握 `.s-mastered` | `#e7ede4` / `--accent-ink-green` | 绿 `.16` / `#a9c39b` |
| 答对 | `#eef3ea` + 绿边 + `0 0 35px` 柔光 | 绿 `.18` + 弱光 |
| 答错 | `#f9e8eb` + 粉边 + shake | 粉 `.18` |
| 同步成功 / 失败 | `--accent-ink-green` / `#a05464` | 变量 / 同色 |
| 激活 / 选中 | `--plum` 文字、`--pink-soft` 底、`--pink-light` 描边 | 变量自动反色 |

**关于渐变的边界（重要）**：既有主行动按钮 `.pill.primary/.danger`、`.study-actions .pill.on`、分页 `.current`、进度条填充以及装饰性径向渐变（导航聚光灯、花瓣）使用渐变；**新增的状态型 CTA 一律用柔和纯色**（`--pink-soft / --pink-light / --plum`）。不要新增高饱和色块、彩色左边框或另一套按钮。

---

## 7. 动效系统

### 7.1 三层分工

| 层 | 负责 | 技术 | 典型时序 |
|---|---|---|---|
| 氛围 | 花瓣、光斑、樱枝、计时器呼吸、骨架屏 | CSS `@keyframes` | 3.4s / 8.5s / 16s / 1.6s / 1.1s，无限循环 |
| 状态切换 | 卡片换词、页面显隐、弹窗、hover | CSS transition + **WAAPI `element.animate`** | 50–420ms |
| 编排 | 页面入场、首访顶栏揭幕、导航胶囊、数字滚动、测验瞄准光标 | **GSAP** | 0.09–1s，`power3.out` 为主 |

### 7.2 卡片切换（全站唯一一套时序，`useCardDeck`）

```
旧卡离场 50ms  cubic-bezier(.4,0,.65,1)
  opacity 1→0, translate3d(exitFrom → exitTo), scale 1→.985
  travel = max(34px, 卡宽 × .08)，方向 = 手势方向，起点 = 手指离开时的偏移
  ↓ exit.cancel() + flushSync(commit)  ← 必须同步提交
新卡入场 70ms  cubic-bezier(.2,.72,.25,1)
  opacity 0→1，【零位移、不区分方向】
```

- 唯一入口：`BloomApp.jsx` 的 `useCardDeck`（底层 `useSwipeDeck` + `switchCard`）；沉浸学习、记忆卡片、测验卡只提供 `cardSelector / commit / activePage`。
- `flushSync` 是硬要求：否则入场动画会挂到即将卸载的旧卡上，出现「空一帧 + 弹出」。
- **`exit.cancel()` 同样是硬要求**：离场动画用 `fill: forwards`，若不取消，元素会永久停在 `opacity: 0`。凡是切卡后 DOM 被复用（未换 `key`）的场景——记忆卡片的 `.flip-scene` 就是——新内容会继承这份残留，整张卡变透明。`cancel()` 与 `commit()` 在同一 tick 内完成，浏览器不会绘制中间帧。
- **入场绝不从左右滑入**：会撑大 `documentElement.scrollWidth`，冒横向滚动条且只在「下一个/左滑」复现。`html { overflow-x: clip; scrollbar-gutter: stable }` 与 `.main { overflow-x: clip }` 是配套防线，勿删。
- **切卡的 DOM 必须换 `key`**：`.study-card`（`key={word.id}`）、`.flip-card`（`key={flashWord.id}`）、`.quiz-card`（`key={quiz.index}`）——换 `key` 让内容与 DOM 一一对应，旧节点卸载时残留动画一并消失。
- 键盘方向键经 `moveRef` 复用同一个 `move` 与同一把 `busyRef` 锁；`.swipe-target` 拖拽期间 `will-change: transform, opacity` + `backface-visibility: hidden` 防玻璃逐帧重绘抖动。
- **同一把锁只能有一处实现**：页面组件（`StudyPage` / `FlashPage`）不得自己再写一份 `move`，必须调用主组件暴露的 `app.moveStudy` / `app.moveFlash`，否则会出现无锁并发切卡与索引错乱。

### 7.3 手势参数

| 参数 | 值 |
|---|---|
| 起手判定 | `|dx| ≥ 10px` 且 `|dx| > |dy|` |
| 提交阈值 | 卡片 `56px`；**整页翻页 `72px`**；判定还要求 `|dx| > |dy|` |
| 跟手阻尼 | `dx × .55`；旋转 `damp × .03deg`；透明度下限 `.45`（`1 − |dx|/1100`） |
| 回弹 | 未提交 `.24s cubic-bezier(.22,1,.36,1)`；提交后立即归位并由离场动画接管 |
| 防冲突 | 卡片手势后 `400ms` 内不触发翻页；页面级手势排除 `.swipe-deck, input, textarea, select` 与卡片几何范围；滑动后 `400ms` 截断补发 click |
| 触屏 | `.swipe-deck { touch-action: pan-y }`，横向交给脚本、纵向保留原生滚动 |

**实现现状**（`useSwipeDeck` hook，鼠标与触摸同一套 Pointer Events）：

- `.swipe-deck` = 手势容器（`touch-action: pan-y`）；`.swipe-target` = 被跟手变形的元素（`will-change: transform, opacity` + `backface-visibility: hidden`）。`.main` 也设 `touch-action: pan-y`，让整页横向手势不被浏览器接管。
- 卡片手势：`.study-stage`（沉浸学习）、`.flip-scene`（记忆卡片）、`.quiz-card`（记忆测试）；整页手势挂在 `.main`，目标是被拖动的 `.page` 区块。
- 页面级手势的排除清单：`.swipe-deck, input, textarea, select, button, a, [role='button']`，另有「卡片手势后 400ms 内不翻页」。
- 提交时把手势留下的位移与透明度**传给离场动画**，让卡片/页面从当前位置接续滑出，不跳变；离场结束再翻页。
- 拖拽期间给 `<body>` 挂 `.swiping-x` 禁用文字选中，避免横向拖动误选文本。
- 滑动后 400ms 内的 click 由 `onClickCapture` 截断，防止松手误触按钮。
- 键盘 ← → 与手势共用同一把 busy 锁；在首页 / 词典库 / 收藏夹，← → 直接整页翻页。

### 7.4 花瓣三层（确定性播种 + CSS 变量）

| 层 | 数量 | 尺寸 | 透明度 | 时长 |
|---|---|---|---|---|
| back | 12 | 8–16px | .18–.34 | 16–29s |
| mid | 8 | 12–23px | .30–.56 | 13–23s |
| front | 4 | 20–37px | .44–.76 | 11–19s |

JS 用 `petalNoise(seed, salt)` 生成 `--petal-x/size/opacity/duration/delay/wind-a…c`，CSS 只跑一条 `petalThroughLayers`；`--petal-height = size × 1.44`。数量倍率：桌面 `1`、紧凑/触屏 `0.5`、`prefers-reduced-motion` `0.25`；标签页隐藏（`body.page-hidden`）暂停动画；resize 后 200ms 派发 `petal-resync` 事件（当前仅保留事件钩子，实际重播种由 `motionEnabled` 变化触发）。

### 7.5 编排与降级

- 页面切换：`gsap.fromTo`，`{autoAlpha:0, y:34, scale:.985, filter:blur(8px)} → 正常`，`0.72s power3.out`，词典库页跳过。
- 首访顶栏：GSAP timeline（顶栏 0.72s → 品牌 `back.out(1.8)` 0.58s → `#topNav` clipPath 揭幕 0.76s → 工具区 0.5s），`sessionStorage` 保证每会话一次。
- 导航胶囊：几何反解拱形圆半径，hover 0.09–0.12s `power3/power2.out`。
- 数字滚动 1s `power3.out`；测验光标 `quickTo` 0.1s / 0.2s，按下 0.16s 缩放。
- **减弱动效**：`prefers-reduced-motion` 时 GSAP 编排整体跳过（JS 侧统一走 `prefersReducedMotion()` 判定，不再依赖 `window.gsap` 之类的环境探测）、花瓣静置（opacity .16、数量 25%）、光斑/樱枝/计时器呼吸关闭、`scroll-behavior: auto`；`body.no-motion`（花影开关）暂停所有 CSS 动画；`coarse pointer / ≤768px` 隐藏自定义瞄准光标；`@media (hover: none)` 用 `:active` 的 `translateY(1px) scale(.99)` 替代 hover，并把触屏上残留的 `:hover` 态复位。
- **减弱动效的 CSS 降级不得依赖状态类**：用 `body:not(.motion-enabled)` 之类的条件包裹降级规则是错的——`motion-enabled` 默认挂在 `<body>` 上，条件永不成立，降级形同虚设。降级必须写在 `@media (prefers-reduced-motion: reduce)` 内，逐条点名要停的动画。

---

## 8. 主题：暗色「夜樱」

1. `app/layout.jsx` 在首帧前注入内联脚本：读 `localStorage["wordsInBloomTheme"]`，无值则跟随 `prefers-color-scheme`，写入 `<html data-theme="dark|light">`，**避免暗色闪白**。
2. 顶栏 `.theme-btn` 切换 `data-theme` 并回写 `localStorage["wordsInBloomTheme"]`；两个图标由 `[data-theme="dark"]` 控制显隐，避免水合差异。
3. `[data-theme="dark"]` 覆盖 §2 的全部变量（含 `color-scheme: dark`）；**组件层零覆盖**——状态徽章、`.option.correct/.wrong`、`.stat`、`.fav-btn`、导航聚光灯、骨架屏、`.to-top`、hover 阴影、玻璃卡阴影全部走语义变量，因此不需要为暗色再写一遍组件规则。
4. 暗色下 `--on-accent` 由 `#fff7f5` 变 `#1a1319`：渐变主按钮背景不变，文字转深以保对比度。
5. `body` 默认挂 `.motion-enabled`；`.no-motion` / `.page-hidden` / `.quiz-custom-cursor` / `data-page` 为全局状态类。

---

## 9. 布局与响应式

| 断点 | 主要变化 |
|---|---|
| `1080px` | `.stats` 3 列 → 2 列 |
| `1024px` | `.home-grid` 3 列 → 2 列；导航按钮 min 78 → 64px |
| `900px` | 顶栏收紧（品牌 16px、导航 56px、图标 17px） |
| **`768px`** | **主战场**：顶栏高 62px、`.nav` 隐藏、`.bottom-nav` 接管；`.main` 上下 `26/132px`；仪表盘竖排、首页网格单列；学习卡导航键移到卡下两列；测验选项单列；**触摸目标 ≥44px**（`.pill` min-height 44、`.fav-btn`/分页 44、`.round-btn` 48）；浮窗抬到 `84px + safe-area`；输入框字号 16px 防 iOS 聚焦缩放 |
| `700px` | 选书弹窗书卡片改单列 |
| `560px` | 顶栏 56px、隐藏英文副标；Hero 28px、成绩 44px；底导文字 10px；书名胶囊省略号 |
| `400px` | 极窄兜底：`.main` `100%−16px`、隐藏书名文字只留图标、标题 25px |
| `360px` | 统计单列、顶栏 52px、单词/卡片大字再降一档 |

其它防线：`.topbar .nav button em { white-space: nowrap }`、`.nav/.tools { flex: 0 0 auto }` 防书名胶囊加入后标签换行；`.field { min-width: 0 }` 防撑破 flex 行；`width: min(1160px, calc(100% − Npx))` 保证窄屏留边。

**导航不能出现空窗**：`.nav` 隐藏断点必须与 `.bottom-nav` 接管断点一致（都是 768px）。若导航在 900px 隐藏而底导要到 768px 才接管，769–900px 的平板宽度区间将没有任何导航入口。

---

## 10. 层级（z-index）

| 值 | 元素 |
|---|---|
| 0 | 底景水彩、光斑、樱枝、`petal-field--back/mid`、`.garden-background-art` |
| 1 | `.app-shell`、`.main` |
| 12 | `petal-field--front`（花瓣从内容前飘过） |
| 20 | `.topbar` |
| 30 | `.to-top`、`.pomodoro-mini` |
| 40 | `.bottom-nav` |
| 60 | `.modal` |
| 70 | `.book-picker-modal`（首访选书必须盖住其它层） |
| 9999 | `.quiz-target-cursor` |

---

## 11. 无障碍与输入

- `:focus-visible`：`.field` 3px 柔光环、`.flip-card` 2px 粉描边 + 7px offset；导航胶囊的聚光灯同时监听 `focus/blur`。
- 触屏目标 ≥44px；`@media (hover:none)` 提供按下态；长内容 `overflow-wrap: anywhere` / 释义 3 行截断 / 例句区可滚动。
- `prefers-reduced-motion` 全面降级（§7.5）；花瓣与底景 `aria-hidden` + `pointer-events: none`；按钮带 `aria-label`、进度环 `aria-valuenow`、骨架屏 `aria-busy`。
- 键盘 ← → 与触屏共用同一 `move` 与 busy 锁；自定义光标在触屏/减弱动效下自动关闭。

---

## 12. 扩展约定（改样式前逐条确认）

**Do**
- 新面板一律组合既有类：`.journal-card`（文本块）、`.badge` / `.badge.collection`（标签）、`.path-bar`（进度）、`.pill` + 柔和纯色（CTA）。
- 新颜色先加语义变量并同时给 `[data-theme="dark"]` 一套值；能靠变量解决的不要写组件覆盖。
- 卡片相关动效走 `useCardDeck`；入场保持原地淡入零位移。
- 移动端先按 768px 规则检查：底导、44px 目标、单列、安全区、长文本截断。

**Don't**
- 不要自造彩色左边框、高饱和色块、第二套按钮或第二套卡片圆角语言（选书弹框初版踩过，已全部回退）。
- 不要删 `html` 的 `overflow-x: clip` / `scrollbar-gutter: stable`、`.main` 的 `overflow-x: clip`、`.nav button em` 的 `nowrap`：都是已修复抖动/换行问题的防线。
- 不要把「状态写入」当成「切卡」：如「标为已掌握」只走 `updateWordStatus` + 索引夹取，不复制 `useCardDeck` 的动画与锁。
- 不要在暗色主题里留硬编码浅色背景；樱枝白底素材在暗色必须隐藏。
- 首访选书弹框不可关闭（无关闭按钮、Esc 与遮罩点击无效）；切书必须软重启并回首页。

---

## 13. 源码索引与变更验证

| 文件 | 职责 | 改动后 |
|---|---|---|
| `app/globals.css` | 全部 token、材质、组件、响应式、暗色主题 | `npm run build` 重新导出 `out/`（否则预览仍是旧版） |
| `components/BloomApp.jsx` | DOM 类名组合、WAAPI/GSAP 编排、手势阈值 | 同上；卡片相关改动读 §7.2 不变式 |
| `app/layout.jsx` | 主题首帧脚本、viewport、metadata | `npm run build` |
| `DESIGN_SYSTEM.md` | 硬约定与历史决策 | 新增约定时同步回写本文 §12 |
| `public/data/catalog.json` | 词库（65 期词集 / 5,843 词 / 252 主题） | 重新生成见 README「更新单词目录」 |

本工作区**没有** `AGENTS.md` / `scripts/check_*.mjs` / `init.sh`：硬约定已并入 §12，回归验证改为浏览器实测（见 §14）。
dev 预览用 `npm run dev`（默认 3000 端口）；静态预览用 `npx serve out` 或 `python -m http.server --directory out`。
本机 WorkBuddy 环境若 Next 在清理 `.next` 时被安全删除阈值拦截，用 `CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD=2000 npm run dev` 启动。

---

## 14. 2026-11-12 重构修复清单

按本文规范对既有实现做的对齐与缺陷修复。**功能 bug**（用户可感知）：

| # | 问题 | 现象 | 修复 |
|---|---|---|---|
| 1 | 记忆测试崩溃 | 点「开始测试」即抛 `TypeError: choices.map is not a function` | `shuffleWith()` 返回的是随机数生成器，洗牌必须走 `shuffled()`；`shuffled` 同时改为 Fisher–Yates 等概率 |
| 2 | 记忆卡片切卡后整张卡透明 | 切到下一张后 `.flip-scene` 的 `opacity: 0` | 离场动画 `fill: forwards` 的残留被复用 DOM 继承 → 提交前 `exit.cancel()`；`.flip-card` 补 `key={flashWord.id}` |
| 3 | 平板宽度无导航 | 769–900px 区间 `.nav` 已隐藏而底导未接管 | 导航隐藏断点 900 → 768，与底导一致 |
| 4 | 番茄钟专注时长被污染 | 休息结束后专注只剩 5 分钟 | 专注/休息时长拆成 `duration` / `breakDuration`，不再共用一个字段 |
| 5 | 手动标「待复习」不计数 | 点「待复习」后首页数字不变 | `updateWordStatus` 的 `reviewAt` 落到首档 4h；首页「待复习」改读 `stats.review`（标记数） |
| 6 | 切卡并发错乱 | 连点「下一个」索引会跳错 | 页面自带的第二份 `move` 实现删除，统一用主组件带 busy 锁的 `moveStudy` / `moveFlash` |
| 7 | 切卡横向滚动条 | 切卡时页面冒出横向滚动条 | 入场动画去掉 ±8% 横向位移；`html`/`body`/`.main` 加 `overflow-x: clip` + `scrollbar-gutter: stable` |
| 8 | 切卡空帧 | 旧卡淡出后新卡迟到一帧 | 提交改为 `flushSync(commit)` 同步落地 |
| 9 | 减弱动效形同虚设 | `prefers-reduced-motion` 下动画照跑 | 原降级规则挂在 `body:not(.motion-enabled)` 下，永不成立；改为在 reduce 媒体查询内逐条点名 |
| 10 | 暗色闪白 | 切到暗色主题瞬间白屏 | `app/layout.jsx` 注入首帧内联脚本，先写 `data-theme` 再上色 |
| 11 | 词卡键盘不可达 | 只能用鼠标打开单词 | `.word-card` 补 `role="button"` / `tabIndex` / Enter·Space 键处理 |

**设计系统缺口**（此前完全缺失）：暗色「夜樱」主题与全套暗色变量、语义 token 层（组件零硬编码底色）、`.theme-btn` 主题开关、选书弹窗（首访不可关闭 + 切书软重启回首页）、768px 起的 44px 触摸目标 / 16px 输入框 / safe-area、1080–360px 断点补齐、`@media (hover: none)` 按下态、`tabular-nums` 与 `overflow-wrap: anywhere` 补全、`.tools` 顶栏工具区布局规则、`.nav button em` 的 `nowrap` 防线。

**新增能力**（同日追加）：整页左右滑动翻页（72px 阈值，`.main` 统一接管）、卡片左右滑动（56px 阈值，覆盖沉浸学习 / 记忆卡片 / 记忆测试）、沉浸学习切换键改为卡片下方一行（`.study-nav-row`）。手势层见 §7.3。

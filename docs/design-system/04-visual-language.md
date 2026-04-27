# L4 · 视觉语言（Visual Language）

> **这一层定义"看起来什么样"。**  
> 所有视觉元素（颜色、字体、间距、圆角、阴影、图标、动效）都在本文沉淀为可引用的 Token。  
> **配套交付物**：[`tokens.css`](./tokens.css)（可直接被 L6 原型引用的 CSS 变量文件）

| 项 | 值 |
|---|---|
| 版本 | v1.0 |
| 创建日期 | 2026-04-27 |
| 所属层级 | L4 · Visual Language |
| 上游依赖 | [`01-brand-strategy.md`](./01-brand-strategy.md), [`02-design-principles.md`](./02-design-principles.md), [`03-information-architecture.md`](./03-information-architecture.md) |
| 下游依赖 | L5 组件规范、L6 GUI 原型、L7 走查清单 |

---

## 零、本层关键决策（已确认）

| 决策 | 值 | 依据 |
|---|---|---|
| 主色色相 | **暮光青 Teal** | 冷色系 + 独特识别度，避开 AI 紫俗套 |
| 模式优先 | **暗色优先（Dark-first）** | Alex 画像（Cursor/Linear/Raycast 用户） |
| 第一眼视觉重量 | **工作台状态卡 Hero** | 贯彻原则 1「状态先于功能」 |

---

## 一、颜色系统（Color System）

### 1.0 总体思路

**三层架构**：

```
┌────────────────────────────────────────┐
│  中性灰（Slate）                         │  ← 占据 UI 85% 面积，
│  决定整体"高级克制"感                     │    是产品的"氛围本底"
├────────────────────────────────────────┤
│  主品牌色 Teal（青）                     │  ← 占据 ~12% 面积，
│  用于：选中态、品牌出现、图标高亮           │    承载"AI / 工具智能"心智
├────────────────────────────────────────┤
│  状态色（Status）                         │  ← 占据 ~3% 面积，
│  Mint 绿 / Amber 黄 / Rose 红 / Sky 蓝   │    仅用于状态反馈，不入品牌
└────────────────────────────────────────┘
```

**铁律**：
1. 组件**永远引用语义 Token**（如 `--color-brand-default`），**禁止**直接写 HEX
2. 任何颜色都必须**同时定义浅色和暗色模式**，不允许"单边设计"
3. Teal 主色**只在关键动作、选中态、品牌出现处**使用；禁止大面积铺陈

---

### 1.1 主品牌色 · Teal（暮光青）

基于 `#0D9488` 为核心的 11 档色阶。色相约 **178°**，带一丝蓝底，冷静而独特。

| Token | HEX | 典型用途 |
|---|---|---|
| `teal-50`  | `#F0FDFA` | 浅色模式下的品牌浅底、Tag 底 |
| `teal-100` | `#CCFBF1` | 浅色模式选中背景、Hover 高亮 |
| `teal-200` | `#99F6E4` | 分隔线强调 |
| `teal-300` | `#5EEAD4` | 暗色模式品牌文字、次要图标 |
| `teal-400` | `#2DD4BF` | 暗色模式主品牌色（默认） |
| **`teal-500`** | **`#14B8A6`** | **浅色模式主品牌色默认** |
| `teal-600` | `#0D9488` | 浅色模式主按钮 Hover |
| `teal-700` | `#0F766E` | 浅色模式主按钮 Pressed |
| `teal-800` | `#115E59` | 暗色模式主按钮背景 |
| `teal-900` | `#134E4A` | 暗色模式品牌浅底 |
| `teal-950` | `#042F2E` | 暗色模式最深色 |

**为什么 Teal-400 是暗色默认、Teal-500 是浅色默认？**  
在暗背景上，过饱和度的主色会"烧眼"；在亮背景上，过亮的主色又"发飘"。两档错位是保证**双模式对比度对等**的标准做法。

---

### 1.2 中性灰 · Slate（石板灰）

带极轻微冷调的中性灰，是产品 85% 面积的"氛围本底"。基于蓝调的 Slate 而非纯灰，避免廉价感。

| Token | HEX | 浅色模式用途 | 暗色模式用途 |
|---|---|---|---|
| `slate-0`   | `#FFFFFF` | 卡片、弹层背景 | — |
| `slate-50`  | `#F8FAFC` | 页面主背景、侧栏 | — |
| `slate-100` | `#F1F5F9` | 悬浮背景、分隔区 | — |
| `slate-200` | `#E2E8F0` | 边框、分割线 | — |
| `slate-300` | `#CBD5E1` | 禁用文字、占位 | — |
| `slate-400` | `#94A3B8` | 次要文字 | 辅助文字 |
| `slate-500` | `#64748B` | 辅助文字 | 次要文字 |
| `slate-600` | `#475569` | 正文次级 | — |
| `slate-700` | `#334155` | 正文主色 | 分割线、边框 |
| `slate-800` | `#1E293B` | — | 卡片、弹层 |
| `slate-900` | `#0F172A` | — | 主背景 |
| `slate-950` | `#020617` | — | **最底层画布** |

**暗色模式的"三级空间感"**：
- `slate-950` = 最底层画布（最深）
- `slate-900` = 主工作区背景
- `slate-800` = 卡片 / 弹层（最浅）

这样形成"**由深到浅的层级感**"，比单一深色更有立体感，符合"抽屉"隐喻的深度层次。

---

### 1.3 状态色（Status Colors）

仅用于反馈，不入品牌。**每种状态都有浅/暗两档色**：

#### Success · Mint 绿（已同步 / 成功）

| Token | HEX | 用途 |
|---|---|---|
| `mint-100` | `#DCFCE7` | 浅色模式成功浅底 |
| `mint-400` | `#4ADE80` | **暗色模式成功默认** |
| `mint-500` | `#22C55E` | **浅色模式成功默认** |
| `mint-600` | `#16A34A` | 浅色模式成功文字（强调） |

> ⚠️ **重要**：成功绿必须和品牌青在色相上**有足够距离**（青 178° vs 绿 142°，相距 36°）。这样"已同步"绿色不会被误认为是"品牌色", 状态识别清晰。

#### Warning · Amber 黄（需更新）

| Token | HEX | 用途 |
|---|---|---|
| `amber-100` | `#FEF3C7` | 浅色模式警告浅底 |
| `amber-400` | `#FBBF24` | **暗色模式警告默认** |
| `amber-500` | `#F59E0B` | **浅色模式警告默认** |
| `amber-600` | `#D97706` | 浅色模式警告文字 |

#### Danger · Rose 红（失败 / 危险）

| Token | HEX | 用途 |
|---|---|---|
| `rose-100` | `#FFE4E6` | 浅色模式危险浅底 |
| `rose-400` | `#FB7185` | **暗色模式危险默认** |
| `rose-500` | `#F43F5E` | **浅色模式危险默认** |
| `rose-600` | `#E11D48` | 浅色模式危险文字 |

#### Info · Sky 蓝（信息 / 提示）

| Token | HEX | 用途 |
|---|---|---|
| `sky-100` | `#E0F2FE` | 浅色模式信息浅底 |
| `sky-400` | `#38BDF8` | **暗色模式信息默认** |
| `sky-500` | `#0EA5E9` | **浅色模式信息默认** |

---

### 1.4 语义 Token（Semantic Tokens）

**这是组件真正使用的 Token。** 组件不直接用 `teal-500`，而用 `--color-brand-default`。这样后续换色只需改一处。

#### 背景层级

| Token | Light Mode | Dark Mode | 说明 |
|---|---|---|---|
| `--color-bg-canvas` | `#F8FAFC` (slate-50) | `#020617` (slate-950) | 最底层画布 |
| `--color-bg-default` | `#FFFFFF` (slate-0) | `#0F172A` (slate-900) | 默认背景（主工作区） |
| `--color-bg-subtle` | `#F1F5F9` (slate-100) | `#1E293B` (slate-800) | 次级背景（卡片、侧栏悬浮） |
| `--color-bg-muted` | `#F1F5F9` (slate-100) | `#1E293B` (slate-800) | 静态容器（代码块、标签底） |
| `--color-bg-hover` | `#F1F5F9` (slate-100) | `#1E293B` (slate-800) | 悬浮态背景 |
| `--color-bg-selected` | `#F0FDFA` (teal-50) | `#042F2E` (teal-950) | 选中态背景 |
| `--color-bg-overlay` | `rgba(15,23,42,0.48)` | `rgba(2,6,23,0.72)` | Modal 遮罩 |

#### 文字层级

| Token | Light Mode | Dark Mode | 说明 |
|---|---|---|---|
| `--color-text-primary` | `#0F172A` (slate-900) | `#F8FAFC` (slate-50) | 主文字 |
| `--color-text-secondary` | `#475569` (slate-600) | `#CBD5E1` (slate-300) | 次文字（描述、元信息） |
| `--color-text-tertiary` | `#64748B` (slate-500) | `#94A3B8` (slate-400) | 辅助文字（时间戳、路径） |
| `--color-text-placeholder` | `#94A3B8` (slate-400) | `#64748B` (slate-500) | 输入框占位 |
| `--color-text-disabled` | `#CBD5E1` (slate-300) | `#475569` (slate-600) | 禁用文字 |
| `--color-text-inverse` | `#FFFFFF` | `#0F172A` | 主按钮文字等反色场景 |

#### 边框

| Token | Light Mode | Dark Mode | 说明 |
|---|---|---|---|
| `--color-border-default` | `#E2E8F0` (slate-200) | `#334155` (slate-700) | 默认边框 |
| `--color-border-strong` | `#CBD5E1` (slate-300) | `#475569` (slate-600) | 强调边框、输入框 |
| `--color-border-brand` | `#14B8A6` (teal-500) | `#2DD4BF` (teal-400) | 品牌边框（Focus、选中） |

#### 品牌色

| Token | Light Mode | Dark Mode | 说明 |
|---|---|---|---|
| `--color-brand-default` | `#14B8A6` (teal-500) | `#2DD4BF` (teal-400) | 主品牌色（按钮、链接、选中） |
| `--color-brand-hover` | `#0D9488` (teal-600) | `#5EEAD4` (teal-300) | Hover |
| `--color-brand-active` | `#0F766E` (teal-700) | `#14B8A6` (teal-500) | Pressed |
| `--color-brand-subtle` | `#F0FDFA` (teal-50) | `#042F2E` (teal-950) | 品牌浅底 |
| `--color-brand-muted` | `#CCFBF1` (teal-100) | `#134E4A` (teal-900) | 品牌中等底 |

#### 状态色（语义）

| Token | Light Mode | Dark Mode | 说明 |
|---|---|---|---|
| `--color-success` | `#22C55E` (mint-500) | `#4ADE80` (mint-400) | 成功（已同步） |
| `--color-success-subtle` | `#DCFCE7` (mint-100) | `#14532D` | 成功浅底 |
| `--color-warning` | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) | 警告（需更新） |
| `--color-warning-subtle` | `#FEF3C7` (amber-100) | `#78350F` | 警告浅底 |
| `--color-danger` | `#F43F5E` (rose-500) | `#FB7185` (rose-400) | 危险（失败） |
| `--color-danger-subtle` | `#FFE4E6` (rose-100) | `#881337` | 危险浅底 |
| `--color-info` | `#0EA5E9` (sky-500) | `#38BDF8` (sky-400) | 信息 |
| `--color-info-subtle` | `#E0F2FE` (sky-100) | `#0C4A6E` | 信息浅底 |

---

### 1.5 菜单栏色点（Tray Icon Dot）

承担"全局新鲜度"信号（L3 决策 KD-02）。**这 4 个颜色在任何系统主题下都必须清晰可辨**。

| 状态 | 颜色 | 说明 |
|---|---|---|
| 🟢 全部最新 | `#22C55E` (mint-500) | 默认常态，甚至可以无色点 |
| 🟡 需更新 | `#F59E0B` (amber-500) | 有 N 个 Skill 待同步 |
| 🔴 失败 | `#F43F5E` (rose-500) | 有同步失败 / 工具未连接 |
| ⚙️ 同步中 | `#2DD4BF` (teal-400) | 旋转动画，品牌色 |

**色点规格**：直径 6px，贴在图标右下角，带 1px 白色描边（浅背景）或 1px 深色描边（暗背景）。

---

### 1.6 颜色使用比例（60-30-10 本地化）

典型页面的配色占比：

```
中性色 Slate  ██████████████████  ~85%   背景、文字、边框
主品牌 Teal   ███                 ~10%   按钮、选中、品牌出现
状态色       █                    ~5%    徽章、反馈
```

**违反此比例的设计都是错误设计。** 常见错误：
- ❌ Hero 用 Teal 大面积渐变背景（→ 10% 变 40%，破坏克制感）
- ❌ Success 绿大量用于装饰（→ 5% 变 15%，稀释状态识别）
- ❌ 多种状态色同时出现 2 种以上（→ 花花绿绿）

---

## 二、字体与排版（Typography）

### 2.1 字体族（Font Family）

**策略**：系统原生优先，网络字体兜底。保证性能与本土化。

#### 中文字体栈

```css
font-family:
  "PingFang SC",           /* macOS */
  "Microsoft YaHei UI",    /* Windows（YaHei UI 比 YaHei 更细更现代） */
  "Noto Sans SC",          /* Linux / 兜底 */
  -apple-system,
  BlinkMacSystemFont,
  sans-serif;
```

> ⚠️ 不用 Microsoft YaHei（老版）—— 字重设计太硬，与"友好"气质冲突。

#### 英文 / 数字字体栈

```css
font-family:
  "Inter",                 /* 首选网络字体（自托管） */
  -apple-system,
  "SF Pro Text",           /* macOS */
  "Segoe UI Variable",     /* Windows 11 */
  "Segoe UI",              /* Windows 10 */
  Roboto,                  /* Android */
  sans-serif;
```

#### 等宽字体栈（代码 / 路径 / Hash）

```css
font-family:
  "JetBrains Mono",        /* 首选网络字体（自托管） */
  "SF Mono",               /* macOS */
  "Menlo",
  "Cascadia Code",         /* Windows 11 */
  "Consolas",
  monospace;
```

> 📦 **交付要求**：打包时自托管 `Inter` 与 `JetBrains Mono` 的 `.woff2`，避免依赖 CDN，确保离线可用。

### 2.2 字号层级（Type Scale）

基于 4px 栅格的模数字号，**全体系共 10 档**。行高比为 1.4~1.5（标题略紧）。

| Token | Size / LineHeight | Weight | 用途 |
|---|---|---|---|
| `text-display` | 32 / 40 px | 600 | 启动页 / 欢迎页大标题（慎用） |
| `text-h1` | 24 / 32 px | 600 | 页面主标题 |
| `text-h2` | 20 / 28 px | 600 | 区块标题、Modal 标题 |
| `text-h3` | 16 / 24 px | 600 | 卡片标题、分组标题 |
| `text-body-lg` | 16 / 24 px | 400 | 正文（长文阅读） |
| **`text-body`** | **14 / 22 px** | **400** | **默认正文、表格、表单** |
| `text-body-sm` | 13 / 20 px | 400 | 次要文字、描述 |
| `text-caption` | 12 / 18 px | 400 | 辅助信息、路径、时间戳 |
| `text-code` | 13 / 20 px | 400 (mono) | 代码、hash、路径 |
| `text-label` | 12 / 16 px | 500 | Tag、Badge、表单 label |

### 2.3 排版铁律

1. **一屏标题层级 ≤ 3 级**（H1→H2→H3）。超了就拆视图
2. **正文宽度 ≤ 680px**。贯彻原则"留白充足"
3. **中英混排不加空格**，靠字体本身视觉平衡
4. **数字用 `tabular-nums`** —— 表格、hash、版本号必须等宽对齐
5. **禁止用斜体强调**（中文不支持好），改用加粗或品牌色
6. **路径、hash、size 必须用等宽字体** —— 这是"工程精准"气质的核心载体

---

## 三、间距系统（Spacing）

### 3.1 基础栅格

**基础单位 = 4px**。所有间距必须是 4 的倍数。

| Token | Value | 用途 |
|---|---|---|
| `space-0` | 0 | — |
| `space-1` | 4 px | 图标与文字间的贴合间距 |
| `space-2` | 8 px | 按钮内边距（竖） |
| `space-3` | 12 px | 紧凑间距 |
| **`space-4`** | **16 px** | **默认间距（元素间、卡片内边距）** |
| `space-5` | 20 px | 中等间距 |
| `space-6` | 24 px | 卡片之间、表单字段之间 |
| `space-8` | 32 px | 区块之间（中） |
| `space-10` | 40 px | 区块之间（大） |
| `space-12` | 48 px | 页面顶部间距 |
| `space-16` | 64 px | Hero / 空状态插画周围 |

### 3.2 布局原则

- **亲近原则**：相关元素间距 ≤ `space-4`；不相关元素间距 ≥ `space-6`
- **侧栏宽度**：主窗口 `240px` 展开 / `64px` 收起；Popover 无侧栏
- **主内容区最小**：`720px`（L3 定义的 800×600 最小窗口 - 64 侧栏 ≈ 720）
- **卡片内边距**：默认 `space-6`（24px），紧凑列表 `space-4`（16px）
- **Hero 区上下间距**：`space-10` 以上，营造呼吸感（原则"留白充足"）

---

## 四、圆角（Radius）

**策略**：偏大的圆角（但不过分），强化"友好"亲和感。

| Token | Value | 用途 |
|---|---|---|
| `radius-none` | 0 | 分割线、表头 |
| `radius-sm` | 4 px | Tag、Badge、小输入框 |
| `radius-md` | 8 px | 标准按钮、输入框、下拉菜单项 |
| **`radius-lg`** | **12 px** | **卡片、列表项、弹窗内区块** |
| `radius-xl` | 16 px | 主要弹窗容器（Modal） |
| `radius-2xl` | 20 px | Hero 状态卡、欢迎页装饰块 |
| `radius-full` | 9999 px | 头像、圆形按钮、Pill 形 Tag |

**约束**：
- ❌ 禁止 `radius < 4px` 的方角元素（除非是分割线/表头）—— L1"友好"气质要求
- ✅ 卡片圆角 ≥ 8px 是最低线

---

## 五、阴影（Elevation）

**策略**：轻盈阴影，拒绝厚重投影。

| Token | Light Mode | Dark Mode | 用途 |
|---|---|---|---|
| `shadow-none` | `none` | `none` | 扁平元素 |
| `shadow-xs` | `0 1px 2px rgba(15,23,42,.04)` | `0 1px 2px rgba(0,0,0,.4)` | 静态卡片细微分层 |
| `shadow-sm` | `0 2px 4px rgba(15,23,42,.06)` | `0 2px 4px rgba(0,0,0,.5)` | Hover 悬浮 |
| `shadow-md` | `0 4px 12px rgba(15,23,42,.08)` | `0 4px 12px rgba(0,0,0,.6)` | Popover、Dropdown |
| `shadow-lg` | `0 12px 32px rgba(15,23,42,.12)` | `0 12px 32px rgba(0,0,0,.7)` | Modal、Dialog |
| `shadow-focus` | `0 0 0 3px rgba(20,184,166,.24)` | `0 0 0 3px rgba(45,212,191,.32)` | 键盘焦点环（品牌色光晕） |

**约束**：
- ❌ 禁止内阴影（`inset`）
- ❌ 禁止彩色厚阴影（如大面积品牌色投影）
- ❌ 禁止多层堆叠阴影（1 个元素最多 1 个阴影）

---

## 六、图标系统（Iconography）

### 6.1 风格规范

- **风格**：线性（Outline）为主，笔画 `1.5 px`
- **端点**：圆角（`stroke-linecap: round`）
- **拐角**：圆角（`stroke-linejoin: round`）
- **栅格**：`16×16` / `20×20` / `24×24` 三档
- **填充变体**（Filled）：仅用于选中态（侧栏当前项）或状态图标（已同步勾、警告三角）

### 6.2 推荐图标库

**首选：[Lucide](https://lucide.dev)** — 1.5px 笔画原生匹配，MIT 开源，React/Svelte/Vue 都有官方包。

**禁止**：
- ❌ 混用多个图标库
- ❌ 多色扁平插画风图标
- ❌ 3D / 拟物 / 手绘风格

### 6.3 核心图标映射

本产品用到的核心对象图标（从 Lucide 挑选，后续固化）：

| 对象 | 图标 | Lucide 名称 |
|---|---|---|
| 工作台 | 🏠 | `home` |
| Skills | 📦 | `package` 或 `sparkles` |
| Commands | ⚡ | `zap` 或 `terminal` |
| Agents | 🤖 | `bot` |
| Rules | 📜 | `scroll` 或 `file-text` |
| 已连接工具 | 🔗 | `link` 或 `plug` |
| 项目 | 📂 | `folder` |
| 设置 | ⚙️ | `settings` |
| 同步中 | ⟳ | `refresh-cw` |
| 已同步 | ✓ | `check-circle` |
| 需更新 | ⚠ | `alert-triangle` |
| 失败 | ✕ | `x-circle` |
| 搜索 | 🔍 | `search` |
| 添加 | + | `plus` |
| 更多 | ⋯ | `more-horizontal` |

### 6.4 图标色彩规则

| 状态 | 颜色变量 |
|---|---|
| 默认 | `--color-text-secondary` |
| Hover | `--color-text-primary` |
| 选中 / 品牌出现 | `--color-brand-default` |
| 成功 | `--color-success` |
| 警告 | `--color-warning` |
| 危险 | `--color-danger` |

---

## 七、动效系统（Motion）

### 7.1 时长 Token

| Token | Value | 用途 |
|---|---|---|
| `duration-instant` | 80 ms | 微交互（按钮按下、Checkbox 勾选） |
| `duration-fast` | 160 ms | 常规过渡（Hover、展开/收起） |
| `duration-normal` | 240 ms | 面板切换、Modal 出现 |
| `duration-slow` | 400 ms | 页面过渡、Empty State 进入 |
| **`duration-sync` ⭐** | **640 ms** | **"资源滑向工具"同步动效（L3 Flow 2 魔法瞬间专用）** |

### 7.2 缓动曲线

| Token | Value | 用途 |
|---|---|---|
| `easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 默认缓动（进入动效） |
| `easing-exit` | `cubic-bezier(0.4, 0, 1, 1)` | 退出缓动（Modal 关闭） |
| `easing-sync` | `cubic-bezier(0.33, 1, 0.68, 1)` | 同步动效专用（带轻微回弹） |

### 7.3 "同步动效" 特别规范（L3 的重点打磨项）

> 这是**整个产品唯一允许超过 400ms 的动效**，承担"你写一次，它到处都在"的情绪传达。

**动作设计**：

```
[资源卡片从源滑向每个工具]
  1. 卡片生成"幽灵副本"（原卡片保持不动）
  2. 副本沿抛物线路径飞向每个同步目标（≈ 300ms）
  3. 到达目标时触发一次"微弹" + 绿色勾图标（≈ 240ms）
  4. 幽灵副本淡出，真实状态徽章从灰变绿（≈ 100ms）
  
  总时长：≤ 640ms
  缓动曲线：easing-sync
```

**为什么是抛物线而不是直线**：抛物线有"轻盈感"和"物理感"，呼应"抽屉"隐喻的物理世界逻辑，而非赛博数字感。

### 7.4 动效铁律（贯彻原则 2 "明确先于惊喜"）

1. ❌ 禁止 flip 翻牌动画（数字更新直接替换）
2. ❌ 禁止 3D 翻转、视差滚动、光标跟随粒子
3. ❌ 禁止装饰性 Loading 动画（不推动信息的都是装饰）
4. ✅ Spinner 用于异步等待，**≥ 400ms 才显示**（避免闪烁）
5. ✅ 所有动效必须**尊重系统 `prefers-reduced-motion`** 设置

---

## 八、暗色模式设计规范

### 8.1 不是"反色"，是"重新设计"

**常见错误**：把浅色模式"反色"得到暗色模式。这会导致：
- 主色过饱和"烧眼"
- 阴影失去层次
- 对比度刺眼

**正确做法**：
- 主色在暗模式**降低饱和度**（teal-500 → teal-400）
- 背景用"**三层深度**"（950 / 900 / 800）而非单一深色
- 阴影**保留但更深**（RGBA 透明度 > 浅色模式）
- 文字**不用纯白**（`#F8FAFC` 而非 `#FFFFFF`），减轻"发光感"

### 8.2 切换机制（L5 会落地）

- 跟随系统（默认）
- 强制浅色
- 强制暗色
- 切换瞬间有 `duration-fast` 过渡（颜色渐变，不是瞬切）

---

## 九、本层结论对下游的约束清单

| L4 结论 | 约束了 L5~L7 的什么 |
|---|---|
| Teal + Slate + 状态色 | L5 所有组件只能引用语义 Token，禁止硬编码颜色 |
| 暗色优先 | L6 原型默认启动暗色；L7 走查必查暗色对等 |
| 等宽字体承载路径/hash | L5 路径显示组件必须用 `--font-mono` |
| 圆角 ≥ 8px | L5 所有按钮、卡片、输入框 radius 下限 |
| 同步动效 640ms | L5 Sync 组件必须实现此动效；其它组件不允许超过 400ms |
| 阴影 ≤ 1 层 | L5 禁止多层阴影堆叠 |
| 数字 tabular-nums | L5 所有表格、hash、版本号强制应用 |

---

## 十、变更记录

| 版本 | 日期 | 变更说明 |
|---|---|---|
| v1.0 | 2026-04-27 | 首版发布：Teal 主色 + Slate 中性 + 暗色优先 + 完整 Token 系统 |

---

## 十一、下一步

- **配套文件**：[`tokens.css`](./tokens.css) — 本文所有 Token 的 CSS 变量实现
- **下一层**：`05-component-spec.md` —— 基于本 Token 系统定义按钮、卡片、列表等组件
- **上一层**：`03-information-architecture.md` —— 视觉语言的服务对象

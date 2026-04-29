# L5 · 组件规范（Component Spec）

> **这一层是视觉语言到真实 UI 的"翻译层"。**  
> 每个组件都严格遵循 L1~L4 的约束，提供视觉规则、状态定义、文案规范、可访问性要求和代码骨架。  
> **配套交付物**：[`components.css`](./components.css)（与本文一一对应的 CSS 实现）

| 项 | 值 |
|---|---|
| 版本 | v1.0 |
| 创建日期 | 2026-04-27 |
| 所属层级 | L5 · Component Spec |
| 上游依赖 | L1 / L2 / L3 / L4 |
| 下游依赖 | L6 GUI 原型、L7 走查清单 |

---

## 零、组件清单（12 个 + 特殊形态）

| # | 组件 | 作用域 | 核心 CSS 类 |
|---|---|---|---|
| 1 | Button 按钮 | 全局 | `.btn` + 修饰符 |
| 2 | StatusBadge 状态徽章 ⭐ | Skills 列表、详情、Hero | `.badge` |
| 3 | Card 卡片 | 列表、详情 | `.card` |
| 4 | HeroCard 状态 Hero 卡 ⭐ | 工作台首屏 | `.hero-card` |
| 5 | Sidebar 侧栏 | 主窗口 | `.sidebar` |
| 6 | Input 输入框 / Search 搜索 | 列表、设置、Cmd+K | `.input` |
| 7 | ListRow 列表行 | Skills、工具列表 | `.list-row` |
| 8 | Tag 标签 | 列表、详情 | `.tag` |
| 9 | Tab 标签页 | Skill 详情 | `.tabs` |
| 10 | Modal 弹窗 | 同步、导入 | `.modal` |
| 11 | Toast 轻提示 | 全局 | `.toast` |
| 12 | EmptyState 空状态 | 所有列表 | `.empty-state` |

⭐ = 产品核心组件（承载"新鲜度"这一核心价值）

### 组件规范五段式

每个组件都包含以下 5 个部分：

| 段 | 内容 |
|---|---|
| 📖 **视觉规则** | 尺寸、色彩、间距、圆角、阴影的具体值（引用 L4 Token） |
| 🔄 **状态定义** | default / hover / active / focus / disabled / loading 等 |
| ✍️ **文案规范** | 该组件内允许的文案风格（引用 L1 语气规范） |
| ♿ **可访问性** | 键盘、语义、对比度要求 |
| 💻 **代码骨架** | HTML 结构示例 + 对应 CSS 类引用 |

---

# 1 · Button 按钮

> L2 约束：「诚实 + 明确」 → 按钮文案必须动词开头，禁用卖萌用语。

## 📖 视觉规则

### 层级（Variant）

| 变体 | 视觉 | 何时使用 | 单屏数量上限 |
|---|---|---|---|
| **Primary 主** | 实心品牌色 + 反色文字 | 页面最核心的一个动作 | **≤ 1** |
| **Secondary 次** | 透明底 + 1px 边框 + 主文字色 | 常规操作（取消、返回） | 不限 |
| **Ghost 幽灵** | 无边框无背景，Hover 时显 `bg-hover` | 工具栏、图标按钮 | 不限 |
| **Danger 危险** | Danger 色边框/文字，Hover 变实心 | 删除、断开、清空 | ≤ 1 |

### 尺寸

| 档 | 高度 | 内边距 | 文字 | 使用场景 |
|---|---|---|---|---|
| `sm` | 28 px | `0 var(--space-3)` (12px) | `text-body-sm` | 列表内嵌操作 |
| **`md` 默认** | **36 px** | **`0 var(--space-4)` (16px)** | `text-button` | 绝大多数场景 |
| `lg` | 44 px | `0 var(--space-5)` (20px) | `text-button` | Hero / Welcome |

### 规格

- 圆角：`var(--radius-md)` = 8px
- 字体：`--text-button-size` = 14px / 500
- 图标与文字间距：`var(--space-2)` = 8px
- 过渡：`var(--duration-fast) var(--easing-standard)`

## 🔄 状态定义

| 状态 | Primary | Secondary / Ghost |
|---|---|---|
| default | `bg: brand-default` / `text: inverse` | `border: border-default` / `text: primary` |
| hover | `bg: brand-hover` | `bg: bg-hover` |
| active | `bg: brand-active` | `bg: bg-hover`（无额外变化）|
| focus | `box-shadow: shadow-focus`（品牌色光晕） | 同上 |
| disabled | opacity 0.5 + `cursor: not-allowed` | 同左 |
| loading | 图标替换为 Spinner，**文字保留**，禁用点击 | 同左 |

> ⚠️ **L2 原则 3 诚实**：Loading 时**必须保留文字**，不能只剩转圈——用户要能看懂"在做什么"。

## ✍️ 文案规范

| ✅ 正例 | ❌ 反例 |
|---|---|
| 「同步全部」 | 「立即执行同步操作」 |
| 「连接 CodeBuddy」 | 「去连接一下 CodeBuddy 吧～」 |
| 「删除 Skill」 | 「删掉它 🗑️」 |
| 「在编辑器中打开」 | 「打开」（缺少宾语） |

**铁律**：
1. 动词开头
2. 3~6 字为佳，超过 8 字必须精简
3. 禁用装饰性 Emoji / 语气词 / 省略号

## ♿ 可访问性

- **键盘**：`Tab` 可聚焦，`Enter`/`Space` 触发
- **焦点环**：必须显示（用 `--shadow-focus`）
- **图标按钮**：必须有 `aria-label`
- **Loading**：必须有 `aria-busy="true"`
- **对比度**：文字 vs 背景必须 ≥ 4.5:1（WCAG AA）

## 💻 代码骨架

```html
<!-- Primary 主按钮 -->
<button class="btn btn--primary">同步全部</button>

<!-- Secondary 次按钮 + 图标 -->
<button class="btn btn--secondary">
  <svg class="btn__icon"><!-- lucide:refresh-cw --></svg>
  重新扫描
</button>

<!-- Ghost 图标按钮 -->
<button class="btn btn--ghost btn--icon" aria-label="更多操作">
  <svg><!-- lucide:more-horizontal --></svg>
</button>

<!-- Danger 危险按钮 -->
<button class="btn btn--danger">删除 Skill</button>

<!-- Loading -->
<button class="btn btn--primary" aria-busy="true" disabled>
  <svg class="btn__icon btn__icon--spin"><!-- spinner --></svg>
  同步中…
</button>
```

---

# 2 · StatusBadge 状态徽章 ⭐

> L3 约束：承载产品"新鲜度"核心价值，是**视觉上第二醒目的组件**（仅次于 HeroCard）。

## 📖 视觉规则

### 5 种状态

| 状态 | 底色 | 文字 / 图标色 | 典型文案 |
|---|---|---|---|
| `success` 已同步 | `--color-success-subtle` | `--color-success-text` | 已同步 |
| `warning` 需更新 | `--color-warning-subtle` | `--color-warning-text` | 需更新 |
| `danger` 失败 | `--color-danger-subtle` | `--color-danger-text` | 同步失败 |
| `neutral` 未同步 | `--color-bg-muted` | `--color-text-secondary` | 未同步 |
| `loading` 同步中 | `--color-brand-subtle` | `--color-brand-default` | 同步中… |

### 结构

**圆点 + 文字**（Pill 形态）：
```
●  已同步
```
- 圆点：直径 6px
- 圆点与文字间距：`var(--space-1)` = 4px
- 内边距：`var(--space-1) var(--space-2)` (4px 8px)
- 圆角：`var(--radius-full)`
- 字号：`--text-label-size` = 12px / 500
- 高度：20px（sm）/ 24px（default）

### 尺寸

| 档 | 高度 | 使用场景 |
|---|---|---|
| `sm` | 20 px | 列表内嵌、密集场景 |
| `md` 默认 | 24 px | 卡片、详情页 |

## 🔄 状态定义

- default / hover 无差异（徽章是**展示型**组件，默认不可交互）
- 如需可点击（如点击进入差异对比），外层包 `<button>`，徽章本身不加 hover 样式

## ✍️ 文案规范

**保持简洁，≤ 4 字**：

| ✅ | ❌ |
|---|---|
| 已同步 | 已经成功同步了哦 |
| 需更新 | 存在版本差异，需要进行同步 |
| 同步失败 | Oops 出错啦 😭 |
| 未同步 | 尚未被同步 |

## ♿ 可访问性

- 仅依赖颜色区分状态 ❌ 不够 —— **必须**同时用**圆点颜色 + 文字**传达状态
- 色盲用户也能分辨（Mint / Amber / Rose 三色在色盲测试中均可区分）

## 💻 代码骨架

```html
<span class="badge badge--success">
  <span class="badge__dot"></span>
  已同步
</span>

<span class="badge badge--warning">
  <span class="badge__dot"></span>
  需更新
</span>

<span class="badge badge--loading">
  <span class="badge__dot badge__dot--pulse"></span>
  同步中…
</span>
```

---

# 3 · Card 卡片

> L3 约束：Skills 列表、工具列表、详情页的信息容器。

## 📖 视觉规则

- 背景：`--color-bg-default`
- 边框：`1px solid var(--color-border-default)`
- 圆角：`var(--radius-lg)` = 12px
- 内边距：`var(--space-6)` = 24px（紧凑场景可用 `--space-4`）
- 阴影：**默认无**；Hover 时 `--shadow-sm`
- 过渡：`var(--duration-fast) var(--easing-standard)`

## 🔄 状态定义

| 状态 | 视觉 |
|---|---|
| default | 无阴影，`border-default` |
| hover（可点击时） | `box-shadow: --shadow-sm`，`border-color: --color-border-strong` |
| selected | `border-color: --color-border-brand` + `box-shadow: --shadow-focus` |
| disabled | opacity 0.5，禁用 hover |

## ✍️ 文案规范

- 标题：`text-h3`（16px / 600）
- 元信息行：`text-caption`（12px）+ `--color-text-tertiary`
- 描述：`text-body-sm`（13px）+ `--color-text-secondary`，**最多 2 行** + 省略号

## ♿ 可访问性

- 整卡可点击时，外层用 `<a>` 或 `<button>`，不用 `div + onclick`
- 整卡可点击时，内部的"更多操作"按钮要阻止事件冒泡

## 💻 代码骨架

```html
<article class="card">
  <header class="card__header">
    <h3 class="card__title">code-review</h3>
    <button class="btn btn--ghost btn--icon" aria-label="更多">…</button>
  </header>
  <div class="card__meta">Skill · User · 更新于 2 小时前</div>
  <p class="card__desc">提供全面的代码审查指导和最佳实践。</p>
  <div class="card__footer">
    <span class="badge badge--success">● 已同步 CodeBuddy</span>
    <span class="badge badge--success">● 已同步 Claude Code</span>
  </div>
</article>
```

---

# 4 · HeroCard 状态 Hero 卡 ⭐

> L3 约束：工作台首屏的视觉灵魂，承载**全局新鲜度**。整个产品"第一眼重量"所在。

## 📖 视觉规则

- 背景：`--color-bg-default`
- 边框：`1px solid var(--color-border-default)`
- 圆角：`var(--radius-2xl)` = 20px（比普通卡片更圆润，强化"主角"感）
- 内边距：`var(--space-10) var(--space-8)` (40px 32px)
- 最小高度：180 px
- 阴影：**默认无**（克制）

### 状态主色（动态变化）

整个 Hero 卡的**主色色调随状态变化**，这是产品的情绪核心：

| 场景 | 左侧状态色条 | 图标色 | 主文案色 |
|---|---|---|---|
| 全部最新 | `--color-success` 4px 竖条 | `--color-success` | `--color-text-primary` |
| 有需更新 | `--color-warning` 4px 竖条 | `--color-warning` | `--color-text-primary` |
| 有失败 | `--color-danger` 4px 竖条 | `--color-danger` | `--color-text-primary` |
| 同步中 | `--color-brand-default` 4px 竖条（脉动） | `--color-brand-default`（旋转） | `--color-text-primary` |

### 结构

```
┌──────────────────────────────────────────────────┐
│▊                                                 │
│▊   ✓   全部最新                                   │  ← 状态图标 + 主文案
│▊                                                 │      h1 24/32/600
│▊       3 个工具 · 12 个 Skill · 刚刚同步          │
│▊       ↑ text-body-sm · text-tertiary           │
│▊                                                 │
│▊                         [⟳ 重新扫描]            │  ← Secondary 按钮
└──────────────────────────────────────────────────┘
↑ 4px 状态色竖条
```

## 🔄 状态定义

无 hover 状态（非交互组件）。主要靠"状态色条 + 图标 + 文案"三联动。

## ✍️ 文案规范

主文案只有 **4 种模板**（高度标准化）：

| 场景 | 主文案 | 副文案 |
|---|---|---|
| 全部最新 | `全部最新` | `N 个工具 · M 个 Skill · 最近同步 X 前` |
| 有需更新 | `N 个 Skill 需更新` | `分布在 M 个工具 · 点击查看差异` |
| 有失败 | `N 项同步失败` | `查看原因并重试` |
| 同步中 | `同步中…（X / Y）` | `预计还需 N 秒` |

## ♿ 可访问性

- 状态变化时 **aria-live="polite"** 通知
- 图标要有文字替代（不能只靠颜色表达状态）

## 💻 代码骨架

```html
<section class="hero-card hero-card--success">
  <div class="hero-card__bar"></div>
  <div class="hero-card__content">
    <div class="hero-card__main">
      <svg class="hero-card__icon"><!-- lucide:check-circle --></svg>
      <h1 class="hero-card__title">全部最新</h1>
    </div>
    <p class="hero-card__sub tabular-nums">
      3 个工具 · 12 个 Skill · 刚刚同步
    </p>
  </div>
  <div class="hero-card__action">
    <button class="btn btn--secondary">
      <svg><!-- refresh-cw --></svg>
      重新扫描
    </button>
  </div>
</section>
```

---

# 5 · Sidebar 侧栏

> L3 约束：对象导向分组，三段式结构，支持展开/收起。

## 📖 视觉规则

- 宽度：展开 240 px / 收起 64 px
- 背景：`--color-bg-subtle`
- 右边框：`1px solid var(--color-border-default)`
- 顶部 Logo 区高度：64 px
- 分组之间：`1px solid var(--color-border-default)` 分割线 + 上下 `var(--space-2)` 空白
- 分组标签（可选）：`text-caption` + `--color-text-tertiary`，全大写或 Title Case

### 导航项（NavItem）

- 高度：36 px
- 左右内边距：`var(--space-3)` = 12px
- 左右外边距：`var(--space-2)` = 8px（营造"胶囊"感）
- 圆角：`var(--radius-md)` = 8px
- 图标尺寸：20 px，与文字间距 `var(--space-3)` = 12px
- 右侧数字徽章：`text-caption` + `--color-text-tertiary`

## 🔄 状态定义

| 状态 | 视觉 |
|---|---|
| default | 文字 `--color-text-secondary`，图标 `--color-text-secondary` |
| hover | `background: --color-bg-hover` |
| active（当前页） | `background: --color-bg-selected` + **左侧 2px 品牌色竖条** + 图标变 Filled + 文字 `--color-text-primary` |
| disabled（未实现）| `opacity: 0.5` + `cursor: not-allowed`，但**仍可点击** 进入"未支持"空态 |

## ✍️ 文案规范

- 使用**对象名**（Skills / Agents / 已连接工具 / 项目），不用操作名
- 数字徽章：用实际数量或 `—`（未实现）

## ♿ 可访问性

- 整个侧栏包裹在 `<nav>` 标签，带 `aria-label="主导航"`
- 当前项 `aria-current="page"`
- 收起模式下，图标必须有 `title` 提示

## 💻 代码骨架

```html
<nav class="sidebar" aria-label="主导航">
  <div class="sidebar__brand">
    <span class="sidebar__logo">A</span>
    <span class="sidebar__name">aitools</span>
  </div>

  <ul class="sidebar__group">
    <li>
      <a class="nav-item nav-item--active" href="/" aria-current="page">
        <svg class="nav-item__icon"><!-- home --></svg>
        <span class="nav-item__label">工作台</span>
      </a>
    </li>
  </ul>

  <ul class="sidebar__group">
    <li>
      <a class="nav-item" href="/skills">
        <svg class="nav-item__icon"><!-- package --></svg>
        <span class="nav-item__label">Skills</span>
        <span class="nav-item__badge tabular-nums">12</span>
      </a>
    </li>
    <li>
      <a class="nav-item nav-item--disabled" href="/commands">
        <svg class="nav-item__icon"><!-- zap --></svg>
        <span class="nav-item__label">Commands</span>
        <span class="nav-item__badge">—</span>
      </a>
    </li>
  </ul>
  <!-- ... 其它分组 -->
</nav>
```

---

# 6 · Input 输入框 / Search 搜索

## 📖 视觉规则

- 高度：`md` 36 px / `lg` 44 px
- 圆角：`var(--radius-md)` = 8px
- 边框：`1px solid var(--color-border-strong)`
- 背景：`--color-bg-default`
- 内边距：`0 var(--space-3)` = 0 12px（带图标时左 36px 预留）
- 字号：`--text-body-size`
- 过渡：`var(--duration-fast)`

## 🔄 状态定义

| 状态 | 视觉 |
|---|---|
| default | 描述见上 |
| hover | `border-color: --color-text-tertiary` |
| focus | `border-color: --color-border-brand` + `box-shadow: --shadow-focus` |
| error | `border-color: --color-danger` + 下方 `text-caption` 级错误提示（文案遵循原则 3 诚实） |
| disabled | `bg: --color-bg-muted`，`cursor: not-allowed`，`opacity: 0.5` |

## ✍️ 文案规范

- 占位文字：描述**预期输入内容**，不是操作指令
  - ✅「搜索 Skill…」
  - ❌「请输入 Skill 名称进行搜索」
- 错误提示：说清"**哪里错 + 怎么办**"
  - ✅「路径不存在：`~/.aitools/`。检查路径」
  - ❌「路径错误，请检查」

## ♿ 可访问性

- 必有 `<label>` 或 `aria-label`
- 错误提示 `aria-describedby` 关联 + 容器 `role="alert"`
- 右侧图标（如搜索放大镜）不可聚焦（`aria-hidden="true"`）

## 💻 代码骨架

```html
<!-- 带图标的搜索框 -->
<div class="input-group">
  <svg class="input-group__icon"><!-- lucide:search --></svg>
  <input class="input" type="search" placeholder="搜索 Skill…" />
  <kbd class="input-group__kbd">⌘K</kbd>
</div>

<!-- 错误态 -->
<div class="input-group">
  <input class="input input--error" aria-invalid="true"
         aria-describedby="path-error" />
  <p id="path-error" class="input__error" role="alert">
    路径不存在：~/.aitools/。检查路径
  </p>
</div>
```

---

# 7 · ListRow 列表行

> L3 约束：紧凑列表视图（与卡片视图切换）。

## 📖 视觉规则

- 高度：`comfy` 56px / `normal` 44px（默认）/ `compact` 36px
- 横向内边距：`var(--space-4)` = 16px
- 分隔线：`1px solid --color-border-default`，**仅行之间**
- 斑马纹：**浅色模式禁用**；暗色模式可选
- 悬浮：`background: --color-bg-hover` + `cursor: pointer`
- 选中：`background: --color-bg-selected` + **左侧 2px 品牌色竖条**

## 🔄 状态定义

同 Card 的 hover / selected / disabled。

## ✍️ 文案规范

- 列密度可切换（提供 3 档按钮）
- 每行必含"状态徽章"（L3 约束）

## ♿ 可访问性

- `<table>` 结构优先，语义化
- 整行可点击用 `<tr role="button">` + `tabindex="0"`
- `Enter` / `Space` 触发

## 💻 代码骨架

```html
<table class="list-table">
  <thead>
    <tr>
      <th>名称</th>
      <th>类型</th>
      <th>更新时间</th>
      <th>状态</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr class="list-row">
      <td>code-review</td>
      <td><span class="tag">Skill</span></td>
      <td class="font-mono tabular-nums">2h ago</td>
      <td><span class="badge badge--success">● 已同步</span></td>
      <td>
        <button class="btn btn--ghost btn--icon" aria-label="更多">…</button>
      </td>
    </tr>
  </tbody>
</table>
```

---

# 8 · Tag 标签

> 专门承载"资源类型标识"等元信息。

## 📖 视觉规则

- 底色：`--color-brand-subtle`
- 文字：`--color-brand-default`
- 内边距：`var(--space-1) var(--space-2)` (4px 8px)
- 圆角：`var(--radius-sm)` = 4px（注意比 Badge 小）
- 字号：`--text-label-size` = 12px / 500

## 🔄 状态定义

无交互状态（纯展示）。

## ✍️ 文案规范

- 1~4 字（Skill / Agent / User / Project）
- 禁用 Emoji

## 💻 代码骨架

```html
<span class="tag">Skill</span>
<span class="tag tag--neutral">User</span>
<span class="tag tag--neutral">Project</span>
```

---

# 9 · Tab 标签页

> L3 约束：Skill 详情页的 [内容] [同步目标] [历史] 切换。

## 📖 视觉规则

- 高度：40 px
- 底部：整体下边框 1px + 当前项下方 2px 品牌色实线
- Tab 之间：`var(--space-6)` = 24px
- Tab 文字：`--text-body-size` 14px / 500
- 过渡：`var(--duration-fast)`

## 🔄 状态定义

| 状态 | 视觉 |
|---|---|
| default | `color: --color-text-secondary` |
| hover | `color: --color-text-primary` |
| active | `color: --color-brand-default` + **下方 2px 品牌色下划线** |

## 💻 代码骨架

```html
<div class="tabs" role="tablist">
  <button class="tabs__tab tabs__tab--active" role="tab" aria-selected="true">内容</button>
  <button class="tabs__tab" role="tab" aria-selected="false">同步目标</button>
  <button class="tabs__tab" role="tab" aria-selected="false">历史</button>
</div>
<div class="tabs__panel" role="tabpanel">
  <!-- 内容 -->
</div>
```

---

# 10 · Modal 弹窗

> L3 约束：同步 Modal、导入 Skill Modal。

## 📖 视觉规则

### 尺寸分档

| 类型 | 宽度 | 使用场景 |
|---|---|---|
| `xs` | 400 px | 确认警示（确定删除？） |
| `sm` | 480 px | 简单表单 |
| **`md` 默认** | **640 px** | **常规表单、同步进度** |
| `lg` | 800 px | 差异对比、导入预览 |

### 结构

- 圆角：`var(--radius-xl)` = 16px
- 背景：`--color-bg-default`
- 阴影：`--shadow-lg`
- 内边距：`var(--space-8)` = 32px
- 遮罩：`--color-bg-overlay`
- 动效：中心 `scale(0.96)` → `1`，透明度 `0` → `1`，`var(--duration-normal) var(--easing-standard)`

### 布局

```
┌─────────────────────────────────────┐
│  标题（h2）                  [×]     │
├─────────────────────────────────────┤
│                                     │
│  内容区                              │
│                                     │
├─────────────────────────────────────┤
│                      [取消] [确认]   │
└─────────────────────────────────────┘
```

## 🔄 状态定义

- 打开：`scale` + `fade` 入场
- 关闭：反向 + `easing-exit`
- 遮罩点击关闭：**是**（对于非破坏性操作）；**否**（对于同步进行中、表单有未保存数据时）

## ✍️ 文案规范

- 标题 2~8 字（"导入 Skill"、"确认删除"）
- 底部按钮**主操作在右**（符合 macOS 习惯）
- 危险操作确认：按钮文案必须**重复动词**
  - ✅「删除」
  - ❌「确定」

## ♿ 可访问性

- `role="dialog"` + `aria-modal="true"`
- `aria-labelledby` 指向标题
- 打开时 focus trap（Tab 不能出去）
- `Esc` 关闭（非破坏场景）
- 打开时背景滚动锁定

## 💻 代码骨架

```html
<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal modal--md">
    <header class="modal__header">
      <h2 class="modal__title" id="modal-title">同步 3 个 Skill</h2>
      <button class="btn btn--ghost btn--icon" aria-label="关闭">×</button>
    </header>
    <div class="modal__body">
      <!-- 内容 -->
    </div>
    <footer class="modal__footer">
      <button class="btn btn--secondary">取消</button>
      <button class="btn btn--primary">同步</button>
    </footer>
  </div>
</div>
```

---

# 11 · Toast 轻提示

> 全局反馈，不打断操作流。

## 📖 视觉规则

- 位置：右上角 / 右下角（可配置，默认右下）
- 距屏幕边：`var(--space-6)` = 24px
- 宽度：最大 400 px，最小 240 px
- 圆角：`var(--radius-lg)` = 12px
- 背景：`--color-bg-default`
- 左边框：4px 状态色竖条（对应 success / warning / danger / info）
- 内边距：`var(--space-4)` = 16px
- 阴影：`--shadow-md`

### 结构

```
┌──────────────────────────────────┐
│▊  ✓  code-review 已同步 [×]      │
│▊  同步到 CodeBuddy + Claude Code │
└──────────────────────────────────┘
```

## 🔄 状态定义

- 入场：右侧滑入 + 淡入，`var(--duration-normal) var(--easing-standard)`
- 驻留：默认 4 秒
- 退场：淡出 + 微上移，`var(--duration-fast) var(--easing-exit)`

## ✍️ 文案规范

- 标题 **1 行**
- 辅助信息**可选 1 行**
- 失败类 Toast：**永不自动消失**（L2 原则 3 诚实 —— 不能让用户错过失败信息）

## ♿ 可访问性

- `role="status"`（success/info）或 `role="alert"`（warning/danger）
- `aria-live="polite"` / `assertive`

## 💻 代码骨架

```html
<div class="toast toast--success" role="status">
  <svg class="toast__icon"><!-- check --></svg>
  <div class="toast__body">
    <p class="toast__title">code-review 已同步</p>
    <p class="toast__desc">同步到 CodeBuddy + Claude Code</p>
  </div>
  <button class="btn btn--ghost btn--icon" aria-label="关闭">×</button>
</div>
```

---

# 12 · EmptyState 空状态

> L2 原则 1：有信息的空，不是一片空白。

## 📖 视觉规则

- 必须包含 **三要素**：插画 / 图标 + 标题 + 描述 + CTA
- 垂直居中，上下留白至少 `var(--space-16)` = 64px
- 图标尺寸：64 px（大型）或 48 px（紧凑）
- 标题：`text-h3`
- 描述：`text-body-sm` + `--color-text-secondary`
- 最大宽度：320 px（避免横铺）

### 布局

```
           ┌──────────┐
           │   📦     │  ← 图标（64px）
           └──────────┘
            抽屉是空的
            导入第一个 Skill 开始。
         [+ 导入文件夹]
```

## ✍️ 文案规范（本产品标准库）

| 场景 | 标题 | 描述 | CTA |
|---|---|---|---|
| 首次打开 Skills 页 | 抽屉是空的 | 导入第一个 Skill 开始。 | + 导入文件夹 |
| 搜索无结果 | 没有找到 | 换个关键词试试。 | — |
| 未连接工具 | 还没连接 AI 工具 | 连接后，Skill 会同步到那里。 | + 连接 CodeBuddy |
| 未实现的资源类型 | Commands 还未开放 | 该资源类型将在后续版本支持。 | — |

## ♿ 可访问性

- 图标 `aria-hidden="true"`
- CTA 必须可 Tab 聚焦

## 💻 代码骨架

```html
<div class="empty-state">
  <svg class="empty-state__icon" aria-hidden="true"><!-- package --></svg>
  <h3 class="empty-state__title">抽屉是空的</h3>
  <p class="empty-state__desc">导入第一个 Skill 开始。</p>
  <button class="btn btn--primary">
    <svg><!-- plus --></svg>
    导入文件夹
  </button>
</div>
```

---

## 十三、特殊形态组件（预留，L5.1 细化）

以下两个组件在首版要用但规范较深，此版本仅**写接口层面约束**，具体样式放到 L5.1：

### CommandPalette（Cmd+K 全局搜索）

- 触发：全局 `Cmd+K`
- 尺寸：480 × 400 px
- 位置：视口顶部 15% 处居中
- 样式参照：Modal + Input + 结果列表的组合
- 详细规范：**首版 L6 可用占位实现，v0.3 补齐规范**

### TrayPopover（菜单栏弹层）

- 尺寸：400 × 560 px（固定）
- 触发：点击菜单栏图标
- 结构：HeroCard + Search + 最近同步列表 + 底部操作区（见 L3 线框图）
- 技术实现：Tauri `system-tray` API
- 详细规范：**首版 L6 可用 HTML 模拟，真实桌面 App 时补齐**

---

## 十四、组件使用约束速查表

**下列组件组合是强制要求**（L7 走查必查）：

| 场景 | 必须使用的组件 | 引用原则 |
|---|---|---|
| 任何列表页 | `EmptyState` + 真实文案 | 原则 1 状态先于功能 |
| 任何同步状态 | `StatusBadge` + 文字 + 圆点 | 不靠颜色单独传达 |
| 任何错误反馈 | `Toast` + 原因 + 操作 | 原则 3 诚实先于友好 |
| 任何路径/hash | `font-mono` 类 | L4 等宽字体规范 |
| 任何数字对齐 | `tabular-nums` 类 | L4 等宽数字规范 |
| 任何删除/断开操作 | `Modal` + `Danger Button` | 破坏性操作确认 |

---

## 十五、本层结论对下游的约束清单

| L5 结论 | 约束了 L6~L7 的什么 |
|---|---|
| 每个组件都有 5 段式规范 | L6 原型每个组件必须命中对应类名；L7 走查按 5 段逐项查 |
| 组件样式全在 `components.css` | L6 只 `<link>` 引用，不自己写样式 |
| StatusBadge 同时用色+圆点+文字 | L7 走查必须模拟色盲场景 |
| Toast 失败不自动消失 | L6 原型必须实现这个"永久留痕"逻辑 |

---

## 十六、变更记录

| 版本 | 日期 | 变更说明 |
|---|---|---|
| v1.0 | 2026-04-27 | 首版发布：12 个核心组件 + 2 个特殊形态组件接口预留 |

---

## 十七、下一步

- **配套文件**：`desktop/src/styles/components.css` — 本文所有组件的 CSS 实现
- **下一层**：`desktop/src/pages/` —— 桌面端真实页面（已取代原 L6 HTML 原型）
- **上一层**：`04-visual-language.md` —— 本层所有 Token 的来源

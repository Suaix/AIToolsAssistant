# UI/UX 设计文档：工作台改版为概览面板

> **任务编号**：FEAT-001
> **创建日期**：2026-04-29
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **状态**：草稿

---

## 1. 设计目标

将工作台从单一的同步状态 HeroCard 改版为**数据概览面板**，让用户首屏即可感知 6 个维度的全局状态。

核心设计问题：
1. 如何在一屏内清晰呈现 6 个维度的数据，避免信息过载？
2. 如何区分「已实现」和「未实现」的功能卡片，遵循 L2「诚实先于友好」？
3. 如何替代 HeroCard 的 CLI 异常提示能力？

---

## 2. 信息架构

### 2.1 页面结构

```
概览页（Overview）
├── 全局状态 Banner（条件渲染：仅 CLI 异常时显示）
├── 上区：资源对象 2×2 网格
│   ├── Skills 卡片（实时数据）
│   ├── Commands 卡片（占位）
│   ├── Agents 卡片（占位）
│   └── Rules 卡片（占位）
├── 分隔区
└── 下区：外部关系 1×2 列
    ├── 已连接工具（实时数据）
    └── 项目（本地状态）
```

### 2.2 用户流程

```
打开应用 → 概览页加载
              ├── CLI 正常 → 渲染 6 个数据卡片
              │                ├── 点击 Skills → 跳转 Skills 列表
              │                ├── 点击已连接工具 → 跳转 Tools 页
              │                └── 点击未实现卡片 → 无响应 / toast
              │
              └── CLI 异常 → 顶部 Banner 提示
                              └── 点击"重新检查" → 重新加载
```

---

## 3. 页面设计

### 3.1 页面：概览（Overview）

**功能描述**：应用首页，展示所有资源维度的汇总数据。

**布局结构**：

```
┌──────────────────────────────────────────────────────┐
│  ⚠ CLI 未安装，请执行 npm i -g aitools-cli  [重新检查] │ ← Banner（条件）
├──────────────────────────────────────────────────────┤
│                                                      │
│   ┌─────────────────┐  ┌─────────────────┐           │
│   │   ✦ Skills       │  │   ⚡ Commands    │           │
│   │                  │  │                 │           │
│   │   12 已订阅       │  │    0            │           │
│   │   3 候选 · 1 待同 │  │    即将推出       │           │
│   └─────────────────┘  └─────────────────┘           │
│   ┌─────────────────┐  ┌─────────────────┐           │
│   │   🤖 Agents      │  │   📄 Rules       │           │
│   │                  │  │                 │           │
│   │   0              │  │    0            │           │
│   │   即将推出        │  │    即将推出       │           │
│   └─────────────────┘  └─────────────────┘           │
│                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │ ← 分隔
│                                                      │
│   ┌─────────────────┐  ┌─────────────────┐           │
│   │   🔗 已连接工具   │  │   📁 项目        │           │
│   │                  │  │                 │           │
│   │   3 / 5 已启用    │  │   MyProject      │           │
│   │                  │  │   3 个最近项目     │           │
│   └─────────────────┘  └─────────────────┘           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**卡片内部结构**（统一规范）：

```
┌─────────────────────────┐
│  Icon   标题      →      │ ← 头部：图标 + 标题 + 箭头（可点击时）
│                          │
│  24                      │ ← 主数字（text-h1 级别，视觉焦点）
│  已订阅                   │ ← 主数字标签
│                          │
│  3 候选 · 1 待同步        │ ← 次要指标行（text-caption，tertiary 色）
└─────────────────────────┘
```

**交互说明**：

| 元素 | 交互行为 | 触发条件 |
|------|---------|---------|
| Skills 卡片 | hover 升起阴影 + 边框高亮 → 点击跳转 Skills 页 | 功能已实现 |
| 已连接工具卡片 | hover 升起阴影 + 边框高亮 → 点击跳转 Tools 页 | 功能已实现 |
| Commands/Agents/Rules 卡片 | hover 无变化（disabled 态），cursor: default | 功能未实现 |
| 项目卡片 | hover 无变化（disabled 态），cursor: default | 功能未实现 |
| 全局 Banner | 显示错误信息 + "重新检查"按钮 | CLI 不可用或出错 |
| Banner "重新检查"按钮 | 重新调用 CLI 健康检查 | 点击 |

---

## 4. 状态枚举

### 4.1 页面级状态

| 状态 | 描述 | 视觉表现 |
|------|------|---------|
| 加载中（Loading） | CLI 正在检查 + 数据请求中 | 卡片内数字区域显示骨架屏占位（shimmer） |
| CLI 异常（cli_missing / error） | CLI 未安装或调用失败 | 顶部 Banner 警告，卡片仍显示但数字区域显示 `—` |
| 正常（Normal） | 全部数据加载完成 | 6 个卡片正常展示数据 |

### 4.2 卡片级状态

| 状态 | 描述 | 视觉表现 |
|------|------|---------|
| 活跃（Active） | 功能已实现，数据可用 | 正常色彩，hover 有反馈，cursor: pointer |
| 占位（Placeholder） | 功能未实现 | 灰色样式（opacity 0.5），主数字显示 `0`，次要行显示「即将推出」，cursor: default |
| 高亮（Highlight） | Skills 有待同步项 | Skills 卡片次要行中待同步数用 `--color-warning-text` 高亮 |

---

## 5. 组件清单

| 组件名 | 来源 | CSS 类 | 说明 |
|--------|------|--------|------|
| Card | L5 已有 | `.card` | 基础卡片容器，复用现有规范 |
| Button | L5 已有 | `.btn .btn--ghost` | Banner 中的"重新检查"按钮 |
| Toast | L5 已有 | `.toast` | 点击未实现卡片时的可选提示 |
| **OverviewCard** | **需新增** | `.overview-card` | 概览专用数据卡片（继承 `.card`，增加主数字 + 次要指标布局） |
| **StatusBanner** | **需新增** | `.status-banner` | 页面顶部条件渲染的全局异常提示条 |

### OverviewCard 规格

```
.overview-card
├── .overview-card__header     ← flex: icon + title + arrow
├── .overview-card__metric     ← 主数字，font-size: var(--text-h1-size), font-weight: 700
├── .overview-card__label      ← 主数字标签，text-body-sm, --color-text-secondary
└── .overview-card__sub        ← 次要指标行，text-caption, --color-text-tertiary
```

- 背景 / 边框 / 圆角 / 阴影：继承 `.card` 规范
- 内边距：`var(--space-5)` (20px)
- 图标尺寸：20px，颜色 `--color-text-tertiary`（占位态）/ `--color-brand-default`（活跃态）
- 禁用态：添加 `.overview-card--disabled`，opacity 0.5，pointer-events: none

### StatusBanner 规格

```
.status-banner
├── .status-banner__icon       ← AlertTriangle 图标
├── .status-banner__text       ← 错误描述
└── .status-banner__action     ← Ghost 按钮
```

- 背景：`--color-warning-subtle`
- 文字色：`--color-warning-text`
- 边框：`1px solid var(--color-border-default)`
- 圆角：`var(--radius-md)` = 8px
- 内边距：`var(--space-3) var(--space-4)` (12px 16px)
- 布局：flex，justify-content: space-between，align-items: center

---

## 6. 响应式 / 适配策略

| 断点 | 布局调整 |
|------|---------|
| ≥ 800px | 上区 2×2 网格，下区 1×2 列（标准） |
| < 800px | 上区变为 1 列纵向排列，下区同样 1 列纵排 |

> 当前 Tauri 桌面端窗口最小宽度约 900px，暂不需要特别适配。预留 CSS Grid 断点即可。

---

## 7. 设计资产

| 文件 | 说明 |
|------|------|
| [`assets/overview-prototype.html`](./assets/overview-prototype.html) | 可交互 HTML 原型（暗色/浅色双主题，按 B 切换 Banner） |

---

## 8. 设计决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| D-1 | CLI 异常使用顶部 Banner 而非全屏遮罩 | 全屏错误页（原 HeroCard cli_missing 态） | Banner 不阻塞其他信息展示，卡片仍可渲染占位数据 |
| D-2 | 未实现功能卡片用 opacity 0.5 + "即将推出" | 完全隐藏 / 显示锁图标 | L2「诚实」：让用户知道这些维度存在；opacity 0.5 是 L5 disabled 态标准 |
| D-3 | 主数字使用 h1 级别字号突出 | 与标题同级 | 概览页核心价值就是「数字」，参考 Vercel Dashboard 的大数字设计 |
| D-4 | Skills 待同步数用 warning 色高亮 | 统一用 tertiary 色 | L2「状态先于功能」：关键异常需要视觉呼出 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-04-29 | 初稿创建 | AI |
| 2026-04-29 | 新增可交互 HTML 原型（assets/overview-prototype.html） | AI |

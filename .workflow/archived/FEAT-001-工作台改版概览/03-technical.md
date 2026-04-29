# 技术方案：工作台改版为概览面板

> **任务编号**：FEAT-001
> **创建日期**：2026-04-29
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：已确认

---

## 1. 概述

### 1.1 技术目标

将 `pages/Dashboard.tsx`（341 行，HeroCard 5 态）重写为概览面板，展示 6 个数据维度的卡片。
同时修改 `Sidebar.tsx` 标签和 `styles/components.css` 新增组件样式。

### 1.2 技术约束

- React 18 + Tauri 2，无路由库（useState 手动切换）
- 所有 CLI 调用必须显式传 `cwd` 参数（记忆：Tauri cwd 陷阱）
- CSS 只使用语义 Token（`var(--color-*)`），禁止硬编码 HEX
- 单文件不超过 5000 行，单函数不超过 100 行

---

## 2. 架构设计

### 2.1 整体架构

```
App.tsx
  ├── loadGlobalData() ─── 已有，提供 Skills + Tools 数据
  │                         改造：返回更多数据供概览页使用
  │
  └── renderPage('dashboard')
        └── <Overview />  ← 新组件（替代原 Dashboard）
              ├── <StatusBanner />      ← 新组件：CLI 异常提示
              ├── <OverviewCard /> × 4  ← 新组件：资源卡片（上区）
              └── <OverviewCard /> × 2  ← 新组件：环境卡片（下区）
```

### 2.2 数据流

```
App.tsx (loadGlobalData)
    │
    ├─ checkCliAvailable() → cliAvailable: boolean
    ├─ listResources('skills', cwd) → skills 数据
    └─ 汇总为 OverviewData
          │
          ▼
   <Overview data={overviewData} onNavigate={setRoute} />
```

### 2.3 目录结构

```
desktop/src/
├── pages/
│   ├── Dashboard.tsx      ← 删除（原 HeroCard 版本）
│   └── Overview.tsx       ← 新增（概览面板）
├── components/
│   ├── OverviewCard.tsx   ← 新增（概览数据卡片）
│   ├── StatusBanner.tsx   ← 新增（全局异常 Banner）
│   └── Sidebar.tsx        ← 修改（标签"工作台"→"概览"）
├── lib/
│   └── routes.ts          ← 修改（ROUTE_TITLES 更新）
└── styles/
    └── components.css     ← 修改（新增 .overview-card / .status-banner 样式）
```

---

## 3. 接口定义

### 3.1 OverviewData 类型

```typescript
/** 概览页面的聚合数据 */
interface OverviewData {
  /** 页面加载状态 */
  status: 'loading' | 'cli_missing' | 'error' | 'ready';
  /** 错误信息（status='error' 时有值） */
  errorMessage?: string;

  /** Skills 数据 */
  skills: {
    subscribedCount: number;
    candidateCount: number;
    driftCount: number;
  };

  /** 已连接工具数据 */
  tools: {
    enabledCount: number;
    totalCount: number;
    enabledNames: string[];
  };

  /** 项目数据（来自 GuiState） */
  project: {
    currentName: string | null;
    recentCount: number;
  };
}
```

### 3.2 OverviewCard 组件接口

```typescript
interface OverviewCardProps {
  /** 图标组件（Lucide） */
  icon: LucideIcon;
  /** 卡片标题 */
  title: string;
  /** 主数字 */
  metric: number | string;
  /** 主数字标签 */
  label: string;
  /** 次要指标行（React 节点，支持 warning 色高亮） */
  sub?: React.ReactNode;
  /** 是否禁用（功能未实现） */
  disabled?: boolean;
  /** 点击回调（disabled 时不触发） */
  onClick?: () => void;
}
```

### 3.3 StatusBanner 组件接口

```typescript
interface StatusBannerProps {
  /** 提示类型 */
  variant: 'warning' | 'error';
  /** 提示文案 */
  message: React.ReactNode;
  /** 操作按钮文案 */
  actionLabel?: string;
  /** 操作回调 */
  onAction?: () => void;
}
```

### 3.4 Overview 页面组件接口

```typescript
interface OverviewProps {
  /** 聚合数据 */
  data: OverviewData;
  /** 路由跳转 */
  onNavigate: (route: RouteName) => void;
  /** 重试加载 */
  onRetry: () => void;
}
```

---

## 4. 数据模型

无新增持久化数据结构。`OverviewData` 是纯运行时聚合类型，由 `App.tsx` 的 `loadGlobalData` 组装。

---

## 5. 影响范围分析

### 5.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|------|---------|---------|
| `App.tsx` | `loadGlobalData` 返回 OverviewData；`renderPage` 渲染 Overview 替代 Dashboard；传递 onNavigate | 中 |
| `components/Sidebar.tsx` | 第 67 行标签 `'工作台'` → `'概览'` | 低 |
| `lib/routes.ts` | `ROUTE_TITLES.dashboard` 从 `'工作台'` → `'概览'` | 低 |
| `styles/components.css` | 新增 `.overview-card` / `.status-banner` / `.overview-grid` / `.section-divider` / `.section-label` 样式 | 中 |

### 5.2 新增文件

| 文件 | 用途 |
|------|------|
| `pages/Overview.tsx` | 概览页面主组件 |
| `components/OverviewCard.tsx` | 概览数据卡片组件 |
| `components/StatusBanner.tsx` | 全局异常提示条组件 |

### 5.3 删除文件

| 文件 | 原因 |
|------|------|
| `pages/Dashboard.tsx` | 被 `Overview.tsx` 完全替代 |

### 5.4 依赖变更

无新增依赖。继续使用 `lucide-react` 提供图标。

---

## 6. 实现步骤

| 步骤 | 描述 | 预计工作量 |
|------|------|-----------|
| 1 | 在 `components.css` 中新增 `.overview-card` / `.status-banner` / `.overview-grid` 等样式 | 小 |
| 2 | 创建 `components/StatusBanner.tsx` | 小 |
| 3 | 创建 `components/OverviewCard.tsx` | 小 |
| 4 | 创建 `pages/Overview.tsx`，组装卡片布局 | 中 |
| 5 | 修改 `App.tsx`：`loadGlobalData` 组装 OverviewData，`renderPage` 使用 Overview | 中 |
| 6 | 修改 `Sidebar.tsx` 标签 + `routes.ts` 标题 | 小 |
| 7 | 删除 `pages/Dashboard.tsx` | 小 |
| 8 | 自测：暗色/浅色主题、CLI 可用/不可用场景 | 小 |

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| App.tsx loadGlobalData 改造影响其他页面 | 低 | 中 | 保持原有返回值不变，增量扩展 |
| 删除 Dashboard.tsx 后 SyncProgressModal 引用断裂 | 低 | 低 | Overview 中保留 SyncProgressModal 的引入（如果 Skills 卡片需要一键同步） |
| Tauri cwd 陷阱导致数据不准 | 中 | 高 | 所有 CLI 调用点检查 cwd 参数传递 |

---

## 8. 回滚方案

1. `pages/Dashboard.tsx` 在 git 中有历史，可随时 `git checkout` 恢复
2. `App.tsx` 的 `renderPage` 切回 `<Dashboard />` 即可回退
3. CSS 新增样式不影响现有组件（命名空间隔离）

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| TD-1 | OverviewData 由 App.tsx 组装后传入，Overview 是纯展示组件 | Overview 自己调 CLI | 保持 App 层统一管理 CLI 调用和 cwd 传递，避免重复逻辑 |
| TD-2 | OverviewCard 是通用组件，通过 props 控制活跃/禁用态 | 分别写 ActiveCard / DisabledCard | 一个组件更 DRY，状态通过 disabled prop 控制 |
| TD-3 | 删除 Dashboard.tsx 而非保留 | 保留旧文件改名 | HeroCard 逻辑完全不复用，保留增加维护负担 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-04-29 | 初稿创建 | AI |

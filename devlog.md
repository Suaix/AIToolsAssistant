## [2026-04-28 15:00] - v0.4.0 发布 · 订阅模型重构

### 文件变更

- `package.json`：版本 0.3.0 → 0.4.0
- `CHANGELOG.md`：新增；完整版本历史（0.1.0 ~ 0.4.0）
- `src/utils/scaffold.ts`：骨架从 `<type>/{user,project}/` 两级改为扁平 `<type>/`，8 个叶子目录减少为 4 个
- `src/commands/init.ts`：更新骨架描述；新增首次订阅引导 `guideFirstSubscription()`
- `src/commands/list.ts`：改为订阅驱动，分"未订阅候选 / 用户级订阅 / 项目级订阅"三段展示
- `src/commands/sync.ts`：从配置驱动改为订阅驱动，新增 `skipped` 事件
- `src/commands/subscribe.ts`：新增；订阅命令，支持 `--scope user|project`、`--sync` 立即同步
- `src/commands/unsubscribe.ts`：新增；取消订阅命令
- `src/core/subscriptions.ts`：新增；订阅抽象层（读写 config/project.yaml）
- `src/core/status.ts`：新增；同步状态计算（up-to-date / updated / needs-sync / error）
- `src/config/manager.ts`：适配订阅结构（`user_subscriptions` / `project_subscriptions`）
- `src/config/project.ts`：移除废弃的 `ResourceScope`，新增 `SubscriptionScope`
- `src/types/index.ts`：新增订阅相关类型
- `tests/`：全套单元测试重构，154 个测试全部通过
- `README.md`：整体重写，按订阅模型重构文档结构

### 影响范围

- 破坏性变更：配置格式变化，需重新 `subscribe` 才能同步
- 架构更清晰：订阅 = 声明式意图，同步 = 执行意图，职责单一
- GUI 适配：NDJSON 协议升级（新增 `skipped`/`subscribed`/`unsubscribed` 事件）

---

## [2026-04-27 20:10] - 阶段 3 · 桌面 App 对接 CLI（只读数据化）

### 文件变更
- `desktop/src-tauri/src/lib.rs`：新增 `invoke_cli` / `check_cli_available` 两个 Tauri command；args 做命令注入防御（禁止 `'`、`` ` ``、`$`）；用 `sh -lc` 触发登录 shell 解决 macOS GUI 应用 nvm/pnpm PATH 缺失问题；
- `desktop/src/lib/cli.ts`：新增；NDJSON 解析器（单行失败不致命）、`CliError` 自定义错误、`listResources(type)` 合并 user/project 两段 list 事件的业务函数；类型定义对齐 CLI 的 `src/types/index.ts`；
- `desktop/src/pages/Dashboard.tsx`：从空壳升级为 5 态 HeroCard —— `loading / cli_missing / error / all_synced / has_unsynced`；
- `desktop/src/pages/Skills.tsx`：从空壳升级为 4 态九宫格 —— `loading / error / empty / ready`，用户级与项目级分段展示；
- `docs/design-system/components.css`：新增 `.card-grid` 响应式容器（`grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`），与 `.card-stack` 并列作为两种容器语义。

### 影响范围
- 桌面 App 第一次拿到真实数据：Dashboard 可判断是否需要同步、Skills 可列出所有资源及其在每个 target 的同步状态；
- 打通 GUI ↔ CLI 的"UI-over-CLI"架构契约（GUI 不重复实现业务，只消费 `--json` NDJSON）；
- 设计系统新增一种容器组件，为后续 Commands/Agents/Rules 列表页铺路。

---

## [2026-04-27 19:47] - 修复 macOS 窗口标题栏让位与拖拽

### 文件变更
- `docs/design-system/components.css`：新增 `.app-shell--native-titlebar` 修饰类，在 `titleBarStyle=Overlay` 下让侧栏品牌区与主区 header 顶部让出 28px 安全距离，避免被红绿灯遮挡；并禁用该区域文本选中；
- `desktop/src/App.tsx`：根节点启用 `.app-shell--native-titlebar` 修饰类；
- `desktop/src/components/Sidebar.tsx`：品牌区添加 `data-tauri-drag-region` 支持窗口拖拽；
- `desktop/src-tauri/capabilities/default.json`：新增 `core:window:allow-start-dragging` 权限（Tauri 2 让 `data-tauri-drag-region` 生效的必要权限）。

### 影响范围
- macOS 下视觉不再被红绿灯按钮遮挡；
- 顶部区域可用于窗口拖拽（Tauri 2 原生机制替代 `-webkit-app-region: drag`）。

---

## [2026-04-27 19:27] - 阶段 2 · Tauri + React 桌面骨架 MVP-01

### 文件变更
- `desktop/`：新增整个 workspace（Tauri 2 + React 18 + TypeScript + Vite）；
- `desktop/vite.config.ts`：Vite alias `@design-system` 直接指向项目根设计系统的 `tokens.css` / `components.css`，单一真相源；
- `desktop/src-tauri/tauri.conf.json`：窗口尺寸 960×720 默认 / 800×600 最小；`titleBarStyle=Overlay` + `hiddenTitle=true` 走 macOS 现代红绿灯悬浮风格；
- `desktop/src/App.tsx`、`desktop/src/main.tsx`：应用壳与路由入口；
- `desktop/src/components/Sidebar.tsx`：翻译自 L6 原型的三段式导航侧栏；
- `desktop/src/components/ThemeToggle.tsx`：light/dark/system 三档循环切换；
- `desktop/src/lib/routes.ts`、`desktop/src/lib/theme.ts`：路由与主题逻辑；
- `desktop/src/pages/Dashboard.tsx`：工作台（含 HeroCard 骨架）；
- `desktop/src/pages/Skills.tsx`、`Tools.tsx`、`Settings.tsx`：三个空态占位（阶段 3 对接 CLI）；
- `desktop/src-tauri/src/lib.rs`：Tauri 主入口骨架（暂无业务 command）；
- `desktop/src-tauri/icons/`：默认图标资源。

### 影响范围
- 项目首次拥有桌面 App 形态；
- `desktop/src` 下不写任何 CSS（全部复用设计系统），规避 AI 自由发挥风险；
- 验收：`pnpm build` 通过（CSS 24KB + JS 155KB）、`cargo check` 通过、`pnpm tauri:dev` 启动正常、零 TS lint 错误。

---

## [2026-04-27 19:12] - CLI 支持 --json 输出模式（NDJSON）

### 文件变更
- `src/index.ts`：新增全局 `--json` flag；
- `src/utils/reporter.ts`：新增；Reporter 输出层抽象，统一管理 human / json 双模式，业务代码不再直接 `console.log`；
- `src/commands/sync.ts`：支持 NDJSON 流式事件 `start / progress / summary / done / error`；
- `src/commands/list.ts`：输出结构化 `ResourceListItem`，包含 `sourceHash` / `targets` 等 GUI 消费字段；
- `src/core/syncer.ts`：`syncAllResources` / `syncProjectResources` 新增 `onProgress` 回调；
- `src/types/index.ts`：新增 `JsonEvent` / `SyncProgressData` / `ListEventData` 等 GUI 契约类型；
- `tests/utils/reporter.test.ts`：新增 14 个单测；
- `package.json`：版本 0.2.0 → 0.3.0。

### 影响范围
- human 模式完全向后兼容，彩色输出与 v0.2.0 一致；
- 为阶段 2/3 桌面 App 接入铺路，确立稳定的 GUI↔CLI 数据契约；
- `init` 不支持 `--json`（设计决策：GUI 直接读写 `~/.aitools/config.yaml`）；
- 72 个单测全部通过。

---

## [2026-04-27 17:24] - 建立完整的 7 层设计系统 v1.0

### 文件变更
- `docs/design-system/01-brand-strategy.md`：L1 品牌战略（抽屉隐喻、Alex 画像、气质坐标）；
- `docs/design-system/02-design-principles.md`：L2 四条铁律（诚实 / 状态 / 明确 / 克制）；
- `docs/design-system/03-information-architecture.md`：L3 信息架构（菜单栏 Popover + 主窗口双形态、5 页清单）；
- `docs/design-system/04-visual-language.md`、`tokens.css`：L4 视觉语言 + Token 变量；
- `docs/design-system/05-component-spec.md`、`components.css`：L5 组件规范 + 12 个核心组件样式；
- `docs/design-system/06-gui-prototype/`：L6 GUI 原型（5 页 HTML + Popover + 组件 Showcase + 同步魔法动效 JS）；
- `docs/design-system/07-review-checklist.md`：L7 走查清单；
- `docs/design-system/AI_INSTRUCTIONS.md`：AI 助手强制操作契约；
- `CODEBUDDY.md` / `CLAUDE.md`：AI 助手项目级强制入口；
- `.gitignore`：不再忽略 `CODEBUDDY.md`（团队共享 AI 规则）。

### 影响范围
- 项目建立完整的设计 / UI 规则底座；
- 后续任何 UI 任务必须先读 `AI_INSTRUCTIONS.md` 与 `README.md`；
- 禁止硬编码颜色、自创组件、违反 4 原则。

---

## [2026-03-20 10:05] - 创建 CodeBuddy 指南文件
 
### 文件变更
- `CODEBUDDY.md`：新增；

### 影响范围
- 为 CodeBuddy Agent 提供本项目的架构全局认知与常用开发指令。

---

## [2026-03-20 10:00] - 初始化 Node.js 基础工程结构
 
### 文件变更
- `package.json`：新增；
- `tsconfig.json`：新增；
- `tsup.config.ts`：新增；
- `eslint.config.js`：新增；
- `.prettierrc`：新增；
- `.gitignore`：新增；
- `src/index.ts`：新增；
- `src/commands/init.ts`：新增；
- `src/utils/logger.ts`：新增；
- `devlog.md`：新增；

### 影响范围
- 项目整体基础架构，涵盖 TypeScript 构建、代码规范、入口文件及日志模块。

---

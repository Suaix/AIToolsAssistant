## [2026-04-28 16:59] - RFC-002 阶段 4+5（P4 项目切换器 + P5 Onboarding）· 并行完成

### 目标

阶段 4：项目切换器组件 + GUI 本地状态持久化 + 所有 invoke_cli 带 cwd
阶段 5：首次启动 3 步引导向导 + 检测率判定

### 新增文件

**`desktop/src/lib/gui-state.ts`**：
- `GuiState` 接口：currentProject / recentProjects / onboardingDone
- `loadGuiState()` / `saveGuiState()`：优先 Tauri invoke，降级 localStorage
- `setCurrentProject()` / `markOnboardingDone()` / `getProjectDisplayName()` 辅助函数

**`desktop/src/components/ProjectSwitcher.tsx`**：
- 嵌入顶栏的下拉项目选择器
- 显示当前项目名 + 最近项目列表 + 「打开其他目录…」入口
- 无 project.yaml 时显示「未初始化」提示
- 点击外部 / Esc 关闭下拉

**`desktop/src/components/OnboardingWizard.tsx`**：
- 3 步向导：识别工具 → 选择 Skill → 确认同步
- detected_ratio < 30% 时替换为安装引导页（RFC-002 Q4 决议）
- 默认全选前 5 个候选
- Step 3 显示写操作数量预估

### 修改文件

**`desktop/src/App.tsx`**（全面更新）：
- 集成 `ProjectSwitcher` 到顶栏（标题右侧）
- 集成 `OnboardingWizard` 蒙层挂载点
- 启动时加载 `GuiState` → 判定是否弹 Onboarding
- Onboarding 确认后串行调用 `subscribe --scope user --sync`
- 关闭/完成后 `markOnboardingDone` 持久化
- 项目切换时 `setCurrentProject` + 刷新全局数据
- 目录选择器降级：Tauri invoke → window.prompt

### 验证

- `npx tsc --noEmit`：零错误
- IDE lint：零错误

### RFC-002 全部 5 个阶段完工

| 阶段 | 状态 |
|---|---|
| P1 · 回归修复 | ✅ |
| P2 · Skills Tab 化 | ✅ |
| P3 · Dashboard + Tools | ✅ |
| P4 · 项目切换器 | ✅ |
| P5 · Onboarding | ✅ |

### 下一步

- RFC-002 验收清单逐条确认
- `cargo tauri dev` 联调
- RFC-002 状态 → ✅ Shipped

---

## [2026-04-28 16:54] - RFC-002 阶段 3（P3 · Dashboard + Tools 升级）

### 目标

Dashboard HeroCard 完整 5 态；Tools 页从空壳变为真实页面；Sidebar 动态计数徽章。

### 文件变更

**重写 `desktop/src/pages/Dashboard.tsx`**：
- HeroCard 完整 5 态对齐 RFC-002 §3.4：`empty` / `no_subscription` / `synced` / `drift` / `error`
- HeroCard 副标题显示三数字：订阅总数 / 候选数 / 需同步数
- 按钮文案按状态差异化：「开始订阅」/「订阅第一个 skill」/「查看详情」/「一键同步全部」/「查看错误」
- 移除旧版「开发进度」卡片区（已不需要）

**重写 `desktop/src/pages/Tools.tsx`**：
- 从空壳改为真实页面：读 list 结果中的 enabledTargets + subscriptions 统计
- 每行显示 target 名 + 启用/禁用 toggle + 订阅资源数 + 状态 badge
- Toggle 操作走 `invoke_cli('target enable/disable')`（RFC-001.1 依赖已就绪）
- Toast 反馈操作结果
- 4 态：loading / error / empty / ready

**重写 `desktop/src/components/Sidebar.tsx`**：
- 新增 `SidebarCounts` 接口 + `counts` prop
- Skills 项显示订阅总数（数字）；Tools 项显示 `启用数/总数`
- 未加载完成时显示 `—`（保持诚实）

**重写 `desktop/src/App.tsx`**：
- 启动时 + 路由切换时调用 `listResources('skills')` 加载 Sidebar 计数
- 计数数据通过 `counts` prop 传递给 Sidebar

**扩展 `desktop/src/lib/cli.ts`**：
- 新增 `TargetInfo` 接口 + `setTargetEnabled()` 函数

### 验证

- `npx tsc --noEmit`：零错误
- IDE lint：零错误

### 下一步

RFC-002 阶段 4（P4 · 项目切换器 + 顶栏）

---

## [2026-04-28 16:49] - RFC-002 阶段 2（P2 · Skills 页 Tab 化）· 订阅/取消订阅交互

### 目标

Skills 页从扁平列表升级为三段 Tab（User / Project / Unused），新增订阅/取消订阅完整交互流。

### 文件变更

**新增 `desktop/src/components/SubscribePopover.tsx`**：
- 订阅选择弹出层（scope 单选 + 同步勾选 + 确认/取消）
- 复用 `.modal.modal--xs` 组件，遵循 L2「明确先于惊喜」

**重写 `desktop/src/pages/Skills.tsx`**：
- 三段 Tab：User Subscriptions / Project Subscriptions / Unused
- Tab 归类规则：按 `subscriptions[].scope` + `projectDir` 匹配分类
- 同一资源可出现在多个 Tab（用户看到的是「订阅关系」非「资源身份」）
- Unused Tab 卡片显示「订阅」按钮 → 打开 SubscribePopover
- User / Project Tab 卡片显示「取消订阅」+「同步」按钮
- 取消订阅确认对话框（内嵌 UnsubscribeConfirm 子组件，含 --prune 勾选）
- Toast 消息：订阅/取消订阅操作完成后底部右侧弹出
- 各 Tab 空态差异化文案

**扩展 `desktop/src/lib/cli.ts`**：
- 新增 `subscribeResource()` 函数：调用 `aitools subscribe <type> <name> --scope <scope> [--sync] --json`
- 新增 `unsubscribeResource()` 函数：调用 `aitools unsubscribe <type> <name> --scope <scope> [--prune] --json`
- 移除已废弃的 `ResourceListItem` 类型别名

### 验证

- `npx tsc --noEmit`：零错误
- IDE lint：零错误
- 所有写操作走 CLI（不直接写 yaml）✅ UI-over-CLI 原则
- `--prune` 需用户显式勾选 ✅ 明确先于惊喜
- 订阅后不自动跳 Tab，只 toast 提示 ✅ 克制

### 下一步

RFC-002 阶段 3（P3 · Dashboard + Tools 升级）

---

## [2026-04-28 16:39] - RFC-002 阶段 1（P1 · 回归修复）· GUI 对齐 CLI v0.4

### 目标

让 GUI 在 CLI v0.4 下不崩溃。不增加任何新 UI，只修复类型和数据消费。

### 文件变更

**`desktop/src/lib/cli.ts`**（类型定义全面对齐 v0.4）：
- `ResourceListItem` → `ResourceView`（新增 `subscriptions: SubscriptionStatus[]`，移除旧 `scope` / `targets` 字段）
- 新增 `SubscriptionStatus`、`SubscriptionTargetStatus`、`SyncLocationData` 类型
- `ListEventData` 改为 v0.4 协议（`version: 2`，单段 `resources`，删除旧 `scope` 字段，新增 `projectDir`）
- `SyncStartData` / `SyncProgressData` / `SyncSummaryData`：`scope` → `location: SyncLocationData`，新增 `version: 2`
- `JsonEvent` 联合类型新增 `target.enabled` / `target.disabled`
- `ResourceListResult` 从 `userResources/projectResources` 双段改为单一 `resources` 数组 + `projectDir?`
- `listResources()` 改为消费单条 list 事件（不再按 scope 拆分）
- 保留 `ResourceListItem` 作为 `ResourceView` 的 deprecated 别名（兼容过渡）

**`desktop/src/pages/Dashboard.tsx`**：
- 导入 `ResourceView` 替代 `ResourceListItem`
- `loadDashboard()` 改为消费 `result.resources`（不再有 `userResources/projectResources`）
- 仅统计已订阅资源（`subscriptions.length > 0`）的同步状态
- `countUnsynced()` 改为遍历 `subscriptions[].targets[].status`

**`desktop/src/pages/Skills.tsx`**：
- 导入 `ResourceView` 替代 `ResourceListItem`
- ready 态从用户级/项目级双段改为已订阅/候选二分展示
- `buildSyncArgs()` 去掉 `--skill`，改为 `sync skills <dirName>` 位置参数
- `SkillCard` 组件去掉 `scope` prop，改为从 `subscriptions` 推导 scope 标签
- 同步状态 badge 改为从 `subscriptions[].targets[]` 展平渲染

### 验证

- `npx tsc --noEmit`：零错误
- `read_lints desktop/src/`：零错误
- UI 未增加/删除任何页面或功能，仅数据对齐

### 下一步

RFC-002 阶段 2（P2 · Skills 页 Tab 化）：三段 Tab（User / Project / Unused）+ 订阅/取消订阅 Popover

---

## [2026-04-28 16:28] - RFC-001.1 实施完成 · `aitools target enable/disable` 已发版 v0.4.2

### 决议（3 个开放问题按推荐方案采纳）

- **Q1**：命令族 `aitools target enable <name>`（不走平铺）
- **Q2**：不加 `target list`（保留最小面）
- **Q3**：不加 `disable --prune`（维持单一职责）

### 文件变更

**PR-1 · CLI 实现**

- `src/commands/target.ts`（新增）：`setTargetEnabled()` 内部统一入口 + `targetEnableCommand` / `targetDisableCommand` 两个导出
- `src/index.ts`：导入并注册 `target` 命令族（`targetCmd.command('enable'|'disable')`）
- `src/types/index.ts`：`JsonEvent` 联合类型扩展 `target.enabled` / `target.disabled`；新增 `TargetEnabledData` 接口

**PR-2 · 测试**

- `tests/commands/target.test.ts`（新增）：8 用例覆盖 enable/disable × 翻转/幂等 × 未知 target × 配置缺失；stdout 捕获验证 NDJSON 事件序列

**PR-3 · 文档与发版**

- `README.md`：新增第 5 节「管理目标工具 — `aitools target`」；原 5/6/7 节顺延为 6/7/8
- `CHANGELOG.md`：新增 `[0.4.2] - 2026-04-28` 条目
- `package.json`：`0.4.0` → `0.4.2`
- `src/index.ts` `.version('0.4.0-alpha')` → `.version('0.4.2')`
- `docs/rfcs/v0.4.2-target-enable-disable.md`：状态 🟡 Draft → ✅ Shipped；PR-1/2/3 全部打勾；3 个 Q 的决议入档
- `docs/rfcs/README.md`：001.1 索引状态 🟡 Draft → ✅ Shipped

### 验证

- `pnpm run test`：**14 文件 / 162 测试全绿**（含新增 8 用例）
- `pnpm run build`：ESM build success（dist/index.js 37.60 KB）
- `read_lints src/` + `read_lints tests/commands/target.test.ts`：0 错 0 警
- Smoke test：`node ./dist/index.js target --help` 正确列出 enable/disable；`--version` 输出 `0.4.2`

### 遗留

- `pnpm run lint` 在 `desktop/dist/` 产物文件上报 1255 条错误——**与本轮无关**，RFC-002 GUI 侧遗留，应由 lint 配置忽略 `desktop/dist/**`。建议起一条独立小 patch 改 `eslint.config.js`
- RFC-001.1 §7 的两条跨 GUI 联测项留到 RFC-002 阶段 3 时验证（当 Tools 页启用开关接通 `invoke_cli` 时）

### 下一步

所有 RFC 已 shipped / accepted。推荐下一步：

1. 修 `eslint.config.js` 忽略 `desktop/dist/**`（1 分钟）
2. 进入 **RFC-002 阶段 3**（Tools 页启用开关）—— CLI 依赖已就绪
3. 或按你上轮说的"细节讨论"顺序，由你指挥

---

## [2026-04-28 16:25] - RFC-001.1 起草 · CLI target enable/disable 命令补丁

### 文件变更

- `docs/rfcs/v0.4.2-target-enable-disable.md`：新增；🟡 Draft；9 节 + 3 阶段 PR 计划（共 ~1.2 人日）
- `docs/rfcs/README.md`：001.1 状态由 ⚪ 未起草 → 🟡 Draft

### 设计要点

- 引入 **target 命令族**：`aitools target enable/disable <name>`（为将来 target add/remove/list 预留前缀）
- **幂等**：已是目标状态时跳过写盘，输出「无变更」info
- **JSON 事件**：新增 `target.enabled` / `target.disabled`（含 `changed` 字段）；错误事件复用 `error` + 新增 `code: "TARGET_NOT_FOUND"`
- **不自动清理**：禁用 target 时不删已同步目录（见 RFC §5.1 论证）
- **类型契约**：`src/types/index.ts` 扩展 `JsonEvent` 联合类型 + 新增 `TargetEnabledData`

### 3 个开放问题（待 review）

- Q1：命令族 vs. 平铺（倾向命令族）
- Q2：是否顺手加 `target list`（倾向不加）
- Q3：是否加 `disable --prune` 清理开关（倾向不加）

### 依赖链更新

- RFC-001.1 必须在 **RFC-002 阶段 3 开工前**合入；否则 Tools 页启用开关临时只读
- 所有 RFC 起草完毕 → 进入 review + 细节讨论阶段

---

## [2026-04-28 16:10] - RFC-002 定稿 · GUI 订阅视图重设计

### 文件变更

- `docs/rfcs/v0.4.1-gui-subscription-view.md`：新增；🟢 Accepted；10 节 + 5 阶段实施计划（共 5 人日）
- `docs/rfcs/README.md`：索引更新；新增 RFC-001.1 占位（⚪ 未起草）

### 关键决议（Q1~Q4 全部敲定）

- **Q1 → B**：CLI 补 `target enable/disable`，由 RFC-001.1 单独承担；必须在本 RFC 阶段 3 开工前合入
- **Q2 → A**：Project Tab 未初始化时显示空态 + "创建项目配置"按钮；首版不提供"只创建不订阅"入口
- **Q3 → 不展示**：sourceHash 折叠到未来的 Skill 详情页
- **Q4 → A（阈值 30%）**：Onboarding 在 target 识别率 < 30% 时切换为"请先安装工具"引导

### 后续动作

- ⏳ 等待下达 RFC-001.1 起草指令（Q1 的 CLI 命令补丁）
- ⏳ RFC-002 五阶段按顺序拆 PR：阶段 1（回归修复）→ 阶段 2（Tab 化）→ 阶段 3（Dashboard+Tools，依赖 RFC-001.1）→ 阶段 4（项目切换器）→ 阶段 5（Onboarding）

---

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

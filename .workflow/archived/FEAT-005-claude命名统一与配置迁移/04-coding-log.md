# 编码日志：claude 命名统一 + 旧 config 迁移

> **任务编号**：FEAT-005
> **创建日期**：2026-05-09
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：进行中

---

## 编码进度

> 对照 03-technical.md §6 的 17 步路线，每步独立可验证（runnable + green tests）。
> 完成一步即更新此表 + 在「变更记录」追加详细日志。

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1  | SSOT 基础设施（shared/tools.json + shared/tools.schema.ts + src/registry/tools.ts + src/config/version.ts + tsup 拷贝配置） | ✅ 已完成 | 2026-05-09 |
| 2  | 接入 CLI 端 SSOT（manager/target/list/init 改用 SSOT 数据） | ✅ 已完成 | 2026-05-09 |
| 3  | Types 层（Config / ProjectConfig 加 version 字段） | ✅ 已完成 | 2026-05-09 |
| 4  | 迁移管线核心（reporter + 调度器 + v0.2→v0.4 + v0.4→v0.5 迁移函数） | ✅ 已完成 | 2026-05-09 |
| 5  | 接入 loadConfig / loadProjectConfig（read → migrate → save → report） | ✅ 已完成 | 2026-05-09 |
| 6  | 旧 user_base 资源搬迁（relocate-legacy-dirs） | ✅ 已完成 | 2026-05-09 |
| 7  | 迁移管线单元测试（tests/config/migrations.test.ts） | ✅ 已完成 | 2026-05-09 |
| 8  | 目录守卫工具函数（tool-home-assert + 单测） | ✅ 已完成 | 2026-05-09 |
| 9  | 接入 syncer.ts（守卫 + skipped_missing_tool action） | ✅ 已完成 | 2026-05-09 |
| 10 | CLI 输出层（sync 命令灰色行 + 启动时 ℹ 行） | ✅ 已完成 | 2026-05-09 |
| 11 | 测试夹具批量更新（5 文件 44 处 claude-code → claude-internal） | ✅ 已完成 | 2026-05-09 |
| 12 | desktop SSOT 接入（lib/tools.ts 改为 import SSOT） | ✅ 已完成 | 2026-05-09 |
| 13 | MigrationModal 组件 + App.tsx 监听 .last-migration.json | ✅ 已完成 | 2026-05-09 |
| 14 | SyncProgressModal 守卫行（⊘ 灰色 + tooltip） | ✅ 已完成 | 2026-05-09 |
| 15 | 删除 desktop 双名兼容（TOOL_PROJECT_DIR_ALIASES） | ✅ 已完成 | 2026-05-09 |
| 16 | 文档同步（README + RFC v0.5.0-naming-and-migration） | ✅ 已完成 | 2026-05-09 |
| 17 | 端到端验证（v0.4 + claude-code fixture 通过迁移） | ✅ 已完成 | 2026-05-09 |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题 | ⏸️ 阻塞

---

## 变更记录

<!-- 每次编码产生的变更，按时间倒序记录；每完成一个步骤至少记录一条 -->

### 2026-05-09 - 步骤 2~17：批量推进至完成

**变更内容**：

按 03-technical.md §6 路线一次性推进剩余 16 步，全程通过 `pnpm test` + `pnpm run build` + `pnpm exec tsc -b` + `pnpm exec vite build` 持续验证。

**步骤 2-3：CLI 端 SSOT 接入 + Types 层**

- `src/config/manager.ts`：`getDefaultTargets()` 改用 `getDefaultEnabledTools` + `getAllTools` 派生；`createConfig` / `saveConfig` 写入 `version` 字段（首行）
- `src/commands/target.ts`：`AVAILABLE_TOOLS` 硬编码删除，改用 `findTool` / `getAllTools`
- `src/commands/list.ts`：`TARGET_DISPLAY` 硬编码删除，改用 `getToolDisplayName`
- `src/commands/init.ts`：选项文案三元改用 `getToolDisplayName`
- `src/types/index.ts`：`Config` / `ProjectConfig` 顶层新增 `version: number`
- `src/config/project.ts`：`loadProjectConfig` / `saveProjectConfig` 写入 / 兜底 `version`

**步骤 4-5：迁移管线核心 + loadConfig 接入**

- 新建 `src/config/migrations/`：
  - `reporter.ts`：MigrationReporter 协议 + StdoutMigrationReporter（CLI 默认）+ NoopMigrationReporter（测试用）
  - `v0.2-to-v0.4.ts`：`user_path → user_base` 字段重命名
  - `v0.4-to-v0.5.ts`：补 `user_subscriptions` + Claude 工具命名统一（基于 SSOT legacyAliases / legacyUserBases）
  - `index.ts`：调度器 `migrateConfigDispatch` / `migrateProjectConfigDispatch`，含备份（`<file>.bak` 覆盖式）+ 双通道落盘（`~/.aitools/.last-migration.json`）
- `src/config/manager.ts:loadConfig`：改为 `read → migrate → validate → normalize` 流水线；`validateConfig` 删除 v0.2 / v0.4 抛错路径
- `src/config/project.ts:loadProjectConfig`：同样接入迁移调度器

**步骤 6：旧 user_base 资源搬迁**

- 新建 `src/config/migrations/relocate-legacy-dirs.ts`：
  - `relocateLegacyUserDirs`：按 SSOT legacyUserBases 把 `~/.claude` / `~/.claude-code` 资源合并到 `~/.claude-internal`
  - `relocateLegacyProjectDirs`：项目级同理
  - 同名内容相同 → skip；不同 → 加入 conflicts 列表，**不静默覆盖**（TD-9）
  - 无冲突时才删除旧目录（TD-10）

**步骤 7-9：测试 + 守卫**

- 新建 `src/utils/tool-home-assert.ts`：`assertToolUserHomeExists` / `assertToolProjectHomeExists` 两个返回 `ToolHomeStatus` 的纯函数
- `src/core/syncer.ts:syncResourceToDir`：入口插守卫 → 父目录不存在则返回 `skipped_missing_tool`；不再越权 mkdir
- `src/types/index.ts`：`SkillTargetSyncResult.action` / `SyncProgressData.action` 新增 `'skipped_missing_tool'`；`SyncSummary` / `TasksSummary` 新增 `skippedMissingTool` 计数
- `tests/config/migrations.test.ts`（新增 6 用例）：覆盖 v0.2→v0.5 / v0.4→v0.5 / 备份生成 / 幂等 / 项目级迁移
- `tests/utils/tool-home-assert.test.ts`（新增 5 用例）：present / missing / 文件而非目录场景

**步骤 10：CLI sync 输出层**

- `src/commands/sync.ts`：`printHumanProgress` 新增 `skipped_missing_tool` 行（灰色 ⊘ + 路径提示）；`emitSummaryEvent` / `printHumanSummary` 累加 `skippedMissingTool`，summary 显示「未检测到工具 N」

**步骤 11：测试夹具批量更新**

- 5 个测试文件 44 处 `claude-code` / `~/.claude` → `claude-internal` / `~/.claude-internal`（sed 批量替换）
- `tests/config/manager.test.ts`：「缺 user_subscriptions 报错」用例改为「自动迁移补字段」（断言 .bak 存在 + skills 为空）
- `tests/config/project.test.ts`：toEqual 改用 toMatchObject 容忍 version 字段
- `tests/commands/list/subscribe/unsubscribe.test.ts`：setupFakeEnv 加 `mkdir ~/.codebuddy` 模拟"用户已安装"（守卫前置条件）
- `tests/core/syncer.test.ts`：beforeEach 预创建 user_base 子目录

**步骤 12-15：desktop 端 SSOT 接入 + MigrationModal**

- `desktop/vite.config.ts`：新增 `@shared/*` alias
- `desktop/tsconfig.json`：`paths` 加 `@shared/*`，`include` 加 `../shared/**/*.ts`
- `desktop/src/lib/tools.ts`：完全重写为 SSOT 派生，删除 3 套硬编码维护
- `desktop/src/components/ConfigMigrationModal.tsx`（新增）：迁移完成提示窗，含变更详情折叠 + 冲突区块
- `desktop/src/App.tsx`：启动时通过 Tauri `read_text_file_optional` 探测 `~/.aitools/.last-migration.json`；ack 后清理文件 + localStorage
- `desktop/src/components/SyncProgressModal.tsx`：`ACTION_BADGE` 加 `skipped_missing_tool`；ProgressRow 显示 `expectedPath`
- `desktop/src/lib/cli.ts`：`SyncProgressData.action` 类型扩展，加 `expectedPath` / `skippedMissingTool` 字段
- `desktop/src-tauri/src/lib.rs`：新增 `read_text_file_optional` / `delete_file_optional` 命令

**步骤 16：文档同步**

- `README.md`：工具表更新；新增 v0.5.0 变更说明；config.yaml 示例加 `version`
- `docs/rfcs/v0.5.0-naming-and-migration.md`（新增）：完整 RFC
- `docs/rfcs/v0.4.0-subscription-model.md`：变更记录追加「立场已被 v0.5.0 修订」

**步骤 17：端到端验证**

通过 `mktemp` 临时 HOME 模拟 v0.4.0 旧用户运行 `aitools list`：
- ✅ yaml 自动改写：`version: 6` / `claude-code → claude-internal` / `~/.claude → ~/.claude-internal` / 补 `user_subscriptions`
- ✅ 生成 `config.yaml.bak` 备份
- ✅ 落盘 `.last-migration.json`（含 4 条 changes + persistedAt）
- ✅ stdout 输出 4 行 ℹ 提示

**修复的 bug**：

- BUG-1：`src/registry/tools.ts:REGISTRY_PATH` 路径解析在 tsup bundle 模式下错误（向上两级会跳出包根）。修复为 `resolveRegistryPath()` 多候选探测：源码态向上两级，bundle 态向上一级，依次取第一个存在的。

**自测结果**：

- [x] `pnpm run build` 通过（CLI dist 50.49 KB）
- [x] `pnpm test` 全绿（**17 文件 / 186 测试**）
- [x] `pnpm exec tsc --noEmit` 不引入新错误
- [x] `pnpm exec eslint` 新代码 0 错误
- [x] `desktop/pnpm exec tsc -b` 类型检查通过
- [x] `desktop/pnpm exec vite build` 构建通过（SSOT JSON 正确 inline）
- [x] E2E：v0.4.0 旧 yaml → v0.5 自动迁移完整链路通过

---

### 2026-05-09 - 步骤 1：SSOT 基础设施

**变更内容**：

引入 AI 工具元信息单一真相源（SSOT），为后续所有命名统一与迁移逻辑提供共享数据契约。本步骤不接入任何业务代码，仅搭建基础设施。

**涉及文件**：

新增：
- `shared/tools.json` — SSOT 数据本身：3 个工具（codebuddy / workbuddy / claude-internal）+ 3 类 legacy 映射查找表
- `shared/tools.schema.ts` — 仅类型定义（ToolDefinition / ToolsRegistry），零外部依赖
- `src/registry/tools.ts` — CLI 适配层：fs.readFileSync 加载 + 字段校验 + 7 个查询函数（getAllTools / findTool / getToolDisplayName / getDefaultEnabledTools / getLegacyAliases / getLegacyUserBases / getLegacyProjectDirs）
- `src/config/version.ts` — schema 版本号常量（CURRENT_CONFIG_VERSION = 6 / CURRENT_PROJECT_CONFIG_VERSION = 6 / LEGACY_VERSION_PLACEHOLDER = 1）
- `tests/registry/tools.test.ts` — registry 单测 14 个用例

修改：
- `tsconfig.json` — `rootDir: "src"` → `"."`、`include` 新增 `shared/**/*`、`exclude` 新增 `desktop`、新增 `resolveJsonModule: true`（允许跨 rootDir 引用 shared/）
- `package.json` — 新增 `files: ["dist", "shared"]`，确保 npm publish 时 SSOT 一并发布到 `<global>/lib/node_modules/aitools-cli/shared/tools.json`

**关键设计落地（与 03-technical.md 对齐）**：
- TD-1 ✅ SSOT 用 JSON 而非 TS 模块（CLI 与 desktop 是独立 npm 包）
- TD-2 ✅ SSOT 落位 `shared/`（仓库根公共契约目录）
- 路径策略 ✅ `dist/index.js` → `../shared/tools.json` 在源码态与 tsup bundle 态都成立（tsup 默认输出单文件 bundle）
- 不预先拷贝到 dist ✅ 让运行时通过 `import.meta.url` 计算路径，避免双份维护

**Git Commit**：

```
feat(registry): 引入 AI 工具 SSOT 基础设施（FEAT-005 步骤 1）

- 新增 shared/tools.json + shared/tools.schema.ts
- 新增 src/registry/tools.ts CLI 适配层（含 14 个单测）
- 新增 src/config/version.ts schema 版本常量
- 调整 tsconfig.json rootDir 与 include 以支持跨 rootDir 类型引用
- package.json:files 新增 shared，确保 SSOT 随 npm publish 发布
```

**自测结果**：

- [x] `pnpm run build` 通过（dist/index.js 42.16 KB，无 inline SSOT JSON）
- [x] `pnpm test` 全绿（15 文件 / 176 测试，含新增 14 用例）
- [x] 新增/修改文件 lint 通过（`pnpm exec eslint src/registry shared tests/registry src/config/version.ts` 无错误）
- [x] tsc --noEmit 不引入新错误（已用 git stash 对比验证；已有错误均为本步骤改动前历史遗留，记入遗留问题表）
- [x] SSOT 字段校验：getAllTools 返回 3 项；不含旧名 claude-code；codebuddy 默认启用；legacy 映射 claude-code → claude-internal 等齐全

---

## 偏离记录

<!-- 与技术方案不一致的地方，必须记录原因；编码中发现方案有问题时在此回填，并视情况返工 03-technical.md -->

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
|      |             |         |         |

---

## 遗留问题

<!-- 编码过程中发现但本次不处理的问题；候选追加到 .workflow/backlog.md 或独立 FIX/REFACTOR 任务 -->

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| L-1  | `pnpm exec tsc --noEmit` 报 9 个历史 TS 错误：src/commands/{config,list,target}.ts 的 NDJSON 事件类型未在 EventData 联合类型中声明（target.added / target.removed / config.list 等） | 中 | 步骤 1 已确认非本步骤引入；建议在 FEAT-005 步骤 10 顺带修复（CLI 输出层改造时一并补全事件类型） |
| L-2  | `pnpm run lint` 输出 1292 个错误，主要来自 desktop/src-tauri/target/ 构建产物（Rust 编译输出 JS 被 ESLint 误扫描） | 低 | 不阻塞 FEAT-005；建议追加到 .workflow/backlog.md 作为独立小任务，更新 eslint.config.js ignores 加入 `desktop/src-tauri/target/**` |

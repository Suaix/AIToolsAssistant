# 编码日志：迁移测试隔离与 GUI 陈旧弹窗清理

> **任务编号**：FIX-001
> **创建日期**：2026-05-11
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：编码完成，待 TESTING 阶段验收

---

## 编码进度

### 阶段 A：CLI 测试隔离 + Dead import（✅ 已完成，commit a0251e7）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | `commands/config.ts` 删除第 25 行 `getConfigDir,` 未使用 import | ✅ | 2026-05-11 |
| 2 | `tests/config/migrations.test.ts` `beforeEach` 加 `vi.spyOn(os, 'homedir')`；`afterEach` 加 `vi.restoreAllMocks()` | ✅ | 2026-05-11 |
| 3 | 清理已有污染 `~/.aitools/.last-migration.json`（开工时已不存在） | ✅ | 2026-05-11 |
| 4 | `pnpm -F @aitools/cli test` 验证：186/186 全绿 | ✅ | 2026-05-11 |
| 5 | 跑完后 `ls ~/.aitools/.last-migration.json`：不存在 = 修复生效 | ✅ | 2026-05-11 |
| 6 | `pnpm lint` 验证：0 error 0 warning（彻底干净） | ✅ | 2026-05-11 |
| 7 | 阶段 A commit `a0251e7` | ✅ | 2026-05-11 |

### 阶段 B：GUI 陈旧校验（✅ 已完成，commit 77fad53）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 8 | `src-tauri/src/lib.rs` 新增 `file_exists_absolute` command + invoke_handler 注册 | ✅ | 2026-05-11 |
| 9 | `src/App.tsx` 启动 useEffect 在 ack 去重前插入 `file_exists_absolute(parsed.backupPath)` 校验分支 | ✅ | 2026-05-11 |
| 10 | `pnpm -F @aitools/desktop build`：通过（222.05 KB，+0.21 KB） | ✅ | 2026-05-11 |
| 11 | `cargo check` 在 src-tauri：1.79s 通过 | ✅ | 2026-05-11 |
| 12 | 手动验收 1：构造陈旧记录（backupPath 指向不存在路径）→ 启动 desktop → 不弹窗 + 文件被静默删除 ✅ | ✅ | 2026-05-11 |
| 13 | 手动验收 2：构造有效记录（backupPath 真实存在）→ 启动 desktop → 弹窗正常显示 ✅ | ✅ | 2026-05-11 |
| 14 | 阶段 B commit `77fad53` | ✅ | 2026-05-11 |

### 阶段 C：文档收尾（进行中）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 15 | 更新本文件 + CHANGELOG.md | 🔵 进行中 | 2026-05-11 |
| 16 | git push origin feature/gui | ⬜ 待执行 | — |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题

---

## 变更记录

### 2026-05-11 - 阶段 A：CLI 测试隔离 + dead import 清理

**变更内容**：

修复 `migrations.test.ts` 单测漏补 `os.homedir` spy 导致测试污染真实家目录的问题。生产代码零改动，对齐项目已有惯用法（`manager.test.ts` / `subscribe.test.ts` / `unsubscribe.test.ts`）。

顺带删除 `config.ts` 第 25 行未使用的 `getConfigDir` import（REFACTOR-001 遗留 L-1）。

**涉及文件**：
- ✏️ `packages/cli/src/commands/config.ts` — 删除 1 行 unused import
- ✏️ `packages/cli/tests/config/migrations.test.ts` — `beforeEach` +1 行 `vi.spyOn`、import `vi`、`afterEach` +1 行 `vi.restoreAllMocks()`
- ✏️ `.workflow/workflow.config.yaml` — FIX 计数器 +1
- ✨ `.workflow/tasks/FIX-001-迁移测试隔离与GUI陈旧弹窗清理/` — 工作流目录（manifest + 01/02/03）

**Git Commit**：`a0251e7`

**自测结果**：
- [x] `pnpm -F @aitools/cli test`：186/186 全绿
- [x] `pnpm lint`：0 error 0 warning（之前剩 1 条 dead import 警告已消除）
- [x] `pnpm -F @aitools/cli build`：50.72 KB（持平）
- [x] 跑完测试后 `~/.aitools/.last-migration.json` 不存在（核心修复生效）

### 2026-05-11 - 阶段 B：GUI 陈旧校验

**变更内容**：

App.tsx 启动 useEffect 增加 `.last-migration.json` 的 `backupPath` 存在性校验：备份文件不存在时静默清理 `.last-migration.json` 不弹窗，避免向用户展示指向不存在路径的误导信息。

为支持上述校验，Tauri Rust 端新增 `file_exists_absolute(path: String) -> Result<bool, String>` command（轻量只读 stat，无副作用）。

**涉及文件**：
- ✏️ `packages/desktop/src-tauri/src/lib.rs` — 新增 `file_exists_absolute` command + invoke_handler 注册（+30 行）
- ✏️ `packages/desktop/src/App.tsx` — 启动 useEffect 内插入陈旧校验分支（+19 行）

**Git Commit**：`77fad53`

**自测结果**：
- [x] `pnpm -F @aitools/desktop build`：vite 构建通过（222.05 KB，+0.21 KB 在阈值内）
- [x] `cargo check`：1.79s 通过
- [x] 场景 1（陈旧记录）：不弹窗 + `.last-migration.json` 被静默清理 ✅
- [x] 场景 2（有效记录）：弹窗正常显示 backupPath 与变更详情 ✅

---

## 偏离记录

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| — | 03-technical.md 实现步骤完全按计划执行，无偏离 | — | — |

---

## 遗留问题

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| — | 无遗留问题 | — | — |

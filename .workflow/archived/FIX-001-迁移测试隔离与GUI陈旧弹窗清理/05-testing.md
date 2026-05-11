# 测试验收报告：迁移测试隔离与 GUI 陈旧弹窗清理

> **任务编号**：FIX-001
> **创建日期**：2026-05-11
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)（已跳过）
> **技术方案**：[03-technical.md](./03-technical.md)
> **编码日志**：[04-coding-log.md](./04-coding-log.md)
> **状态**：通过

---

## 验收概览

本任务为**纯技术 bug 修复 + dead code 清理**，编码与验收高度同步——CODING 阶段已完成场景 1（陈旧记录）和场景 2（有效记录）的手动验收。本报告将 8 条 AC 的证据归集形式化。

---

## 1. 静态验收（AI 代码审查 + 工具链自动化）

### 1.1 功能逻辑覆盖（按需求文档 8 条 AC 逐条验证）

#### US-1：测试不污染家目录

| AC 编号 | 验收条件 | 代码覆盖 | 证据 |
|---------|---------|---------|------|
| AC-1.1 | 跑完 `pnpm -F @aitools/cli test` 后 `~/.aitools/.last-migration.json` mtime 不变（或不存在） | ✅ | 跑完 186 测试后 `ls ~/.aitools/.last-migration.json` 返回 `No such file or directory`（CODING 阶段步骤 5 实测） |
| AC-1.2 | `migrations.test.ts` 任意用例执行期间 `persistLastMigration()` 写入位于 `tempDir` 下 | ✅ | `vi.spyOn(os, 'homedir').mockReturnValue(tempDir)` 已在 `beforeEach` 注入；`persistLastMigration()` 内部 `lastMigrationPath()` 通过 `os.homedir()` 取值，被 spy 拦截重定向到 tempDir |
| AC-1.3 | 186 个单测 `pnpm -F @aitools/cli test` 全绿 | ✅ | `Test Files 17 passed (17) / Tests 186 passed (186)`，duration 819ms |

#### US-2：GUI 陈旧校验

| AC 编号 | 验收条件 | 代码覆盖 | 证据 |
|---------|---------|---------|------|
| AC-2.1 | `backupPath` 不存在时 → 不弹窗 + `.last-migration.json` 被静默删除 | ✅ | **场景 1 手动验收通过**：构造 `backupPath="/tmp/this-path-does-not-exist-fix001-test/..."`，启动 desktop 后 `ls ~/.aitools/.last-migration.json` 返回 `No such file or directory` |
| AC-2.2 | `backupPath` 存在时 → 弹窗正常显示 | ✅ | **场景 2 手动验收通过**：构造 `backupPath="/tmp/fix001-fake-config.yaml.bak"`（真实存在）+ 3 条 changes，启动 desktop 后弹窗正常显示 |
| AC-2.3 | `.last-migration.json` 不存在时 → 不弹窗（保持 FEAT-005 行为） | ✅ | 代码层面：`App.tsx` 的 `if (!raw) return;` 在新校验逻辑之前未变；行为不破坏 |

#### US-3：lint 恢复

| AC 编号 | 验收条件 | 代码覆盖 | 证据 |
|---------|---------|---------|------|
| AC-3.1 | `pnpm lint` 退出码 0 无 error | ✅ | CODING 阶段步骤 6 实测：lint 输出 `> eslint .` 后无任何 error/warning |
| AC-3.2 | `commands/config.ts` grep `getConfigDir` = 0 命中 | ✅ | 编码后 import 列表已删除该项；文件内本就无任何 `getConfigDir` 调用 |

### 1.2 设计规范合规

本任务为纯技术 bug 修复，**无 UI 变更**，设计规范合规检查不适用。

### 1.3 静态验收结论

- [x] **功能逻辑覆盖通过**（8/8 AC ✅）
- [x] **设计规范合规通过**（不适用）

---

## 2. 动态验收（用户运行验证）

### 2.1 功能验收（CODING 阶段已同步完成）

#### CLI 端

| 项 | 操作步骤 | 结果 | 备注 |
|---|---|---|---|
| 测试不污染家目录 | 1) 确认 `~/.aitools/.last-migration.json` 不存在 2) 跑 `pnpm -F @aitools/cli test` 3) 再次检查文件 | ✅ | 跑完后文件仍不存在 |
| Lint 干净 | `pnpm lint` | ✅ | 0 error 0 warning |
| Build 持平 | `pnpm -F @aitools/cli build` | ✅ | 50.72 KB（与 REFACTOR-001 PR-2 一致） |

#### Desktop 端

| 场景 | 操作步骤 | 结果 | 证据 |
|---|---|---|---|
| **场景 1：陈旧记录** | 1) 构造 `~/.aitools/.last-migration.json` 含 `backupPath: "/tmp/this-path-does-not-exist-fix001-test/..."` 2) `pnpm -F @aitools/desktop tauri:dev` | ✅ | 不弹"配置已自动升级"窗口；`.last-migration.json` 启动后被静默清理 |
| **场景 2：有效记录** | 1) 构造 `~/.aitools/.last-migration.json` 含 `backupPath: "/tmp/fix001-fake-config.yaml.bak"`（真实存在）2) 启动 desktop | ✅ | 弹窗正常显示，含 backupPath 与 3 条 changes |

### 2.2 UI 走查

本任务**零视觉变更**，UI 走查不适用（Q-4 已拍板）。场景 2 的弹窗显示样式 = FEAT-005 已落地的 `ConfigMigrationModal`，无任何样式改动。

### 2.3 动态验收结论

- [x] **功能验收通过**（CLI + Desktop 全部场景已实测）
- [x] **UI 走查通过**（不适用）

---

## 3. 非功能性验证

| 维度 | 要求 | 验证方式 | 实际 | 结果 |
|------|------|---------|------|------|
| 性能 · CLI 冷启动 | 不增加 | 静态审查 | 生产代码零改动 | ✅ |
| 性能 · GUI 启动 | 多一次 fs stat 不应 > 10ms | Tauri 实测 | `file_exists_absolute` 是单次 `try_exists()`，本机毫秒级 | ✅ |
| 兼容性 | Node.js ≥ 20、Tauri 2.x、无新增依赖 | `package.json` / `Cargo.toml` 审查 | 仅新增 1 个 Rust command，0 npm/cargo 依赖变更 | ✅ |
| 可回滚 | 单 PR 提交 | git 能力 | 阶段 A `a0251e7` + 阶段 B `77fad53` 各自独立可 revert | ✅ |
| 测试覆盖 | 现有 186 测试全绿 | `pnpm test` | 全绿，duration 819ms | ✅ |
| 代码侵入性 | CLI 侧生产代码零改动 | 静态审查 | `persistLastMigration` / `lastMigrationPath` 保持不动；仅修改测试文件 + 1 行 import 删除 | ✅ |

---

## 4. 缺陷记录

### 4.1 本次验收新发现缺陷

无。

### 4.2 编码期间发现并已处理的问题

无。本任务方案选定后实施过程顺畅，0 偏离 0 ISSUE。

### 4.3 遗留问题

无。

---

## 5. 验收结论

### 静态验收（AI）

- [x] 功能逻辑覆盖通过（8/8 AC ✅）
- [x] 设计规范合规通过（不适用）

### 动态验收（用户）

- [x] 功能验收通过（场景 1 + 场景 2 全部实测）
- [x] UI 走查通过（不适用，零视觉变更）

### 非功能性

- [x] 非功能性验证通过（性能、兼容性、可回滚、测试覆盖、代码侵入性 6/6 ✅）

**综合结论**：**通过**。

**备注**：

- 修复彻底解决了 backlog 登记的 BUG-001（拆分为 US-1 测试隔离 + US-2 GUI 校验）
- 顺带消除 REFACTOR-001 遗留 L-1（dead import）
- 整体代码改动极小：测试 1 行 spy + Rust 1 个新 command + React 8 行新分支 + 删除 1 行 import
- 可以归档。

---

## 6. 经验总结（Retro）

### 做得好的

- **方案纠偏及时**：你在 ANALYSIS 末尾追问"为什么需要引入环境变量？"——一句话推动我从过度设计的方案 A 切换到对齐项目惯用法的方案 D。**生产代码零改动 + 工作量从 2~3h 降到 30min**，是本次最关键的决策修正
- **顺手合并 L-1**：避免独立 FIX-002 走完整 workflow 的 overhead；TD-6 决策合理
- **分阶段 commit**：阶段 A（CLI）和阶段 B（GUI）独立 commit，git blame 与 revert 语义都很干净
- **方案与实现 0 偏离**：03-technical.md 写得足够细，CODING 阶段照单完成，无意外

### 需要改进的

- 我最初提案选 A（环境变量）反映出**没先看项目已有惯用法**的盲区——以后做"测试隔离"类任务，**第一步应该是 grep 已有 setup 模式**，然后再设计方案
- ANALYSIS 阶段的 4 个开放问题里，Q-1 和 Q-2 都是建立在"方案 A"假设上的——如果在写需求时就先做事实核查（比如 5 分钟 grep `vi.spyOn`），这两个问题根本不会出现

### 后续行动

- 无新增 backlog 候选
- backlog 现状：BUG-001（已合入 FIX-001 完成）+ REFACTOR-002（候选，等触发条件）+ L-1（已随 FIX-001 完成）
- workflow 计数器：FEAT=5, FIX=1, REFACTOR=1

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-11 | 初稿创建，静态 + 动态验收全部通过，综合结论 = 通过 | AI |

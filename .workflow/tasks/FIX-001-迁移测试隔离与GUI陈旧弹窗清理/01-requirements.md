# 需求文档：迁移测试污染家目录 + GUI 陈旧弹窗清理

> **任务编号**：FIX-001
> **创建日期**：2026-05-11
> **状态**：草稿

---

## 1. 背景与目标

### 1.1 背景

FEAT-005 引入了配置迁移管线（`packages/cli/src/config/migrations/`），其中 `persistLastMigration()` 会把迁移结果落盘到 `~/.aitools/.last-migration.json`，供 GUI 启动时读取弹窗。这个机制在产品层面是正确的，但在测试与边界场景下暴露了两个缺陷：

**缺陷 1：测试污染真实用户家目录**

- `persistLastMigration()` 通过 `os.homedir()` 构造路径（见 `migrations/index.ts:lastMigrationPath`）
- `tests/config/migrations.test.ts` 的 `beforeEach` **没有 mock `os.homedir`**——只隔离了配置文件路径（tempDir），没有隔离迁移结果落盘路径
- 对比：项目里 `tests/config/manager.test.ts`、`tests/commands/subscribe.test.ts`、`tests/commands/unsubscribe.test.ts` 都有标准的 `vi.spyOn(os, 'homedir').mockReturnValue(fakeHome)` 惯用法
- 结果：每次跑 `pnpm test` 都会真实污染 `~/.aitools/.last-migration.json`
- 首次暴露：2026-05-09 FEAT-005 验收后启动 desktop，弹出"配置已自动升级"弹窗，但 `backupPath` 指向 `/var/folders/.../T/aitools-migration-test-*`（vitest 临时夹具路径）
- **根因定性**：单测漏补 `os.homedir` spy，**非架构问题**；本修复只需对齐项目惯用法

**缺陷 2：GUI 缺少陈旧记录校验**

- `packages/desktop/src/App.tsx` 启动时读取 `.last-migration.json` 后直接弹窗
- 不校验 `backupPath` 指向的 `.bak` 文件是否仍存在
- 结果：备份文件被 tmp 清理 / 用户主动删除 / 已过期时，GUI 仍会弹出误导信息
- 用户体验：首次迷惑"我为什么会看到陌生的临时目录路径？"

**顺带清理：REFACTOR-001 遗留 L-1**

- `packages/cli/src/commands/config.ts:25` 从 `manager.js` 导入了 `getConfigDir`，但文件内从未使用
- ESLint 报 `'getConfigDir' is defined but never used`
- 不是本次 FIX 的核心，但改动极小（1 行删除），与本任务共享一次 PR 更经济

### 1.2 目标

1. **测试侧**：对齐项目惯用法，给 `migrations.test.ts` 补上 `os.homedir` spy；跑完 `pnpm test` 后 `~/.aitools/.last-migration.json` 不应出现
2. **GUI 侧**：增加陈旧记录校验——启动时若发现 `backupPath` 文件不存在，静默删除 `.last-migration.json` 不弹窗
3. **dead code**：删除 `config.ts` 中未使用的 `getConfigDir` import

---

## 2. 用户故事

| 编号 | 用户故事 | 优先级 |
|------|---------|--------|
| US-1 | 作为开发者，我希望跑完 `pnpm test` 后 `~/.aitools/.last-migration.json` 不出现，以便避免测试污染用户家目录 | P0 |
| US-2 | 作为 GUI 用户，我希望当 `.bak` 备份文件已不存在时 desktop 不弹"配置已自动升级"弹窗，以便避免看到误导性的临时目录路径 | P0 |
| US-3 | 作为开发者，我希望 `pnpm lint` 无 error（只剩真实代码问题），以便恢复 lint 作为质量门禁的有效性 | P1 |

---

## 3. 功能范围

### 3.1 包含（In Scope）

**CLI 侧（测试隔离，生产代码零改动）**
- [ ] 修改 `packages/cli/tests/config/migrations.test.ts` 的 `beforeEach`：新增 `vi.spyOn(os, 'homedir').mockReturnValue(tempDir)` 一行
- [ ] 修改对应的 `afterEach`：增加 `vi.restoreAllMocks()` 恢复 spy（或针对性 restore）
- [ ] **不改**任何生产代码（`persistLastMigration` / `lastMigrationPath` 保持不动）
- [ ] 不新增单测——现有测试在补完 spy 后就能证明"测试不污染家目录"；额外增加反而冗余

**GUI 侧（陈旧校验）**
- [ ] 修改 `packages/desktop/src/App.tsx`：读取 `.last-migration.json` 后用 Tauri `read_text_file_optional` 检查 `backupPath` 是否存在
  - 存在 → 正常弹窗（现有逻辑）
  - 不存在 → 调用 Tauri `delete_file_optional` 清理 `.last-migration.json`，不弹窗
- [ ] Tauri Rust 端已有 `read_text_file_optional` / `delete_file_optional`（FEAT-005 实现），本次不需要新增 command

**顺带清理**
- [ ] 删除 `packages/cli/src/commands/config.ts:25` 的 `getConfigDir` 未使用 import

### 3.2 不包含（Out of Scope）

- ❌ 不改 `persistLastMigration()` 的实现或签名（生产代码零动）
- ❌ 不引入环境变量或依赖注入机制（项目已有 `os.homedir` spy 惯用法，无需过度设计）
- ❌ 不改 `.last-migration.json` 的数据 schema
- ❌ 不处理"用户主动忽略弹窗后是否立即清理 `.last-migration.json`"这条独立路径（这是 ack 机制，已在 FEAT-005 实现）
- ❌ 不修 ESLint 配置（L-1 只是删除 dead import，不动 lint 规则）
- ❌ 不做 backlog 中其他候选任务（REFACTOR-002 等）

---

## 4. 验收标准（Acceptance Criteria）

### US-1 验收标准（测试不污染家目录）

- [ ] **Given** 仓库有一份干净或已有的 `~/.aitools/.last-migration.json` **When** 执行 `pnpm -F @aitools/cli test` **Then** 该文件的 mtime 在测试前后保持一致（不被修改也不被创建）
- [ ] **Given** `tests/config/migrations.test.ts` 任意用例执行期间 **When** `persistLastMigration()` 被调用 **Then** 写入路径位于 `tempDir` 下，不触达真实 `~/.aitools/`
- [ ] **Given** 186 个单测 **When** `pnpm -F @aitools/cli test` 跑完 **Then** 仍然 186/186 全绿

### US-2 验收标准（GUI 陈旧校验）

- [ ] **Given** `~/.aitools/.last-migration.json` 指向的 `backupPath` 文件不存在 **When** 启动 desktop **Then** 不弹窗，且 `.last-migration.json` 被静默删除
- [ ] **Given** `~/.aitools/.last-migration.json` 指向的 `backupPath` 文件存在 **When** 启动 desktop **Then** 弹窗正常显示（现有行为不破坏）
- [ ] **Given** `~/.aitools/.last-migration.json` 不存在 **When** 启动 desktop **Then** 不弹窗（现有行为不破坏）

### US-3 验收标准（lint 恢复）

- [ ] **Given** 当前仓库 **When** 执行 `pnpm lint` **Then** 退出码为 0，无 error（warning 可接受）
- [ ] **Given** `packages/cli/src/commands/config.ts` **When** grep `getConfigDir` **Then** 匹配结果为 0（既无 import 也无调用）

---

## 5. 非功能性需求

| 维度 | 要求 |
|------|------|
| 性能 | 修改不增加 CLI 冷启动时间；GUI 启动时多一次 fs 存在性检查，不应 > 10ms |
| 兼容性 | 保持 Node.js ≥ 20、Tauri 2.x；无新增外部依赖 |
| 可回滚 | 单 PR 提交，revert 语义干净 |
| 测试覆盖 | 现有 186 测试全绿；无需新增（补 spy 后原测试本身就是证明） |
| 代码侵入性 | **生产代码零改动**（CLI 侧） |

---

## 6. 约束与依赖

**技术约束**
- 不能破坏 FEAT-005 已落地的迁移管线核心逻辑
- 不能破坏 FEAT-005 GUI 双通道兜底机制（NDJSON 事件 + `.last-migration.json`）
- 测试 spy 必须与项目已有惯用法保持一致（`manager.test.ts` / `subscribe.test.ts` / `unsubscribe.test.ts` 风格）

**外部依赖**
- 无新增依赖

**时间约束**
- 估算：CODING 30~60 分钟（方案 D 让工作量大幅缩小）；TESTING 30 分钟
- 无硬性 deadline

---

## 7. 开放问题

| 编号 | 问题 | 状态 | 结论 |
|------|------|------|------|
| Q-1 | ~~是否引入环境变量 `AITOOLS_LAST_MIGRATION_PATH`？~~ | 已关闭 | **不引入**。项目已有 `vi.spyOn(os, 'homedir')` 惯用法（方案 D），生产代码零改动即可解决；引入环境变量属过度设计 |
| Q-2 | ~~vitest 环境变量注入方式？~~ | 已关闭 | 因 Q-1 下线而无意义 |
| Q-3 | GUI 陈旧校验发现 `backupPath` 不存在时，是静默删除 `.last-migration.json`，还是保留 + 加个"已失效"标记？ | 已拍板 | **静默删除**——`.last-migration.json` 本质是"一次性通知"，删除避免文件积累 |
| Q-4 | 是否需要 UI 走查？ | 已拍板 | **不需要**——本任务 UI 层面仅涉及"弹窗不出现"的负行为，零视觉变更 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-11 | 初稿创建（整合 backlog BUG-001 + REFACTOR-001 遗留 L-1） | AI |
| 2026-05-11 | 根据用户追问，修正方案：从"引入环境变量"改为"对齐项目已有 `os.homedir` spy 惯用法"（方案 D）；生产代码零改动；关闭 Q-1/Q-2 | AI + 用户 |

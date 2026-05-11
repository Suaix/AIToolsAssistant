# 技术方案：迁移测试隔离与 GUI 陈旧弹窗清理

> **任务编号**：FIX-001
> **创建日期**：2026-05-11
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)（已跳过）
> **状态**：草稿

---

## 1. 概述

### 1.1 技术目标

1. 修复 `tests/config/migrations.test.ts` 测试污染家目录的缺陷（方案 D：对齐 `os.homedir` spy 惯用法）
2. 为 `packages/desktop/src/App.tsx` 的启动弹窗逻辑增加 `backupPath` 存在性校验，陈旧记录静默清理
3. 顺带清理 `packages/cli/src/commands/config.ts` 未使用的 `getConfigDir` import

### 1.2 技术约束

- CLI 侧：**生产代码零改动**；仅改测试文件
- Tauri Rust 端：可新增一个只读 fs command（`file_exists_absolute`），不得破坏现有 command
- React 端：保持 FEAT-005 已有的 `.last-migration.json` + localStorage ack 双通道逻辑，仅在入口加一层陈旧校验
- 无新增 npm 依赖

---

## 2. 架构设计

### 2.1 修改 1：测试隔离（CLI 侧）

#### 当前问题路径

```
migrations.test.ts:beforeEach
  ├── 创建 tempDir（os.tmpdir()）
  ├── 设置 configPath = tempDir/config.yaml
  └── ❌ 未 mock os.homedir
       ↓
调用 migrateConfigDispatch(parsed, configPath)
  ↓
内部调用 persistLastMigration(outcome)
  ↓
lastMigrationPath() 返回 os.homedir() + '.aitools/.last-migration.json'
  ↓
实际写到 ~/.aitools/.last-migration.json  ← 污染真实家目录
```

#### 修复后路径

```
migrations.test.ts:beforeEach
  ├── 创建 tempDir
  ├── 设置 configPath = tempDir/config.yaml
  └── ✅ vi.spyOn(os, 'homedir').mockReturnValue(tempDir)
       ↓
调用 migrateConfigDispatch(parsed, configPath)
  ↓
persistLastMigration(outcome)
  ↓
lastMigrationPath() 返回 tempDir + '.aitools/.last-migration.json'
  ↓
实际写到 tempDir/.aitools/.last-migration.json  ✓ 隔离
  ↓
afterEach: fs.rm(tempDir, recursive) + vi.restoreAllMocks()
```

#### 与项目惯用法对照

`tests/config/manager.test.ts:28-30` 已经是这个形态：
```typescript
beforeEach(async () => {
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-manager-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  ...
});
```

本修复使 `migrations.test.ts` 与之对齐。

### 2.2 修改 2：GUI 陈旧校验

#### 当前数据流（FEAT-005）

```
App.tsx:useEffect (启动时)
  ↓
read_text_file_optional(home, '.aitools/.last-migration.json')
  ↓
解析 JSON → { status, backupPath, persistedAt, ... }
  ↓
检查 localStorage ack 去重
  ↓
status === 'migrated' ? setMigrationOutcome(parsed) → 显示 ConfigMigrationModal
                      : return
```

#### 修复后数据流（新增 4 步绿色框）

```
App.tsx:useEffect (启动时)
  ↓
read_text_file_optional(home, '.aitools/.last-migration.json')
  ↓
解析 JSON → { status, backupPath, persistedAt, ... }
  ↓
┌──────────────────────────────────────────────────┐
│ NEW: 校验 backupPath 存在性                      │
│   invoke('file_exists_absolute', { path })       │
│   ├── 存在 → 继续原流程                           │
│   └── 不存在 → invoke('delete_file_optional')     │
│                清理 .last-migration.json          │
│                return（不弹窗）                   │
└──────────────────────────────────────────────────┘
  ↓
检查 localStorage ack 去重
  ↓
status === 'migrated' ? setMigrationOutcome(parsed) → 显示弹窗
                      : return
```

### 2.3 修改 3：Dead import 清理

单点删除，无架构影响：

```typescript
// packages/cli/src/commands/config.ts:25
import {
  loadConfig,
  saveConfig,
  expandTilde,
  collapseTilde,
  getConfigDir,  // ← 删除此行
} from '../config/manager.js';
```

`manager.ts` 里的 `getConfigDir` 定义本身**保留不动**（它在 `manager.ts` 内部被使用 4 处：L32 L41 L50 L318）。

---

## 3. 接口定义

### 3.1 新增 Tauri command：`file_exists_absolute`

**位置**：`packages/desktop/src-tauri/src/lib.rs`

**签名**：
```rust
#[tauri::command]
fn file_exists_absolute(path: String) -> Result<bool, String>
```

**语义**：
- 输入绝对路径，返回该路径**作为文件**是否存在
- 路径解析失败（如空字符串）→ 返回 `Err`
- 路径不存在 → `Ok(false)`
- 路径存在但是目录 → `Ok(false)`（严格要求"是文件"）
- 路径存在且是文件 → `Ok(true)`

**安全性**：
- 不对 `..` 做限制（该函数只读、不返回内容，不像 `read_text_file_optional` 那样有信息泄露风险）
- 不触及写操作，对用户文件系统无副作用

**注册**：`invoke_handler` 数组追加条目

### 3.2 App.tsx 前端调用契约

```typescript
const exists = await invoke<boolean>('file_exists_absolute', {
  path: parsed.backupPath,
}).catch(() => false);  // 调用失败视为不存在，安全兜底

if (!exists) {
  await invoke('delete_file_optional', {
    basePath: home,
    relativePath: '.aitools/.last-migration.json',
  }).catch(() => {});
  return;  // 不弹窗
}
```

### 3.3 测试 spy 契约

```typescript
// tests/config/migrations.test.ts
import { vi } from 'vitest';  // 已有

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-migration-test-'));
  configPath = path.join(tempDir, 'config.yaml');
  projectConfigPath = path.join(tempDir, 'project.yaml');
  reporter = new NoopMigrationReporter();
  setDefaultReporter(reporter);
  /* 新增：与 manager.test.ts / subscribe.test.ts 惯用法对齐，
     避免 persistLastMigration 污染真实 ~/.aitools/.last-migration.json */
  vi.spyOn(os, 'homedir').mockReturnValue(tempDir);
});

afterEach(async () => {
  resetDefaultReporter();
  vi.restoreAllMocks();  // 新增：恢复 os.homedir spy
  await fs.rm(tempDir, { recursive: true, force: true });
});
```

---

## 4. 数据模型

本任务**不涉及**任何数据结构变更：
- `.last-migration.json` 的 schema 保持不变
- `MigrationOutcome` 类型保持不变
- `GuiMigrationOutcome` 类型保持不变

---

## 5. 影响范围分析

### 5.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|---|---|---|
| `packages/cli/tests/config/migrations.test.ts` | `beforeEach` 加 `vi.spyOn(os, 'homedir')`；`afterEach` 加 `vi.restoreAllMocks()` | 低（仅测试） |
| `packages/desktop/src/App.tsx` | 启动弹窗 useEffect 内部新增 `file_exists_absolute` 校验与清理分支 | 中（GUI 行为） |
| `packages/desktop/src-tauri/src/lib.rs` | 新增 `file_exists_absolute` command + `invoke_handler` 注册 | 中（Rust 端） |
| `packages/cli/src/commands/config.ts` | 删除第 25 行 `getConfigDir,` | 极低（1 行 import cleanup） |

### 5.2 新增文件

无。

### 5.3 依赖变更

无。

### 5.4 不受影响的文件（确认）

- `packages/cli/src/config/migrations/index.ts`（生产代码零动）
- `packages/cli/src/config/migrations/reporter.ts`
- `packages/desktop/src/components/ConfigMigrationModal.tsx`
- 其他所有测试文件
- SSOT / 其他业务逻辑

---

## 6. 实现步骤

### 阶段 A：CLI 测试隔离 + Dead import（约 20 分钟）

| 步骤 | 描述 | 预计工作量 | 验收 |
|---|---|---|---|
| 1 | `packages/cli/src/commands/config.ts` 删除第 25 行 `getConfigDir,` | 1 分钟 | grep 确认 0 命中 |
| 2 | `packages/cli/tests/config/migrations.test.ts`：`beforeEach` 加 `vi.spyOn(os, 'homedir').mockReturnValue(tempDir)`；`afterEach` 加 `vi.restoreAllMocks()` | 5 分钟 | 对齐 `manager.test.ts` 风格 |
| 3 | 清理现有污染：`rm -f ~/.aitools/.last-migration.json`（若存在） | 1 分钟 | 干净起点 |
| 4 | 跑 `pnpm -F @aitools/cli test`，验证 186/186 全绿 | 3 分钟 | 全绿 |
| 5 | 跑完后 `ls ~/.aitools/.last-migration.json`，验证不存在 | 1 分钟 | 不存在 = 修复生效 |
| 6 | 跑 `pnpm lint`，验证无 getConfigDir unused 错误 | 3 分钟 | 0 error |
| 7 | 独立 commit：`fix(cli): 修复 migrations 测试污染家目录 + 清理 dead import (FIX-001 阶段 A)` | 2 分钟 | 语义清晰 |

### 阶段 B：GUI 陈旧校验（约 30 分钟）

| 步骤 | 描述 | 预计工作量 | 验收 |
|---|---|---|---|
| 8 | `packages/desktop/src-tauri/src/lib.rs` 新增 `file_exists_absolute` command；加入 `invoke_handler` 注册 | 10 分钟 | cargo check 通过 |
| 9 | `packages/desktop/src/App.tsx`：启动 useEffect 在 `setMigrationOutcome(parsed)` 之前插入 `file_exists_absolute(parsed.backupPath)` 校验分支 | 10 分钟 | TS 类型通过 |
| 10 | `pnpm -F @aitools/desktop build` 前端构建验证 | 1 分钟 | 通过 |
| 11 | `cargo check` 在 src-tauri 目录 | 1 分钟 | 通过 |
| 12 | 手动验收 1：构造 `~/.aitools/.last-migration.json`，`backupPath` 指向不存在路径 → 启动 desktop → 应不弹窗 + 文件被删 | 5 分钟 | 行为符合 US-2 AC 1 |
| 13 | 手动验收 2：构造 `.last-migration.json`，`backupPath` 指向真实存在文件 → 启动 desktop → 应弹窗 | 3 分钟 | 行为符合 US-2 AC 2 |
| 14 | 独立 commit：`fix(desktop): 启动时校验迁移备份文件存在性，陈旧记录静默清理 (FIX-001 阶段 B)` | 1 分钟 | 语义清晰 |

### 阶段 C：提交 + 推送（约 5 分钟）

| 步骤 | 描述 | 预计工作量 |
|---|---|---|
| 15 | 更新 `04-coding-log.md` / `CHANGELOG.md` | 3 分钟 |
| 16 | 推送 `git push origin feature/gui` | 1 分钟 |

**总计**：约 55 分钟。

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|---|---|---|---|
| `vi.spyOn(os, 'homedir')` 影响到 `migrations.test.ts` 其他原本依赖真实 `os.homedir()` 的行为 | 极低 | 低 | 读了整个测试文件，`os.homedir` 只在测试初始化 `tempDir` 时被间接使用；且 `tempDir` 在 mock 前已创建完毕 → 无干扰 |
| `file_exists_absolute` 新 command 未注册成功导致前端 invoke 失败 | 低 | 中 | `catch(() => false)` 兜底：调用失败视为"文件不存在"，触发清理 + 不弹窗——保守但安全 |
| backupPath 格式异常（如空字符串、相对路径） | 低 | 低 | `catch(() => false)` 同上兜底；同时前端对 `parsed.backupPath` 加 `typeof ... === 'string' && length > 0` 前置校验 |
| 陈旧校验破坏 FEAT-005 已有 `localStorage ack` 去重逻辑 | 低 | 中 | 保持原有代码**顺序不变**，只在 `setMigrationOutcome` **之前**插入新校验分支；原代码不改只增 |
| 清理 dead import 后某个未覆盖测试暴露 `getConfigDir` 实际有被用 | 极低 | 低 | 已静态 grep 确认 `config.ts` 内无任何使用（只在 import 列表出现）；且 `manager.ts` 内部定义保留 |
| vitest `restoreAllMocks` 副作用影响其他测试 | 低 | 低 | `restoreAllMocks` 作用于本文件的 `afterEach`，不跨文件；Vitest 文件隔离默认机制保证不泄漏 |

---

## 8. 回滚方案

- **阶段 A 回滚**：`git revert <阶段 A commit>` 即可
- **阶段 B 回滚**：`git revert <阶段 B commit>` 即可
- **紧急回滚**：两个 commit 均回退，回到 `01c0ef6`（REFACTOR-001 归档 commit）
- 数据风险：**无**（纯逻辑变更，不动任何配置/数据 schema）

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|---|---|---|---|
| TD-1 | 测试隔离用方案 D（`vi.spyOn(os, 'homedir')`）而非方案 A（环境变量）/ B（依赖注入）/ C（模块 mock） | A：生产代码加 env var 读取；B：`persistLastMigration` 增加 path 参数，调用链改 3~4 处；C：`vi.mock` 整个模块 | 1）项目已有成熟惯用法（`manager.test.ts` / `subscribe.test.ts` / `unsubscribe.test.ts` 三个文件），一致性最重要；2）生产代码零改动，最小侵入；3）工作量最小（1 行新增） |
| TD-2 | 新增 Tauri command `file_exists_absolute` 而非复用 `read_text_file_optional` | 复用：把 absolute backupPath 解析为 `base_path + relative_path` 再调用 | 1）`read_text_file_optional` 会实际读文件内容，只为判断存在性开销过大；2）`.bak` 文件可能很大，读取浪费 IO；3）新 command 只 stat，零副作用、可复用 |
| TD-3 | `file_exists_absolute` 不限制 `..` 路径（不像 `read_text_file_optional` 有限制） | 加 `..` 白名单校验 | 1）该函数只读、不返回内容，**无信息泄露**面；2）`backupPath` 由 CLI 写入，可信来源；3）有限制反而要对 CLI 写入的路径做额外适配，增加耦合 |
| TD-4 | 陈旧校验失败时**静默删除** `.last-migration.json` 而非保留 | 保留 + 加"已失效"标记 | 1）文件本质是"一次性通知"；2）累积失效记录无收益；3）符合 L2「诚实先于友好」——不展示无意义信息 |
| TD-5 | Tauri command 新增放在 `lib.rs` 而非独立模块 | 新建 `fs_commands.rs` 独立模块 | 1）lib.rs 已有 `read_text_file_optional` / `delete_file_optional` 两个同类 command；放一起语义一致；2）独立模块属于组织重构，超出 FIX 范围 |
| TD-6 | dead import 清理合并进本任务而非单独立 FIX-002 | 单独立 FIX-002 走完整 workflow | 1）改动 1 行成本与 workflow overhead 不成比例；2）阶段 A 独立 commit 可 revert，不影响 blame |
| TD-7 | 阶段 A / B 分两个独立 commit 而非单 commit | 单 commit 全部 | 1）两阶段语义不同（测试隔离 vs GUI 校验），分开便于 revert 与审查；2）失败面小，阶段 A 如过不了不影响阶段 B 推进 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-11 | 初稿创建 | AI |

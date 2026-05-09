# 技术方案：claude 命名统一 + 旧 config 迁移

> **任务编号**：FEAT-005
> **创建日期**：2026-05-09
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：草稿（待 TECHNICAL → CODING 门禁）

---

## 1. 概述

### 1.1 技术目标

1. 引入 **JSON 形式的 AI 工具 SSOT**（`shared/tools.json`），替换 CLI / desktop 双端共 5 处分散的工具元数据
2. 在 `loadConfig` / `loadProjectConfig` 内部建立 **schema 版本感知的迁移管线**：`read → migrate → validate → normalize`
3. 在 `syncResourceToDir` 入口插入 **目录守卫断言**，保证 aitools 不主动创建任何 AI 工具家目录
4. 配套测试、文档、RFC 同步

### 1.2 技术约束

| 维度 | 约束 |
|---|---|
| 兼容性 | 支持从 v0.2.0 / v0.4.0 / v0.4.x（含 `claude-code` 旧名）迁移；不支持 v0.1.x 或更早 |
| 性能 | 已是最新 schema 时 `loadConfig` < 5ms（仅 yaml parse + version 比较）|
| 依赖 | 不引入新依赖；JSON SSOT 用 `import attributes`（Node ≥ 22）或 `fs.readFileSync` 兼容 ≥ 20 |
| 模块边界 | SSOT 文件零外部依赖（纯字面量 + 类型）；CLI 与 desktop 各自包薄类型适配层 |
| 代码规范 | 所有新增类/方法/常量必须中文注释；单方法 ≤ 100 行；单文件 ≤ 5000 行；不在循环中 new 对象 |
| Tauri | `desktop/src-tauri/src/lib.rs:ensure_project_config` 仅写最小新文件，不读旧文件，**不需要迁移逻辑** |

---

## 2. 架构设计

### 2.1 整体架构

```
                  ┌──────────────────────────────────┐
                  │   shared/tools.json (SSOT)        │
                  │   · name / displayName            │
                  │   · userBase / projectDirAliases  │
                  │   · defaultEnabled                │
                  └──────┬──────────────────┬─────────┘
                         │                  │
       import json       │                  │   import json
                         ▼                  ▼
        ┌─────────────────────────┐    ┌─────────────────────────┐
        │ src/registry/tools.ts    │    │ desktop/src/lib/tools.ts │
        │ （CLI 适配层）            │    │ （GUI 适配层）            │
        └──┬──────────────────────┘    └──┬──────────────────────┘
           │                              │
   被以下消费                       被以下消费
   · manager.getDefaultTargets    · AddToolModal
   · target.AVAILABLE_TOOLS       · SyncProgressModal 行渲染
   · list.TARGET_DISPLAY          · detectProjectTools

        ┌──────────────────────────────────────────────────────┐
        │              配置读取链路（迁移注入点）               │
        │                                                      │
        │   yaml file ──▶ parseYaml ──▶ migrate ──▶ validate   │
        │                                  │                   │
        │                                  ▼                   │
        │                            saveConfig（首次）         │
        │                                  │                   │
        │                                  ▼                   │
        │                      ConfigMigrationReporter         │
        │                                  │                   │
        │                                  ▼                   │
        │                  CLI: 单行 ℹ ；GUI: MigrationModal   │
        └──────────────────────────────────────────────────────┘

        ┌──────────────────────────────────────────────────────┐
        │              同步链路（目录守卫注入点）               │
        │                                                      │
        │   syncResourceToDir(resource, baseDir, name)         │
        │       │                                              │
        │       ├─▶ assertToolHomeExists(baseDir)  ← 新增      │
        │       │       └─ 不存在 → return SkippedMissingTool   │
        │       │                                              │
        │       └─▶ mkdir(baseDir)（仅在断言通过后） + copy    │
        └──────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
新增：
shared/
├── tools.json                              ← JSON SSOT（新增）
└── tools.schema.ts                         ← 类型定义（仅 type，不参与运行时）

src/
├── registry/
│   └── tools.ts                            ← CLI 适配层（新增）
├── config/
│   ├── manager.ts                          ← 修改：loadConfig 注入迁移管线
│   ├── project.ts                          ← 修改：loadProjectConfig 注入迁移管线
│   ├── migrations/                         ← 新增目录
│   │   ├── index.ts                        ← migrate 调度器
│   │   ├── reporter.ts                     ← MigrationReporter 协议
│   │   ├── v0.2-to-v0.4.ts                 ← user_path → user_base
│   │   ├── v0.4-to-v0.5.ts                 ← 补 user_subscriptions + claude 改名
│   │   └── relocate-legacy-dirs.ts         ← 用户/项目级旧 user_base 资源搬迁
│   └── version.ts                          ← 当前 schema version 常量
├── core/
│   └── syncer.ts                           ← 修改：插入 assertToolHomeExists 守卫
├── utils/
│   └── tool-home-assert.ts                 ← 守卫辅助函数（新增）
└── commands/
    ├── target.ts                           ← 修改：AVAILABLE_TOOLS 改从 SSOT 读
    ├── list.ts                             ← 修改：TARGET_DISPLAY 改从 SSOT 读
    └── init.ts                             ← 修改：默认值流来自 SSOT

desktop/src/
├── lib/
│   └── tools.ts                            ← 修改：导入 SSOT 删除硬编码列表 + 删除 TOOL_PROJECT_DIR_ALIASES
└── components/
    ├── MigrationModal.tsx                  ← 新增组件
    └── SyncProgressModal.tsx               ← 修改：新增"未检测到"行状态

desktop/src/App.tsx                          ← 修改：启动时检测 migrationAck 并弹 MigrationModal

tests/
├── config/
│   ├── manager.test.ts                     ← 修改：claude-code → claude-internal fixture
│   └── migrations.test.ts                  ← 新增（迁移管线单测）
├── core/
│   ├── syncer.test.ts                      ← 修改：fixture 同步 + 新增守卫用例
│   ├── detectProjectTools.test.ts          ← 修改
│   └── subscriptions.test.ts               ← 修改
├── commands/
│   └── target.test.ts                      ← 修改
└── utils/
    └── tool-home-assert.test.ts            ← 新增

docs/
├── rfcs/
│   └── v0.5.0-naming-and-migration.md      ← 新增 RFC
└── README.md                                ← 修改示例与升级指引

README.md                                    ← 修改工具表 / config 示例 / 升级指引
```

---

## 3. 接口定义

### 3.1 SSOT 数据契约

**`shared/tools.json`**（最终形态示意）：

```json
{
  "schemaVersion": 1,
  "tools": [
    {
      "name": "codebuddy",
      "displayName": "CodeBuddy",
      "userBase": "~/.codebuddy",
      "projectDirAliases": [".codebuddy"],
      "defaultEnabled": true
    },
    {
      "name": "workbuddy",
      "displayName": "WorkBuddy",
      "userBase": "~/.workbuddy",
      "projectDirAliases": [".workbuddy"],
      "defaultEnabled": false
    },
    {
      "name": "claude-internal",
      "displayName": "Claude Internal",
      "userBase": "~/.claude-internal",
      "projectDirAliases": [".claude-internal"],
      "defaultEnabled": false
    }
  ],
  "legacyAliases": {
    "claude-code": "claude-internal",
    "claude": "claude-internal"
  },
  "legacyUserBases": {
    "~/.claude": "~/.claude-internal",
    "~/.claude-code": "~/.claude-internal"
  },
  "legacyProjectDirs": {
    ".claude-code": ".claude-internal"
  }
}
```

**说明**：
- `legacyAliases` / `legacyUserBases` / `legacyProjectDirs` 是**迁移函数的查找表**，本任务唯一使用方就是 `migrations/`
- 完成迁移后 `TOOL_PROJECT_DIR_ALIASES` 不再需要（已决策 Q-6 下线）
- `defaultEnabled` 替代 `getDefaultTargets()` 中的硬编码

**`shared/tools.schema.ts`**（纯类型定义，不参与运行时）：

```typescript
/** SSOT 数据契约：AI 工具元信息 */
export interface ToolDefinition {
  /** 工具唯一标识，与 CLI target.name 一致；规范命名小写中划线 */
  name: string;
  /** 用户可见显示名 */
  displayName: string;
  /** 用户级目录路径（约定 ~/<base>） */
  userBase: string;
  /** 项目级标记目录候选（带 . 前缀），目前仅一个，保留数组形态便于扩展 */
  projectDirAliases: string[];
  /** init / target add 时是否默认 enabled */
  defaultEnabled: boolean;
}

/** SSOT 完整结构 */
export interface ToolsRegistry {
  schemaVersion: number;
  tools: ToolDefinition[];
  /** 旧 target.name → 新 target.name */
  legacyAliases: Record<string, string>;
  /** 旧 user_base → 新 user_base */
  legacyUserBases: Record<string, string>;
  /** 旧项目级标记目录 → 新项目级标记目录（如 .claude-code → .claude-internal）*/
  legacyProjectDirs: Record<string, string>;
}
```

### 3.2 CLI 适配层（`src/registry/tools.ts`）

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ToolDefinition, ToolsRegistry } from '../../shared/tools.schema.js';

/**
 * 加载 SSOT JSON
 *
 * 不使用 import attributes（避免对 Node 22 的硬依赖），改为运行时 readFileSync。
 * 路径相对于本文件，tsup 打包时会保留相对结构（dist/registry/tools.js → ../../shared/tools.json）。
 *
 * NOTE：tsup 配置需声明 shared/tools.json 为 publicDir 拷贝产物（实现步骤 §6 步骤 2）
 */
const REGISTRY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../shared/tools.json',
);

/** 已加载的 SSOT 注册表（模块级缓存，进程内只读一次） */
const REGISTRY: ToolsRegistry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));

/** 获取所有已知工具（不可变） */
export function getAllTools(): readonly ToolDefinition[] {
  return REGISTRY.tools;
}

/** 按 name 查找工具，未找到返回 undefined */
export function findTool(name: string): ToolDefinition | undefined {
  return REGISTRY.tools.find((t) => t.name === name);
}

/** 获取展示名，未找到回退原值 */
export function getToolDisplayName(name: string): string {
  return findTool(name)?.displayName ?? name;
}

/** 默认 enabled 工具（用于 init 命令） */
export function getDefaultEnabledTools(): readonly ToolDefinition[] {
  return REGISTRY.tools.filter((t) => t.defaultEnabled);
}

/** 旧 → 新 的命名映射查找表（仅供迁移函数使用） */
export function getLegacyAliases(): Readonly<Record<string, string>> {
  return REGISTRY.legacyAliases;
}

export function getLegacyUserBases(): Readonly<Record<string, string>> {
  return REGISTRY.legacyUserBases;
}

export function getLegacyProjectDirs(): Readonly<Record<string, string>> {
  return REGISTRY.legacyProjectDirs;
}
```

### 3.3 迁移管线接口

**`src/config/version.ts`**：

```typescript
/** 当前 Config schema 版本号；每次 schema 变更必须递增 */
export const CURRENT_CONFIG_VERSION = 5;

/** 当前 ProjectConfig schema 版本号 */
export const CURRENT_PROJECT_CONFIG_VERSION = 5;
```

**`src/config/migrations/reporter.ts`**：

```typescript
/** 迁移结果类型 */
export type MigrationOutcome =
  | { status: 'up_to_date' }
  | { status: 'migrated'; fromVersion: number; toVersion: number; changes: MigrationChange[] }
  | { status: 'migrated_with_conflicts'; changes: MigrationChange[]; conflicts: ResourceConflict[] }
  | { status: 'parse_failed'; error: string }
  | { status: 'write_failed'; error: string; backupPath: string };

/** 单条迁移变更（供 UI 展示） */
export interface MigrationChange {
  /** 人类可读描述，如 "Claude 工具命名：claude-code → claude-internal" */
  message: string;
  /** 影响的字段路径（用于调试日志） */
  path?: string;
}

/** 资源冲突项 */
export interface ResourceConflict {
  /** 旧位置绝对路径 */
  oldPath: string;
  /** 新位置绝对路径 */
  newPath: string;
  /** 资源类型 */
  resourceType: string;
}

/**
 * 迁移上报器：CLI 与 GUI 通过不同实现消费
 *
 * - CLI：StdoutMigrationReporter（单行 ℹ 提示 / 阻断式 ✗）
 * - GUI：通过 IPC 回传给前端，前端写入 React 状态触发 MigrationModal
 */
export interface MigrationReporter {
  report(outcome: MigrationOutcome): void;
}
```

**`src/config/migrations/index.ts`**：

```typescript
/**
 * 配置迁移调度器
 *
 * 调用顺序：
 *   parseYaml(raw) → migrate(parsed) → 若发生迁移则 saveConfig 落盘 + reporter.report
 *
 * @param parsed 直接 yaml.parse 出来的对象（任意旧版 schema）
 * @returns 迁移后的对象 + 迁移变更列表（empty 表示无迁移）
 */
export async function migrateConfig(
  parsed: unknown,
): Promise<{ config: Config; changes: MigrationChange[] }>;

/**
 * 项目配置迁移调度器
 */
export async function migrateProjectConfig(
  parsed: unknown,
): Promise<{ config: ProjectConfig; changes: MigrationChange[] }>;
```

**单步迁移函数签名**（每个迁移文件）：

```typescript
/**
 * v0.2.0 → v0.4.0 迁移：user_path 重命名为 user_base
 *
 * 输入：parsed 中可能含 targets[].user_path
 * 输出：targets[].user_base，删除 user_path
 *
 * 幂等：若已是 user_base 则直接返回，不修改
 */
export function migrateV02ToV04(
  parsed: Record<string, unknown>,
): { changed: boolean; changes: MigrationChange[] };

/**
 * v0.4.0 → v0.5.0 迁移：
 *   1. 补 user_subscriptions 默认 { skills: [] }
 *   2. claude 工具命名统一（claude-code → claude-internal，含 user_base 改写）
 *   3. 写入 version 字段
 */
export function migrateV04ToV05(
  parsed: Record<string, unknown>,
): { changed: boolean; changes: MigrationChange[] };
```

### 3.4 目录守卫接口

**`src/utils/tool-home-assert.ts`**：

```typescript
/**
 * 守卫结果
 *
 * - present：工具家目录存在，可继续 sync
 * - missing：工具家目录不存在，调用方应跳过该 target
 */
export type ToolHomeStatus = { kind: 'present' } | { kind: 'missing'; expectedPath: string };

/**
 * 断言用户级 AI 工具家目录存在
 *
 * @param target 目标工具配置
 * @returns 状态对象（不抛异常，由调用方决策）
 *
 * 实现：fs.access(expandTilde(target.user_base))；ENOENT → missing；其他错误也归为 missing
 */
export async function assertToolUserHomeExists(target: Target): Promise<ToolHomeStatus>;

/**
 * 断言项目级 AI 工具标记目录存在
 *
 * @param projectDir 项目根目录
 * @param targetName 目标工具名（拼出 .<targetName>）
 * @returns 状态对象
 */
export async function assertToolProjectHomeExists(
  projectDir: string,
  targetName: string,
): Promise<ToolHomeStatus>;
```

### 3.5 syncer.ts 修改的内部接口

```typescript
/** 同步结果增加 'skipped_missing_tool' 动作 */
export type SyncAction = 'created' | 'updated' | 'skipped' | 'skipped_missing_tool' | 'failed';

interface SkillTargetSyncResult {
  targetName: string;
  action: SyncAction;
  /** action === 'skipped_missing_tool' 时携带预期路径 */
  expectedPath?: string;
}
```

### 3.6 外部接口 / Tauri 命令

| 方法 | 命令 | 入参 | 出参 | 变更 |
|------|------|------|------|------|
| `invoke_cli` | 既有 | 命令字符串 | NDJSON 流 | **不变**（迁移事件复用既有 NDJSON `version: 2` 协议，新增 `event: 'config.migrated'` 事件类型） |
| `invoke_cli_stream` | 既有 | 同上 | 同上 | **不变** |
| `ensure_project_config` | 既有 | `cliProjectDir: string` | bool | **不变**（不读旧文件，无需迁移） |
| 新增 NDJSON 事件 | — | — | `{ version: 2, event: 'config.migrated', data: MigrationOutcome }` | 在 CLI 启动时若发生迁移 emit；GUI 监听并打开 MigrationModal |

---

## 4. 数据模型

### 4.1 Config 新结构

```typescript
/** 全局配置（v0.5.0） */
export interface Config {
  /** schema 版本号；缺失视为 v0.4 之前 */
  version: number;
  /** 资源源目录 */
  source: string;
  /** 目标工具列表 */
  targets: Target[];
  /** 同步默认行为 */
  sync: {
    default_scope: 'user' | 'project';
    clean: boolean;
  };
  /** 用户级订阅清单（v0.4 引入） */
  user_subscriptions: {
    skills: string[];
    commands?: string[];
    agents?: string[];
    rules?: string[];
  };
}
```

### 4.2 ProjectConfig 新结构

```typescript
/** 项目级配置（v0.5.0） */
export interface ProjectConfig {
  /** schema 版本号 */
  version: number;
  skills?: string[];
  commands?: string[];
  agents?: string[];
  rules?: string[];
}
```

### 4.3 yaml 序列化约定

- `version` 字段排在 yaml 文件首行（人眼最易识别）
- `saveConfig` 序列化时显式控制字段顺序：`version → source → targets → sync → user_subscriptions`
- 备份文件命名：`config.yaml.bak`（覆盖式，仅一份）/ `project.yaml.bak`

---

## 5. 影响范围分析

### 5.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|------|---------|---------|
| `src/config/manager.ts` | `loadConfig` 注入迁移管线；`getDefaultTargets` 改用 SSOT；`validateConfig` 删除 v0.2/v0.4 抛错路径（已被迁移覆盖） | **高** |
| `src/config/project.ts` | `loadProjectConfig` 注入迁移管线 | 高 |
| `src/types/index.ts` | `Config` / `ProjectConfig` 新增 `version` 字段 | 高 |
| `src/core/syncer.ts` | `syncResourceToDir` 入口插守卫；`syncTasks` / `syncAllResources` / `syncProjectResources` 累加 `skipped_missing_tool`；CLI 进度上报新 action | **高** |
| `src/commands/target.ts` | `AVAILABLE_TOOLS` 来自 SSOT；输出文案统一 | 中 |
| `src/commands/list.ts` | `TARGET_DISPLAY` 来自 SSOT；表格列名同步 | 中 |
| `src/commands/init.ts` | 默认值与文案来自 SSOT | 中 |
| `src/commands/sync.ts` | 输出新增「未检测到」行（picocolors.gray）；汇总文案补 `skipped (missing tool)` | 中 |
| `desktop/src/lib/tools.ts` | 删除 `AVAILABLE_TOOLS` / `TOOL_DISPLAY_NAME` / `TOOL_PROJECT_DIR_ALIASES` 硬编码；改为 import SSOT；`detectProjectTools` 用 `projectDirAliases` | **高** |
| `desktop/src/App.tsx` | 启动时监听 `config.migrated` NDJSON 事件，写入 state 触发 MigrationModal | 中 |
| `desktop/src/components/SyncProgressModal.tsx` | 新增 `skipped_missing_tool` 行渲染 | 中 |
| `desktop/src/components/AddToolModal.tsx` | 数据源切换为 SSOT（无视觉变化） | 低 |
| `desktop/src/components/InvalidProjectModal.tsx` | claude 文案同步（来自 SSOT） | 低 |
| `tests/commands/target.test.ts` | 14 处 fixture 替换 `claude-code` → `claude-internal` | 中 |
| `tests/core/syncer.test.ts` | 14 处 fixture 替换 + 新增守卫用例 | 中 |
| `tests/core/detectProjectTools.test.ts` | 9 处 | 中 |
| `tests/core/subscriptions.test.ts` | 5 处 | 低 |
| `tests/config/manager.test.ts` | 1 处 + 删除 v0.2/v0.4 校验测试（迁移已接管） | 中 |
| `README.md` | §工具表 / config 示例 / target 示例 / list 输出 / 升级指引 | 中 |
| `docs/rfcs/v0.4.0-subscription-model.md` | 标注「关于 migrate 命令的立场已被 v0.5.0 RFC 修订」 | 低 |
| `tsup.config.ts` | 新增 `shared/tools.json` 拷贝到 dist 的 hooks（保证 CLI 安装后仍能找到 SSOT） | 中 |
| `desktop/vite.config.ts` | 确认 `server.fs.allow` 已允许 `..`（现状已允许，无需改） | — |

### 5.2 新增文件

| 文件 | 用途 |
|------|------|
| `shared/tools.json` | SSOT 数据 |
| `shared/tools.schema.ts` | SSOT 类型定义 |
| `src/registry/tools.ts` | CLI 适配层 |
| `src/config/version.ts` | 版本号常量 |
| `src/config/migrations/index.ts` | 迁移调度器 |
| `src/config/migrations/reporter.ts` | MigrationReporter 协议 |
| `src/config/migrations/v0.2-to-v0.4.ts` | user_path → user_base |
| `src/config/migrations/v0.4-to-v0.5.ts` | 补 user_subscriptions + claude 改名 |
| `src/config/migrations/relocate-legacy-dirs.ts` | 用户/项目级旧 user_base 资源搬迁 |
| `src/utils/tool-home-assert.ts` | 目录守卫辅助函数 |
| `desktop/src/components/MigrationModal.tsx` | 迁移完成弹窗 |
| `tests/config/migrations.test.ts` | 迁移管线单测 |
| `tests/utils/tool-home-assert.test.ts` | 守卫单测 |
| `docs/rfcs/v0.5.0-naming-and-migration.md` | RFC：命名统一 + 引入迁移机制 |

### 5.3 依赖变更

无新增/升级/移除。

---

## 6. 实现步骤

> 按执行顺序拆分，每步独立可验证（runnable + green tests），便于编码阶段分批提交。

| 步骤 | 描述 | 预计工作量 |
|------|------|-----------|
| **1. SSOT 基础设施** | 新建 `shared/tools.json` + `shared/tools.schema.ts`；新建 `src/registry/tools.ts`；新建 `src/config/version.ts`；改 `tsup.config.ts` 把 SSOT JSON 拷贝到 dist | 1h |
| **2. 接入 CLI 端 SSOT** | 改 `manager.ts:getDefaultTargets`、`target.ts:AVAILABLE_TOOLS`、`list.ts:TARGET_DISPLAY`、`init.ts` 默认值 — 全部 import SSOT；保持 `claude-code` 旧 fixture 测试暂可通过（迁移管线尚未接） | 1h |
| **3. Types 层** | `src/types/index.ts` Config/ProjectConfig 加 `version`；类型层影响向上传递 | 0.5h |
| **4. 迁移管线** | 新建 `migrations/` 全部文件；实现 `migrateConfig` / `migrateProjectConfig` 调度；实现两个版本迁移函数；实现 reporter 协议 + StdoutMigrationReporter；新增 NDJSON `config.migrated` 事件类型 | 4h |
| **5. 接入 loadConfig / loadProjectConfig** | 在两个函数中插入 `read → migrate → 若变化则 saveConfig + report`；删除 validateConfig 中已被迁移覆盖的旧 schema 报错路径 | 1.5h |
| **6. 旧 user_base 资源搬迁** | `relocate-legacy-dirs.ts`：检测 `~/.claude` / `~/.claude-code` 与 `<project>/.claude-code`；按 SSOT 中 `legacyUserBases` / `legacyProjectDirs` 查表；同名内容相同直接 skip；不同则进 conflicts 列表；全部成功后才删除旧目录 | 3h |
| **7. 迁移管线单元测试** | `tests/config/migrations.test.ts`：覆盖 v0.2→v0.4、v0.4→v0.5、claude 改名、空 yaml、损坏 yaml、幂等、写失败回滚 | 2h |
| **8. 目录守卫工具函数** | 新建 `src/utils/tool-home-assert.ts` + 单测 | 0.5h |
| **9. 接入 syncer.ts** | `syncResourceToDir` 入口断言；`syncTasks` / `syncAllResources` / `syncProjectResources` 处理新 action；交互式 checkbox 分支阻断 | 2h |
| **10. CLI 输出层** | `sync.ts` 命令输出"未检测到"灰色行；汇总文案补 skipped_missing_tool；start-up 行 ℹ 提示来自 reporter | 1h |
| **11. 测试夹具批量更新** | 5 个测试文件 44 处 `claude-code` → `claude-internal`；syncer 新增守卫用例（已装/未装两态）| 1.5h |
| **12. desktop SSOT 接入** | 改 `desktop/src/lib/tools.ts` 全部 import SSOT；删除 `TOOL_PROJECT_DIR_ALIASES`；`detectProjectTools` 改用 `projectDirAliases` | 1h |
| **13. MigrationModal 组件** | 新建组件 + localStorage 标记；接入 App.tsx 监听 `config.migrated` 事件；样式遵循 design system tokens | 2.5h |
| **14. SyncProgressModal 守卫行** | 新增 `skipped_missing_tool` 行视觉（⊘ + 灰）+ tooltip | 1h |
| **15. 删除 desktop 双名兼容** | 移除 `TOOL_PROJECT_DIR_ALIASES`、`TOOL_DISPLAY_NAME` 中 `claude-code` 兼容项（迁移管线已落盘改名）| 0.5h |
| **16. 文档同步** | README.md 各节；新增 RFC `v0.5.0-naming-and-migration.md`；标注 v0.4 RFC 立场修订 | 2h |
| **17. 端到端验证** | 三组 fixture 配置（v0.2 / v0.4 / claude-code 旧名）依次启动，验收清单逐项过 | 1.5h |
| **合计** | | **~26h** |

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| `loadConfig` 引入写盘副作用导致测试夹具被改写 | 中 | 中 | 测试夹具改造时显式注入 `migrationReporter: NoopReporter` 或 mock saveConfig；新增 `loadConfig({ skipMigration: true })` 仅供测试使用 |
| 迁移函数 bug 导致用户配置损坏 | 低 | **高** | (a) 迁移前强制备份；(b) 迁移函数全部纯函数 + 完整单测；(c) 多版本迁移按顺序串联，每步幂等；(d) 写盘失败立即抛错并指向 `.bak` |
| SSOT JSON 在 CLI 全局安装后路径丢失 | 中 | 高 | tsup 配置显式声明 JSON 拷贝；`registry/tools.ts` 模块加载时尝试 `process.env.AITOOLS_DIST_DIR` 兜底；写一个启动自检测试 |
| 旧资源目录搬迁与同步过程并发冲突 | 低 | 中 | 搬迁逻辑在 `loadConfig` 完成迁移后**串行**执行，且加文件锁 `~/.aitools/.migration.lock`（写文件存在即拒绝二次进入）|
| 用户在 GUI 启动时未连网导致 Tauri NDJSON 事件丢失 | 低 | 低 | MigrationModal 触发条件不依赖事件流，而是 GUI 启动时**主动调** `aitools config inspect-migration` CLI 子命令读取 `~/.aitools/.last-migration.json`（迁移函数额外落盘一份机器可读结果） |
| desktop 通过相对路径 import SSOT 时 vite alias 出错 | 中 | 中 | 用 `@shared/*` alias，`vite.config.ts` 与 `tsconfig.json` 同步声明；步骤 12 第一件事就是验证 import 通过 |
| 迁移触发的 CLI 单行提示打乱 NDJSON 流 | 低 | 中 | 迁移提示走 `process.stderr` 不污染 stdout；NDJSON 流强制走 stdout |

---

## 8. 回滚方案

### 8.1 用户侧回滚（运行时）

**触发场景**：用户升级后发现迁移引发问题。

**回滚步骤**：
1. 退出新版 aitools 所有进程
2. `cp ~/.aitools/config.yaml.bak ~/.aitools/config.yaml`
3. 项目级同理：`cp <project>/.aitools/project.yaml.bak <project>/.aitools/project.yaml`
4. 安装上一版 aitools：`npm i -g aitools-cli@0.4.x`
5. **资源目录回滚**：搬迁逻辑只在"全部资源都成功承接"后才删除旧目录，否则旧目录原样保留；用户可以从旧目录恢复

### 8.2 开发侧回滚（CI/发布层）

- 每个步骤独立 commit，使用 `feat(migration): step N - <description>` 标注
- 整体打成 `v0.5.0-rc.1` 预发布；若发现严重问题：
  - 先发 `v0.5.0-rc.2` 修复
  - 紧急下架可在 npm 用 `npm deprecate` + 引导用户回 `v0.4.x`
- desktop 端 Tauri 应用通过升级渠道推送修复

### 8.3 不可回滚的部分（已记录）

- 已下线的 `TOOL_PROJECT_DIR_ALIASES`：若发现存量 `claude-code` 名仍在使用，可临时在 `legacyAliases` 表加回，**不需要恢复源码**
- 测试夹具命名改回的成本极低（可一次脚本回滚）

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| **TD-1** | SSOT 用 JSON 文件而非 TS 模块 | TS 模块（方案 A/B/D） | desktop 与 CLI 是独立 npm 包、不同 tsconfig 与 moduleResolution；JSON 完全规避跨包 import 难题；未来 Rust 端也能 `include_str!` 同一份文件（Q-7 决策落地） |
| **TD-2** | SSOT 物理位置：仓库根 `shared/` | `src/registry/`（A）/ `desktop/shared/`（C 变体） | desktop/vite 已允许 `server.fs.allow: ['..']`，跨边界 import 可行；放仓库根更显示其"公共契约"语义 |
| **TD-3** | 迁移触发点嵌入 `loadConfig` / `loadProjectConfig`，无独立 `migrate` 命令 | 提供 `aitools migrate` 子命令 | 已在 02-design.md D-6 决策；摸底确认所有读取路径都过这两个函数 |
| **TD-4** | 迁移结果通过 reporter 协议解耦 | 直接 console.log | CLI/GUI 双消费方需要不同表达；解耦后 GUI 通过 NDJSON 事件接收；测试场景可注入 NoopReporter |
| **TD-5** | NDJSON 事件协议复用既有 `version: 2`，新增 `event: 'config.migrated'` 类型而非新协议版本 | bump 到 `version: 3` | 协议字段未变只新增 event 类型，向后兼容；旧版 GUI 见到 `config.migrated` 会忽略（已有 default 分支）|
| **TD-6** | `loadConfig` 默认行为产生写盘副作用（首次迁移时） | 只读 + 暴露独立 `migrateAndSave` 函数让调用方主动触发 | 透明化迁移是核心目标；写盘副作用通过 reporter 显式可见，且备份保护；测试夹具加 `skipMigration` 选项 |
| **TD-7** | `version` 字段排在 yaml 首行 | 末行 / 字母序 | 用户肉眼第一眼就能看到 schema 版本，便于自查 |
| **TD-8** | 旧资源目录搬迁仅在"旧目录已存在"时才主动 mkdir 新目录 | 主动 mkdir 新 user_base | US-6 边界守卫：aitools 不主动创建 AI 工具家目录；仅当承接已有资源时是合理例外 |
| **TD-9** | 资源冲突时阻断同步而非自动备份后覆盖 | 自动备份 .conflict 后覆盖 | 02-design.md D-4：用户磁盘内容不能被 aitools 单方决策；强制阻断让用户显式处理 |
| **TD-10** | `relocate-legacy-dirs` 删除旧目录的前提：所有资源都成功承接 | 始终删除 | 失败时保留旧目录可让用户保留回滚通道 |
| **TD-11** | NDJSON `config.migrated` 事件 + `~/.aitools/.last-migration.json` 双通道传给 GUI | 仅事件 | 事件可能因 GUI 进程启动时序丢失；落盘一份 JSON 让 GUI 启动时主动读取，更可靠 |
| **TD-12** | 不写迁移日志到独立 `~/.aitools/migration.log` 文件 | 写日志文件 | 与 Q-5「.bak 只保留最近一次」一致风格；reporter 已上报到 stderr 与 NDJSON；落盘 `.last-migration.json` 已足够 |
| **TD-13** | desktop `lib.rs:ensure_project_config` 不改 | 同步加迁移逻辑 | 该函数仅在文件不存在时写最小骨架，不读旧文件，无迁移空间；保持现状 |

---

## 10. 验收映射

| 需求 AC | 对应实现步骤 | 测试位置 |
|---|---|---|
| US-1 命名统一一致性 | 步骤 1, 2, 12, 15 | `tests/registry/tools.test.ts` (新增) |
| US-2 v0.2 / v0.4 自动迁移 | 步骤 3, 4, 5 | `tests/config/migrations.test.ts` |
| US-3 旧资源目录合并 | 步骤 6 | `tests/config/migrations.test.ts` 中 relocate 子套件 |
| US-4 SSOT 单一真相源 | 步骤 1, 2, 12 | grep 验证 + 编译期类型 |
| US-5 迁移健壮性 | 步骤 4, 5, 7 | `tests/config/migrations.test.ts` 异常路径用例 |
| US-6 目录创建边界守卫 | 步骤 8, 9 | `tests/utils/tool-home-assert.test.ts` + `tests/core/syncer.test.ts` 守卫用例 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建（架构图 + 接口签名 + 17 步实现路线 + 13 项技术决策 + 7 项风险） | AI |

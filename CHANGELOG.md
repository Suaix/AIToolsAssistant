# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html).

## [Unreleased]

### Fixed (FIX-001)

- **测试隔离**：`tests/config/migrations.test.ts` 补 `vi.spyOn(os, 'homedir')`，与 `manager.test.ts` / `subscribe.test.ts` 等已有惯用法对齐；跑完 `pnpm test` 不再污染 `~/.aitools/.last-migration.json`。生产代码零改动。
- **GUI 陈旧弹窗清理**：desktop 启动时校验 `.last-migration.json` 中 `backupPath` 是否存在，不存在则静默清理 `.last-migration.json` 不弹窗，避免向用户展示指向不存在备份的误导信息。
- **dead code**：删除 `commands/config.ts` 未使用的 `getConfigDir` import（REFACTOR-001 遗留 L-1）。

### Added (FIX-001)

- Tauri command `file_exists_absolute(path)`：轻量只读 stat，仅供 GUI 启动校验使用，无副作用、无信息泄露面。

---

## [0.5.0] - 2026-05-09

> **结构性重构** · 仓库改为 pnpm workspace 三段式 + `@aitools` scope 统一命名（REFACTOR-001 PR-1 + PR-2）

### PR-1：物理搬迁 + workspace 骨架

#### 包命名变更

- `aitools-cli` → **`@aitools/cli`**（npm 包名；命令名 `aitools` 不变）
- `aiflux-desktop` → **`@aitools/desktop`**（private）
- 仓库根 shared 目录升格为 workspace 包 **`@aitools/shared`**（private）
- 仓库根 package 改名为 `aitools-workspace`（伞包，private）

#### 仓库结构

```
packages/
├── cli/        → @aitools/cli
├── desktop/    → @aitools/desktop
└── shared/     → @aitools/shared（内含 tools.json SSOT + tools.schema.ts）
```

### PR-2：契约重写（workspace 引用收敛）

#### 引用机制统一

所有跨包引用从"相对路径 + Vite alias"**统一**为 `@aitools/shared` workspace 包：

- CLI 侧删除 `resolveRegistryPath()` + `fs.readFileSync` + 多候选路径探测
- desktop 侧删除 `@shared/*` Vite alias 与 `tsconfig paths`
- 统一 import 形式：`import { TOOLS } from '@aitools/shared'`

#### 产物体积

- CLI npm 包从含独立 `shared/` 目录，**收敛为 `dist/` + 元信息 5 个文件**
- `dist/index.js` 50.72 KB（shared 内容已 tsup 编译期 inline）

#### tsup 配置

- 新增 `noExternal: ['@aitools/shared']` 强制 bundle workspace 包
  （否则 Node 原生会尝试 external resolve 到 `.ts` 源码导致 `ERR_UNKNOWN_FILE_EXTENSION`）

### 新增开发约束

- **必须使用 pnpm**（workspace protocol 要求）——根 `package.json.preinstall` 强制
- 最低要求：Node.js ≥ 20.0.0、pnpm ≥ 9.0.0

### 用户影响

- **CLI 用户**：无可感知变化，命令行 `aitools` 行为完全一致
- **GUI 用户**：无可感知变化，所有功能 1:1 保持
- **源码开发者**：`pnpm install` 一次装齐所有包，新路径见 [`CODEBUDDY.md`](./CODEBUDDY.md)

### 未变更

- 业务逻辑（命令、同步、迁移）0 改动
- 测试：186 用例全绿
- SSOT 数据结构（`tools.json`）内容与 schema 不变

---

## [0.4.2] - 2026-04-28

> **非破坏** · CLI 补 target enable/disable 命令（RFC-001 的 patch）

### 新增命令 — `aitools target`

填补 RFC-001 留下的空缺：在 v0.4.2 之前，`targets[].enabled` 字段只能手改
`~/.aitools/config.yaml`。本次新增命令族允许通过 CLI（以及 GUI 通过 `invoke_cli`）
管理 target 启用状态。

- **`aitools target enable <name>`** — 启用指定 target，使其参与后续 sync
- **`aitools target disable <name>`** — 禁用指定 target，使其退出 sync；**不**清理已同步目录

两命令均为**幂等**：对已是目标态的 target 重复调用不报错、不重写配置。

### 新增 JSON 事件

在现有 `JsonEvent` 联合类型上**增量**加入两个事件（不破坏旧消费者）：

- `target.enabled` — `target enable` 成功时发射
- `target.disabled` — `target disable` 成功时发射

两者的 `data` 均为 `{ name: string; changed: boolean }`。`changed` 字段区分
"真正翻转并落盘"（`true`）与"幂等跳过"（`false`）。

未知 target 错误路径复用 `error` 事件，新增错误码 `code: "TARGET_NOT_FOUND"`。

### 兼容性

- 不改现有命令、不改配置文件 schema，配置无需迁移
- 回滚成本极低：删除 `src/commands/target.ts` 与 `src/index.ts` 内的命令族注册即可

### 相关文档

- RFC：[`docs/rfcs/v0.4.2-target-enable-disable.md`](docs/rfcs/v0.4.2-target-enable-disable.md)
- 被依赖：RFC-002 GUI 订阅视图 · 阶段 3 Tools 页启用开关

---

## [0.4.0] - 2026-04-28

> **破坏性变更** · 订阅模型重构

### 核心重构

本次发布重构了 CLI 的核心心智模型，从"配置驱动"转向**"订阅驱动"**。

#### 旧模型 vs 新模型

| 维度 | 旧模型（≤ 0.3.0） | 新模型（0.4.0） |
|---|---|---|
| 同步触发 | 配置里列出目标 | 订阅清单驱动 |
| 作用域 | 固定 user/project 两级子目录 | 订阅时指定作用域（user/project） |
| 目标计算 | 配置合并后统一计算 | 每个订阅独立计算自己的目标路径 |
| 资源发现 | 扫描所有资源目录 | 订阅清单中出现的才参与同步 |
| 取消同步 | 需手动改配置文件 | `unsubscribe` 命令移除订阅 |

### 新增命令

- **`subscribe <type> <name>`** — 订阅一个资源到用户级或项目级，支持 `--scope user|project`
- **`unsubscribe <type> <name>`** — 取消订阅，资源不再参与同步
- **`sync [type] [name]`** — 支持 `name` 参数精确同步单个资源

### 改造命令

- **`init`** — 骨架扁平化为 `<type>/skills`、`type>/commands`、`type>/agents`、`type>/rules` 四个叶子目录；新增首次订阅引导
- **`list`** — 输出分为"未订阅候选"、"用户级订阅"、"项目级订阅"三段
- **`sync`** — 从配置驱动改为订阅驱动，输出增加 `skipped` 事件

### 架构变更

- 新增 `src/core/subscriptions.ts`（订阅抽象层）与 `src/core/status.ts`（同步状态计算）
- 废弃 `src/config/project.ts` 中的 `ResourceScope` 枚举（改为 `SubscriptionScope`）
- 配置文件结构变化：`config.yaml` 中 `targets[].user_skills[]` → `user_subscriptions.skills[]`
- `sync` 不再依赖 `config.yaml` 的 `targets[].user_*` 字段，改为读取订阅清单

### GUI 适配

- NDJSON 事件协议升级：`skip` 事件 → `skipped`（数组形式）
- 新增 `SubscriptionEvent` 事件类型（`subscribed` / `unsubscribed`）
- `ResourceListItem` 新增 `scope` 字段

### 迁移路径

```bash
# 1. 重新 init（骨架扁平化）
aitools init

# 2. 重新订阅之前在用的资源
aitools subscribe skills <your-skill-name> --scope user   # 或 --scope project
aitools subscribe commands <your-command-name>

# 3. 验证
aitools list skills
```

### 测试

- 全量单元测试 154 个，全部通过
- 冒烟测试 12 个场景，全部通过（user 订阅、project 订阅、幂等、增量更新、取消订阅等）

---

## [0.3.0] - 2026-04-27

### 新增

- **`--json` 输出模式**：所有命令支持 NDJSON 格式输出，供 GUI 消费者使用
- `src/utils/reporter.ts`：human/json 双模式 Reporter 输出层抽象
- `src/commands/sync.ts`：NDJSON 流式事件 `start / progress / summary / done / error`
- `src/commands/list.ts`：输出结构化 `ResourceListItem`，包含 `sourceHash` / `targets` 等 GUI 消费字段
- `src/types/index.ts`：`JsonEvent` / `SyncProgressData` / `ListEventData` 等 GUI 契约类型
- 14 个新增单测（reporter）

### 桌面 App 对接

- `desktop/` 新增整个 Tauri 2 + React 18 + TypeScript + Vite workspace
- Dashboard 5 态 HeroCard（loading / cli_missing / error / all_synced / has_unsynced）
- Skills 4 态九宫格（loading / error / empty / ready），user/project 分段展示

### 修复

- macOS 窗口红绿灯遮挡：`titleBarStyle=Overlay` + 28px 安全距离
- macOS 窗口拖拽：`core:window:allow-start-dragging` 权限
- `.DS_Store` 等系统元数据文件导致 hash 误判

---

## [0.2.0] - 2026-04-27

### 新增

- **多资源类型架构**：`skills` / `commands` / `agents` / `rules` 四类资源统一抽象
- 骨架目录从 `~/.aitools/` 改为 `~/.aitools/skills/` / `~/.aitools/commands/` 等扁平结构
- `src/core/scanner.ts`：多类型资源扫描
- `src/core/syncer.ts`：多类型同步引擎

### 改造

- **`init`**：交互式选择要同步的资源类型、用户级/项目级子目录
- **`sync`**：支持 `--type` 指定资源类型

---

## [0.1.0] - 2026-04-27

### 新增

- 项目初始化（`init`）
- 资源同步（`sync`）
- 资源列表（`list`）
- 单用户级同步能力
- 完整设计系统 v1.0（7 层）
- 桌面 App 骨架（Tauri + React）

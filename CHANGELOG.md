# CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/lang/zh-CN/spec/v2.0.0.html).

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

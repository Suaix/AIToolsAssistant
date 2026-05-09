# aitools-cli

> AI Agent 统一配置与资源同步管理工具（skills / commands / agents / rules）

## 简介

`aitools-cli` 是一个命令行工具，帮你把散落在各处的 AI Agent 资源（Skills / Commands / Agents / Rules）集中在一个源目录里维护，并通过**订阅模型**把它们同步到不同 AI 编程助手的用户级或项目级目录。

核心主张：**你写一次，它到处都在。**

目前支持的 AI 工具：

| 工具 | 用户级基础目录 | 项目级基础目录 |
|---|---|---|
| **CodeBuddy** | `~/.codebuddy/` | `<project>/.codebuddy/` |
| **WorkBuddy** | `~/.workbuddy/` | `<project>/.workbuddy/` |
| **Claude Internal** | `~/.claude-internal/` | `<project>/.claude-internal/` |

> v0.5.0 起，Claude 工具规范名统一为 `claude-internal`（避开 Claude Code 官方 CLI 占用的 `~/.claude/`）。
> 旧名 `claude-code` 与旧路径 `~/.claude/` 在升级时会被自动迁移，详见下文「v0.5.0 破坏性变更」。

实际同步路径 = 基础目录 + 资源类型子目录，例如：
- 用户级 skills → `~/.codebuddy/skills/<name>/`
- 项目级 skills → `<project>/.codebuddy/skills/<name>/`

### 核心特性

- 🎯 **扁平源目录** — 所有资源平铺在 `<source>/<type>/<name>/`，身份不再绑定路径
- 🔔 **订阅模型** — 一个资源可同时订阅到用户级 + 任意项目级，同一份源、多处落地
- 🔄 **智能同步** — 基于 SHA-256 hash 对比，仅同步有变更的文件夹
- 📦 **全量拷贝** — 每个资源文件夹完整同步（含模板、示例、脚本）
- 🎨 **交互式配置** — 源目录可选、骨架自动生成、同步工具非必填
- 📡 **JSON 流式事件** — `--json` 模式产出 NDJSON，方便 GUI / CI 集成

## v0.5.0 变更（FEAT-005）

> 与 v0.4.x 完全兼容；存量配置启动时**自动迁移**，无需手动操作。

1. **Claude 工具命名统一**：旧名 `claude-code` / 旧 user_base `~/.claude/` → 新名 `claude-internal` / 新 user_base `~/.claude-internal/`（避开 Claude Code 官方 CLI 占用的 `~/.claude/`）
2. **配置 schema 引入版本字段**：`~/.aitools/config.yaml` 与 `<project>/.aitools/project.yaml` 顶层新增 `version: 6` 字段
3. **自动迁移机制**：首次执行任意 CLI 命令时，旧版配置（v0.2 含 `user_path` / v0.4 缺 `user_subscriptions`）会被自动升级，原文件备份为 `<file>.bak`
4. **目录创建边界守卫**（US-6）：sync 时若 AI 工具家目录不存在（如 `~/.codebuddy/`、`~/.claude-internal/`），不再主动 mkdir，而是明确跳过并提示「未检测到该工具」。aitools 只管理资源，工具的安装是用户/工具自身的职责
5. **AI 工具元数据 SSOT**：仓库根 `shared/tools.json` 作为单一真相源，CLI 与 GUI 共享

### 自动迁移说明

升级到 v0.5.0 后首次运行任意 `aitools` 命令时：

```
ℹ 检测到旧版配置，已自动升级 (v1 → v6)
ℹ   原配置已备份至：~/.aitools/config.yaml.bak
ℹ   · Target "claude-code" 命名统一：claude-code → claude-internal
ℹ   · Target user_base 统一：~/.claude → ~/.claude-internal
```

GUI 用户首次启动会弹出「配置已自动升级」提示窗，详细列出变更项。

如果旧的 `~/.claude/` 或 `~/.claude-code/` 目录里已经有同步的资源，CLI 会把它们合并到新的 `~/.claude-internal/`：
- 同名内容相同 → 直接跳过
- 同名内容不同 → 报错列出冲突清单，**不静默覆盖**

## v0.4.0 破坏性变更（Breaking Changes）

相对 v0.3.x 的升级需要**清理旧配置并重建**（不提供迁移工具）：

> 注：v0.5.0 起，从 v0.2/v0.3/v0.4.x 升级到 v0.5+ 已支持自动迁移；本节保留作为历史记录。

1. **源目录扁平化**：`<source>/skills/{user,project}/<name>/` → `<source>/skills/<name>/`
2. **订阅模型**：引入 `user_subscriptions` 配置字段；资源不再有 `user/project` 属性
3. **新增命令**：`aitools subscribe` / `aitools unsubscribe`
4. **sync 语义变更**：从「扫描源目录所有资源」改为「读订阅清单、按订阅同步」；未订阅的资源不会同步
5. **移除参数**：`aitools sync --skill` 已移除（commander 会直接报未知参数）
6. **JSON 事件升级**：所有事件新增 `version: 2` 字段；sync 事件的 `scope` 字段替换为 `location: { scope, projectDir? }`

### 升级指引

> v0.5.0 起从 v0.4.x 升级**无需手动操作**——启动时自动迁移，无需删除 `~/.aitools`。
> 下方步骤仅在你从 v0.3.x 或更早版本升级时需要：

```bash
# 备份（可选）
mv ~/.aitools ~/.aitools.bak

# 重新初始化
rm -rf ~/.aitools
aitools init

# 将旧 skill 文件夹从 ~/.aitools.bak/skills/{user,project}/ 手工移到
# ~/.aitools/skills/ 下（扁平存放）
# 然后用 subscribe 命令重新声明订阅关系
aitools subscribe skills <name>
```

## 环境要求

- **Node.js** >= 20.0.0
- **pnpm**（推荐）或 npm

## 安装与构建

### 一键安装（推荐）

```bash
git clone <repo-url>
cd AIToolsAssistant
./setup.sh
```

脚本会自动完成：环境检查 → 安装依赖 → 编译构建 → 全局链接。完成后可在**任何目录**执行 `aitools` 命令。

### 一键卸载

```bash
./uninstall.sh
```

### 手动安装

```bash
pnpm install
pnpm run build
pnpm link --global
```

如果未全局链接，可使用 `pnpm run start` 或 `node ./dist/index.js` 代替。

## 使用指南

### 心智模型

aitools 把世界切成**三个正交维度**：

```
【资源】 一个 skill/command/agent/rule 文件夹   (只有一份源)
【目标】 AI 工具的配置目录                       (CodeBuddy / Claude Internal)
【订阅】 声明「某资源要同步到某落点」             (user / project)
```

**一条「资源 × 订阅」= 一条同步规则**。sync 命令所做的，就是遍历所有订阅、按 hash 比对决定是否拷贝。

### 1. 初始化 — `aitools init`

```bash
aitools init
```

交互流程（v0.4.0）：

1. **指定源目录**（可选）— 留空使用默认 `~/.aitools/`
2. **自动创建扁平骨架**：
   ```
   <source>/
   ├── skills/
   ├── commands/
   ├── agents/
   └── rules/
   ```
3. **选择同步目标工具**（非必填，默认 `codebuddy`）
4. **生成配置** — 写入 `~/.aitools/config.yaml`
5. **首次订阅引导** — 如源目录已有 skill，提示用户通过 `subscribe` 显式订阅

初始化后的配置文件示例：

```yaml
version: 6
source: ~/.aitools
targets:
  - name: codebuddy
    enabled: true
    user_base: ~/.codebuddy
  - name: claude-internal
    enabled: false
    user_base: ~/.claude-internal
sync:
  default_scope: user
  clean: false
user_subscriptions:
  skills: []              # 用户级订阅清单（空，待 subscribe 后填充）
```

### 2. 准备资源文件

资源平铺放在源目录的对应类型子目录下：

```
~/.aitools/                    # 或你指定的源目录
├── config.yaml
└── skills/
    ├── code-review/
    │   ├── SKILL.md           # 主文件（必需）
    │   ├── template.md
    │   └── examples/
    ├── git-workflow/
    │   └── SKILL.md
    └── frontend-design/
        └── SKILL.md
```

`SKILL.md` 支持 YAML frontmatter 定义元数据：

```markdown
---
name: 代码审查助手
description: 提供全面的代码审查指导和最佳实践
---

# 代码审查助手

（Skill 指令内容...）
```

没有 frontmatter 也可以，名称取文件夹名，描述显示为 `-`。

> **Commands / Agents / Rules** 的骨架目录已创建，但当前版本尚未实现同步逻辑。

### 3. 订阅 — `aitools subscribe`

把一个资源订阅到某个落点。订阅关系是同步的前提：**未订阅的资源永远不会被 `sync` 同步**。

```bash
# 订阅到用户级（默认 scope=user）
aitools subscribe skills code-review

# 订阅后立刻同步一次
aitools subscribe skills code-review --sync

# 订阅到当前项目（需在项目目录下执行）
cd ~/workspace/my-app
aitools subscribe skills frontend-design --scope project

# 如果 .aitools/project.yaml 不存在，会交互询问是否创建
```

参数：

| 参数 | 说明 |
|---|---|
| `<type>` | 资源类型（必填）：`skills` / `commands` / `agents` / `rules` |
| `<name>` | 资源 dirName（必填，源目录中的文件夹名） |
| `--scope <scope>` | 订阅落点：`user`（默认）/ `project` |
| `--sync` | 订阅后立即同步该资源 |

### 4. 取消订阅 — `aitools unsubscribe`

```bash
# 仅从订阅清单移除（目标目录中的资源保留）
aitools unsubscribe skills code-review

# 移除订阅 + 清理目标侧已同步的资源文件夹
aitools unsubscribe skills code-review --prune

# 取消项目级订阅
aitools unsubscribe skills frontend-design --scope project --prune
```

参数：

| 参数 | 说明 |
|---|---|
| `<type>` / `<name>` | 同 subscribe |
| `--scope <scope>` | 落点：`user`（默认）/ `project` |
| `--prune` | 清理目标侧已同步的目录（不做二次确认） |

### 5. 管理目标工具 — `aitools target`（v0.4.2 新增）

启用或禁用某个同步目标（target）。禁用后的 target 不再参与 `sync`，
但**不会**清理已同步的目录；重新启用后由下一次 `sync` 按 hash 自动对齐。

```bash
# 启用一个 target（使其参与 sync）
aitools target enable codebuddy

# 禁用一个 target（退出 sync；已同步目录保留）
aitools target disable claude-internal

# GUI / 脚本消费（NDJSON）
aitools --json target enable codebuddy
# → {"event":"target.enabled","data":{"name":"codebuddy","changed":true}}
# → {"event":"done","data":{"exitCode":0}}
```

参数：

| 参数 | 说明 |
|---|---|
| `<name>` | target 名称（对应 `config.yaml` 中 `targets[].name`，如 `codebuddy`、`claude-internal`） |

语义要点：

- **幂等**：对已是目标态的 target 重复调用不报错、不重写配置，JSON 事件 `changed` 字段为 `false`
- **不清扫**：`disable` 不会删除 `<user_base>/<type>/` 下的已同步文件。若需清理，请逐资源 `unsubscribe --prune`
- **未知 target**：报错退出（exitCode=1），JSON 模式下 `error.code = "TARGET_NOT_FOUND"`

### 6. 同步 — `aitools sync`

按订阅清单遍历、对每条订阅做 hash 对比，决定新建 / 更新 / 跳过。

```bash
# 同步所有类型所有订阅
aitools sync

# 仅同步 skills
aitools sync skills

# 只同步指定资源的所有订阅（取代 v0.3 的 --skill）
aitools sync skills code-review

# 仅用户级订阅
aitools sync skills --scope user

# 仅当前项目订阅
aitools sync skills --scope project

# 指定 target（只同步到某个 AI 工具）
aitools sync skills --target codebuddy
```

参数：

| 参数 | 说明 |
|---|---|
| `[type]` | 资源类型位置参数；省略 = 全类型（`all`） |
| `[name]` | 资源 dirName（仅同步该资源的所有订阅） |
| `--type <type>` | 与位置参数等价的简写 |
| `-t, --target <name>` | 仅同步到指定 AI 工具 |
| `--scope <scope>` | `user`（仅用户级）/ `project`（仅当前项目） |

### 7. 查看列表 — `aitools list`

```bash
aitools list              # 所有已实现类型
aitools list skills       # 仅 skills
aitools list --type skills
```

输出分三段（根据实际情况显示）：

```
📄 [skills] 未订阅候选（源目录中存在但未被订阅的资源）

   · experimental-helper
   · wip-draft

📋 [skills] 用户级订阅

┌───────────────┬──────────┬─────────────────┐
│ 名称          │ CodeBuddy│ Claude Internal │
├───────────────┼──────────┼─────────────────┤
│ code-review   │ ✅ 已同步│ ✅ 已同步       │
│ git-workflow  │ ⚠️ 需更新│ ✅ 已同步       │
└───────────────┴──────────┴─────────────────┘

📁 [skills] 项目级订阅 (项目: /path/to/my-app)

┌─────────────────┬──────────┐
│ 名称            │ CodeBuddy│
├─────────────────┼──────────┤
│ frontend-design │ ❌ 未同步│
└─────────────────┴──────────┘

💡 运行 aitools sync 同步最新变更
```

状态说明：

| 状态 | 含义 |
|---|---|
| ✅ 已同步 | 源与目标内容一致 |
| ⚠️ 需更新 | 源与目标内容不同 |
| ❌ 未同步 | 目标中不存在该资源 |

### 8. JSON 模式（GUI / CI 集成）

所有命令支持 `--json` 全局选项，以 **NDJSON** 流式输出：

```bash
aitools list skills --json
aitools sync --json
```

事件协议（v0.4.0 起带 `version: 2`）：

```json
{"event":"list","data":{"version":2,"type":"skills","resources":[...],"enabledTargets":["codebuddy"],"projectDir":"/path/to/cwd"}}
{"event":"start","data":{"version":2,"type":"skills","location":{"scope":"user"},"total":3,"targets":["codebuddy"]}}
{"event":"progress","data":{"version":2,"resource":"code-review","target":"codebuddy","location":{"scope":"user"},"action":"updated","index":1,"total":3}}
{"event":"summary","data":{"version":2,"type":"skills","location":{"scope":"user"},"totalSkills":3,"created":0,"updated":1,"skipped":2}}
{"event":"done","data":{"exitCode":0}}
```

详见 [`src/types/index.ts`](./src/types/index.ts) 中的 `JsonEvent` 类型。

## 目录结构与路径推导

### 用户级同步

```
源:   <source>/skills/<name>/
目标: <user_base>/skills/<name>/        (如 ~/.codebuddy/skills/<name>/)
```

### 项目级同步

```
源:   <source>/skills/<name>/
目标: <projectDir>/.<targetName>/skills/<name>/   (如 <proj>/.codebuddy/skills/<name>/)
```

## 开发命令

```bash
pnpm run dev     # 开发模式（监听文件变化自动编译）
pnpm run build   # 构建
pnpm run start   # 运行
pnpm run lint    # 代码校验
pnpm run format  # 代码格式化
pnpm run test    # 运行测试（Vitest）
```

## 项目结构

```
src/
├── index.ts                          # CLI 入口
├── commands/
│   ├── init.ts                       # 交互式初始化 + 扁平骨架生成
│   ├── subscribe.ts                  # 订阅（v0.4 新增）
│   ├── unsubscribe.ts                # 取消订阅（v0.4 新增）
│   ├── sync.ts                       # 订阅驱动的同步
│   └── list.ts                       # 基于 ResourceView 的列表展示
├── core/
│   ├── scanner.ts                    # 资源扫描入口
│   ├── syncer.ts                     # 同步引擎（含 syncTasks 任务驱动）
│   ├── subscriptions.ts              # 订阅展开（v0.4 新增）
│   ├── status.ts                     # ResourceView 合成（v0.4 新增）
│   ├── hasher.ts                     # SHA-256 hash 计算
│   └── resources/
│       ├── registry.ts               # 资源处理器注册中心
│       ├── skills.ts                 # SkillsHandler（完整实现）
│       ├── commands.ts               # 占位
│       ├── agents.ts                 # 占位
│       └── rules.ts                  # 占位
├── config/
│   ├── manager.ts                    # ~/.aitools/config.yaml 读写 + 订阅辅助
│   └── project.ts                    # 项目 .aitools/project.yaml 读写
├── types/
│   └── index.ts                      # 类型定义（含订阅模型）
└── utils/
    ├── logger.ts                     # 终端日志工具
    ├── reporter.ts                   # 双模式输出（human / json）
    └── scaffold.ts                   # 源目录扁平骨架

tests/
├── commands/      (subscribe / unsubscribe / list)
├── config/        (manager / project)
├── core/          (syncer / subscriptions / status / hasher / scanner / resources)
└── utils/         (scaffold)

docs/
├── design-system/                   # 完整设计系统（7 层）
└── rfcs/
    └── v0.4.0-subscription-model.md  # 本次重构 RFC
```

## 设计文档

- [`docs/rfcs/v0.4.0-subscription-model.md`](./docs/rfcs/v0.4.0-subscription-model.md) — 订阅模型 RFC（设计依据）
- [`docs/design-system/README.md`](./docs/design-system/README.md) — 桌面 GUI 设计系统

## 技术栈

- **TypeScript** + **ES Modules**
- **Commander** — CLI 框架
- **@inquirer/prompts** — 交互式终端提示
- **yaml** — YAML 配置文件读写
- **picocolors** — 终端彩色输出
- **tsup** — 零配置 TypeScript 打包
- **Vitest** — 单元测试（154 用例）

## License

MIT

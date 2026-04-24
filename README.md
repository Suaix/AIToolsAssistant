# aitools-cli

> AI Agent 统一配置与资源同步管理工具（skills / commands / agents / rules）

## 简介

`aitools-cli` 是一个命令行工具，用于将你的 AI Agent 资源（Skills / Commands / Agents / Rules）集中管理，并一键同步到不同 AI 编程助手的**用户级**和**项目级**目录中。

目前支持的 AI 工具：

| 工具 | 用户级基础目录 | 项目级基础目录 |
|---|---|---|
| **CodeBuddy** | `~/.codebuddy/` | `<project>/.codebuddy/` |
| **Claude Code** | `~/.claude/` | `<project>/.claude-code/` |

实际同步路径 = 基础目录 + 资源类型子目录，例如：
- 用户级 skills → `~/.codebuddy/skills/<name>/`
- 项目级 skills → `<project>/.codebuddy/skills/<name>/`

### 核心特性

- 🎯 **多资源类型架构** — 统一管理 skills、commands、agents、rules 四种资源（当前 skills 完整实现，其他类型预留占位）
- 🔀 **用户级 / 项目级隔离** — 源目录天然分层，避免用户级目录膨胀
- 🔄 **智能同步** — 基于 SHA-256 hash 对比，仅同步有变更的文件夹
- 📦 **全量拷贝** — 每个资源文件夹完整同步（包括模板、示例、脚本等）
- 🎨 **交互式配置** — 源目录可选（默认 `~/.aitools/`）、骨架自动生成、同步工具非必填
- 🧩 **双模式 CLI** — 支持子命令（推荐）和 `--type` 简写两种写法

## v0.2.0 破坏性变更（Breaking Changes）

本版本相对 v0.1.0 存在以下破坏性变更，**升级后需要重新 `aitools init`**：

1. **源目录结构**：从扁平 `<source>/<skill-name>/` 改为 `<source>/<resource_type>/<scope>/<name>/`
2. **全局配置**：`targets[].user_path` 改为 `targets[].user_base`（去掉 `/skills` 后缀，由程序按资源类型推导）
3. **项目配置**：`.aitools/project.yaml` 改为按资源类型分组（`skills:`、`commands:`、`agents:`、`rules:`）
4. **项目级目录名**：统一改为 `.<targetName>/`（如 `.claude-code/` 而非 `.claude/`），下挂 `<resource_dir_name>/`
5. **CLI 命令**：新增必须/可选资源类型参数，`aitools sync skills`、`aitools list commands` 等

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

脚本会交互式完成：解除全局命令 → 清理 `dist/` 和 `node_modules/` → 询问是否清理 `~/.aitools/` 配置 → 询问是否清理自定义源目录。

### 手动安装

```bash
pnpm install
pnpm run build
pnpm link --global
```

如果未全局链接，可使用 `pnpm run start` 或 `node ./dist/index.js` 代替。

## 使用指南

### 1. 初始化 — `aitools init`

首次使用时，运行初始化命令完成配置：

```bash
aitools init
```

交互流程（v0.2.0 更新）：

1. **指定源目录**（可选）— 输入绝对路径或 `~/` 开头的路径；**留空回车**则使用默认 `~/.aitools/`。目录不存在会自动创建。
2. **自动创建资源骨架** — 在源目录下生成以下子目录结构（已存在的跳过）：
   ```
   <source>/
   ├── skills/{user,project}/
   ├── commands/{user,project}/
   ├── agents/{user,project}/
   └── rules/{user,project}/
   ```
3. **选择同步目标工具**（非必填）— 多选 checkbox，`CodeBuddy` 默认勾选，`Claude Code` 默认不勾选；**允许全不选**（一路回车），此时默认仅启用 `codebuddy`。
4. **生成配置** — 写入 `~/.aitools/config.yaml`，并输出使用引导。

初始化完成后的配置文件示例：

```yaml
source: ~/.aitools
targets:
  - name: codebuddy
    enabled: true
    user_base: ~/.codebuddy
  - name: claude-code
    enabled: false
    user_base: ~/.claude
sync:
  default_scope: user
  clean: false
```

### 2. 准备资源文件

资源必须放在源目录的对应二级子目录下，不能再放在源目录根部。以 skills 为例：

```
~/.aitools/                         # 或你指定的源目录
├── config.yaml
└── skills/
    ├── user/                        # 用户级：aitools sync 会自动同步到所有已启用工具
    │   ├── code-review/
    │   │   ├── SKILL.md             # 主文件（必需）
    │   │   ├── template.md          # 模板（可选）
    │   │   └── examples/            # 示例（可选）
    │   └── git-workflow/
    │       └── SKILL.md
    └── project/                     # 项目级：候选池，需 --skill 关联到项目后同步
        └── frontend-checker/
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

没有 frontmatter 也可以，名称会自动取文件夹名，描述显示为 `-`。

> **Commands / Agents / Rules**：对应的骨架目录已创建，但当前版本尚未实现同步逻辑。调用 `aitools sync commands` 会提示「暂未支持，敬请期待」。

### 3. 同步 — `aitools sync`

将源目录中的资源同步到所有已启用的 AI 工具目录。支持**用户级**和**项目级**两种同步范围；支持**子命令**和 **`--type` 简写**两种写法。

#### 基本用法

```bash
# 同步所有已实现类型（当前只有 skills）
aitools sync

# 仅同步 skills（推荐写法：子命令）
aitools sync skills

# 等价写法：--type 简写
aitools sync --type skills
aitools sync --type all

# 未实现的类型会提示「暂未支持，敬请期待」
aitools sync commands
aitools sync agents
aitools sync rules
```

#### 目标工具过滤

```bash
# 仅同步到指定目标
aitools sync skills --target claude-code
aitools sync skills -t codebuddy
```

#### 用户级 / 项目级控制

```bash
# 仅用户级（跳过项目级自动检测）
aitools sync skills --scope user

# 仅项目级（要求当前目录已存在 .aitools/project.yaml）
aitools sync skills --scope project

# 默认：先用户级，再自动检测项目级
aitools sync skills
```

#### 关联项目级资源

项目级资源需要通过 `--skill` 显式关联到当前项目：

```bash
# 将指定资源关联到当前项目并立即同步
aitools sync skills --skill frontend-checker
```

这会：
1. 将 `frontend-checker` 写入 `<project>/.aitools/project.yaml` 的 `skills:` 列表
2. 将该资源同步到 `<project>/.<targetName>/skills/frontend-checker/`

#### 命令参数一览

| 参数 | 说明 |
|---|---|
| `[type]` | 资源类型位置参数：`skills` / `commands` / `agents` / `rules` / `all`（默认 `all`） |
| `--type <type>` | 与位置参数等价的简写（推荐用位置参数） |
| `-t, --target <name>` | 指定单个同步目标工具（如 `codebuddy`、`claude-code`） |
| `-s, --skill <name>` | 指定资源名称，添加到当前项目并同步（必须指定具体资源类型，不能与 `all` 联用） |
| `--scope <scope>` | 同步范围：`user`（仅用户级）/ `project`（仅项目级）；默认智能检测 |

### 4. 查看列表 — `aitools list`

列出资源及其同步状态。与 `sync` 一样支持子命令和 `--type` 简写：

```bash
aitools list              # 所有已实现类型
aitools list skills       # 仅 skills（推荐）
aitools list --type skills
```

输出示例（两段式：用户级 + 项目级）：

```
📋 [skills] 用户级资源 (源: ~/.aitools/skills/user/)

┌───────────────┬──────────┬──────────┬─────────────┐
│ 名称          │ 源 hash  │ CodeBuddy │ Claude Code │
├───────────────┼──────────┼──────────┼─────────────┤
│ code-review   │ ab12cd34 │ ✅ 已同步 │ ✅ 已同步   │
│ git-workflow  │ ef56gh78 │ ⚠️ 需更新 │ ✅ 已同步   │
└───────────────┴──────────┴──────────┴─────────────┘

📁 [skills] 项目级资源 (项目: /path/to/my-project)

┌───────────────┬──────────┬──────────┐
│ 名称          │ 源 hash  │ CodeBuddy │
├───────────────┼──────────┼──────────┤
│ frontend-ckr  │ 11aa22bb │ ✅ 已同步 │
└───────────────┴──────────┴──────────┘

💡 运行 aitools sync 同步最新变更
```

状态说明：

| 状态 | 含义 |
|---|---|
| ✅ 已同步 | 源与所有目标内容一致 |
| ⚠️ 需更新 | 源与目标内容不同 |
| ❌ 未同步 | 目标中不存在该资源 |

## 目录结构与路径推导规则

为便于理解同步逻辑，下面明确列出源目录与目标目录的对应关系：

### 用户级同步

```
源：    <source>/skills/user/<name>/
        <source>/commands/user/<name>/   (未实现)
目标：  <user_base>/skills/<name>/       (如 ~/.codebuddy/skills/<name>/)
        <user_base>/commands/<name>/     (未实现)
```

### 项目级同步

```
源：    <source>/skills/project/<name>/（或 user 下也可，--skill 可关联 user/project 任一 scope）
目标：  <projectDir>/.<targetName>/skills/<name>/   (如 <proj>/.codebuddy/skills/<name>/)
```

## 开发命令

```bash
pnpm run dev     # 开发模式（监听文件变化自动编译）
pnpm run build   # 构建
pnpm run start   # 运行
pnpm run lint    # 代码校验
pnpm run format  # 代码格式化
pnpm run test    # 运行测试
```

## 项目结构

```
src/
├── index.ts                          # CLI 入口，注册 init/sync/list 命令
├── commands/
│   ├── init.ts                       # 交互式初始化 + 骨架生成
│   ├── sync.ts                       # 按资源类型分发同步
│   └── list.ts                       # 按资源类型分发状态展示
├── core/
│   ├── scanner.ts                    # 通用资源扫描入口
│   ├── syncer.ts                     # 同步引擎（hash 对比 + 全量拷贝）
│   ├── hasher.ts                     # SHA-256 hash 计算
│   └── resources/
│       ├── handler.ts                # ResourceHandler 接口定义
│       ├── registry.ts               # 资源处理器注册中心
│       ├── skills.ts                 # SkillsHandler（完整实现）
│       ├── commands.ts               # CommandsHandler（占位）
│       ├── agents.ts                 # AgentsHandler（占位）
│       └── rules.ts                  # RulesHandler（占位）
├── config/
│   ├── manager.ts                    # 全局 config.yaml 读写
│   └── project.ts                    # 项目 project.yaml 读写
├── types/
│   └── index.ts                      # TypeScript 类型定义
└── utils/
    ├── logger.ts                     # 终端日志工具
    └── scaffold.ts                   # 源目录骨架生成

tests/
├── core/
│   ├── syncer.test.ts
│   ├── detectProjectTools.test.ts
│   └── resources/
│       ├── skills.test.ts
│       └── registry.test.ts
├── config/
│   └── project.test.ts
└── utils/
    └── scaffold.test.ts
```

## 扩展指南：添加新的资源类型

1. 在 `src/core/resources/<type>.ts` 创建 handler，实现 `ResourceHandler` 接口（参考 `skills.ts`）
2. 在 `src/core/resources/registry.ts` 的 `HANDLERS` 映射中注册
3. 将 `implemented` 设为 `true`
4. 运行 `aitools init` 重新生成骨架（会自动创建新类型的 `user/project` 目录）

CLI 会自动识别新类型，无需额外改动命令代码。

## 技术栈

- **TypeScript** + **ES Modules** — 强类型 + 现代模块化
- **Commander** — CLI 框架（双模式子命令）
- **@inquirer/prompts** — 交互式终端提示
- **yaml** — YAML 配置文件读写
- **picocolors** — 终端彩色输出
- **tsup** — 零配置 TypeScript 打包
- **Vitest** — 单元测试
- **ESLint** + **Prettier** — 代码规范与格式化

## License

MIT

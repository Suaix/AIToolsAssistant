# aitools-cli

> AI Agent 统一配置与技能（Skills）同步管理工具

## 简介

`aitools-cli` 是一个命令行工具，用于将你的 Skills（技能）文件统一管理，并同步到不同的 AI 编程助手的用户级目录中。

目前支持的 AI 工具：

| 工具 | 用户级 Skills 目录 |
|---|---|
| **CodeBuddy** | `~/.codebuddy/skills/<name>/` |
| **Claude Code** | `~/.claude/skills/<name>/` |

### 核心特性

- 🎯 **统一管理** — 所有 Skills 集中存放在一个源目录
- 🔄 **智能同步** — 基于 SHA-256 hash 对比，仅同步有变更的文件
- 📦 **全量拷贝** — 每个 Skill 整个文件夹完整同步（包括模板、示例、脚本等）
- 🎨 **交互式配置** — 引导式初始化，操作简单直观

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

### 手动安装

```bash
# 1. 克隆项目
git clone <repo-url>
cd AIToolsAssistant

# 2. 安装依赖
pnpm install

# 3. 构建
pnpm run build

# 4. 全局链接（注册 aitools 命令到系统 PATH）
pnpm link --global
```

如果未全局链接，可使用 `pnpm run start` 或 `node ./dist/index.js` 代替。

## 使用指南

### 1. 初始化 — `aitools init`

首次使用时，运行初始化命令完成配置：

```bash
aitools init
```

交互流程：

1. **指定 Skills 源目录** — 输入你存放 Skills 文件的目录路径（绝对路径或 `~` 开头），如 `~/my-skills`。目录不存在时会自动创建。
2. **选择同步目标** — 多选你要同步到的 AI 工具（CodeBuddy、Claude Code），至少选一个。
3. **生成配置** — 自动在 `~/.aitools/config.yaml` 创建配置文件。

初始化完成后的配置文件示例：

```yaml
source: ~/my-skills
targets:
  - name: codebuddy
    enabled: true
    user_path: ~/.codebuddy/skills
  - name: claude-code
    enabled: true
    user_path: ~/.claude/skills
sync:
  default_scope: user
  clean: false
```

### 2. 准备 Skill 文件

在源目录中创建 Skill 文件夹，每个 Skill **必须包含** `SKILL.md` 文件：

```
~/my-skills/
├── code-review/
│   ├── SKILL.md           # 主指令文件（必需）
│   ├── template.md        # 模板文件（可选）
│   └── examples/          # 示例目录（可选）
│       └── sample.md
├── git-workflow/
│   ├── SKILL.md
│   └── scripts/           # 脚本目录（可选）
│       └── setup.sh
└── refactoring/
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

> 没有 frontmatter 也可以，名称会自动取文件夹名，描述显示为 `-`。

### 3. 同步 — `aitools sync`

将源目录中的 Skills 同步到所有已启用的 AI 工具目录：

```bash
# 同步到所有目标
aitools sync

# 仅同步到指定目标
aitools sync --target claude-code
aitools sync -t codebuddy
```

同步机制：

- 通过 SHA-256 hash 对比文件内容，**仅在有变更时才拷贝**
- 每次同步是**全量替换**整个 Skill 文件夹（先清空再拷贝）
- 目标目录不存在时自动创建

输出示例：

```
🔄 正在同步用户级 Skills...
   源目录: ~/my-skills (3 个 Skills)

   ✅ code-review → codebuddy, claude-code (新增)
   ✅ git-workflow → codebuddy, claude-code (更新)
   ⏭️  refactoring → codebuddy, claude-code (无变更)

📊 同步完成: 3 个 Skills，新增 1 个，更新 1 个，跳过 1 个
```

### 4. 查看列表 — `aitools list`

列出所有 Skills 及其同步状态：

```bash
aitools list
```

输出示例：

```
📋 用户级 Skills (源: ~/my-skills)

   名称              描述                      同步状态
   ──────────────────────────────────────────────────
   code-review       代码审查助手              ✅ 已同步
   git-workflow      Git 工作流                ⚠️  有变更
   refactoring       -                         ❌ 未同步

💡 运行 aitools sync 同步最新变更
```

状态说明：

| 状态 | 含义 |
|---|---|
| ✅ 已同步 | 源与所有目标内容一致 |
| ⚠️ 有变更 | 源与部分目标内容不同 |
| ❌ 未同步 | 目标中不存在该 Skill |

## 开发命令

```bash
# 开发模式（监听文件变化自动编译）
pnpm run dev

# 构建
pnpm run build

# 运行
pnpm run start

# 代码校验
pnpm run lint

# 代码格式化
pnpm run format

# 运行测试
pnpm run test
```

## 项目结构

```
src/
├── index.ts              # CLI 入口，注册 init / sync / list 命令
├── commands/
│   ├── init.ts           # 交互式全局初始化
│   ├── sync.ts           # 用户级 Skills 同步
│   └── list.ts           # Skills 列表展示
├── core/
│   ├── hasher.ts         # SHA-256 hash 计算
│   ├── scanner.ts        # Skill 目录扫描 + frontmatter 解析
│   └── syncer.ts         # 基于 hash 对比的同步引擎
├── config/
│   └── manager.ts        # 配置文件管理（~/.aitools/config.yaml）
├── types/
│   └── index.ts          # TypeScript 类型定义
└── utils/
    └── logger.ts         # 终端日志工具
```

## 技术栈

- **TypeScript** + **ES Modules** — 强类型 + 现代模块化
- **Commander** — CLI 框架
- **@inquirer/prompts** — 交互式终端提示
- **yaml** — YAML 配置文件读写
- **picocolors** — 终端彩色输出
- **tsup** — 零配置 TypeScript 打包
- **Vitest** — 单元测试
- **ESLint** + **Prettier** — 代码规范与格式化

## License

MIT

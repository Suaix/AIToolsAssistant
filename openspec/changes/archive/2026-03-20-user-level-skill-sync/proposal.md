## Why

当前使用多个 AI 编码工具（CodeBuddy、Claude Code）时，相同的 Skills 需要在每个工具的专属目录下各维护一份。修改一个 Skill 后需要手动逐一拷贝到其他工具目录，容易遗漏导致不一致。需要一个 CLI 工具实现"一次更新，多处同步"，消除手动维护的繁琐和出错风险。

## What Changes

- 新增 `aitools init` 命令：交互式全局初始化，用户指定 Skills 源目录，选择同步目标工具，生成 `~/.aitools/config.yaml` 配置文件
- 新增 `aitools sync` 命令：读取源目录中的所有 Skill 文件夹，通过文件内容 hash 对比检测变更，将整个 Skill 文件夹全量拷贝到各目标工具的用户级目录
- 新增 `aitools list` 命令：列出源目录中所有 Skills 的名称和描述，通过 hash 对比标记同步状态（已同步 / 有变更 / 未同步）
- 新增配置管理模块：读写 `~/.aitools/config.yaml`，管理源目录路径和同步目标列表
- 新增 Skill 扫描模块：扫描目录中的 Skill 文件夹，解析 SKILL.md 的 frontmatter 提取元数据
- 新增文件同步引擎：基于 hash 对比的文件夹级全量拷贝

## Capabilities

### New Capabilities
- `global-init`: 全局初始化能力——交互式创建 `~/.aitools/config.yaml`，用户指定源目录和同步目标
- `skill-sync`: 用户级 Skills 同步能力——从源目录到各 AI 工具用户级目录的文件夹全量拷贝，支持 hash 变更检测
- `skill-list`: Skills 列表展示能力——扫描源目录 Skills 并对比各目标的同步状态

### Modified Capabilities
<!-- 无现有能力需要修改 -->

## Impact

- **代码**: 新增 `src/commands/` 下的 `init.ts`（重写）、`sync.ts`、`list.ts`；新增 `src/config/`、`src/core/`、`src/types/` 模块
- **依赖**: 使用已有的 `@inquirer/prompts`（交互式提示）、`yaml`（配置解析）、`picocolors`（终端输出）；无需新增外部依赖
- **文件系统**: 读写 `~/.aitools/config.yaml`；读取用户指定的源目录；写入 `~/.codebuddy/skills/` 和 `~/.claude/skills/` 目标目录
- **CLI 入口**: `src/index.ts` 需注册 `sync` 和 `list` 两个新命令

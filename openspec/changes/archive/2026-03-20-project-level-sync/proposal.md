# Proposal: 项目级 Skill 同步

## Summary

在现有用户级全量同步的基础上，增加项目级按需同步能力。用户可以从全局源目录中选择特定 Skill，同步到指定项目目录下的 AI 工具目录（`.codebuddy/skills/`、`.claude/skills/`）。

## Motivation

当前 `aitools sync` 仅支持用户级全量同步（全部 Skills → 全局 `~/.codebuddy/skills/` 和 `~/.claude/skills/`）。实际使用中，不同项目需要不同的 Skill 组合，用户需要按需选择：

- 项目 A 只需要 `git-workflow` 和 `code-review`
- 项目 B 只需要 `api-design`
- 用户级 Skills 不应该全部污染到项目目录

## Design decisions

### 1. 源目录复用
项目级同步复用全局 `~/.aitools/config.yaml` 中的 `source` 路径，不引入新的源目录概念。

### 2. 项目配置文件 `.aitools/project.yaml`
在项目根目录下创建 `.aitools/project.yaml` 记录已关联的 Skill 列表。首次通过 `--skill` 参数指定，后续自动读取。

### 3. `.aitools/` 目录不提交到 Git
`.aitools/` 是本工具的私有管理状态，纯本地工具管理。团队 Skill 共享由项目级 `.codebuddy/skills/` 和 `.claude/skills/` 目录自行管理。

### 4. sync 命令智能检测
裸执行 `aitools sync` 时，自动检测当前工作目录是否有 `.aitools/project.yaml`，如有则同时同步用户级 + 项目级。

### 5. list 命令两段式展示
`aitools list` 同时展示用户级和项目级（如有），使用两段式分区布局。

### 6. 目标工具读全局配置
MVP 阶段项目级不单独配置目标工具，复用全局配置中已启用的 targets。

## Scope

### In scope
- `sync` 命令增加 `--skill` 和 `--scope project` 参数
- 项目配置文件 `.aitools/project.yaml` 的创建和读取
- `list` 命令增加项目级同步状态展示
- 同步引擎支持项目级目标路径

### Out of scope
- 项目级独立配置目标工具
- Skill 的删除/取消关联命令（后续扩展）
- 团队级 Skill 管理

## Affected specs
- `skill-sync` — 新增项目级同步场景
- `skill-list` — 新增项目级列表展示
- 新增 `project-config` spec — 项目配置文件管理

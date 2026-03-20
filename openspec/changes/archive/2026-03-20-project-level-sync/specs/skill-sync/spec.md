## MODIFIED Requirements

### Requirement: 读取配置并扫描源目录
系统 SHALL 在执行 sync 命令时读取 `~/.aitools/config.yaml` 获取源目录路径和已启用的目标工具列表，然后扫描源目录中的所有 Skill 文件夹。

> 无变更，保持原有行为。

### Requirement: 同步到所有已启用的目标
系统 SHALL 将每个 Skill 同步到配置中所有 `enabled: true` 的目标工具。对于用户级同步，使用 `Target.user_path`；对于项目级同步，使用项目目录下的工具子目录。

#### Scenario: 两个目标都启用
- **WHEN** 配置中 codebuddy 和 claude-code 均为 `enabled: true`
- **THEN** 每个 Skill 分别拷贝到对应的用户级或项目级目录

#### Scenario: 指定单个目标
- **WHEN** 用户执行 `aitools sync --target claude-code`
- **THEN** 仅同步到 claude-code 对应目录，不影响其他目标

## ADDED Requirements

### Requirement: 项目级同步 — 指定 Skill 添加到项目
系统 SHALL 在用户使用 `--skill <name>` 参数时，将指定的 Skill 添加到当前项目的关联列表，并同步到项目级目标目录。

#### Scenario: 首次添加 Skill 到项目
- **WHEN** 用户在 `/path/to/project-A` 执行 `aitools sync --skill skill-b`，源目录中存在 `skill-b/`
- **THEN** 系统创建 `.aitools/project.yaml` 并记录 `skill-b`，将 `skill-b/` 拷贝到 `project-A/.codebuddy/skills/skill-b/` 和 `project-A/.claude/skills/skill-b/`

#### Scenario: 指定的 Skill 不存在于源目录
- **WHEN** 用户执行 `aitools sync --skill non-existent`，源目录中不存在 `non-existent/`
- **THEN** 系统输出错误"Skill 'non-existent' 不存在于源目录中"，退出

#### Scenario: 重复添加已关联的 Skill
- **WHEN** `skill-b` 已在 `project.yaml` 中，用户再次执行 `--skill skill-b`
- **THEN** 系统不重复添加到配置文件，但仍然执行同步（确保内容最新）

### Requirement: 项目级同步 — 自动检测并同步
系统 SHALL 在裸执行 `aitools sync`（无 `--scope` 参数）时，自动检测当前工作目录是否存在 `.aitools/project.yaml`，如有则在完成用户级同步后自动执行项目级同步。

#### Scenario: 当前目录有项目配置
- **WHEN** 用户在 `/path/to/project-A` 执行 `aitools sync`，该目录有 `.aitools/project.yaml` 包含 `skills: [skill-b, skill-c]`
- **THEN** 系统先同步用户级（全量），然后自动同步 `skill-b` 和 `skill-c` 到项目级目标

#### Scenario: 当前目录无项目配置
- **WHEN** 用户在无 `.aitools/project.yaml` 的目录下执行 `aitools sync`
- **THEN** 系统仅同步用户级，行为与之前完全一致

### Requirement: 同步范围参数 --scope
系统 SHALL 支持 `--scope` 参数来显式指定同步范围。

#### Scenario: --scope user
- **WHEN** 用户执行 `aitools sync --scope user`
- **THEN** 仅执行用户级同步，忽略项目级

#### Scenario: --scope project
- **WHEN** 用户执行 `aitools sync --scope project`，当前目录有项目配置
- **THEN** 仅执行项目级同步，跳过用户级

#### Scenario: --scope project 但无项目配置
- **WHEN** 用户执行 `aitools sync --scope project`，当前目录无项目配置
- **THEN** 系统输出错误提示"当前目录未关联任何 Skill，请使用 --skill 添加"

### Requirement: 项目级目标路径映射
系统 SHALL 根据目标工具名称推导项目级 Skill 存储路径。

#### Scenario: CodeBuddy 项目级路径
- **WHEN** 目标工具为 `codebuddy`，项目根目录为 `/path/to/project-A`
- **THEN** 项目级路径为 `/path/to/project-A/.codebuddy/skills/`

#### Scenario: Claude Code 项目级路径
- **WHEN** 目标工具为 `claude-code`，项目根目录为 `/path/to/project-A`
- **THEN** 项目级路径为 `/path/to/project-A/.claude/skills/`

### Requirement: 项目级同步结果输出
系统 SHALL 在同步结果中区分展示用户级和项目级的同步状态。

#### Scenario: 同时同步用户级和项目级
- **WHEN** `aitools sync` 同时执行了用户级和项目级同步
- **THEN** 终端先输出用户级同步结果摘要，然后输出项目级同步结果摘要，两段分别标注

#### Scenario: 仅同步项目级
- **WHEN** `aitools sync --scope project`
- **THEN** 终端仅输出项目级同步结果摘要

### Requirement: project.yaml 中 Skill 在源目录中已不存在
系统 SHALL 在项目级同步时，对 `project.yaml` 中记录但源目录中已不存在的 Skill 输出警告。

#### Scenario: Skill 已被从源目录删除
- **WHEN** `project.yaml` 包含 `skill-x`，但源目录中不存在 `skill-x/`
- **THEN** 系统输出警告"Skill 'skill-x' 在源目录中不存在，已跳过"，不中断其他 Skill 的同步

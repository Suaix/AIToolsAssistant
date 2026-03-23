## MODIFIED Requirements

### Requirement: 同步到所有已启用的目标
系统 SHALL 将每个 Skill 同步到配置中所有 `enabled: true` 的目标工具。对于用户级同步，使用 `Target.user_path`；对于项目级同步，系统 SHALL 先检测当前项目目录中实际存在的 AI 工具目录，仅同步到检测到的目标工具。

#### Scenario: 用户级同步两个目标都启用
- **WHEN** 配置中 codebuddy 和 claude-code 均为 `enabled: true`，执行用户级同步
- **THEN** 每个 Skill 分别拷贝到 `~/.codebuddy/skills/<name>/` 和 `~/.claude/skills/<name>/`（行为不变）

#### Scenario: 项目级同步仅检测到一个工具
- **WHEN** 配置中 codebuddy 和 claude-code 均为 `enabled: true`，项目目录中存在 `.codebuddy/` 但不存在 `.claude/`
- **THEN** 项目级同步仅将 Skill 拷贝到 `<project>/.codebuddy/skills/<name>/`，不创建 `.claude/skills/`

#### Scenario: 项目级同步检测到多个工具
- **WHEN** 项目目录中同时存在 `.codebuddy/` 和 `.claude/`
- **THEN** 项目级同步将 Skill 拷贝到两个工具的目录

#### Scenario: 指定单个目标
- **WHEN** 用户执行 `aitools sync --target claude-code`
- **THEN** 仅同步到 claude-code 对应目录，不影响其他目标（`--target` 优先级高于检测逻辑）

### Requirement: 项目级同步 — 指定 Skill 添加到项目
系统 SHALL 在用户使用 `--skill <name>` 参数时，将指定的 Skill 添加到当前项目的关联列表，并同步到项目级目标目录。同步目标 SHALL 基于项目目录中实际存在的 AI 工具目录来确定。

#### Scenario: 首次添加 Skill 到项目（仅有一个工具目录）
- **WHEN** 用户在 `/path/to/project-A` 执行 `aitools sync --skill skill-b`，项目中存在 `.codebuddy/` 但不存在 `.claude/`
- **THEN** 系统创建 `.aitools/project.yaml` 并记录 `skill-b`，仅将 `skill-b/` 拷贝到 `project-A/.codebuddy/skills/skill-b/`

#### Scenario: 首次添加 Skill 到项目（无任何工具目录）
- **WHEN** 用户在 `/path/to/project-B` 执行 `aitools sync --skill skill-b`，项目中不存在 `.codebuddy/` 也不存在 `.claude/`
- **THEN** 系统提示用户选择要同步到的目标工具，根据用户选择创建对应目录并同步

#### Scenario: 指定的 Skill 不存在于源目录
- **WHEN** 用户执行 `aitools sync --skill non-existent`，源目录中不存在 `non-existent/`
- **THEN** 系统输出错误"Skill 'non-existent' 不存在于源目录中"，退出

#### Scenario: 重复添加已关联的 Skill
- **WHEN** `skill-b` 已在 `project.yaml` 中，用户再次执行 `--skill skill-b`
- **THEN** 系统不重复添加到配置文件，但仍然执行同步（确保内容最新）

## ADDED Requirements

### Requirement: 项目级同步 — AI 工具目录检测
系统 SHALL 在执行项目级同步前，检测当前项目目录中是否存在已知 AI 工具的根目录（如 `.codebuddy/`、`.claude/`），以此判断项目使用的 AI 工具。

#### Scenario: 仅存在 CodeBuddy 目录
- **WHEN** 项目目录下存在 `.codebuddy/` 但不存在 `.claude/`
- **THEN** 检测结果为仅使用 CodeBuddy，同步目标列表只包含 `codebuddy`

#### Scenario: 仅存在 Claude Code 目录
- **WHEN** 项目目录下存在 `.claude/` 但不存在 `.codebuddy/`
- **THEN** 检测结果为仅使用 Claude Code，同步目标列表只包含 `claude-code`

#### Scenario: 两个工具目录都存在
- **WHEN** 项目目录下同时存在 `.codebuddy/` 和 `.claude/`
- **THEN** 检测结果为同时使用两个工具，同步目标列表包含 `codebuddy` 和 `claude-code`

#### Scenario: 都不存在
- **WHEN** 项目目录下既不存在 `.codebuddy/` 也不存在 `.claude/`
- **THEN** 检测结果为无法自动确定，需要交互式询问用户

### Requirement: 项目级同步 — 无工具目录时交互式选择
系统 SHALL 在项目目录中检测不到任何已知 AI 工具目录时，通过交互式提示让用户选择要同步到的目标工具。

#### Scenario: 用户选择单个目标
- **WHEN** 项目无任何工具目录，系统提示选择，用户选择 `codebuddy`
- **THEN** 系统仅将 Skill 同步到 `<project>/.codebuddy/skills/<name>/`

#### Scenario: 用户选择多个目标
- **WHEN** 项目无任何工具目录，系统提示选择，用户选择 `codebuddy` 和 `claude-code`
- **THEN** 系统将 Skill 同步到两个工具的项目级目录

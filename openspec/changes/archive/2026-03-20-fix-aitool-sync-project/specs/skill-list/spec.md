## MODIFIED Requirements

### Requirement: 展示项目级同步状态
系统 SHALL 在检测到当前工作目录存在 `.aitools/project.yaml` 时，在用户级表格之后额外输出项目级同步状态表格。项目级表格的目标列 SHALL 仅展示当前项目实际使用的 AI 工具（基于目录检测）。

#### Scenario: 当前目录有项目级配置且仅使用一个工具
- **WHEN** 用户在 `/path/to/project-A` 执行 `aitools list`，该目录有 `.aitools/project.yaml` 包含 `skills: [skill-b]`，且仅存在 `.codebuddy/` 目录
- **THEN** 在用户级表格之后输出项目级表格，表格仅包含 CodeBuddy 状态列（不展示 Claude Code 列）

#### Scenario: 当前目录无项目级配置
- **WHEN** 用户在无 `.aitools/project.yaml` 的目录下执行 `aitools list`
- **THEN** 仅输出用户级表格，不显示项目级部分

#### Scenario: 项目级 Skill 在源目录中不存在
- **WHEN** `project.yaml` 包含 `skill-x`，但源目录中不存在 `skill-x/`
- **THEN** 该 Skill 在表格中名称后追加 `(源已删除)`，所有目标列显示 `-`

### Requirement: 项目级同步状态对比
系统 SHALL 对项目级 Skill 的每个**当前项目实际使用的** AI 工具目标，通过 hash 对比源目录和项目级目标目录的内容，展示同步状态。

#### Scenario: 项目级目标已同步
- **WHEN** 项目使用 CodeBuddy，源 `skill-b/` 的 hash 与 `project-A/.codebuddy/skills/skill-b/` 的 hash 一致
- **THEN** CodeBuddy 列显示 "✅ 已同步"

#### Scenario: 项目级目标需要更新
- **WHEN** 项目使用 CodeBuddy，源 `skill-b/` 的 hash 与 `project-A/.codebuddy/skills/skill-b/` 的 hash 不同
- **THEN** CodeBuddy 列显示 "⚠️ 需更新"

#### Scenario: 项目级目标不存在
- **WHEN** 项目使用 CodeBuddy，`project-A/.codebuddy/skills/skill-b/` 目录不存在
- **THEN** CodeBuddy 列显示 "❌ 未同步"

#### Scenario: 项目无任何工具目录
- **WHEN** 项目有 `.aitools/project.yaml` 但不存在任何 AI 工具目录
- **THEN** 项目级表格的目标列为空，所有 Skill 所有目标列显示 "❌ 未同步"，提示用户运行 `aitools sync --scope project` 进行同步

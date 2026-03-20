## MODIFIED Requirements

### Requirement: 列出源目录中所有 Skills
系统 SHALL 读取配置文件中的源目录路径，扫描其中所有有效 Skill 文件夹，以标准化表格形式输出每个 Skill 的名称、源 hash 和同步状态。同时自动检测当前工作目录的项目级配置，如有则额外展示项目级同步状态。

#### Scenario: 源目录有多个 Skills
- **WHEN** 源目录包含 `skill-a` 和 `skill-b`
- **THEN** 终端以对齐的表格形式输出两行数据，包含名称、源 hash 和各目标状态列

#### Scenario: Skill 名称过长
- **WHEN** 某个 Skill 的名称超过 20 个字符
- **THEN** 名称截断到 20 个字符并追加 `...`，保持表格对齐

### Requirement: 输出操作提示
系统 SHALL 在列表底部输出下一步操作提示，帮助用户知道如何同步。

#### Scenario: 用户级存在未同步的 Skills
- **WHEN** 至少一个 Skill 的某个用户级目标状态不是"已同步"
- **THEN** 列表底部提示"运行 aitools sync 同步最新变更"

#### Scenario: 项目级存在未同步的 Skills
- **WHEN** 项目级至少一个 Skill 的某个目标状态不是"已同步"
- **THEN** 列表底部提示"运行 aitools sync 同步最新变更"

#### Scenario: 所有 Skills 均已同步
- **WHEN** 用户级和项目级（如有）的所有 Skill 的所有目标状态都是"已同步"
- **THEN** 列表底部提示"所有 Skills 已同步到最新状态"

## ADDED Requirements

### Requirement: 展示项目级同步状态
系统 SHALL 在检测到当前工作目录存在 `.aitools/project.yaml` 时，在用户级表格之后额外输出项目级同步状态表格。

#### Scenario: 当前目录有项目级配置
- **WHEN** 用户在 `/path/to/project-A` 执行 `aitools list`，该目录有 `.aitools/project.yaml` 包含 `skills: [skill-b]`
- **THEN** 在用户级表格之后输出一个标题为"📁 项目级 Skills (项目: /path/to/project-A)"的表格，展示 `skill-b` 在各目标工具中的项目级同步状态

#### Scenario: 当前目录无项目级配置
- **WHEN** 用户在无 `.aitools/project.yaml` 的目录下执行 `aitools list`
- **THEN** 仅输出用户级表格，不显示项目级部分

#### Scenario: 项目级 Skill 在源目录中不存在
- **WHEN** `project.yaml` 包含 `skill-x`，但源目录中不存在 `skill-x/`
- **THEN** 该 Skill 在表格中名称后追加 `(源已删除)`，所有目标列显示 `-`

### Requirement: 项目级同步状态对比
系统 SHALL 对项目级 Skill 的每个已启用目标工具，通过 hash 对比源目录和项目级目标目录的内容，展示同步状态。

#### Scenario: 项目级目标已同步
- **WHEN** 源 `skill-b/` 的 hash 与 `project-A/.codebuddy/skills/skill-b/` 的 hash 一致
- **THEN** 该目标列显示 "✅ 已同步"

#### Scenario: 项目级目标需要更新
- **WHEN** 源 `skill-b/` 的 hash 与 `project-A/.codebuddy/skills/skill-b/` 的 hash 不同
- **THEN** 该目标列显示 "⚠️ 需更新"

#### Scenario: 项目级目标不存在
- **WHEN** `project-A/.codebuddy/skills/skill-b/` 目录不存在
- **THEN** 该目标列显示 "❌ 未同步"

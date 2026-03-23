## Requirements

### Requirement: 列出源目录中所有 Skills
系统 SHALL 读取配置文件中的源目录路径，扫描其中所有有效 Skill 文件夹，以标准化表格形式输出每个 Skill 的名称、源 hash 和同步状态。同时自动检测当前工作目录的项目级配置，如有则额外展示项目级同步状态。

#### Scenario: 源目录有多个 Skills
- **WHEN** 源目录包含 `skill-a` 和 `skill-b`
- **THEN** 终端以对齐的表格形式输出两行数据，包含名称、源 hash 和各目标状态列

#### Scenario: Skill 名称过长
- **WHEN** 某个 Skill 的名称超过 20 个字符
- **THEN** 名称截断到 20 个字符并追加 `...`，保持表格对齐

### Requirement: 从 SKILL.md frontmatter 解析元数据
系统 SHALL 解析每个 `SKILL.md` 文件开头的 YAML frontmatter，提取 `name` 和 `description` 字段。

#### Scenario: 包含标准 frontmatter
- **WHEN** `SKILL.md` 以 `---` 开头，包含 `name` 和 `description` 字段
- **THEN** 系统正确提取名称和描述

#### Scenario: 没有 frontmatter
- **WHEN** `SKILL.md` 不包含 YAML frontmatter（不以 `---` 开头）
- **THEN** 名称使用文件夹名，描述显示为 "-"

#### Scenario: frontmatter 解析错误
- **WHEN** `SKILL.md` 的 frontmatter 格式不合法（YAML 语法错误）
- **THEN** 系统输出警告但不中断，名称使用文件夹名，描述显示为 "-"

### Requirement: 显示同步状态
系统 SHALL 对每个 Skill，以表格形式展示源文件 hash 和各已启用目标工具的独立同步状态。表格列包括：Skill 名称、源 hash（SHA-256 前 8 位）、以及每个已启用目标工具的状态列。

#### Scenario: 两个目标都已启用且状态不同
- **WHEN** 配置中 codebuddy 和 claude-code 均为 `enabled: true`，源 `skill-a/` 的 hash 与 codebuddy 目标一致但与 claude-code 目标不同
- **THEN** 表格输出一行，包含 Skill 名称、源 hash 短值、CodeBuddy 列显示 "✅ 已同步"、Claude Code 列显示 "⚠️ 需更新"

#### Scenario: 所有目标均已同步
- **WHEN** 源 `skill-a/` 的 hash 与所有已启用目标目录中对应 Skill 的 hash 一致
- **THEN** 所有目标列均显示 "✅ 已同步"

#### Scenario: 目标中不存在该 Skill
- **WHEN** 源 `skill-a/` 在某个目标目录中不存在
- **THEN** 该目标列显示 "❌ 未同步"

#### Scenario: 仅启用一个目标工具
- **WHEN** 配置中只有 claude-code 为 `enabled: true`
- **THEN** 表格只有 3 列：Skill 名称、源 hash、Claude Code 状态

### Requirement: 表格使用 Unicode Box Drawing 字符对齐
系统 SHALL 使用 Unicode Box Drawing 字符（如 `│`、`─`、`┼`）构建表格边框，并根据各列内容的实际终端宽度（CJK 字符按 2 宽度计算）自动对齐。

#### Scenario: 包含中文名称的 Skill
- **WHEN** 某个 Skill 名称为中文字符（如"代码审查"）
- **THEN** 表格列宽正确计算（每个中文字符按 2 宽度），各列内容对齐整齐

#### Scenario: 全英文名称
- **WHEN** 所有 Skill 名称均为英文
- **THEN** 表格列宽按字符长度计算，各列内容对齐整齐

### Requirement: 展示源文件 hash 短值
系统 SHALL 对每个 Skill 目录计算 SHA-256 hash，并在表格中展示前 8 位 hex 字符作为版本标识。

#### Scenario: 正常显示 hash
- **WHEN** 源 `skill-a/` 的完整 SHA-256 hash 为 `a1b2c3d4e5f6...`
- **THEN** 表格中源 hash 列显示 `a1b2c3d4`

### Requirement: 配置文件不存在时报错
系统 SHALL 在 `~/.aitools/config.yaml` 不存在时输出错误提示。

#### Scenario: 未初始化
- **WHEN** 执行 `aitools list` 但 `~/.aitools/config.yaml` 不存在
- **THEN** 系统输出错误提示"请先运行 aitools init 进行初始化"，退出

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

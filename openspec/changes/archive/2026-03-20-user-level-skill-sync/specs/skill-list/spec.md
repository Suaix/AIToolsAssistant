## ADDED Requirements

### Requirement: 列出源目录中所有 Skills
系统 SHALL 读取配置文件中的源目录路径，扫描其中所有有效 Skill 文件夹，列出每个 Skill 的名称和描述。

#### Scenario: 源目录有多个 Skills
- **WHEN** 源目录包含 `skill-a`（description: "代码审查助手"）和 `skill-b`（description: "Git 工作流"）
- **THEN** 终端以表格形式输出两行，每行包含 Skill 名称和描述

#### Scenario: Skill 没有 description
- **WHEN** 某个 Skill 的 `SKILL.md` frontmatter 中没有 `description` 字段
- **THEN** 描述列显示为 "-"（短横线）

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
系统 SHALL 对每个 Skill，通过文件内容 hash 对比源与各目标目录，标记同步状态。

#### Scenario: 所有目标均已同步
- **WHEN** 源 `skill-a/` 的 hash 与所有目标目录中对应 Skill 的 hash 一致
- **THEN** 状态列显示 "✅ 已同步"

#### Scenario: 部分目标有变更
- **WHEN** 源 `skill-a/` 的 hash 与 codebuddy 目标一致但与 claude-code 目标不一致
- **THEN** 状态列显示 "⚠️ 有变更"，并标注哪个目标不一致

#### Scenario: 目标中不存在该 Skill
- **WHEN** 源 `skill-a/` 在所有目标目录中都不存在
- **THEN** 状态列显示 "❌ 未同步"

### Requirement: 配置文件不存在时报错
系统 SHALL 在 `~/.aitools/config.yaml` 不存在时输出错误提示。

#### Scenario: 未初始化
- **WHEN** 执行 `aitools list` 但 `~/.aitools/config.yaml` 不存在
- **THEN** 系统输出错误提示"请先运行 aitools init 进行初始化"，退出

### Requirement: 输出操作提示
系统 SHALL 在列表底部输出下一步操作提示，帮助用户知道如何同步。

#### Scenario: 存在未同步的 Skills
- **WHEN** 至少一个 Skill 的状态不是"已同步"
- **THEN** 列表底部提示"运行 aitools sync 同步最新变更"

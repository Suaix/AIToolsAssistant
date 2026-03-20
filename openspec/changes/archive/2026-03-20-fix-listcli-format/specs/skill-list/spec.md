## MODIFIED Requirements

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

### Requirement: 列出源目录中所有 Skills
系统 SHALL 读取配置文件中的源目录路径，扫描其中所有有效 Skill 文件夹，以标准化表格形式输出每个 Skill 的名称、源 hash 和同步状态。

#### Scenario: 源目录有多个 Skills
- **WHEN** 源目录包含 `skill-a` 和 `skill-b`
- **THEN** 终端以对齐的表格形式输出两行数据，包含名称、源 hash 和各目标状态列

#### Scenario: Skill 名称过长
- **WHEN** 某个 Skill 的名称超过 20 个字符
- **THEN** 名称截断到 20 个字符并追加 `...`，保持表格对齐

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

### Requirement: 输出操作提示
系统 SHALL 在列表底部输出下一步操作提示，帮助用户知道如何同步。

#### Scenario: 存在未同步的 Skills
- **WHEN** 至少一个 Skill 的某个目标状态不是"已同步"
- **THEN** 列表底部提示"运行 aitools sync 同步最新变更"

#### Scenario: 所有 Skills 均已同步
- **WHEN** 所有 Skill 的所有目标状态都是"已同步"
- **THEN** 列表底部提示"所有 Skills 已同步到最新状态"

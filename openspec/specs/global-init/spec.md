## ADDED Requirements

### Requirement: 交互式指定 Skills 源目录
系统 SHALL 在初始化时通过交互式提示让用户输入 Skills 源目录的绝对路径或以 `~` 开头的路径。

#### Scenario: 用户输入有效的新目录路径
- **WHEN** 用户输入一个不存在的有效路径（如 `~/my-skills`）
- **THEN** 系统自动创建该目录，并将路径记录到配置文件中

#### Scenario: 用户输入已存在的目录路径
- **WHEN** 用户输入一个已存在的目录路径
- **THEN** 系统直接使用该目录作为源目录，并将路径记录到配置文件中

#### Scenario: 用户输入空路径
- **WHEN** 用户未输入任何路径直接回车
- **THEN** 系统提示路径不能为空，要求重新输入

### Requirement: 交互式选择同步目标工具
系统 SHALL 提供多选列表让用户选择要同步到哪些 AI 工具，当前可选项为 CodeBuddy 和 Claude Code。

#### Scenario: 用户选择多个目标工具
- **WHEN** 用户同时选择 CodeBuddy 和 Claude Code
- **THEN** 配置文件中记录两个目标，各自的 `enabled` 字段为 `true`

#### Scenario: 用户只选择一个目标工具
- **WHEN** 用户只选择 Claude Code
- **THEN** 配置文件中仅 Claude Code 的 `enabled` 为 `true`，CodeBuddy 的 `enabled` 为 `false`

#### Scenario: 用户未选择任何工具
- **WHEN** 用户未选择任何目标工具
- **THEN** 系统提示至少需要选择一个目标工具，要求重新选择

### Requirement: 生成全局配置文件
系统 SHALL 在 `~/.aitools/` 目录下生成 `config.yaml` 配置文件，包含源目录路径和同步目标列表。

#### Scenario: 首次初始化
- **WHEN** `~/.aitools/config.yaml` 不存在
- **THEN** 系统创建 `~/.aitools/` 目录和 `config.yaml` 文件，写入用户选择的源目录和目标工具配置

#### Scenario: 重复初始化
- **WHEN** `~/.aitools/config.yaml` 已存在
- **THEN** 系统提示已存在配置文件，询问用户是否覆盖；用户确认后覆盖，否则取消操作

### Requirement: 配置文件格式
配置文件 SHALL 使用 YAML 格式，包含 `source`（源目录路径）和 `targets`（目标工具列表）两个顶级字段。

#### Scenario: 生成的配置文件内容正确
- **WHEN** 用户指定源目录为 `~/my-skills` 并选择了两个目标工具
- **THEN** 生成的 `config.yaml` 包含 `source: ~/my-skills` 和包含 codebuddy、claude-code 两项的 `targets` 数组，每项包含 `name`、`enabled`、`user_path` 字段

### Requirement: 初始化完成后输出摘要
系统 SHALL 在初始化成功后输出操作摘要，包括配置文件路径、源目录路径和已选择的目标工具。

#### Scenario: 初始化成功
- **WHEN** 初始化流程全部完成
- **THEN** 终端输出配置文件路径 `~/.aitools/config.yaml`、源目录路径、已启用的目标工具列表，以及下一步操作提示

## Requirements

### Requirement: 加载项目配置文件
系统 SHALL 从当前工作目录下的 `.aitools/project.yaml` 读取项目级配置，获取已关联的 Skill 名称列表。

#### Scenario: 项目配置存在且有效
- **WHEN** 当前工作目录下存在 `.aitools/project.yaml`，内容包含 `skills: [skill-b, skill-c]`
- **THEN** 系统返回已关联的 Skill 列表 `['skill-b', 'skill-c']`

#### Scenario: 项目配置不存在
- **WHEN** 当前工作目录下不存在 `.aitools/project.yaml`
- **THEN** 系统返回 `null`，调用方据此判断当前目录无项目级配置

#### Scenario: 项目配置 YAML 格式错误
- **WHEN** `.aitools/project.yaml` 存在但 YAML 格式不合法
- **THEN** 系统输出警告"项目配置文件格式错误"，返回 `null`

#### Scenario: 项目配置 skills 字段为空数组
- **WHEN** `.aitools/project.yaml` 存在，`skills` 字段为空数组 `[]`
- **THEN** 系统返回空数组，调用方视为无已关联 Skill

### Requirement: 保存项目配置文件
系统 SHALL 将 Skill 名称列表写入当前工作目录下的 `.aitools/project.yaml`。

#### Scenario: 首次创建项目配置
- **WHEN** `.aitools/project.yaml` 不存在，用户添加 `skill-b`
- **THEN** 系统自动创建 `.aitools/` 目录和 `project.yaml` 文件，内容为 `skills: [skill-b]`

#### Scenario: 追加新 Skill 到已有配置
- **WHEN** `.aitools/project.yaml` 已存在，`skills: [skill-b]`，用户添加 `skill-c`
- **THEN** 系统更新文件为 `skills: [skill-b, skill-c]`

#### Scenario: 避免重复添加
- **WHEN** 用户添加的 Skill 名称已存在于 `skills` 列表中
- **THEN** 系统不重复添加，保持列表不变

### Requirement: 项目配置文件数据结构
项目配置文件 SHALL 使用 YAML 格式，顶级结构包含 `skills` 字段（字符串数组），每项为源目录中 Skill 的文件夹名。

#### Scenario: 标准配置文件内容
- **WHEN** 项目关联了 `skill-b` 和 `skill-c` 两个 Skills
- **THEN** 配置文件内容为：
  ```yaml
  skills:
    - skill-b
    - skill-c
  ```

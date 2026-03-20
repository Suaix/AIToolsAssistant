## ADDED Requirements

### Requirement: 读取配置并扫描源目录
系统 SHALL 在执行 sync 命令时读取 `~/.aitools/config.yaml` 获取源目录路径和已启用的目标工具列表，然后扫描源目录中的所有 Skill 文件夹。

#### Scenario: 配置文件存在且源目录有 Skills
- **WHEN** 配置文件存在，源目录包含 `skill-a/SKILL.md` 和 `skill-b/SKILL.md`
- **THEN** 系统识别出 2 个有效 Skill 文件夹

#### Scenario: 配置文件不存在
- **WHEN** `~/.aitools/config.yaml` 不存在
- **THEN** 系统输出错误提示"请先运行 aitools init 进行初始化"，退出

#### Scenario: 源目录不存在
- **WHEN** 配置中的源目录路径不存在
- **THEN** 系统输出错误提示"源目录不存在: <path>"，退出

#### Scenario: 源目录为空
- **WHEN** 源目录存在但不包含任何 Skill 文件夹
- **THEN** 系统输出提示"源目录中没有发现任何 Skill"，正常退出

### Requirement: 有效 Skill 文件夹识别
系统 SHALL 将包含 `SKILL.md` 文件的子目录识别为有效 Skill 文件夹。不包含 `SKILL.md` 的子目录 SHALL 被忽略。

#### Scenario: 目录包含 SKILL.md
- **WHEN** 源目录下的 `my-skill/` 子目录中存在 `SKILL.md` 文件
- **THEN** `my-skill` 被识别为有效 Skill

#### Scenario: 目录不包含 SKILL.md
- **WHEN** 源目录下的 `random-folder/` 子目录中不存在 `SKILL.md` 文件
- **THEN** `random-folder` 被忽略，不参与同步

### Requirement: 基于 hash 的变更检测
系统 SHALL 对每个 Skill 文件夹内的所有文件计算 SHA-256 hash，与目标目录中对应 Skill 的 hash 进行对比，仅在 hash 不同时执行拷贝。

#### Scenario: Skill 内容有变更
- **WHEN** 源目录中 `skill-a/SKILL.md` 的内容 hash 与目标目录中对应文件的 hash 不同
- **THEN** 系统将源 `skill-a/` 文件夹全量拷贝到目标目录，覆盖旧内容

#### Scenario: Skill 内容无变更
- **WHEN** 源目录中 `skill-a/` 所有文件的 hash 与目标目录中完全一致
- **THEN** 系统跳过该 Skill，不执行拷贝

#### Scenario: 目标目录中不存在该 Skill
- **WHEN** 源目录中存在 `skill-a/` 但目标目录中不存在
- **THEN** 系统将 `skill-a/` 文件夹完整拷贝到目标目录（视为新增）

### Requirement: 整个 Skill 文件夹全量拷贝
系统 SHALL 在同步时拷贝整个 Skill 文件夹，包括 `SKILL.md`、`template.md`、`examples/`、`scripts/` 等所有子文件和子目录。

#### Scenario: Skill 包含辅助文件
- **WHEN** 源 `skill-a/` 包含 `SKILL.md`、`template.md` 和 `examples/sample.md`
- **THEN** 目标目录中的 `skill-a/` 包含完全相同的文件结构和内容

#### Scenario: 目标中已有旧版文件
- **WHEN** 目标 `skill-a/` 中存在旧文件 `old-file.md` 但源中不存在
- **THEN** 目标 `skill-a/` 目录被完整替换（先清空再拷贝），`old-file.md` 被移除

### Requirement: 同步到所有已启用的目标
系统 SHALL 将每个 Skill 同步到配置中所有 `enabled: true` 的目标工具的用户级目录。

#### Scenario: 两个目标都启用
- **WHEN** 配置中 codebuddy 和 claude-code 均为 `enabled: true`
- **THEN** 每个 Skill 分别拷贝到 `~/.codebuddy/skills/<name>/` 和 `~/.claude/skills/<name>/`

#### Scenario: 指定单个目标
- **WHEN** 用户执行 `aitools sync --target claude-code`
- **THEN** 仅同步到 `~/.claude/skills/`，不影响 `~/.codebuddy/skills/`

### Requirement: 同步结果摘要输出
系统 SHALL 在同步完成后输出结果摘要，包括每个 Skill 的同步状态和总计数据。

#### Scenario: 部分更新部分跳过
- **WHEN** 源目录有 3 个 Skills，其中 1 个有变更、2 个无变更
- **THEN** 终端输出每个 Skill 的状态（已更新/无变更），以及总计"共 3 个 Skills，更新 1 个，跳过 2 个"

#### Scenario: 全部为新增
- **WHEN** 目标目录为空，源目录有 2 个 Skills
- **THEN** 终端输出每个 Skill 的状态（已新增），以及总计"共 2 个 Skills，新增 2 个"

### Requirement: 目标目录自动创建
系统 SHALL 在目标工具的用户级 skills 目录不存在时自动创建。

#### Scenario: 目标目录不存在
- **WHEN** `~/.codebuddy/skills/` 目录不存在
- **THEN** 系统自动创建该目录，然后将 Skills 拷贝到其中

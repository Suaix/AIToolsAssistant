## Requirements

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

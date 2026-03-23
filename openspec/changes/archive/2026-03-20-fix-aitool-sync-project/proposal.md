## Why

项目级同步（`aitools sync --skill xxx`）会向**所有**全局配置中已启用的目标工具同步 Skill，而不检测当前项目实际使用的是哪个 AI 工具。例如项目只使用 CodeBuddy（目录中有 `.codebuddy/`），同步时却额外创建了 `.claude/skills/xxx` 目录，造成项目中出现不需要的文件夹。应该智能检测当前项目使用的 AI 工具，仅同步到对应的目标目录。

## What Changes

- 项目级同步（包括 `--skill` 添加、`--scope project`、智能检测模式）增加**当前项目 AI 工具检测**逻辑：
  - 检测当前项目根目录是否存在 `.codebuddy/` 或 `.claude/` 目录
  - 如果检测到某些工具的目录存在，则**仅同步到已检测到的工具**
  - 如果**都不存在**，提示用户选择要同步到的目标工具
- `aitools list` 项目级展示同样遵循检测逻辑，只展示当前项目实际使用的 AI 工具的同步状态

## Capabilities

### New Capabilities

无

### Modified Capabilities

- `skill-sync`: 项目级同步目标工具的筛选逻辑变更 — 从"所有已启用目标"改为"检测当前项目使用的 AI 工具，仅同步到对应目标"
- `skill-list`: 项目级列表展示目标工具的筛选逻辑变更 — 从"所有已启用目标"改为"仅展示当前项目使用的 AI 工具状态"

## Impact

- **受影响代码**：`src/core/syncer.ts`（`syncProjectSkills` 函数）、`src/commands/sync.ts`（`--skill` 处理流程）、`src/commands/list.ts`（项目级展示）
- **行为变更**：项目级同步不再在项目中创建未使用的 AI 工具目录
- **用户交互**：当项目中不存在任何已知 AI 工具目录时，需要新增交互式选择流程

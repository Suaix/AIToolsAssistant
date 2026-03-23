## Context

当前项目级同步（`syncProjectSkills()`）使用"广播式"策略——只要全局配置中目标工具 `enabled: true` 且在 `PROJECT_TARGET_PATHS` 中有映射，就一律同步。这导致在只使用 CodeBuddy 的项目中会额外创建 `.claude/skills/` 目录，反之亦然。

现有检测点在 `syncer.ts` 第 226 行：
```typescript
let targets = config.targets.filter(
  (t) => t.enabled && PROJECT_TARGET_PATHS[t.name],
);
```

以及 `list.ts` 中项目级展示也采用相同逻辑。

## Goals / Non-Goals

**Goals:**
- 项目级同步前，通过检测项目目录中是否存在 `.codebuddy/` 或 `.claude/` 目录来判断当前项目使用的 AI 工具
- 仅同步到检测到的工具目录
- 如果**都不存在**，提示用户通过交互式选择确认要同步到的目标
- `aitools list` 项目级展示也遵循相同检测逻辑

**Non-Goals:**
- 不改变用户级同步逻辑（用户级仍然同步到所有已启用目标）
- 不引入更复杂的工具检测机制（如读取 IDE 配置文件）
- 不在 `.aitools/project.yaml` 中持久化目标工具选择（保持配置极简）

## Decisions

### 决策 1：检测方式 — 检查项目根目录下的工具目录是否存在

**选择**：通过 `fs.existsSync()` 检测项目根目录下是否存在 `.codebuddy/` 或 `.claude/` 等工具目录。

**理由**：
- 最直接的信号 — 如果项目中有 `.codebuddy/` 目录，说明该项目在使用 CodeBuddy
- 零配置，无需用户额外声明
- 和 `PROJECT_TARGET_PATHS` 映射表自然配合

**否决的替代方案**：
- 读取 IDE 配置（如 `.vscode/settings.json`）→ 过于复杂且不可靠
- 在 `project.yaml` 中声明 `targets` 字段 → 增加用户配置负担

### 决策 2：检测时机 — 在 `syncProjectSkills()` 入口处过滤

**选择**：在 `syncProjectSkills()` 函数中，获取 targets 列表后立即执行工具目录检测，过滤掉不存在对应目录的目标。

**理由**：集中在一处修改，同步引擎是所有项目级同步流程的入口，无论来自 `--skill`、`--scope project` 还是智能检测模式。

### 决策 3：都不存在时的处理 — 交互式选择

**选择**：当项目中不存在任何已知 AI 工具目录时，使用 `@inquirer/select` 提示用户选择目标。

**理由**：
- 首次使用 `--skill` 时项目可能还没有任何工具目录，此时需要用户明确意图
- 交互式选择与项目现有的 `init` 命令风格一致

### 决策 4：检测逻辑的判断目标 — 检测工具根目录（非 skills 子目录）

**选择**：检测 `.codebuddy/` 而非 `.codebuddy/skills/`。

**理由**：工具根目录（如 `.codebuddy/`）是 AI 工具在项目中存在的标准标志。即使 skills 子目录尚未创建，只要有工具根目录就说明该项目在使用该工具。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|------|----------|
| 项目同时使用多个 AI 工具（如 CodeBuddy + Claude Code） | 检测到多个工具目录时，全部同步（与当前行为一致） |
| 用户手动删除了工具目录导致误判 | 退化到"都不存在"的交互式选择流程，不会丢失数据 |
| 非交互模式（CI/CD）下无法弹出选择 | 后续可增加 `--target` 参数显式指定，绕过交互选择 |

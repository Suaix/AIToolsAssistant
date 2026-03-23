## 1. 新增项目 AI 工具目录检测函数

- [x] 1.1 在 `src/core/syncer.ts` 中新增 `detectProjectTools(projectDir, targets)` 函数，遍历已启用目标，通过 `fs.existsSync()` 检测项目目录下对应的工具根目录（如 `.codebuddy/`、`.claude/`），返回检测到的目标列表
- [x] 1.2 新增检测用的目录映射常量 `PROJECT_TOOL_DIRS`，将目标工具名映射到工具根目录名（`codebuddy → .codebuddy`，`claude-code → .claude`）

## 2. 修改项目级同步目标筛选逻辑

- [x] 2.1 修改 `syncProjectSkills()` 函数，在获取 targets 后调用 `detectProjectTools()` 过滤目标列表，仅保留项目中实际存在的工具目录对应的目标
- [x] 2.2 当 `detectProjectTools()` 返回空列表时（无任何工具目录），使用 `@inquirer/checkbox` 弹出交互式选择，让用户选择要同步到的目标工具

## 3. 修改 list 命令项目级展示

- [x] 3.1 修改 `src/commands/list.ts` 中项目级表格的目标列筛选逻辑，调用 `detectProjectTools()` 仅展示当前项目检测到的 AI 工具的同步状态

## 4. 更新测试用例

- [x] 4.1 为 `detectProjectTools()` 函数添加单元测试（覆盖四种场景：仅 codebuddy、仅 claude-code、两个都有、都没有）
- [x] 4.2 更新 `syncer.test.ts` 中项目级同步相关测试，确保同步目标基于目录检测而非全量广播

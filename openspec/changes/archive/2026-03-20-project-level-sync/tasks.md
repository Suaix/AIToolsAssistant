# Tasks: 项目级 Skill 同步

- [x] Task 1: 新增 ProjectConfig 类型和项目配置管理模块 — 在 `src/types/index.ts` 新增 `ProjectConfig` 接口；新建 `src/config/project.ts` 实现 loadProjectConfig、saveProjectConfig、addSkillToProject、projectConfigExists
- [x] Task 2: 同步引擎支持项目级目标路径 — 在 `src/core/syncer.ts` 新增 `PROJECT_TARGET_PATHS` 常量和 `syncProjectSkills()` 函数，复用 copyDirectory 和 hash 对比
- [x] Task 3: sync 命令增加项目级参数和智能检测 — 新增 `--skill`、`--scope` 选项，实现三种同步模式，在 `src/index.ts` 注册新选项
- [x] Task 4: list 命令增加项目级状态展示 — 检测 project.yaml，两段式表格布局，源已删除标记，综合提示
- [x] Task 5: 更新测试用例 — 新增 project.ts 单元测试，更新 syncer/sync/list 测试覆盖项目级场景

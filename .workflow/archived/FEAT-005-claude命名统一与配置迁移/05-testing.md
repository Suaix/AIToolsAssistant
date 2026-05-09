# 测试验收报告：claude 命名统一 + 旧 config 迁移

> **任务编号**：FEAT-005
> **创建日期**：2026-05-09
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：静态验收通过，动态验收待用户走查

---

## 1. 静态验收（AI 代码审查）

### 1.1 功能逻辑覆盖

#### US-1：Claude 工具命名一致性

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-1.1 | aitools init 写出的 Claude target.name 与 target add / GUI 一致 | ✅ | 三处统一从 `shared/tools.json` 派生（`src/config/manager.ts:163`、`src/commands/target.ts:117`、`desktop/src/lib/tools.ts:42`） |
| AC-1.2 | GUI AddToolModal 与 CLI list 输出 Claude 显示名一致 | ✅ | 都通过 `getToolDisplayName()` 取自 SSOT |
| AC-1.3 | 仓库无业务路径直接出现旧名 `claude-code` | ✅ | grep 验证：仅在迁移代码 / RFC 历史 / `.last-migration.json` 等明确语义场景出现 |
| AC-1.4 | SSOT 修改单文件即同步两端 | ✅ | `shared/tools.json` 修改后，CLI 通过 `src/registry/tools.ts:resolveRegistryPath()` + desktop 通过 `@shared/tools.json` Vite alias，两端共用 |

#### US-2：旧 config 自动迁移

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-2.1 | v0.2.0 schema（含 user_path）首次执行自动迁移 + .bak | ✅ | `src/config/migrations/v0.2-to-v0.4.ts` + `index.ts:migrateConfigDispatch` 备份逻辑 |
| AC-2.2 | v0.4.0 schema（含 claude-code）首次启动自动改名 + user_base 改写 | ✅ | `v0.4-to-v0.5.ts:migrateConfigV04ToV05` + SSOT legacyAliases / legacyUserBases 查表 |
| AC-2.3 | 项目级 project.yaml 缺 version 自动迁移 | ✅ | `src/config/project.ts:loadProjectConfig` 接入 `migrateProjectConfigDispatch` |
| AC-2.4 | 已是当前 schema 时不重复迁移、不修改 mtime | ✅ | `index.ts:migrateConfigDispatch` 第 1 步：fromVersion === CURRENT 时直接返回 up_to_date |

#### US-3：旧 user_base 资源目录搬迁

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-3.1 | 旧目录有资源、新目录不存在 → 合并 | ✅ | `relocate-legacy-dirs.ts:relocateDirPair` |
| AC-3.2 | 同名内容不同 → 报错列冲突清单，不静默覆盖 | ✅ | conflicts 累加，不删除旧目录（`relocateDirPair` 第 3 步） |
| AC-3.3 | 用户从未把资源同步到旧目录 → 不创建任何 AI 工具家目录 | ✅ | `relocateDirPair` 第 1 步：旧目录不存在直接返回空结果 |

#### US-4：SSOT 注册表

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-4.1 | "Claude Code" 显示名仅出现在 SSOT / i18n | ✅ | grep 验证：除 RFC / README / .last-migration.json / 注释外无业务引用 |
| AC-4.2 | 修改 SSOT 中工具的 user_base 后两端默认值同步 | ✅ | CLI 通过 `getDefaultEnabledTools()` + desktop 通过 `AVAILABLE_TOOLS` 都派生自 SSOT |

#### US-5：迁移健壮性

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-5.1 | 迁移写入失败 → 原文件未损坏，报错含 .bak 路径 | ✅ | `index.ts:migrateConfigDispatch` 备份在写入前；写入失败时 reporter 输出 backupPath |
| AC-5.2 | yaml 损坏 → 不进入静默写入路径，明确报错 | ✅ | `loadConfig` 中 parseYaml catch 后直接返回 null，不调度迁移 |

#### US-6：目录创建边界守卫

| AC 编号 | 验收条件 | 代码覆盖 | 备注 |
|---------|---------|---------|------|
| AC-6.1 | enabled codebuddy 但 ~/.codebuddy 不存在 → sync 跳过该 target，不创建目录 | ✅ | `src/core/syncer.ts:syncResourceToDir` 入口 `pathExistsAsDir(toolHomeDir)` 守卫 |
| AC-6.2 | 项目 .claude-internal 不存在 → 跳过项目级该 target | ✅ | 同上守卫；`detectProjectTools` 已自然过滤 |
| AC-6.3 | GUI 同步进度面板 missing 行展示「未检测到」 | ✅ | `desktop/src/components/SyncProgressModal.tsx:ACTION_BADGE` 加 `skipped_missing_tool`；ProgressRow 显示 expectedPath |
| AC-6.4 | 全量审查 mkdir 仅作用于 aitools 自身或已存在的工具家目录子层 | ✅ | 摸底确认 syncer.ts 是唯一越权点，已修复；其他 mkdir 全部针对 `~/.aitools/` 或 `<project>/.aitools/` |

### 1.2 设计规范合规

| 检查项 | 结果 | 备注 |
|--------|------|------|
| 颜色全部使用语义 Token（`var(--color-*)`），无硬编码 HEX | ✅ | `ConfigMigrationModal.tsx` / `SyncProgressModal.tsx` 改动均使用 token |
| 间距使用 `var(--space-*)`，圆角使用 `var(--radius-*)` | ✅ | 同上 |
| 组件 CSS 类名符合 L5 规范（BEM 命名） | ✅ | 复用 `.modal` / `.btn--primary` 等既有类 |
| 中文注释完整（类、方法、常量） | ✅ | 所有新文件按用户规则填充中文注释 |
| 可访问性（aria-label / role / 键盘导航） | ✅ | ConfigMigrationModal 含 role="dialog"、aria-modal、aria-labelledby、ESC/点击外侧关闭 |
| 不在循环中创建新对象 | ✅ | 已审查所有新代码 |
| 单方法 ≤ 100 行 | ✅ | 最长方法 `migrateConfigDispatch` 约 70 行 |
| 单文件 ≤ 5000 行 | ✅ | 最大新文件 `relocate-legacy-dirs.ts` ~250 行 |

### 1.3 静态验收结论

- [x] **功能逻辑覆盖通过**（19 项 AC 全覆盖）
- [x] **设计规范合规通过**

---

## 2. 动态验收（用户运行验证）

> AI 已通过端到端脚本验证 v0.4.0 → v0.5.0 自动迁移完整链路。
> 以下条目供用户在 GUI 真实环境中走查（部分场景需准备旧 fixture 才能触发）。

### 2.1 功能验收

#### US-1：Claude 工具命名一致性

| AC 编号 | 验收条件 | 操作步骤 | 结果 | 备注 |
|---------|---------|---------|------|------|
| AC-1.2 | GUI AddToolModal 显示名与 CLI list 一致 | 1. 启动 GUI；2. 点击 Tools → 添加工具；3. 与 `aitools list` 表头对照 | ⬜ 待用户验证 | |

#### US-2：旧 config 自动迁移（CLI 端 AI 已 E2E 通过）

| AC 编号 | 验收条件 | 操作步骤 | 结果 | 备注 |
|---------|---------|---------|------|------|
| AC-2.1 | v0.2 旧 yaml 自动迁移 | 通过 mktemp 模拟旧 yaml + 跑 aitools list | ✅ E2E 通过 | 见 04-coding-log.md 步骤 17 |
| AC-2.2 | v0.4 含 claude-code 自动改名 | 同上 | ✅ E2E 通过 | |

#### US-6：目录创建边界守卫（用户走查关键）

| AC 编号 | 验收条件 | 操作步骤 | 结果 | 备注 |
|---------|---------|---------|------|------|
| AC-6.1 | enabled 工具未安装时 sync 跳过且不创建目录 | 1. enable 一个本机未安装的工具；2. 跑 sync；3. 检查家目录是否被创建 | ⬜ 待用户验证 | 需要谨慎选择测试机器 |

### 2.2 UI 走查

#### 页面还原度

| 页面 | 检查项 | 结果 | 备注 |
|------|--------|------|------|
| ConfigMigrationModal | 布局合理（标题 + 备份路径 + 折叠详情 + 主按钮） | ⬜ 待用户验证 | 需触发实际迁移才能看到 |
| ConfigMigrationModal | 暗色 / 浅色模式显示正常 | ⬜ 待用户验证 | |
| SyncProgressModal | 「未检测到工具」行灰色 ⊘ 视觉正确 | ⬜ 待用户验证 | 触发条件：sync 时某 enabled 工具家目录不存在 |
| SyncProgressModal | summary 显示「未检测到工具 N」分项 | ⬜ 待用户验证 | |

#### 状态覆盖

| 状态 | AI 验证 | 用户验证 |
|------|---------|---------|
| up_to_date（无迁移）| ✅ | ⬜ |
| migrated（成功迁移）| ✅ | ⬜ |
| missing tool（守卫）| ✅ 单测 | ⬜ |

### 2.3 动态验收结论

- [ ] **功能验收通过**（待用户走查）
- [ ] **UI 走查通过**（待用户走查）

---

## 3. 非功能性验证

| 维度 | 要求 | 验证方式 | 实际 | 结果 |
|------|------|---------|------|------|
| 性能 | 已是当前 schema 时 loadConfig < 5ms | AI 审查 | 仅多一次 version 字段读取与比较，无写盘 | ✅ |
| 性能 | SSOT 加载只读一次 | AI 审查 | `src/registry/tools.ts:REGISTRY` 为模块级常量 | ✅ |
| 兼容性 | 支持 v0.2 / v0.4.x → v0.5 自动迁移 | E2E 验证 | 已通过 | ✅ |
| 兼容性 | 不引入新 npm 依赖 | package.json diff | dependencies 未变更 | ✅ |
| 安全性 | 迁移前必须备份原文件 | 单测覆盖 | tests/config/migrations.test.ts 含备份用例 | ✅ |
| 可观测性 | 迁移产生 INFO 日志 | E2E 验证 | StdoutMigrationReporter 输出 4 行 ℹ | ✅ |
| 文档 | README + RFC 同步 | 走查 | 已更新 README §简介/§v0.5.0 变更/§配置示例；新增 RFC v0.5.0 | ✅ |

---

## 4. 缺陷记录

| 编号 | 描述 | 发现阶段 | 严重程度 | 状态 | 修复日期 |
|------|------|---------|---------|------|---------|
| BUG-1 | `src/registry/tools.ts:REGISTRY_PATH` 在 tsup bundle 模式下路径解析错误（dist 是单文件，向上两级跳出包根） | 编码步骤 17 端到端 | 严重 | ✅ 已修 | 2026-05-09 |

---

## 5. 验收结论

### 静态验收（AI）
- [x] 功能逻辑覆盖通过（19 项 AC）
- [x] 设计规范合规通过
- [x] 单元测试 186/186 通过
- [x] CLI 与 desktop 双端构建通过

### 动态验收（用户）
- [ ] 功能验收通过（**待用户走查**）
- [ ] UI 走查通过（**待用户走查**）

### 非功能性
- [x] 非功能性验证通过

**综合结论**：**有条件通过** — 静态验收 + 自动化测试已全面通过；动态验收待用户在真实 GUI 环境走查 ConfigMigrationModal 与 SyncProgressModal 守卫行的视觉效果。

**备注**：

- 用户走查通过后即可过 TESTING → ARCHIVED 门禁归档
- 归档前建议按 04-coding-log.md 中的 5 个 commit 拆分提交（feat/registry → feat/migration → feat/syncer → feat/desktop → docs/rfc）
- 遗留问题 L-1（仓库历史 TS 错误）/ L-2（lint 误扫 src-tauri/target）建议作为独立小任务收尾

---

## 6. 经验总结（Retro）

### 做得好的

- **决策前充分摸底**：在 ANALYSIS / TECHNICAL 阶段都用 code-explorer 子任务做了只读调研，避免凭空设计。例如 Q-2 引发的"aitools 不应主动 mkdir AI 工具家目录"边界问题就是摸底发现的。
- **范围控制**：用户提议"顺便重组项目结构"时，识别出该重构与本任务高风险变更耦合会增大事故难度，建议拆为独立 REFACTOR-001。
- **17 步实施路线**：每步独立可验证（runnable + green tests），出现问题（BUG-1）能立刻定位到对应步骤。
- **测试 fixture 改用 toMatchObject**：避免被新增字段（version）连累而批量改 toEqual，是最低成本的演进方案。

### 需要改进的

- **构建态路径解析**：`src/registry/tools.ts:REGISTRY_PATH` 在写代码时凭直觉用了 `../..`，没考虑 tsup bundle 模式（单文件 dist）。如果 BUG-1 没在 E2E 阶段被捕获，会成为线上事故。教训：涉及 `import.meta.url` + 相对路径的代码必须 E2E 验证 bundle 态。
- **测试守卫副作用**：守卫接入 `syncer.ts` 后，多个既有测试因"未预创建工具家目录"而失败，需要补 mkdir。说明守卫语义改变是隐性破坏性变更，应该在 03-technical.md 风险评估中更早识别。

### 后续行动

- 启动 REFACTOR-001（项目结构三段式重组）—— FEAT-005 上线稳定一周后
- 修复 L-1（仓库历史 NDJSON 事件类型不全）—— 建议作为独立 FIX 任务
- 修复 L-2（eslint.config.js ignores 加 desktop/src-tauri/target）—— 5 分钟小修

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建（静态验收通过；动态验收待用户走查；BUG-1 已修） | AI |

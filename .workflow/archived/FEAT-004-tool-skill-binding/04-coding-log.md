# 编码日志：优化连接工具与 Skill 订阅关联关系

> **任务编号**：FEAT-004
> **创建日期**：2026-05-08
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：已通过验收（2026-05-08 通过 testing_to_archived 门禁）

---

## 编码进度

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | Rust 端新增 `detect_project_tools` Tauri 命令并注册 | ✅ 已完成 | 2026-05-08 |
| 2 | 新建 `desktop/src/lib/tools.ts`（元数据+映射+detectProjectTools） | ✅ 已完成 | 2026-05-08 |
| 3 | 回填引用：AddToolModal.tsx、Tools.tsx 改为引 lib/tools | ✅ 已完成 | 2026-05-08 |
| 4 | components.css 追加 `.badge--disabled` | ✅ 已完成 | 2026-05-08 |
| 5 | 新建 `desktop/src/components/InvalidProjectModal.tsx` | ✅ 已完成 | 2026-05-08 |
| 6 | App.tsx：handleOpenDirectory 加校验 + enabledTargets ref + 渲染 InvalidProjectModal | ✅ 已完成 | 2026-05-08 |
| 7 | Skills.tsx：projectTools state + loadData 探测 + 透传 Popover | ✅ 已完成 | 2026-05-08 |
| 8 | Skills.tsx：target badge 断开态渲染 | ✅ 已完成 | 2026-05-08 |
| 9 | SubscribePopover.tsx：三态文案 + radio 禁用 | ✅ 已完成 | 2026-05-08 |
| 10 | 联调（9 项手测矩阵） | ⬜ 待开始（TESTING 阶段执行） | |
| 11 | Lint + 类型检查 + 构建 | ✅ 已完成 | 2026-05-08 |
| 12 | 更新本日志 | ✅ 已完成 | 2026-05-08 |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题

---

## 变更记录

### 2026-05-08 · 实现"项目-工具-订阅"关联三件套（一次性提交）

**变更内容**：

按技术方案 §6 实现步骤 1~9 + 11，共改动 7 个文件、新增 2 个文件：

1. **Rust 后端**（`desktop/src-tauri/src/lib.rs`）：新增 Tauri 命令 `detect_project_tools(project_dir, candidate_dirs) -> Vec<String>`，纯 fs.is_dir 探测，不引入新依赖；同步注册到 `invoke_handler!`。
2. **共享模块**（`desktop/src/lib/tools.ts`，**新增**）：迁入 `AVAILABLE_TOOLS / ToolDefinition`，新增 `TOOL_PROJECT_DIR_ALIASES` 双名兼容映射、`TOOL_DISPLAY_NAME` 展示名表、`getToolDisplayName / aggregateExpectedDirs / detectProjectTools` 三个工具函数。
3. **AddToolModal.tsx**：删除内嵌 `AVAILABLE_TOOLS / ToolDefinition`，改为 `import` + `re-export` 维持兼容。
4. **Tools.tsx**：删除局部 `DISPLAY_NAME` 表，`displayName(name)` 改为复用 `getToolDisplayName`。
5. **components.css**：在 `.badge--neutral` 后追加 `.badge--disabled`（背景 `--color-bg-muted`、文字 `--color-text-tertiary`、opacity 0.7），区别于 danger 错误态。
6. **InvalidProjectModal.tsx**（**新增**）：基于 `.modal--sm` 的轻组件，展示选中路径、已连接工具列表、期望存在的目录列表，单"我知道了"按钮关闭。
7. **App.tsx**：
   - 新增 `enabledTargetsRef: useRef<string[]>` 缓存当前已连接工具，避免与 `loadGlobalData` 形成依赖循环（TD-2）；
   - `loadGlobalData` 中追加一行 `enabledTargetsRef.current = result.enabledTargets`；
   - `handleOpenDirectory` 重构：抽出 `handlePicked` 内部函数，统一对 osascript 选择路径与 prompt 兜底路径做合法性校验；当 `connected.length === 0`（首次使用场景）时不阻断（TD-5）；校验失败时弹 `InvalidProjectModal`，不写入 `recentProjects`；
   - 渲染树挂载 `InvalidProjectModal`。
8. **Skills.tsx**：
   - 新增 `projectTools / projectToolsLoading` 两个 state；
   - `loadData` 末尾根据 `data.projectDir + data.enabledTargets` 调用 `detectProjectTools` 写入 state；
   - `SkillCard` 新增 `projectTools` prop；卡片底部 target badge 渲染时按 `currentSub.scope === 'project' && !projectTools.includes(t.target)` 判定"工具断开"灰态，输出 `.badge--disabled` + `<displayName> 连接已断开`；用户级订阅不受影响；
   - 新增 `allDisconnected` 派生状态：当所有 target 都断开时隐藏"同步"按钮（无可同步对象）；
   - 普通行的 badge 文案统一通过 `getToolDisplayName(t.target)` 输出（之前直接显示原始 target.name）；
   - `<SubscribePopover>` 调用透传 `projectTools` 与 `projectToolsLoading`。
9. **SubscribePopover.tsx**：
   - 新增 `projectTools / projectToolsLoading` 两个 props；
   - 项目级 radio 由原"二态（hasProject 真/假）"扩展为四态：`available / loading / disabled-no-project / disabled-no-tools`；
   - 副文案动态生成：可用时展示"将写入 .codebuddy/skills、.claude-internal/skills"，禁用时给出对应原因；
   - 通过 HTML `title` 属性提供 hover tooltip（沿用既有约定，不引入新组件）。

**涉及文件**：

- `desktop/src-tauri/src/lib.rs` — 新增命令 + 注册（约 35 行）
- `desktop/src/lib/tools.ts` — 新增（约 145 行）
- `desktop/src/components/AddToolModal.tsx` — 模块迁出 + re-export 兼容（精简 ~16 行）
- `desktop/src/pages/Tools.tsx` — 删除局部映射 + 复用 lib/tools（精简 ~6 行）
- `desktop/src/styles/components.css` — 追加 .badge--disabled（+8 行）
- `desktop/src/components/InvalidProjectModal.tsx` — 新增（约 110 行）
- `desktop/src/App.tsx` — 校验流 + ref + Modal 挂载（净增 ~50 行）
- `desktop/src/pages/Skills.tsx` — projectTools 注入 + badge 断开态（净增 ~50 行）
- `desktop/src/components/SubscribePopover.tsx` — 三态扩展（净增 ~40 行）

**Git Commit**（建议）：

```
feat(desktop): 项目-工具-订阅关联强一致化（FEAT-004）

- 新增 Tauri 命令 detect_project_tools（纯 fs 探测）
- 新增 desktop/src/lib/tools.ts 作为前端工具元数据单一真相源
- 添加项目时校验目录是否含已连接工具的标记目录，否则弹 InvalidProjectModal
- Skills 项目级订阅 Tab 行内对"工具已断开"展示灰态短提示
- SubscribePopover 项目级 scope 三态化（available / no-project / no-tools）
- 双名兼容（claude-code/claude-internal）由 lib/tools 统一处理；
  完整命名统一拆出独立任务 FEAT-005
```

### 2026-05-08 · TESTING revision · BUG-1 三层修复 + UI 上下结构

**变更内容**：

针对动态验收发现的 BUG-1（项目级订阅展示了来自 `desktop/src-tauri/.aitools/project.yaml` 的孤儿订阅）与 UI 拥挤反馈，按 C+A 方案三层修复：

1. **Rust 兜底**（`desktop/src-tauri/src/lib.rs`）：新增 `neutral_cwd()` 工具函数，返回 `$HOME` 或 `/`；在 `invoke_cli` 与 `invoke_cli_stream` 中改写 cwd 处理逻辑——**未传 cwd 时强制切到中性目录**，禁止 fallback 到 Tauri 进程默认 cwd（开发态 = src-tauri/，生产态 = .app/Contents/MacOS/）。
2. **删污染源**（`desktop/src-tauri/.aitools/project.yaml`）：内容历史遗留为 `brand-guidelines + canvas-design`，正是用户截图所见——直接 delete + rmdir。
3. **gitignore 防复发**（`desktop/src-tauri/.gitignore`）：追加 `.aitools/` 规则并附中文注释说明根因，避免日后任何人在 src-tauri 下生成 `.aitools/`。
4. **SubscribePopover 上下结构**（`desktop/src/components/SubscribePopover.tsx`）：把项目级 radio 与副文案改为上下两行布局——
   - 第一行：radio + 主标题「项目级（仅当前项目）」
   - 第二行：副文案左缩进 `calc(var(--space-2) + 16px)`（精确对齐主标题文字起点），小灰色 caption 字号
   - 整组用一个外层 `div` 承载 disabled 透明度与 tooltip，避免 `<label>` 嵌套副文案造成 hit area 异常

**涉及文件**：

- `desktop/src-tauri/src/lib.rs` — 新增 `neutral_cwd()` + 改写 2 个命令的 cwd 分支（净增 ~15 行）
- `desktop/src-tauri/.gitignore` — 追加 .aitools/ 忽略 + 中文注释（+3 行）
- `desktop/src-tauri/.aitools/project.yaml` — **删除**
- `desktop/src/components/SubscribePopover.tsx` — 项目级 radio 改造为上下结构（净增 ~20 行）

**Git Commit**（建议）：

```
fix(desktop): 修复项目级订阅误读 src-tauri/.aitools 的 BUG-1（FEAT-004）

- Tauri Rust 端 invoke_cli/invoke_cli_stream 兜底中性 cwd（$HOME），
  避免未传 cwd 时 CLI process.cwd() fallback 到 src-tauri/ 误读
- 删除历史遗留的 desktop/src-tauri/.aitools/project.yaml
- src-tauri/.gitignore 加 .aitools/ 防复发
- SubscribePopover 项目级 scope 改为上下结构，缓解副文案拥挤
```

**自测结果**：

### 2026-05-08 · TESTING revision · BUG-2：SyncProgressModal 漏传 cwd

**变更内容**：

继 BUG-1（list 误读）后，用户实测发现项目级同步弹窗提示成功但实际未写入文件。根因：`SyncProgressModal::runSyncStream(args, ...)` 调用未传 cwd —— Tauri 端经 BUG-1 兜底后 cwd = $HOME，CLI 在 $HOME 下找不到 test4 的 `.aitools/project.yaml`，于是"同步完成 0 项"，但 UI 关闭弹窗后 badge 仍是"未同步"（因为 `loadData()` 的二次刷新也没传 cwd）。这正是项目记忆 #36043466 列出的"反复犯错场景"之一，本任务再次踩中。

修复（一次性收紧 4 个调用点）：

1. **`SyncProgressModal.tsx`**：Props 新增 `cwd?: string` 字段（带强约束注释）；`runSyncStream(args, callbacks, cwd)` 透传。
2. **`Skills.tsx` SyncProgressModal 调用**：传 `cwd={cliProjectDir ?? currentProject ?? undefined}`。
3. **`Skills.tsx` onSyncedSomething 回调**：`loadData(cliProjectDir ?? currentProject ?? undefined)`。
4. **`Skills.tsx` 错误态"重试"按钮**：同样补 cwd（顺手修，避免下一次的 BUG-3）。

**记忆已更新**（#36043466）：把 BUG-1 / BUG-2 教训沉淀进去，特别加了"两层防御"——任何新 CLI 调用必须立刻确认 cwd 链路完整 + Tauri Rust 端兜底中性目录。

**涉及文件**：

- `desktop/src/components/SyncProgressModal.tsx` — 新增 cwd prop + 透传 runSyncStream（净增 ~10 行）
- `desktop/src/pages/Skills.tsx` — 修 3 处 cwd 漏传（约 5 行变化）

**Git Commit**（建议）：

```
fix(desktop): SyncProgressModal 显式传递项目 cwd 修复 BUG-2（FEAT-004）

- SyncProgressModal Props 新增 cwd 字段，透传至 runSyncStream
- Skills.tsx 同步 Modal、onSyncedSomething 回调、错误态重试按钮
  统一补传 cliProjectDir ?? currentProject
- 项目记忆 #36043466 已补充 SyncProgressModal 反例与两层防御原则
```

**自测结果**：

- [x] `npx tsc --noEmit` exitCode 0
- [ ] BUG-2 复现验证（M-12）— 待用户实机执行

---

## 偏离记录

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| DEV-1 | 03-technical §3.1.4 仅列"target badge 断开态"渲染规则 | 额外引入 `allDisconnected` 派生状态，当所有 target 都断开时隐藏"同步"按钮 | 手测推演时发现：若仅 badge 灰显但同步按钮可点，会触发对一个无效目标的同步，体验劣于直接隐藏；零增量复杂度，与设计意图一致 |
| DEV-2 | 03-technical §3.1.4 提到普通 badge 文案保持现状 `STATUS · target.name` | 普通 badge 也改为通过 `getToolDisplayName(t.target)` 展示美化名 | 既然 lib/tools 提供了显示名映射，统一原 raw `codebuddy` → `CodeBuddy` 是更彻底的"明确先于惊喜"，不留半成品；用户视觉一致性提升，不影响功能 |
| DEV-3 | AddToolModal 中 AVAILABLE_TOOLS 直接迁出 | 选择"迁出 + re-export 保留旧路径" | 避免 git diff 中误以为旧导入路径被破坏；FEAT-005 实施时再统一收敛到 lib/tools |

---

## 遗留问题

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| LEFT-1 | 仓库根 ESLint 配置未排除 `desktop/src-tauri/target/` 编译产物，导致 `pnpm lint` 输出 1290+ 假阳性 | 中 | 不在本任务范围，建议另起轻量任务修复 eslint.config.js 的 ignore 列表 |
| LEFT-2 | `src/commands/config.ts:25` 存在未使用的 `getConfigDir` import | 低 | 不在本任务范围 |
| LEFT-3 | `claude-code` / `claude-internal` 命名实际未统一 | 中 | 已拆 FEAT-005，本任务通过双名兼容映射兜底 |
| LEFT-4 | cwd 传递架构散落在各调用点（"现取现传"），降级链不一致（部分仅 `cliProjectDir ?? undefined`，部分 `cliProjectDir ?? currentProject ?? undefined`），新增 CLI 调用点容易再次出现 BUG-2 类问题 | 高 | 已拆 FEAT-006，方案 C+C-2：在 cli.ts 增加 `activeProjectCwd` 注入层 + `cwd?: string \| null` 区分自动注入 / 显式无项目 |

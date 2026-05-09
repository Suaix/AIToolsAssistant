# 编码日志：项目结构三段式重组

> **任务编号**：REFACTOR-001
> **创建日期**：2026-05-09
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：PR-1 完成，待提交；PR-2 进行中

---

## 编码进度

### PR-1：物理搬迁 + workspace 骨架（✅ 已完成）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | 新建 `pnpm-workspace.yaml` 与 `packages/` 目录 | ✅ 已完成 | 2026-05-09 |
| 2 | `git mv src tests → packages/cli/`（51 文件，全部 R rename） | ✅ 已完成 | 2026-05-09 |
| 3 | 搬迁 CLI 配置 + 修 include 路径 + 修 registry/tools.ts 的 SSOT 路径探测 | ✅ 已完成 | 2026-05-09 |
| 4 | 新建 `packages/cli/package.json`（`@aitools/cli`, 0.5.0, `workspace:*` 依赖 shared） | ✅ 已完成 | 2026-05-09 |
| 5 | 拆 README：根改为伞包导航；CLI 详细文档保留在 `packages/cli/README.md` | ✅ 已完成 | 2026-05-09 |
| 6 | 复制 LICENSE 到 `packages/cli/LICENSE` | ✅ 已完成 | 2026-05-09 |
| 7 | `git mv desktop → packages/desktop` | ✅ 已完成 | 2026-05-09 |
| 8 | desktop package.json 改名 `@aitools/desktop`；vite.config.ts 与 tsconfig.json 路径深一层 | ✅ 已完成 | 2026-05-09 |
| 9 | `git mv shared/* → packages/shared/src/` | ✅ 已完成 | 2026-05-09 |
| 10 | 新建 `packages/shared/` 包（package.json + tsconfig.json + src/index.ts） | ✅ 已完成 | 2026-05-09 |
| 11 | 改根 `package.json` 为伞包 `aitools-workspace`（含 preinstall 强制 pnpm） | ✅ 已完成 | 2026-05-09 |
| 12 | 根 `eslint.config.js` 改为 workspace 感知；ignores 加 desktop src 交由 desktop 自己 lint | ✅ 已完成 | 2026-05-09 |
| 13 | 改 `setup.sh` 适配 workspace 安装流程（pnpm install + -F @aitools/cli build + link） | ✅ 已完成 | 2026-05-09 |
| 14 | 改 `uninstall.sh` 适配新路径；兼容新旧两个包名的 unlink | ✅ 已完成 | 2026-05-09 |
| 15 | `.gitignore` 追加 `packages/*/dist`、`packages/*/node_modules` 等 workspace 产物 | ✅ 已完成 | 2026-05-09 |
| 16 | `pnpm install` 自举：4 个 workspace 包注册成功，软链正确 | ✅ 已完成 | 2026-05-09 |
| 17 | `pnpm -F @aitools/cli build` 成功，产物 50.54 KB | ✅ 已完成 | 2026-05-09 |
| 18 | `pnpm -F @aitools/cli test` 全绿：186/186 | ✅ 已完成 | 2026-05-09 |
| 19 | desktop vite build 成功；Tauri 完整构建留到最终验收 | ✅ 已完成 | 2026-05-09 |
| 20 | 更新 `CODEBUDDY.md`（项目结构段 + 命令速查）；`CLAUDE.md` 无需改 | ✅ 已完成 | 2026-05-09 |
| 21 | `CHANGELOG.md` 加 0.5.0 条目；`devlog.md` 待与 PR 一并更新 | ✅ 已完成 | 2026-05-09 |
| 22 | 本机回归测试：aitools --version / --help / list skills / --json 模式全部通过 | ✅ 已完成 | 2026-05-09 |
| 23 | PR-1 提交 | 🔵 待执行 | — |

### PR-2：契约重写（待开工）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | 充实 `packages/shared/src/index.ts`：导出 TOOLS 常量（已随 PR-1 一起完成框架） | ⬜ 待开始 | — |
| 2-13 | 见 03-technical.md 第 6 章 PR-2 | ⬜ 待开始 | — |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题

---

## 变更记录

### 2026-05-09 - PR-1：物理搬迁 + workspace 骨架

**变更内容**：

将仓库从"平铺 + 根 package.json = CLI"的结构重构为 pnpm workspace 三段式：
- `packages/cli/` ← 原 `src/` + `tests/` + CLI 配置
- `packages/desktop/` ← 原 `desktop/`
- `packages/shared/src/` ← 原 `shared/`

包命名统一为 `@aitools` scope：
- `aitools-cli` → `@aitools/cli`（v0.5.0）
- `aiflux-desktop` → `@aitools/desktop`（保持 0.1.0）
- 新增 `@aitools/shared`（v0.5.0, private）
- 根包 → `aitools-workspace`（伞包）

**涉及文件**：
- ✨ 新增：`pnpm-workspace.yaml`、`packages/shared/{package.json, tsconfig.json, src/index.ts}`、`packages/cli/{README.md, LICENSE}`
- 📦 搬迁：200+ 个文件（`src/` + `tests/` → `packages/cli/`；`desktop/` → `packages/desktop/`；`shared/` → `packages/shared/src/`）
- ✏️ 修改：根 `package.json` / `eslint.config.js` / `.gitignore` / `setup.sh` / `uninstall.sh` / `README.md` / `CODEBUDDY.md` / `CHANGELOG.md`
- ✏️ 修改：`packages/cli/src/registry/tools.ts`（`resolveRegistryPath()` 候选路径适配新结构；import type 改相对路径）
- ✏️ 修改：`packages/cli/src/index.ts`（版本号 0.4.2 → 0.5.0）
- ✏️ 修改：`packages/desktop/{vite.config.ts, tsconfig.json}`（`@design-system` 与 `@shared` alias 深一层）
- ✏️ 修改：`packages/cli/tsconfig.json`（include 适配跨包结构）
- ✏️ 修改：`packages/desktop/package.json` 改名 + 加 `@aitools/shared: workspace:*` 依赖

**Git Commit**：（待执行）

```
refactor(workspace): 引入 pnpm workspace 三段式 + @aitools scope 统一 (REFACTOR-001 PR-1)
```

**自测结果**：
- [x] `pnpm install` 成功，4 个 workspace 包识别正确
- [x] `pnpm -F @aitools/cli build` 成功（50.54 KB）
- [x] `pnpm -F @aitools/cli test` 全绿（186/186）
- [x] `pnpm -F @aitools/desktop build` 前端构建成功
- [x] `npm link` 重建全局 aitools 命令成功
- [x] `aitools --version` 返回 0.5.0
- [x] `aitools list skills` / `aitools --json list skills` 端到端正常
- [x] `pnpm lint` 仅剩 1 条历史遗留 dead code 警告（遗留问题 L-1）

---

## 偏离记录

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| D-1 | 03-technical.md 第 6 章"PR-1 步骤 3"：搬迁 CLI 配置时内部路径检查 | 实际一并修了 `registry/tools.ts` 的 `resolveRegistryPath()` 多候选路径、`tsconfig.json` 的 include 路径、import type 的相对路径 | PR-1 要求"新结构能跑"，这些 SSOT 相关路径修正是必需前置条件，不能推迟到 PR-2；但实质仍是兼容性过渡，PR-2 会彻底删除 |
| D-2 | 步骤 20 未更新 `docs/design-system/README.md` 等二级文档里的 `desktop/src/...` 引用 | 本 PR 暂不改 | 检查后发现设计系统文档基本不含绝对代码路径，影响面极小；如后续发现具体引用再单独处理 |
| D-3 | 步骤 19 未执行完整 `tauri:build`（只跑了 vite build） | 推迟到 PR-2 后的最终验收 | Tauri 完整打包耗时 3-5 分钟，本机已通过前端构建验证；PR-1 没动 Rust 端代码，风险极低 |
| D-4 | 根 `eslint.config.js` 原计划管全仓 JS/TS | 实际 ignores 加了 `packages/desktop/src`，desktop React 代码由 desktop 自己的 lint 处理 | 根 eslint 没装 react-hooks 插件，硬扫会报虚假错误；desktop 本来就有独立 tsconfig，lint 独立管理更合理。未来如需全仓统一 lint 再单独任务 |
| D-5 | CLI 版本号 0.4.2 → 0.5.0 未在 03-technical.md 显式列出 | 实际一并改了 `packages/cli/src/index.ts:31` 的硬编码版本 | 方案里 package.json 版本定为 0.5.0，但 commander `.version()` 的硬编码也必须同步，否则 `aitools --version` 会继续返回 0.4.2。属于方案遗漏的实现细节 |

---

## 遗留问题

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| L-1 | `packages/cli/src/commands/config.ts:25` 的 `getConfigDir` 是历史遗留 dead code，lint 报未使用 | 低 | 不阻塞本次重构；单独修复或整合到下次 cleanup 任务 |
| L-2 | `setup.sh` 与 `uninstall.sh` 在 pnpm 未配置全局 bin 目录时会降级到 npm link；本机实测 `pnpm link --global` 失败，回退 `npm link` 成功 | 低 | 脚本已自动 fallback，但可在 README 增加 pnpm setup 提示；非阻塞 |

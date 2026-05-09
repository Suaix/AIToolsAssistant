# 编码日志：项目结构三段式重组

> **任务编号**：REFACTOR-001
> **创建日期**：2026-05-09
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：暂缓（等待 FEAT-005 本地自测稳定 2-3 天后开工）

---

## 编码进度

> 详细步骤见 `03-technical.md` 第 6 章。本表追踪两个 PR 共 36 步的执行状态。

### PR-1：物理搬迁 + workspace 骨架（23 步，预计 4h）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | 新建 `pnpm-workspace.yaml` 与 `packages/` 目录 | ⬜ 待开始 | |
| 2 | `git mv src packages/cli/src` + `git mv tests packages/cli/tests` | ⬜ 待开始 | |
| 3 | 搬迁 CLI 配置：`tsconfig.json` / `tsup.config.ts` / `vitest.config.ts` 到 `packages/cli/`；内部路径检查 | ⬜ 待开始 | |
| 4 | 新建 `packages/cli/package.json`（从根 `package.json` 拆出 CLI 相关字段，改名 `@aitools/cli`） | ⬜ 待开始 | |
| 5 | 拆 README：根 README 拆分为根 + `packages/cli/README.md` | ⬜ 待开始 | |
| 6 | 复制 LICENSE 到 `packages/cli/LICENSE`（npm 发布要求） | ⬜ 待开始 | |
| 7 | `git mv desktop packages/desktop` | ⬜ 待开始 | |
| 8 | 改 `packages/desktop/package.json` 名字为 `@aitools/desktop`；调整 `@design-system` 相关路径 | ⬜ 待开始 | |
| 9 | 新建 `packages/shared/` 结构：`git mv shared/* packages/shared/src/` | ⬜ 待开始 | |
| 10 | 新建 `packages/shared/package.json` + `tsconfig.json` + `src/index.ts`（仅 re-export） | ⬜ 待开始 | |
| 11 | 改根 `package.json`：改名 `aitools-workspace`、private、聚合脚本、preinstall 钩子 | ⬜ 待开始 | |
| 12 | 调整根 `eslint.config.js`：ignores 补 workspace 产物路径 | ⬜ 待开始 | |
| 13 | 改 `setup.sh`：`cd packages/cli && pnpm build && pnpm link --global` | ⬜ 待开始 | |
| 14 | 改 `uninstall.sh`：同步新路径 | ⬜ 待开始 | |
| 15 | 更新 `.gitignore` 追加 workspace 产物路径 | ⬜ 待开始 | |
| 16 | 全仓 `pnpm install` 自举 | ⬜ 待开始 | |
| 17 | `pnpm -r build` 验证：shared 跳过、cli 产出 dist、desktop 产出 dist | ⬜ 待开始 | |
| 18 | `pnpm -F @aitools/cli test` 验证：186 测试全绿 | ⬜ 待开始 | |
| 19 | `pnpm -F @aitools/desktop tauri:build` 验证 | ⬜ 待开始 | |
| 20 | 更新 `CODEBUDDY.md` / `CLAUDE.md` / `README.md` 项目结构段落 | ⬜ 待开始 | |
| 21 | 更新 `CHANGELOG.md` / `devlog.md` | ⬜ 待开始 | |
| 22 | 本机回归测试：CLI 全套命令 + desktop 启动全流程 | ⬜ 待开始 | |
| 23 | PR-1 提交（commit + push） | ⬜ 待开始 | |

### PR-2：契约重写（13 步，预计 2.5h）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | 充实 `packages/shared/src/index.ts`：聚合 `TOOLS` 常量 + 类型重导出 | ⬜ 待开始 | |
| 2 | 改 `packages/cli/src/registry/tools.ts`：删除 fs 加载逻辑，改为 `import { TOOLS } from '@aitools/shared'` | ⬜ 待开始 | |
| 3 | 改 `migrations/v0.4-to-v0.5.ts` 与 `relocate-legacy-dirs.ts` 的 import 路径 | ⬜ 待开始 | |
| 4 | 改 `packages/desktop/src/lib/tools.ts`：统一改为 `@aitools/shared` | ⬜ 待开始 | |
| 5 | 改 `packages/desktop/vite.config.ts`：删除 `@shared` alias 条目 | ⬜ 待开始 | |
| 6 | 改 `packages/desktop/tsconfig.json`：删除 `@shared/*` paths + `../shared` include | ⬜ 待开始 | |
| 7 | 改 `packages/cli/tsconfig.json`：`rootDir: "src"`、`include` 仅 `["src/**/*"]` | ⬜ 待开始 | |
| 8 | 验证：grep 旧引用模式应为 0 命中 | ⬜ 待开始 | |
| 9 | 验证：`pnpm -F @aitools/cli pack` 产物不含 `shared/` 目录 | ⬜ 待开始 | |
| 10 | 验证：`dist/index.js` 中 `tools.json` 内容已被 tsup 内联 | ⬜ 待开始 | |
| 11 | 回归测试：CLI 全套命令 + desktop 启动 | ⬜ 待开始 | |
| 12 | 更新 `CHANGELOG.md` / `devlog.md` 记录 PR-2 | ⬜ 待开始 | |
| 13 | PR-2 提交（commit + push） | ⬜ 待开始 | |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题

---

## 变更记录

> 编码开工后按时间倒序记录每次变更。

<!-- 暂未开始编码，本节空 -->

---

## 偏离记录

<!-- 与技术方案不一致的实现，必须记录原因 -->

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| —    | —           | —       | —       |

---

## 遗留问题

<!-- 编码过程中发现但本次不处理的问题 -->

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| —    | —    | —      | —       |

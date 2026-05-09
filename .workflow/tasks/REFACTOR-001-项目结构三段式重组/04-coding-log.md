# 编码日志：项目结构三段式重组

> **任务编号**：REFACTOR-001
> **创建日期**：2026-05-09
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：PR-1 + PR-2 全部完成，等待验收归档

---

## 编码进度

### PR-1：物理搬迁 + workspace 骨架（✅ 已完成，commit 2788ca3）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1-23 | 见下方 PR-1 变更记录 | ✅ 全部完成 | 2026-05-09 |

### PR-2：契约重写（✅ 已完成，待提交）

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | 充实 `packages/shared/src/index.ts`：更新注释反映 PR-2 生效状态 | ✅ 已完成 | 2026-05-09 |
| 2 | 重写 `packages/cli/src/registry/tools.ts`：删除 `resolveRegistryPath` / `readFileSync` / `MODULE_DIR`；改为 `import { TOOLS } from '@aitools/shared'` | ✅ 已完成 | 2026-05-09 |
| 3 | 检查 migrations 目录：无其他直接 shared 引用（全部走 getLegacyAliases/getLegacyUserBases 等 API） | ✅ 已完成 | 2026-05-09 |
| 4 | 改 `packages/desktop/src/lib/tools.ts`：`@shared/tools.json` → `@aitools/shared`，删除 REGISTRY 中间变量直接用 TOOLS | ✅ 已完成 | 2026-05-09 |
| 5 | 删除 `packages/desktop/vite.config.ts` 的 `@shared` alias | ✅ 已完成 | 2026-05-09 |
| 6 | 删除 `packages/desktop/tsconfig.json` 的 `@shared/*` paths + `../shared/src` include | ✅ 已完成 | 2026-05-09 |
| 7 | `packages/cli/tsconfig.json`：`rootDir: "src"`、`include: ["src/**/*"]`（消除 PR-1 的过渡 hack） | ✅ 已完成 | 2026-05-09 |
| 8 | grep 验证：`@shared/` 仅剩注释；`../../../shared/src` 已全部清理（仅剩注释文本） | ✅ 已完成 | 2026-05-09 |
| 9 | `pnpm pack` 验证：tarball 仅 5 个文件（LICENSE + package.json + README + dist/index.js + map），不含 shared 目录 | ✅ 已完成 | 2026-05-09 |
| 10 | grep dist/index.js 验证：`readFileSync`/`resolveRegistryPath` 已删除；`claude-internal`/`codebuddy` 字符串 inline 成功 | ✅ 已完成 | 2026-05-09 |
| 11 | 回归测试：186 单测全绿；desktop vite build 通过；CLI 端到端（list/--json）正常 | ✅ 已完成 | 2026-05-09 |
| 12 | 更新 `CHANGELOG.md` 合并 PR-2 条目 | ✅ 已完成 | 2026-05-09 |
| 13 | PR-2 提交（本次 commit） | 🔵 待执行 | — |

> 状态图例：⬜ 待开始 | 🔵 进行中 | ✅ 已完成 | ⚠️ 有问题

---

## 变更记录

### 2026-05-09 - PR-2：契约重写（workspace 引用收敛）

**变更内容**：

完成"跨包引用"的最终收敛。在 PR-1 物理搬迁的基础上，把所有 shared 引用统一为 `@aitools/shared` workspace 包。

**关键改动 1：CLI 侧删除运行时 fs 加载**

重写 `packages/cli/src/registry/tools.ts`：
- 删除 `resolveRegistryPath()`（多候选路径探测）
- 删除 `MODULE_DIR` / `fileURLToPath` / `readFileSync` 运行时加载
- 改为 `import { TOOLS } from '@aitools/shared'`（编译期 inline）
- 所有公共 API 签名保持一致（`getAllTools` / `findTool` / `getLegacyAliases` 等），下游零感知

**关键改动 2：desktop 侧删除 alias**

- `packages/desktop/src/lib/tools.ts`：`@shared/tools.json` → `@aitools/shared`
- `packages/desktop/vite.config.ts`：删除 `@shared` alias 条目
- `packages/desktop/tsconfig.json`：删除 `@shared/*` paths 和 `../shared/src/**/*.ts` include

**关键改动 3：tsup noExternal 配置**

发现 PR-2 初次构建时 bundle 把 `@aitools/shared` 视为 external，导致 `npm link` 后 Node 运行 dist 时报 `ERR_UNKNOWN_FILE_EXTENSION`（试图 resolve 到 `.ts` 源码）。

修复：`packages/cli/tsup.config.ts` 加 `noExternal: ['@aitools/shared']`，强制 bundle workspace 包。

**关键改动 4：CLI tsconfig 清理 hack**

- `rootDir: "."` → `"src"`（PR-1 的过渡方案已不需要）
- `include: ["src/**/*", "../shared/src/**/*"]` → `["src/**/*"]`

**涉及文件**：
- ✏️ `packages/cli/src/registry/tools.ts` — 重写（- 173 行 + 167 行），删除 fs 加载，改为 import
- ✏️ `packages/cli/tsconfig.json` — 清理 hack（rootDir / include）
- ✏️ `packages/cli/tsup.config.ts` — 新增 `noExternal: ['@aitools/shared']`
- ✏️ `packages/desktop/src/lib/tools.ts` — 改 import 路径，删除 REGISTRY 中间变量
- ✏️ `packages/desktop/vite.config.ts` — 删除 `@shared` alias
- ✏️ `packages/desktop/tsconfig.json` — 删除 `@shared/*` paths 和 include
- ✏️ `packages/shared/src/index.ts` — 更新注释反映 PR-2 生效
- ✏️ `CHANGELOG.md` — 合并 PR-2 条目到 0.5.0

**Git Commit**：（待执行）

```
refactor(workspace): 跨包引用统一为 @aitools/shared workspace 包 (REFACTOR-001 PR-2)
```

**自测结果**：
- [x] `pnpm -F @aitools/cli build` 成功（50.72 KB）
- [x] `pnpm -F @aitools/cli test` 全绿（186/186）
- [x] `pnpm -F @aitools/desktop build` 前端构建成功
- [x] `pnpm pack` 产物仅 5 个文件（无 `shared/` 目录）
- [x] dist/index.js 内 `readFileSync`/`resolveRegistryPath` 引用数 = 0（已删除）
- [x] dist/index.js 内 `claude-internal` / `codebuddy` 字符串存在 = SSOT 内联成功
- [x] `aitools --version` / `aitools list skills` / `aitools --json list skills` 端到端正常

---

### 2026-05-09 - PR-1：物理搬迁 + workspace 骨架（commit 2788ca3）

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

**涉及文件**：详见 commit 2788ca3（221 文件变更，+1599 / -626）

**Git Commit**：2788ca3

**自测结果**：
- [x] `pnpm install` 成功，4 个 workspace 包识别正确
- [x] `pnpm -F @aitools/cli build` 成功（50.54 KB）
- [x] `pnpm -F @aitools/cli test` 全绿（186/186）
- [x] `pnpm -F @aitools/desktop build` 前端构建成功
- [x] `npm link` 重建全局 aitools 命令成功（pnpm link --global 失败已 fallback）
- [x] `aitools --version` 返回 0.5.0
- [x] `aitools list skills` / `aitools --json list skills` 端到端正常
- [x] `pnpm lint` 仅剩 1 条历史遗留 dead code 警告（遗留问题 L-1）

---

## 偏离记录

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| D-1 | PR-1 步骤 3：搬迁 CLI 配置时内部路径检查 | 实际一并修了 `registry/tools.ts` 的 `resolveRegistryPath()` 多候选路径、`tsconfig.json` 的 include、import type 的相对路径 | PR-1 要求"新结构能跑"，这些 SSOT 相关路径修正是必需前置条件；属实质过渡，PR-2 会彻底删除 |
| D-2 | 步骤 20 未更新 `docs/design-system/README.md` 等二级文档里的 `desktop/src/...` 引用 | 本 PR 暂不改 | 检查后发现设计系统文档基本不含绝对代码路径，影响面极小；如后续发现具体引用再单独处理 |
| D-3 | 步骤 19 未执行完整 `tauri:build`（只跑了 vite build） | 推迟到 PR-2 后的最终验收 | Tauri 完整打包耗时 3-5 分钟，本机已通过前端构建验证；PR-1 没动 Rust 端代码，风险极低 |
| D-4 | 根 `eslint.config.js` 原计划管全仓 JS/TS | 实际 ignores 加了 `packages/desktop/src`，desktop React 代码由 desktop 自己的 lint 处理 | 根 eslint 没装 react-hooks 插件，硬扫会报虚假错误；desktop 本来就有独立 tsconfig，lint 独立管理更合理 |
| D-5 | CLI 版本号 0.4.2 → 0.5.0 未在 03-technical.md 显式列出 | 一并改了 `packages/cli/src/index.ts:31` 的硬编码版本 | 方案里 package.json 版本定为 0.5.0，但 commander `.version()` 的硬编码也必须同步，否则 `aitools --version` 会继续返回 0.4.2 |
| D-6 | PR-2 步骤 2 未提及 tsup `noExternal` 配置 | 实际发现 tsup 默认把 workspace 包当 external，必须加 `noExternal: ['@aitools/shared']` 才能 inline | 编码过程中发现的 bundle 陷阱；风险 3 已预判"tsup 对 workspace 包解析失败"，本次是其实际兑现。方案里已提应对策略 |

---

## 遗留问题

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| L-1 | `packages/cli/src/commands/config.ts:25` 的 `getConfigDir` 是历史遗留 dead code，lint 报未使用 | 低 | 不阻塞本次重构；单独修复或整合到下次 cleanup 任务 |
| L-2 | `setup.sh` / `uninstall.sh` 在 pnpm 未配置全局 bin 目录时会降级到 npm link；本机实测 `pnpm link --global` 失败后回退 `npm link` 成功 | 低 | 脚本已自动 fallback，但可在 README 增加 pnpm setup 提示；非阻塞 |
| L-3 | PR-1/2 期间 Tauri 完整 `tauri:build` 未执行（仅 vite build 验证前端） | 低 | 验收阶段单独执行一次 tauri:build 做最终确认 |

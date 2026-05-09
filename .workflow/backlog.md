# Workflow Backlog（待启动任务备忘）

> 本文件存放**已识别但暂未启动**的任务，避免想法散落在聊天记录中丢失。
>
> **与 `tasks/` 的区别**：
> - `tasks/` 是 AI 主动扫描的活跃任务目录，进入后即占用计数器、推动状态机
> - `backlog.md` 仅作备忘，不占编号、不进入状态机
>
> **使用约定**：
> - 启动 backlog 中的任务时，按 workflow 流程"新建任务"指令正式创建，在此处划掉对应条目并保留链接
> - AI 在常规工作流中不会主动读取此文件；用户明确提到时再读

---

## 待启动任务

### REFACTOR-001：项目结构三段式重组

**记录日期**：2026-05-09
**触发任务**：FEAT-005 期间识别（讨论见 03-technical.md 决策记录）
**前置条件**：FEAT-005 上线后稳定一周，无回归

#### 现状问题

当前仓库根目录平铺：

```
AIToolsAssistant/
├── desktop/         ← GUI 工程（有自己的 package.json）
│   ├── src/
│   └── src-tauri/
├── src/             ← CLI 工程（与 GUI 同级，物理混乱）
│   ├── commands/
│   ├── core/
│   └── ...
├── tests/           ← CLI 测试（与 src/ 同级，进一步加重视觉混乱）
├── shared/          ← 公共契约（FEAT-005 引入）
└── package.json     ← CLI 的 package.json（root 位置语义模糊）
```

`desktop/` 与 `src/`、`tests/` 物理同级，但语义上 `src/`+`tests/` 才是 CLI 工程的一部分；当前结构让"CLI 工程"在视觉上失去边界，新进开发者第一眼看不出这是个三段式仓库（CLI + GUI + 公共契约）。

#### 目标结构

```
AIToolsAssistant/
├── cli/                       ← CLI 工程
│   ├── src/
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   ├── vitest.config.ts
│   └── eslint.config.js
├── gui/                       ← GUI 工程（沿用 desktop 语义，但更名为 gui 以保持命名对仗）
│   ├── src/
│   ├── src-tauri/
│   ├── package.json
│   └── ...
├── shared/                    ← 跨端公共契约
│   ├── tools.json
│   └── tools.schema.ts
├── docs/
├── .workflow/
├── README.md
├── CODEBUDDY.md
├── CLAUDE.md
├── setup.sh                   ← 顶层一键安装脚本（适配新结构）
└── pnpm-workspace.yaml        ← 可选：引入 workspace 简化依赖管理
```

#### 范围与原则

- **纯路径搬迁**，零功能变更（用 `git mv` 保留 history）
- 单 PR 落地，便于事故 revert
- 配套必须更新：
  - 所有构建脚本：`tsup.config.ts` / `vite.config.ts` / `tauri.conf.json` / `cargo.toml` / `setup.sh`
  - 所有测试配置：`vitest.config.ts` / 测试 import 路径
  - 所有 ESLint / Prettier / TypeScript 配置：`include` / `rootDir` / `paths`
  - 所有文档引用：`README.md` / `CODEBUDDY.md` / `CLAUDE.md` / `docs/**` / `.workflow/archived/**` 内的代码路径引用
  - SSOT 路径：`shared/tools.json` 的相对路径在 `cli/src/registry/tools.ts` 与 `gui/src/lib/tools.ts` 都要重新计算
  - npm 发布元信息：`bin` 入口指向 `cli/dist/index.js`

#### 风险与应对

| 风险 | 应对 |
|---|---|
| `git blame` history 跟踪丢失 | 全部用 `git mv` 而非删除+新建；评估 `git log --follow` 在新路径下是否能跟踪 |
| 全局已安装的旧版 `aitools` 命令链接到旧路径 | 在 setup.sh 中加入清理步骤；CHANGELOG 醒目说明 |
| `.workflow/archived/` 内大量 `src/...` 路径引用失效 | 重构 PR 内一并 sed 批量替换；保留 archived 文档时间戳不变 |
| Tauri 项目对 src-tauri 路径硬依赖 | 审查 `tauri.conf.json` 中的 `frontendDist` / `beforeDevCommand` / `beforeBuildCommand` |
| 协作方（如有）未拉取最新代码导致冲突 | 选择 main 分支无活跃 PR 的窗口期合并 |

#### 验收标准

- `pnpm -C cli build` 通过且产物可执行
- `pnpm -C cli test` 全绿
- `pnpm -C gui dev` 正常启动 Tauri 开发模式
- `pnpm -C gui build` 产出 Tauri 安装包
- `bash setup.sh` 一键安装通过
- 全文 grep 无遗漏的旧路径引用
- 至少一周内无相关 issue / 回归

#### 不在范围（避免无限扩张）

- 不做依赖升级
- 不做 ESM/CJS 转换
- 不引入 monorepo 工具（turbo / nx / lerna）—— pnpm workspace 已足够
- 不变更任何业务逻辑
- 不改 Rust 端代码组织

#### 启动方式

FEAT-005 完成归档后，用户主动触发"新建任务 REFACTOR-001"指令，此条目划掉。

---

<!-- 后续待启动任务在此追加 -->

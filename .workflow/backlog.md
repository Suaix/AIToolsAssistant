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

### ~~REFACTOR-001：项目结构三段式重组~~ ✅ 已启动

> **已于 2026-05-09 正式创建任务，见 `.workflow/tasks/REFACTOR-001-项目结构三段式重组/`**
> 启动后决策有若干更新（pnpm workspace + `@aitools` scope 统一命名），详见任务内 `manifest.yaml` 的 decisions。

**原登记内容（保留备查）**：

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

### ~~BUG-001：迁移测试污染用户家目录 + GUI 缺陷弹窗陈旧记录~~ ✅ 已完成

> **已于 2026-05-11 在 FIX-001 中完成（实际方案为对齐 `os.homedir` spy 惯用法，非 backlog 设想的环境变量方案）**
> 详见 `.workflow/archived/FIX-001-迁移测试隔离与GUI陈旧弹窗清理/`

**原登记内容（保留备查）**：

**记录日期**：2026-05-09
**触发场景**：FEAT-005 验收后启动 desktop，弹出"配置已自动升级"，但 `backupPath` 指向 `/var/folders/.../T/aitools-migration-test-xxx/`（vitest 临时夹具）
**影响等级**：中（不阻塞功能，但破坏 US-6「aitools 不应在测试时影响用户家目录」原则，且 GUI 显示误导信息）

#### 根因分析

1. **测试隔离缺陷**：`src/config/migrations/index.ts:persistLastMigration()` 调用 `os.homedir()` 直写 `~/.aitools/.last-migration.json`；vitest 跑迁移调度器测试时未隔离该写入路径，污染了真实用户家目录
2. **GUI 防御缺失**：`desktop/src/App.tsx` 启动时读取 `.last-migration.json` 未校验 `backupPath` 文件是否仍存在；陈旧记录（备份已被 tmp 清理 / 用户主动删除）也会触发弹窗

#### 修复方向

**修复 1：测试隔离（CLI 侧）**
- 方案 A（推荐）：将 `lastMigrationPath()` 改为读取环境变量 `AITOOLS_LAST_MIGRATION_PATH` 优先，未设置时才回退到 `~/.aitools/.last-migration.json`；vitest setup 文件统一注入指向 fixture 目录的环境变量
- 方案 B：把 `persistLastMigration` 抽成依赖注入参数，测试传 noop 或 fixture writer
- 方案 C：在 `migrateConfigDispatch` 增加 `options.persistLastMigration?: boolean` 开关，测试默认关闭

**修复 2：GUI 陈旧校验（desktop 侧）**
- 读取 `.last-migration.json` 后用 Tauri `read_text_file_optional` 探测 `backupPath` 是否存在
- 不存在 → 视为陈旧记录，静默删除 `.last-migration.json`，不弹窗
- 存在 → 正常弹窗（当前逻辑）

#### 验收标准

- 跑完 `pnpm test` 后 `~/.aitools/.last-migration.json` 不应出现（测试不污染家目录）
- 手动构造 `.last-migration.json` 但 `backupPath` 指向不存在的路径，启动 desktop 不应弹窗，且文件被清理
- 增加单测覆盖：陈旧记录 → 不弹窗；有效记录 → 正常弹窗

#### 启动方式

非紧急，FEAT-005 / REFACTOR-001 之后或下次接触迁移代码时合并处理。

---

### REFACTOR-002（候选）：核心业务逻辑抽离为 @aitools/core 共享包

**记录日期**：2026-05-09
**触发任务**：REFACTOR-001 期间评估"内置 vs 分离"架构选择时识别（详见 REFACTOR-001 的 03-technical.md TD-12 备选方案）
**性质**：候选任务（条件触发，非必做）

#### 背景

REFACTOR-001 确立的架构（CLI 独立部署 + desktop 通过 Tauri 子进程调用 `aitools`）有两个潜在演进方向：

- **X1**：webview 直接 import core 业务函数（需把 IO 改造为依赖注入风格）
- **X1-reverse**：抽出 `@aitools/core` 包，让 CLI 和 desktop 平级消费

REFACTOR-001 评估后认为本期不做（详见 TD-12），但保留为未来候选。

#### 触发条件（任一成立即可启动评估）

1. **性能痛点**：desktop 用户实测反馈"同步进度卡顿、子进程启动慢"，profiling 确认子进程冷启动 ≥ 200ms 成为瓶颈
2. **第三个消费场景**：出现 web 版、VSCode 扩展、Cursor 扩展等需要复用业务逻辑的形态
3. **测试痛点**：core 业务逻辑稳定后想做大规模单元测试，发现跨进程 mock 困难
4. **类型安全痛点**：desktop 端 NDJSON 解析后的类型断言频繁出错或维护负担过重

#### 备选方案

| 编号 | 方案 | 改动量 | 适用条件 |
|------|------|--------|----------|
| Plan A | X1-reverse：抽出 `@aitools/core`，前端通过 IOAdapter + Rust fs commands 桥接 | 55-80h | 触发条件 1/2/3/4 任一 |
| Plan B | X2 sidecar：Tauri 内嵌 node + cli.js，desktop 单文件分发 | 20-30h | 仅触发条件"非技术用户希望零依赖安装" |
| Plan C | 现状（Y）+ 增量优化：保留子进程模式，但优化冷启动（如长驻 daemon） | 10-15h | 触发条件 1，但不想做大重构 |

#### 评估时机

不做时间硬约束，按触发条件响应启动。建议每 3 个月回顾一次是否满足任一触发条件。

#### 启动方式

满足任一触发条件后，由用户主动触发"新建任务 REFACTOR-002"，本条目划掉。

---

<!-- 后续待启动任务在此追加 -->

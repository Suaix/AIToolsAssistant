# 需求文档：项目结构三段式重组（pnpm workspace + @aitools scope）

> **任务编号**：REFACTOR-001
> **创建日期**：2026-05-09
> **状态**：草稿

---

## 1. 背景与目标

### 1.1 背景

当前仓库根目录平铺 `src/` `tests/` `desktop/` `shared/` 四个顶层目录，但它们语义不对等：

- `src/` + `tests/` + 根 `package.json` 共同构成 CLI 工程（发布产物 `aitools-cli`）
- `desktop/` 是独立的 Tauri 工程（`aiflux-desktop`，未发版）
- `shared/` 是 FEAT-005 引入的跨端公共契约，被 CLI 相对路径引用 + desktop Vite alias 两套机制访问

根因：仓库根 `package.json.name` 是 `aitools-cli`——也就是"根目录 = CLI 包"，desktop 看似附属物但语义上应平级，shared 则完全没有包身份。由此引发四个具体问题：

1. **视觉结构模糊**：新进开发者第一眼看不出这是三段式仓库
2. **npm 发布污染**：`files: ["dist", "shared"]` 把 shared 目录整个拖进 npm 包
3. **shared 引用双轨**：CLI 用 `../shared/` 相对路径 + `rootDir: "."` tsconfig hack；desktop 用 `@shared/*` vite alias。两套机制心智割裂
4. **依赖安装割裂**：clone 后 `pnpm install` 只装 CLI 依赖，desktop 还得 `cd desktop && pnpm install`

FEAT-005 期间识别该问题，拆分为独立任务 REFACTOR-001 跟进（见 `.workflow/archived/FEAT-005-.../03-technical.md` 决策记录）。

### 1.2 目标

1. **结构清晰**：引入 pnpm workspace + `packages/` 顶层目录，使 CLI / desktop / shared 三者物理对等
2. **契约正规化**：shared 升格为 workspace 包 `@aitools/shared`，CLI 与 desktop 通过统一的包引用而非相对路径
3. **发布干净**：`@aitools/cli` 的 npm 包产物仅含 `dist/`，shared 通过 tsup bundle 内联进单文件
4. **命名成体系**：统一 `@aitools` scope（`@aitools/cli` / `@aitools/shared` / `@aitools/desktop`），为未来扩展端（web/vscode-ext 等）留空间

**纯技术重构**：零功能变更、零 UX 变更，用户 `aitools` 命令行为完全一致。

---

## 2. 用户故事

> 本任务为纯技术重构，"用户"包括：
> - 开发者自己（本项目唯一 contributor）
> - 未来协作者（若开源）
> - CI / 构建流水线

| 编号 | 用户故事 | 优先级 |
|------|---------|--------|
| US-1 | 作为开发者，我希望在仓库根执行一次 `pnpm install` 就装齐 CLI + desktop + shared 三端依赖，以便快速启动开发环境 | P0 |
| US-2 | 作为开发者，我希望 CLI 与 desktop 通过 `import from '@aitools/shared'` 引用共享契约，以便消除相对路径与 vite alias 两套机制 | P0 |
| US-3 | 作为开发者，我希望 `@aitools/cli` 发布到 npm 的产物只包含 `dist/`，以便包体积最小、发布内容语义清晰 | P0 |
| US-4 | 作为开发者，我希望在仓库根敲 `pnpm -r build` / `pnpm -r test` 就能按依赖图顺序执行全部包的构建和测试，以便简化 CI 配置 | P1 |
| US-5 | 作为开发者，我希望 `git mv` 搬迁后 `git log --follow` 仍能追溯文件历史，以便保留 blame 价值 | P1 |
| US-6 | 作为开发者，我希望重构拆为两个 PR（先物理搬迁，后契约重写），以便任一步出问题可独立 revert | P0 |
| US-7 | 作为产品维护者，我希望 `aitools` 命令行的行为（子命令、参数、输出）零变化，以便重构无感知 | P0 |

---

## 3. 功能范围

### 3.1 包含（In Scope）

**PR-1：物理搬迁 + workspace 骨架**
- [ ] 新建 `pnpm-workspace.yaml` 声明 `packages/*`
- [ ] `git mv src tests` → `packages/cli/`，配置（`tsup.config.ts` / `vitest.config.ts` / `tsconfig.json` / `eslint.config.js`）同步搬迁
- [ ] `git mv desktop` → `packages/desktop/`
- [ ] `git mv shared` → `packages/shared/src/`，新建 `packages/shared/package.json`（name: `@aitools/shared`，private）、`tsconfig.json`、`index.ts` 聚合导出
- [ ] 重命名 CLI 包：`aitools-cli` → `@aitools/cli`
- [ ] 重命名 desktop 包：`aiflux-desktop` → `@aitools/desktop`
- [ ] 根 `package.json` 改为伞包（name: `aitools-workspace`, private, 无 dependencies 仅 devDependencies 与聚合 scripts）
- [ ] 更新 `setup.sh` / `uninstall.sh` 适配新路径
- [ ] 更新 `CODEBUDDY.md` / `CLAUDE.md` / `README.md` / `docs/` 内所有代码路径引用
- [ ] 更新 `.workflow/archived/**` 内的路径文本（sed 批量替换）

**PR-2：契约重写**
- [ ] CLI 源码 `import from '../../shared/tools.json'` → `import from '@aitools/shared'`
- [ ] desktop 源码移除 `@shared/*` vite alias，统一用 `@aitools/shared`
- [ ] 删除 CLI `tsconfig.json` 的 `rootDir: "."` hack，恢复 `rootDir: "src"`
- [ ] 配置 TS Project References（`packages/cli/tsconfig.json` 与 `packages/desktop/tsconfig.json` 引用 `packages/shared`）
- [ ] 验证 CLI npm 发布产物（`pnpm -F @aitools/cli pack`）仅包含 `dist/`，shared 被 tsup bundle 内联

### 3.2 不包含（Out of Scope）

- ❌ 不做依赖升级（React / Vite / Tauri / TypeScript 版本冻结）
- ❌ 不做 ESM/CJS 转换
- ❌ 不引入重型 monorepo 工具（turbo / nx / lerna）——pnpm workspace 已足够
- ❌ 不变更任何业务逻辑 / UI / 用户体验
- ❌ 不改 Rust 端（`src-tauri/`）代码组织
- ❌ 不处理 npm 旧包 `aitools-cli`（已核实未发布）
- ❌ 不同步更新 BUG-001（迁移测试隔离）——独立处理

---

## 4. 验收标准（Acceptance Criteria）

### US-1 验收标准（一次 pnpm install 装齐）

- [ ] **Given** 全新 clone 的仓库 **When** 在仓库根执行 `pnpm install` **Then** `packages/cli/node_modules/` `packages/desktop/node_modules/` `packages/shared/node_modules/` 都已安装完成
- [ ] **Given** 已安装完成的仓库 **When** 执行 `pnpm -r build` **Then** 三个包均成功构建且退出码为 0

### US-2 验收标准（统一 workspace 引用）

- [ ] **Given** `packages/cli/src/**/*.ts` **When** grep `'\.\./\.\./shared'` 或 `'\.\./shared'` **Then** 匹配结果为 0
- [ ] **Given** `packages/desktop/src/**/*.tsx` **When** grep `'@shared/'` **Then** 匹配结果为 0
- [ ] **Given** `packages/desktop/vite.config.ts` **When** 查看 resolve.alias **Then** 不包含 `@shared` 条目
- [ ] **Given** `packages/cli/tsconfig.json` **When** 查看 **Then** `rootDir` 为 `src`，`include` 不含 `../shared`

### US-3 验收标准（发布产物干净）

- [ ] **Given** `packages/cli` **When** 执行 `pnpm pack` **Then** 生成的 tarball 内**仅**包含 `dist/` + `package.json` + `README.md` + `LICENSE`
- [ ] **Given** 解压后的 tarball **When** 查看 `dist/index.js` **Then** shared 的内容已被 tsup bundle 内联（不存在 `require('@aitools/shared')` 运行时引用）

### US-4 验收标准（聚合命令）

- [ ] **Given** 仓库根 **When** 执行 `pnpm -r build` **Then** 按 `shared → cli → desktop` 依赖顺序执行（shared 先完成）
- [ ] **Given** 仓库根 **When** 执行 `pnpm -r test` **Then** CLI 的 186 个测试全绿
- [ ] **Given** 仓库根 **When** 执行 `pnpm -r lint` **Then** 无 error

### US-5 验收标准（git history 保留）

- [ ] **Given** `packages/cli/src/index.ts` **When** 执行 `git log --follow packages/cli/src/index.ts` **Then** 能看到该文件在原 `src/index.ts` 路径下的全部历史 commit

### US-6 验收标准（两 PR 可独立 revert）

- [ ] **Given** PR-1 已合并 **When** PR-2 尚未合并 **Then** 仓库处于"新结构但旧引用"的可运行状态（所有命令工作）
- [ ] **Given** PR-2 出现问题 **When** 执行 `git revert <PR-2 merge commit>` **Then** 仓库回到 PR-1 的状态且所有命令工作

### US-7 验收标准（CLI 行为零变化）

- [ ] **Given** 重构前后 **When** 对同一个测试工程执行 `aitools init` / `aitools list` / `aitools sync` / `aitools subscribe` / `aitools unsubscribe` **Then** 输出（stdout / stderr / 退出码 / 生成的配置文件内容）完全一致
- [ ] **Given** desktop 应用 **When** 启动并执行全部已有功能 **Then** 行为与重构前完全一致

---

## 5. 非功能性需求

| 维度 | 要求 |
|------|------|
| 性能 | 不劣化：CLI 冷启动 < 重构前 + 10ms；desktop 首屏加载 < 重构前 + 100ms |
| 构建时间 | `pnpm -r build` 总耗时 ≤ 重构前 CLI + desktop 各自构建之和 × 1.2 |
| 兼容性 | Node.js ≥ 20（保持），pnpm ≥ 9（workspace 功能要求） |
| 可维护性 | shared 新增字段时，CLI 与 desktop 均能通过 TS 编译自动感知类型变化 |
| 可回滚 | 每个 PR 独立可 revert，不需要手工修复 |

---

## 6. 约束与依赖

**技术约束**
- 必须使用 `git mv` 保留文件历史
- 必须兼容现有 FEAT-005 已落地的 SSOT 机制（`tools.json` 的数据结构不变）
- tsup / vite / tauri / vitest 的版本冻结
- 测试夹具路径（`tests/fixtures/`）的绝对引用需跟随搬迁同步更新

**外部依赖**
- pnpm workspace（已有 `pnpm-lock.yaml`，已在用 pnpm）
- 无新增外部依赖包

**时间约束**
- 纸面阶段（ANALYSIS / DESIGN / TECHNICAL）立即可做
- 编码阶段在 FEAT-005 本地自测通过 2-3 天（约 2026-05-11 之后）启动
- PR-1 与 PR-2 之间至少间隔 24h 观察期

---

## 7. 开放问题

| 编号 | 问题 | 状态 | 结论 |
|------|------|------|------|
| Q-1 | `@aitools` scope 在 npmjs.com 上注册组织是否一定成功？ | 已关闭 | 不关注：已检测 registry.npmjs.org 该 scope 未被使用（`total:0`）；注册一步待真正发布时再做，不阻塞重构 |
| Q-2 | `@aitools/desktop` 是否需要发布到 npm？ | 已拍板 | **不发布**：保持 `private: true`，仅作 workspace 内部包引用 |
| Q-3 | CLI 包的 `bin` 命令名 `aitools` 是否改名？ | 已拍板 | **不改**，保持 `aitools`——`bin` 字段与包名 `@aitools/cli` 无关，用户无感 |
| Q-4 | setup.sh 是否需要同步适配 pnpm workspace 的全局安装方式？ | 待 TECHNICAL | 涉及具体命令选型（pnpm link 还是 npm link、是否继续使用 setup.sh），放 TECHNICAL 阶段决策 |
| Q-5 | `.workflow/archived/FEAT-*` 文档里旧路径（如 `src/...`）是否必须批量替换？ | 已拍板 | **不替换**：归档文档代表历史事实，保持原样；在 CODEBUDDY.md 加一段说明即可 |
| Q-6 | 是否需要在根 `package.json` 配置 `preinstall` 钩子强制 pnpm？ | 已拍板 | **需要**：加 `"preinstall": "npx only-allow pnpm"`，防止误用 npm/yarn 破坏 workspace |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建（基于 FEAT-005 期间讨论 + 架构建议讨论） | AI + 用户 |
| 2026-05-09 | 关闭开放问题 Q-1 / Q-2 / Q-5 / Q-6，Q-4 保留到 TECHNICAL | AI + 用户 |

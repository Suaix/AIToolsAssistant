# 技术方案：项目结构三段式重组（pnpm workspace + @aitools scope）

> **任务编号**：REFACTOR-001
> **创建日期**：2026-05-09
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)（已跳过，见该文件说明）
> **状态**：草稿

---

## 1. 概述

### 1.1 技术目标

1. 将仓库由"CLI 工程 + desktop 附属 + shared 裸目录"的平铺结构，重构为 pnpm workspace 驱动的三段式 monorepo（`packages/cli` / `packages/desktop` / `packages/shared`）
2. 包命名统一为 `@aitools` scope，消除根 `package.json` 身份冲突
3. 跨端共享契约由"相对路径 + Vite alias 两套机制"收敛为"单一 workspace 包引用 `@aitools/shared`"

### 1.2 技术约束

- Node.js ≥ 20、pnpm ≥ 9（workspace protocol `workspace:*` 要求）
- 框架版本冻结：React 18、Vite 5、Tauri 2、tsup 8、vitest 2、TypeScript 5
- 必须使用 `git mv` 保留文件历史
- FEAT-005 的 SSOT 机制不可破坏（`tools.json` 数据结构、CLI 运行时加载、desktop 编译期 inline 三者语义保持）
- CLI 全局安装命令 `aitools` 的外部行为完全一致

---

## 2. 架构设计

### 2.1 整体架构

#### 目标仓库拓扑

```
AIToolsAssistant/
├── packages/
│   ├── cli/                    ← 原 src/ + tests/（物理搬迁）
│   ├── desktop/                ← 原 desktop/（物理搬迁）
│   └── shared/                 ← 原 shared/（升格为 workspace 包）
├── docs/                       ← 不动
├── .workflow/                  ← 不动
├── pnpm-workspace.yaml         ← 新增
├── package.json                ← 伞包（aitools-workspace）
├── CODEBUDDY.md / CLAUDE.md    ← 更新路径引用
├── README.md                   ← 更新路径引用
├── setup.sh / uninstall.sh     ← 适配新路径（TECHNICAL Q-4 已拍板）
└── LICENSE                     ← 不动
```

#### 依赖拓扑

```
                    ┌────────────────────┐
                    │  @aitools/shared    │  ← 叶子节点（纯类型 + 纯 JSON）
                    │   (private)         │
                    └────────┬────────────┘
                             │ workspace:*
          ┌──────────────────┴──────────────────┐
          ▼                                     ▼
┌────────────────────┐                ┌────────────────────┐
│  @aitools/cli       │                │  @aitools/desktop   │
│  (public, bin)      │                │  (private)          │
│  tsup bundle inline │                │  vite bundle inline │
└────────────────────┘                └────────────────────┘
```

- `@aitools/shared` 是唯一零依赖的"根"，被 cli 和 desktop 同时依赖
- `pnpm -r build` 拓扑排序后先构建 shared（其实 shared 纯类型 + JSON 不需要构建步骤，但 pnpm 会跳过没有 `build` 脚本的包）
- cli 与 desktop 互不依赖，可并行构建

### 2.2 目录结构（详细）

#### `packages/cli/` （原 src/ + tests/ 搬迁）

```
packages/cli/
├── src/                        ← git mv ../../src/ src/
│   ├── index.ts
│   ├── commands/
│   ├── config/
│   ├── core/
│   ├── registry/               ← 内含 tools.ts，需改 import
│   ├── types/
│   └── utils/
├── tests/                      ← git mv ../../tests/ tests/
│   ├── registry/
│   ├── config/
│   └── ...
├── dist/                       ← 构建产物（gitignore）
├── package.json                ← name: "@aitools/cli"
├── tsconfig.json               ← rootDir: "src"（不再跨包 include）
├── tsup.config.ts              ← entry: "src/index.ts"
├── vitest.config.ts            ← include: "tests/**"
├── README.md                   ← 原根 README 的 CLI 部分拆分过来
└── LICENSE                     ← 软链或复制（npm 要求）
```

#### `packages/desktop/` （原 desktop/ 直接搬迁）

```
packages/desktop/
├── src/                        ← 不变
├── src-tauri/                  ← 不变（Rust 侧代码不动）
├── package.json                ← name: "@aitools/desktop"
├── tsconfig.json               ← paths 更新：@shared/* 指向 workspace 包
├── vite.config.ts              ← 移除 @shared alias（PR-2 生效）
└── ...
```

#### `packages/shared/`（升格为包）

```
packages/shared/
├── src/
│   ├── index.ts                ← 新增聚合导出：export * from './tools.schema'; export { default as TOOLS } from './tools.json' with { type: 'json' };
│   ├── tools.json              ← git mv ../../shared/tools.json src/tools.json
│   └── tools.schema.ts         ← git mv ../../shared/tools.schema.ts src/tools.schema.ts
├── package.json                ← 见 3.2 package.json schema
└── tsconfig.json               ← 仅声明，不输出
```

---

## 3. 接口定义

### 3.1 workspace 包引用契约

PR-2 完成后，跨包引用**只有一种**形式：

```typescript
/* @aitools/cli 内部引用 */
import { TOOLS, type ToolDefinition, type ToolsRegistry } from '@aitools/shared';

/* @aitools/desktop 内部引用 */
import { TOOLS, type ToolDefinition, type ToolsRegistry } from '@aitools/shared';
```

**废除的引用形式**（PR-2 验收时 grep 应为 0 命中）：
- `import ... from '../../shared/tools.schema.js'`
- `import ... from '@shared/tools.json'`
- `import ... from '@shared/tools.schema'`

### 3.2 package.json schema（三个包）

#### `packages/shared/package.json`

```json
{
  "name": "@aitools/shared",
  "version": "0.5.0",
  "description": "AIToolsAssistant 跨端公共契约（SSOT）",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./tools.json": "./src/tools.json"
  },
  "files": ["src"]
}
```

**关键设计**：
- `main` 与 `types` 直接指向 `.ts` 源码——因为 CLI 用 tsup bundle 时能直接处理 ts 源码；desktop 用 Vite 同理。**不需要预编译 dist**，简化维护
- `exports` 的 `"./tools.json"` 子路径保留，以备需要 Rust 端 `include_str!` 或其他脚本直接读文件的场景
- `files: ["src"]` 为未来万一要 publish 做准备（当前 private，不 publish）

#### `packages/cli/package.json`

```json
{
  "name": "@aitools/cli",
  "version": "0.5.0",
  "description": "AI Agent 统一配置与资源同步管理工具（skills/commands/agents/rules）· 支持 --json 输出供 GUI 消费",
  "type": "module",
  "bin": {
    "aitools": "./dist/index.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "node ./dist/index.js",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "engines": { "node": ">=20.0.0" },
  "dependencies": {
    "@aitools/shared": "workspace:*",
    "@inquirer/prompts": "^7.0.0",
    "commander": "^13.0.0",
    "picocolors": "^1.1.0",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

**关键变化**：
- `name` 改为 `@aitools/cli`；`bin.aitools` 命令名不变
- `files: ["dist"]` **不再**包含 `shared`——tsup bundle 会把 `@aitools/shared` 内联进 `dist/index.js`
- `workspace:*` 在 `pnpm publish` 时会被自动替换为发布时的具体版本号（pnpm 原生能力）
- ESLint / Prettier 这些共享工具移到**根 devDependencies**

#### `packages/desktop/package.json`

```json
{
  "name": "@aitools/desktop",
  "version": "0.1.0",
  "description": "AIToolsAssistant 桌面应用 · 你写一次，它到处都在",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "@aitools/shared": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "lucide-react": "^0.454.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.10"
  },
  "engines": { "node": ">=20.0.0" }
}
```

#### 根 `package.json`（伞包）

```json
{
  "name": "aitools-workspace",
  "version": "0.5.0",
  "description": "AIToolsAssistant monorepo 根（CLI + desktop + shared）",
  "private": true,
  "type": "module",
  "scripts": {
    "preinstall": "npx only-allow pnpm",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint .",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx}\"",
    "cli": "pnpm -F @aitools/cli",
    "desktop": "pnpm -F @aitools/desktop"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript-eslint": "^8.0.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

**关键变化**：
- 根包 `private: true`，**不发 npm**
- `preinstall` 强制 pnpm（Q-6 拍板）
- ESLint / Prettier / TypeScript 提升到根 devDependencies，全仓共享
- `pnpm -F @aitools/cli <cmd>` 作为子包命令的快捷入口

### 3.3 `pnpm-workspace.yaml`

```yaml
# pnpm workspace 声明
# 文档：https://pnpm.io/pnpm-workspace_yaml
packages:
  - "packages/*"
```

---

## 4. 数据模型

### 4.1 `@aitools/shared` 包导出

```typescript
/* packages/shared/src/index.ts */

/**
 * 跨端公共契约（SSOT）聚合入口
 *
 * 消费方：
 *   - @aitools/cli：通过 tsup bundle 内联
 *   - @aitools/desktop：通过 Vite 编译期 inline
 *
 * 数据源：同目录 tools.json（唯一真相源）
 */

import toolsJson from './tools.json' with { type: 'json' };
import type { ToolsRegistry } from './tools.schema.js';

/* 类型重导出 */
export type { ToolDefinition, ToolsRegistry } from './tools.schema.js';

/**
 * SSOT 数据（编译期 inline，运行时零 IO）
 *
 * 注意：返回强类型的 ToolsRegistry，而非泛型 unknown；
 * 消费方无需再做类型断言（FEAT-005 改进点）
 */
export const TOOLS: ToolsRegistry = toolsJson as ToolsRegistry;
```

**SSOT 加载方式的变更（与 FEAT-005 对比）**：

| 维度 | FEAT-005 实现 | REFACTOR-001 实现 |
|---|---|---|
| CLI 加载 | `fs.readFileSync(resolveRegistryPath())` + 多候选路径探测 | `import { TOOLS } from '@aitools/shared'`，tsup bundle 内联 |
| desktop 加载 | `import toolsJson from '@shared/tools.json'` + alias | `import { TOOLS } from '@aitools/shared'`，Vite resolve |
| 产物体积 | CLI 包含独立 `shared/tools.json` 文件 | CLI 单文件 `dist/index.js` 内联 JSON，更小 |
| 路径解析风险 | `resolveRegistryPath()` 需维护多候选 fallback | 消除，标准 Node 模块解析 |

⚠️ **import attributes 的 Node 版本要求**：`with { type: 'json' }` 语法是 Node 22 才稳定的，当前 engines 是 Node 20。为避免硬依赖 22，**shared 包导出时不用 attributes 语法**，而是通过 TypeScript 的 `resolveJsonModule: true` + `import toolsJson from './tools.json'`（无 attributes）的经典方式。这种方式 tsup 与 Vite 均能正确处理。

### 4.2 `packages/shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist-types",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src"]
}
```

**关键点**：`noEmit: true` + `main: "./src/index.ts"`——shared 不输出任何编译产物，由消费方（tsup / Vite）负责打包。最简。

### 4.3 `packages/cli/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**关键变化**：
- `rootDir: "src"`（不再是 `.`），消除 FEAT-005 的 hack
- `include` 不再包含 `shared/**/*`——workspace 包会通过 node_modules 解析
- 独立的 `tsconfig.test.json`（或 vitest.config 直接覆盖）处理 tests/ 编译

### 4.4 `packages/desktop/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@design-system/*": ["../../docs/design-system/*"]
    }
  },
  "include": ["src"]
}
```

**关键变化**：
- 删除 `@shared/*` paths 条目
- 删除 `"../shared/**/*.ts"` include
- `@design-system/*` 相对路径由 `../docs/...` 改为 `../../docs/...`（深了一层）
- `@aitools/shared` 由 pnpm workspace 自动解析到 `packages/shared/`

### 4.5 `packages/desktop/vite.config.ts`（PR-2 变更）

```typescript
/* 保留的 alias */
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@design-system': path.resolve(__dirname, '../../docs/design-system'),
    /* '@shared' 条目删除——由 pnpm workspace + @aitools/shared 包解析 */
  },
},

/* Vite 访问设计系统的路径更新 */
server: {
  port: 1420,
  strictPort: true,
  fs: {
    allow: [path.resolve(__dirname, '../..')],  /* 仓库根 */
  },
},
```

---

## 5. 影响范围分析

### 5.1 修改的现有文件（按影响程度排序）

#### 高影响

| 文件 | 修改内容 | 原因 |
|---|---|---|
| `src/registry/tools.ts` | 重写 SSOT 加载逻辑：fs.readFileSync → `import { TOOLS } from '@aitools/shared'` | 核心变更点，所有下游函数简化 |
| `src/config/migrations/v0.4-to-v0.5.ts` | import 路径改为 `@aitools/shared` | 消费 legacy 映射 |
| `src/config/migrations/relocate-legacy-dirs.ts` | import 路径改为 `@aitools/shared` | 同上 |
| `desktop/src/lib/tools.ts` | 去掉 `@shared/*` 引用，统一改为 `@aitools/shared` | PR-2 核心收敛点 |
| `desktop/vite.config.ts` | 删除 `@shared` alias；fs.allow 路径深一层 | 配套 |
| `desktop/tsconfig.json` | 删除 `@shared/*` paths + `../shared` include；`@design-system` 路径深一层 | 配套 |
| `根 package.json` → 新建 `packages/cli/package.json` | 搬迁 + 改名 + 删除 `files: ["shared"]` | workspace 重组 |
| `desktop/package.json` → `packages/desktop/package.json` | 搬迁 + 改名 + 加 `@aitools/shared` workspace 依赖 | workspace 重组 |
| `tsconfig.json` → `packages/cli/tsconfig.json` | 搬迁 + 简化 rootDir/include | 消除 FEAT-005 hack |
| `tsup.config.ts` → `packages/cli/tsup.config.ts` | 搬迁；entry 路径相对新位置不变 | 搬迁 |
| `vitest.config.ts` → `packages/cli/vitest.config.ts` | 搬迁；include 不变 | 搬迁 |
| `eslint.config.js` | 保留在根，调整 `ignores` 包含 `packages/*/dist`、`packages/*/node_modules`、`packages/desktop/src-tauri/target` | 全仓共用 |
| `setup.sh` | 适配新路径：`cd packages/cli && pnpm build && pnpm link --global` | Q-4 拍板：继续使用 setup.sh |
| `uninstall.sh` | 适配新路径 | 同上 |

#### 中影响

| 文件 | 修改内容 | 原因 |
|---|---|---|
| `CODEBUDDY.md` | 项目结构段落重写；新增"归档文档保留历史路径"说明 | Q-5 拍板配套 |
| `CLAUDE.md` | 同步更新 | 双份镜像 |
| `README.md` | 项目结构段落重写；安装说明路径更新 | 对外门面 |
| `docs/design-system/README.md` 等 | 如有引用 `desktop/src/...` 绝对路径，改为 `packages/desktop/src/...` | 路径引用 |
| `.gitignore` | 追加 `packages/*/dist`、`packages/*/node_modules`，保留原有 | 新路径 |

#### 低影响

| 文件 | 修改内容 | 原因 |
|---|---|---|
| `CHANGELOG.md` | 新增 v0.5.0 条目说明结构重组 | 版本记录 |
| `devlog.md` | 追加 REFACTOR-001 记录 | 开发日志 |

### 5.2 新增文件

| 文件 | 用途 |
|---|---|
| `pnpm-workspace.yaml` | workspace 声明 |
| `packages/shared/package.json` | shared 包元信息 |
| `packages/shared/tsconfig.json` | shared TS 配置 |
| `packages/shared/src/index.ts` | shared 聚合导出 |
| `packages/cli/README.md` | CLI 子包 README（从根 README 拆分） |
| `packages/cli/LICENSE` | CLI 子包 LICENSE（复制根 LICENSE，npm 发布必需） |

### 5.3 依赖变更

| 包名 | 变更类型 | 版本 | 原因 |
|---|---|---|---|
| `@aitools/shared`（workspace） | 新增 | `workspace:*` | cli 与 desktop 依赖 shared workspace 包 |
| 根 `prettier` / `eslint` / `@eslint/js` / `typescript-eslint` | 搬迁 | 不变 | 从 CLI 的 devDependencies 提到根 devDependencies |
| `aitools-cli` 名称 | 改名 | 0.4.2 → 0.5.0 | 重命名为 `@aitools/cli`，版本跟进（破坏性变更） |
| `aiflux-desktop` 名称 | 改名 | 0.1.0 保留 | 重命名为 `@aitools/desktop` |

**无新增外部 npm 包**（pnpm workspace 是 pnpm 内置能力）。

### 5.4 不受影响的文件（确认保持不变）

- `shared/tools.json` 的**数据内容**（仅物理位置变为 `packages/shared/src/tools.json`）
- `shared/tools.schema.ts` 的**类型定义**（同上）
- `desktop/src-tauri/**/*.rs` 全部 Rust 代码
- 所有业务逻辑（命令、同步、迁移行为）
- 所有测试用例**内容**（路径更新自动化）
- `docs/design-system/tokens.css` 与所有 CSS 文件
- `.workflow/archived/**`（Q-5 拍板不批量替换）

---

## 6. 实现步骤

### PR-1：物理搬迁 + workspace 骨架

> 目标：仓库运行在"新结构 + 旧 import 路径"上，所有命令与测试工作

| 步骤 | 描述 | 预计工作量 | 验收 |
|---|---|---|---|
| 1 | 新建 `pnpm-workspace.yaml` 与 `packages/` 目录 | 5 分钟 | 文件存在 |
| 2 | `git mv src packages/cli/src` + `git mv tests packages/cli/tests` | 10 分钟 | `git log --follow` 可追历史 |
| 3 | 搬迁 CLI 配置：`tsconfig.json` / `tsup.config.ts` / `vitest.config.ts` 到 `packages/cli/`；内部路径检查 | 15 分钟 | 无路径引用失效 |
| 4 | 新建 `packages/cli/package.json`（从根 `package.json` 拆出 CLI 相关字段，改名 `@aitools/cli`） | 10 分钟 | JSON schema 正确 |
| 5 | 拆 README：根 README 拆分为根 + `packages/cli/README.md` | 15 分钟 | 两个 README 内容无重叠但互补 |
| 6 | 复制 LICENSE 到 `packages/cli/LICENSE`（npm 发布要求） | 2 分钟 | 文件存在 |
| 7 | `git mv desktop packages/desktop` | 5 分钟 | 保留历史 |
| 8 | 改 `packages/desktop/package.json` 名字为 `@aitools/desktop`；调整 `@design-system` 相关路径（深一层） | 10 分钟 | 名字正确、路径正确 |
| 9 | 新建 `packages/shared/` 结构：`git mv shared/* packages/shared/src/` | 10 分钟 | 历史保留 |
| 10 | 新建 `packages/shared/package.json`（`@aitools/shared`, private）+ `tsconfig.json` + `src/index.ts`（仅 re-export，暂不动 PR-2 要改的地方） | 15 分钟 | workspace 能识别 |
| 11 | 改根 `package.json`：改名 `aitools-workspace`, `private: true`, 移除 CLI 字段，提 ESLint/Prettier/TS 到 root devDependencies，加 `preinstall`, `build`, `test`, `lint` 聚合脚本 | 20 分钟 | JSON 正确 |
| 12 | 调整根 `eslint.config.js`：ignores 补 `packages/*/dist`、`packages/*/node_modules`、`packages/desktop/src-tauri/target` | 10 分钟 | `pnpm lint` 无误扫描 |
| 13 | 改 `setup.sh`：`cd packages/cli && pnpm build && pnpm link --global` | 15 分钟 | 新版 setup.sh 本地跑通 |
| 14 | 改 `uninstall.sh`：同步新路径 | 5 分钟 | 跑通 |
| 15 | 更新 `.gitignore` 追加 workspace 产物路径 | 5 分钟 | 干净 |
| 16 | 全仓 `pnpm install` 自举 | 5 分钟 | node_modules 正确分布 |
| 17 | `pnpm -r build` 验证：shared 跳过、cli 产出 dist、desktop 产出 dist | 10 分钟 | 三者都绿 |
| 18 | `pnpm -F @aitools/cli test` 验证：186 测试全绿 | 5 分钟 | 通过 |
| 19 | `pnpm -F @aitools/desktop tauri:build` 验证 | 15 分钟 | 通过 |
| 20 | 更新 `CODEBUDDY.md` / `CLAUDE.md` / `README.md` 的项目结构段落 | 30 分钟 | 无遗留旧路径 |
| 21 | 更新 `CHANGELOG.md` / `devlog.md` | 10 分钟 | 记录完备 |
| 22 | 本机回归测试：`aitools init / list / sync / subscribe / unsubscribe` + desktop 启动全流程 | 30 分钟 | US-7 AC 全过 |
| 23 | PR-1 提交 | — | 观察 24h |

**PR-1 小计**：约 4 小时

### PR-2：契约重写（workspace 引用收敛）

> 目标：消除 `@shared/*` alias 与相对路径引用，统一 `@aitools/shared`

| 步骤 | 描述 | 预计工作量 | 验收 |
|---|---|---|---|
| 1 | 充实 `packages/shared/src/index.ts`：聚合 `TOOLS` 常量 + 类型重导出 | 10 分钟 | 符合 4.1 接口定义 |
| 2 | 改 `packages/cli/src/registry/tools.ts`：删除 `resolveRegistryPath` / `readFileSync` / `MODULE_DIR` 逻辑，改为 `import { TOOLS } from '@aitools/shared'`；保留所有 `getAllTools` / `findTool` 等公共 API 不变 | 30 分钟 | 单元测试仍绿 |
| 3 | 改 `packages/cli/src/config/migrations/v0.4-to-v0.5.ts` 与 `relocate-legacy-dirs.ts` 的 import 路径 | 10 分钟 | 编译通过 |
| 4 | 改 `packages/desktop/src/lib/tools.ts`：`@shared/tools.json` → `@aitools/shared`；`@shared/tools.schema` → `@aitools/shared` | 15 分钟 | 类型检查通过 |
| 5 | 改 `packages/desktop/vite.config.ts`：删除 `@shared` alias 条目 | 5 分钟 | vite dev 能启动 |
| 6 | 改 `packages/desktop/tsconfig.json`：删除 `@shared/*` paths 与 `../shared/**/*.ts` include | 5 分钟 | tsc 无错 |
| 7 | 改 `packages/cli/tsconfig.json`：`rootDir: "src"`（原为 "."）；`include` 仅 `["src/**/*"]` | 5 分钟 | 消除 hack |
| 8 | 验证：全仓 `grep -rn "@shared/" packages/` 应为 0 命中；`grep -rn "\.\./\.\./shared" packages/cli/src/` 应为 0 命中 | 5 分钟 | 两项 0 命中 |
| 9 | 验证：`pnpm -F @aitools/cli pack` 产物解压后**不含** `shared/` 目录 | 10 分钟 | tarball 只含 dist+元信息 |
| 10 | 验证：`dist/index.js` 中 `tools.json` 内容已被 tsup 内联（grep 出现工具 name 字符串） | 5 分钟 | 内联成功 |
| 11 | 回归测试：CLI 全套命令 + desktop 启动 | 30 分钟 | 行为一致 |
| 12 | 更新 `CHANGELOG.md` / `devlog.md` 记录 PR-2 | 10 分钟 | — |
| 13 | PR-2 提交 | — | 完成重构 |

**PR-2 小计**：约 2.5 小时

**合计**：约 6.5 小时纯编码；加测试、观察、文档校对预估 **1.5 工作日**

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|---|---|---|---|
| `git mv` 之后 `git log --follow` 不能完整追溯历史（Git 的 rename detection 依赖相似度阈值） | 低 | 中 | 全部用 `git mv` 单步操作；不在同一 commit 内既 mv 又大改内容；如需验证，单独跑 `git log --follow` 抽检 5 个关键文件 |
| tsup bundle 时对 `@aitools/shared` 的 workspace 包解析失败（未 bundle 反而保留外部依赖） | 中 | 高 | tsup 默认会 inline `dependencies` 之外、但属于 workspace 的包；必要时在 `tsup.config.ts` 显式加 `noExternal: ['@aitools/shared']`；PR-2 步骤 9 验证 tarball 是防御 |
| Vite 对 `@aitools/shared` 的 `.ts` 源码直接引用失败（某些配置要求包内编译为 js） | 低 | 中 | shared 的 `package.json` 的 `main` 指向 `.ts`；若 Vite 报错，回退方案：shared 加 tsup 编译 `dist/`，`main` 指向 `dist/index.js` |
| tauri 启动时找不到 node_modules 路径（pnpm 的 symlink 机制可能影响 Rust 侧运行时） | 低 | 低 | Tauri 与 Rust 部分不依赖 node_modules；`src-tauri/tauri.conf.json` 的 `frontendDist` 是 `../dist` 相对 src-tauri，搬迁后相对关系不变 |
| 全局已安装的旧 `aitools` 命令链接到 `<repo>/dist/index.js` 变成 `<repo>/packages/cli/dist/index.js`，pnpm link 需要重新执行 | 高 | 低 | setup.sh 更新 + README 明确要求重跑一次；卸载脚本先清理再重链 |
| `preinstall: "npx only-allow pnpm"` 在纯 npm 环境下会阻塞首次安装 | 低 | 低 | 这是**期望行为**；README 突出写明"必须用 pnpm" |
| `.workflow/archived/` 里旧路径引用随时间增加维护成本 | 低 | 低 | Q-5 已拍板保留；CODEBUDDY.md 加说明"归档文档保留历史路径，不作为当前代码实际位置参考" |
| PR-1 合并后某个隐性依赖暴露（某处硬编码相对路径未发现） | 中 | 中 | PR-1 与 PR-2 之间**强制 24h 观察期**；PR-1 尽量大量回归测试；保留 revert 能力 |
| 测试夹具中硬编码 `../../src/` 等相对路径 | 中 | 低 | 搬迁后 `tests/` 与 `src/` 相对关系保持（都在 packages/cli/ 下），因此多数不受影响；逐个文件 grep 复核 |

---

## 8. 回滚方案

### PR-1 回滚

- **策略**：`git revert <PR-1 merge commit>` 单步回滚
- **副作用**：全局 `aitools` 软链可能指向已消失的 `packages/cli/dist/`，需重跑 `./setup.sh`
- **数据风险**：无（纯路径变更，零数据迁移）

### PR-2 回滚

- **策略**：`git revert <PR-2 merge commit>` 单步回滚
- **副作用**：回到"新结构 + 旧 import 路径"状态，系统仍可运行
- **数据风险**：无

### 紧急回滚到 FEAT-005 后状态（极端情况）

- 两个 PR 均 revert；若 merge 顺序破坏线性，用 `git reset --hard <FEAT-005 最后一个 commit>` 配合 `git push --force`（需要同意）
- 远程分支强制回退前必须用户显式授权

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|---|---|---|---|
| TD-1 | 用 pnpm workspace 而非 turborepo / nx / lerna | turborepo 任务编排 + 缓存；nx 全方位工具链；lerna 传统方案 | 本仓库 3 个包、单人开发、CI 时间 <1min，turbo/nx 属于过度工程；lerna 已不再活跃 |
| TD-2 | `packages/shared` 不编译输出 dist，`main` 直接指 `.ts` 源码 | shared 用 tsup 编译 dist，`main` 指向 dist/index.js | tsup/Vite 都能直接处理 ts 源码；零构建步骤最简；保留 dist 输出作为回退方案（见风险 3） |
| TD-3 | 顶层目录用 `packages/` 而非平铺 `cli/` `desktop/` `shared/` | backlog 原方案是平铺 | `packages/` 是 JS 生态约定（Vite / Vitest / tRPC / Prisma 等均如此）；未来扩展到 `apps/` + `packages/` 结构零阻力 |
| TD-4 | CLI npm 包名改为 `@aitools/cli`，命令名 `aitools` 不变 | 保持 `aitools-cli` 不改 | 统一 scope 提升专业感；`bin` 字段与包名无关，用户无感 |
| TD-5 | desktop 目录保留 `desktop` 而非改 `gui` | backlog 原方案是 `gui` | `desktop` 描述产品形态；`gui` 是技术术语，未来出 web 版冲突 |
| TD-6 | 重构拆两个 PR（搬迁 → 收敛） | 单 PR 全量落地 | 故障面大幅缩小；PR-1 失败时系统仍在旧结构运行；PR-2 失败时仍在可运行的搬迁态 |
| TD-7 | `package.json` 使用 `workspace:*` 协议，publish 时自动替换 | 写死版本号；或用 `file:../shared` | pnpm 原生支持；publish 时 pnpm 会展开为具体版本，对 npm 消费者透明 |
| TD-8 | `preinstall: "npx only-allow pnpm"` 强制包管理器 | 仅文档说明；不强制 | npm/yarn 会破坏 workspace symlink；强制是唯一可靠手段 |
| TD-9 | ESLint/Prettier/TypeScript 提升到根 devDependencies | 保留在 cli 子包 | 全仓共用工具，根 devDep 减少重复；子包只装独有工具 |
| TD-10 | `.workflow/archived/` 历史文档内的旧路径文本不批量替换 | sed 一键替换 | 归档文档代表历史事实，保留原貌更诚实；在 CODEBUDDY.md 加一段说明 |
| TD-11 | setup.sh 保留而非废弃 | 用户直接 `pnpm install && pnpm link` | setup.sh 已有版本检查、友好日志、错误处理，用户体验更好；仅更新内部路径即可 |
| TD-12 | CLI 与 desktop 保持分离部署，desktop 通过 Tauri 子进程调用系统 PATH 中的 `aitools` | X1（webview 直接 import core 业务函数，需大幅改造为依赖注入风格 IO）、X2（Tauri sidecar 内嵌 node + cli.js）、X1-reverse（抽出 `@aitools/core` 包供 CLI 与 desktop 平级消费） | 1）尊重既有架构投资：FEAT-004/005 沉淀的 NDJSON 协议 + sh -lc PATH 加载 + cwd 守卫不该推翻；2）尊重 CLI 一等公民地位（CODEBUDDY.md 中 Alex 用户画像明确 CLI 是终端开发者主入口）；3）控制本次重构范围：REFACTOR-001 目标是结构清晰 + 命名统一，扩展到发布形态重构会让风险失控；4）desktop 调用 CLI 频率低 + 时延不敏感（用户主动操作场景，30-100ms 子进程启动可接受），core 抽离收益不足以支撑 55-80h 改造成本；5）需要时可在未来任务（REFACTOR-002 候选）独立评估 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建 | AI |
| 2026-05-09 | 追加 TD-12：明确 CLI 与 desktop 分离部署的决策（用户讨论"内置 vs 分离"后落地） | AI + 用户 |

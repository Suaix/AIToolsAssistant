# AIToolsAssistant

> AI 工具同步管家 · 你写一次，它到处都在（Write once. Sync everywhere.）

本仓库是 **pnpm workspace 三段式 monorepo**，包含 CLI、桌面 App 和跨端公共契约三部分。

## 仓库结构

```
AIToolsAssistant/
├── packages/
│   ├── cli/        → @aitools/cli       命令行工具（发布到 npm，命令名: aitools）
│   ├── desktop/    → @aitools/desktop   Tauri 桌面 App
│   └── shared/     → @aitools/shared    跨端公共契约（SSOT）
├── docs/
│   ├── design-system/  → 设计系统（L1~L7 分层规范）
│   └── rfcs/           → 各版本设计 RFC
├── .workflow/      → 工作流（需求/设计/技术方案归档）
└── pnpm-workspace.yaml
```

## 子包导航

| 包 | 说明 | 文档 |
|---|---|---|
| `@aitools/cli` | CLI 工具，命令名 `aitools`，支持 skills/commands/agents/rules 同步 | [packages/cli/README.md](./packages/cli/README.md) |
| `@aitools/desktop` | 桌面 GUI，Tauri + React + Vite | （暂无独立 README，代码见 `packages/desktop/src/`） |
| `@aitools/shared` | 跨端类型契约 + 工具元信息 SSOT（`tools.json`） | 代码即文档，见 `packages/shared/src/` |

## 快速开始

### 环境要求

- Node.js ≥ 20.0.0
- pnpm ≥ 9.0.0（**必须**——本仓库使用 workspace protocol，npm/yarn 会破坏软链）

### 一键安装（CLI）

```bash
git clone <repo-url>
cd AIToolsAssistant
./setup.sh
```

脚本会：环境检查 → `pnpm install` 装齐所有包 → 构建 CLI → 全局链接 `aitools` 命令。

### 一键卸载

```bash
./uninstall.sh
```

### 手动安装（开发者）

```bash
pnpm install                    # 装齐三个包的依赖
pnpm -r build                   # 并行构建全部包
pnpm -F @aitools/cli test       # 跑 CLI 单测
pnpm -F @aitools/desktop tauri:dev  # 启动 desktop 开发模式
```

## 常用命令速查

| 命令 | 说明 |
|---|---|
| `pnpm -r build` | 构建所有包 |
| `pnpm -r test` | 跑所有包的测试 |
| `pnpm -F @aitools/cli <cmd>` | 对 CLI 包执行任意脚本 |
| `pnpm -F @aitools/desktop <cmd>` | 对 desktop 包执行任意脚本 |
| `pnpm lint` | 全仓 ESLint 校验 |

## 设计文档

- 设计系统：[`docs/design-system/README.md`](./docs/design-system/README.md)
- v0.5.0 RFC（claude 命名统一 + 配置迁移）：[`docs/rfcs/v0.5.0-naming-and-migration.md`](./docs/rfcs/v0.5.0-naming-and-migration.md)
- v0.4.0 RFC（订阅模型）：[`docs/rfcs/v0.4.0-subscription-model.md`](./docs/rfcs/v0.4.0-subscription-model.md)

## 技术栈

- **TypeScript** + **ES Modules**（Node.js ≥ 20）
- **pnpm workspace** 管理多包
- **tsup** / **Vite** / **Tauri 2** 各自的构建
- **Vitest** 单元测试

## License

MIT

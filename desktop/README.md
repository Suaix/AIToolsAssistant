# aitools-desktop

> 🎨 AIToolsAssistant 桌面应用 —— 基于 Tauri 2 + React + TypeScript

这是 `aitools` 的图形化客户端。CLI 是第一公民，桌面 App 作为"可视化的管家"存在——调用 CLI 子进程执行真实的业务逻辑（见下文"架构"）。

---

## 🚀 启动开发

### 前置要求

| 工具 | 最低版本 | 验证命令 |
|---|---|---|
| Node.js | 20.0.0 | `node -v` |
| pnpm | 10.x | `pnpm -v` |
| Rust | 1.77+ | `rustc --version` |
| Xcode CLT（macOS） | 任意 | `xcode-select -p` |

Rust 未装请参照项目根 CLAUDE.md / CODEBUDDY.md 的安装章节，或执行：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 安装依赖 + 启动

```bash
cd desktop
pnpm install            # 装前端依赖（Tauri CLI 等）
pnpm tauri:dev          # 启动开发模式（首次编译 Rust 约 1 分钟，后续秒开）
```

启动成功后会看到：

- 一个 `960 × 720` 的原生 macOS 窗口弹出
- 左侧：三段式侧栏（工作台 / Skills 等 / 已连接工具 / 设置）
- 右侧：当前选中的页面（默认工作台）
- 右上角：主题切换按钮（亮 / 暗 / 跟随系统 三档）

---

## 🏗️ 架构

```
┌──────────────────────────────────────────────────────────┐
│                      aitools 桌面 App                      │
│                                                          │
│  ┌────────────────────┐       ┌────────────────────┐    │
│  │  React UI           │       │   Rust 后端         │    │
│  │  (WebView)          │◄──IPC►│  (Tauri Command)   │    │
│  │  TypeScript + Vite  │       │                    │    │
│  └────────────────────┘       └─────────┬──────────┘    │
│                                          │ spawn         │
└──────────────────────────────────────────┼───────────────┘
                                           ▼
                               ┌──────────────────────┐
                               │   aitools CLI        │
                               │   (Node.js 子进程)    │
                               │                      │
                               │   --json 流式输出     │
                               │   现有代码 0 改动     │
                               └──────────────────────┘
```

**核心原则**：
- 业务逻辑 100% 在 CLI 里，桌面 App 不重复实现任何同步/扫描逻辑
- Rust 层只做"窗口 + 子进程派发 + 文件系统监听"
- React 层只做"UI 渲染 + 事件流解析"

---

## 📂 目录结构

```
desktop/
├── src/                      ← React 前端源码
│   ├── main.tsx              ← 入口，挂载 React
│   ├── App.tsx               ← 根组件（侧栏 + 路由）
│   ├── components/
│   │   ├── Sidebar.tsx       ← 侧栏（翻译自 L6 原型）
│   │   └── ThemeToggle.tsx   ← 主题切换按钮
│   ├── pages/
│   │   ├── Dashboard.tsx     ← P1 工作台
│   │   ├── Skills.tsx        ← P2 Skills 列表
│   │   ├── Tools.tsx         ← P4 已连接工具
│   │   └── Settings.tsx      ← P5 设置
│   └── lib/
│       ├── theme.ts          ← 主题管理
│       └── routes.ts         ← 路由定义
├── src-tauri/                ← Rust 后端（Tauri 2）
│   ├── src/
│   │   ├── main.rs           ← 程序入口
│   │   └── lib.rs            ← Tauri 初始化
│   ├── Cargo.toml            ← Rust 依赖
│   └── tauri.conf.json       ← 窗口与打包配置
├── index.html                ← Vite 入口 HTML（只有 #root）
├── vite.config.ts            ← Vite 配置（含设计系统 alias）
└── tsconfig.json             ← TS 编译配置
```

---

## 🎨 设计系统集成

**铁律**：`desktop/src/` 下**不写任何 CSS**，所有样式来自项目根的设计系统：

```typescript
// main.tsx
import '@design-system/tokens.css';
import '@design-system/components.css';
```

这通过 Vite alias（见 `vite.config.ts`）指向 `../docs/design-system/`。

**好处**：
- 单一真相源：改设计系统文档即改桌面 App
- 跟 L6 HTML 原型共用完全相同的 Token 和组件类名
- 未来 Web / 其它前端也能复用同一套样式

**违反检测**：如果有人尝试在 `src/` 下新建 `.css` 文件，在 code review 阶段应被拒绝。

---

## 🧪 开发脚本

| 命令 | 作用 |
|---|---|
| `pnpm tauri:dev` | 启动开发模式（热重载 + Rust 增量编译） |
| `pnpm tauri:build` | 打包发布版（.app / .dmg） |
| `pnpm build` | 只构建前端（验证 TS/Vite 编译） |
| `pnpm dev` | 只启动 Vite 开发服务器（不带 Rust） |

---

## 🎯 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| MVP-01 | Tauri + React 骨架 + 侧栏 + 主题 | ✅ 已完成 |
| MVP-02 | 对接 CLI 只读（Skills 列表、状态展示） | ⏳ 待做 |
| MVP-03 | 同步功能 + 菜单栏 Tray + 同步魔法动效 | ⏳ 待做 |
| v1.0 | 打包签名 + macOS 分发 | ⏳ 待做 |

---

## 📌 与根项目的关系

- 本 `desktop/` 是独立 pnpm 工程，**不影响根目录的 CLI 构建**
- 与根目录的 CLI 通过**子进程 + NDJSON 事件流**通信
- CLI 的 `--json` 协议稳定，即使 CLI 内部重构，桌面 App 代码也不受影响

详见项目根 `docs/design-system/` 的 7 层架构文档。

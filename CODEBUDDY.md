# CODEBUDDY.md — 项目 AI 助手指引

> 本文件提供给 CodeBuddy（以及其它 AI 助手）在处理本仓库任务时的**强制读入上下文**。  
> 任何 AI 助手在开工前都应先扫读本文件。

---

## 🚨 面向 AI 助手的强制规则

### 开工前自检（必读 → 然后才动手）

**本仓库包含两套相互独立的工作流**，请先识别任务属于哪一类：

| 任务类型 | 识别特征 | 强制阅读文件 |
|---|---|---|
| **CLI / TypeScript 开发** | 改 `src/**/*.ts`、测试、构建配置 | 本文件"CLI 开发规范"章节 |
| **设计 / UI / 视觉 / 文档** | 改 `docs/design-system/**`、新页面、改样式、改文案 | **[`docs/design-system/AI_INSTRUCTIONS.md`](./docs/design-system/AI_INSTRUCTIONS.md)（必须先读完！）** + `docs/design-system/README.md` |
| **同时涉及两者** | 两边都要做 | 两份指引都读 |

---

### ⛔ UI / 设计任务红线（无例外）

在处理任何 UI 相关任务（HTML/CSS/视觉稿/组件/页面）时，**绝对禁止**：

1. ❌ 硬编码颜色值（必须用 `var(--color-*)` 等 Token）
2. ❌ 自创不在 `components.css` 中定义的组件
3. ❌ 写动画时长 > 400ms（同步魔法动效 640ms 是唯一例外）
4. ❌ 使用"哎呀/噢豁/小问题"等卖萌式错误文案
5. ❌ 首屏只有操作按钮没有"状态元素"
6. ❌ 同屏出现 ≥ 2 个 Primary 按钮

详细约束见 [`docs/design-system/AI_INSTRUCTIONS.md`](./docs/design-system/AI_INSTRUCTIONS.md) 的"3 条铁律"与"自查清单"。

---

### 📐 设计系统速查（30 秒了解气质）

- **产品**：AIToolsAssistant（aitools）—— AI 工具同步管家
- **一句话**：你写一次，它到处都在（Write once. Sync everywhere.）
- **隐喻**：抽屉（不是中控台、不是市场、不是 Copilot）
- **用户**：Alex，28 岁前端，同时用 Cursor + Claude Code + CodeBuddy
- **气质**：冷静 × 工程精准 × 留白充足 × 暗色优先
- **主色**：Teal 暮光青（`#14B8A6` 浅 / `#2DD4BF` 暗）
- **参照**：Raycast / Linear / Arc / Vercel Dashboard
- **反面**：Notion（太暖）/ JIRA（太冷）/ 钉钉（太 B 端）

**4 条设计原则（按仲裁优先级）：**
1. 诚实先于友好
2. 状态先于功能
3. 明确先于惊喜
4. 克制先于全面

---

## 📂 项目结构

```
AIToolsAssistant/
├── src/                                ← CLI 工具源码（TypeScript）
│   ├── index.ts                        ← CLI 入口
│   ├── commands/                       ← 子命令（init / sync / list）
│   ├── core/                           ← 核心业务（扫描、同步、hash）
│   ├── config/                         ← 配置读写
│   └── utils/                          ← 工具
├── tests/                              ← 单元测试
├── docs/
│   └── design-system/                  ← 🎨 完整设计系统
│       ├── README.md                   ← 设计系统总览
│       ├── AI_INSTRUCTIONS.md          ← 🚨 给 AI 的强制指令（UI 任务必读）
│       ├── 01-brand-strategy.md        ← L1 品牌战略
│       ├── 02-design-principles.md     ← L2 设计原则（4 条铁律）
│       ├── 03-information-architecture.md ← L3 信息架构
│       ├── 04-visual-language.md       ← L4 视觉语言
│       ├── tokens.css                  ← L4 CSS 变量（唯一真相源）
│       ├── 05-component-spec.md        ← L5 组件规范
│       └── 07-review-checklist.md      ← L7 走查清单
└── CODEBUDDY.md                        ← 本文件
```

---

## 🛠️ CLI 开发规范

### 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm run build` | 使用 tsup 构建 ESM 产物到 `dist/` |
| `pnpm run dev` | 监听模式实时编译 |
| `pnpm run lint` | ESLint（Flat Config）校验 |
| `pnpm run format` | Prettier 格式化 `src/` |
| `pnpm run test` | Vitest 运行单元测试 |
| `pnpm run start` | 执行 `./dist/index.js` |

### 架构要点

- **CLI 框架**：`commander` 13.x，入口 `src/index.ts`
- **交互**：`@inquirer/prompts`（交互式初始化）
- **配置**：`yaml`（全局 `~/.aitools/config.yaml` + 项目级 `.aitools/project.yaml`）
- **日志**：统一通过 `src/utils/logger.ts`（基于 `picocolors`）
- **模块**：ES Modules（`"type": "module"`），Node.js ≥ 20
- **测试**：新功能必须配套 Vitest 单元测试

### 代码规范

- 所有类、方法、变量、常量、枚举必须有**中文注释**
- 单个方法代码行 ≤ 100，单个文件 ≤ 5000
- 不能在循环遍历中创建新对象
- Git 提交：`type(scope): 中文描述`（type: feat / fix / docs / style / refactor / test / chore）

---

## 🎯 任务示例（如何正确响应）

### 示例 1：用户说"帮我在设置页加个主题切换"

**错误做法** ❌：
```
好的，我来帮你加个 toggle 按钮！
<button style="background:#14B8A6; padding:10px;">切换主题</button>
```

**正确做法** ✅：
```
收到。按设计系统流程执行：
1. 已阅读 docs/design-system/AI_INSTRUCTIONS.md
2. 已阅读 05-component-spec.md 的 Button 规范
3. 参考 desktop/src/pages/Settings.tsx 现有主题切换模式

[然后生成使用 .btn .btn--primary 类名、引用 Token 的代码]

自查清单：
[x] 所有颜色用了 var(--color-*)
[x] 复用了 .btn 组件
[x] 遵循 L2「状态先于功能」——当前主题状态可见
```

### 示例 2：用户说"加个 AI 问答入口"

**响应模板** ✅：
```
我注意到这可能违反 L2 原则 4「克制先于全面」——
AI 问答不在首版 5 页清单中。

在生成之前想确认：
- 这是"必须做"还是"可以做"？
- 如果必须，能放在现有页面里（比如 Skill 详情的 Tab）吗？
- 如果不能合并，我们需要先更新 03-information-architecture.md
  把它纳入规划再实现。
```

---

## 📝 变更与版本管理

- 修改设计系统文档前先读 `docs/design-system/README.md` 的变更流程
- 任何 L4 Token 变更都是**断崖式影响**，必须走审查
- 版本号：遵循语义化（v1.0 / v1.1 / v2.0）

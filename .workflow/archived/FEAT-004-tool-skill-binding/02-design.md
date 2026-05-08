# UI/UX 设计文档：优化连接工具与 Skill 订阅关联关系

> **任务编号**：FEAT-004
> **创建日期**：2026-05-08
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **状态**：已批准（2026-05-08 通过 design_to_technical 门禁）

---

## 1. 设计目标

让「项目」「已连接工具」「Skill 订阅」三者形成强一致的可见关系：

- **拒绝非项目目录进入项目列表**——把"目录是否被任一已连接工具维护"作为入场门槛。
- **状态先于功能**——Skills 面板项目级订阅区只展示与当前项目相关的工具状态；工具断开但订阅仍存在的"灰色状态"必须可见。
- **明确先于惊喜**——新建项目级订阅时，写入范围严格等于"当前项目实际关联的工具集合"，不在用户没要求的目录下创建文件。

---

## 2. 信息架构

### 2.1 涉及页面与区域

```
顶部 ProjectSwitcher 下拉
  └── 「打开其他目录…」入口
       └── [新增] 校验失败弹窗（Modal）

Skills 页（pages/Skills.tsx）
  ├── Tab：用户级订阅       ← 本次不动
  ├── Tab：项目级订阅       ← [改] 行级"工具断开"提示
  └── Tab：未订阅           ← [改] 「订阅到项目」按钮的可用性 + tooltip

订阅弹层（SubscribePopover, components/SubscribePopover.tsx）
  └── [改] 在 popover 内根据当前项目工具集合决定 scope=project 选项的可用性与文案
```

### 2.2 用户流程

#### 流程 A：新增项目（含校验）

```
ProjectSwitcher 下拉
  → 点击「打开其他目录…」
    → osascript 选择目录（dirPath）
      → [新增] 前端校验：扫描已连接工具列表 ∩ dirPath 根层级
        ├── 命中至少 1 个工具
        │     → 走原 handleSelectProject(dirPath)
        │       → 设为 currentProject + 写入 recentProjects
        └── 命中 0 个工具
              → 弹出校验失败 Modal（不写入 recentProjects、不切换 currentProject）
                → 用户点「我知道了」关闭
```

#### 流程 B：项目级订阅展示

```
进入 Skills 页 / 切换项目
  → loadData(projectCwd)
    → listResources('skills', projectCwd)
      → 拿到 result.resources（每条含 subscriptions[].targets[]）
  → [新增] 计算 currentProjectTools = 已连接工具 ∩ 项目根层级标记目录
  → projectResources Tab 渲染
    ├── 行（资源卡片）保持原结构
    └── 每个 target badge：
         ├── target ∈ currentProjectTools  → 正常 badge（既有）
         └── target ∉ currentProjectTools  → badge 灰显 + 行内追加短提示
              "<displayName> 连接已断开"（不阻止查看，禁止 Re-Sync）
```

#### 流程 C：新增订阅时的写入边界

```
用户在「未订阅」Tab 点资源卡片的「订阅」按钮
  → SubscribePopover 弹出（scope=user / project 选项 + sync 复选）
    ├── [新增] 判断 currentProjectTools
    │   ├── 集合非空 → 「订阅到项目」可用，按钮副文本：
    │   │             "将写入 <tool-list>"，例如「将写入 .codebuddy/skills」
    │   └── 集合为空 → 「订阅到项目」禁用，hover tooltip：
    │                  "当前项目未关联任何已连接的 AI 工具"
    └── 用户确认 scope=project
       → handleSubscribe('project', sync)
         → ensure_project_config(cliProjectDir)
         → subscribeResource({ type, name, scope:'project', sync, cwd })
         → CLI 内部基于 detectProjectTools() 决定写入哪些工具目录
            （这与本设计意图自动一致，无需改 CLI）
```

> **关键技术事实**：CLI 命令 `aitools subscribe skills <name> --scope project` 当前**没有 `--target` 参数**，
> 但 `subscribe` 命令内部最终通过 `core/syncer.ts` 的 `detectProjectTools(projectDir, targets)` 决定写入哪些工具目录——
> 它的判定规则就是"项目根目录是否存在 `.<toolName>/` 目录"。
> 所以 **US-3 的"只写入项目实际关联工具目录"在 CLI 侧已天然满足**；GUI 侧的工作只是：
>   1. 在 Popover 上把可用性、文案、空集合禁用做对；
>   2. 不让 GUI 在 subscribe 之前手动 `mkdir` 出 `.claude` 这种目录；
>   3. 项目级订阅区展示时不要把"已连接但本项目无目录"的工具误展示成正常状态。

---

## 3. 页面设计

### 3.1 新增：「目录不合法」校验失败 Modal

**触发**：用户在 ProjectSwitcher 选择目录后，前端检测到该目录根层级未包含任何已连接工具的标记目录。

**布局结构**（基于现有 `.modal--sm` + `.modal__header / __body / __footer`）：

```
┌──────────────────────────────────────────────────────┐
│  当前目录无法添加为项目                          ✕  │  ← .modal__header（带 close 按钮）
├──────────────────────────────────────────────────────┤
│                                                      │
│  /Users/.../Documents/test                          │  ← 路径，等宽字体 .text-mono
│                                                      │
│  该目录的根层级没有任何已连接的 AI 工具目录。       │  ← 主提示，--text-body
│                                                      │
│  当前已连接：CodeBuddy、Claude Internal             │  ← 副提示，--color-text-secondary
│  期望存在：.codebuddy/ 或 .claude-internal/         │
│                                                      │
├──────────────────────────────────────────────────────┤
│                                  [ 我知道了 ]        │  ← .btn .btn--primary
└──────────────────────────────────────────────────────┘
```

**交互说明**：

| 元素 | 交互行为 | 触发条件 |
|------|---------|---------|
| 关闭 ✕ | 关闭弹窗，不写入 recentProjects | 点击 / Esc |
| 「我知道了」按钮 | 关闭弹窗 | 点击 / Enter |
| 整个弹窗 | 不可拖拽；overlay 遮罩点击关闭 | 默认行为 |

**文案规范**（依据 L2「诚实先于友好」）：

- ✅ 标题：「当前目录无法添加为项目」（陈述事实）
- ❌ 禁止：「哎呀」「出错啦」「小问题」等卖萌词
- 副提示动态生成：根据已连接工具列表 + 实际期望目录列出
- **不提供**「跳转到连接工具页面」引导（Q-5 决策）

### 3.2 修改：Skills 页「项目级订阅」Tab 行内"断开"提示

**变更范围**：`pages/Skills.tsx` 项目级订阅卡片底部 target badge 区域。

**变更前**（现状，Skills.tsx L775-784）：
```
[ ✓ 已同步 · codebuddy ]  [ ✓ 已同步 · claude-internal ]
```

**变更后**（当 claude-internal 已被全局断开，但项目内 .claude-internal/ 还存在）：
```
[ ✓ 已同步 · CodeBuddy ]  [ ⊘ Claude Internal 连接已断开 ]
```

**视觉规范**：

| 状态 | Badge 类名 | 文本 | 触发同步按钮 |
|------|-----------|------|-------------|
| target 仍在已连接 | `.badge .badge--<status>`（既有） | `<状态> · <displayName>` | 启用 |
| target 已被断开 | `.badge .badge--disabled`（**新增**） | `<displayName> 连接已断开` | 禁用 + tooltip |

`.badge--disabled` 视觉：背景 `--color-bg-muted`、文字 `--color-text-tertiary`、左侧 dot 颜色 `--color-text-disabled`，不使用红/橙色（不是错误，是中性"灰色状态"）。

**target.target → displayName 映射**：复用 `AddToolModal.tsx` 中的 `AVAILABLE_TOOLS` 常量（已含 displayName 字段），抽出到 `desktop/src/lib/tools.ts` 共享。

### 3.3 修改：SubscribePopover「订阅到项目」选项可用性

**位置**：`components/SubscribePopover.tsx`（用户级 / 项目级 / 是否立即同步 三段式 popover）。

**变更**：

```
┌─ Subscribe Popover ────────────────────┐
│                                        │
│  ○ 用户级（写入 ~/.codebuddy/skills）  │  ← 既有
│                                        │
│  ● 项目级                              │  ← 改动入口
│    └─ 状态 A：currentProjectTools 非空 │
│        说明文案："将写入 .codebuddy/skills"  │  ← --text-caption-size
│        （多个工具时用顿号拼接）             │
│    └─ 状态 B：currentProjectTools = ∅  │
│        radio 禁用 + hover tooltip：     │
│        "当前项目未关联任何已连接的 AI 工具"  │
│                                        │
│  ☐ 立即同步                            │
│                                        │
│            [ 取消 ]   [ 确认订阅 ]     │
└────────────────────────────────────────┘
```

**Tooltip 实现**：当前 components.css 无 `.tooltip` 组件类，复用 HTML `title` 属性即可（与 Skills.tsx L779 现状一致）。**不新增 Tooltip 组件**，避免本次扩散。

---

## 4. 状态枚举

### 4.1 「校验失败 Modal」状态

| 状态 | 描述 | 视觉表现 |
|------|------|---------|
| 隐藏（默认） | 未触发 | 不渲染 |
| 显示 | 选中目录无匹配工具 | overlay + modal--sm |
| 关闭中 | 点击关闭后短暂过渡 | --duration-fast 淡出（沿用 modal 既有动画） |

无加载/错误/成功态——前端校验是同步的本地操作。

### 4.2 「项目级订阅」Tab 状态

| 状态 | 触发条件 | 视觉表现 |
|------|---------|---------|
| Empty | `cliProjectDir` 存在但无 project 范围订阅 | 既有 EmptyState（不改） |
| Loading | `loadData` 进行中 | 既有 spinner（不改） |
| Success | 有项目级订阅 | 卡片列表（每行 badge 按 4.3 规则渲染） |
| Error | listResources 失败 | 既有错误条（不改） |
| **No Project（新）** | `cliProjectDir = null`（如 GUI 还没选项目） | 既有兜底（不改） |

### 4.3 单个 target badge 状态

| 状态 | target ∈ currentProjectTools | target ∈ 已连接列表 | Badge 表现 |
|------|------------------------------|---------------------|-----------|
| 正常已同步 | ✅ | ✅ | `.badge--success`（既有） |
| 正常待同步 | ✅ | ✅ | `.badge--warning` 等（既有） |
| **断开** | ❌ | ❌ | `.badge--disabled`（新增） |
| **目录消失但工具仍连接** | ❌ | ✅ | `.badge--disabled` + 短提示「目录已不存在」（边界容错） |

### 4.4 SubscribePopover「项目级」选项状态

| 状态 | 触发条件 | 表现 |
|------|---------|------|
| Available | `currentProjectTools.length ≥ 1` | radio 可选 + 副文案"将写入 .xx/skills" |
| Disabled | `currentProjectTools.length = 0` | radio 禁用 + tooltip + 副文案灰显「无可写入的工具目录」 |
| Loading | currentProjectTools 计算中（首次进入页面） | radio 暂时禁用，副文案"检测中…" |

---

## 5. 组件清单

| 组件 / 类名 | 来源 | 说明 |
|------------|------|------|
| `.modal-overlay / .modal--sm / .modal__header / __body / __footer` | 既有 components.css L829-906 | 校验失败弹窗外壳 |
| `.btn .btn--primary` | 既有 | 弹窗"我知道了"按钮 |
| `.badge` | 既有 | 既有 target 状态 badge |
| `.badge--disabled` | **新增**（components.css 追加 ~10 行） | 工具断开状态的 badge 灰显变体 |
| `.empty-state` | 既有 L1003-1035 | 项目无关联工具时的空态（已有，不改） |
| HTML `title` 属性 | 既有约定 | Tooltip 实现，沿用 Skills.tsx L779 模式 |
| 路径展示 etc | 既有 | 全部用 Token，不硬编码 |

**不新增任何 React 组件文件**：
- 校验失败 Modal 在 `App.tsx` 局部内联渲染（与现有 Onboarding/SyncProgressModal 风格一致）；状态用 `useState` 管理。
- target badge 的"断开"判断在 `Skills.tsx` 渲染时计算，不抽组件。

**新增辅助模块**：

| 文件 | 用途 |
|------|------|
| `desktop/src/lib/tools.ts` | 导出 `AVAILABLE_TOOLS`（从 AddToolModal.tsx 迁出） + `detectProjectToolsFromList(projectDir, connectedTools): Promise<string[]>`（通过 Tauri 命令探测目录） |
| `desktop/src-tauri/src/lib.rs` | 新增 Tauri 命令 `detect_project_tools(project_dir, tool_names)`，返回 `Vec<String>`（仅做 Path::join + exists 检查） |

> 注：复用 CLI 的 `detectProjectTools` 不可行——它是 Node.js 内部函数，不通过 stdout 返回。最低代价是用一个新的 Tauri 命令做"目录是否存在"的薄探测，纯 fs 调用、无业务逻辑。

### 5.1 工具名兼容映射（Q-补充：claude-code / claude-internal 双名容错）

**背景**：现状调研发现仓库内对 Claude 工具的命名存在两版并存：

| 名称 | 出现位置（不完全统一） |
|------|-----------------------|
| `claude-code` | `src/config/manager.ts`（默认 config）、`src/index.ts` 帮助文本、`src/commands/list.ts` 显示映射、`src/types/index.ts` 注释、全部 `tests/**` |
| `claude-internal` | `src/commands/target.ts`（`target add` 预定义清单）、`desktop/src/components/AddToolModal.tsx`、`desktop/src/lib/cli.ts` 注释、`desktop/src/pages/Tools.tsx`（两个都列） |

**本任务的处理策略**（与用户确认的方案 C：拆出 FEAT-005 处理统一）：
- **本任务对两个名称都做容错识别**——不在本任务里改动任一已有代码字面量。
- 在 `desktop/src/lib/tools.ts` 中定义"工具名 → 项目目录候选名"映射，识别时使用集合判断：

  ```ts
  // 概念示意（最终签名以 03-technical.md 为准）
  const TOOL_PROJECT_DIR_ALIASES: Record<string, string[]> = {
    codebuddy:         ['.codebuddy'],
    workbuddy:         ['.workbuddy'],
    'claude-internal': ['.claude-internal', '.claude-code'],
    'claude-code':     ['.claude-code', '.claude-internal'],
  };
  ```
- displayName 也支持双名 fallback：
  ```ts
  const TOOL_DISPLAY_NAME: Record<string, string> = {
    codebuddy: 'CodeBuddy',
    workbuddy: 'WorkBuddy',
    'claude-internal': 'Claude Internal',
    'claude-code': 'Claude Code',
  };
  ```

**FEAT-005 待办（独立任务，本任务不实现）**：统一为 `claude-internal`、写配置迁移逻辑（旧 config 中的 `claude-code` 自动改写）、对齐 tests 与 CLI 帮助文本、删除上述兼容映射。

---

## 6. 响应式 / 适配策略

桌面端窗口最小宽度 1024px；本次涉及的 Modal、Popover、Badge 均在最小宽度下不溢出。无需额外断点。

---

## 7. 设计资产

无原型图——本任务为既有页面的细节增强，文字 + ASCII 已足够描述视觉变化。

---

## 8. 设计决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| D-1 | 校验失败用 Modal 而非 Toast | Toast | Toast 时长短、信息密度低，无法承载"已连接 X / 期望 Y"两段对照；Modal 强阻断也符合 L2「诚实先于友好」 |
| D-2 | "工具断开"用灰色 disabled badge，不用红色 error | 红色 error | 这不是错误，只是状态变化；红色会让用户以为同步失败需要修复 |
| D-3 | 新增 Tauri 命令 `detect_project_tools` 而非走 CLI | 调用 `aitools list` 间接获取 | CLI 当前 list 的输出不暴露"项目实际关联工具"集合；新增轻命令更直接、更快（不 spawn Node） |
| D-4 | `AVAILABLE_TOOLS` 提到 `lib/tools.ts` 共享 | 复制一份 | 当前 displayName 仅 AddToolModal 私有；前端三处会用到 displayName（弹窗、popover、Skills 行），共享必要 |
| D-5 | SubscribePopover 项目级选项的"将写入 X"副文案 | 不显示 | L2「明确先于惊喜」要求把写入范围说清楚；也是与"如果不显示，用户可能以为也会写到 .claude"反面教材的对照 |
| D-6 | 不在「打开其他目录」按钮上做客户端预过滤 | 选目录前就禁用普通文件夹 | macOS choose folder 对话框无法做内容预过滤；选完再校验是唯一可行路径 |
| D-7 | 不持久化 currentProjectTools 到 GuiState | 缓存到 localStorage | Q-1 决策：动态扫描，每次切换/进入页面重新计算，避免脏数据 |
| D-8 | claude 工具命名 `claude-code`/`claude-internal` 不在本任务统一，仅做双名兼容映射 | 在本任务一并统一 | 影响面跨 8+ 文件且需要配置迁移逻辑，已拆出独立任务 FEAT-005；本任务保持只读，避免范围蔓延 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-08 | 初稿创建 | AI |
| 2026-05-08 | 加入 5.1 工具名兼容映射；新增决策 D-8（claude-code/claude-internal 拆 FEAT-005 处理） | AI |

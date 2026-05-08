# 技术方案：优化连接工具与 Skill 订阅关联关系

> **任务编号**：FEAT-004
> **创建日期**：2026-05-08
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：已批准（2026-05-08 通过 technical_to_coding 门禁）

---

## 1. 概述

### 1.1 技术目标

在 GUI 层引入「项目关联工具集合（projectTools）」概念并贯穿三处入口（项目添加、项目级订阅展示、项目级订阅写入），实现该集合的**动态扫描**与**单一真相源**：通过新增轻量 Tauri 命令 `detect_project_tools` 在 Rust 侧做 fs.exists 探测，不修改 CLI、不持久化。

### 1.2 技术约束

| 约束 | 说明 |
|------|------|
| 不改 CLI 业务逻辑 | CLI subscribe 已天然按 `detectProjectTools` 写入；本任务只动 GUI |
| 不持久化 projectTools | Q-1 决策：每次需要时通过 Tauri 命令重算 |
| 不引入新依赖 | 复用 `std::path` + `std::fs::metadata`，沿用 osascript 方案的"零依赖"风格（参考既有 `open_directory_dialog`） |
| 动作不阻塞 UI | Tauri 命令在异步任务中调用；fs.exists 单次 < 5ms |
| 双名兼容 | claude-code/claude-internal 双名识别，不在本任务统一（见 02-design §5.1） |
| `process.cwd()` 陷阱 | 任何 CLI 调用必须显式传 cwd（项目记忆 #36043466） |

---

## 2. 架构设计

### 2.1 整体架构与数据流

```
                    ┌────────────────────────────────────────┐
                    │ desktop/src/lib/tools.ts (新增)        │
                    │  · AVAILABLE_TOOLS（迁出）              │
                    │  · TOOL_PROJECT_DIR_ALIASES（双名映射） │
                    │  · TOOL_DISPLAY_NAME（展示名映射）       │
                    │  · detectProjectTools(projectDir,      │
                    │      connectedTools): Promise<string[]>│
                    └──────────────────────┬─────────────────┘
                                           │ invoke
                                           ▼
                    ┌────────────────────────────────────────┐
                    │ desktop/src-tauri/src/lib.rs (新增命令) │
                    │  detect_project_tools(                 │
                    │    project_dir, candidate_dirs)        │
                    │  → Vec<String> (存在的子目录名)         │
                    └────────────────────────────────────────┘

GUI 调用方（3 处消费 detectProjectTools）：

(1) App.tsx · handleOpenDirectory       —— 添加项目时校验
        │
        │ if connectedTools.length === 0  → 走"无连接工具"软兜底（不弹校验失败）
        │ else                            → projectTools = await detectProjectTools(dir, connectedTools)
        │     ├── projectTools.length=0   → 弹 InvalidProjectModal，不写入
        │     └── projectTools.length≥1   → 走原 handleSelectProject(dir)
        │
(2) Skills.tsx · loadData                —— 项目级订阅 Tab 渲染时
        │
        │ projectTools = await detectProjectTools(cliProjectDir, connectedTools)
        │ → 用作 target badge 的"是否断开"判定 + Popover 的"项目工具集合"
        │
(3) Skills.tsx · handleSubscribe(scope='project')
        │
        │ projectTools 为空 → 按钮在 Popover 已禁用，不会进入此分支（防御性双校验）
        │ projectTools 非空 → 透传给 subscribeResource，CLI 自身再次按 detectProjectTools 写入
```

### 2.2 目录结构

```
AIToolsAssistant/
├── desktop/
│   ├── src/
│   │   ├── lib/
│   │   │   └── tools.ts                           ← 新增：工具元数据 + 探测函数
│   │   ├── components/
│   │   │   ├── AddToolModal.tsx                   ← 修改：移除 AVAILABLE_TOOLS（改为从 lib/tools 导入）
│   │   │   ├── SubscribePopover.tsx               ← 修改：新增 projectTools 入参 + 写入预告文案 + 禁用态
│   │   │   └── InvalidProjectModal.tsx            ← 新增：校验失败弹窗（轻组件）
│   │   ├── pages/
│   │   │   ├── Skills.tsx                         ← 修改：渲染 badge "断开"灰态 + 透传 projectTools
│   │   │   └── Tools.tsx                          ← 修改：localTOOL_DISPLAY_MAP 改为引 lib/tools
│   │   ├── styles/
│   │   │   └── components.css                     ← 修改：追加 .badge--disabled (~12 行)
│   │   └── App.tsx                                ← 修改：handleOpenDirectory 增加校验调用 + 渲染 InvalidProjectModal
│   └── src-tauri/
│       └── src/
│           └── lib.rs                             ← 修改：新增 detect_project_tools 命令并注册
```

---

## 3. 接口定义

### 3.1 内部接口

#### 3.1.1 `desktop/src/lib/tools.ts`（新增文件）

```typescript
/**
 * 工具元数据（从 AddToolModal.tsx 迁移而来，作为前端单一真相源）
 */
export interface ToolDefinition {
  /** 工具唯一标识（与 CLI target.name 一致） */
  name: string;
  /** UI 显示名 */
  displayName: string;
  /** 用户级目录（约定 ~/<base>） */
  userBase: string;
}

/** 预定义工具列表 */
export const AVAILABLE_TOOLS: ToolDefinition[];

/**
 * 工具名 → 项目级目录候选名（含 alias 容错）
 *  · key: 工具 target.name（如 'claude-internal' / 'claude-code'）
 *  · value: 该工具在项目根目录下可能的标记目录名（带前缀点）
 */
export const TOOL_PROJECT_DIR_ALIASES: Record<string, string[]>;

/**
 * 工具名 → 显示名（含 alias 容错；任何 target.target 字段都能映射出 displayName）
 */
export const TOOL_DISPLAY_NAME: Record<string, string>;

/**
 * 获取工具的展示名；无映射时回退为 raw name
 */
export function getToolDisplayName(toolName: string): string;

/**
 * 探测项目根目录下"实际存在哪些已连接工具的标记目录"
 *
 * @param projectDir   - 项目绝对路径（必须，绝不允许走 process.cwd()）
 * @param connectedTools - 全局已连接工具的 target.name 列表
 * @returns 实际存在标记目录的工具 name 列表（保持 connectedTools 中的顺序）
 *
 * 实现：将 connectedTools 展开为候选目录名集合 → 调用 Tauri detect_project_tools
 *      → 反向映射回 tool.name 集合（去重）
 */
export function detectProjectTools(
  projectDir: string,
  connectedTools: string[],
): Promise<string[]>;
```

**双名映射示例**：

```typescript
export const TOOL_PROJECT_DIR_ALIASES = {
  codebuddy:         ['.codebuddy'],
  workbuddy:         ['.workbuddy'],
  'claude-internal': ['.claude-internal', '.claude-code'],
  'claude-code':     ['.claude-code', '.claude-internal'],
};

export const TOOL_DISPLAY_NAME = {
  codebuddy: 'CodeBuddy',
  workbuddy: 'WorkBuddy',
  'claude-internal': 'Claude Internal',
  'claude-code': 'Claude Code',
};
```

#### 3.1.2 `desktop/src/components/InvalidProjectModal.tsx`（新增文件）

```typescript
export interface InvalidProjectModalProps {
  /** 用户选择的目录绝对路径 */
  selectedPath: string;
  /** 当前已连接工具的 displayName 列表 */
  connectedTools: string[];
  /** 期望存在的标记目录名（聚合后的，如 ['.codebuddy', '.claude-internal']） */
  expectedDirs: string[];
  /** 关闭回调 */
  onClose: () => void;
}

/** 添加项目时目录不合法的提示弹窗 */
export function InvalidProjectModal(props: InvalidProjectModalProps): JSX.Element;
```

#### 3.1.3 `desktop/src/components/SubscribePopover.tsx`（修改）

**新增 props**：

```typescript
export interface SubscribePopoverProps {
  resourceName: string;
  hasProject: boolean;          // 既有
  /** 新增：当前项目实际关联的工具 name 列表（项目级 scope 是否可用的依据） */
  projectTools: string[];
  onConfirm: (scope: SubscriptionScope, sync: boolean) => void;
  onCancel: () => void;
}
```

**核心逻辑变更**（语义层）：

```typescript
const projectScopeAvailable = hasProject && projectTools.length > 0;

// 当 hasProject=true 但 projectTools=[] 时，副文案变为：
//   "当前项目未关联任何已连接的 AI 工具"
// 当 projectScopeAvailable=true 时，副文案变为：
//   "将写入 .codebuddy/skills、.claude-internal/skills"
```

#### 3.1.4 `desktop/src/pages/Skills.tsx`（修改）

新增 state：

```typescript
const [projectTools, setProjectTools] = useState<string[]>([]);
```

`loadData` 末尾追加：

```typescript
if (cliProjectDir) {
  const tools = await detectProjectTools(cliProjectDir, result.enabledTargets);
  setProjectTools(tools);
} else {
  setProjectTools([]);
}
```

target badge 渲染规则（在原 `targetStatuses.map((t) => ...)` 中）：

```typescript
const isDisconnected = !projectTools.includes(t.target);
// 渲染：
//   isDisconnected → <span className="badge badge--disabled">{getToolDisplayName(t.target)} 连接已断开</span>
//   else           → 既有 badge--<status>
```

`SubscribePopover` 调用处追加 `projectTools={projectTools}`。

#### 3.1.5 `desktop/src/App.tsx`（修改）

```typescript
async function handleOpenDirectory() {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const selected = await invoke<string | null>('open_directory_dialog');
    if (!selected) return;

    /* 新增：合法性校验 */
    const connected = enabledTargetsRef.current; // 来自 loadGlobalData 缓存的 enabledTargets
    if (connected.length > 0) {
      const projectTools = await detectProjectTools(selected, connected);
      if (projectTools.length === 0) {
        setInvalidProject({
          selectedPath: selected,
          connectedTools: connected.map(getToolDisplayName),
          expectedDirs: aggregateExpectedDirs(connected),
        });
        return; // 不写入 recentProjects
      }
    }
    /* 兼容：当用户尚未连接任何工具时，保持原行为不阻断（首次使用场景） */
    handleSelectProject(selected);
  } catch {
    const dir = window.prompt('输入项目目录路径：');
    if (dir) handleSelectProject(dir);
  }
}
```

> **注**：`enabledTargets` 已经由 `loadGlobalData()` 取到（App.tsx L145-146、L165），但当前未保存到 ref 中。需要新增一个 `useRef<string[]>([])` 同步缓存，避免在 `handleOpenDirectory` 里再次调用 listResources（重复 IO + 闪屏）。

### 3.2 外部接口（Tauri Commands）

| 命令 | 入参 | 出参 | 说明 |
|------|------|------|------|
| `detect_project_tools` | `{ projectDir: string, candidateDirs: string[] }` | `Vec<String>`（实际存在的子目录名） | 仅做 `Path::join + try_exists`，纯只读 |

**Rust 签名**：

```rust
/// Tauri command：探测项目根目录下哪些子目录存在
///
/// 输入：项目绝对路径 + 候选目录名列表（已带 . 前缀，如 [".codebuddy", ".claude-internal"]）
/// 输出：项目根目录下实际存在的目录名（保持输入顺序，去重）
/// 错误：projectDir 不存在或不是目录时返回 Err
#[tauri::command]
fn detect_project_tools(
    project_dir: String,
    candidate_dirs: Vec<String>,
) -> Result<Vec<String>, String> {
    let root = std::path::Path::new(&project_dir);
    if !root.is_dir() {
        return Err(format!("项目目录不存在或不是目录: {}", project_dir));
    }
    let mut found = Vec::new();
    for name in candidate_dirs {
        let p = root.join(&name);
        if p.is_dir() {
            if !found.contains(&name) {
                found.push(name);
            }
        }
    }
    Ok(found)
}
```

注册位置：`invoke_handler!` 末尾追加 `detect_project_tools`（lib.rs L316-322）。

---

## 4. 数据模型

### 4.1 GuiState（不变）

GuiState 无需修改——projectTools 是动态计算结果，不进 state（D-7）。

### 4.2 Skills 页本地 state（增量）

```typescript
// 既有
const [result, setResult] = useState<ResourceListResult | null>(null);

// 新增
const [projectTools, setProjectTools] = useState<string[]>([]);
const [projectToolsLoading, setProjectToolsLoading] = useState(false);
```

### 4.3 App 全局 ref / state（增量）

```typescript
// 用 ref 缓存当前已连接工具，避免 handleOpenDirectory 重复调 CLI
const enabledTargetsRef = useRef<string[]>([]);

// 校验失败弹窗 state
const [invalidProject, setInvalidProject] = useState<{
  selectedPath: string;
  connectedTools: string[];
  expectedDirs: string[];
} | null>(null);
```

---

## 5. 影响范围分析

### 5.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|------|---------|---------|
| `desktop/src/components/AddToolModal.tsx` | 删除 L9-24 的 AVAILABLE_TOOLS / ToolDefinition 定义，改为 `import { AVAILABLE_TOOLS, ToolDefinition } from '../lib/tools'` | 低（仅模块迁移，行为不变） |
| `desktop/src/components/SubscribePopover.tsx` | 新增 `projectTools: string[]` prop；在 L97-126 项目级 label 中新增"将写入 .x/skills"副文案与三态（available/disabled-no-project/disabled-no-tools） | 中 |
| `desktop/src/pages/Skills.tsx` | (a) loadData 后调 `detectProjectTools`；(b) target badge 渲染加"断开"分支（L775-784）；(c) SubscribePopover 调用透传 `projectTools`（L462-469） | 中 |
| `desktop/src/pages/Tools.tsx` | L54-58 局部 displayName map 改为引用 `getToolDisplayName` | 低 |
| `desktop/src/App.tsx` | (a) loadGlobalData 中将 enabledTargets 写入 ref；(b) handleOpenDirectory 增加合法性校验；(c) 新增 InvalidProjectModal 渲染入口 | 中 |
| `desktop/src/styles/components.css` | 追加 `.badge--disabled` 样式块（约 12 行） | 低 |
| `desktop/src-tauri/src/lib.rs` | (a) 新增 `detect_project_tools` 命令；(b) `invoke_handler!` 注册 | 低（无 unsafe，无新依赖） |

### 5.2 新增文件

| 文件 | 用途 |
|------|------|
| `desktop/src/lib/tools.ts` | 工具元数据 + 双名映射 + `detectProjectTools` |
| `desktop/src/components/InvalidProjectModal.tsx` | 添加项目失败弹窗（轻组件，~80 行） |

### 5.3 依赖变更

无依赖变更：

- 前端：复用既有 `@tauri-apps/api/core`、`lucide-react`、`react`
- Rust：仅 `std::path / std::fs`，无新 crate

### 5.4 与 FEAT-005 的边界

本任务为 FEAT-005 留下的兼容代码：

| 位置 | 是 FEAT-005 删除目标 |
|------|---------------------|
| `TOOL_PROJECT_DIR_ALIASES` 中 `claude-code` 与 `claude-internal` 的双向 alias | ✅（待 FEAT-005 统一为单向） |
| `TOOL_DISPLAY_NAME` 中两个 claude key | ✅（FEAT-005 删除其中之一） |

FEAT-005 实施后，本任务的代码改动不需要回滚，只需简化映射表。

---

## 6. 实现步骤

| 步骤 | 描述 | 预计工作量 |
|------|------|-----------|
| 1 | **Rust 端**：在 `lib.rs` 添加 `detect_project_tools` 命令并在 `invoke_handler!` 注册；本地 `cargo check` 通过 | 30 min |
| 2 | **共享模块**：新建 `desktop/src/lib/tools.ts`，迁入 AVAILABLE_TOOLS、加映射表、实现 `detectProjectTools / getToolDisplayName / aggregateExpectedDirs` | 45 min |
| 3 | **回填引用**：修改 `AddToolModal.tsx` 和 `Tools.tsx` 改为从 `lib/tools` 引用（不引入行为变更），跑通 `pnpm dev` 确认无回归 | 20 min |
| 4 | **样式**：在 `components.css` 追加 `.badge--disabled` | 10 min |
| 5 | **InvalidProjectModal 组件**：实现 `desktop/src/components/InvalidProjectModal.tsx`（用 `.modal--sm` + 既有 token） | 45 min |
| 6 | **App.tsx 校验流**：handleOpenDirectory 增加 detect → 弹 modal 分支；缓存 enabledTargets 到 ref；渲染 InvalidProjectModal | 60 min |
| 7 | **Skills 页 projectTools state**：loadData 后探测 + 透传至 SubscribePopover；首次进入有 projectToolsLoading 兜底 | 45 min |
| 8 | **target badge 断开态**：在 Skills.tsx target.map 加 `isDisconnected` 分支，渲染 `.badge--disabled` 与短提示 | 30 min |
| 9 | **SubscribePopover 三态**：实现 available / disabled-no-project / disabled-no-tools 文案与 radio 禁用 | 45 min |
| 10 | **联调**：四种场景手测（详见第 7 章风险中的「测试矩阵」） | 60 min |
| 11 | **Lint + 类型检查 + 构建**：`pnpm lint && pnpm tsc --noEmit && pnpm build`；Rust 侧 `cargo check` | 20 min |
| 12 | **更新编码日志 04-coding-log.md** | 同步进行 |

合计：约 7 小时（不含调试与单测补充）。

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| Tauri 命令注册遗漏导致前端 invoke 报错（参考既有 `read_gui_state/write_gui_state` 漏注册的坑） | 中 | 中 | 实现后立即 `cargo check + pnpm dev` 跑一次；测试矩阵第 1 项强制覆盖 |
| `enabledTargets` 在 handleOpenDirectory 触发时尚未加载（启动后立刻点新增） | 低 | 中 | ref 默认 `[]` → 走"无连接工具"软兜底分支（不弹失败），与首次使用场景行为一致 |
| 用户在 macOS 选择不存在路径或软链接 | 低 | 低 | Rust 端 `is_dir()` 会兜底为 false → 视作无关联工具 → 弹失败 |
| projectTools 异步导致 SubscribePopover 首次渲染时为空集合，误判禁用 | 中 | 中 | Popover 用 `projectToolsLoading` 显示"检测中..."而非 disabled；只有加载完成后才进入 disabled 决策 |
| 双名映射误把 `.claude-code` 算给 `claude-internal` target，造成 CLI 写入歧义 | 中 | 中 | GUI 层只用映射决定"是否展示/可用"，**不传 target 给 CLI**；CLI 仍按其自身的 `detectProjectTools` 决策（以 target.name 为准），二者解耦 |
| Skills 页切换项目时 projectTools 出现"上一项目残影" | 中 | 低 | App.tsx L324 的 `key={guiState?.currentProject}` 已强制重挂载 → 子组件 state 自动重置 |
| 手测矩阵覆盖不全 | 中 | 中 | 见下「测试矩阵」 |

### 测试矩阵（手测必跑）

| # | connectedTools | 选中目录内容 | 期望 |
|---|---------------|-------------|------|
| 1 | {} (首次使用) | 空目录 | 允许添加（软兜底，与现状兼容） |
| 2 | {codebuddy} | 普通目录 | InvalidProjectModal，期望目录 .codebuddy |
| 3 | {codebuddy, claude-internal} | .codebuddy 存在 | 添加成功，projectTools={codebuddy} |
| 4 | {codebuddy, claude-internal} | .codebuddy + .claude-code 存在 | 添加成功，projectTools={codebuddy, claude-internal} ← 双名兼容 |
| 5 | {codebuddy} | .claude-internal 存在但 .codebuddy 无 | InvalidProjectModal（claude-internal 未连接） |
| 6 | {codebuddy, claude-internal} | 项目目录被外部 rm -rf 后再选 | InvalidProjectModal |
| 7 | {codebuddy, claude-internal} 后断开 claude-internal | 已添加项目（含 .claude-internal） | Skills 项目级 Tab：`.claude-internal` 行 badge 灰显 + "Claude Internal 连接已断开" |
| 8 | {codebuddy, claude-internal} | 当前项目 projectTools={codebuddy} | 未订阅区点订阅 → Popover 项目级副文案"将写入 .codebuddy/skills" |
| 9 | {codebuddy, claude-internal} | 当前项目 projectTools={} | Popover 项目级 radio 禁用 + tooltip"当前项目未关联任何已连接的 AI 工具" |

---

## 8. 回滚方案

由于本次改动**不动 CLI、不持久化新数据**，回滚成本极低：

| 改动 | 回滚动作 |
|------|---------|
| 新增 Tauri 命令 | git revert：`lib.rs` 删除命令 + 注册行 |
| 新增 `lib/tools.ts` | git revert：删文件，把 AVAILABLE_TOOLS 还原回 AddToolModal.tsx |
| `App.tsx` 校验流 | git revert：handleOpenDirectory 还原成原 5 行实现 |
| `Skills.tsx` 灰态 + projectTools | git revert：删除新增 state 与 badge 分支 |
| `SubscribePopover` 三态 | git revert：删除 projectTools prop |
| `.badge--disabled` | git revert：删除新增 CSS 块 |

无数据库变更、无配置文件结构变更、无对外 API 协议变更。

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| TD-1 | `detect_project_tools` 入参用"候选目录名列表"而非"工具名列表" | 入参传工具名，Rust 内做映射 | 让"工具名 ↔ 目录名"映射只存在于 TS 一侧，Rust 保持纯 fs 工具，未来加新工具时 Rust 不用改 |
| TD-2 | enabledTargets 用 useRef 缓存而非新 state | 重新调一次 listResources | listResources 有副作用（更新 overview 数据 + 触发 onboarding 判定），用 state 会引发依赖循环；ref 是最低侵入选择 |
| TD-3 | InvalidProjectModal 抽独立组件，不内联 App.tsx | 内联 | App.tsx 已 ~330 行，再加 80 行 modal JSX 会突破"克制先于全面"；独立组件也方便 FEAT-005 之后统一 |
| TD-4 | SubscribePopover 三态而非二态 | 把"无项目配置"和"无关联工具"合并 | 两者文案不同（前者引导初始化项目，后者解释为何禁用），合并会让用户摸不清原因（违反"诚实先于友好"） |
| TD-5 | 用户尚未连接任何工具时不阻断添加项目 | 也阻断 | 首次使用场景（FEAT-002 onboarding 之前）必须能进入应用，否则会陷入鸡生蛋；这是"克制先于全面"的具体应用 |
| TD-6 | 不在 Tauri 命令名中带 `aitools_` 前缀 | 命名空间化 | 既有命令均无前缀（`open_directory_dialog`、`ensure_project_config`），保持风格一致 |
| TD-7 | projectTools 加载中走"检测中..."而非 disabled | 默认 disabled | 避免首屏闪烁让用户误以为按钮永久不可用（Skills 页 SubscribePopover 是按需弹出，加载延迟可见） |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-08 | 初稿创建（含 7 个 TD 决策、9 项手测矩阵、12 步实现路径） | AI |

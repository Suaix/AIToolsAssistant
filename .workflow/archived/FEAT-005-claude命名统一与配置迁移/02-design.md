# UI/UX 设计文档：claude 命名统一 + 旧 config 迁移

> **任务编号**：FEAT-005
> **创建日期**：2026-05-09
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **状态**：草稿（待 DESIGN → TECHNICAL 门禁）

---

## 1. 设计目标

本任务以**底层数据/语义改造**为主、UI 表层改动为辅。设计阶段重点解决：

1. **存量用户 0 操作完成 schema 升级与命名统一** —— 迁移过程对用户透明，但关键节点必须有可见反馈（不能静默改写用户磁盘上的文件）
2. **目录守卫反馈对用户友好** —— 从"sync 一切就成功"变成"未安装的工具被明确跳过"时，CLI 与 GUI 必须给出一致、可理解的状态
3. **Claude 工具改名对用户感知最小化** —— 用户不需要理解 `claude-internal` 这个内部命名为什么变化，只需要看到「Claude 工具配置已升级」即可

设计原则参照仓库 L2 四条铁律：
- **诚实先于友好**：迁移失败要明说，不卖萌
- **状态先于功能**：未安装的工具必须有"未检测到"状态条目，而不是隐藏掉
- **明确先于惊喜**：迁移弹窗里所有变更项一一列出，不出现"自动处理了一些事"
- **克制先于全面**：不为本任务新增独立菜单项；迁移走启动时一次性弹窗

---

## 2. 信息架构

### 2.1 涉及的页面与触点

```
CLI 触点
├── aitools <任意命令>              ← 启动时迁移检测（透明 / 一行提示 / 阻断式弹错三态）
├── aitools sync                    ← 目录守卫：未安装工具的跳过提示
├── aitools sync --target <name>    ← 用户主动指定不存在工具时的阻断
└── aitools list                    ← Claude 显示名同步为「Claude Internal」

GUI 触点
├── App 启动初始化流程              ← 迁移检测 + MigrationModal
├── Skills 页 SyncProgressModal     ← 目录守卫：未检测到工具行
├── Settings 页                     ← 迁移完成提示（次要）
└── AddToolModal                    ← Claude 选项展示名同步（弱影响）
```

### 2.2 用户流程

#### 流程 A：存量用户首次升级到含 FEAT-005 的版本（典型路径）

```
启动 CLI / GUI
    ↓
读取 ~/.aitools/config.yaml
    ↓
检测 version 字段
    ├── 已是当前版本 ────────→ 直接进入正常流程（< 5ms）
    │
    ├── 缺失 / 旧版本（v0.2 / v0.4）
    │       ↓
    │   备份原文件为 config.yaml.bak（覆盖式）
    │       ↓
    │   逐版本应用迁移函数（v0.2 → v0.4 → 当前）
    │       ↓
    │   字段级迁移：
    │     · user_path → user_base
    │     · 补 user_subscriptions
    │     · claude-code/claude → claude-internal（含 user_base 改写）
    │       ↓
    │   写回新版 config.yaml
    │       ↓
    │   ┌─ CLI：单行提示「配置已自动升级到 v1.x（备份：~/.aitools/config.yaml.bak）」
    │   └─ GUI：弹出 MigrationModal（一次性，关闭后不再弹）
    │       ↓
    │   遍历项目级 .aitools/project.yaml（仅 GUI 当前选中项目）做相同迁移
    │       ↓
    │   旧用户级目录搬迁：检测 ~/.claude-code、~/.claude（旧 user_base）
    │     ├── 不存在 ──→ 跳过（aitools 不主动 mkdir 新 user_base）
    │     └── 存在 ──→ 合并到 ~/.claude-internal
    │            ├── 同名内容相同 → 直接跳过该文件
    │            ├── 同名内容不同 → 列入冲突报告，**不静默覆盖**
    │            └── 全部完成 → 删除旧目录（仅当全部资源已成功承接）
    │       ↓
    │   旧项目级目录搬迁：当前项目 .claude-code → .claude-internal（同上策略）
    │       ↓
    │   进入正常流程
    │
    └── 文件损坏 / 解析失败
            ↓
        阻断启动，输出错误 + 备份路径，不进入静默写入路径
```

#### 流程 B：未安装某工具但 enabled，执行 sync（目录守卫）

```
aitools sync 或 GUI 同步
    ↓
遍历 enabled targets
    ↓
对每个 target：
    ├── assertToolUserHomeExists(target.user_base 展开后路径)
    │     ├── 存在 ──→ 进入资源同步（创建 <user_base>/<resourceDir>/<name>/ 子层级）
    │     └── 不存在 ──→ 跳过该 target，标记 "未检测到该工具"
    │
    └── 项目级同步同理：assertToolProjectHomeExists(<projectDir>/.<targetName>)
            ↓
        汇总所有"已跳过"target 形成报告
            ↓
        ┌─ CLI：表格中标记「跳过 — 未检测到 Claude Internal (~/.claude-internal 不存在)」
        └─ GUI：SyncProgressModal 行状态展示为「未检测到」（灰色 + 信息图标）
```

#### 流程 C：用户主动指定不存在的工具（阻断分支）

```
aitools sync --target claude-internal
    ↓
assertToolUserHomeExists 返回 false
    ↓
CLI 阻断式报错：
  ✗ 未检测到 Claude Internal（路径 ~/.claude-internal 不存在）
    aitools 不会代为创建 AI 工具家目录。请先安装该工具或使用其他 target。
    ↓
非 0 退出码
```

---

## 3. 页面设计

### 3.1 GUI：MigrationModal（新增）

**功能描述**：存量用户首次启动 GUI 时，告知配置已自动升级；列出关键变更项；提供「查看详情」展开。一次性，关闭后通过本地标记不再弹。

**布局结构**：

```
┌────────────────────────────────────────────────────┐
│  配置已自动升级                              [×]    │
├────────────────────────────────────────────────────┤
│                                                    │
│  我们检测到旧版配置并已为你完成升级。               │
│  原始配置已备份至：                                 │
│    ~/.aitools/config.yaml.bak                       │
│                                                    │
│  ▼ 变更详情（默认折叠）                             │
│    · 配置 schema：v0.4.0 → v0.5.0                   │
│    · Claude 工具命名统一：                          │
│        claude-code → claude-internal                │
│        ~/.claude   → ~/.claude-internal             │
│    · 已合并 2 个用户级旧资源到新目录                │
│    · 已合并 1 个项目级旧资源到新目录                │
│                                                    │
│  ⚠️  以下文件存在冲突，需要你手动处理：             │
│    （仅在有冲突时显示）                             │
│    · ~/.claude-internal/skills/foo/  vs  原文件     │
│       [打开备份] [打开新位置]                       │
│                                                    │
│  ────────────────────────────────────────────────  │
│                          [我知道了]  [查看完整日志]  │
└────────────────────────────────────────────────────┘
```

**交互说明**：

| 元素 | 交互行为 | 触发条件 |
|------|---------|---------|
| 弹窗本身 | 启动时若 `localStorage.aitools.migrationAck.<version>` 不存在则弹出 | 配置发生过迁移 |
| ▼ 变更详情 | 点击展开/折叠 | 默认折叠，节省视觉重量 |
| `~/.aitools/config.yaml.bak` 路径 | 等宽字体，可点击复制 | 与 Settings 页路径展示一致 |
| ⚠️ 冲突区块 | 仅在 `conflicts.length > 0` 时显示 | 同名资源内容不同 |
| [打开备份] / [打开新位置] | 调用 Tauri `open` 命令打开对应文件 | 冲突项专属 |
| [我知道了] | 主按钮（Primary），关闭并写入本地标记 | — |
| [查看完整日志] | 次按钮（Secondary），打开 `~/.aitools/migration.log` | 日志已落盘 |

**文案要求**（反"卖萌式错误文案"红线）：
- 标题：「配置已自动升级」（陈述事实，不用「啦」「哟」「来啦」）
- 失败场景禁用：哎呀 / 噢 / 小问题 / 抱歉打扰

### 3.2 GUI：SyncProgressModal —— 目录守卫行（修改）

**功能描述**：复用既有 SyncProgressModal，新增"未检测到"行状态。

**新增行状态**：

```
之前可能的行：[同步中...] [已同步] [失败]

新增第 4 种：
  ┌─────────────────────────────────────────────┐
  │ ⊘  Claude Internal              未检测到 ⓘ  │
  │    ~/.claude-internal 不存在，跳过该目标     │
  └─────────────────────────────────────────────┘
```

**视觉语言**：
- 图标：`⊘`（U+2298）灰色，区别于 ✓（成功）和 ✗（失败）
- 文字：`var(--color-text-tertiary)`（灰色 50%）
- ⓘ tooltip：「aitools 不会代为创建 AI 工具的家目录。请先安装 Claude Internal，或在 Settings 中禁用该工具。」

**行为**：
- 不计入 `failed` 计数
- 单独的 `skipped_missing_tool` 计数（用于汇总文案 "x 跳过 y 失败"）

### 3.3 CLI：sync 输出（修改）

**目录守卫的提示样式**（picocolors 着色）：

```
$ aitools sync

→ 同步用户级资源...

  CodeBuddy           ✓  已同步 12 项
  Claude Internal     ⊘  未检测到（~/.claude-internal 不存在），已跳过

→ 完成：12 已同步 / 0 失败 / 1 跳过（未检测到工具）

提示：跳过的工具不会被自动安装。如需启用，请先安装对应工具或在配置中禁用：
  aitools target disable claude-internal
```

**配色**：
- ✓ 绿（picocolors.green）
- ✗ 红（picocolors.red）
- ⊘ 灰（picocolors.gray）—— **新增使用**

### 3.4 CLI：迁移触发的提示（启动时）

**静默路径（无迁移）**：无任何输出，与现状一致。

**有迁移发生**：

```
$ aitools list

ℹ 检测到旧版配置，已自动升级（备份：~/.aitools/config.yaml.bak）
  · schema v0.4.0 → v0.5.0
  · Claude 工具：claude-code → claude-internal

[正常 list 输出 ...]
```

**冲突场景（需用户介入）**：

```
$ aitools sync

✗ 配置迁移检测到资源冲突，请手动处理后重试：

  ~/.claude/skills/foo/         ←→  ~/.claude-internal/skills/foo/
  ~/.claude/commands/bar/       ←→  ~/.claude-internal/commands/bar/

  原配置已备份至 ~/.aitools/config.yaml.bak
  迁移日志位于 ~/.aitools/migration.log

  请检查冲突文件，移除其中一份后重新运行 aitools 命令。
```

非 0 退出码，阻断后续命令。

### 3.5 GUI：AddToolModal（弱修改）

唯一改动：Claude 选项的 `displayName` 由「Claude Internal」保持不变，列表数据来自 SSOT；目录提示行同步从 `~/.claude-internal` 取值。

无新组件、无新交互。

---

## 4. 状态枚举

### 4.1 配置迁移状态（CLI / GUI 共用）

| 状态 | 描述 | 视觉表现 | 触发 |
|------|------|---------|------|
| `up_to_date` | 已是当前 schema | 无任何输出 / 弹窗 | version === CURRENT |
| `migrated` | 成功迁移 | CLI: 单行 ℹ 提示；GUI: MigrationModal | version < CURRENT 且无冲突 |
| `migrated_with_conflicts` | 迁移成功但旧资源合并有冲突 | CLI: 阻断式 ✗ 报错；GUI: MigrationModal 内 ⚠️ 区块 | 旧 user_base/旧项目目录有同名内容不同的资源 |
| `parse_failed` | 配置文件解析失败 | CLI: 阻断式 ✗ 报错；GUI: 启动错误页 | yaml 损坏 |
| `write_failed` | 迁移写入失败（如磁盘满） | CLI: 阻断式 ✗ 报错带 `.bak` 路径；GUI: 启动错误页 | fs 异常 |

### 4.2 目录守卫状态（每个 target）

| 状态 | 描述 | 视觉表现 |
|------|------|---------|
| `present` | 工具家目录存在，正常同步 | ✓ 已同步（绿）|
| `missing_user_home` | `~/.<tool>` 不存在 | ⊘ 未检测到（灰） |
| `missing_project_home` | `<project>/.<tool>` 不存在 | ⊘ 未检测到（灰） |
| `forced_blocked` | 用户用 `--target` 显式指定但工具不存在 | ✗ 阻断式错误（红） |

### 4.3 迁移过程消息分级

| 级别 | logger | 用途 |
|------|--------|------|
| INFO | `logger.info` | 正常迁移成功（CLI 单行提示来源）|
| WARN | `logger.warn` | 跳过的 target / 旧目录已合并但删除失败 |
| ERROR | `logger.error` | 迁移失败 / 资源冲突 |

---

## 5. 组件清单

| 组件名 | 来源 | 说明 |
|--------|------|------|
| MigrationModal | **需新增**（`desktop/src/components/MigrationModal.tsx`） | 一次性弹窗，参照 InvalidProjectModal 风格 |
| SyncProgressModal | 已有 | 新增"未检测到"行状态（沿用既有结构）|
| AddToolModal | 已有 | 数据源切换为 SSOT（无视觉变化）|
| Button (`.btn .btn--primary` / `.btn--secondary`) | 既有设计系统 | MigrationModal 底部按钮 |
| Tooltip | 既有 | ⓘ 图标的解释文案 |
| 等宽路径文本 | 既有 token `--font-mono` | `~/.aitools/config.yaml.bak` 等路径展示 |

**禁用项**（红线）：
- 不创建独立"迁移中心"页面（违反「克制先于全面」）
- 不为目录守卫单独建 ToolStatusPanel（沿用 SyncProgressModal）

---

## 6. 响应式 / 适配策略

| 断点 | 布局调整 |
|------|---------|
| GUI 默认窗口（≥ 800px） | MigrationModal 居中，max-width 560px |
| 窄窗口（< 800px） | MigrationModal 全宽（margin 16px），变更详情默认折叠仍生效 |
| CLI | 不涉及响应式；由 picocolors 处理 TTY 检测，非 TTY 不输出颜色 |

---

## 7. 设计资产

本任务以底层逻辑为主，仅 1 个新增组件 + 既有组件状态扩展，**不需要单独原型图**。文字版规约已在 §3 完整描述。如后续需要可视化稿，统一放到 `assets/` 目录。

---

## 8. 设计决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| D-1 | 迁移成功后 CLI 仅一行提示，GUI 弹一次性 Modal | (a) CLI 也弹大块提示；(b) GUI 也只一行 toast | CLI 用户多为脚本/重复调用，过度提示是噪声；GUI 用户是手动操作，关键变更需明确告知一次 |
| D-2 | 用 `⊘` 灰色而非省略隐藏「未检测到」工具 | 直接从 sync 列表中过滤掉未安装工具 | L2「状态先于功能」铁律：用户必须看到自己的配置在哪里被跳过，否则会以为同步成功 |
| D-3 | MigrationModal 一次性（按 schema version 维度去重） | 每次启动都弹 / 永久弹直到用户操作 | 一次性符合「克制先于全面」；按 version 去重确保下次升级仍能告知 |
| D-4 | 资源冲突时不静默覆盖，强制阻断 | 自动备份冲突文件后覆盖 | L2「诚实先于友好」：用户磁盘上的内容不能被 aitools 单方面决策 |
| D-5 | `.bak` 仅保留最近一次（覆盖式） | 时间戳多版本 | 已在需求决策（Q-5）；本设计配合：MigrationModal 路径展示固定为单一路径，UI 更简洁 |
| D-6 | 迁移触发点放在 `loadConfig` 内部，非独立命令 | 增加 `aitools migrate` 子命令 | 透明化是核心目标；独立命令意味着用户需知道存在迁移 → 提高心智成本 |
| D-7 | 目录守卫的失败文案不教用户"运行 mkdir" | 提示「请运行 `mkdir ~/.codebuddy`」 | mkdir 是 AI 工具自身职责，aitools 不应越权暗示用户绕过该原则 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建（用户旅程 / 状态枚举 / MigrationModal 规约 / CLI 输出格式 / 7 项设计决策） | AI |

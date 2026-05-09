# 需求文档：claude 命名统一 + 旧 config 迁移

> **任务编号**：FEAT-005
> **创建日期**：2026-05-09
> **状态**：定稿（待 ANALYSIS → DESIGN 门禁）

---

## 1. 背景与目标

### 1.1 背景

代码摸底发现，针对 Claude Code 这一 AI 工具的标识符在仓库中存在 **三处不一致** 的实现，已造成 init / target add / GUI AddTool 写出的 target 名不同，是潜在的脏数据来源：

| 位置 | name | user_base |
|---|---|---|
| `src/config/manager.ts` `getDefaultTargets()`（CLI `init` 默认） | `claude-code` | `~/.claude` |
| `src/commands/target.ts` `AVAILABLE_TOOLS`（CLI `target add`） | `claude-internal` | `~/.claude-internal` |
| `desktop/src/lib/tools.ts` `AVAILABLE_TOOLS`（GUI AddToolModal） | `claude-internal` | `~/.claude-internal` |

同时存在以下基础设施缺失：

1. **`Config` 顶层无 `version` 字段**：当前对 v0.2.0 / v0.4.0 schema 变化的处理是「校验失败 → 抛错让用户 `rm -rf ~/.aitools && aitools init`」，对存量用户成本高。
2. **AI 工具枚举无单一真相源（SSOT）**：CLI default / CLI add / GUI add / display name / 项目目录别名 五处各自维护，已经在 `desktop/src/lib/tools.ts` 留下「FEAT-005 完成统一后可简化」的 TODO。
3. **`desktop/src/lib/tools.ts:TOOL_PROJECT_DIR_ALIASES`** 临时双名映射（`.claude-internal` ↔ `.claude-code`），属于过渡兼容代码。

### 1.2 目标

用一句话：**让 Claude 工具在 CLI / GUI / 配置 / 文档全链路使用同一个标识符；为存量用户提供无感知的配置自动迁移；同时收敛 aitools 的目录创建职责，不再越界主动创建 AI 工具家目录。**

具体四个目标：

1. 选定 Claude 工具的 **唯一规范名 `claude-internal`**（user_base `~/.claude-internal`），统一到 CLI default、CLI add、GUI add、display map、文档示例。
2. 给 `Config` 与 `ProjectConfig` 引入 `version` 字段，建立 **schema 版本感知的迁移管线** `read → migrate → validate → normalize`。
3. 存量用户启动新版本 CLI / GUI 时，**自动把旧 config 升级到新 schema**（含 claude 名改写），不再要求用户手动重建。
4. **守住目录创建边界**：aitools 自身只创建 `~/.aitools/` 与 `<project>/.aitools/`；对 AI 工具家目录（`~/.claude-internal/`、`~/.codebuddy/`、`<project>/.claude-internal/` 等）只读不写，不存在时跳过/报错而非 mkdir。

---

## 2. 用户故事

| 编号 | 用户故事 | 优先级 |
|------|---------|--------|
| US-1 | 作为 Alex（同时用多种 AI 工具的开发者），我希望 CLI 命令、GUI 操作和文档里 Claude 工具的标识符完全一致，以便我不会因为别名分裂而误操作 / 重复添加 | P0 |
| US-2 | 作为已经在用 v0.4.x 的存量用户，我希望升级到含本次改动的新版本后，我的 `~/.aitools/config.yaml` 和各项目的 `.aitools/project.yaml` 能被自动迁移到新 schema，以便我不需要 `rm -rf` 重建 | P0 |
| US-3 | 作为已经把资源同步到 `~/.claude-internal/` 的存量 GUI 用户，我希望升级后旧目录的资源能被合并/迁移到统一后的目标目录，以便不会出现「同一份资源在两个目录」的双写状态 | P1 |
| US-4 | 作为开发者，我希望仓库里有 **唯一一份 AI 工具注册表**，新增 / 修改工具元信息时只改一个文件，以便不再出现 FEAT-005 此类多处不一致 | P1 |
| US-5 | 作为遇到迁移失败的用户，我希望迁移过程对原文件做备份，并给出清晰的错误提示和回滚路径，以便我不会丢失配置 | P1 |
| US-6 | 作为本机尚未安装某个 AI 工具的用户，我希望 aitools 在执行 `sync` 等命令时**不会主动创建该工具的家目录**（`~/.claude-internal/`、`~/.codebuddy/` 或项目级 `.claude-internal/`），而是检测到不存在时明确跳过/报错，以便保持 aitools「资源管家」的语义边界 | P0 |

---

## 3. 功能范围

### 3.1 包含（In Scope）

#### 3.1.1 命名统一
- [ ] **统一规范名：`claude-internal`，user_base：`~/.claude-internal`**（已决策，见 Q-1/Q-2）
- [ ] 统一 `getDefaultTargets()`（CLI init 默认）
- [ ] 统一 `src/commands/target.ts:AVAILABLE_TOOLS`（CLI target add）
- [ ] 统一 `desktop/src/lib/tools.ts:AVAILABLE_TOOLS`（GUI AddTool）
- [ ] 统一 display name 映射（CLI list / GUI tool name）
- [ ] 抽取统一的 AI 工具注册表（SSOT），CLI 与 desktop 共享（位置推迟到 TECHNICAL）

#### 3.1.2 Schema 版本与迁移
- [ ] `Config` 顶层增加 `version` 字段
- [ ] `ProjectConfig` 顶层增加 `version` 字段
- [ ] 建立迁移管线：`loadConfig` 改为 `read → migrate → validate → normalize`
- [ ] 编写 v0.2.0 → 当前的迁移函数（`user_path` → `user_base`）
- [ ] 编写 v0.4.0 → 当前的迁移函数（补 `user_subscriptions`）
- [ ] 编写 claude 改名迁移函数：把 `claude-code`（含 user_base `~/.claude`）改写为 `claude-internal`（含 user_base `~/.claude-internal`）
- [ ] 迁移前对原文件做单份 `.bak` 备份（覆盖式，仅保留最近一次）
- [ ] 迁移失败时给出明确错误并提示 `.bak` 路径
- [ ] CLI 与 GUI 启动时均触发迁移检查

#### 3.1.3 用户级资源目录迁移（P1，且不违反目录边界）
- [ ] 检测存量 `~/.claude-code/`、`~/.claude/`（旧 user_base 资源目录）是否存在
- [ ] 若存在则合并到新 user_base `~/.claude-internal/`；同名冲突报错而非静默覆盖
- [ ] **仅在旧目录已存在时操作**；aitools 不主动创建任何 AI 工具家目录
- [ ] 项目级 `.claude-code/` → `.claude-internal/` 同样处理（仅当旧目录存在）
- [ ] 下线 `desktop/src/lib/tools.ts:TOOL_PROJECT_DIR_ALIASES`（已决策，见 Q-6）

#### 3.1.4 目录创建边界守卫（新增，P0）
- [ ] 在 `src/core/syncer.ts:syncResourceToDir` 进入 `mkdir(targetBaseDir, { recursive: true })` 之前插入「父目录存在性断言」
- [ ] 用户级断言：`expandTilde(target.user_base)` 不存在 → 跳过该 target，记录 `skipped` 原因「AI 工具 X 未检测到」
- [ ] 项目级断言：`<projectDir>/.<targetName>` 不存在 → 跳过该 target，同上
- [ ] 跳过事件需通过 logger / 流式 onProgress 上报，CLI 与 GUI 均能展示
- [ ] `syncProjectResources` 交互式 checkbox 分支：用户勾选了不存在工具时给出明确提示「请先安装/初始化对应工具，aitools 不会代为创建」
- [ ] 抽出语义化辅助函数 `assertToolUserHomeExists(target)` / `assertToolProjectHomeExists(projectDir, targetName)` 便于复用与单测
- [ ] 全量审查 `src/**` 与 `desktop/src-tauri/src/**` 的 mkdir / create_dir_all 调用，确认仅作用于 aitools 自身目录

#### 3.1.5 文档与示例同步
- [ ] 更新 README.md 工具表 / config 示例 / target 示例 / list 输出示例
- [ ] 更新 CLAUDE.md / CODEBUDDY.md（如涉及）
- [ ] v0.4.0 升级指引节改为「自动迁移」，不再要求 `rm -rf`
- [ ] 在 docs/rfcs/ 下新增（或更新）一份说明引入迁移的 RFC，澄清 v0.4.0 RFC 中「不提供 migrate」的立场变化
- [ ] RFC 中明确「目录创建边界」原则，写入设计文档供后续参考

#### 3.1.6 测试
- [ ] 命名统一后的单元测试（fixture 名同步）
- [ ] 迁移函数的单元测试（每个迁移版本至少一个 happy path + 一个异常）
- [ ] 端到端：v0.2.0 / v0.4.0 / claude-code（旧名）三种存量配置启动后被正确迁移
- [ ] 目录守卫单元测试：`syncResourceToDir` 在 user_base 不存在时正确跳过
- [ ] 目录守卫端到端测试：用户未装 codebuddy 但 enabled，sync 流程不创建 `~/.codebuddy/`

### 3.2 不包含（Out of Scope）

- 不变更资源同步（sync）核心算法（仅在入口插入存在性断言）
- 不变更订阅模型（v0.4.0 的 user_subscriptions 字段语义保持不变）
- 不引入新的 AI 工具
- 不重构 Tauri 命令接口（只改读写实现）
- 不处理「用户手动改过的非法 config」—— 此类情况仍走 validate 报错
- 不支持从 v0.1.x 或更早版本迁移
- 不在 GUI 中提供「为我安装 Claude Code」一键功能 —— 安装 AI 工具本身始终是用户自己的事

---

## 4. 验收标准（Acceptance Criteria）

### US-1 验收标准（命名统一）

- [ ] **Given** 一份新装环境 **When** 执行 `aitools init` 全选默认 **Then** 写出的 `config.yaml` 中 Claude 工具的 `name` 与 `target.ts:AVAILABLE_TOOLS`、`desktop/src/lib/tools.ts:AVAILABLE_TOOLS` 中的标识符 **完全一致**
- [ ] **Given** 启动 GUI **When** 打开 AddToolModal **Then** Claude 工具显示名与 CLI `aitools list` 输出的列名一致
- [ ] **Given** 全文 grep 仓库 **When** 搜索旧名 **Then** 仅在迁移代码 / 兼容别名映射 / RFC 历史记录 / 备份文件命名等明确语义场景出现，不出现在新写的业务路径
- [ ] **Given** 仓库中存在唯一的 AI 工具注册表文件 **When** 新增一个工具元信息 **Then** CLI 与 desktop 都自动获得该工具，无需在多处同步

### US-2 验收标准（旧 config 自动迁移）

- [ ] **Given** 一份 v0.2.0 schema 的 `~/.aitools/config.yaml`（含 `user_path` 字段、无 `user_subscriptions`、无 `version`）**When** 升级版本后首次执行任意 CLI 命令 **Then** 配置被自动迁移到当前 schema、`version` 字段被写入、原文件已备份为 `config.yaml.bak`（覆盖式单份）
- [ ] **Given** 一份 v0.4.0 schema 的 `~/.aitools/config.yaml`（无 `version`、含 `claude-code` target 与 `~/.claude` user_base）**When** 升级版本后首次启动 GUI **Then** 配置被自动迁移、claude target 被改写为 `claude-internal`、user_base 被改写为 `~/.claude-internal`
- [ ] **Given** 所有项目的 `.aitools/project.yaml` 缺 `version` 字段 **When** 任意 CLI 命令在该项目目录下执行 **Then** 项目配置被迁移并写入 `version`
- [ ] **Given** 迁移过程中目标文件已是最新 schema **When** 启动命令 **Then** 不重复迁移、不修改文件 mtime、不重新生成 `.bak`

### US-3 验收标准（旧 user_base 资源目录迁移）

- [ ] **Given** 存量用户存在 `~/.claude/` 或 `~/.claude-code/`（旧 user_base 资源目录）且新 user_base `~/.claude-internal/` 不存在 **When** 升级后首次同步 **Then** 旧目录资源被合并到新目录；**aitools 主动 mkdir 新目录的行为仅限于"旧目录的资源已存在并需要承接"这一前提**
- [ ] **Given** 旧目录与新目录均存在同名资源且内容不同 **When** 迁移触发 **Then** 不静默覆盖，明确报错列出冲突文件，让用户决定
- [ ] **Given** 用户从未把资源同步到 `~/.claude*/` 任何形态目录 **When** 升级后启动 **Then** **不创建任何 AI 工具家目录**

### US-4 验收标准（SSOT 注册表）

- [ ] **Given** 仓库 **When** 搜索「Claude Code」/「Claude Internal」展示名 **Then** 仅出现在 SSOT 与 i18n 文案文件
- [ ] **Given** 修改 SSOT 中某工具的 user_base **When** 重新构建 CLI 与 desktop **Then** 两端默认值同步变化，不需要改其他文件

### US-5 验收标准（迁移健壮性）

- [ ] **Given** 迁移过程中写入失败（如磁盘满） **When** 用户重试 **Then** 原文件内容未损坏（可从 `.bak` 恢复），错误消息包含 `.bak` 路径
- [ ] **Given** 用户的 yaml 是非法/损坏的 **When** 迁移触发 **Then** 不进入静默写入路径，明确报错并保留原文件

### US-6 验收标准（目录创建边界守卫）

- [ ] **Given** 用户的 `config.yaml` 中 enabled 了 `codebuddy`，但本机 `~/.codebuddy/` 不存在 **When** 执行 `aitools sync` **Then** 该 target 被跳过、控制台输出明确提示「未检测到 CodeBuddy（路径 ~/.codebuddy 不存在），跳过」**且 `~/.codebuddy/` 目录在命令结束后仍不存在**
- [ ] **Given** 项目 `.aitools/project.yaml` 含 skill 订阅、enabled target `claude-internal`，但项目根目录下 `.claude-internal/` 不存在 **When** 执行项目级 sync **Then** 该 target 被跳过，**项目根目录下不出现 `.claude-internal/`**
- [ ] **Given** GUI Skills 页执行同步、enabled target 的 user_base 不存在 **When** 同步进度面板渲染 **Then** 该 target 行显示为「跳过 / 未安装」，不产生任何"成功"事件
- [ ] **Given** 用户在 `aitools sync --target` 交互式 checkbox 中勾选了一个 `~/.<tool>/` 不存在的工具 **When** 用户确认 **Then** CLI 给出阻断式错误提示，**不执行任何 mkdir**
- [ ] **Given** 全量审查 `src/**` 与 `desktop/src-tauri/src/**` 的 mkdir/create_dir 调用 **When** 审查清单产出 **Then** 每一处 mkdir 的目标路径要么属于 `~/.aitools/` 或 `<project>/.aitools/`，要么属于已存在的 AI 工具家目录的子层级（资源类型 / 资源名）

---

## 5. 非功能性需求

| 维度 | 要求 |
|------|------|
| 性能 | 迁移逻辑在每次 CLI 命令启动时执行，对已是最新版的配置必须 < 5ms（仅读 + 比较 version） |
| 兼容性 | 支持从 v0.2.0、v0.4.0、v0.4.x（含 claude-internal）迁移到当前；不要求支持 v0.1.x 或更早 |
| 安全性 | 迁移前必须备份原文件；备份保留至少 30 天的提示（实际不主动清理） |
| 可观测性 | 迁移发生时通过 logger 输出 `INFO` 级日志，包含 from-version → to-version、备份文件路径 |
| 文档 | README + RFC 同步更新；CLAUDE.md / CODEBUDDY.md 内容如有引用同步 |

---

## 6. 约束与依赖

- **技术约束**：
  - 所有改动必须配套 Vitest 单元测试
  - 不能在循环内创建新对象（项目规则）
  - 单方法 ≤ 100 行、单文件 ≤ 5000 行
  - 全量中文注释
- **外部依赖**：
  - `yaml` 库（已有）—— 解析 / 序列化
  - 不引入新依赖
- **时间约束**：本任务目标在一个迭代内完成（编码 + 测试 + 文档同步）

---

## 7. 开放问题

| 编号 | 问题 | 状态 | 结论 |
|------|------|------|------|
| Q-1  | Claude 工具的统一规范名 | ✅ 已确认 | **`claude-internal` + user_base `~/.claude-internal`** |
| Q-2  | `~/.claude` 目录归属冲突 | ✅ 已确认 | aitools 避开 Claude Code 官方占用的 `~/.claude/`；同时**引出语义边界问题**：aitools 不应主动创建任何 AI 工具家目录（已纳入 US-6） |
| Q-3  | 存量旧目录资源迁移策略 | ✅ 已确认 | **自动合并**（旧 `~/.claude*/` 资源合并到 `~/.claude-internal/`，同名冲突报错） |
| Q-4  | 版本号字段名 | ✅ 已确认 | `version` |
| Q-5  | 迁移备份策略 | ✅ 已确认 | **只保留最近一次** `.bak`（覆盖式） |
| Q-6  | 是否本任务下线 `TOOL_PROJECT_DIR_ALIASES` | ✅ 已确认 | **本任务下线**（迁移逻辑会改写存量数据，兼容代码不再需要） |
| Q-7  | AI 工具 SSOT 注册表文件位置 | ⏭️ 推迟 | 推迟到 TECHNICAL 阶段决定 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-09 | 初稿创建（完成代码摸底 + 草拟需求 + 罗列 7 项开放问题） | AI |
| 2026-05-09 | 用户拍板 Q-1~Q-6；新增 US-6（目录创建边界守卫）；调整范围与验收标准；定稿 | AI |

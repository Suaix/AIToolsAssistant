## Context

aitools-cli 是一个基于 Commander + TypeScript + ESM 的命令行工具，旨在统一管理不同 AI 编码工具的配置与 Skills。当前项目已搭好框架（CLI 入口、logger 工具类），但核心功能为空壳。

用户同时使用 CodeBuddy 和 Claude Code 两个 AI 编码工具，它们的 Skill 格式完全一致（`<name>/SKILL.md` + 辅助文件），只是存储路径不同：
- CodeBuddy 用户级：`~/.codebuddy/skills/<name>/`
- Claude Code 用户级：`~/.claude/skills/<name>/`

用户需要一个"一次更新，多处同步"的能力，消除手动拷贝的繁琐。

已有依赖：`commander`（CLI 框架）、`@inquirer/prompts`（交互式提示）、`yaml`（YAML 解析）、`picocolors`（终端着色）。无需新增外部依赖。

## Goals / Non-Goals

**Goals:**
- 提供全局初始化命令，用户指定一个可见的、非隐藏的文件夹作为 Skills 源目录
- 将源目录中的所有 Skill 文件夹全量同步到 CodeBuddy 和 Claude Code 的用户级目录
- 通过文件内容 hash 对比检测变更，避免无效拷贝
- 提供 Skills 列表展示，可视化同步状态
- 保持配置文件的扩展性，便于未来添加更多 AI 工具

**Non-Goals:**
- 项目级 Skills 同步（后续迭代）
- 从 AI 工具目录反向导入 Skills（后续迭代）
- 文件变更监听自动同步（后续迭代）
- 交互式创建 Skill（后续迭代）
- Cursor / Windsurf / Copilot 等其他工具的适配（后续扩展）
- Skill 格式转换（两个目标格式完全一致，无需转换）

## Decisions

### 1. 源目录由用户自由指定（非隐藏目录）

**选择**: 用户在 `aitools init` 时指定任意文件夹路径作为 Skills 源目录（如 `~/my-skills/`）

**替代方案**:
- 方案 A：使用固定的隐藏目录 `~/.aitools/skills/`——对非技术人员不友好，操作不便
- 方案 C：以某个 AI 工具的目录为源——耦合了特定工具，不够中立

**理由**: 可见目录对非技术人员更友好，用户可以直接在文件管理器中操作。

### 2. 配置文件存放在 `~/.aitools/config.yaml`

**选择**: 全局配置放在固定位置 `~/.aitools/config.yaml`，记录源目录路径和目标工具列表

**替代方案**:
- 配置放在源目录内——污染了纯粹的 Skills 仓库
- 两层配置（全局+源目录）——MVP 阶段过度复杂

**理由**: 单一配置入口，CLI 启动时有确定的位置读取配置；源目录保持纯净。

### 3. 全量文件夹拷贝 + hash 变更检测

**选择**: 同步时拷贝整个 Skill 文件夹（SKILL.md + template.md + examples/ + scripts/ 等），通过文件内容 SHA-256 hash 对比检测变更

**替代方案**:
- 软链接（symlink）——跨平台兼容性问题，某些工具可能不识别
- 只拷贝 SKILL.md——丢失辅助文件，Skill 不完整
- mtime 对比——拷贝时修改时间可能不准

**理由**: 保持 Skill 的完整性；hash 对比可靠准确，不依赖文件系统元数据。

### 4. 默认同步用户级，不涉及项目级

**选择**: MVP 仅实现用户级（全局）同步，`aitools sync` 默认行为就是用户级同步

**理由**: 不同项目的 Skills 差异需要更复杂的设计来支撑，MVP 先验证核心同步链路。

### 5. 模块化架构设计

**选择**: 按职责拆分模块

```
src/
├── index.ts              # CLI 入口，命令注册
├── commands/
│   ├── init.ts           # init 命令处理
│   ├── sync.ts           # sync 命令处理
│   └── list.ts           # list 命令处理
├── core/
│   ├── scanner.ts        # Skill 目录扫描 + frontmatter 解析
│   ├── syncer.ts         # 文件同步引擎（hash 对比 + 拷贝）
│   └── hasher.ts         # 文件/目录 hash 计算
├── config/
│   └── manager.ts        # 配置文件读写
├── types/
│   └── index.ts          # TypeScript 类型定义
└── utils/
    └── logger.ts         # 终端日志工具（已有）
```

**理由**: 职责单一，便于测试和维护；commands 层薄（编排），core 层厚（业务逻辑）。

## Risks / Trade-offs

- **[目标目录不存在]** → 同步时自动创建目标目录，使用 `fs.mkdir` 的 `recursive: true` 选项
- **[源目录被删除或路径无效]** → sync/list 命令执行前校验源目录存在性，不存在时给出明确错误提示
- **[大量文件拷贝的性能]** → MVP 阶段 Skills 数量有限（通常 < 50 个），全量拷贝的性能开销可接受
- **[hash 计算开销]** → 对每个 Skill 文件夹内所有文件计算 SHA-256，文件数量和大小通常很小，开销可忽略
- **[配置文件损坏]** → 读取配置时做 YAML 解析错误处理，损坏时提示用户重新 `aitools init`
- **[目标目录有用户手动修改的内容]** → 全量覆盖策略会覆盖手动修改，这是预期行为（源目录是唯一真相源）；list 命令可以帮用户发现差异

# Design: 项目级 Skill 同步

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         aitools sync 流程                           │
│                                                                     │
│  1. 加载全局配置 (~/.aitools/config.yaml)                           │
│  2. 扫描源目录中所有 Skills                                         │
│  3. 同步用户级（全量 → 全局目标）                                    │
│  4. 检测 cwd 是否有 .aitools/project.yaml                           │
│     ├─ 有 → 读取关联列表，过滤 Skills，同步到项目级目标               │
│     └─ 无 → 跳过项目级同步                                          │
│  5. 输出结果摘要                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Data model

### 项目配置文件 `.aitools/project.yaml`

```yaml
# .aitools/project.yaml
# aitools-cli 项目级配置，记录已关联的 Skill 列表
# 此文件不应提交到 Git，建议添加 .aitools/ 到 .gitignore
skills:
  - skill-b
  - skill-c
```

结构极简，只包含 `skills` 字段（字符串数组），对应源目录中的 Skill 文件夹名。

### 类型定义扩展

```typescript
/**
 * 项目级配置文件结构
 * 对应 .aitools/project.yaml
 */
export interface ProjectConfig {
  /** 已关联的 Skill 名称列表（对应源目录中的文件夹名） */
  skills: string[];
}
```

### Target 类型扩展

当前 `Target.user_path` 是用户级路径。项目级同步需要根据目标工具名称推导项目级路径：

```
目标工具名称 → 项目级路径映射：
codebuddy   → <project>/.codebuddy/skills/
claude-code → <project>/.claude/skills/
```

映射关系在代码中维护（常量），无需配置文件声明。

## Command interface changes

### `aitools sync` 命令扩展

```
aitools sync [options]

选项:
  --skill <name>     指定要同步的 Skill 名称（项目级首次添加时使用）
  --scope <scope>    同步范围: user | project | all（默认: 智能检测）
  --target <name>    指定目标工具（可选，默认同步到所有已启用目标）

行为矩阵:
┌─────────────────────┬────────────────────────────────────────┐
│ 参数组合             │ 行为                                   │
├─────────────────────┼────────────────────────────────────────┤
│ aitools sync        │ 同步用户级 + 自动检测项目级             │
│ --scope user        │ 仅同步用户级                            │
│ --scope project     │ 仅同步项目级（需在项目目录下）           │
│ --skill X           │ 添加 Skill X 到当前项目并同步            │
│ --skill X --scope p │ 等价于 --skill X                        │
└─────────────────────┴────────────────────────────────────────┘
```

### `aitools list` 命令扩展

```
aitools list

输出（两段式）:
📋 用户级 Skills (源: ~/my-skills)
┌────────────┬──────────┬────────────┬─────────────┐
│ Skill 名称 │ 源 hash  │ CodeBuddy  │ Claude Code │
├────────────┼──────────┼────────────┼─────────────┤
│ skill-a    │ a1b2c3d4 │ ✅ 已同步  │ ✅ 已同步   │
│ skill-b    │ e5f6a7b8 │ ✅ 已同步  │ ✅ 已同步   │
│ skill-c    │ c9d0e1f2 │ ✅ 已同步  │ ✅ 已同步   │
└────────────┴──────────┴────────────┴─────────────┘

📁 项目级 Skills (项目: /path/to/project-A)
┌────────────┬──────────┬────────────┬─────────────┐
│ Skill 名称 │ 源 hash  │ CodeBuddy  │ Claude Code │
├────────────┼──────────┼────────────┼─────────────┤
│ skill-b    │ e5f6a7b8 │ ⚠️ 需更新  │ ❌ 未同步   │
└────────────┴──────────┴────────────┴─────────────┘

💡 运行 aitools sync 同步最新变更
```

## Sync flow: project-level

```
aitools sync --skill skill-b（首次）:
  1. 加载全局配置
  2. 检查 cwd 是否有 .aitools/project.yaml
     └─ 无 → 创建
  3. 检查 skill-b 是否在源目录中存在
     └─ 不存在 → 报错退出
  4. 将 skill-b 添加到 project.yaml 的 skills 列表
  5. 对每个已启用的目标工具:
     └─ 将 skill-b/ 拷贝到 <cwd>/.codebuddy/skills/skill-b/
     └─ 将 skill-b/ 拷贝到 <cwd>/.claude/skills/skill-b/
  6. 输出结果

aitools sync（后续自动检测）:
  1. 同步用户级（全量，行为不变）
  2. 检测 cwd/.aitools/project.yaml
     └─ 有 → 读取 skills 列表 → 过滤源 Skills → 同步到项目级目标
  3. 输出结果（用户级 + 项目级）
```

## Project-level target path mapping

```typescript
/**
 * 目标工具名称到项目级子目录的映射
 */
const PROJECT_TARGET_PATHS: Record<string, string> = {
  'codebuddy': '.codebuddy/skills',
  'claude-code': '.claude/skills',
};
```

## Error handling

| 场景 | 处理 |
|------|------|
| `--skill X` 但源目录中无 X | 报错：`Skill 'X' 不存在于源目录中` |
| `--scope project` 但无 project.yaml | 报错提示使用 `--skill` 先添加 |
| project.yaml 中的 Skill 在源目录中已被删除 | 警告但不中断，跳过该 Skill |
| 项目目录下已有手动放置的同名 Skill | 正常覆盖（全量同步策略不变） |

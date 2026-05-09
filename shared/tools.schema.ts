/**
 * SSOT 数据契约：AI 工具元信息（FEAT-005）
 *
 * 本文件**仅定义类型**，不参与运行时；
 * 实际数据存储在同目录下的 tools.json（Single Source of Truth）。
 *
 * 跨端共享方式：
 *   - CLI 端：src/registry/tools.ts 通过 fs.readFileSync 读取 JSON
 *   - GUI 端：desktop/src/lib/tools.ts 通过 Vite import.meta.glob / 直接 import 读取
 *   - 未来 Rust 端如需：可用 include_str! 在编译期 inline
 *
 * 设计约束（FEAT-005 TD-1 / TD-2）：
 *   - 本文件零外部依赖（不能 import 任何 npm 包），仅 export type / interface
 *   - tools.json 字段顺序与本文件类型字段顺序保持一致，便于人工对齐校验
 */

/**
 * AI 工具元信息
 *
 * 一个 ToolDefinition 对应一种 aitools 已知的 AI Agent 工具（如 CodeBuddy / Claude Internal）。
 * 这些字段由 CLI 与 GUI 共同消费，必须保持稳定。
 */
export interface ToolDefinition {
  /**
   * 工具唯一标识（小写中划线命名）
   * 与 CLI Config.targets[].name 一致
   * 示例：'codebuddy'、'claude-internal'
   */
  name: string;

  /**
   * 用户可见显示名（首字母大写空格分隔）
   * 用于 CLI list 输出表格、GUI AddToolModal、SyncProgressModal 行标签
   * 示例：'CodeBuddy'、'Claude Internal'
   */
  displayName: string;

  /**
   * 用户级 AI 工具家目录（约定 ~/<base> 形式）
   * aitools 的语义边界：**仅读不写**；不存在时跳过同步而非主动创建（US-6 守卫）
   * 示例：'~/.codebuddy'、'~/.claude-internal'
   */
  userBase: string;

  /**
   * 项目级标记目录候选名（带 . 前缀）
   * 用于 detectProjectTools 判断当前项目是否关联该工具
   * 当前每个工具仅一个候选，保留数组形态便于未来扩展
   * 示例：['.codebuddy']、['.claude-internal']
   */
  projectDirAliases: string[];

  /**
   * init 命令是否默认 enabled
   * 替代 src/config/manager.ts:getDefaultTargets() 中的硬编码启用规则
   */
  defaultEnabled: boolean;
}

/**
 * SSOT 完整结构
 *
 * 除了工具数组本身，还包含三类**迁移查找表**（仅供 src/config/migrations/ 使用）：
 *   - legacyAliases：旧 target.name → 新 target.name（如 'claude-code' → 'claude-internal'）
 *   - legacyUserBases：旧 user_base → 新 user_base（如 '~/.claude' → '~/.claude-internal'）
 *   - legacyProjectDirs：旧项目级标记目录 → 新（如 '.claude-code' → '.claude-internal'）
 *
 * 这些查找表完成历史使命后（所有用户都已迁移），可在未来版本中清空。
 */
export interface ToolsRegistry {
  /** SSOT 数据格式版本；本文件结构变更时递增（与 Config.version 不同概念） */
  schemaVersion: number;

  /** 已知工具列表（顺序即 CLI list / GUI AddToolModal 显示顺序） */
  tools: ToolDefinition[];

  /** 旧 target.name → 新 target.name 映射（迁移用） */
  legacyAliases: Record<string, string>;

  /** 旧 user_base → 新 user_base 映射（迁移用） */
  legacyUserBases: Record<string, string>;

  /** 旧项目级标记目录 → 新项目级标记目录映射（迁移用） */
  legacyProjectDirs: Record<string, string>;
}

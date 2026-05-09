/**
 * AI 工具注册表 CLI 适配层（FEAT-005 SSOT / REFACTOR-001 PR-2）
 *
 * 职责：
 *   1. 从 @aitools/shared workspace 包导入 SSOT 数据（编译期 inline）
 *   2. 对导入数据做运行时校验（防御构建/打包事故）
 *   3. 提供强类型的查询函数，供 commands/init.ts、commands/target.ts、commands/list.ts、
 *      config/manager.ts、config/migrations/ 等消费
 *
 * 加载策略（REFACTOR-001 PR-2 重写）：
 *   - 直接从 @aitools/shared 导入 TOOLS 常量（tsup bundle 编译期 inline）
 *   - 不再使用 fs.readFileSync + 多候选路径探测
 *   - 产物体积：shared/tools.json 的内容被内联进 dist/index.js，无独立文件
 *
 * 与 FEAT-005 实现的差异：
 *   FEAT-005：运行时 readFileSync(resolveRegistryPath()) + 三候选 fallback
 *   REFACTOR-001 PR-2：编译期 import，零运行时 IO，路径解析标准化
 */

import { TOOLS, type ToolDefinition, type ToolsRegistry } from '@aitools/shared';

/* ============================================================
 * 运行时校验
 * ============================================================ */

/**
 * 校验 SSOT 注册表结构
 *
 * 校验规则：
 *   - 必须是 object
 *   - schemaVersion 必须是 number
 *   - tools 必须是数组，每项含齐 5 个必需字段
 *   - 三类 legacy 映射必须是 object（允许空）
 *
 * 任何校验失败都抛出明确错误（视为构建/打包事故，而非用户错误）。
 *
 * @param registry 从 @aitools/shared 导入的注册表
 * @returns 同一对象（校验通过后直接返回，避免拷贝）
 * @throws 任何字段不合规时抛出
 */
function validateRegistry(registry: ToolsRegistry): ToolsRegistry {
  if (!registry || typeof registry !== 'object') {
    throw new Error('SSOT 注册表格式错误：@aitools/shared 导出的 TOOLS 不是有效的对象');
  }

  if (typeof registry.schemaVersion !== 'number') {
    throw new Error('SSOT 注册表缺少有效的 schemaVersion 字段');
  }

  if (!Array.isArray(registry.tools)) {
    throw new Error('SSOT 注册表缺少有效的 tools 数组');
  }

  /* 逐项校验 ToolDefinition 必需字段 */
  for (const tool of registry.tools) {
    if (!tool || typeof tool !== 'object') {
      throw new Error('SSOT 注册表 tools 数组中存在非对象项');
    }
    if (typeof tool.name !== 'string' || tool.name.length === 0) {
      throw new Error('SSOT 工具项缺少有效的 name 字段');
    }
    if (typeof tool.displayName !== 'string' || tool.displayName.length === 0) {
      throw new Error(`SSOT 工具项 ${tool.name} 缺少有效的 displayName`);
    }
    if (typeof tool.userBase !== 'string' || tool.userBase.length === 0) {
      throw new Error(`SSOT 工具项 ${tool.name} 缺少有效的 userBase`);
    }
    if (!Array.isArray(tool.projectDirAliases) || tool.projectDirAliases.length === 0) {
      throw new Error(`SSOT 工具项 ${tool.name} 缺少有效的 projectDirAliases`);
    }
    if (typeof tool.defaultEnabled !== 'boolean') {
      throw new Error(`SSOT 工具项 ${tool.name} 缺少有效的 defaultEnabled`);
    }
  }

  /* 校验 legacy 映射：必须是 object（可空） */
  const legacyKeys = ['legacyAliases', 'legacyUserBases', 'legacyProjectDirs'] as const;
  for (const key of legacyKeys) {
    const value = registry[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`SSOT 注册表缺少有效的 ${key} 对象`);
    }
  }

  return registry;
}

/** 模块级缓存：进程内 SSOT 仅校验一次 */
const REGISTRY: ToolsRegistry = validateRegistry(TOOLS);

/* ============================================================
 * 公共查询 API（签名保持与 FEAT-005 实现一致，消费方零改动）
 * ============================================================ */

/**
 * 获取所有已知工具（按 SSOT 中的声明顺序）
 *
 * 返回值是只读引用；调用方不应修改其内部字段。
 *
 * @returns ToolDefinition 只读数组
 */
export function getAllTools(): readonly ToolDefinition[] {
  return REGISTRY.tools;
}

/**
 * 按工具标识查找
 *
 * @param name 工具标识（如 'codebuddy'、'claude-internal'）
 * @returns 找到则返回 ToolDefinition；否则 undefined
 */
export function findTool(name: string): ToolDefinition | undefined {
  return REGISTRY.tools.find((t) => t.name === name);
}

/**
 * 获取工具展示名
 *
 * @param name 工具标识
 * @returns 已知工具返回 displayName；未知工具回退原 name（保证不报错）
 */
export function getToolDisplayName(name: string): string {
  return findTool(name)?.displayName ?? name;
}

/**
 * 获取 init 命令的默认 enabled 工具集合
 *
 * 用途：替代硬编码启用规则
 *
 * @returns defaultEnabled === true 的工具列表（保留 SSOT 声明顺序）
 */
export function getDefaultEnabledTools(): readonly ToolDefinition[] {
  return REGISTRY.tools.filter((t) => t.defaultEnabled);
}

/* ============================================================
 * 迁移查找表（仅供 src/config/migrations/ 使用）
 * ============================================================ */

/**
 * 旧 target.name → 新 target.name 映射
 *
 * 示例：'claude-code' → 'claude-internal'、'claude' → 'claude-internal'
 * 仅供 v0.4 → v0.5 迁移函数使用
 *
 * @returns 只读映射对象
 */
export function getLegacyAliases(): Readonly<Record<string, string>> {
  return REGISTRY.legacyAliases;
}

/**
 * 旧 user_base → 新 user_base 映射
 *
 * 示例：'~/.claude' → '~/.claude-internal'
 *
 * @returns 只读映射对象
 */
export function getLegacyUserBases(): Readonly<Record<string, string>> {
  return REGISTRY.legacyUserBases;
}

/**
 * 旧项目级标记目录 → 新项目级标记目录映射
 *
 * 示例：'.claude-code' → '.claude-internal'
 * 用于 relocate-legacy-dirs 资源搬迁时识别旧目录
 *
 * @returns 只读映射对象
 */
export function getLegacyProjectDirs(): Readonly<Record<string, string>> {
  return REGISTRY.legacyProjectDirs;
}

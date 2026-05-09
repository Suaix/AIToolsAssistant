/**
 * AI 工具注册表 CLI 适配层（FEAT-005 SSOT）
 *
 * 职责：
 *   1. 加载 shared/tools.json（仓库根的 Single Source of Truth）
 *   2. 提供强类型的查询函数，供 commands/init.ts、commands/target.ts、commands/list.ts、
 *      config/manager.ts、config/migrations/ 等消费
 *
 * 加载策略（FEAT-005 TD-1）：
 *   - 不使用 import attributes（避免对 Node 22 硬依赖；当前 engines.node ≥20）
 *   - 改为运行时 readFileSync，路径相对于本文件
 *   - 模块级缓存：进程内仅读一次
 *
 * 路径解析：
 *   - 源码态：<repo>/src/registry/tools.ts → ../../shared/tools.json
 *   - 构建态：<install>/dist/registry/tools.js → ../../shared/tools.json
 *     （tsup 默认保留相对结构；package.json:files 包含 shared/ 才能在全局安装后找到）
 *
 * 类型约定：
 *   本文件 import shared/tools.schema.ts 仅作类型导入（type-only），
 *   实际编译产物不含跨 rootDir 引用（tsup bundle 后只剩本地常量）。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ToolDefinition,
  ToolsRegistry,
} from '../../shared/tools.schema.js';

/* ============================================================
 * 模块级常量
 * ============================================================ */

/** 本模块所在目录的绝对路径（兼容源码态与构建态） */
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * 解析 SSOT JSON 文件的绝对路径
 *
 * 路径策略（兼容源码态与 tsup bundle 态）：
 *   - 源码态：src/registry/tools.ts → 仓库根 shared/tools.json（向上两级）
 *   - bundle 态：dist/index.js → 同根 shared/tools.json（向上一级）
 *   - 全局安装态：<install>/dist/index.js → <install>/shared/tools.json（向上一级）
 *
 * 实现：依次尝试候选路径，取第一个真实存在的。
 *
 * @returns 绝对路径
 * @throws 所有候选都不存在时抛错（构建/打包事故）
 */
function resolveRegistryPath(): string {
  const candidates = [
    /* 源码态：src/registry/ → 仓库根（向上两级） */
    path.resolve(MODULE_DIR, '..', '..', 'shared', 'tools.json'),
    /* bundle / 全局安装态：dist/ → 包根（向上一级） */
    path.resolve(MODULE_DIR, '..', 'shared', 'tools.json'),
  ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* 尝试下一候选 */
    }
  }
  throw new Error(
    `SSOT 注册表 shared/tools.json 未找到。已尝试：${candidates.join(', ')}`,
  );
}

/** SSOT JSON 文件的绝对路径 */
const REGISTRY_PATH = resolveRegistryPath();

/**
 * 加载并校验 SSOT 注册表
 *
 * 校验规则：
 *   - 必须是 object
 *   - schemaVersion 必须是 number
 *   - tools 必须是数组，每项含齐 5 个必需字段
 *   - 三类 legacy 映射必须是 object（允许空）
 *
 * 任何校验失败都抛出明确错误（视为构建/打包事故，而非用户错误）。
 *
 * @returns 校验后的 ToolsRegistry
 */
function loadRegistry(): ToolsRegistry {
  const raw = readFileSync(REGISTRY_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`SSOT 注册表格式错误：${REGISTRY_PATH} 不是有效的 JSON 对象`);
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.schemaVersion !== 'number') {
    throw new Error('SSOT 注册表缺少有效的 schemaVersion 字段');
  }

  if (!Array.isArray(obj.tools)) {
    throw new Error('SSOT 注册表缺少有效的 tools 数组');
  }

  /* 逐项校验 ToolDefinition 必需字段 */
  for (const tool of obj.tools) {
    if (!tool || typeof tool !== 'object') {
      throw new Error('SSOT 注册表 tools 数组中存在非对象项');
    }
    const t = tool as Record<string, unknown>;
    if (typeof t.name !== 'string' || t.name.length === 0) {
      throw new Error('SSOT 工具项缺少有效的 name 字段');
    }
    if (typeof t.displayName !== 'string' || t.displayName.length === 0) {
      throw new Error(`SSOT 工具项 ${t.name} 缺少有效的 displayName`);
    }
    if (typeof t.userBase !== 'string' || t.userBase.length === 0) {
      throw new Error(`SSOT 工具项 ${t.name} 缺少有效的 userBase`);
    }
    if (!Array.isArray(t.projectDirAliases) || t.projectDirAliases.length === 0) {
      throw new Error(`SSOT 工具项 ${t.name} 缺少有效的 projectDirAliases`);
    }
    if (typeof t.defaultEnabled !== 'boolean') {
      throw new Error(`SSOT 工具项 ${t.name} 缺少有效的 defaultEnabled`);
    }
  }

  /* 校验 legacy 映射：必须是 object（可空） */
  for (const key of ['legacyAliases', 'legacyUserBases', 'legacyProjectDirs'] as const) {
    if (!obj[key] || typeof obj[key] !== 'object' || Array.isArray(obj[key])) {
      throw new Error(`SSOT 注册表缺少有效的 ${key} 对象`);
    }
  }

  return parsed as ToolsRegistry;
}

/** 模块级缓存：进程内 SSOT 仅读一次 */
const REGISTRY: ToolsRegistry = loadRegistry();

/* ============================================================
 * 公共查询 API
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
 * 用途：替代 src/config/manager.ts:getDefaultTargets() 中的硬编码启用规则
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

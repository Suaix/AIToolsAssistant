/**
 * @aitools/shared 包聚合入口
 *
 * 消费方：
 *   - @aitools/cli：通过 tsup bundle 编译期 inline（CLI bundle 不再含独立 tools.json 文件）
 *   - @aitools/desktop：通过 Vite 编译期 inline
 *
 * 数据源：同目录 tools.json（唯一真相源）
 *
 * 设计要点（REFACTOR-001 TD-2）：
 *   - 本包不输出 dist，main/types 直指 src 源码，tsup/Vite 直接处理 .ts
 *   - `resolveJsonModule: true` + 无 `with attributes` 保证 Node 20 兼容
 */

import toolsJson from './tools.json';
import type { ToolsRegistry } from './tools.schema.js';

/* 类型重导出 */
export type { ToolDefinition, ToolsRegistry } from './tools.schema.js';

/**
 * SSOT 数据（编译期 inline，运行时零 IO）
 *
 * 返回强类型的 ToolsRegistry；消费方无需再做类型断言。
 */
export const TOOLS: ToolsRegistry = toolsJson as ToolsRegistry;

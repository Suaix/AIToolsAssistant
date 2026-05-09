/**
 * @aitools/shared 包聚合入口
 *
 * PR-1 阶段：仅做类型与常量的简单 re-export，不改动消费方 import 形态
 *   （CLI 仍用 fs.readFileSync 加载 tools.json，desktop 仍走 Vite @shared/* alias）
 *
 * PR-2 阶段：消费方改为 `import { TOOLS } from '@aitools/shared'`，彻底收敛
 *
 * 数据源：同目录 tools.json（唯一真相源）
 */

import toolsJson from './tools.json';
import type { ToolsRegistry } from './tools.schema.js';

/* 类型重导出 */
export type { ToolDefinition, ToolsRegistry } from './tools.schema.js';

/**
 * SSOT 数据（编译期 inline，运行时零 IO）
 *
 * 注意：返回强类型的 ToolsRegistry，消费方无需再做类型断言
 */
export const TOOLS: ToolsRegistry = toolsJson as ToolsRegistry;

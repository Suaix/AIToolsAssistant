/**
 * Agents 资源处理器（占位）
 * 尚未实现，仅用于在 Registry 中声明类型，CLI 调用时会提示「暂未支持」
 */
import type { ResourceHandler } from '../../types/index.js';

/**
 * Agents 占位 handler
 */
export const agentsHandler: ResourceHandler = {
  type: 'agents',
  implemented: false,
  resourceDirName: 'agents',
  displayName: 'Agents',
  scan: async () => [],
};

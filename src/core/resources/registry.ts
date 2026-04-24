/**
 * 资源类型注册中心
 * 管理所有资源类型与处理器的映射，作为 CLI/核心逻辑的统一入口
 */
import type { ResourceHandler, ResourceType } from '../../types/index.js';
import { skillsHandler } from './skills.js';
import { commandsHandler } from './commands.js';
import { agentsHandler } from './agents.js';
import { rulesHandler } from './rules.js';

/**
 * 所有已注册的资源处理器映射
 * 新增资源类型时，在此处追加即可
 */
const HANDLERS: Record<ResourceType, ResourceHandler> = {
  skills: skillsHandler,
  commands: commandsHandler,
  agents: agentsHandler,
  rules: rulesHandler,
};

/**
 * 获取指定资源类型的处理器
 * @param type 资源类型
 * @returns 对应的处理器实例
 */
export function getHandler(type: ResourceType): ResourceHandler {
  return HANDLERS[type];
}

/**
 * 获取所有已注册的资源处理器（包含未实现的占位 handler）
 * @returns 所有资源处理器数组
 */
export function getAllHandlers(): ResourceHandler[] {
  return Object.values(HANDLERS);
}

/**
 * 获取所有已实现的资源处理器
 * 用于 `aitools sync` / `aitools list` 无参数时遍历同步
 * @returns 已实现的资源处理器数组
 */
export function listImplementedHandlers(): ResourceHandler[] {
  return getAllHandlers().filter((h) => h.implemented);
}

/**
 * 获取所有已注册的资源类型名称列表
 * @returns 资源类型名称数组（按注册顺序）
 */
export function listAllTypes(): ResourceType[] {
  return Object.keys(HANDLERS) as ResourceType[];
}

/**
 * 判断字符串是否为合法的资源类型
 * @param value 待判断的字符串
 * @returns 为合法资源类型返回 true
 */
export function isValidResourceType(value: string): value is ResourceType {
  return value in HANDLERS;
}

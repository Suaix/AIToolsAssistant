/**
 * 资源目录扫描模块（通用入口）
 * v0.2.0 起：具体的资源识别/元数据解析逻辑迁移到各 ResourceHandler 中
 * 本文件仅作为调用入口，根据资源类型分发到对应的 handler
 */
import { getHandler } from './resources/registry.js';
import type {
  ResourceInfo,
  ResourceScope,
  ResourceType,
  SkillInfo,
} from '../types/index.js';

/**
 * 扫描指定资源类型在指定 scope 下的所有有效资源
 * 内部通过 Registry 查找对应 handler 并调用其 scan 方法
 * @param sourceDir 源目录根路径（已展开 ~）
 * @param type 资源类型
 * @param scope 资源层级（user/project）
 * @returns 资源元数据数组；scope 目录不存在时返回空数组
 */
export async function scanResources(
  sourceDir: string,
  type: ResourceType,
  scope: ResourceScope,
): Promise<ResourceInfo[]> {
  const handler = getHandler(type);
  if (!handler.implemented) {
    /* 未实现类型：返回空数组，让调用方决定是否输出提示 */
    return [];
  }
  return handler.scan(sourceDir, scope);
}

/**
 * 扫描指定资源类型的所有资源（同时包含 user 与 project 两个 scope）
 * @param sourceDir 源目录根路径
 * @param type 资源类型
 * @returns 合并后的资源数组
 */
export async function scanAllScopes(
  sourceDir: string,
  type: ResourceType,
): Promise<ResourceInfo[]> {
  const [userList, projectList] = await Promise.all([
    scanResources(sourceDir, type, 'user'),
    scanResources(sourceDir, type, 'project'),
  ]);
  return [...userList, ...projectList];
}

/**
 * 旧 API 兼容：扫描 skills（仅 user 层级）
 * @deprecated 请使用 scanResources(sourceDir, 'skills', 'user')
 * @param sourceDir 源目录绝对路径
 * @returns 用户级 Skills 列表
 */
export async function scanSkills(sourceDir: string): Promise<SkillInfo[]> {
  return scanResources(sourceDir, 'skills', 'user');
}

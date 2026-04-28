/**
 * 资源目录扫描模块（通用入口）
 * v0.2.0：具体的资源识别/元数据解析逻辑迁移到各 ResourceHandler 中
 * v0.4.0：移除 `scope` 维度；订阅落点由订阅清单决定，扫描只做"源目录里有什么"
 */
import { getHandler } from './resources/registry.js';
import type {
  ResourceInfo,
  ResourceType,
  SkillInfo,
} from '../types/index.js';

/**
 * 扫描指定资源类型在源目录下的所有资源
 * 内部通过 Registry 查找对应 handler 并调用其 scan 方法
 * @param sourceDir 源目录根路径（已展开 ~）
 * @param type 资源类型
 * @returns 资源元数据数组；源子目录不存在或类型未实现时返回空数组
 */
export async function scanResources(
  sourceDir: string,
  type: ResourceType,
): Promise<ResourceInfo[]> {
  const handler = getHandler(type);
  if (!handler.implemented) {
    /* 未实现类型：返回空数组，让调用方决定是否输出提示 */
    return [];
  }
  return handler.scan(sourceDir);
}

/**
 * 旧 API 兼容别名：扫描 skills
 * @deprecated 请使用 scanResources(sourceDir, 'skills')
 * @param sourceDir 源目录绝对路径
 * @returns Skills 列表
 */
export async function scanSkills(sourceDir: string): Promise<SkillInfo[]> {
  return scanResources(sourceDir, 'skills');
}

/**
 * 同步引擎模块
 * 基于 hash 对比的文件夹全量拷贝同步
 * v0.2.0：支持多资源类型，路径由 handler 的 resourceDirName 推导
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { hashDirectory, hashDirectorySafe } from './hasher.js';
import { expandTilde } from '../config/manager.js';
import { getHandler } from './resources/registry.js';
import { logger } from '../utils/logger.js';
import type {
  Config,
  Target,
  ResourceInfo,
  ResourceType,
  SkillSyncResult,
  SkillTargetSyncResult,
  SyncSummary,
} from '../types/index.js';

/**
 * 递归拷贝整个目录
 * 如果目标已存在，先完整删除再拷贝（全量覆盖策略）
 * @param srcDir 源目录绝对路径
 * @param destDir 目标目录绝对路径
 */
async function copyDirectory(srcDir: string, destDir: string): Promise<void> {
  /* 如果目标目录已存在，先清空（保证全量覆盖） */
  try {
    await fs.rm(destDir, { recursive: true, force: true });
  } catch {
    /* 目录不存在，忽略 */
  }

  /* 创建目标目录 */
  await fs.mkdir(destDir, { recursive: true });

  /* 读取源目录内容 */
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 推导用户级目标目录
 * 规则：<user_base>/<resource_dir_name>/
 * @param target 目标工具配置
 * @param type 资源类型
 * @returns 用户级目标基础目录的绝对路径
 */
export function getUserTargetDir(target: Target, type: ResourceType): string {
  const handler = getHandler(type);
  return path.join(expandTilde(target.user_base), handler.resourceDirName);
}

/**
 * 推导项目级目标目录
 * 规则：<projectDir>/.<targetName>/<resource_dir_name>/
 * @param projectDir 项目根目录
 * @param targetName 目标工具名称
 * @param type 资源类型
 * @returns 项目级目标基础目录的绝对路径
 */
export function getProjectTargetDir(
  projectDir: string,
  targetName: string,
  type: ResourceType,
): string {
  const handler = getHandler(type);
  return path.join(projectDir, `.${targetName}`, handler.resourceDirName);
}

/**
 * 将单个资源同步到单个目标（基于 hash 对比）
 * @param resource 资源元数据
 * @param targetBaseDir 目标基础目录绝对路径
 * @param targetName 目标工具名称（用于返回结果）
 * @returns 同步结果（动作类型：created / updated / skipped）
 */
async function syncResourceToDir(
  resource: ResourceInfo,
  targetBaseDir: string,
  targetName: string,
): Promise<SkillTargetSyncResult> {
  const targetResourceDir = path.join(targetBaseDir, resource.dirName);

  /* 计算源目录 hash */
  const sourceHash = await hashDirectory(resource.path);

  /* 计算目标目录 hash（不存在时为 null） */
  const targetHash = await hashDirectorySafe(targetResourceDir);

  /* 判断是否需要同步 */
  if (targetHash !== null && sourceHash === targetHash) {
    return { targetName, action: 'skipped' };
  }

  /* 确保目标基础目录存在 */
  await fs.mkdir(targetBaseDir, { recursive: true });

  /* 执行全量拷贝 */
  await copyDirectory(resource.path, targetResourceDir);

  /* 判断是新增还是更新 */
  const action = targetHash === null ? 'created' : 'updated';
  return { targetName, action };
}

/**
 * 执行用户级同步
 * 将指定资源类型的所有用户级资源同步到所有已启用目标的 <user_base>/<resource_dir_name>/ 目录
 * @param resources 已扫描的用户级资源列表
 * @param config 全局配置对象
 * @param type 资源类型
 * @param targetFilter 可选，指定单个目标名称进行过滤
 * @returns 同步结果摘要
 */
export async function syncAllResources(
  resources: ResourceInfo[],
  config: Config,
  type: ResourceType,
  targetFilter?: string,
): Promise<SyncSummary> {
  /* 筛选已启用的目标 */
  let targets = config.targets.filter((t) => t.enabled);

  /* 如果指定了目标过滤器，进一步筛选 */
  if (targetFilter) {
    targets = targets.filter((t) => t.name === targetFilter);
    if (targets.length === 0) {
      logger.error(`未找到目标工具: ${targetFilter}`);
      return emptySummary(resources.length);
    }
  }

  const results: SkillSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  /* 遍历每个资源，同步到每个目标 */
  for (const resource of resources) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      const targetBaseDir = getUserTargetDir(target, type);
      try {
        const result = await syncResourceToDir(resource, targetBaseDir, target.name);
        targetResults.push(result);

        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`同步 ${resource.dirName} → ${target.name} 失败: ${message}`);
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;
      }
    }

    results.push({
      skillName: resource.dirName,
      targetResults,
    });
  }

  return {
    totalSkills: resources.length,
    created,
    updated,
    skipped,
    results,
  };
}

/**
 * 生成空的同步摘要
 * @param total 资源总数
 * @returns 空摘要对象
 */
function emptySummary(total: number): SyncSummary {
  return {
    totalSkills: total,
    created: 0,
    updated: 0,
    skipped: 0,
    results: [],
  };
}

/**
 * 检测项目目录中实际存在的 AI 工具
 * 通过判断项目根目录下是否存在 .<targetName>/ 目录
 * @param projectDir 项目根目录的绝对路径
 * @param targets 已启用的目标列表
 * @returns 检测到的目标列表
 */
export function detectProjectTools(
  projectDir: string,
  targets: Target[],
): Target[] {
  return targets.filter((t) => {
    const toolDirPath = path.join(projectDir, `.${t.name}`);
    return fsSync.existsSync(toolDirPath);
  });
}

/**
 * 执行项目级同步
 * 将指定资源同步到项目目录下各已启用目标的 .<targetName>/<resource_dir_name>/ 目录
 * @param resources 要同步的资源列表（项目关联的资源）
 * @param config 全局配置对象
 * @param projectDir 项目根目录的绝对路径
 * @param type 资源类型
 * @param targetFilter 可选，指定单个目标名称进行过滤
 * @returns 同步结果摘要
 */
export async function syncProjectResources(
  resources: ResourceInfo[],
  config: Config,
  projectDir: string,
  type: ResourceType,
  targetFilter?: string,
): Promise<SyncSummary> {
  /* 筛选已启用的目标 */
  let targets = config.targets.filter((t) => t.enabled);

  /* 如果指定了目标过滤器，进一步筛选（--target 优先级高于检测逻辑） */
  if (targetFilter) {
    targets = targets.filter((t) => t.name === targetFilter);
    if (targets.length === 0) {
      logger.error(`未找到目标工具: ${targetFilter}`);
      return emptySummary(resources.length);
    }
  } else {
    /* 未指定 --target 时，检测当前项目实际使用的 AI 工具 */
    const detectedTargets = detectProjectTools(projectDir, targets);

    if (detectedTargets.length > 0) {
      targets = detectedTargets;
    } else {
      /* 都不存在，交互式选择 */
      logger.info('当前项目目录未检测到已知的 AI 工具目录');

      const choices = targets.map((t) => ({
        name: t.name,
        value: t.name,
      }));

      const selected = await checkbox<string>({
        message: '请选择要同步到的目标工具：',
        choices,
      });

      if (selected.length === 0) {
        logger.warn('未选择任何目标工具，取消同步');
        return emptySummary(resources.length);
      }

      targets = targets.filter((t) => selected.includes(t.name));
    }
  }

  const results: SkillSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  /* 遍历每个资源，同步到每个目标的项目级目录 */
  for (const resource of resources) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      const targetBaseDir = getProjectTargetDir(projectDir, target.name, type);
      try {
        const result = await syncResourceToDir(resource, targetBaseDir, target.name);
        targetResults.push(result);

        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          `项目级同步 ${resource.dirName} → ${target.name} 失败: ${message}`,
        );
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;
      }
    }

    results.push({
      skillName: resource.dirName,
      targetResults,
    });
  }

  return {
    totalSkills: resources.length,
    created,
    updated,
    skipped,
    results,
  };
}

/* ============================================================
 * 旧 API 兼容别名（便于渐进迁移）
 * ============================================================ */

/**
 * @deprecated 请使用 syncAllResources(resources, config, 'skills', targetFilter)
 */
export const syncAllSkills = (
  resources: ResourceInfo[],
  config: Config,
  targetFilter?: string,
): Promise<SyncSummary> =>
  syncAllResources(resources, config, 'skills', targetFilter);

/**
 * @deprecated 请使用 syncProjectResources(resources, config, projectDir, 'skills', targetFilter)
 */
export const syncProjectSkills = (
  resources: ResourceInfo[],
  config: Config,
  projectDir: string,
  targetFilter?: string,
): Promise<SyncSummary> =>
  syncProjectResources(resources, config, projectDir, 'skills', targetFilter);

/**
 * 同步引擎模块
 * 基于 hash 对比的文件夹全量拷贝同步
 * v0.2.0：支持多资源类型，路径由 handler 的 resourceDirName 推导
 * v0.4.0：新增 `syncTasks()` 任务驱动引擎（消费 ExpandedTask[]），取代按 scope 拆分的双函数
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { hashDirectory, hashDirectorySafe } from './hasher.js';
import { expandTilde } from '../config/manager.js';
import { getHandler } from './resources/registry.js';
import { logger } from '../utils/logger.js';
import { getToolDisplayName } from '../registry/tools.js';
import type {
  Config,
  Target,
  ResourceInfo,
  ResourceType,
  SkillSyncResult,
  SkillTargetSyncResult,
  SyncSummary,
  SyncProgressCallback,
} from '../types/index.js';
import type { ExpandedTask } from './subscriptions.js';

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
 *
 * FEAT-005 US-6：进入 mkdir 前必须先断言 AI 工具家目录存在，否则跳过该 target，
 * 避免 aitools 越权创建 ~/.codebuddy、~/.claude-internal 等不属于自己的目录。
 *
 * targetBaseDir 形如 `<homeDir>/<resourceTypeDir>`（如 ~/.codebuddy/skills），
 * 其父目录 `<homeDir>` 必须已存在；不存在时返回 'skipped_missing_tool'。
 *
 * @param resource 资源元数据
 * @param targetBaseDir 目标基础目录绝对路径
 * @param targetName 目标工具名称（用于返回结果）
 * @returns 同步结果（动作类型：created / updated / skipped / skipped_missing_tool）
 */
async function syncResourceToDir(
  resource: ResourceInfo,
  targetBaseDir: string,
  targetName: string,
): Promise<SkillTargetSyncResult> {
  /* US-6 守卫：targetBaseDir 的父目录是 AI 工具家目录（用户级 user_base 或项目级 .<tool>） */
  const toolHomeDir = path.dirname(targetBaseDir);
  const toolHomeExists = await pathExistsAsDir(toolHomeDir);
  if (!toolHomeExists) {
    return {
      targetName,
      action: 'skipped_missing_tool',
      expectedPath: toolHomeDir,
    };
  }

  const targetResourceDir = path.join(targetBaseDir, resource.dirName);

  /* 计算源目录 hash */
  const sourceHash = await hashDirectory(resource.path);

  /* 计算目标目录 hash（不存在时为 null） */
  const targetHash = await hashDirectorySafe(targetResourceDir);

  /* 判断是否需要同步 */
  if (targetHash !== null && sourceHash === targetHash) {
    return { targetName, action: 'skipped' };
  }

  /* 确保目标基础目录存在（仅创建 <toolHome>/<resourceType>/ 这一层；
     前置守卫保证不会越权创建 toolHomeDir 自身） */
  await fs.mkdir(targetBaseDir, { recursive: true });

  /* 执行全量拷贝 */
  await copyDirectory(resource.path, targetResourceDir);

  /* 判断是新增还是更新 */
  const action = targetHash === null ? 'created' : 'updated';
  return { targetName, action };
}

/**
 * 检查路径是否存在且是目录
 *
 * 复用本文件场景的小工具，避免引入更多依赖；
 * 与 src/utils/tool-home-assert.ts 同语义但使用直接 fs.stat。
 *
 * @param targetPath 待检测的绝对路径
 * @returns true 表示存在且是目录
 */
async function pathExistsAsDir(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/* ============================================================
 * v0.4.0：任务驱动同步引擎
 * 消费订阅展开后的 ExpandedTask[]，对每条任务做 hash 比对 + 按需拷贝
 * ============================================================ */

/**
 * ExpandedTask 级别的进度事件（syncTasks 内部专用）
 * 包含完整 `location` 信息，供 CLI 层转成 v0.4 SyncProgressData
 *
 * FEAT-005：action 新增 'skipped_missing_tool'
 */
export interface TaskProgressEvent {
  /** 对应的 ExpandedTask（含 resource/target/location） */
  task: ExpandedTask;
  /** 动作 */
  action: 'created' | 'updated' | 'skipped' | 'skipped_missing_tool' | 'failed';
  /** 当前进度（1-based） */
  index: number;
  /** 总任务数 */
  total: number;
  /** 若 action === 'failed'，此处给出原因 */
  error?: string;
  /** action === 'skipped_missing_tool' 时携带预期路径 */
  expectedPath?: string;
}

/** 任务进度回调 */
export type TaskProgressCallback = (event: TaskProgressEvent) => void;

/**
 * 一批任务的执行结果
 * 聚合该批次内所有 ExpandedTask 的同步动作统计
 *
 * FEAT-005：新增 skippedMissingTool 计数
 */
export interface TasksSummary {
  /** 总任务数 */
  total: number;
  /** 新增数 */
  created: number;
  /** 更新数 */
  updated: number;
  /** 跳过数 */
  skipped: number;
  /** 跳过数（AI 工具未安装；US-6 守卫触发） */
  skippedMissingTool: number;
  /** 失败数 */
  failed: number;
}

/**
 * 按 ExpandedTask 列表逐个执行同步
 *
 * 特点：
 * - 不区分 user/project 业务分支——差异已在任务的 `targetPath` 里固化
 * - 每条任务独立 try/catch，单条失败不中断整批
 * - 顺序执行（符合 RFC §10 Q4 决策：不引入并发池）
 *
 * @param tasks 订阅展开后的任务列表
 * @param onProgress 每条任务完成时触发的回调（用于 CLI/GUI 流式进度）
 * @returns 批次汇总结果
 */
export async function syncTasks(
  tasks: ExpandedTask[],
  onProgress?: TaskProgressCallback,
): Promise<TasksSummary> {
  const summary: TasksSummary = {
    total: tasks.length,
    created: 0,
    updated: 0,
    skipped: 0,
    skippedMissingTool: 0,
    failed: 0,
  };

  let index = 0;
  for (const task of tasks) {
    index++;

    try {
      /**
       * syncResourceToDir 的第二个参数是"目标基础目录（不含资源 dirName 的层级）"。
       * ExpandedTask.targetPath 已拼到资源本身的绝对路径，所以这里取其父目录作为 base。
       */
      const targetBaseDir = path.dirname(task.targetPath);
      const result = await syncResourceToDir(
        task.resource,
        targetBaseDir,
        task.target.name,
      );

      if (result.action === 'created') {
        summary.created++;
      } else if (result.action === 'updated') {
        summary.updated++;
      } else if (result.action === 'skipped_missing_tool') {
        summary.skippedMissingTool++;
        /* US-6：单独 logger.warn 提示用户该工具未安装（人类可读） */
        logger.warn(
          `跳过 ${task.target.name}：未检测到该工具（${result.expectedPath} 不存在）`,
        );
      } else {
        summary.skipped++;
      }

      onProgress?.({
        task,
        action: result.action,
        index,
        total: tasks.length,
        ...(result.expectedPath ? { expectedPath: result.expectedPath } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed++;
      logger.error(
        `同步 ${task.resource.dirName} → ${task.target.name} 失败: ${message}`,
      );
      onProgress?.({
        task,
        action: 'failed',
        index,
        total: tasks.length,
        error: message,
      });
    }
  }

  return summary;
}

/**
 * 执行用户级同步
 * 将指定资源类型的所有用户级资源同步到所有已启用目标的 <user_base>/<resource_dir_name>/ 目录
 * @param resources 已扫描的用户级资源列表
 * @param config 全局配置对象
 * @param type 资源类型
 * @param targetFilter 可选，指定单个目标名称进行过滤
 * @param onProgress 可选，每完成一个"资源 × 目标"任务时触发的回调（用于 GUI 流式进度）
 * @returns 同步结果摘要
 */
export async function syncAllResources(
  resources: ResourceInfo[],
  config: Config,
  type: ResourceType,
  targetFilter?: string,
  onProgress?: SyncProgressCallback,
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
  let skippedMissingTool = 0;

  /* 计算总任务数（resource × target），用于 onProgress 的 index/total */
  const totalTasks = resources.length * targets.length;
  let currentIndex = 0;
  /* v0.4：onProgress 事件使用新的 location 结构；本旧函数固定 user 落点 */
  const location = { scope: 'user' as const };

  /* 遍历每个资源，同步到每个目标 */
  for (const resource of resources) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      const targetBaseDir = getUserTargetDir(target, type);
      currentIndex++;
      try {
        const result = await syncResourceToDir(resource, targetBaseDir, target.name);
        targetResults.push(result);

        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else if (result.action === 'skipped_missing_tool') {
          skippedMissingTool++;
          /* US-6 守卫触发：单独提示用户 */
          logger.warn(
            `跳过 ${getToolDisplayName(target.name)}：未检测到该工具（${result.expectedPath} 不存在）`,
          );
        } else {
          skipped++;
        }

        /* 流式进度回调（GUI 消费） */
        if (onProgress) {
          onProgress({
            version: 2,
            resource: resource.dirName,
            target: target.name,
            location,
            action: result.action,
            index: currentIndex,
            total: totalTasks,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`同步 ${resource.dirName} → ${target.name} 失败: ${message}`);
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;

        /* 失败也要触发 onProgress（action: 'failed'，附带 error 消息） */
        if (onProgress) {
          onProgress({
            version: 2,
            resource: resource.dirName,
            target: target.name,
            location,
            action: 'failed',
            index: currentIndex,
            total: totalTasks,
            error: message,
          });
        }
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
    skippedMissingTool,
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
    skippedMissingTool: 0,
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
 * @param onProgress 可选，每完成一个"资源 × 目标"任务时触发的回调（用于 GUI 流式进度）
 * @returns 同步结果摘要
 */
export async function syncProjectResources(
  resources: ResourceInfo[],
  config: Config,
  projectDir: string,
  type: ResourceType,
  targetFilter?: string,
  onProgress?: SyncProgressCallback,
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
  let skippedMissingTool = 0;

  /* 计算总任务数与进度计数器 */
  const totalTasks = resources.length * targets.length;
  let currentIndex = 0;
  /* v0.4：构造 project 落点的 location，带 projectDir */
  const location = { scope: 'project' as const, projectDir };

  /* 遍历每个资源，同步到每个目标的项目级目录 */
  for (const resource of resources) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      const targetBaseDir = getProjectTargetDir(projectDir, target.name, type);
      currentIndex++;
      try {
        const result = await syncResourceToDir(resource, targetBaseDir, target.name);
        targetResults.push(result);

        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else if (result.action === 'skipped_missing_tool') {
          skippedMissingTool++;
          logger.warn(
            `跳过 ${getToolDisplayName(target.name)}：项目未关联该工具（${result.expectedPath} 不存在）`,
          );
        } else {
          skipped++;
        }

        /* 流式进度回调 */
        if (onProgress) {
          onProgress({
            version: 2,
            resource: resource.dirName,
            target: target.name,
            location,
            action: result.action,
            index: currentIndex,
            total: totalTasks,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(
          `项目级同步 ${resource.dirName} → ${target.name} 失败: ${message}`,
        );
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;

        /* 失败也要触发 onProgress */
        if (onProgress) {
          onProgress({
            version: 2,
            resource: resource.dirName,
            target: target.name,
            location,
            action: 'failed',
            index: currentIndex,
            total: totalTasks,
            error: message,
          });
        }
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
    skippedMissingTool,
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

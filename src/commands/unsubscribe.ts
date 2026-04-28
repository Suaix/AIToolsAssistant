/**
 * unsubscribe 命令处理模块（v0.4.0 新增）
 *
 * 语义：
 *   aitools unsubscribe <type> <name>                       # 默认从用户级取消
 *   aitools unsubscribe <type> <name> --scope user          # 同上
 *   aitools unsubscribe <type> <name> --scope project       # 从当前 cwd 项目取消
 *   aitools unsubscribe <type> <name> --prune               # 顺便删目标侧已同步文件
 *
 * 关键行为：
 * - 取消未订阅的资源不报错（幂等；输出"未订阅，跳过"）
 * - --prune 清理该落点下所有启用 target 的对应目录；不做二次确认
 *   （符合 RFC §11 "明确先于惊喜"：用户主动加 --prune 视为已明确意图）
 * - --scope project 时若项目配置不存在，视为未订阅（直接输出提示）
 *
 * 参见：RFC-001 §4.3
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadConfig,
  saveConfig,
  expandTilde,
  removeUserSubscription,
  getUserSubscriptionList,
} from '../config/manager.js';
import {
  projectConfigExists,
  removeResourceFromProject,
  loadProjectConfig,
  getProjectResourceList,
} from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listAllTypes,
} from '../core/resources/registry.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  Config,
  ResourceType,
  SubscriptionScope,
  Target,
} from '../types/index.js';

/**
 * unsubscribe 命令的选项
 */
interface UnsubscribeCommandOptions {
  /** 订阅落点；默认 'user' */
  scope?: SubscriptionScope;
  /** 同时清理目标侧已同步文件夹 */
  prune?: boolean;
}

/* ============================================================
 * 清理目标目录
 * ============================================================ */

/**
 * 推导某资源在某 target、某 scope 下的绝对目标路径
 * （与 subscriptions.ts resolveTargetPath 行为一致，此处拆出避免跨命令 import 冲突）
 */
function resolveTargetDir(
  type: ResourceType,
  resourceDirName: string,
  name: string,
  scope: SubscriptionScope,
  target: Target,
  projectDir: string,
): string {
  void type;
  if (scope === 'user') {
    return path.join(
      expandTilde(target.user_base),
      resourceDirName,
      name,
    );
  }
  return path.join(projectDir, `.${target.name}`, resourceDirName, name);
}

/**
 * 删除单个目录（忽略不存在）
 * @returns true 表示发生了实际删除
 */
async function rmdirIfExists(absPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isDirectory()) {
      return false;
    }
  } catch {
    /* 不存在，视为无需删除 */
    return false;
  }
  await fs.rm(absPath, { recursive: true, force: true });
  return true;
}

/**
 * 对指定落点执行 prune：删除所有启用 target 下对应的资源目录
 * @returns 实际删除的目录数
 */
async function pruneTargets(
  type: ResourceType,
  resourceDirName: string,
  name: string,
  scope: SubscriptionScope,
  config: Config,
  projectDir: string,
): Promise<number> {
  const targets = config.targets.filter((t) => t.enabled);
  let removed = 0;
  for (const target of targets) {
    const dir = resolveTargetDir(
      type,
      resourceDirName,
      name,
      scope,
      target,
      projectDir,
    );
    const ok = await rmdirIfExists(dir);
    if (ok) {
      removed++;
      reporter.info(`  已清理: ${dir}`);
    }
  }
  return removed;
}

/* ============================================================
 * 主流程
 * ============================================================ */

/**
 * unsubscribe 命令入口
 *
 * @param typeArg 资源类型（位置参数 1）
 * @param nameArg 资源 dirName（位置参数 2）
 * @param options CLI 选项
 */
export async function unsubscribeCommand(
  typeArg: string | undefined,
  nameArg: string | undefined,
  options: UnsubscribeCommandOptions,
): Promise<void> {
  /* 基本参数校验 */
  if (!typeArg || !nameArg) {
    reporter.error(
      '用法: aitools unsubscribe <type> <name> [--scope user|project] [--prune]',
    );
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const type = typeArg.toLowerCase();
  if (!isValidResourceType(type)) {
    reporter.error(
      `未知的资源类型: ${type}。可选值: ${listAllTypes().join(', ')}`,
    );
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const name = nameArg;
  const scope: SubscriptionScope = options.scope ?? 'user';

  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const handler = getHandler(type);
  if (!handler.implemented) {
    reporter.warn(`[${type}] 暂未支持订阅管理，敬请期待`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
    return;
  }

  const projectDir = process.cwd();

  /* 分支执行 */
  let removed: boolean;
  if (scope === 'user') {
    removed = await unsubscribeFromUser(type, name, config);
  } else {
    removed = await unsubscribeFromProject(type, name, projectDir);
  }

  /* 处理 --prune */
  if (options.prune) {
    reporter.blank();
    reporter.info(`正在清理${scope === 'user' ? '用户级' : '项目级'}目标目录...`);
    const count = await pruneTargets(
      type,
      handler.resourceDirName,
      name,
      scope,
      config,
      projectDir,
    );
    if (count === 0) {
      reporter.info('  无需清理（目标目录不存在）');
    }
  }

  /* 幂等提示：即使 removed=false 也走成功退出 */
  void removed;
  if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
}

/* ============================================================
 * 落地：从 user 订阅清单取消
 * ============================================================ */

/**
 * 取消用户级订阅
 * @returns true 表示确实移除，false 表示本来就未订阅
 */
async function unsubscribeFromUser(
  type: ResourceType,
  name: string,
  config: Config,
): Promise<boolean> {
  const removed = removeUserSubscription(config, type, name);
  if (!removed) {
    reporter.info(`[${type}] ${name} 未订阅到用户级，跳过`);
    return false;
  }

  await saveConfig(config);
  const remaining = getUserSubscriptionList(config, type).length;
  reporter.success(
    `[${type}] 已取消用户级订阅: ${name}（当前剩余 ${remaining} 个订阅）`,
  );
  return true;
}

/* ============================================================
 * 落地：从 project 订阅清单取消
 * ============================================================ */

/**
 * 取消当前项目的订阅
 * @returns true 表示确实移除，false 表示本来就未订阅（或 project.yaml 不存在）
 */
async function unsubscribeFromProject(
  type: ResourceType,
  name: string,
  projectDir: string,
): Promise<boolean> {
  const exists = await projectConfigExists(projectDir);
  if (!exists) {
    reporter.info(`[${type}] 当前目录没有项目配置，无订阅可取消`);
    return false;
  }

  const projectConfig = await loadProjectConfig(projectDir);
  const list = getProjectResourceList(projectConfig ?? { skills: [] }, type);
  if (!list.includes(name)) {
    reporter.info(`[${type}] ${name} 未订阅到当前项目，跳过`);
    return false;
  }

  const removed = await removeResourceFromProject(projectDir, type, name);
  if (!removed) {
    /* 理论上不会到这里——include 了但 remove 返回 false 说明竞态 */
    return false;
  }

  reporter.success(`[${type}] 已取消项目订阅: ${name}（项目: ${projectDir}）`);
  return true;
}

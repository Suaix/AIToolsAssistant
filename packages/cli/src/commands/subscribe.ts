/**
 * subscribe 命令处理模块（v0.4.0 新增）
 *
 * 语义：
 *   aitools subscribe <type> <name>                 # 默认订阅到用户级
 *   aitools subscribe <type> <name> --scope user    # 同上，显式
 *   aitools subscribe <type> <name> --scope project # 订阅到当前 cwd 项目
 *   aitools subscribe <type> <name> --sync          # 订阅后立即同步
 *
 * 关键行为：
 * - 订阅是幂等的：重复订阅不报错、不重复写入
 * - 订阅前校验源资源真实存在（不允许订阅幽灵资源）
 * - --scope project 且 <cwd>/.aitools/project.yaml 不存在 → 交互式询问是否创建
 * - JSON 模式下：询问环节默认判 No（不阻塞机器调用）
 *
 * 参见：RFC-001 §4.2
 */
import { confirm } from '@inquirer/prompts';
import {
  loadConfig,
  saveConfig,
  expandTilde,
  addUserSubscription,
  getUserSubscriptionList,
} from '../config/manager.js';
import {
  loadProjectConfig,
  projectConfigExists,
  saveProjectConfig,
  addResourceToProject,
  getProjectResourceList,
  getProjectConfigPath,
} from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listAllTypes,
} from '../core/resources/registry.js';
import {
  expandSubscriptions,
  getUserSubsForType,
  getProjectSubsForType,
} from '../core/subscriptions.js';
import { syncTasks } from '../core/syncer.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  ProjectConfig,
  SubscriptionScope,
  ResourceType,
} from '../types/index.js';

/**
 * subscribe 命令的选项
 */
interface SubscribeCommandOptions {
  /** 订阅落点；默认 'user' */
  scope?: SubscriptionScope;
  /** 订阅后立即触发同步 */
  sync?: boolean;
}

/* ============================================================
 * 子流程：确认并初始化项目配置
 * ============================================================ */

/**
 * 当 scope=project 但 project.yaml 不存在时的处理
 * - human 模式：交互式询问 y/N（默认 N）
 * - JSON 模式：默认 N（不阻塞）
 * @param projectDir 项目根目录
 * @returns 是否应当创建
 */
async function shouldCreateProjectConfig(projectDir: string): Promise<boolean> {
  if (isJsonMode()) {
    /* JSON 模式下不阻塞等待输入，直接判 No */
    return false;
  }

  reporter.info(`未检测到项目配置：${getProjectConfigPath(projectDir)}`);

  return await confirm({
    message: '是否在当前目录创建项目配置？',
    default: false,
  });
}

/**
 * 创建一个最小的 project.yaml（空 skills 数组）
 * @param projectDir 项目根目录
 */
async function initProjectConfig(projectDir: string): Promise<void> {
  const empty: ProjectConfig = { skills: [] };
  await saveProjectConfig(projectDir, empty);
  reporter.success(`已创建项目配置: ${getProjectConfigPath(projectDir)}`);
}

/* ============================================================
 * 主流程
 * ============================================================ */

/**
 * subscribe 命令入口
 *
 * @param typeArg 资源类型（位置参数 1）
 * @param nameArg 资源 dirName（位置参数 2）
 * @param options CLI 选项
 */
export async function subscribeCommand(
  typeArg: string | undefined,
  nameArg: string | undefined,
  options: SubscribeCommandOptions,
): Promise<void> {
  /* 基本参数校验 */
  if (!typeArg || !nameArg) {
    reporter.error(
      '用法: aitools subscribe <type> <name> [--scope user|project]',
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

  /* 加载全局配置 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const handler = getHandler(type);
  if (!handler.implemented) {
    reporter.warn(`[${type}] 暂未支持订阅，敬请期待`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
    return;
  }

  /* 校验源资源存在 */
  const sourceDir = expandTilde(config.source);
  const resources = await handler.scan(sourceDir);
  const resource = resources.find((r) => r.dirName === name);
  if (!resource) {
    const available = resources.map((r) => r.dirName);
    reporter.error(`[${type}] 资源不存在: ${name}`);
    reporter.info(`   源目录: ${sourceDir}/${handler.resourceDirName}/`);
    if (available.length > 0) {
      reporter.info(`   可用资源: ${available.join(', ')}`);
    } else {
      reporter.info(
        `   源目录下暂无任何 ${type}；请先在 ${sourceDir}/${handler.resourceDirName}/ 下创建资源文件夹`,
      );
    }
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 分支执行：user / project */
  const projectDir = process.cwd();

  if (scope === 'user') {
    await subscribeToUser(type, name, config);
  } else {
    const ok = await subscribeToProject(type, name, projectDir);
    if (!ok) {
      if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
      return;
    }
  }

  /* 可选：订阅后立即同步 */
  if (options.sync) {
    await syncAfterSubscribe(type, name, config, projectDir, scope);
  }

  if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
}

/* ============================================================
 * 落地到 user 订阅清单
 * ============================================================ */

/**
 * 订阅到全局用户级
 * 直接修改 config.user_subscriptions 并落盘
 */
async function subscribeToUser(
  type: ResourceType,
  name: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
): Promise<void> {
  if (!config) return;

  const added = addUserSubscription(config, type, name);
  if (!added) {
    reporter.info(`[${type}] ${name} 已订阅到用户级（无变更）`);
    return;
  }

  await saveConfig(config);
  const count = getUserSubscriptionList(config, type).length;
  reporter.success(`[${type}] ${name} 已订阅到用户级（当前共 ${count} 个订阅）`);
}

/* ============================================================
 * 落地到 project 订阅清单
 * ============================================================ */

/**
 * 订阅到当前 cwd 项目
 * - 若 project.yaml 不存在，交互式确认后创建
 * - 否则直接追加订阅
 * @returns true 表示订阅成功；false 表示用户取消或其他失败
 */
async function subscribeToProject(
  type: ResourceType,
  name: string,
  projectDir: string,
): Promise<boolean> {
  const exists = await projectConfigExists(projectDir);
  if (!exists) {
    const yes = await shouldCreateProjectConfig(projectDir);
    if (!yes) {
      reporter.info('已取消：未创建项目配置，订阅流程终止');
      return false;
    }
    await initProjectConfig(projectDir);
  }

  /* 检查幂等 */
  const projectConfig = await loadProjectConfig(projectDir);
  const existingList = getProjectResourceList(projectConfig ?? { skills: [] }, type);
  if (existingList.includes(name)) {
    reporter.info(
      `[${type}] ${name} 已订阅到当前项目（无变更）: ${projectDir}`,
    );
    return true;
  }

  await addResourceToProject(projectDir, type, name);
  reporter.success(
    `[${type}] ${name} 已订阅到项目: ${projectDir}`,
  );
  return true;
}

/* ============================================================
 * 订阅后立即同步
 * ============================================================ */

/**
 * 订阅后触发一次"单资源 + 单落点"同步
 * 仅同步刚订阅的那一条，避免把别的订阅也顺手同步
 */
async function syncAfterSubscribe(
  type: ResourceType,
  name: string,
  config: NonNullable<Awaited<ReturnType<typeof loadConfig>>>,
  projectDir: string,
  scope: SubscriptionScope,
): Promise<void> {
  const handler = getHandler(type);
  const sourceDir = expandTilde(config.source);
  const resources = await handler.scan(sourceDir);
  const enabledTargets = config.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) {
    reporter.warn(
      `[${type}] 没有已启用的目标，跳过 --sync；请先运行 aitools init 或启用 target`,
    );
    return;
  }

  /* 重新读订阅清单（subscribe 刚写入） */
  const userSubs = getUserSubsForType(config, type);
  const projectConfig = await loadProjectConfig(projectDir);
  const projectSubs = getProjectSubsForType(projectConfig, type);

  /* 仅展开刚订阅的资源 + 当前 scope */
  const expanded = expandSubscriptions({
    type,
    resourceDirName: handler.resourceDirName,
    resources,
    enabledTargets,
    userSubscriptions: userSubs,
    projectContext: projectConfig
      ? { projectDir, subscriptions: projectSubs }
      : null,
    nameFilter: name,
    scopeFilter: scope,
  });

  if (expanded.tasks.length === 0) {
    return;
  }

  reporter.blank();
  reporter.info(
    `🔄 [${type}] 正在同步 ${name}（${expanded.tasks.length} 个任务）...`,
  );
  reporter.blank();

  const summary = await syncTasks(expanded.tasks, (ev) => {
    if (ev.action === 'skipped') return; /* 同步动作汇总结束统一打印 */
    reporter.info(
      `  ${ev.task.resource.dirName} → ${ev.task.target.name} · ${ev.action}`,
    );
  });

  reporter.blank();
  reporter.info(
    `完成：新增 ${summary.created}，更新 ${summary.updated}，跳过 ${summary.skipped}，失败 ${summary.failed}`,
  );
}

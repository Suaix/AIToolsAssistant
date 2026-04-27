/**
 * sync 命令处理模块
 * v0.2.0：按资源类型分发（skills/commands/agents/rules/all）
 * v0.3.0：支持 --json 流式输出（NDJSON）：start / progress / summary / done 四类事件
 * 支持子命令参数（aitools sync skills）与 --type 简写两种用法
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { loadConfig, expandTilde } from '../config/manager.js';
import { syncAllResources, syncProjectResources } from '../core/syncer.js';
import {
  loadProjectConfig,
  addResourceToProject,
  projectConfigExists,
  getProjectResourceList,
} from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listImplementedHandlers,
  listAllTypes,
} from '../core/resources/registry.js';
import { logger } from '../utils/logger.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  Config,
  ResourceInfo,
  ResourceScope,
  ResourceType,
  SyncProgressCallback,
  SyncSummary,
} from '../types/index.js';

/**
 * 同步命令的选项参数（来自 commander option）
 */
interface SyncCommandOptions {
  /** 可选，指定单个同步目标工具名称 */
  target?: string;
  /** 可选，指定要同步的资源名称（项目级添加/同步） */
  skill?: string;
  /** 可选，同步范围：user-仅用户级、project-仅项目级，不指定则智能检测 */
  scope?: 'user' | 'project';
  /** 可选，资源类型简写（与位置参数 [type] 等价） */
  type?: string;
}

/**
 * 解析「资源类型」参数 —— 支持位置参数和 --type 简写双模式
 * @param typeArg commander 的位置参数
 * @param typeOption --type option 值
 * @returns 解析结果：具体资源类型或 'all'
 */
function resolveType(
  typeArg: string | undefined,
  typeOption: string | undefined,
): string {
  /* 优先级：位置参数 > --type > 默认 'all' */
  const raw = typeArg ?? typeOption;
  return (raw ?? 'all').toLowerCase();
}

/**
 * 校验资源类型参数
 * @param type 待校验的类型字符串
 * @returns 合法返回对应的 ResourceType 或 'all'，非法返回 null
 */
function parseResourceType(type: string): ResourceType | 'all' | null {
  if (type === 'all') {
    return 'all';
  }
  if (isValidResourceType(type)) {
    return type;
  }
  return null;
}

/**
 * 打印同步结果摘要
 * JSON 模式下不打印（GUI 从 progress/summary 事件中自行汇总展示）
 * @param summary 同步结果摘要对象
 * @param label 摘要标签（如 "用户级" 或 "项目级"）
 */
function printSyncResults(summary: SyncSummary, label: string): void {
  if (isJsonMode()) {
    /* JSON 模式不输出彩色文本，GUI 已从事件流拿到数据 */
    return;
  }

  /* 输出每个资源的同步结果 */
  for (const result of summary.results) {
    const targetNames = result.targetResults
      .map((tr) => {
        if (tr.action === 'created') {
          return pc.green(tr.targetName);
        } else if (tr.action === 'updated') {
          return pc.yellow(tr.targetName);
        }
        return pc.dim(tr.targetName);
      })
      .join(', ');

    const hasChange = result.targetResults.some(
      (tr) => tr.action === 'created' || tr.action === 'updated',
    );

    if (hasChange) {
      const actions = result.targetResults
        .filter((tr) => tr.action !== 'skipped')
        .map((tr) => (tr.action === 'created' ? '新增' : '更新'));
      const actionLabel = [...new Set(actions)].join('/');
      console.log(
        `   ${pc.green('✅')} ${result.skillName} → ${targetNames} (${actionLabel})`,
      );
    } else {
      console.log(
        `   ${pc.dim('⏭️')}  ${result.skillName} → ${targetNames} (${pc.dim('无变更')})`,
      );
    }
  }

  /* 输出汇总统计 */
  console.log('');
  const parts: string[] = [];
  if (summary.created > 0) {
    parts.push(pc.green(`新增 ${summary.created} 个`));
  }
  if (summary.updated > 0) {
    parts.push(pc.yellow(`更新 ${summary.updated} 个`));
  }
  if (summary.skipped > 0) {
    parts.push(pc.dim(`跳过 ${summary.skipped} 个`));
  }

  logger.info(
    `📊 ${label}同步完成: ${summary.totalSkills} 个资源${
      parts.length > 0 ? '，' + parts.join('，') : ''
    }`,
  );
}

/**
 * 构造 onProgress 回调，将进度事件直接 emit 到 stdout（JSON 模式）
 * @returns 回调函数；human 模式下返回 undefined（syncer 将不触发 onProgress）
 */
function makeProgressCallback(): SyncProgressCallback | undefined {
  if (!isJsonMode()) {
    return undefined;
  }
  return (event) => {
    emitJson({ event: 'progress', data: event });
  };
}

/**
 * 在 JSON 模式下 emit start 事件（任务开始，告知总数与目标列表）
 * @param type 资源类型
 * @param scope 层级
 * @param resources 参与同步的资源
 * @param targets 参与的目标名列表（已过滤）
 */
function emitStartEvent(
  type: ResourceType,
  scope: ResourceScope,
  resources: ResourceInfo[],
  targets: string[],
): void {
  if (!isJsonMode()) return;
  emitJson({
    event: 'start',
    data: {
      type,
      scope,
      total: resources.length * targets.length,
      targets,
    },
  });
}

/**
 * 在 JSON 模式下 emit summary 事件（单次 sync 的汇总结果）
 * @param type 资源类型
 * @param scope 层级
 * @param summary 汇总结果
 */
function emitSummaryEvent(
  type: ResourceType,
  scope: ResourceScope,
  summary: SyncSummary,
): void {
  if (!isJsonMode()) return;
  emitJson({
    event: 'summary',
    data: { ...summary, type, scope },
  });
}

/**
 * 同步指定资源类型的用户级 + 智能检测项目级
 * 这是针对单一资源类型的完整流程入口
 * @param type 资源类型
 * @param config 全局配置
 * @param options 命令行选项
 */
async function syncOneType(
  type: ResourceType,
  config: Config,
  options: SyncCommandOptions,
): Promise<void> {
  const handler = getHandler(type);

  /* 未实现类型：输出占位提示后返回 */
  if (!handler.implemented) {
    reporter.warn(`[${type}] 暂未支持，敬请期待`);
    return;
  }

  const sourceDir = expandTilde(config.source);
  const projectDir = process.cwd();
  const targetFilter = options.target;

  /* ==================== 模式一：--skill 指定资源添加到项目并同步 ==================== */
  if (options.skill) {
    const resourceName = options.skill;

    /* 优先在 project scope 查找，其次 user scope */
    const projectList = await handler.scan(sourceDir, 'project');
    const userList = await handler.scan(sourceDir, 'user');
    const matched =
      projectList.find((r) => r.dirName === resourceName) ??
      userList.find((r) => r.dirName === resourceName);

    if (!matched) {
      reporter.error(`[${type}] 资源 '${resourceName}' 不存在于源目录中`);
      reporter.info(
        `   查找位置: ${sourceDir}/${handler.resourceDirName}/{user,project}/`,
      );
      const available = [...projectList, ...userList].map((r) => r.dirName);
      if (available.length > 0) {
        reporter.info(`   可用资源: ${available.join(', ')}`);
      }
      return;
    }

    /* 添加到项目配置（自动去重） */
    await addResourceToProject(projectDir, type, resourceName);
    reporter.success(`[${type}] 资源 '${resourceName}' 已关联到当前项目`);

    /* 执行项目级同步（仅同步该资源） */
    reporter.blank();
    reporter.info(`🔄 [${type}] 正在同步项目级资源: ${resourceName}...`);
    reporter.blank();

    /* 计算参与目标（用于 start 事件） */
    const projectTargetsForEvent = computeProjectTargets(config, projectDir, targetFilter);
    emitStartEvent(type, 'project', [matched], projectTargetsForEvent);

    const summary = await syncProjectResources(
      [matched],
      config,
      projectDir,
      type,
      targetFilter,
      makeProgressCallback(),
    );
    printSyncResults(summary, `[${type}] 项目级`);
    emitSummaryEvent(type, 'project', summary);
    return;
  }

  /* ==================== 模式二：--scope project 仅项目级同步 ==================== */
  if (options.scope === 'project') {
    const hasProjectConfig = await projectConfigExists(projectDir);
    if (!hasProjectConfig) {
      reporter.error(
        `[${type}] 当前目录未关联任何资源，请使用 --skill <name> 添加`,
      );
      return;
    }

    const projectConfig = await loadProjectConfig(projectDir);
    if (!projectConfig) {
      reporter.info(`[${type}] 项目配置无效或为空`);
      return;
    }

    const associated = getProjectResourceList(projectConfig, type);
    if (associated.length === 0) {
      reporter.info(`[${type}] 项目未关联任何 ${type} 资源`);
      return;
    }

    /* 项目关联的资源可能来自 user 或 project scope，都要查找 */
    const allSource = [
      ...(await handler.scan(sourceDir, 'project')),
      ...(await handler.scan(sourceDir, 'user')),
    ];

    const matchedResources: ResourceInfo[] = [];
    for (const name of associated) {
      const found = allSource.find((r) => r.dirName === name);
      if (found) {
        matchedResources.push(found);
      } else {
        reporter.warn(`[${type}] 资源 '${name}' 在源目录中不存在，已跳过`);
      }
    }

    if (matchedResources.length === 0) {
      reporter.info(`[${type}] 没有可同步的项目级资源`);
      return;
    }

    reporter.blank();
    reporter.info(
      `🔄 [${type}] 正在同步项目级资源... (${matchedResources.length} 个)`,
    );
    reporter.blank();

    const projectTargetsForEvent = computeProjectTargets(config, projectDir, targetFilter);
    emitStartEvent(type, 'project', matchedResources, projectTargetsForEvent);

    const summary = await syncProjectResources(
      matchedResources,
      config,
      projectDir,
      type,
      targetFilter,
      makeProgressCallback(),
    );
    printSyncResults(summary, `[${type}] 项目级`);
    emitSummaryEvent(type, 'project', summary);
    return;
  }

  /* ==================== 模式三：默认/--scope user —— 用户级 + 智能检测项目级 ==================== */
  const userResources = await handler.scan(sourceDir, 'user');

  if (userResources.length === 0) {
    reporter.info(
      `[${type}] 源目录中没有发现任何用户级 ${type}（${sourceDir}/${handler.resourceDirName}/user/）`,
    );
  } else {
    /* 检查是否有已启用的目标 */
    const enabledTargets = config.targets.filter((t) => t.enabled);
    if (enabledTargets.length === 0) {
      reporter.error(
        `[${type}] 没有已启用的同步目标，请检查配置或运行 aitools init`,
      );
      return;
    }

    reporter.blank();
    reporter.info(
      `🔄 [${type}] 正在同步用户级资源... (${userResources.length} 个)`,
    );
    reporter.blank();

    /* 计算参与的目标（用于 start 事件） */
    const userTargetsForEvent = targetFilter
      ? enabledTargets.filter((t) => t.name === targetFilter).map((t) => t.name)
      : enabledTargets.map((t) => t.name);
    emitStartEvent(type, 'user', userResources, userTargetsForEvent);

    const userSummary = await syncAllResources(
      userResources,
      config,
      type,
      targetFilter,
      makeProgressCallback(),
    );
    printSyncResults(userSummary, `[${type}] 用户级`);
    emitSummaryEvent(type, 'user', userSummary);
  }

  /* 如果 scope 显式为 user，不检测项目级 */
  if (options.scope === 'user') {
    return;
  }

  /* 智能检测项目级 */
  const hasProjectConfig = await projectConfigExists(projectDir);
  if (!hasProjectConfig) {
    return;
  }

  const projectConfig = await loadProjectConfig(projectDir);
  if (!projectConfig) {
    return;
  }

  const associated = getProjectResourceList(projectConfig, type);
  if (associated.length === 0) {
    return;
  }

  /* 项目关联的资源在 user/project 两个 scope 中查找 */
  const projectScopeList = await handler.scan(sourceDir, 'project');
  const allSource = [...projectScopeList, ...userResources];

  const matchedResources: ResourceInfo[] = [];
  for (const name of associated) {
    const found = allSource.find((r) => r.dirName === name);
    if (found) {
      matchedResources.push(found);
    } else {
      reporter.warn(`[${type}] 资源 '${name}' 在源目录中不存在，已跳过`);
    }
  }

  if (matchedResources.length === 0) {
    return;
  }

  reporter.blank();
  reporter.info(
    `🔄 [${type}] 正在同步项目级资源... (${matchedResources.length} 个)`,
  );
  reporter.blank();

  const projectTargetsForEvent = computeProjectTargets(config, projectDir, targetFilter);
  emitStartEvent(type, 'project', matchedResources, projectTargetsForEvent);

  const projectSummary = await syncProjectResources(
    matchedResources,
    config,
    projectDir,
    type,
    targetFilter,
    makeProgressCallback(),
  );
  printSyncResults(projectSummary, `[${type}] 项目级`);
  emitSummaryEvent(type, 'project', projectSummary);
}

/**
 * 计算项目级同步时实际参与的目标名列表（用于 start 事件）
 * 逻辑对齐 syncProjectResources 内部的筛选策略：
 * - 若有 targetFilter，优先
 * - 否则按"项目目录是否存在 .<targetName>/"检测
 * - 都检测不到时回退到全部已启用目标（GUI 场景下通常会由 GUI 主动传 targetFilter）
 */
function computeProjectTargets(
  config: Config,
  projectDir: string,
  targetFilter?: string,
): string[] {
  const enabled = config.targets.filter((t) => t.enabled);
  if (targetFilter) {
    return enabled.filter((t) => t.name === targetFilter).map((t) => t.name);
  }
  const detected = enabled.filter((t) =>
    fsSync.existsSync(path.join(projectDir, `.${t.name}`)),
  );
  return (detected.length > 0 ? detected : enabled).map((t) => t.name);
}

/**
 * 同步命令处理函数
 * 根据 type 参数分发到对应资源类型的 handler；'all' 则遍历所有已实现类型
 * @param typeArg commander 位置参数 [type]
 * @param options 命令行选项参数
 */
export async function syncCommand(
  typeArg: string | undefined,
  options: SyncCommandOptions,
): Promise<void> {
  /* 读取全局配置文件 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  /* 展开源目录路径 */
  const sourceDir = expandTilde(config.source);

  /* 校验源目录存在性 */
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      reporter.error(`源路径不是目录: ${config.source}`);
      if (isJsonMode()) {
        emitJson({ event: 'done', data: { exitCode: 1 } });
      }
      return;
    }
  } catch {
    reporter.error(`源目录不存在: ${config.source}`);
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  /* 解析资源类型参数 */
  const resolved = resolveType(typeArg, options.type);
  const parsed = parseResourceType(resolved);

  if (parsed === null) {
    reporter.error(
      `未知的资源类型: ${resolved}。可选值: ${['all', ...listAllTypes()].join(', ')}`,
    );
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  /* 单一资源类型 */
  if (parsed !== 'all') {
    await syncOneType(parsed, config, options);
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 0 } });
    }
    return;
  }

  /* all：遍历所有已实现的资源类型 */
  const implemented = listImplementedHandlers();
  if (implemented.length === 0) {
    reporter.warn('当前没有任何已实现的资源类型');
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 0 } });
    }
    return;
  }

  /* 对于 all 场景，如果用户还传了 --skill，这是矛盾的（--skill 必须配合具体类型） */
  if (options.skill) {
    reporter.error(
      '--skill 参数必须指定具体资源类型，例如: aitools sync skills --skill <name>',
    );
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  for (const handler of implemented) {
    await syncOneType(handler.type, config, options);
  }

  /* 对未实现类型输出一次汇总提示 */
  const pending = listAllTypes().filter((t) => !getHandler(t).implemented);
  if (pending.length > 0) {
    reporter.blank();
    reporter.warn(`以下资源类型暂未支持同步：${pending.join(', ')}`);
  }

  if (isJsonMode()) {
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

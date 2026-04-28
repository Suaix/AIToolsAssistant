/**
 * sync 命令处理模块（v0.4.0 订阅驱动重写）
 *
 * 语义：
 *   aitools sync                 → 所有已实现类型、所有订阅（user + 当前 cwd 项目）
 *   aitools sync skills          → 仅 skills 类型、所有订阅
 *   aitools sync skills <name>   → 仅同步该资源的所有订阅
 *   aitools sync <name>          → 位置参数消歧：不是 type 时当 name 用
 *   aitools sync --scope user    → 仅 user 订阅
 *   aitools sync --scope project → 仅当前项目订阅
 *   aitools sync --target foo    → 仅同步到 target=foo
 *
 * 流程（对每个已实现类型）：
 *   1. handler.scan() 扫描源目录得到 ResourceInfo[]
 *   2. 读取 user + project 订阅清单
 *   3. expandSubscriptions() 展开为 ExpandedTask[]
 *   4. 按订阅位置（user / 某项目）分组 emit start 事件
 *   5. syncTasks() 逐条执行，onProgress 流式回调
 *   6. 按分组 emit summary；最终 emit done
 */
import fs from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, expandTilde } from '../config/manager.js';
import { syncTasks, type TaskProgressEvent } from '../core/syncer.js';
import {
  expandSubscriptions,
  getUserSubsForType,
  getProjectSubsForType,
  type ExpandedTask,
  type SubscriptionLocation,
} from '../core/subscriptions.js';
import { loadProjectConfig } from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listImplementedHandlers,
  listAllTypes,
} from '../core/resources/registry.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  Config,
  ResourceType,
  SubscriptionScope,
  SyncLocationData,
} from '../types/index.js';

/**
 * sync 命令的 option 参数（来自 commander）
 */
interface SyncCommandOptions {
  /** 指定单个目标工具名 */
  target?: string;
  /** 订阅落点过滤 */
  scope?: SubscriptionScope;
  /** 资源类型简写（与位置参数 [type] 等价） */
  type?: string;
}

/**
 * 解析 `aitools sync [type] [name]` 两个位置参数 + `--type` 简写
 *
 * 消歧规则（按 RFC §4.4）：
 * 1. arg1 是合法 ResourceType / 'all' → arg1=type, arg2=name
 * 2. arg1 不是 ResourceType 且未提供 arg2 → 当 name 处理（type='all'，下游在每个已实现类型里找）
 * 3. arg1 不是 ResourceType 且提供了 arg2 → 视为用户笔误，报错
 *
 * @param arg1 第一个位置参数
 * @param arg2 第二个位置参数
 * @param optType --type 选项值
 * @returns 解析结果：{ type, name }；type 非法时返回 null
 */
function resolveArgs(
  arg1: string | undefined,
  arg2: string | undefined,
  optType: string | undefined,
): { type: ResourceType | 'all'; name?: string } | null {
  /* 优先用 --type 选项；否则用 arg1 */
  const rawType = (optType ?? arg1 ?? 'all').toLowerCase();

  /* Case A：rawType 是合法类型（或 'all'） */
  if (rawType === 'all') {
    /* `sync all <name>` 组合没意义（name 在跨类型下无法定位） */
    if (arg2) {
      return null;
    }
    return { type: 'all', name: undefined };
  }
  if (isValidResourceType(rawType)) {
    return { type: rawType, name: arg2 };
  }

  /* Case B：arg1 不是合法类型 */
  if (!arg2 && !optType) {
    /* 单参数且不是类型 → 当 name 处理（type='all'，跨类型查找） */
    return { type: 'all', name: arg1 };
  }

  /* Case C：明确给了非法类型 */
  return null;
}

/* ============================================================
 * 事件 emit 工具
 * ============================================================ */

/**
 * 把内部 SubscriptionLocation 转为 JSON 事件用的 SyncLocationData
 */
function toLocationData(location: SubscriptionLocation): SyncLocationData {
  if (location.scope === 'user') {
    return { scope: 'user' };
  }
  return { scope: 'project', projectDir: location.projectDir };
}

/**
 * JSON 模式下 emit start 事件（按"订阅位置"维度聚合）
 */
function emitStartEvent(
  type: ResourceType,
  location: SubscriptionLocation,
  total: number,
  targets: string[],
): void {
  if (!isJsonMode()) return;
  emitJson({
    event: 'start',
    data: {
      version: 2,
      type,
      location: toLocationData(location),
      total,
      targets,
    },
  });
}

/**
 * JSON 模式下 emit progress 事件
 */
function emitProgressEvent(
  ev: TaskProgressEvent,
): void {
  if (!isJsonMode()) return;
  emitJson({
    event: 'progress',
    data: {
      version: 2,
      resource: ev.task.resource.dirName,
      target: ev.task.target.name,
      location: toLocationData(ev.task.location),
      action: ev.action,
      index: ev.index,
      total: ev.total,
      ...(ev.error ? { error: ev.error } : {}),
    },
  });
}

/**
 * JSON 模式下 emit summary 事件
 */
function emitSummaryEvent(
  type: ResourceType,
  location: SubscriptionLocation,
  counts: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
  },
  resultsStub: { skillName: string; targetResults: [] }[],
): void {
  if (!isJsonMode()) return;
  emitJson({
    event: 'summary',
    data: {
      version: 2,
      type,
      location: toLocationData(location),
      totalSkills: counts.total,
      created: counts.created,
      updated: counts.updated,
      skipped: counts.skipped,
      /* SyncSummary 历史字段，保持兼容（PR-5 中 list 也会消费类似结构） */
      results: resultsStub,
    },
  });
}

/* ============================================================
 * human 模式输出（非 JSON）
 * ============================================================ */

/**
 * 按订阅位置打印一段同步汇总（human 模式）
 */
function printHumanSummary(
  type: ResourceType,
  location: SubscriptionLocation,
  counts: {
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  },
): void {
  if (isJsonMode()) return;

  const scopeLabel =
    location.scope === 'user'
      ? '用户级'
      : `项目级 · ${location.projectDir}`;

  const parts: string[] = [];
  if (counts.created > 0) parts.push(pc.green(`新增 ${counts.created}`));
  if (counts.updated > 0) parts.push(pc.yellow(`更新 ${counts.updated}`));
  if (counts.skipped > 0) parts.push(pc.dim(`跳过 ${counts.skipped}`));
  if (counts.failed > 0) parts.push(pc.red(`失败 ${counts.failed}`));

  reporter.info(
    `[${type}] ${scopeLabel}：${counts.total} 个任务${
      parts.length > 0 ? '，' + parts.join('，') : ''
    }`,
  );
}

/**
 * human 模式下每条进度打印
 */
function printHumanProgress(ev: TaskProgressEvent): void {
  if (isJsonMode()) return;

  const icon =
    ev.action === 'created'
      ? pc.green('✅')
      : ev.action === 'updated'
        ? pc.yellow('🔄')
        : ev.action === 'failed'
          ? pc.red('✖')
          : pc.dim('⏭️');
  const actionLabel =
    ev.action === 'created'
      ? '新增'
      : ev.action === 'updated'
        ? '更新'
        : ev.action === 'failed'
          ? '失败'
          : '已最新';

  const line = `   ${icon} ${ev.task.resource.dirName} → ${ev.task.target.name} (${actionLabel})`;
  console.log(ev.error ? `${line}  ${pc.red(ev.error)}` : line);
}

/* ============================================================
 * 按「订阅位置」分组执行
 * ============================================================ */

/**
 * 将一批 ExpandedTask 按订阅位置分组
 * key: `user` 或 `project:<projectDir>`
 */
function groupByLocation(
  tasks: ExpandedTask[],
): Map<string, { location: SubscriptionLocation; tasks: ExpandedTask[] }> {
  const groups = new Map<
    string,
    { location: SubscriptionLocation; tasks: ExpandedTask[] }
  >();
  for (const t of tasks) {
    const key =
      t.location.scope === 'user'
        ? 'user'
        : `project:${t.location.projectDir ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.tasks.push(t);
    } else {
      groups.set(key, { location: t.location, tasks: [t] });
    }
  }
  return groups;
}

/* ============================================================
 * 单一资源类型的订阅执行
 * ============================================================ */

/**
 * 同步单一资源类型的所有订阅
 * @param type 资源类型
 * @param config 全局配置
 * @param options CLI 选项
 * @param nameFilter 可选，只同步指定资源名
 */
async function syncOneType(
  type: ResourceType,
  config: Config,
  options: SyncCommandOptions,
  nameFilter?: string,
): Promise<void> {
  const handler = getHandler(type);
  if (!handler.implemented) {
    reporter.warn(`[${type}] 暂未支持，敬请期待`);
    return;
  }

  const sourceDir = expandTilde(config.source);
  const projectDir = process.cwd();

  /* 扫描源资源（扁平） */
  const resources = await handler.scan(sourceDir);

  /* 读取两级订阅清单 */
  const userSubs = getUserSubsForType(config, type);
  const projectConfig = await loadProjectConfig(projectDir);
  const projectSubs = getProjectSubsForType(projectConfig, type);

  /* 参与目标（过滤 enabled + --target） */
  const enabledTargets = config.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) {
    reporter.error(
      `[${type}] 没有已启用的同步目标，请检查配置或运行 aitools init`,
    );
    return;
  }

  /* 展开订阅 */
  const expanded = expandSubscriptions({
    type,
    resourceDirName: handler.resourceDirName,
    resources,
    enabledTargets,
    userSubscriptions: userSubs,
    projectContext: projectConfig
      ? { projectDir, subscriptions: projectSubs }
      : null,
    targetFilter: options.target,
    scopeFilter: options.scope,
    nameFilter,
  });

  /* 孤儿订阅告警（订阅了但源里没有） */
  if (expanded.orphanNames.length > 0) {
    reporter.warn(
      `[${type}] 以下资源订阅存在但源目录中不存在: ${expanded.orphanNames.join(
        ', ',
      )}`,
    );
  }

  if (expanded.tasks.length === 0) {
    if (nameFilter) {
      reporter.info(`[${type}] 资源 '${nameFilter}' 未被任何位置订阅，跳过`);
    } else {
      reporter.info(`[${type}] 没有可同步的订阅`);
    }
    return;
  }

  /* 按订阅位置分组执行，每组独立发 start + summary 事件 */
  const groups = groupByLocation(expanded.tasks);

  for (const [, group] of groups) {
    const targetNames = Array.from(
      new Set(group.tasks.map((t) => t.target.name)),
    );

    reporter.blank();
    const scopeLabel =
      group.location.scope === 'user'
        ? '用户级'
        : `项目级 · ${group.location.projectDir}`;
    reporter.info(
      `🔄 [${type}] 正在同步${scopeLabel} (${group.tasks.length} 个任务)...`,
    );
    reporter.blank();

    emitStartEvent(type, group.location, group.tasks.length, targetNames);

    const batchSummary = await syncTasks(group.tasks, (ev) => {
      emitProgressEvent(ev);
      printHumanProgress(ev);
    });

    printHumanSummary(type, group.location, batchSummary);
    emitSummaryEvent(type, group.location, batchSummary, []);
  }
}

/* ============================================================
 * CLI 入口
 * ============================================================ */

/**
 * sync 命令入口函数
 *
 * @param typeArg 第一个位置参数 [type] 或 [name]
 * @param nameArg 第二个位置参数 [name]
 * @param options 命令行选项
 */
export async function syncCommand(
  typeArg: string | undefined,
  nameArg: string | undefined,
  options: SyncCommandOptions,
): Promise<void> {
  /* 读取全局配置 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  /* 展开并校验源目录 */
  const sourceDir = expandTilde(config.source);
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      reporter.error(`源路径不是目录: ${config.source}`);
      if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
      return;
    }
  } catch {
    reporter.error(`源目录不存在: ${config.source}`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 解析位置参数 */
  const parsed = resolveArgs(typeArg, nameArg, options.type);
  if (parsed === null) {
    reporter.error(
      `参数解析失败。用法: aitools sync [type] [name]；type 可选值: ${[
        'all',
        ...listAllTypes(),
      ].join(', ')}`,
    );
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const { type, name } = parsed;

  /* 单一资源类型 */
  if (type !== 'all') {
    await syncOneType(type, config, options, name);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
    return;
  }

  /* type='all'：遍历所有已实现类型 */
  const implemented = listImplementedHandlers();
  if (implemented.length === 0) {
    reporter.warn('当前没有任何已实现的资源类型');
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 0 } });
    return;
  }

  for (const handler of implemented) {
    /**
     * type='all' + name 的组合：在每个已实现类型里分别尝试匹配该 name
     * 若某类型的订阅清单没有该 name，syncOneType 内部会打印"未订阅，跳过"
     * 不视为错误——符合 RFC §10 的"明确先于惊喜"（不做智能猜测）
     */
    await syncOneType(handler.type, config, options, name);
  }

  /* 未实现类型统一汇总提示 */
  const pending = listAllTypes().filter((t) => !getHandler(t).implemented);
  if (pending.length > 0) {
    reporter.blank();
    reporter.warn(`以下资源类型暂未支持同步: ${pending.join(', ')}`);
  }

  if (isJsonMode()) {
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

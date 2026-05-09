/**
 * list 命令处理模块（v0.4.0 PR-5 重写）
 *
 * 语义：
 *   aitools list                 # 所有已实现类型
 *   aitools list skills          # 仅 skills
 *   aitools list --type skills   # 同上简写
 *
 * 输出：
 *   JSON 模式：每种类型一个 list 事件，data 含 ResourceView[]
 *   human 模式：按"未订阅候选 / 用户级订阅 / 项目级订阅"三段呈现
 *
 * 参见：RFC-001 §3.2、§4 命令全表
 */
import fs from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, expandTilde } from '../config/manager.js';
import { getToolDisplayName } from '../registry/tools.js';
import {
  loadProjectConfig,
  projectConfigExists,
} from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listImplementedHandlers,
  listAllTypes,
} from '../core/resources/registry.js';
import {
  buildResourceViews,
  countUnsynced,
  splitBySubscribed,
} from '../core/status.js';
import {
  getUserSubsForType,
  getProjectSubsForType,
} from '../core/subscriptions.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  Config,
  ResourceType,
  ResourceView,
} from '../types/index.js';

/**
 * list 命令的选项
 */
interface ListCommandOptions {
  /** --type 简写（等价于位置参数） */
  type?: string;
}

/* ============================================================
 * 终端表格工具（复用 v0.3 已有的实现，迁移到本文件顶部）
 * ============================================================ */

/**
 * 计算字符串在终端中的实际显示宽度（CJK=2）
 */
function getStringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;
    const isCJK =
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x20000 && code <= 0x2a6df) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x2e80 && code <= 0x2eff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += isCJK ? 2 : 1;
  }
  return width;
}

/** 用空格把字符串填充到终端显示宽度 */
function padEndWidth(str: string, targetWidth: number): string {
  const currentWidth = getStringWidth(str);
  const padding = targetWidth - currentWidth;
  return padding > 0 ? str + ' '.repeat(padding) : str;
}

/** Unicode Box 表格渲染 */
function formatTable(headers: string[], rows: string[][]): string {
  const colCount = headers.length;
  const colWidths: number[] = [];
  for (let i = 0; i < colCount; i++) {
    let maxWidth = getStringWidth(headers[i]);
    for (const row of rows) {
      const cellWidth = getStringWidth(row[i] ?? '');
      if (cellWidth > maxWidth) {
        maxWidth = cellWidth;
      }
    }
    colWidths.push(maxWidth);
  }

  const sep = colWidths.map((w) => '─'.repeat(w + 2));
  const top = `┌${sep.join('┬')}┐`;
  const mid = `├${sep.join('┼')}┤`;
  const bot = `└${sep.join('┴')}┘`;
  const buildRow = (cells: string[]): string => {
    const pads = cells.map((c, i) => ` ${padEndWidth(c, colWidths[i])} `);
    return `│${pads.join('│')}│`;
  };

  const lines = [top, buildRow(headers), mid];
  for (const r of rows) lines.push(buildRow(r));
  lines.push(bot);
  return lines.join('\n');
}

/** 同步状态文案 */
function formatStatus(status: 'synced' | 'changed' | 'not_synced'): string {
  switch (status) {
    case 'synced':
      return '✅ 已同步';
    case 'changed':
      return '⚠️ 需更新';
    case 'not_synced':
      return '❌ 未同步';
  }
}

/**
 * target 名展示
 *
 * FEAT-005：从 SSOT 派生，删除硬编码的 TARGET_DISPLAY map。
 * 未在 SSOT 中的工具回退原 name，保持向后兼容。
 */
function displayTarget(name: string): string {
  return getToolDisplayName(name);
}

/** 资源名最大显示宽度（超出截断） */
const MAX_NAME_WIDTH = 24;
function truncateName(name: string): string {
  if (getStringWidth(name) <= MAX_NAME_WIDTH) return name;
  let width = 0;
  let out = '';
  for (const ch of name) {
    const w = getStringWidth(ch);
    if (width + w > MAX_NAME_WIDTH - 3) break;
    width += w;
    out += ch;
  }
  return out + '...';
}

/* ============================================================
 * 单类型 list 处理
 * ============================================================ */

/**
 * 输出指定类型的 list
 * @param type 资源类型
 * @param config 全局配置
 * @returns 是否存在"未完全同步"资源（用于底部汇总提示）
 */
async function listOneType(
  type: ResourceType,
  config: Config,
): Promise<boolean> {
  const handler = getHandler(type);

  /* 未实现类型 */
  if (!handler.implemented) {
    if (!isJsonMode()) {
      reporter.blank();
      reporter.warn(`[${type}] 暂未支持，敬请期待`);
    }
    return false;
  }

  const sourceDir = expandTilde(config.source);
  const projectDir = process.cwd();
  const hasProjectConfig = await projectConfigExists(projectDir);
  const projectConfig = hasProjectConfig
    ? await loadProjectConfig(projectDir)
    : null;

  /* 扫源 + 读订阅清单 */
  const resources = await handler.scan(sourceDir);
  const userSubs = getUserSubsForType(config, type);
  const projectSubs = getProjectSubsForType(projectConfig, type);
  const enabledTargets = config.targets.filter((t) => t.enabled);

  /* 展开 + 计算 */
  const { views, orphanNames } = await buildResourceViews({
    type,
    resourceDirName: handler.resourceDirName,
    resources,
    enabledTargets,
    userSubscriptions: userSubs,
    projectContext: projectConfig
      ? { projectDir, subscriptions: projectSubs }
      : null,
  });

  /* 孤儿订阅提示 */
  if (orphanNames.length > 0 && !isJsonMode()) {
    reporter.blank();
    reporter.warn(
      `[${type}] 以下订阅指向的资源在源目录中不存在: ${orphanNames.join(', ')}`,
    );
  }

  const hasUnsynced = countUnsynced(views) > 0;

  if (isJsonMode()) {
    emitJson({
      event: 'list',
      data: {
        version: 2,
        type,
        resources: views,
        enabledTargets: enabledTargets.map((t) => t.name),
        allTargets: config.targets.map((t) => ({ name: t.name, enabled: t.enabled, user_base: t.user_base })),
        ...(hasProjectConfig ? { projectDir } : {}),
      },
    });
    return hasUnsynced;
  }

  /* ----- human 输出 ----- */
  printHumanForType(type, views, enabledTargets, projectDir, hasProjectConfig);
  return hasUnsynced;
}

/* ============================================================
 * human 模式输出
 * ============================================================ */

/**
 * human 模式下打印单类型内容
 */
function printHumanForType(
  type: ResourceType,
  views: ResourceView[],
  enabledTargets: Config['targets'],
  projectDir: string,
  hasProjectConfig: boolean,
): void {
  const { subscribed, unsubscribed } = splitBySubscribed(views);

  /* 头部标题 */
  reporter.blank();
  reporter.info(pc.bold(`📋 [${type}] 资源清单（共 ${views.length} 个）`));

  /* 无任何资源 */
  if (views.length === 0) {
    reporter.blank();
    reporter.info(
      `源目录暂无 ${type}。请在 ${'~/.aitools/'}${type}/ 下创建文件夹`,
    );
    return;
  }

  /* ---- 1. 未订阅候选 ---- */
  if (unsubscribed.length > 0) {
    reporter.blank();
    reporter.info(
      pc.dim(`未订阅候选（${unsubscribed.length} 个；可用 aitools subscribe ${type} <name> 订阅）:`),
    );
    for (const v of unsubscribed) {
      const hashShort = v.sourceHash.slice(0, 8);
      console.log(
        `  ${pc.dim('○')} ${truncateName(v.dirName)}  ${pc.dim(hashShort)}  ${pc.dim(v.description)}`,
      );
    }
  }

  /* ---- 2. 用户级订阅表格 ---- */
  const userSubscribed = subscribed.filter((v) =>
    v.subscriptions.some((s) => s.scope === 'user'),
  );
  if (userSubscribed.length > 0) {
    reporter.blank();
    reporter.info(pc.cyan(`用户级订阅（${userSubscribed.length} 个）：`));
    reporter.blank();
    const targetNames = enabledTargets.map((t) => t.name);
    const headers = [
      '名称',
      '源 hash',
      ...targetNames.map((n) => displayTarget(n)),
    ];
    const rows: string[][] = [];
    for (const v of userSubscribed) {
      const userSub = v.subscriptions.find((s) => s.scope === 'user')!;
      const statusByTarget = new Map(
        userSub.targets.map((t) => [t.target, t.status] as const),
      );
      const statusCells = targetNames.map((n) => {
        const st = statusByTarget.get(n);
        return st ? formatStatus(st) : pc.dim('—');
      });
      rows.push([
        truncateName(v.name),
        v.sourceHash.slice(0, 8),
        ...statusCells,
      ]);
    }
    reporter.raw(formatTable(headers, rows));
  }

  /* ---- 3. 项目级订阅表格 ---- */
  if (hasProjectConfig) {
    const projectSubscribed = subscribed.filter((v) =>
      v.subscriptions.some((s) => s.scope === 'project'),
    );
    if (projectSubscribed.length > 0) {
      reporter.blank();
      reporter.info(
        pc.magenta(
          `项目级订阅（${projectSubscribed.length} 个；项目: ${projectDir}）：`,
        ),
      );
      reporter.blank();
      /* 项目级订阅展开时使用与 user 相同的 enabledTargets 列头
         若希望未来按 detectProjectTools 精简列头，可在此处扩展；
         当前保持简单一致性 */
      const targetNames = enabledTargets.map((t) => t.name);
      const headers = [
        '名称',
        '源 hash',
        ...targetNames.map((n) => displayTarget(n)),
      ];
      const rows: string[][] = [];
      for (const v of projectSubscribed) {
        const projSub = v.subscriptions.find((s) => s.scope === 'project')!;
        const statusByTarget = new Map(
          projSub.targets.map((t) => [t.target, t.status] as const),
        );
        const statusCells = targetNames.map((n) => {
          const st = statusByTarget.get(n);
          return st ? formatStatus(st) : pc.dim('—');
        });
        rows.push([
          truncateName(v.name),
          v.sourceHash.slice(0, 8),
          ...statusCells,
        ]);
      }
      reporter.raw(formatTable(headers, rows));
    }
  }

  /* ---- 底部：空订阅提示 ---- */
  if (subscribed.length === 0) {
    reporter.blank();
    reporter.info(
      pc.dim(
        `当前没有任何 ${type} 订阅。示例:\n` +
          `  aitools subscribe ${type} <name>              # 订阅到用户级\n` +
          `  aitools subscribe ${type} <name> --scope project   # 订阅到当前项目`,
      ),
    );
  }
}

/* ============================================================
 * CLI 入口
 * ============================================================ */

/**
 * list 命令入口
 * @param typeArg 位置参数 [type]
 * @param options CLI 选项（含 --type 简写）
 */
export async function listCommand(
  typeArg: string | undefined,
  options: ListCommandOptions,
): Promise<void> {
  /* 读取配置 */
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) {
      emitJson({ event: 'done', data: { exitCode: 1 } });
    }
    return;
  }

  /* 校验源目录 */
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

  /* 解析 type */
  const raw = (typeArg ?? options.type ?? 'all').toLowerCase();
  let types: ResourceType[];
  if (raw === 'all') {
    types = listAllTypes();
  } else if (isValidResourceType(raw)) {
    types = [raw];
  } else {
    reporter.error(
      `未知的资源类型: ${raw}。可选值: ${['all', ...listAllTypes()].join(', ')}`,
    );
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 检查是否有启用目标 */
  const enabledTargets = config.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0 && !isJsonMode()) {
    reporter.warn('没有已启用的同步目标，建议运行 aitools init');
  }

  /* 输出每个类型 */
  let aggregateUnsynced = false;
  let handled = 0;
  if (raw === 'all') {
    for (const handler of listImplementedHandlers()) {
      const had = await listOneType(handler.type, config);
      if (had) aggregateUnsynced = true;
      handled++;
    }
    /* 未实现类型汇总（human 模式） */
    const pending = types.filter((t) => !getHandler(t).implemented);
    if (pending.length > 0 && !isJsonMode()) {
      reporter.blank();
      reporter.warn(`以下资源类型暂未支持: ${pending.join(', ')}`);
    }
  } else {
    for (const t of types) {
      const had = await listOneType(t, config);
      if (had) aggregateUnsynced = true;
      handled++;
    }
  }

  /* 底部 human 提示 */
  if (!isJsonMode() && handled > 0) {
    reporter.blank();
    if (aggregateUnsynced) {
      reporter.info('💡 运行 aitools sync 同步最新变更');
    } else {
      reporter.success('所有订阅已是最新状态');
    }
  } else if (isJsonMode()) {
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

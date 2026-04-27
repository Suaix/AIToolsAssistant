/**
 * list 命令处理模块
 * v0.2.0：按资源类型展示同步状态（用户级 + 项目级两段式）
 * v0.3.0：支持 --json 输出（NDJSON），供 GUI 等机器消费方
 * 支持子命令参数（aitools list skills）与 --type 简写
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, expandTilde } from '../config/manager.js';
import { hashDirectory, hashDirectorySafe } from '../core/hasher.js';
import {
  getUserTargetDir,
  getProjectTargetDir,
  detectProjectTools,
} from '../core/syncer.js';
import {
  loadProjectConfig,
  getProjectResourceList,
} from '../config/project.js';
import {
  getHandler,
  isValidResourceType,
  listImplementedHandlers,
  listAllTypes,
} from '../core/resources/registry.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';
import type {
  Config,
  ResourceInfo,
  ResourceListItem,
  ResourceType,
  SkillSyncStatus,
  Target,
} from '../types/index.js';

/**
 * 列表命令的选项参数
 */
interface ListCommandOptions {
  /** 可选，资源类型简写 */
  type?: string;
}

/**
 * 计算字符串在终端中的实际显示宽度
 * CJK 字符占 2 宽度，其他占 1 宽度
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

/**
 * 用空格将字符串填充到指定的终端显示宽度
 */
function padEndWidth(str: string, targetWidth: number): string {
  const currentWidth = getStringWidth(str);
  const padding = targetWidth - currentWidth;
  return padding > 0 ? str + ' '.repeat(padding) : str;
}

/**
 * 使用 Unicode Box Drawing 字符渲染对齐表格
 */
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

  const separatorCells = colWidths.map((w) => '─'.repeat(w + 2));
  const topBorder = `┌${separatorCells.join('┬')}┐`;
  const midBorder = `├${separatorCells.join('┼')}┤`;
  const botBorder = `└${separatorCells.join('┴')}┘`;

  const buildRow = (cells: string[]): string => {
    const paddedCells = cells.map(
      (cell, i) => ` ${padEndWidth(cell, colWidths[i])} `,
    );
    return `│${paddedCells.join('│')}│`;
  };

  const lines: string[] = [];
  lines.push(topBorder);
  lines.push(buildRow(headers));
  lines.push(midBorder);
  for (const row of rows) {
    lines.push(buildRow(row));
  }
  lines.push(botBorder);

  return lines.join('\n');
}

/**
 * 格式化同步状态为终端展示字符串
 */
function formatStatus(status: SkillSyncStatus): string {
  switch (status) {
    case 'synced':
      return '✅ 已同步';
    case 'changed':
      return '⚠️ 需更新';
    case 'not_synced':
      return '❌ 未同步';
  }
}

/** 资源名称最大显示宽度 */
const MAX_NAME_WIDTH = 20;

/**
 * 截断资源名称到指定最大宽度
 */
function truncateName(name: string): string {
  if (getStringWidth(name) <= MAX_NAME_WIDTH) {
    return name;
  }
  let width = 0;
  let result = '';
  for (const char of name) {
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
    const charWidth = isCJK ? 2 : 1;
    if (width + charWidth > MAX_NAME_WIDTH - 3) {
      break;
    }
    width += charWidth;
    result += char;
  }
  return result + '...';
}

/**
 * 目标工具显示名称映射
 */
const TARGET_DISPLAY_NAMES: Record<string, string> = {
  codebuddy: 'CodeBuddy',
  'claude-code': 'Claude Code',
};

function getTargetDisplayName(targetName: string): string {
  return TARGET_DISPLAY_NAMES[targetName] ?? targetName;
}

/**
 * 获取单个资源在单个目标的用户级同步状态
 */
async function getUserTargetStatus(
  sourceHash: string,
  resource: ResourceInfo,
  target: Target,
  type: ResourceType,
): Promise<SkillSyncStatus> {
  const targetBaseDir = getUserTargetDir(target, type);
  const targetResourceDir = path.join(targetBaseDir, resource.dirName);
  const targetHash = await hashDirectorySafe(targetResourceDir);

  if (targetHash === null) {
    return 'not_synced';
  }
  return sourceHash === targetHash ? 'synced' : 'changed';
}

/**
 * 获取单个资源在单个目标的项目级同步状态
 */
async function getProjectTargetStatus(
  sourceHash: string,
  resourceDirName: string,
  targetName: string,
  projectDir: string,
  type: ResourceType,
): Promise<SkillSyncStatus> {
  const targetBaseDir = getProjectTargetDir(projectDir, targetName, type);
  const targetResourceDir = path.join(targetBaseDir, resourceDirName);
  const targetHash = await hashDirectorySafe(targetResourceDir);

  if (targetHash === null) {
    return 'not_synced';
  }
  return sourceHash === targetHash ? 'synced' : 'changed';
}

/**
 * 输出单个资源类型的用户级 + 项目级两段式列表
 * @param type 资源类型
 * @param config 全局配置
 * @returns 是否存在未同步资源（用于底部提示聚合）
 */
async function listOneType(type: ResourceType, config: Config): Promise<boolean> {
  const handler = getHandler(type);

  /* 未实现类型：统一输出占位提示 */
  if (!handler.implemented) {
    reporter.blank();
    reporter.warn(`[${type}] 暂未支持，敬请期待`);
    return false;
  }

  /* JSON 模式：直接采集数据并 emit 事件，不走彩色表格 */
  if (isJsonMode()) {
    return await listOneTypeJson(type, config);
  }

  const sourceDir = expandTilde(config.source);

  /* 扫描该类型的用户级资源 */
  const userResources = await handler.scan(sourceDir, 'user');

  const enabledTargets = config.targets.filter((t) => t.enabled);
  let hasUnsynced = false;

  /* ==================== 用户级表格 ==================== */
  if (userResources.length === 0) {
    reporter.blank();
    reporter.info(
      `📋 [${type}] 用户级资源为空 (源: ${config.source}/${handler.resourceDirName}/user/)`,
    );
  } else {
    reporter.blank();
    reporter.info(
      `📋 [${type}] 用户级资源 (源: ${config.source}/${handler.resourceDirName}/user/)`,
    );
    reporter.blank();

    const headers = [
      '名称',
      '源 hash',
      ...enabledTargets.map((t) => getTargetDisplayName(t.name)),
    ];

    const skillHashMap = new Map<string, string>();
    const rows: string[][] = [];

    for (const resource of userResources) {
      const sourceHash = await hashDirectory(resource.path);
      skillHashMap.set(resource.dirName, sourceHash);
      const shortHash = sourceHash.slice(0, 8);

      const statusCells: string[] = [];
      for (const target of enabledTargets) {
        try {
          const status = await getUserTargetStatus(
            sourceHash,
            resource,
            target,
            type,
          );
          statusCells.push(formatStatus(status));
          if (status !== 'synced') {
            hasUnsynced = true;
          }
        } catch {
          statusCells.push(formatStatus('not_synced'));
          hasUnsynced = true;
        }
      }

      rows.push([truncateName(resource.name), shortHash, ...statusCells]);
    }

    reporter.raw(formatTable(headers, rows));
  }

  /* ==================== 项目级表格（自动检测） ==================== */
  const projectDir = process.cwd();
  const projectConfig = await loadProjectConfig(projectDir);

  if (!projectConfig) {
    return hasUnsynced;
  }

  const associated = getProjectResourceList(projectConfig, type);
  if (associated.length === 0) {
    return hasUnsynced;
  }

  /* 项目关联的资源可能来自 user 或 project scope */
  const projectScopeList = await handler.scan(sourceDir, 'project');
  const allSource = [...projectScopeList, ...userResources];

  /* 检测当前项目实际使用的 AI 工具；都没检测到则展示所有已启用目标 */
  const detectedTargets = detectProjectTools(projectDir, enabledTargets);
  const projectTargets =
    detectedTargets.length > 0 ? detectedTargets : enabledTargets;

  if (projectTargets.length === 0) {
    return hasUnsynced;
  }

  reporter.blank();
  reporter.info(`📁 [${type}] 项目级资源 (项目: ${projectDir})`);
  reporter.blank();

  const projectHeaders = [
    '名称',
    '源 hash',
    ...projectTargets.map((t) => getTargetDisplayName(t.name)),
  ];
  const projectRows: string[][] = [];

  for (const resourceName of associated) {
    const resource = allSource.find((r) => r.dirName === resourceName);

    if (!resource) {
      /* 源目录中不存在该资源，标注 (源已删除) */
      const displayName = truncateName(`${resourceName} (源已删除)`);
      const dashCells = projectTargets.map(() => '-');
      projectRows.push([displayName, '-', ...dashCells]);
      hasUnsynced = true;
      continue;
    }

    const sourceHash = await hashDirectory(resource.path);
    const shortHash = sourceHash.slice(0, 8);

    const statusCells: string[] = [];
    for (const target of projectTargets) {
      try {
        const status = await getProjectTargetStatus(
          sourceHash,
          resourceName,
          target.name,
          projectDir,
          type,
        );
        statusCells.push(formatStatus(status));
        if (status !== 'synced') {
          hasUnsynced = true;
        }
      } catch {
        statusCells.push(formatStatus('not_synced'));
        hasUnsynced = true;
      }
    }

    projectRows.push([truncateName(resource.name), shortHash, ...statusCells]);
  }

  reporter.raw(formatTable(projectHeaders, projectRows));

  return hasUnsynced;
}

/**
 * JSON 模式下的单类型列表：采集数据并 emit 两个 list 事件（user + project）
 * @param type 资源类型
 * @param config 全局配置
 * @returns 是否存在未同步资源
 */
async function listOneTypeJson(
  type: ResourceType,
  config: Config,
): Promise<boolean> {
  const handler = getHandler(type);
  const sourceDir = expandTilde(config.source);
  const enabledTargets = config.targets.filter((t) => t.enabled);
  let hasUnsynced = false;

  /* ==================== 用户级数据采集 ==================== */
  const userResources = await handler.scan(sourceDir, 'user');
  const userItems: ResourceListItem[] = [];

  for (const resource of userResources) {
    const sourceHash = await hashDirectory(resource.path);
    const targetStatuses: ResourceListItem['targets'] = [];

    for (const target of enabledTargets) {
      const targetBaseDir = getUserTargetDir(target, type);
      const targetResourceDir = path.join(targetBaseDir, resource.dirName);
      try {
        const status = await getUserTargetStatus(sourceHash, resource, target, type);
        targetStatuses.push({
          name: target.name,
          status,
          targetPath: targetResourceDir,
        });
        if (status !== 'synced') {
          hasUnsynced = true;
        }
      } catch {
        targetStatuses.push({
          name: target.name,
          status: 'not_synced',
          targetPath: targetResourceDir,
        });
        hasUnsynced = true;
      }
    }

    userItems.push({
      name: resource.name,
      dirName: resource.dirName,
      description: resource.description,
      scope: 'user',
      path: resource.path,
      sourceHash,
      targets: targetStatuses,
    });
  }

  emitJson({
    event: 'list',
    data: {
      type,
      scope: 'user',
      resources: userItems,
      enabledTargets: enabledTargets.map((t) => t.name),
    },
  });

  /* ==================== 项目级数据采集 ==================== */
  const projectDir = process.cwd();
  const projectConfig = await loadProjectConfig(projectDir);

  if (!projectConfig) {
    return hasUnsynced;
  }

  const associated = getProjectResourceList(projectConfig, type);
  if (associated.length === 0) {
    return hasUnsynced;
  }

  const projectScopeList = await handler.scan(sourceDir, 'project');
  const allSource = [...projectScopeList, ...userResources];

  const detectedTargets = detectProjectTools(projectDir, enabledTargets);
  const projectTargets =
    detectedTargets.length > 0 ? detectedTargets : enabledTargets;

  const projectItems: ResourceListItem[] = [];

  for (const resourceName of associated) {
    const resource = allSource.find((r) => r.dirName === resourceName);

    if (!resource) {
      /* 源已删除：用空 hash、所有目标 not_synced 的占位条目 */
      projectItems.push({
        name: `${resourceName} (源已删除)`,
        dirName: resourceName,
        description: '-',
        scope: 'project',
        path: '',
        sourceHash: '',
        targets: projectTargets.map((t) => ({
          name: t.name,
          status: 'not_synced',
          targetPath: getProjectTargetDir(projectDir, t.name, type),
        })),
      });
      hasUnsynced = true;
      continue;
    }

    const sourceHash = await hashDirectory(resource.path);
    const targetStatuses: ResourceListItem['targets'] = [];

    for (const target of projectTargets) {
      const targetBaseDir = getProjectTargetDir(projectDir, target.name, type);
      const targetResourceDir = path.join(targetBaseDir, resourceName);
      try {
        const status = await getProjectTargetStatus(
          sourceHash,
          resourceName,
          target.name,
          projectDir,
          type,
        );
        targetStatuses.push({
          name: target.name,
          status,
          targetPath: targetResourceDir,
        });
        if (status !== 'synced') {
          hasUnsynced = true;
        }
      } catch {
        targetStatuses.push({
          name: target.name,
          status: 'not_synced',
          targetPath: targetResourceDir,
        });
        hasUnsynced = true;
      }
    }

    projectItems.push({
      name: resource.name,
      dirName: resource.dirName,
      description: resource.description,
      scope: 'project',
      path: resource.path,
      sourceHash,
      targets: targetStatuses,
    });
  }

  emitJson({
    event: 'list',
    data: {
      type,
      scope: 'project',
      resources: projectItems,
      enabledTargets: projectTargets.map((t) => t.name),
    },
  });

  return hasUnsynced;
}

/**
 * list 命令处理函数
 * @param typeArg commander 位置参数 [type]
 * @param options 命令行选项（含 --type 简写）
 */
export async function listCommand(
  typeArg: string | undefined,
  options: ListCommandOptions,
): Promise<void> {
  /* 读取全局配置 */
  const config = await loadConfig();
  if (!config) {
    return;
  }

  /* 校验源目录存在性 */
  const sourceDir = expandTilde(config.source);
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      reporter.error(`源路径不是目录: ${config.source}`);
      return;
    }
  } catch {
    reporter.error(`源目录不存在: ${config.source}`);
    return;
  }

  /* 解析资源类型参数 */
  const raw = (typeArg ?? options.type ?? 'all').toLowerCase();

  let types: ResourceType[];
  if (raw === 'all') {
    /* 列出所有已注册类型（含未实现，未实现类型会提示占位） */
    types = listAllTypes();
  } else if (isValidResourceType(raw)) {
    types = [raw];
  } else {
    reporter.error(
      `未知的资源类型: ${raw}。可选值: ${['all', ...listAllTypes()].join(', ')}`,
    );
    return;
  }

  /* 检查是否有已启用目标（影响表格列） */
  const enabledTargets = config.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) {
    reporter.warn('没有已启用的同步目标，建议运行 aitools init');
  }

  /* 对 all 场景：只输出已实现类型的表格，未实现类型汇总提示在末尾 */
  let aggregateUnsynced = false;
  if (raw === 'all') {
    for (const handler of listImplementedHandlers()) {
      const hasUnsynced = await listOneType(handler.type, config);
      if (hasUnsynced) {
        aggregateUnsynced = true;
      }
    }
    const pending = types.filter((t) => !getHandler(t).implemented);
    if (pending.length > 0) {
      reporter.blank();
      reporter.warn(`以下资源类型暂未支持：${pending.join(', ')}`);
    }
  } else {
    for (const t of types) {
      const hasUnsynced = await listOneType(t, config);
      if (hasUnsynced) {
        aggregateUnsynced = true;
      }
    }
  }

  /* 底部提示（仅 human 模式） */
  if (!isJsonMode()) {
    reporter.blank();
    if (aggregateUnsynced) {
      reporter.info('💡 运行 aitools sync 同步最新变更');
    } else {
      reporter.success('所有资源已同步到最新状态');
    }
  } else {
    /* JSON 模式输出 done 事件 */
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

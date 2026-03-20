/**
 * list 命令处理模块
 * 列出源目录中所有 Skills 并展示同步状态
 */
import fs from 'node:fs/promises';
import { loadConfig, expandTilde } from '../config/manager.js';
import { scanSkills } from '../core/scanner.js';
import { hashDirectory, hashDirectorySafe } from '../core/hasher.js';
import { logger } from '../utils/logger.js';
import type { SkillInfo, SkillSyncStatus, Target } from '../types/index.js';
import path from 'node:path';

/**
 * 计算字符串在终端中的实际显示宽度
 * CJK（中日韩）字符占 2 个宽度，其他字符占 1 个宽度
 * @param str 需要计算宽度的字符串
 * @returns 终端显示宽度
 */
function getStringWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;
    /* CJK 统一表意文字范围 */
    const isCJK =
      (code >= 0x4e00 && code <= 0x9fff) || /* CJK 基本区 */
      (code >= 0x3400 && code <= 0x4dbf) || /* CJK 扩展A */
      (code >= 0x20000 && code <= 0x2a6df) || /* CJK 扩展B */
      (code >= 0xf900 && code <= 0xfaff) || /* CJK 兼容表意文字 */
      (code >= 0x2e80 && code <= 0x2eff) || /* CJK 部首补充 */
      (code >= 0x3000 && code <= 0x303f) || /* CJK 符号和标点 */
      (code >= 0xff01 && code <= 0xff60) || /* 全角 ASCII 变体 */
      (code >= 0xffe0 && code <= 0xffe6); /* 全角符号 */
    width += isCJK ? 2 : 1;
  }
  return width;
}

/**
 * 用空格将字符串填充到指定的终端显示宽度
 * 与 String.padEnd() 不同，此函数正确处理 CJK 字符宽度
 * @param str 原始字符串
 * @param targetWidth 目标终端宽度
 * @returns 填充后的字符串
 */
function padEndWidth(str: string, targetWidth: number): string {
  const currentWidth = getStringWidth(str);
  const padding = targetWidth - currentWidth;
  return padding > 0 ? str + ' '.repeat(padding) : str;
}

/**
 * 使用 Unicode Box Drawing 字符渲染对齐表格
 * 自动根据各列内容的实际终端宽度计算列宽
 * @param headers 表头数组
 * @param rows 数据行数组（每行是一个字符串数组）
 * @returns 渲染好的表格字符串（包含换行符）
 */
function formatTable(headers: string[], rows: string[][]): string {
  const colCount = headers.length;

  /* 计算每列的最大显示宽度 */
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

  /* 构建分隔线 */
  const separatorCells = colWidths.map((w) => '─'.repeat(w + 2));
  const topBorder = `┌${separatorCells.join('┬')}┐`;
  const midBorder = `├${separatorCells.join('┼')}┤`;
  const botBorder = `└${separatorCells.join('┴')}┘`;

  /* 构建行内容 */
  const buildRow = (cells: string[]): string => {
    const paddedCells = cells.map((cell, i) => ` ${padEndWidth(cell, colWidths[i])} `);
    return `│${paddedCells.join('│')}│`;
  };

  /* 拼装完整表格 */
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
 * 获取单个 Skill 在单个目标中的同步状态
 * @param sourceHash 源目录预计算的 hash 值
 * @param skill Skill 元数据
 * @param target 目标工具配置
 * @returns 同步状态码
 */
async function getSkillTargetStatus(
  sourceHash: string,
  skill: SkillInfo,
  target: Target,
): Promise<SkillSyncStatus> {
  const targetBaseDir = expandTilde(target.user_path);
  const targetSkillDir = path.join(targetBaseDir, skill.dirName);

  /* 计算目标目录 hash */
  const targetHash = await hashDirectorySafe(targetSkillDir);

  if (targetHash === null) {
    return 'not_synced';
  }

  return sourceHash === targetHash ? 'synced' : 'changed';
}

/**
 * 格式化同步状态为终端展示字符串
 * @param status 同步状态码
 * @returns 带图标的状态文案
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

/** Skill 名称最大显示宽度（超过则截断） */
const MAX_NAME_WIDTH = 20;

/**
 * 截断 Skill 名称到指定最大宽度，超出部分用 ... 替代
 * @param name Skill 名称
 * @returns 截断后的名称
 */
function truncateName(name: string): string {
  if (getStringWidth(name) <= MAX_NAME_WIDTH) {
    return name;
  }
  /* 逐字符累加宽度直到达到限制 */
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
    /* 预留 3 个字符宽度给 ... */
    if (width + charWidth > MAX_NAME_WIDTH - 3) {
      break;
    }
    width += charWidth;
    result += char;
  }
  return result + '...';
}

/**
 * 目标工具名称映射（内部标识 → 显示名称）
 */
const TARGET_DISPLAY_NAMES: Record<string, string> = {
  codebuddy: 'CodeBuddy',
  'claude-code': 'Claude Code',
};

/**
 * 获取目标工具的显示名称
 * @param targetName 目标工具内部名称
 * @returns 友好显示名称
 */
function getTargetDisplayName(targetName: string): string {
  return TARGET_DISPLAY_NAMES[targetName] ?? targetName;
}

/**
 * list 命令处理函数
 * 扫描源目录 Skills 并以表格形式展示各目标的同步状态
 */
export async function listCommand(): Promise<void> {
  /* 读取配置文件 */
  const config = await loadConfig();
  if (!config) {
    return;
  }

  /* 展开源目录路径 */
  const sourceDir = expandTilde(config.source);

  /* 校验源目录存在性 */
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      logger.error(`源路径不是目录: ${config.source}`);
      return;
    }
  } catch {
    logger.error(`源目录不存在: ${config.source}`);
    return;
  }

  /* 扫描源目录中的 Skills */
  const skills = await scanSkills(sourceDir);

  if (skills.length === 0) {
    logger.info('源目录中没有发现任何 Skill');
    logger.info(`源目录: ${config.source}`);
    return;
  }

  /* 筛选已启用的目标 */
  const enabledTargets = config.targets.filter((t) => t.enabled);

  /* 输出标题 */
  console.log('');
  logger.info(`📋 用户级 Skills (源: ${config.source})`);
  console.log('');

  /* 构建表头：固定列 + 动态目标列 */
  const headers = [
    'Skill 名称',
    '源 hash',
    ...enabledTargets.map((t) => getTargetDisplayName(t.name)),
  ];

  /* 是否存在未同步的 Skill */
  let hasUnsyncedSkill = false;

  /* 采集每个 Skill 的数据行 */
  const rows: string[][] = [];

  for (const skill of skills) {
    /* 计算源目录 hash（每个 Skill 只计算一次） */
    const sourceHash = await hashDirectory(skill.path);
    /* 截取前 8 位作为短 hash */
    const shortHash = sourceHash.slice(0, 8);

    /* 获取各目标的独立同步状态 */
    const statusCells: string[] = [];

    for (const target of enabledTargets) {
      try {
        const status = await getSkillTargetStatus(sourceHash, skill, target);
        statusCells.push(formatStatus(status));
        if (status !== 'synced') {
          hasUnsyncedSkill = true;
        }
      } catch {
        statusCells.push(formatStatus('not_synced'));
        hasUnsyncedSkill = true;
      }
    }

    /* 组装数据行：名称（截断） | 源 hash | 各目标状态 */
    rows.push([truncateName(skill.name), shortHash, ...statusCells]);
  }

  /* 渲染并输出表格 */
  console.log(formatTable(headers, rows));

  /* 底部操作提示 */
  console.log('');
  if (hasUnsyncedSkill) {
    logger.info('💡 运行 aitools sync 同步最新变更');
  } else {
    logger.success('所有 Skills 已同步到最新状态');
  }
}

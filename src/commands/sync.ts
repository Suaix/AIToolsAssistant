/**
 * sync 命令处理模块
 * 实现用户级 Skills 同步：从源目录到各 AI 工具用户级目录
 */
import fs from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, expandTilde, collapseTilde } from '../config/manager.js';
import { scanSkills } from '../core/scanner.js';
import { syncAllSkills } from '../core/syncer.js';
import { logger } from '../utils/logger.js';

/**
 * 同步命令的选项参数
 */
interface SyncCommandOptions {
  /** 可选，指定单个同步目标工具名称 */
  target?: string;
}

/**
 * 同步命令处理函数
 * 读取配置，扫描源目录 Skills，执行同步并输出结果摘要
 * @param options 命令行选项参数
 */
export async function syncCommand(options: SyncCommandOptions): Promise<void> {
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
    logger.info('请确保 Skill 文件夹包含 SKILL.md 文件');
    return;
  }

  /* 确定同步目标 */
  const targetFilter = options.target;
  const enabledTargets = config.targets.filter((t) => t.enabled);

  if (enabledTargets.length === 0) {
    logger.error('没有已启用的同步目标，请检查配置或运行 aitools init');
    return;
  }

  /* 输出同步开始信息 */
  console.log('');
  logger.info(`🔄 正在同步用户级 Skills...`);
  logger.info(`   源目录: ${config.source} (${skills.length} 个 Skills)`);
  console.log('');

  /* 执行同步 */
  const summary = await syncAllSkills(skills, config, targetFilter);

  /* 输出每个 Skill 的同步结果 */
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

    /* 判断该 Skill 的整体状态图标 */
    const hasChange = result.targetResults.some(
      (tr) => tr.action === 'created' || tr.action === 'updated',
    );

    if (hasChange) {
      const actions = result.targetResults
        .filter((tr) => tr.action !== 'skipped')
        .map((tr) => (tr.action === 'created' ? '新增' : '更新'));
      const actionLabel = [...new Set(actions)].join('/');
      console.log(`   ${pc.green('✅')} ${result.skillName} → ${targetNames} (${actionLabel})`);
    } else {
      console.log(`   ${pc.dim('⏭️')}  ${result.skillName} → ${targetNames} (${pc.dim('无变更')})`);
    }
  }

  /* 输出汇总 */
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
    `📊 同步完成: ${summary.totalSkills} 个 Skills${parts.length > 0 ? '，' + parts.join('，') : ''}`,
  );
}

/**
 * sync 命令处理模块
 * 实现用户级和项目级 Skills 同步：从源目录到各 AI 工具的用户级/项目级目录
 */
import fs from 'node:fs/promises';
import pc from 'picocolors';
import { loadConfig, expandTilde } from '../config/manager.js';
import { scanSkills } from '../core/scanner.js';
import { syncAllSkills, syncProjectSkills } from '../core/syncer.js';
import {
  loadProjectConfig,
  addSkillToProject,
  projectConfigExists,
} from '../config/project.js';
import { logger } from '../utils/logger.js';
import type { SyncSummary } from '../types/index.js';

/**
 * 同步命令的选项参数
 */
interface SyncCommandOptions {
  /** 可选，指定单个同步目标工具名称 */
  target?: string;
  /** 可选，指定要同步的 Skill 名称（项目级添加/同步） */
  skill?: string;
  /** 可选，同步范围：user-仅用户级、project-仅项目级，不指定则智能检测 */
  scope?: 'user' | 'project';
}

/**
 * 打印同步结果摘要
 * @param summary 同步结果摘要对象
 * @param label 摘要标签（如 "用户级" 或 "项目级"）
 */
function printSyncResults(summary: SyncSummary, label: string): void {
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
    `📊 ${label}同步完成: ${summary.totalSkills} 个 Skills${parts.length > 0 ? '，' + parts.join('，') : ''}`,
  );
}

/**
 * 同步命令处理函数
 * 支持三种模式：用户级同步、项目级同步、智能检测自动同步
 * @param options 命令行选项参数
 */
export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  /* 读取全局配置文件 */
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

  /* 扫描源目录中的所有 Skills */
  const skills = await scanSkills(sourceDir);

  if (skills.length === 0) {
    logger.info('源目录中没有发现任何 Skill');
    logger.info(`源目录: ${config.source}`);
    logger.info('请确保 Skill 文件夹包含 SKILL.md 文件');
    return;
  }

  /* 检查是否有已启用的目标 */
  const enabledTargets = config.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) {
    logger.error('没有已启用的同步目标，请检查配置或运行 aitools init');
    return;
  }

  const targetFilter = options.target;
  const projectDir = process.cwd();

  /* ==================== 模式一：--skill 指定 Skill 添加到项目并同步 ==================== */
  if (options.skill) {
    const skillName = options.skill;

    /* 检查指定的 Skill 是否存在于源目录 */
    const matchedSkill = skills.find((s) => s.dirName === skillName);
    if (!matchedSkill) {
      logger.error(`Skill '${skillName}' 不存在于源目录中`);
      logger.info(`源目录: ${config.source}`);
      logger.info(`可用的 Skills: ${skills.map((s) => s.dirName).join(', ')}`);
      return;
    }

    /* 添加到项目配置（自动去重） */
    await addSkillToProject(projectDir, skillName);
    logger.success(`Skill '${skillName}' 已关联到当前项目`);

    /* 执行项目级同步（仅同步该 Skill） */
    console.log('');
    logger.info(`🔄 正在同步项目级 Skill: ${skillName}...`);
    console.log('');

    const projectSummary = await syncProjectSkills(
      [matchedSkill],
      config,
      projectDir,
      targetFilter,
    );

    printSyncResults(projectSummary, '项目级');
    return;
  }

  /* ==================== 模式二：--scope project 仅项目级同步 ==================== */
  if (options.scope === 'project') {
    const hasProjectConfig = await projectConfigExists(projectDir);
    if (!hasProjectConfig) {
      logger.error('当前目录未关联任何 Skill，请使用 --skill <name> 添加');
      return;
    }

    const projectConfig = await loadProjectConfig(projectDir);
    if (!projectConfig || projectConfig.skills.length === 0) {
      logger.info('项目配置中没有关联的 Skills');
      return;
    }

    /* 过滤出项目关联的 Skills，跳过源目录中不存在的 */
    const projectSkills = projectConfig.skills
      .map((name) => skills.find((s) => s.dirName === name))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s) {
          return false;
        }
        return true;
      });

    /* 输出源目录中不存在的 Skills 的警告 */
    for (const name of projectConfig.skills) {
      if (!skills.find((s) => s.dirName === name)) {
        logger.warn(`Skill '${name}' 在源目录中不存在，已跳过`);
      }
    }

    if (projectSkills.length === 0) {
      logger.info('没有可同步的项目级 Skills');
      return;
    }

    console.log('');
    logger.info(`🔄 正在同步项目级 Skills...`);
    logger.info(`   项目: ${projectDir} (${projectSkills.length} 个 Skills)`);
    console.log('');

    const projectSummary = await syncProjectSkills(
      projectSkills,
      config,
      projectDir,
      targetFilter,
    );

    printSyncResults(projectSummary, '项目级');
    return;
  }

  /* ==================== 模式三：默认/--scope user — 用户级 + 智能检测项目级 ==================== */

  /* 用户级同步（全量） */
  if (options.scope !== 'user') {
    /* 默认模式：先用户级，再检测项目级 */
  }

  console.log('');
  logger.info(`🔄 正在同步用户级 Skills...`);
  logger.info(`   源目录: ${config.source} (${skills.length} 个 Skills)`);
  console.log('');

  const userSummary = await syncAllSkills(skills, config, targetFilter);
  printSyncResults(userSummary, '用户级');

  /* 如果 scope 显式为 user，则不检测项目级 */
  if (options.scope === 'user') {
    return;
  }

  /* 智能检测：当前目录是否有项目配置 */
  const hasProjectConfig = await projectConfigExists(projectDir);
  if (!hasProjectConfig) {
    return;
  }

  const projectConfig = await loadProjectConfig(projectDir);
  if (!projectConfig || projectConfig.skills.length === 0) {
    return;
  }

  /* 过滤出项目关联的 Skills */
  const projectSkills = projectConfig.skills
    .map((name) => skills.find((s) => s.dirName === name))
    .filter((s): s is NonNullable<typeof s> => !!s);

  /* 输出源目录中不存在的 Skills 的警告 */
  for (const name of projectConfig.skills) {
    if (!skills.find((s) => s.dirName === name)) {
      logger.warn(`Skill '${name}' 在源目录中不存在，已跳过`);
    }
  }

  if (projectSkills.length === 0) {
    return;
  }

  /* 执行项目级同步 */
  console.log('');
  logger.info(`🔄 正在同步项目级 Skills...`);
  logger.info(`   项目: ${projectDir} (${projectSkills.length} 个 Skills)`);
  console.log('');

  const projectSummary = await syncProjectSkills(
    projectSkills,
    config,
    projectDir,
    targetFilter,
  );

  printSyncResults(projectSummary, '项目级');
}

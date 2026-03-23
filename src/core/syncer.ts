/**
 * 同步引擎模块
 * 基于 hash 对比的文件夹全量拷贝同步
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { checkbox } from '@inquirer/prompts';
import { hashDirectory, hashDirectorySafe } from './hasher.js';
import { expandTilde } from '../config/manager.js';
import { logger } from '../utils/logger.js';
import type {
  Config,
  Target,
  SkillInfo,
  SkillSyncResult,
  SkillTargetSyncResult,
  SyncSummary,
} from '../types/index.js';

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
      /* 递归拷贝子目录 */
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      /* 拷贝文件 */
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 将单个 Skill 同步到单个目标
 * @param skill Skill 元数据
 * @param target 目标工具配置
 * @returns 同步结果（动作类型：created / updated / skipped）
 */
async function syncSkillToTarget(
  skill: SkillInfo,
  target: Target,
): Promise<SkillTargetSyncResult> {
  const targetBaseDir = expandTilde(target.user_path);
  const targetSkillDir = path.join(targetBaseDir, skill.dirName);

  /* 计算源目录的 hash */
  const sourceHash = await hashDirectory(skill.path);

  /* 计算目标目录的 hash（不存在时为 null） */
  const targetHash = await hashDirectorySafe(targetSkillDir);

  /* 判断是否需要同步 */
  if (targetHash !== null && sourceHash === targetHash) {
    /* hash 一致，无需同步 */
    return { targetName: target.name, action: 'skipped' };
  }

  /* 确保目标基础目录存在 */
  await fs.mkdir(targetBaseDir, { recursive: true });

  /* 执行全量拷贝 */
  await copyDirectory(skill.path, targetSkillDir);

  /* 判断是新增还是更新 */
  const action = targetHash === null ? 'created' : 'updated';
  return { targetName: target.name, action };
}

/**
 * 执行完整的同步操作
 * 将所有 Skills 同步到所有已启用的目标
 * @param skills 源目录中扫描到的 Skill 列表
 * @param config 全局配置对象
 * @param targetFilter 可选，指定单个目标名称进行过滤
 * @returns 同步结果摘要
 */
export async function syncAllSkills(
  skills: SkillInfo[],
  config: Config,
  targetFilter?: string,
): Promise<SyncSummary> {
  /* 筛选已启用的目标 */
  let targets = config.targets.filter((t) => t.enabled);

  /* 如果指定了目标过滤器，进一步筛选 */
  if (targetFilter) {
    targets = targets.filter((t) => t.name === targetFilter);
    if (targets.length === 0) {
      logger.error(`未找到目标工具: ${targetFilter}`);
      return {
        totalSkills: skills.length,
        created: 0,
        updated: 0,
        skipped: 0,
        results: [],
      };
    }
  }

  const results: SkillSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  /* 遍历每个 Skill，同步到每个目标 */
  for (const skill of skills) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      try {
        const result = await syncSkillToTarget(skill, target);
        targetResults.push(result);

        /* 统计计数 */
        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`同步 ${skill.dirName} → ${target.name} 失败: ${message}`);
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;
      }
    }

    results.push({
      skillName: skill.dirName,
      targetResults,
    });
  }

  return {
    totalSkills: skills.length,
    created,
    updated,
    skipped,
    results,
  };
}

/**
 * 目标工具名称到项目级子目录的映射
 * 项目级 Skill 存储在项目根目录下的对应工具目录中
 */
export const PROJECT_TARGET_PATHS: Record<string, string> = {
  codebuddy: '.codebuddy/skills',
  'claude-code': '.claude/skills',
};

/**
 * 目标工具名称到工具根目录名的映射
 * 用于检测当前项目使用的 AI 工具（检测根目录而非 skills 子目录）
 */
export const PROJECT_TOOL_DIRS: Record<string, string> = {
  codebuddy: '.codebuddy',
  'claude-code': '.claude',
};

/**
 * 检测项目目录中实际存在的 AI 工具
 * 通过判断项目根目录下是否存在对应的工具目录（如 .codebuddy/、.claude/）来确定
 * @param projectDir 项目根目录的绝对路径
 * @param targets 已启用且有项目级路径映射的目标列表
 * @returns 检测到的目标列表（仅包含存在工具目录的目标）
 */
export function detectProjectTools(
  projectDir: string,
  targets: Target[],
): Target[] {
  return targets.filter((t) => {
    const toolDir = PROJECT_TOOL_DIRS[t.name];
    if (!toolDir) {
      return false;
    }
    const toolDirPath = path.join(projectDir, toolDir);
    return fsSync.existsSync(toolDirPath);
  });
}

/**
 * 将单个 Skill 同步到项目级单个目标
 * @param skill Skill 元数据
 * @param targetName 目标工具名称
 * @param projectDir 项目根目录的绝对路径
 * @returns 同步结果（动作类型：created / updated / skipped）
 */
async function syncSkillToProjectTarget(
  skill: SkillInfo,
  targetName: string,
  projectDir: string,
): Promise<SkillTargetSyncResult> {
  const relativePath = PROJECT_TARGET_PATHS[targetName];
  if (!relativePath) {
    /* 该工具没有项目级路径映射，跳过 */
    return { targetName, action: 'skipped' };
  }

  const targetBaseDir = path.join(projectDir, relativePath);
  const targetSkillDir = path.join(targetBaseDir, skill.dirName);

  /* 计算源目录的 hash */
  const sourceHash = await hashDirectory(skill.path);

  /* 计算目标目录的 hash（不存在时为 null） */
  const targetHash = await hashDirectorySafe(targetSkillDir);

  /* 判断是否需要同步 */
  if (targetHash !== null && sourceHash === targetHash) {
    return { targetName, action: 'skipped' };
  }

  /* 确保目标基础目录存在 */
  await fs.mkdir(targetBaseDir, { recursive: true });

  /* 执行全量拷贝 */
  await copyDirectory(skill.path, targetSkillDir);

  /* 判断是新增还是更新 */
  const action = targetHash === null ? 'created' : 'updated';
  return { targetName, action };
}

/**
 * 执行项目级同步操作
 * 将指定的 Skills 同步到项目目录下各已启用目标的项目级路径
 * @param skills 要同步的 Skill 列表（已过滤，仅包含项目关联的 Skills）
 * @param config 全局配置对象
 * @param projectDir 项目根目录的绝对路径
 * @param targetFilter 可选，指定单个目标名称进行过滤
 * @returns 同步结果摘要
 */
export async function syncProjectSkills(
  skills: SkillInfo[],
  config: Config,
  projectDir: string,
  targetFilter?: string,
): Promise<SyncSummary> {
  /* 筛选已启用且有项目级路径映射的目标 */
  let targets = config.targets.filter(
    (t) => t.enabled && PROJECT_TARGET_PATHS[t.name],
  );

  /* 如果指定了目标过滤器，进一步筛选（--target 优先级高于检测逻辑） */
  if (targetFilter) {
    targets = targets.filter((t) => t.name === targetFilter);
    if (targets.length === 0) {
      logger.error(`未找到目标工具: ${targetFilter}`);
      return {
        totalSkills: skills.length,
        created: 0,
        updated: 0,
        skipped: 0,
        results: [],
      };
    }
  } else {
    /* 未指定 --target 时，检测当前项目实际使用的 AI 工具 */
    const detectedTargets = detectProjectTools(projectDir, targets);

    if (detectedTargets.length > 0) {
      /* 仅同步到检测到的工具 */
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
        return {
          totalSkills: skills.length,
          created: 0,
          updated: 0,
          skipped: 0,
          results: [],
        };
      }

      targets = targets.filter((t) => selected.includes(t.name));
    }
  }

  const results: SkillSyncResult[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  /* 遍历每个 Skill，同步到每个目标的项目级目录 */
  for (const skill of skills) {
    const targetResults: SkillTargetSyncResult[] = [];

    for (const target of targets) {
      try {
        const result = await syncSkillToProjectTarget(skill, target.name, projectDir);
        targetResults.push(result);

        /* 统计计数 */
        if (result.action === 'created') {
          created++;
        } else if (result.action === 'updated') {
          updated++;
        } else {
          skipped++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`项目级同步 ${skill.dirName} → ${target.name} 失败: ${message}`);
        targetResults.push({ targetName: target.name, action: 'skipped' });
        skipped++;
      }
    }

    results.push({
      skillName: skill.dirName,
      targetResults,
    });
  }

  return {
    totalSkills: skills.length,
    created,
    updated,
    skipped,
    results,
  };
}

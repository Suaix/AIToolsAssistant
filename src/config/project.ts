/**
 * 项目配置管理模块
 * 负责 .aitools/project.yaml 的读取、写入和管理
 * 该文件记录项目已关联的 Skill 列表，不提交到 Git
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { ProjectConfig } from '../types/index.js';

/** 项目配置目录名 */
const PROJECT_CONFIG_DIR = '.aitools';
/** 项目配置文件名 */
const PROJECT_CONFIG_FILE = 'project.yaml';

/**
 * 获取项目配置文件的完整路径
 * @param projectDir 项目根目录的绝对路径
 * @returns 项目配置文件的绝对路径
 */
export function getProjectConfigPath(projectDir: string): string {
  return path.join(projectDir, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

/**
 * 获取项目配置目录的完整路径
 * @param projectDir 项目根目录的绝对路径
 * @returns .aitools 目录的绝对路径
 */
export function getProjectConfigDir(projectDir: string): string {
  return path.join(projectDir, PROJECT_CONFIG_DIR);
}

/**
 * 检查项目配置文件是否存在
 * @param projectDir 项目根目录的绝对路径
 * @returns true 表示配置文件存在
 */
export async function projectConfigExists(projectDir: string): Promise<boolean> {
  try {
    await fs.access(getProjectConfigPath(projectDir));
    return true;
  } catch {
    return false;
  }
}

/**
 * 加载项目配置文件
 * 从 .aitools/project.yaml 读取已关联的 Skill 列表
 * @param projectDir 项目根目录的绝对路径
 * @returns 项目配置对象，不存在或格式错误时返回 null
 */
export async function loadProjectConfig(projectDir: string): Promise<ProjectConfig | null> {
  const configPath = getProjectConfigPath(projectDir);

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = parseYaml(content);

    /* 校验基本结构 */
    if (!parsed || typeof parsed !== 'object') {
      logger.warn('项目配置文件格式错误');
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    /* skills 字段必须是数组 */
    if (!Array.isArray(obj.skills)) {
      logger.warn('项目配置文件缺少有效的 skills 字段');
      return null;
    }

    /* 过滤非字符串元素 */
    const skills = obj.skills.filter(
      (item: unknown): item is string => typeof item === 'string' && item.trim().length > 0,
    );

    return { skills };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      /* 文件不存在，返回 null（正常情况，非错误） */
      return null;
    }

    logger.warn('项目配置文件格式错误');
    return null;
  }
}

/**
 * 保存项目配置文件
 * 将配置写入 .aitools/project.yaml，目录不存在时自动创建
 * @param projectDir 项目根目录的绝对路径
 * @param config 项目配置对象
 */
export async function saveProjectConfig(
  projectDir: string,
  config: ProjectConfig,
): Promise<void> {
  const configDir = getProjectConfigDir(projectDir);
  const configPath = getProjectConfigPath(projectDir);

  /* 确保 .aitools 目录存在 */
  await fs.mkdir(configDir, { recursive: true });

  const yamlContent = stringifyYaml(config, {
    lineWidth: 0,
    singleQuote: false,
  });

  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * 添加 Skill 到项目配置
 * 自动去重，如果 Skill 已存在则不重复添加
 * 如果配置文件不存在则自动创建
 * @param projectDir 项目根目录的绝对路径
 * @param skillName 要添加的 Skill 名称（对应源目录中的文件夹名）
 */
export async function addSkillToProject(
  projectDir: string,
  skillName: string,
): Promise<void> {
  /* 尝试加载现有配置 */
  const existing = await loadProjectConfig(projectDir);
  const skills = existing?.skills ?? [];

  /* 去重检查 */
  if (skills.includes(skillName)) {
    return;
  }

  /* 添加新 Skill 并保存 */
  skills.push(skillName);
  await saveProjectConfig(projectDir, { skills });
}

/**
 * 项目配置管理模块
 * 负责 .aitools/project.yaml 的读取、写入和管理
 * v0.2.0 破坏性变更：按资源类型分组（skills/commands/agents/rules）
 * 该文件记录项目已关联的各类资源名称列表
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { ProjectConfig, ResourceType } from '../types/index.js';

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
 * 将某字段规范化为字符串数组（过滤空值与非字符串元素）
 * @param value 待规范化的字段值
 * @returns 规范化后的字符串数组
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

/**
 * 加载项目配置文件
 * 按资源类型分组读取 skills/commands/agents/rules 列表
 * @param projectDir 项目根目录的绝对路径
 * @returns 项目配置对象，不存在或格式错误时返回 null
 */
export async function loadProjectConfig(
  projectDir: string,
): Promise<ProjectConfig | null> {
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

    /* 校验配置中至少包含一个预期字段（skills/commands/agents/rules），否则视为无效 */
    const hasAnyKnownField =
      'skills' in obj ||
      'commands' in obj ||
      'agents' in obj ||
      'rules' in obj;
    if (!hasAnyKnownField) {
      logger.warn('项目配置文件中未找到任何已知资源字段');
      return null;
    }

    /* 按资源类型分组读取，缺失字段返回空数组 */
    const result: ProjectConfig = {
      skills: normalizeStringArray(obj.skills),
    };

    /* 可选字段仅在存在时才写入 */
    const commands = normalizeStringArray(obj.commands);
    if (commands.length > 0) {
      result.commands = commands;
    }
    const agents = normalizeStringArray(obj.agents);
    if (agents.length > 0) {
      result.agents = agents;
    }
    const rules = normalizeStringArray(obj.rules);
    if (rules.length > 0) {
      result.rules = rules;
    }

    return result;
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

  /* 仅序列化非空字段，避免 project.yaml 中出现不必要的空数组 */
  const payload: Record<string, string[]> = {
    skills: config.skills ?? [],
  };
  if (config.commands && config.commands.length > 0) {
    payload.commands = config.commands;
  }
  if (config.agents && config.agents.length > 0) {
    payload.agents = config.agents;
  }
  if (config.rules && config.rules.length > 0) {
    payload.rules = config.rules;
  }

  const yamlContent = stringifyYaml(payload, {
    lineWidth: 0,
    singleQuote: false,
  });

  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * 读取项目中指定资源类型的关联名称列表
 * @param config 项目配置对象
 * @param type 资源类型
 * @returns 对应类型的资源名称数组（可能为空）
 */
export function getProjectResourceList(
  config: ProjectConfig,
  type: ResourceType,
): string[] {
  switch (type) {
    case 'skills':
      return config.skills ?? [];
    case 'commands':
      return config.commands ?? [];
    case 'agents':
      return config.agents ?? [];
    case 'rules':
      return config.rules ?? [];
  }
}

/**
 * 向项目配置中对应资源类型的列表追加一条资源名称
 * 自动去重；若资源已存在则不重复添加
 * 如果配置文件不存在则自动创建
 * @param projectDir 项目根目录的绝对路径
 * @param type 资源类型
 * @param resourceName 要添加的资源名称（对应源目录中的文件夹名）
 */
export async function addResourceToProject(
  projectDir: string,
  type: ResourceType,
  resourceName: string,
): Promise<void> {
  /* 尝试加载现有配置 */
  const existing = (await loadProjectConfig(projectDir)) ?? { skills: [] };

  /* 读取现有同类型列表 */
  const list = getProjectResourceList(existing, type);

  /* 去重检查 */
  if (list.includes(resourceName)) {
    return;
  }

  /* 追加新资源名并保存 */
  list.push(resourceName);
  const updated: ProjectConfig = { ...existing };
  switch (type) {
    case 'skills':
      updated.skills = list;
      break;
    case 'commands':
      updated.commands = list;
      break;
    case 'agents':
      updated.agents = list;
      break;
    case 'rules':
      updated.rules = list;
      break;
  }

  await saveProjectConfig(projectDir, updated);
}

/**
 * 向项目配置中追加一条 Skill 名称
 * @deprecated 请使用 addResourceToProject(projectDir, 'skills', skillName)
 * @param projectDir 项目根目录的绝对路径
 * @param skillName 要添加的 Skill 名称
 */
export async function addSkillToProject(
  projectDir: string,
  skillName: string,
): Promise<void> {
  await addResourceToProject(projectDir, 'skills', skillName);
}

/**
 * 从项目配置中移除一条资源名称
 * 幂等：若资源不存在或配置文件不存在，均不报错、不做任何改动
 * v0.4.0 新增：用于 unsubscribe 命令
 * @param projectDir 项目根目录的绝对路径
 * @param type 资源类型
 * @param resourceName 要移除的资源名称
 * @returns true 表示确实移除了；false 表示资源原本就不在（或配置不存在）
 */
export async function removeResourceFromProject(
  projectDir: string,
  type: ResourceType,
  resourceName: string,
): Promise<boolean> {
  const existing = await loadProjectConfig(projectDir);
  if (!existing) {
    /* 配置文件本来就没有，无需处理 */
    return false;
  }

  const list = getProjectResourceList(existing, type);
  const idx = list.indexOf(resourceName);
  if (idx < 0) {
    return false;
  }

  list.splice(idx, 1);
  const updated: ProjectConfig = { ...existing };
  switch (type) {
    case 'skills':
      /* skills 是必填字段，即使为空也保留空数组 */
      updated.skills = list;
      break;
    case 'commands':
      /* 可选字段：空列表时不写入，保持 YAML 简洁 */
      if (list.length === 0) {
        delete updated.commands;
      } else {
        updated.commands = list;
      }
      break;
    case 'agents':
      if (list.length === 0) {
        delete updated.agents;
      } else {
        updated.agents = list;
      }
      break;
    case 'rules':
      if (list.length === 0) {
        delete updated.rules;
      } else {
        updated.rules = list;
      }
      break;
  }

  await saveProjectConfig(projectDir, updated);
  return true;
}

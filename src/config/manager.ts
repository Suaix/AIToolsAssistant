/**
 * 配置文件管理模块
 * 负责 ~/.aitools/config.yaml 的读取、写入和校验
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { Config, Target, SyncOptions } from '../types/index.js';

/** 配置目录名称 */
const CONFIG_DIR_NAME = '.aitools';

/** 配置文件名称 */
const CONFIG_FILE_NAME = 'config.yaml';

/**
 * 获取配置目录的绝对路径
 * @returns ~/.aitools 的绝对路径
 */
export function getConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * 获取配置文件的绝对路径
 * @returns ~/.aitools/config.yaml 的绝对路径
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE_NAME);
}

/**
 * 将路径中的 ~ 展开为用户主目录
 * @param inputPath 可能包含 ~ 的路径
 * @returns 展开后的绝对路径
 */
export function expandTilde(inputPath: string): string {
  if (inputPath.startsWith('~/') || inputPath === '~') {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return inputPath;
}

/**
 * 将绝对路径中的用户主目录替换为 ~ 以便显示
 * @param absolutePath 绝对路径
 * @returns 用 ~ 替换主目录后的路径
 */
export function collapseTilde(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath.startsWith(home)) {
    return '~' + absolutePath.slice(home.length);
  }
  return absolutePath;
}

/**
 * 检查配置文件是否存在
 * @returns 配置文件是否存在
 */
export async function configExists(): Promise<boolean> {
  try {
    await fs.access(getConfigPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取默认同步选项
 * @returns 默认同步选项
 */
function getDefaultSyncOptions(): SyncOptions {
  return {
    default_scope: 'user',
    clean: false,
  };
}

/**
 * 获取默认同步目标列表
 * @returns 默认目标工具配置数组
 */
export function getDefaultTargets(): Target[] {
  return [
    {
      name: 'codebuddy',
      enabled: true,
      user_path: '~/.codebuddy/skills',
    },
    {
      name: 'claude-code',
      enabled: true,
      user_path: '~/.claude/skills',
    },
  ];
}

/**
 * 校验配置文件的有效性
 * 检查必需字段是否存在和格式是否正确
 * @param config 待校验的配置对象
 * @returns 校验通过返回 true，否则抛出错误
 */
function validateConfig(config: unknown): config is Config {
  if (!config || typeof config !== 'object') {
    throw new Error('配置文件格式无效：不是有效的 YAML 对象');
  }

  const obj = config as Record<string, unknown>;

  /* 校验 source 字段 */
  if (!obj.source || typeof obj.source !== 'string') {
    throw new Error('配置文件缺少有效的 source 字段');
  }

  /* 校验 targets 字段 */
  if (!Array.isArray(obj.targets) || obj.targets.length === 0) {
    throw new Error('配置文件缺少有效的 targets 数组');
  }

  for (const target of obj.targets) {
    if (!target.name || typeof target.name !== 'string') {
      throw new Error('配置文件 targets 中存在缺少 name 字段的项');
    }
    if (typeof target.enabled !== 'boolean') {
      throw new Error(`目标 "${target.name}" 缺少有效的 enabled 字段`);
    }
    if (!target.user_path || typeof target.user_path !== 'string') {
      throw new Error(`目标 "${target.name}" 缺少有效的 user_path 字段`);
    }
  }

  return true;
}

/**
 * 读取并解析配置文件
 * 如果配置文件不存在，输出错误提示并返回 null
 * @returns 解析后的 Config 对象，或 null（配置不存在/无效时）
 */
export async function loadConfig(): Promise<Config | null> {
  const configPath = getConfigPath();

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const parsed = parseYaml(content);

    if (validateConfig(parsed)) {
      return parsed;
    }

    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.error('请先运行 aitools init 进行初始化');
      return null;
    }

    /* YAML 解析错误或校验错误 */
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`配置文件解析失败: ${message}`);
    logger.info('建议重新运行 aitools init 进行初始化');
    return null;
  }
}

/**
 * 将配置对象写入配置文件
 * 自动创建 ~/.aitools/ 目录（如不存在）
 * @param config 待写入的配置对象
 */
export async function saveConfig(config: Config): Promise<void> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  /* 确保配置目录存在 */
  await fs.mkdir(configDir, { recursive: true });

  /* 将配置序列化为 YAML 并写入 */
  const yamlContent = stringifyYaml(config, {
    lineWidth: 0,       // 不自动换行
    singleQuote: false, // 使用双引号
  });

  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * 基于用户输入创建新的配置对象
 * @param source 用户指定的 Skills 源目录路径
 * @param targets 同步目标工具列表
 * @returns 完整的 Config 对象
 */
export function createConfig(source: string, targets: Target[]): Config {
  return {
    source,
    targets,
    sync: getDefaultSyncOptions(),
  };
}

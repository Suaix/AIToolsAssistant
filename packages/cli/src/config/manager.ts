/**
 * 配置文件管理模块
 * 负责 ~/.aitools/config.yaml 的读取、写入和校验
 * v0.2.0 破坏性变更：Target.user_path → user_base（根目录）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import { getDefaultEnabledTools, getAllTools } from '../registry/tools.js';
import { CURRENT_CONFIG_VERSION } from './version.js';
import { migrateConfigDispatch } from './migrations/index.js';
import type {
  Config,
  Target,
  SyncOptions,
  UserSubscriptions,
  ResourceType,
} from '../types/index.js';

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
 * 获取默认源目录的绝对路径
 * v0.2.0：用户未显式指定源目录时，默认使用 ~/.aitools/（与 config.yaml 同目录）
 * @returns 默认源目录的绝对路径
 */
export function getDefaultSourceDir(): string {
  return getConfigDir();
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
 * 获取默认的用户级订阅清单
 * v0.4.0：新初始化的用户没有任何订阅，由用户后续通过 `aitools subscribe` 显式声明
 * @returns 空的订阅清单
 */
function getDefaultUserSubscriptions(): UserSubscriptions {
  return {
    skills: [],
  };
}

/**
 * 将 YAML 中的某个字段规范化为字符串数组
 * 过滤非字符串元素和空字符串，保证下游类型安全
 * @param value 待规范化的字段值（任意类型）
 * @returns 规范化后的字符串数组（可能为空）
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
 * 将配置对象中的 user_subscriptions 规范化为合法结构
 * 缺字段或字段类型不对时，降级为空数组；不抛异常
 * @param raw 从 YAML 读到的原始 user_subscriptions 值
 * @returns 规范化的 UserSubscriptions 对象
 */
function normalizeUserSubscriptions(raw: unknown): UserSubscriptions {
  if (!raw || typeof raw !== 'object') {
    return getDefaultUserSubscriptions();
  }
  const obj = raw as Record<string, unknown>;

  const result: UserSubscriptions = {
    skills: normalizeStringArray(obj.skills),
  };

  /* 可选字段仅在非空时才写入，避免 YAML 出现冗余的空数组 */
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
}

/**
 * 获取默认同步目标列表
 *
 * FEAT-005：从 SSOT（shared/tools.json）派生，不再硬编码 claude-code 旧名。
 * 行为：
 *   - 已知的所有工具都会出现在默认列表中
 *   - 是否 enabled 由 SSOT 中的 defaultEnabled 字段决定
 *
 * @returns 默认目标工具配置数组（按 SSOT 中的声明顺序）
 */
export function getDefaultTargets(): Target[] {
  const defaults = getDefaultEnabledTools();
  const defaultNames = new Set(defaults.map((t) => t.name));
  /* 列表包含所有工具；通过 defaultNames 决定 enabled 初值，避免循环内 new 多次 */
  return getAllTools().map((t) => ({
    name: t.name,
    enabled: defaultNames.has(t.name),
    user_base: t.userBase,
  }));
}

/**
 * 校验配置文件的有效性
 *
 * FEAT-005：移除 v0.2.0 / v0.4.0 schema 报错路径——这些场景已由迁移管线
 * （src/config/migrations/）在 loadConfig 内部自动处理。本函数仅做"迁移
 * 完成后"的最终结构合法性校验。
 *
 * @param config 待校验的配置对象（已经过迁移管线处理）
 * @returns 校验通过返回 true，否则抛出错误
 */
function validateConfig(config: unknown): config is Config {
  if (!config || typeof config !== 'object') {
    throw new Error('配置文件格式无效：不是有效的 YAML 对象');
  }

  const obj = config as Record<string, unknown>;

  /* 校验 version 字段（FEAT-005 引入） */
  if (typeof obj.version !== 'number') {
    throw new Error('配置文件缺少 version 字段（迁移异常，请联系维护者）');
  }

  /* 校验 source 字段 */
  if (!obj.source || typeof obj.source !== 'string') {
    throw new Error('配置文件缺少有效的 source 字段');
  }

  /* 校验 targets 字段 */
  if (!Array.isArray(obj.targets) || obj.targets.length === 0) {
    throw new Error('配置文件缺少有效的 targets 数组');
  }

  for (const target of obj.targets) {
    if (!target || typeof target !== 'object') {
      throw new Error('配置文件 targets 中存在无效项');
    }
    if (!target.name || typeof target.name !== 'string') {
      throw new Error('配置文件 targets 中存在缺少 name 字段的项');
    }
    if (typeof target.enabled !== 'boolean') {
      throw new Error(`目标 "${target.name}" 缺少有效的 enabled 字段`);
    }
    if (!target.user_base || typeof target.user_base !== 'string') {
      throw new Error(`目标 "${target.name}" 缺少有效的 user_base 字段`);
    }
  }

  /* user_subscriptions 由迁移管线保证存在；此处仅做存在性兜底 */
  if (!('user_subscriptions' in obj)) {
    throw new Error(
      '配置文件缺少 user_subscriptions 字段（迁移异常，请联系维护者）',
    );
  }

  return true;
}

/**
 * 读取并解析配置文件
 *
 * 流程（FEAT-005）：read → migrate → validate → normalize
 *   1. 读取 yaml 文件，解析为对象
 *   2. 调用迁移调度器（migrateConfigDispatch）：检测 version、备份、按需应用迁移、写回
 *   3. 校验最终结构合法性（validateConfig）
 *   4. 规范化 user_subscriptions 子字段
 *
 * 测试场景：可通过 setDefaultReporter(NoopMigrationReporter) 静默迁移日志。
 *
 * @returns 解析后的 Config 对象，或 null（配置不存在/无效时）
 */
export async function loadConfig(): Promise<Config | null> {
  const configPath = getConfigPath();

  let parsed: unknown;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    parsed = parseYaml(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.error('请先运行 aitools init 进行初始化');
      return null;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`配置文件解析失败: ${message}`);
    logger.info('建议重新运行 aitools init 进行初始化');
    return null;
  }

  /* 类型守卫：parseYaml 可能返回 null/string/number 等非对象值 */
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    logger.error('配置文件格式无效：不是有效的 YAML 对象');
    return null;
  }

  /* 迁移管线：read → migrate → save */
  let migrated: Record<string, unknown>;
  try {
    const dispatchResult = await migrateConfigDispatch(
      parsed as Record<string, unknown>,
      configPath,
    );
    migrated = dispatchResult.config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`配置迁移失败: ${message}`);
    return null;
  }

  /* 最终结构校验 */
  try {
    if (!validateConfig(migrated)) {
      return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`配置文件解析失败: ${message}`);
    return null;
  }

  /* 规范化 user_subscriptions 子字段（兜底处理 yaml 里的 null/缺字段场景） */
  migrated.user_subscriptions = normalizeUserSubscriptions(
    migrated.user_subscriptions,
  );

  return migrated as Config;
}

/**
 * 将配置对象写入配置文件
 *
 * 自动创建 ~/.aitools/ 目录（如不存在）。
 * FEAT-005：保证 version 字段在 yaml 首行（TD-7 设计决策，便于人眼自查）。
 *
 * @param config 待写入的配置对象
 */
export async function saveConfig(config: Config): Promise<void> {
  const configDir = getConfigDir();
  const configPath = getConfigPath();

  /* 确保配置目录存在（aitools 自身目录，不违反 US-6 边界守卫） */
  await fs.mkdir(configDir, { recursive: true });

  /* 重排：version 在首行 */
  const ordered: Record<string, unknown> = {
    version: config.version ?? CURRENT_CONFIG_VERSION,
    source: config.source,
    targets: config.targets,
    sync: config.sync,
    user_subscriptions: config.user_subscriptions,
  };

  /* 将配置序列化为 YAML 并写入 */
  const yamlContent = stringifyYaml(ordered, {
    lineWidth: 0, // 不自动换行
    singleQuote: false, // 使用双引号
  });

  await fs.writeFile(configPath, yamlContent, 'utf-8');
}

/**
 * 基于用户输入创建新的配置对象
 * v0.4.0：默认 user_subscriptions 为空；新用户需通过 `aitools subscribe` 显式订阅
 * FEAT-005：写入 version 字段，与当前 schema 一致
 * @param source 用户指定的资源源目录路径
 * @param targets 同步目标工具列表
 * @returns 完整的 Config 对象
 */
export function createConfig(source: string, targets: Target[]): Config {
  return {
    version: CURRENT_CONFIG_VERSION,
    source,
    targets,
    sync: getDefaultSyncOptions(),
    user_subscriptions: getDefaultUserSubscriptions(),
  };
}

/* ============================================================
 * 用户级订阅辅助（v0.4.0 新增）
 * ============================================================ */

/**
 * 读取指定资源类型的用户级订阅列表
 * 缺失类型返回空数组；不修改 config 对象
 * @param config 全局配置对象
 * @param type 资源类型
 * @returns 订阅的资源 dirName 数组（可能为空）
 */
export function getUserSubscriptionList(
  config: Config,
  type: ResourceType,
): string[] {
  const subs = config.user_subscriptions;
  switch (type) {
    case 'skills':
      return subs.skills ?? [];
    case 'commands':
      return subs.commands ?? [];
    case 'agents':
      return subs.agents ?? [];
    case 'rules':
      return subs.rules ?? [];
  }
}

/**
 * 向指定资源类型的用户级订阅列表追加一个资源名（去重）
 * 直接修改传入的 config 对象并返回；不落盘
 * 调用方需自行调用 `saveConfig(config)` 持久化
 * @param config 全局配置对象（会被就地修改）
 * @param type 资源类型
 * @param resourceName 要订阅的资源 dirName
 * @returns 是否发生了实际追加（true=新增，false=已存在）
 */
export function addUserSubscription(
  config: Config,
  type: ResourceType,
  resourceName: string,
): boolean {
  const list = getUserSubscriptionList(config, type);
  if (list.includes(resourceName)) {
    return false;
  }
  list.push(resourceName);
  /* 写回对应类型字段 */
  switch (type) {
    case 'skills':
      config.user_subscriptions.skills = list;
      break;
    case 'commands':
      config.user_subscriptions.commands = list;
      break;
    case 'agents':
      config.user_subscriptions.agents = list;
      break;
    case 'rules':
      config.user_subscriptions.rules = list;
      break;
  }
  return true;
}

/**
 * 从指定资源类型的用户级订阅列表中移除一个资源名
 * 直接修改传入的 config 对象并返回；不落盘
 * 调用方需自行调用 `saveConfig(config)` 持久化
 * @param config 全局配置对象（会被就地修改）
 * @param type 资源类型
 * @param resourceName 要取消订阅的资源 dirName
 * @returns 是否发生了实际移除（true=已移除，false=原本就不存在）
 */
export function removeUserSubscription(
  config: Config,
  type: ResourceType,
  resourceName: string,
): boolean {
  const list = getUserSubscriptionList(config, type);
  const idx = list.indexOf(resourceName);
  if (idx < 0) {
    return false;
  }
  list.splice(idx, 1);
  /* 写回对应类型字段 */
  switch (type) {
    case 'skills':
      config.user_subscriptions.skills = list;
      break;
    case 'commands':
      /* 为保持 YAML 清爽：列表空了就移除该可选字段 */
      if (list.length === 0) {
        delete config.user_subscriptions.commands;
      } else {
        config.user_subscriptions.commands = list;
      }
      break;
    case 'agents':
      if (list.length === 0) {
        delete config.user_subscriptions.agents;
      } else {
        config.user_subscriptions.agents = list;
      }
      break;
    case 'rules':
      if (list.length === 0) {
        delete config.user_subscriptions.rules;
      } else {
        config.user_subscriptions.rules = list;
      }
      break;
  }
  return true;
}

/**
 * 配置迁移调度器（FEAT-005）
 *
 * 职责：
 *   1. 接收已 yaml.parse 的对象 + 文件原始路径
 *   2. 检测 schema 版本，按顺序应用迁移函数（v0.2→v0.4→v0.5）
 *   3. 触发任何迁移前先备份原文件为 .bak（覆盖式单份）
 *   4. 迁移成功后通过 reporter 上报结果
 *   5. 返回最终配置对象与发生的变更列表
 *
 * 迁移注入点：src/config/manager.ts:loadConfig 与 src/config/project.ts:loadProjectConfig
 *
 * 设计要点（03-technical.md）：
 *   - TD-3 / TD-6：迁移嵌入 loadConfig，无独立 migrate 命令
 *   - 备份策略：覆盖式单份（Q-5 决策）
 *   - 失败容错：备份失败 → 阻断；写入失败 → 抛错并指向 .bak
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { stringify as stringifyYaml } from 'yaml';
import {
  CURRENT_CONFIG_VERSION,
  CURRENT_PROJECT_CONFIG_VERSION,
  LEGACY_VERSION_PLACEHOLDER,
} from '../version.js';
import {
  getDefaultReporter,
  type MigrationChange,
  type MigrationOutcome,
} from './reporter.js';
import { migrateV02ToV04 } from './v0.2-to-v0.4.js';
import {
  migrateConfigV04ToV05,
  migrateProjectConfigV04ToV05,
} from './v0.4-to-v0.5.js';

/* ============================================================
 * GUI 双通道兜底：~/.aitools/.last-migration.json
 *
 * 设计动因（TD-11）：迁移事件可能因 GUI 进程启动时序丢失；
 * 落盘一份机器可读 JSON 让 GUI 启动时主动读取，更可靠。
 *
 * GUI 读取后应立即删除该文件，避免重复弹窗。
 * ============================================================ */

/** 最近一次迁移结果落盘文件路径 */
function lastMigrationPath(): string {
  return path.join(os.homedir(), '.aitools', '.last-migration.json');
}

/**
 * 把迁移结果落盘到 ~/.aitools/.last-migration.json
 *
 * 仅在真正发生迁移（changed 或冲突）时调用；no-op 不落盘。
 * 失败时静默跳过——不希望辅助功能失败影响主流程。
 *
 * @param outcome 迁移结果
 */
async function persistLastMigration(outcome: MigrationOutcome): Promise<void> {
  if (outcome.status === 'up_to_date') return;
  try {
    const dir = path.dirname(lastMigrationPath());
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      lastMigrationPath(),
      JSON.stringify({ ...outcome, persistedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
  } catch {
    /* 落盘失败不影响主流程 */
  }
}

/* ============================================================
 * 公共类型
 * ============================================================ */

/** 迁移调度结果 */
export interface MigrationDispatchResult<T> {
  /** 迁移后的配置对象（即使 changed=false 也返回最新形态） */
  config: T;
  /** 是否发生了实际变更 */
  changed: boolean;
  /** 累积的变更描述 */
  changes: MigrationChange[];
  /** 迁移前的版本号（缺失视为 LEGACY_VERSION_PLACEHOLDER） */
  fromVersion: number;
  /** 迁移后的版本号 */
  toVersion: number;
  /** 若发生迁移，备份文件路径；否则 null */
  backupPath: string | null;
}

/* ============================================================
 * 内部辅助
 * ============================================================ */

/**
 * 从 parsed 对象中提取版本号
 *
 * @param parsed 已 yaml.parse 的对象
 * @returns version 数字；缺失或非法时返回 LEGACY_VERSION_PLACEHOLDER
 */
function extractVersion(parsed: Record<string, unknown>): number {
  const v = parsed.version;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    return v;
  }
  return LEGACY_VERSION_PLACEHOLDER;
}

/**
 * 备份原文件到 <path>.bak（覆盖式单份）
 *
 * @param sourcePath 原文件绝对路径
 * @returns 备份文件路径
 * @throws 备份失败时抛出
 */
async function backupFile(sourcePath: string): Promise<string> {
  const backupPath = `${sourcePath}.bak`;
  await fs.copyFile(sourcePath, backupPath);
  return backupPath;
}

/**
 * 序列化并写回 yaml 文件
 *
 * 字段顺序由 yaml 库的对象遍历顺序决定；为确保 version 在首行，本函数会重组对象。
 *
 * @param targetPath 目标文件绝对路径
 * @param config 已迁移的配置对象
 * @throws 写入失败时抛出
 */
async function writeYaml(
  targetPath: string,
  config: Record<string, unknown>,
): Promise<void> {
  /* 重排：version 在首行，便于人眼识别（TD-7） */
  const ordered: Record<string, unknown> = {};
  if ('version' in config) {
    ordered.version = config.version;
  }
  for (const key of Object.keys(config)) {
    if (key === 'version') continue;
    ordered[key] = config[key];
  }

  const content = stringifyYaml(ordered, {
    lineWidth: 0,
    singleQuote: false,
  });
  await fs.writeFile(targetPath, content, 'utf-8');
}

/* ============================================================
 * 主调度器：全局 Config
 * ============================================================ */

/**
 * 执行全局 Config 迁移
 *
 * 调用顺序：
 *   1. 提取 version
 *   2. 若 version === CURRENT_CONFIG_VERSION → 直接返回（up_to_date）
 *   3. 备份原文件
 *   4. 按顺序应用迁移函数
 *   5. 写入 version = CURRENT_CONFIG_VERSION
 *   6. 序列化写回 + reporter.report
 *
 * 失败处理：
 *   - 备份阶段失败 → 抛错，不进入写入流程（用户原文件未损坏）
 *   - 写入阶段失败 → reporter 输出错误 + .bak 路径供回滚，向上层抛错
 *
 * @param parsed 已 yaml.parse 的对象（来自 loadConfig 的 fs.readFile）
 * @param filePath 原文件绝对路径（用于备份与回写）
 * @returns 迁移调度结果
 */
export async function migrateConfigDispatch(
  parsed: Record<string, unknown>,
  filePath: string,
): Promise<MigrationDispatchResult<Record<string, unknown>>> {
  const reporter = getDefaultReporter();
  const fromVersion = extractVersion(parsed);

  /* 已是最新版：直接返回 */
  if (fromVersion === CURRENT_CONFIG_VERSION) {
    reporter.report({ status: 'up_to_date' });
    return {
      config: parsed,
      changed: false,
      changes: [],
      fromVersion,
      toVersion: CURRENT_CONFIG_VERSION,
      backupPath: null,
    };
  }

  /* 步骤 1：备份 */
  let backupPath: string;
  try {
    backupPath = await backupFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.report({
      status: 'parse_failed',
      error: `备份原文件失败: ${message}`,
    });
    throw error;
  }

  /* 步骤 2：累积应用迁移函数 */
  const changes: MigrationChange[] = [];

  /* v0.2 → v0.4：user_path → user_base */
  const step1 = migrateV02ToV04(parsed);
  if (step1.changed) changes.push(...step1.changes);

  /* v0.4 → v0.5：补 user_subscriptions + claude 命名统一 */
  const step2 = migrateConfigV04ToV05(parsed);
  if (step2.changed) changes.push(...step2.changes);

  /* 步骤 3：统一写入当前版本号 */
  parsed.version = CURRENT_CONFIG_VERSION;
  if (changes.length === 0 || fromVersion < CURRENT_CONFIG_VERSION) {
    /* 即使所有迁移函数都"无操作"，只要 version 与当前版本不一致仍需写盘 */
    changes.push({
      message: `Schema 版本号写入：v${fromVersion} → v${CURRENT_CONFIG_VERSION}`,
      path: 'version',
    });
  }

  /* 步骤 4：写回 */
  try {
    await writeYaml(filePath, parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.report({
      status: 'write_failed',
      error: message,
      backupPath,
    });
    throw error;
  }

  /* 步骤 5：上报成功 */
  const outcome: MigrationOutcome = {
    status: 'migrated',
    fromVersion,
    toVersion: CURRENT_CONFIG_VERSION,
    changes,
    backupPath,
  };
  reporter.report(outcome);
  await persistLastMigration(outcome);

  return {
    config: parsed,
    changed: true,
    changes,
    fromVersion,
    toVersion: CURRENT_CONFIG_VERSION,
    backupPath,
  };
}

/* ============================================================
 * 主调度器：项目级 ProjectConfig
 * ============================================================ */

/**
 * 执行项目级 ProjectConfig 迁移
 *
 * 与 migrateConfigDispatch 同构，但应用的迁移函数集合是 ProjectConfig 专属版本。
 *
 * @param parsed 已 yaml.parse 的对象
 * @param filePath 原文件绝对路径
 * @returns 迁移调度结果
 */
export async function migrateProjectConfigDispatch(
  parsed: Record<string, unknown>,
  filePath: string,
): Promise<MigrationDispatchResult<Record<string, unknown>>> {
  const reporter = getDefaultReporter();
  const fromVersion = extractVersion(parsed);

  if (fromVersion === CURRENT_PROJECT_CONFIG_VERSION) {
    reporter.report({ status: 'up_to_date' });
    return {
      config: parsed,
      changed: false,
      changes: [],
      fromVersion,
      toVersion: CURRENT_PROJECT_CONFIG_VERSION,
      backupPath: null,
    };
  }

  /* 备份 */
  let backupPath: string;
  try {
    backupPath = await backupFile(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.report({
      status: 'parse_failed',
      error: `备份原文件失败: ${message}`,
    });
    throw error;
  }

  const changes: MigrationChange[] = [];

  /* v0.4 → v0.5：项目级当前为空操作，保留以备未来 */
  const step = migrateProjectConfigV04ToV05(parsed);
  if (step.changed) changes.push(...step.changes);

  parsed.version = CURRENT_PROJECT_CONFIG_VERSION;
  changes.push({
    message: `Schema 版本号写入：v${fromVersion} → v${CURRENT_PROJECT_CONFIG_VERSION}`,
    path: 'version',
  });

  try {
    await writeYaml(filePath, parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.report({
      status: 'write_failed',
      error: message,
      backupPath,
    });
    throw error;
  }

  reporter.report({
    status: 'migrated',
    fromVersion,
    toVersion: CURRENT_PROJECT_CONFIG_VERSION,
    changes,
    backupPath,
  });
  /* 项目级迁移不落盘 .last-migration.json（GUI 关注点是全局 config，项目级迁移频率高且无关 UI 弹窗） */

  return {
    config: parsed,
    changed: true,
    changes,
    fromVersion,
    toVersion: CURRENT_PROJECT_CONFIG_VERSION,
    backupPath,
  };
}

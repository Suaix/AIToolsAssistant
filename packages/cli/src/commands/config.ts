/**
 * config 命令处理模块（FEAT-002 新增）
 *
 * 语义（类 git config 隐式 get/set）：
 *   aitools config root                     # 查看当前根目录
 *   aitools config root ~/new-path          # 更改根目录（创建空子目录）
 *   aitools config root ~/new-path --migrate # 更改根目录 + 迁移资源
 *   aitools config --list                   # 列出所有配置项
 *
 * JSON 模式事件：
 *   config.get  { key, value }
 *   config.set  { key, oldValue, newValue, migrated }
 *   config.list { items: { key, value }[] }
 *
 * 支持的 key：
 *   root — 对应 config.yaml 的 source 字段（aitools 资源根目录）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  loadConfig,
  saveConfig,
  expandTilde,
  collapseTilde,
} from '../config/manager.js';
import { reporter, isJsonMode, emitJson } from '../utils/reporter.js';

/** 资源子目录名列表（更改根目录时需要创建或迁移） */
const RESOURCE_SUBDIRS = ['skills', 'commands', 'agents', 'rules'];

/* ============================================================
 * 主入口
 * ============================================================ */

/**
 * config 命令入口
 *
 * @param key 配置键名（位置参数 1）
 * @param value 配置值（位置参数 2，可选）
 * @param options CLI 选项
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  options: { migrate?: boolean; list?: boolean },
): Promise<void> {
  /* --list 模式 */
  if (options.list || !key) {
    await listConfig();
    return;
  }

  /* 校验 key */
  if (key !== 'root') {
    reporter.error(`未知的配置项: ${key}。当前支持: root`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  /* 无 value → get */
  if (!value) {
    await getRoot();
    return;
  }

  /* 有 value → set */
  await setRoot(value, options.migrate ?? false);
}

/* ============================================================
 * get：查看配置值
 * ============================================================ */

/**
 * 查看当前根目录路径
 */
async function getRoot(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const currentValue = config.source;
  reporter.info(`root = ${currentValue}`);

  if (isJsonMode()) {
    emitJson({ event: 'config.get', data: { key: 'root', value: currentValue } });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

/* ============================================================
 * set：更改根目录
 * ============================================================ */

/**
 * 更改根目录路径
 *
 * @param newValue 新路径（可含 ~）
 * @param migrate 是否迁移旧目录下的资源
 */
async function setRoot(newValue: string, migrate: boolean): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const oldValue = config.source;
  const oldAbsPath = expandTilde(oldValue);
  const newAbsPath = expandTilde(newValue);

  /* 路径相同，无需操作 */
  if (oldAbsPath === newAbsPath) {
    reporter.info(`根目录未变更: ${oldValue}`);
    if (isJsonMode()) {
      emitJson({
        event: 'config.set',
        data: { key: 'root', oldValue, newValue: oldValue, migrated: false },
      });
      emitJson({ event: 'done', data: { exitCode: 0 } });
    }
    return;
  }

  /* 确保新目录存在 */
  try {
    await fs.mkdir(newAbsPath, { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reporter.error(`无法创建目录 ${newAbsPath}: ${msg}`);
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  if (migrate) {
    /* 迁移模式：移动旧目录下的资源子目录到新目录 */
    const ok = await migrateResources(oldAbsPath, newAbsPath);
    if (!ok) {
      if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
      return;
    }
  } else {
    /* 非迁移模式：在新目录下创建空子目录结构 */
    await createEmptySubdirs(newAbsPath);
  }

  /* 更新 config.yaml */
  const displayValue = collapseTilde(newAbsPath);
  config.source = displayValue;
  await saveConfig(config);

  reporter.success(`根目录已更新: ${oldValue} → ${displayValue}`);
  if (migrate) {
    reporter.info('资源文件已迁移到新目录');
  }

  if (isJsonMode()) {
    emitJson({
      event: 'config.set',
      data: { key: 'root', oldValue, newValue: displayValue, migrated: migrate },
    });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

/* ============================================================
 * list：列出所有配置
 * ============================================================ */

/**
 * 列出所有配置项
 */
async function listConfig(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    if (isJsonMode()) emitJson({ event: 'done', data: { exitCode: 1 } });
    return;
  }

  const items = [
    { key: 'root', value: config.source },
  ];

  for (const item of items) {
    reporter.info(`${item.key} = ${item.value}`);
  }

  if (isJsonMode()) {
    emitJson({ event: 'config.list', data: { items } });
    emitJson({ event: 'done', data: { exitCode: 0 } });
  }
}

/* ============================================================
 * 辅助：迁移资源
 * ============================================================ */

/**
 * 将旧目录下的资源子目录迁移（复制后删除）到新目录
 *
 * 使用 fs.cp + fs.rm 而非 fs.rename，以支持跨文件系统场景
 *
 * @param oldDir 旧根目录绝对路径
 * @param newDir 新根目录绝对路径
 * @returns 是否成功
 */
async function migrateResources(oldDir: string, newDir: string): Promise<boolean> {
  for (const subdir of RESOURCE_SUBDIRS) {
    const srcPath = path.join(oldDir, subdir);
    const destPath = path.join(newDir, subdir);

    /* 检查源子目录是否存在 */
    try {
      const stat = await fs.stat(srcPath);
      if (!stat.isDirectory()) continue;
    } catch {
      /* 子目录不存在，跳过 */
      continue;
    }

    /* 复制到新位置 */
    try {
      reporter.info(`迁移 ${subdir}/...`);
      await fs.cp(srcPath, destPath, { recursive: true });
      /* 复制成功后删除源 */
      await fs.rm(srcPath, { recursive: true, force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reporter.error(`迁移 ${subdir}/ 失败: ${msg}`);
      return false;
    }
  }

  /* 确保所有子目录在新位置都存在（包括旧目录下不存在的） */
  await createEmptySubdirs(newDir);

  return true;
}

/* ============================================================
 * 辅助：创建空子目录
 * ============================================================ */

/**
 * 在指定目录下创建标准资源子目录结构
 *
 * @param baseDir 根目录绝对路径
 */
async function createEmptySubdirs(baseDir: string): Promise<void> {
  for (const subdir of RESOURCE_SUBDIRS) {
    const dirPath = path.join(baseDir, subdir);
    await fs.mkdir(dirPath, { recursive: true });
  }
}

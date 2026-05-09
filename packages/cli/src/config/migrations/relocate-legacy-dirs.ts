/**
 * 旧 user_base / 项目级标记目录资源搬迁（FEAT-005 步骤 6）
 *
 * 场景：
 *   存量 GUI 用户已经把资源同步到 ~/.claude/、~/.claude-code/ 或项目级 .claude-code/。
 *   FEAT-005 把 Claude 工具规范名统一为 claude-internal，user_base 改为 ~/.claude-internal。
 *   本模块负责把旧目录下的资源合并到新目录。
 *
 * 设计要点：
 *   - aitools 不主动 mkdir AI 工具家目录（US-6 边界守卫）；
 *     **仅在旧目录已存在时**才进行搬迁，且新目录是承接已有资源的合理例外
 *   - 同名资源内容相同 → 直接 skip（说明用户两边手动拷贝过）
 *   - 同名资源内容不同 → 列入冲突报告，**不静默覆盖**（TD-9）
 *   - 全部资源成功承接后才删除旧目录（TD-10：保留回滚通道）
 *
 * 数据来源：SSOT shared/tools.json 的 legacyUserBases / legacyProjectDirs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  getLegacyProjectDirs,
  getLegacyUserBases,
} from '../../registry/tools.js';
import type { ResourceConflict } from './reporter.js';

/* ============================================================
 * 内部辅助
 * ============================================================ */

/**
 * 将 ~/ 开头的路径展开为绝对路径
 *
 * @param input 可能含 ~ 的路径
 * @returns 绝对路径
 */
function expandTilde(input: string): string {
  if (input.startsWith('~/') || input === '~') {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

/**
 * 计算文件的 SHA-1 hash 用于内容比对
 *
 * 选用 SHA-1：碰撞概率对本场景足够；速度快；与 hashDirectory 现有实现一致。
 *
 * @param filePath 文件绝对路径
 * @returns hash 16 进制字符串
 */
async function hashFile(filePath: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const buffer = await fs.readFile(filePath);
  return createHash('sha1').update(buffer).digest('hex');
}

/**
 * 递归比较两个目录内容是否完全相同
 *
 * 仅比对常规文件；忽略子目录结构差异以外的类型（symlink 等）。
 *
 * @param a 目录 A 绝对路径
 * @param b 目录 B 绝对路径
 * @returns true 表示完全相同
 */
async function areDirectoriesIdentical(a: string, b: string): Promise<boolean> {
  const [aEntries, bEntries] = await Promise.all([
    fs.readdir(a, { withFileTypes: true }),
    fs.readdir(b, { withFileTypes: true }),
  ]);

  if (aEntries.length !== bEntries.length) return false;

  const aNames = new Set(aEntries.map((e) => e.name));
  const bNames = new Set(bEntries.map((e) => e.name));
  if (aNames.size !== bNames.size) return false;
  for (const name of aNames) {
    if (!bNames.has(name)) return false;
  }

  for (const entry of aEntries) {
    const aPath = path.join(a, entry.name);
    const bPath = path.join(b, entry.name);
    if (entry.isDirectory()) {
      const same = await areDirectoriesIdentical(aPath, bPath);
      if (!same) return false;
    } else if (entry.isFile()) {
      const [hashA, hashB] = await Promise.all([hashFile(aPath), hashFile(bPath)]);
      if (hashA !== hashB) return false;
    } else {
      /* 不支持的类型，保守视为不一致 */
      return false;
    }
  }
  return true;
}

/**
 * 递归拷贝目录（不删除源目录）
 *
 * @param srcDir 源目录绝对路径
 * @param destDir 目标目录绝对路径
 */
async function copyDirectory(srcDir: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 检查路径是否存在
 *
 * @param targetPath 目标绝对路径
 * @returns true 表示存在
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
 * 公共 API
 * ============================================================ */

/**
 * 单次搬迁结果
 */
export interface RelocateResult {
  /** 成功合并到新目录的资源数量（按"资源类型/资源名"维度计数） */
  merged: number;
  /** 内容相同被跳过的资源数量 */
  skippedIdentical: number;
  /** 冲突清单（同名内容不同） */
  conflicts: ResourceConflict[];
  /** 搬迁完成后被删除的旧目录绝对路径列表（仅在无冲突时删除） */
  removedDirs: string[];
}

/**
 * 单个目录对的搬迁
 *
 * 算法：
 *   1. 旧目录不存在 → 直接返回空结果（不创建任何东西）
 *   2. 遍历旧目录的资源类型子目录（如 skills/、commands/）
 *   3. 对每个资源（再下一级目录）：
 *      - 新目录无该资源 → 拷贝过去（merged++）
 *      - 新目录有该资源、内容相同 → skippedIdentical++
 *      - 新目录有该资源、内容不同 → 加入冲突清单
 *   4. 若 conflicts 为空 → 删除旧目录
 *
 * @param oldDir 旧目录绝对路径
 * @param newDir 新目录绝对路径
 * @returns 搬迁结果
 */
async function relocateDirPair(
  oldDir: string,
  newDir: string,
): Promise<RelocateResult> {
  const result: RelocateResult = {
    merged: 0,
    skippedIdentical: 0,
    conflicts: [],
    removedDirs: [],
  };

  /* 1. 旧目录不存在 → noop */
  if (!(await pathExists(oldDir))) {
    return result;
  }

  /* 2. 遍历旧目录的子目录（资源类型层 + 资源名层） */
  let typeEntries: Awaited<ReturnType<typeof fs.readdir>> = [];
  try {
    typeEntries = await fs.readdir(oldDir, { withFileTypes: true });
  } catch {
    /* 旧目录读取失败（如权限），跳过 */
    return result;
  }

  for (const typeEntry of typeEntries) {
    if (!typeEntry.isDirectory()) continue;
    const resourceType = typeEntry.name;
    const oldTypeDir = path.join(oldDir, resourceType);
    const newTypeDir = path.join(newDir, resourceType);

    let resourceEntries: Awaited<ReturnType<typeof fs.readdir>> = [];
    try {
      resourceEntries = await fs.readdir(oldTypeDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const resourceEntry of resourceEntries) {
      if (!resourceEntry.isDirectory()) continue;
      const resourceName = resourceEntry.name;
      const oldResourcePath = path.join(oldTypeDir, resourceName);
      const newResourcePath = path.join(newTypeDir, resourceName);

      const newExists = await pathExists(newResourcePath);
      if (!newExists) {
        /* 新位置无该资源：拷贝（此时新建 newTypeDir 是承接已有资源的合理例外） */
        await copyDirectory(oldResourcePath, newResourcePath);
        result.merged++;
        continue;
      }

      /* 新位置已有同名：比对内容 */
      const identical = await areDirectoriesIdentical(
        oldResourcePath,
        newResourcePath,
      );
      if (identical) {
        result.skippedIdentical++;
      } else {
        result.conflicts.push({
          oldPath: oldResourcePath,
          newPath: newResourcePath,
          resourceType,
        });
      }
    }
  }

  /* 3. 仅在无冲突时删除旧目录（TD-10） */
  if (result.conflicts.length === 0) {
    try {
      await fs.rm(oldDir, { recursive: true, force: true });
      result.removedDirs.push(oldDir);
    } catch {
      /* 删除失败不阻塞主流程；旧目录保留也无副作用 */
    }
  }

  return result;
}

/**
 * 批量搬迁所有用户级旧目录
 *
 * 数据源：SSOT legacyUserBases（如 ~/.claude → ~/.claude-internal）
 *
 * @returns 聚合搬迁结果
 */
export async function relocateLegacyUserDirs(): Promise<RelocateResult> {
  const aggregate: RelocateResult = {
    merged: 0,
    skippedIdentical: 0,
    conflicts: [],
    removedDirs: [],
  };

  const userBases = getLegacyUserBases();
  for (const [oldBase, newBase] of Object.entries(userBases)) {
    const oldDir = expandTilde(oldBase);
    const newDir = expandTilde(newBase);
    const r = await relocateDirPair(oldDir, newDir);
    aggregate.merged += r.merged;
    aggregate.skippedIdentical += r.skippedIdentical;
    aggregate.conflicts.push(...r.conflicts);
    aggregate.removedDirs.push(...r.removedDirs);
  }
  return aggregate;
}

/**
 * 批量搬迁单个项目下的旧标记目录
 *
 * 数据源：SSOT legacyProjectDirs（如 .claude-code → .claude-internal）
 *
 * @param projectDir 项目根目录绝对路径
 * @returns 聚合搬迁结果
 */
export async function relocateLegacyProjectDirs(
  projectDir: string,
): Promise<RelocateResult> {
  const aggregate: RelocateResult = {
    merged: 0,
    skippedIdentical: 0,
    conflicts: [],
    removedDirs: [],
  };

  const projectDirs = getLegacyProjectDirs();
  for (const [oldName, newName] of Object.entries(projectDirs)) {
    const oldDir = path.join(projectDir, oldName);
    const newDir = path.join(projectDir, newName);
    const r = await relocateDirPair(oldDir, newDir);
    aggregate.merged += r.merged;
    aggregate.skippedIdentical += r.skippedIdentical;
    aggregate.conflicts.push(...r.conflicts);
    aggregate.removedDirs.push(...r.removedDirs);
  }
  return aggregate;
}

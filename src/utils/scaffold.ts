/**
 * 源目录骨架生成工具
 *
 * v0.4.0 破坏性变更：
 * - 从 `<source>/<resource_type>/{user,project}/` 两级结构
 * - 改为 `<source>/<resource_type>/` 扁平结构
 * - 身份不再由路径表达，改由订阅清单声明（详见 RFC-001）
 *
 * 每个资源类型的目录都会被幂等创建，已有文件不受影响
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAllHandlers } from '../core/resources/registry.js';

/**
 * 骨架创建结果
 */
export interface ScaffoldResult {
  /** 所有目标叶子目录的绝对路径（含已存在与新建） */
  directories: string[];
  /** 新建的叶子目录路径（不含已存在） */
  created: string[];
  /** 已存在（跳过创建）的叶子目录路径 */
  skipped: string[];
}

/**
 * 在指定源目录下生成完整的资源骨架
 * v0.4.0：创建 `<source>/<resource_type>/` 共 4 个叶子目录（skills/commands/agents/rules）
 * @param sourceDir 源目录绝对路径
 * @returns 骨架创建结果（含新建与已存在分类）
 */
export async function ensureResourceSkeleton(
  sourceDir: string,
): Promise<ScaffoldResult> {
  /* 先确保源目录本身存在 */
  await fs.mkdir(sourceDir, { recursive: true });

  const directories: string[] = [];
  const created: string[] = [];
  const skipped: string[] = [];

  /* 按注册中心的所有资源类型创建叶子目录（v0.4 不再按 scope 分层） */
  for (const handler of getAllHandlers()) {
    const leafDir = path.join(sourceDir, handler.resourceDirName);
    directories.push(leafDir);

    /* 检查是否已存在 */
    let exists = false;
    try {
      const stat = await fs.stat(leafDir);
      exists = stat.isDirectory();
    } catch {
      exists = false;
    }

    if (exists) {
      skipped.push(leafDir);
    } else {
      await fs.mkdir(leafDir, { recursive: true });
      created.push(leafDir);
    }
  }

  return { directories, created, skipped };
}

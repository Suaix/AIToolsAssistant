/**
 * 源目录骨架生成工具
 * v0.2.0：确保 <source>/<resource_type>/<scope>/ 结构完整
 * 每个 scope 目录都会被幂等地创建，已有文件不受影响
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAllHandlers } from '../core/resources/registry.js';
import type { ResourceScope } from '../types/index.js';

/** 所有支持的资源层级范围（与 getAllHandlers 一起决定要创建的叶子目录数） */
const ALL_SCOPES: ResourceScope[] = ['user', 'project'];

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
 * 创建 <source>/<resource_type>/<scope>/ 共 4×2=8 个叶子目录
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

  /* 按注册中心的所有资源类型 × 所有 scope，创建叶子目录 */
  for (const handler of getAllHandlers()) {
    for (const scope of ALL_SCOPES) {
      const leafDir = path.join(sourceDir, handler.resourceDirName, scope);
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
  }

  return { directories, created, skipped };
}

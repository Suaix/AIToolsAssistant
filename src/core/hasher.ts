/**
 * Hash 计算模块
 * 提供文件和目录的 SHA-256 hash 计算能力
 * 用于同步时的变更检测
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 计算单个文件的 SHA-256 hash
 * @param filePath 文件的绝对路径
 * @returns 文件内容的 SHA-256 十六进制哈希值
 */
export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 递归收集目录下的所有文件（相对路径），并按路径排序
 * 排序确保相同内容的目录总是产生相同的 hash
 * @param dirPath 目录的绝对路径
 * @param basePath 用于计算相对路径的基础路径（默认为 dirPath 自身）
 * @returns 排序后的相对文件路径数组
 */
async function collectFiles(dirPath: string, basePath?: string): Promise<string[]> {
  const base = basePath ?? dirPath;
  const files: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      /* 递归收集子目录中的文件 */
      const subFiles = await collectFiles(fullPath, base);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      /* 记录相对路径 */
      files.push(path.relative(base, fullPath));
    }
  }

  /* 按路径排序，保证结果稳定 */
  return files.sort();
}

/**
 * 计算整个目录的 SHA-256 hash
 * 将目录内所有文件的「相对路径 + 文件内容 hash」拼接后再计算总 hash
 * 这样可以检测文件名变化和内容变化
 * @param dirPath 目录的绝对路径
 * @returns 目录的综合 SHA-256 十六进制哈希值
 */
export async function hashDirectory(dirPath: string): Promise<string> {
  const files = await collectFiles(dirPath);
  const hash = createHash('sha256');

  for (const relPath of files) {
    const fullPath = path.join(dirPath, relPath);
    const fileHash = await hashFile(fullPath);
    /* 将相对路径和文件 hash 一起纳入计算，确保文件名变化也能检测到 */
    hash.update(`${relPath}:${fileHash}\n`);
  }

  return hash.digest('hex');
}

/**
 * 安全地计算目录 hash
 * 如果目录不存在，返回 null 而不是抛出异常
 * @param dirPath 目录的绝对路径
 * @returns hash 值或 null（目录不存在时）
 */
export async function hashDirectorySafe(dirPath: string): Promise<string | null> {
  try {
    await fs.access(dirPath);
    return await hashDirectory(dirPath);
  } catch {
    return null;
  }
}

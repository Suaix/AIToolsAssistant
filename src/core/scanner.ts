/**
 * Skill 目录扫描模块
 * 负责扫描源目录中的 Skill 文件夹，并解析 SKILL.md frontmatter 元数据
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { logger } from '../utils/logger.js';
import type { SkillInfo } from '../types/index.js';

/** Skill 主文件名（必需文件） */
const SKILL_FILE_NAME = 'SKILL.md';

/** frontmatter 分隔符 */
const FRONTMATTER_DELIMITER = '---';

/**
 * 从 SKILL.md 文件内容中解析 YAML frontmatter
 * frontmatter 是文件开头由 --- 包裹的 YAML 块
 * @param content SKILL.md 文件的完整文本内容
 * @returns 解析出的 frontmatter 对象，解析失败返回 null
 */
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const trimmed = content.trimStart();

  /* 检查是否以 --- 开头 */
  if (!trimmed.startsWith(FRONTMATTER_DELIMITER)) {
    return null;
  }

  /* 查找第二个 --- 的位置 */
  const endIndex = trimmed.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);
  if (endIndex === -1) {
    return null;
  }

  /* 提取 YAML 内容 */
  const yamlStr = trimmed.slice(FRONTMATTER_DELIMITER.length, endIndex).trim();
  if (!yamlStr) {
    return null;
  }

  try {
    const parsed = parseYaml(yamlStr);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    /* YAML 解析失败，返回 null */
    return null;
  }
}

/**
 * 从单个 Skill 文件夹中读取并解析元数据
 * @param skillDirPath Skill 文件夹的绝对路径
 * @returns SkillInfo 对象，包含名称、描述等信息
 */
async function parseSkillInfo(skillDirPath: string): Promise<SkillInfo> {
  const dirName = path.basename(skillDirPath);
  const skillFilePath = path.join(skillDirPath, SKILL_FILE_NAME);

  /* 默认值：使用文件夹名作为名称 */
  const info: SkillInfo = {
    name: dirName,
    description: '-',
    path: skillDirPath,
    dirName,
  };

  try {
    const content = await fs.readFile(skillFilePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    if (frontmatter) {
      /* 优先使用 frontmatter 中的 name */
      if (typeof frontmatter.name === 'string' && frontmatter.name.trim()) {
        info.name = frontmatter.name.trim();
      }
      /* 提取 description */
      if (typeof frontmatter.description === 'string' && frontmatter.description.trim()) {
        info.description = frontmatter.description.trim();
      }
    }
  } catch {
    /* 读取或解析失败，使用默认值 */
    logger.warn(`读取 ${dirName}/SKILL.md 失败，使用文件夹名作为默认值`);
  }

  return info;
}

/**
 * 扫描源目录中的所有有效 Skill 文件夹
 * 有效 Skill 文件夹 = 包含 SKILL.md 文件的子目录
 * @param sourceDir 源目录的绝对路径
 * @returns 所有有效 Skill 的元数据数组
 */
export async function scanSkills(sourceDir: string): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  try {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      /* 只处理目录 */
      if (!entry.isDirectory()) {
        continue;
      }

      const skillDirPath = path.join(sourceDir, entry.name);
      const skillFilePath = path.join(skillDirPath, SKILL_FILE_NAME);

      /* 检查是否包含 SKILL.md */
      try {
        await fs.access(skillFilePath);
      } catch {
        /* 不包含 SKILL.md，跳过 */
        continue;
      }

      /* 解析 Skill 元数据 */
      const info = await parseSkillInfo(skillDirPath);
      skills.push(info);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`扫描源目录失败: ${message}`);
  }

  /* 按名称排序，输出稳定 */
  return skills.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

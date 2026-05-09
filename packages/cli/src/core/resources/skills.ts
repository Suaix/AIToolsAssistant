/**
 * Skills 资源处理器
 * 处理 SKILL.md 主文件 + frontmatter 解析
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { logger } from '../../utils/logger.js';
import type { ResourceHandler, ResourceInfo } from '../../types/index.js';

/** Skill 主文件名（必需文件） */
const SKILL_FILE_NAME = 'SKILL.md';

/** frontmatter 分隔符 */
const FRONTMATTER_DELIMITER = '---';

/**
 * 从 SKILL.md 文件内容中解析 YAML frontmatter
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
  const endIndex = trimmed.indexOf(
    FRONTMATTER_DELIMITER,
    FRONTMATTER_DELIMITER.length,
  );
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
 *
 * v0.4.0：不再携带 scope 字段（身份与订阅解耦；详见 RFC-001 §2）。
 * 为保持 `ResourceInfo` 编译期结构兼容，这里仍给 `scope` 填 'user' 作占位值
 * ——该字段已标记 @deprecated，PR-3/5 重写调用方后会彻底删除。
 *
 * @param skillDirPath Skill 文件夹的绝对路径
 * @returns ResourceInfo 对象
 */
async function parseSkillInfo(skillDirPath: string): Promise<ResourceInfo> {
  const dirName = path.basename(skillDirPath);
  const skillFilePath = path.join(skillDirPath, SKILL_FILE_NAME);

  /* 默认值：使用文件夹名作为名称 */
  const info: ResourceInfo = {
    name: dirName,
    description: '-',
    path: skillDirPath,
    dirName,
    /* v0.4 过渡占位：@deprecated 的 scope 字段，调用方若读到请忽略 */
    scope: 'user',
    type: 'skills',
  };

  try {
    const content = await fs.readFile(skillFilePath, 'utf-8');
    const frontmatter = parseFrontmatter(content);

    if (frontmatter) {
      if (typeof frontmatter.name === 'string' && frontmatter.name.trim()) {
        info.name = frontmatter.name.trim();
      }
      if (
        typeof frontmatter.description === 'string' &&
        frontmatter.description.trim()
      ) {
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
 * 扫描 <sourceDir>/skills/ 下的所有有效 Skill 文件夹（扁平结构）
 * 有效 Skill 文件夹 = 包含 SKILL.md 文件的子目录
 *
 * v0.4.0：目录结构从 `skills/{user,project}/<name>/` 扁平为 `skills/<name>/`
 *
 * @param sourceDir 源目录根路径
 * @returns 所有有效 Skill 的元数据数组；skills/ 目录不存在时返回空数组
 */
async function scanSkills(sourceDir: string): Promise<ResourceInfo[]> {
  const skillsDir = path.join(sourceDir, 'skills');
  const skills: ResourceInfo[] = [];

  let entries;
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch (error) {
    /* skills/ 目录不存在：视为 0 资源，不报错 */
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`扫描源目录失败: ${message}`);
    return [];
  }

  for (const entry of entries) {
    /* 只处理目录 */
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDirPath = path.join(skillsDir, entry.name);
    const skillFilePath = path.join(skillDirPath, SKILL_FILE_NAME);

    /* 检查是否包含 SKILL.md */
    try {
      await fs.access(skillFilePath);
    } catch {
      continue;
    }

    const info = await parseSkillInfo(skillDirPath);
    skills.push(info);
  }

  /* 按名称排序，输出稳定 */
  return skills.sort((a, b) => a.dirName.localeCompare(b.dirName));
}

/**
 * Skills 资源处理器实现
 */
export const skillsHandler: ResourceHandler = {
  type: 'skills',
  implemented: true,
  resourceDirName: 'skills',
  displayName: 'Skills',
  scan: scanSkills,
};

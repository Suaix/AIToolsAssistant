/**
 * SkillsHandler 单元测试
 * v0.4.0：源目录扁平化（去掉 user/project 子层），scan 无 scope 参数
 * 覆盖：scan 从扁平目录读取、SKILL.md 必需、frontmatter 解析、稳定排序
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { skillsHandler } from '../../../src/core/resources/skills.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-skills-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * 在扁平的 `tempDir/skills/<name>/` 下创建一个 skill
 */
async function createSkill(name: string, content: string): Promise<string> {
  const dir = path.join(tempDir, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  return dir;
}

describe('skillsHandler 元数据', () => {
  it('应具备正确的基础属性', () => {
    expect(skillsHandler.type).toBe('skills');
    expect(skillsHandler.implemented).toBe(true);
    expect(skillsHandler.resourceDirName).toBe('skills');
    expect(skillsHandler.displayName).toBe('Skills');
  });
});

describe('skillsHandler.scan', () => {
  it('skills/ 目录不存在时返回空数组', async () => {
    /* 不创建任何子目录 */
    const result = await skillsHandler.scan(tempDir);
    expect(result).toEqual([]);
  });

  it('扫描扁平目录下的所有 skill', async () => {
    await createSkill('skill-a', '# Skill A');
    await createSkill('skill-b', '# Skill B');

    const result = await skillsHandler.scan(tempDir);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.dirName)).toEqual(['skill-a', 'skill-b']);
    expect(result[0].type).toBe('skills');
  });

  it('缺少 SKILL.md 的文件夹会被跳过', async () => {
    const dir = path.join(tempDir, 'skills', 'no-skill-md');
    await fs.mkdir(dir, { recursive: true });
    /* 注意：没有创建 SKILL.md */

    const result = await skillsHandler.scan(tempDir);
    expect(result).toHaveLength(0);
  });

  it('解析 frontmatter 中的 name 和 description', async () => {
    await createSkill(
      'my-skill',
      [
        '---',
        'name: 我的技能',
        'description: 一个测试技能',
        '---',
        '# 正文',
        '',
      ].join('\n'),
    );

    const result = await skillsHandler.scan(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('我的技能');
    expect(result[0].description).toBe('一个测试技能');
    expect(result[0].dirName).toBe('my-skill');
  });

  it('没有 frontmatter 时使用文件夹名 + 描述为 -', async () => {
    await createSkill('raw-skill', '# 正文，无 frontmatter');

    const result = await skillsHandler.scan(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('raw-skill');
    expect(result[0].description).toBe('-');
  });

  it('结果按 dirName 字母序排序', async () => {
    await createSkill('zebra', '# z');
    await createSkill('apple', '# a');
    await createSkill('mango', '# m');

    const result = await skillsHandler.scan(tempDir);
    expect(result.map((r) => r.dirName)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('忽略 skills 目录下的裸文件（非目录）', async () => {
    const skillsDir = path.join(tempDir, 'skills');
    await fs.mkdir(skillsDir, { recursive: true });
    /* 裸文件应该被忽略 */
    await fs.writeFile(path.join(skillsDir, 'README.md'), 'noise', 'utf-8');
    /* 正常 skill */
    await createSkill('valid', '# v');

    const result = await skillsHandler.scan(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0].dirName).toBe('valid');
  });
});

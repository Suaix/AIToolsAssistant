/**
 * SkillsHandler 单元测试
 * 覆盖：scan 按 scope 过滤、SKILL.md 必需、frontmatter 解析
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
 * 在 tempDir/<type>/<scope>/<name> 下创建一个 skill
 */
async function createSkill(
  scope: 'user' | 'project',
  name: string,
  content: string,
): Promise<string> {
  const dir = path.join(tempDir, 'skills', scope, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  return dir;
}

describe('skillsHandler 元数据', () => {
  it('应具备正确的基础属性', () => {
    expect(skillsHandler.type).toBe('skills');
    expect(skillsHandler.implemented).toBe(true);
    expect(skillsHandler.resourceDirName).toBe('skills');
  });
});

describe('skillsHandler.scan', () => {
  it('scope 目录不存在时返回空数组', async () => {
    /* 不创建任何子目录 */
    const result = await skillsHandler.scan(tempDir, 'user');
    expect(result).toEqual([]);
  });

  it('扫描 user scope 下的 skill', async () => {
    await createSkill('user', 'skill-a', '# Skill A');
    await createSkill('project', 'skill-b', '# Skill B');

    const users = await skillsHandler.scan(tempDir, 'user');
    expect(users).toHaveLength(1);
    expect(users[0].dirName).toBe('skill-a');
    expect(users[0].scope).toBe('user');
    expect(users[0].type).toBe('skills');
  });

  it('扫描 project scope 下的 skill', async () => {
    await createSkill('user', 'skill-a', '# Skill A');
    await createSkill('project', 'skill-b', '# Skill B');

    const projects = await skillsHandler.scan(tempDir, 'project');
    expect(projects).toHaveLength(1);
    expect(projects[0].dirName).toBe('skill-b');
    expect(projects[0].scope).toBe('project');
  });

  it('缺少 SKILL.md 的文件夹会被跳过', async () => {
    const dir = path.join(tempDir, 'skills', 'user', 'no-skill-md');
    await fs.mkdir(dir, { recursive: true });
    /* 注意：没有创建 SKILL.md */

    const result = await skillsHandler.scan(tempDir, 'user');
    expect(result).toHaveLength(0);
  });

  it('解析 frontmatter 中的 name 和 description', async () => {
    await createSkill(
      'user',
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

    const result = await skillsHandler.scan(tempDir, 'user');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('我的技能');
    expect(result[0].description).toBe('一个测试技能');
    expect(result[0].dirName).toBe('my-skill');
  });

  it('没有 frontmatter 时使用文件夹名 + 描述为 -', async () => {
    await createSkill('user', 'raw-skill', '# 正文，无 frontmatter');

    const result = await skillsHandler.scan(tempDir, 'user');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('raw-skill');
    expect(result[0].description).toBe('-');
  });

  it('结果按 dirName 字母序排序', async () => {
    await createSkill('user', 'zebra', '# z');
    await createSkill('user', 'apple', '# a');
    await createSkill('user', 'mango', '# m');

    const result = await skillsHandler.scan(tempDir, 'user');
    expect(result.map((r) => r.dirName)).toEqual(['apple', 'mango', 'zebra']);
  });
});

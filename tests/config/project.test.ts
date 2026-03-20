/**
 * 项目配置管理模块 (src/config/project.ts) 单元测试
 * 覆盖场景：读写 project.yaml、添加 Skill 去重、错误处理
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadProjectConfig,
  saveProjectConfig,
  addSkillToProject,
  projectConfigExists,
  getProjectConfigPath,
} from '../../src/config/project.js';

/** 测试用的临时目录 */
let tempDir: string;

beforeEach(async () => {
  /* 每个测试创建独立临时目录 */
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-test-'));
});

afterEach(async () => {
  /* 清理临时目录 */
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('projectConfigExists', () => {
  it('配置文件不存在时返回 false', async () => {
    const result = await projectConfigExists(tempDir);
    expect(result).toBe(false);
  });

  it('配置文件存在时返回 true', async () => {
    /* 创建 .aitools/project.yaml */
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, 'project.yaml'), 'skills: []', 'utf-8');

    const result = await projectConfigExists(tempDir);
    expect(result).toBe(true);
  });
});

describe('loadProjectConfig', () => {
  it('配置文件不存在时返回 null', async () => {
    const result = await loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('正确读取有效的配置文件', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      'skills:\n  - skill-a\n  - skill-b\n',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['skill-a', 'skill-b'] });
  });

  it('skills 为空数组时返回空数组', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      'skills: []\n',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: [] });
  });

  it('YAML 格式错误时返回 null', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      ':::: invalid yaml {{{{',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('缺少 skills 字段时返回 null', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      'name: test-project\n',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toBeNull();
  });

  it('过滤非字符串元素', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      'skills:\n  - skill-a\n  - 123\n  - skill-b\n  - ""\n',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['skill-a', 'skill-b'] });
  });
});

describe('saveProjectConfig', () => {
  it('目录不存在时自动创建并保存', async () => {
    await saveProjectConfig(tempDir, { skills: ['skill-a', 'skill-b'] });

    const configPath = getProjectConfigPath(tempDir);
    const content = await fs.readFile(configPath, 'utf-8');
    expect(content).toContain('skill-a');
    expect(content).toContain('skill-b');
  });

  it('覆盖已有配置文件', async () => {
    /* 先写入旧数据 */
    await saveProjectConfig(tempDir, { skills: ['old-skill'] });
    /* 再写入新数据 */
    await saveProjectConfig(tempDir, { skills: ['new-skill-a', 'new-skill-b'] });

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['new-skill-a', 'new-skill-b'] });
  });
});

describe('addSkillToProject', () => {
  it('配置不存在时自动创建并添加 Skill', async () => {
    await addSkillToProject(tempDir, 'skill-a');

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['skill-a'] });
  });

  it('追加新 Skill 到已有列表', async () => {
    await saveProjectConfig(tempDir, { skills: ['skill-a'] });
    await addSkillToProject(tempDir, 'skill-b');

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['skill-a', 'skill-b'] });
  });

  it('重复 Skill 不会被添加', async () => {
    await saveProjectConfig(tempDir, { skills: ['skill-a'] });
    await addSkillToProject(tempDir, 'skill-a');

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['skill-a'] });
  });
});

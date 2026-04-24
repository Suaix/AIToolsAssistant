/**
 * 项目配置管理模块 (src/config/project.ts) 单元测试
 * 适配 v0.2.0：ProjectConfig 按资源类型分组
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadProjectConfig,
  saveProjectConfig,
  addSkillToProject,
  addResourceToProject,
  projectConfigExists,
  getProjectConfigPath,
  getProjectResourceList,
} from '../../src/config/project.js';

/** 测试用的临时目录 */
let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('projectConfigExists', () => {
  it('配置文件不存在时返回 false', async () => {
    const result = await projectConfigExists(tempDir);
    expect(result).toBe(false);
  });

  it('配置文件存在时返回 true', async () => {
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

  it('读取有效的 skills-only 配置', async () => {
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

  it('读取按资源类型分组的完整配置', async () => {
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      [
        'skills:',
        '  - skill-a',
        'commands:',
        '  - cmd-x',
        'rules:',
        '  - rule-y',
        '',
      ].join('\n'),
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({
      skills: ['skill-a'],
      commands: ['cmd-x'],
      rules: ['rule-y'],
    });
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

  it('缺少 skills 字段时返回空的 skills 列表', async () => {
    /* v0.2.0：skills 字段缺失不再视为错误，返回空数组 */
    const configDir = path.join(tempDir, '.aitools');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'project.yaml'),
      'commands:\n  - cmd-a\n',
      'utf-8',
    );

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: [], commands: ['cmd-a'] });
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
    await saveProjectConfig(tempDir, { skills: ['old-skill'] });
    await saveProjectConfig(tempDir, {
      skills: ['new-skill-a', 'new-skill-b'],
    });

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({ skills: ['new-skill-a', 'new-skill-b'] });
  });

  it('按资源类型分组保存', async () => {
    await saveProjectConfig(tempDir, {
      skills: ['s1'],
      commands: ['c1', 'c2'],
      agents: ['a1'],
    });

    const result = await loadProjectConfig(tempDir);
    expect(result).toEqual({
      skills: ['s1'],
      commands: ['c1', 'c2'],
      agents: ['a1'],
    });
  });
});

describe('addSkillToProject（兼容别名）', () => {
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

describe('addResourceToProject（按资源类型）', () => {
  it('添加 commands 类型资源', async () => {
    await addResourceToProject(tempDir, 'commands', 'cmd-a');

    const result = await loadProjectConfig(tempDir);
    expect(result?.commands).toEqual(['cmd-a']);
    /* skills 保持空数组 */
    expect(result?.skills).toEqual([]);
  });

  it('向已有 skills 列表追加 skills 类型资源', async () => {
    await saveProjectConfig(tempDir, { skills: ['skill-a'] });
    await addResourceToProject(tempDir, 'skills', 'skill-b');

    const result = await loadProjectConfig(tempDir);
    expect(result?.skills).toEqual(['skill-a', 'skill-b']);
  });

  it('不同资源类型互相独立', async () => {
    await addResourceToProject(tempDir, 'skills', 's1');
    await addResourceToProject(tempDir, 'commands', 'c1');
    await addResourceToProject(tempDir, 'agents', 'a1');

    const result = await loadProjectConfig(tempDir);
    expect(result?.skills).toEqual(['s1']);
    expect(result?.commands).toEqual(['c1']);
    expect(result?.agents).toEqual(['a1']);
  });

  it('重复资源不会被添加', async () => {
    await addResourceToProject(tempDir, 'commands', 'cmd-a');
    await addResourceToProject(tempDir, 'commands', 'cmd-a');

    const result = await loadProjectConfig(tempDir);
    expect(result?.commands).toEqual(['cmd-a']);
  });
});

describe('getProjectResourceList', () => {
  it('读取各类型列表', () => {
    const cfg = {
      skills: ['s'],
      commands: ['c'],
      agents: ['a'],
      rules: ['r'],
    };
    expect(getProjectResourceList(cfg, 'skills')).toEqual(['s']);
    expect(getProjectResourceList(cfg, 'commands')).toEqual(['c']);
    expect(getProjectResourceList(cfg, 'agents')).toEqual(['a']);
    expect(getProjectResourceList(cfg, 'rules')).toEqual(['r']);
  });

  it('缺失类型返回空数组', () => {
    const cfg = { skills: ['s'] };
    expect(getProjectResourceList(cfg, 'commands')).toEqual([]);
    expect(getProjectResourceList(cfg, 'agents')).toEqual([]);
    expect(getProjectResourceList(cfg, 'rules')).toEqual([]);
  });
});

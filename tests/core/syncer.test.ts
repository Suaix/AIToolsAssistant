/**
 * 同步引擎模块 (src/core/syncer.ts) 单元测试
 * 适配 v0.2.0：路径由 handler 的 resourceDirName 推导
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  syncAllResources,
  syncProjectResources,
  getUserTargetDir,
  getProjectTargetDir,
} from '../../src/core/syncer.js';
import type { Config, ResourceInfo } from '../../src/types/index.js';

/** 测试用的临时目录 */
let tempDir: string;
/** 模拟的源目录（仅用于 Config.source） */
let sourceDir: string;
/** 模拟的用户级目标根目录（其下再 + /skills） */
let userTargetDir: string;
/** 模拟的项目目录 */
let projectDir: string;

/**
 * 创建模拟 Skill 目录（直接在 basePath 下）
 */
async function createMockSkill(
  basePath: string,
  skillName: string,
  content: string,
): Promise<ResourceInfo> {
  const skillPath = path.join(basePath, skillName);
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), content, 'utf-8');

  return {
    name: skillName,
    description: '-',
    path: skillPath,
    dirName: skillName,
    scope: 'user',
    type: 'skills',
  };
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-syncer-test-'));
  sourceDir = path.join(tempDir, 'source');
  userTargetDir = path.join(tempDir, 'user-target');
  projectDir = path.join(tempDir, 'my-project');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(userTargetDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  /* 为项目目录创建工具根目录，确保 detectProjectTools() 能检测到 */
  await fs.mkdir(path.join(projectDir, '.codebuddy'), { recursive: true });
  await fs.mkdir(path.join(projectDir, '.claude-code'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * 创建测试用的全局配置对象（v0.2.0：user_base）
 */
function createTestConfig(): Config {
  return {
    source: sourceDir,
    targets: [
      {
        name: 'codebuddy',
        enabled: true,
        user_base: path.join(userTargetDir, 'codebuddy'),
      },
      {
        name: 'claude-code',
        enabled: true,
        user_base: path.join(userTargetDir, 'claude-code'),
      },
    ],
    sync: {
      default_scope: 'user',
      clean: false,
    },
  };
}

describe('getUserTargetDir / getProjectTargetDir', () => {
  it('用户级路径 = user_base/<resource_dir_name>', () => {
    const target = {
      name: 'codebuddy',
      enabled: true,
      user_base: '/tmp/.codebuddy',
    };
    expect(getUserTargetDir(target, 'skills')).toBe('/tmp/.codebuddy/skills');
    expect(getUserTargetDir(target, 'commands')).toBe('/tmp/.codebuddy/commands');
  });

  it('项目级路径 = <projectDir>/.<targetName>/<resource_dir_name>', () => {
    expect(getProjectTargetDir('/work/proj', 'codebuddy', 'skills')).toBe(
      '/work/proj/.codebuddy/skills',
    );
    expect(getProjectTargetDir('/work/proj', 'claude-code', 'agents')).toBe(
      '/work/proj/.claude-code/agents',
    );
  });
});

describe('syncAllResources（用户级同步）', () => {
  it('首次同步应返回 created 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    const summary = await syncAllResources([skill], config, 'skills');

    expect(summary.totalSkills).toBe(1);
    expect(summary.created).toBe(2); /* 两个目标都是新增 */
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(0);

    /* 验证目标路径正确（user_base/skills/<name>/） */
    const codebuddyDir = path.join(
      userTargetDir,
      'codebuddy',
      'skills',
      'skill-a',
    );
    const stat = await fs.stat(codebuddyDir);
    expect(stat.isDirectory()).toBe(true);
  });

  it('内容未变时应返回 skipped 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    await syncAllResources([skill], config, 'skills');
    const summary = await syncAllResources([skill], config, 'skills');

    expect(summary.skipped).toBe(2);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('内容变化时应返回 updated 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A v1');
    const config = createTestConfig();

    await syncAllResources([skill], config, 'skills');
    await fs.writeFile(path.join(skill.path, 'SKILL.md'), '# Skill A v2', 'utf-8');
    const summary = await syncAllResources([skill], config, 'skills');

    expect(summary.updated).toBe(2);
  });

  it('指定 targetFilter 时应只同步对应目标', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    const summary = await syncAllResources(
      [skill],
      config,
      'skills',
      'codebuddy',
    );

    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('codebuddy');
  });
});

describe('syncProjectResources（项目级同步）', () => {
  it('首次项目级同步应创建 .<targetName>/skills/<name>/ 目录', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    const summary = await syncProjectResources(
      [skill],
      config,
      projectDir,
      'skills',
    );

    expect(summary.totalSkills).toBe(1);
    expect(summary.created).toBe(2);

    const codebuddyDir = path.join(projectDir, '.codebuddy/skills/skill-b');
    const claudeDir = path.join(projectDir, '.claude-code/skills/skill-b');

    expect((await fs.stat(codebuddyDir)).isDirectory()).toBe(true);
    expect((await fs.stat(claudeDir)).isDirectory()).toBe(true);
  });

  it('内容未变时项目级同步应跳过', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    await syncProjectResources([skill], config, projectDir, 'skills');
    const summary = await syncProjectResources(
      [skill],
      config,
      projectDir,
      'skills',
    );

    expect(summary.skipped).toBe(2);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('内容变化时项目级同步应更新', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B v1');
    const config = createTestConfig();

    await syncProjectResources([skill], config, projectDir, 'skills');
    await fs.writeFile(path.join(skill.path, 'SKILL.md'), '# Skill B v2', 'utf-8');
    const summary = await syncProjectResources(
      [skill],
      config,
      projectDir,
      'skills',
    );

    expect(summary.updated).toBe(2);
  });

  it('指定 targetFilter 时项目级同步应只同步对应目标', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    const summary = await syncProjectResources(
      [skill],
      config,
      projectDir,
      'skills',
      'claude-code',
    );

    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('claude-code');
  });

  it('仅存在一个工具目录时，应只同步到该工具', async () => {
    const singleToolProjectDir = path.join(tempDir, 'single-tool-project');
    await fs.mkdir(singleToolProjectDir, { recursive: true });
    await fs.mkdir(path.join(singleToolProjectDir, '.codebuddy'), {
      recursive: true,
    });
    /* 注意：不创建 .claude-code 目录 */

    const skill = await createMockSkill(sourceDir, 'skill-d', '# Skill D');
    const config = createTestConfig();

    const summary = await syncProjectResources(
      [skill],
      config,
      singleToolProjectDir,
      'skills',
    );

    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('codebuddy');

    /* 验证 .claude-code/skills/skill-d 不应存在 */
    const claudeSkillDir = path.join(
      singleToolProjectDir,
      '.claude-code/skills/skill-d',
    );
    await expect(fs.access(claudeSkillDir)).rejects.toThrow();

    /* 验证 .codebuddy/skills/skill-d 应存在 */
    const codebuddySkillDir = path.join(
      singleToolProjectDir,
      '.codebuddy/skills/skill-d',
    );
    expect((await fs.stat(codebuddySkillDir)).isDirectory()).toBe(true);
  });
});

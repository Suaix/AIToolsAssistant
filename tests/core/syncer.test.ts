/**
 * 同步引擎模块 (src/core/syncer.ts) 单元测试
 * 覆盖场景：用户级同步、项目级同步、hash 对比、目录创建
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { syncAllSkills, syncProjectSkills, PROJECT_TARGET_PATHS } from '../../src/core/syncer.js';
import type { Config, SkillInfo } from '../../src/types/index.js';

/** 测试用的临时目录 */
let tempDir: string;
/** 模拟的源目录 */
let sourceDir: string;
/** 模拟的用户级目标目录 */
let userTargetDir: string;
/** 模拟的项目目录 */
let projectDir: string;

/**
 * 创建模拟 Skill 目录
 * @param basePath 基础路径
 * @param skillName Skill 文件夹名
 * @param content SKILL.md 的内容
 */
async function createMockSkill(
  basePath: string,
  skillName: string,
  content: string,
): Promise<SkillInfo> {
  const skillPath = path.join(basePath, skillName);
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, 'SKILL.md'), content, 'utf-8');

  return {
    name: skillName,
    description: '-',
    path: skillPath,
    dirName: skillName,
  };
}

beforeEach(async () => {
  /* 创建临时测试环境 */
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-syncer-test-'));
  sourceDir = path.join(tempDir, 'source');
  userTargetDir = path.join(tempDir, 'user-target');
  projectDir = path.join(tempDir, 'my-project');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(userTargetDir, { recursive: true });
  await fs.mkdir(projectDir, { recursive: true });
  /* 为项目目录创建工具根目录，确保 detectProjectTools() 能检测到 */
  await fs.mkdir(path.join(projectDir, '.codebuddy'), { recursive: true });
  await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * 创建测试用的全局配置对象
 */
function createTestConfig(): Config {
  return {
    source: sourceDir,
    targets: [
      {
        name: 'codebuddy',
        enabled: true,
        user_path: path.join(userTargetDir, 'codebuddy'),
      },
      {
        name: 'claude-code',
        enabled: true,
        user_path: path.join(userTargetDir, 'claude-code'),
      },
    ],
    sync: {
      default_scope: 'user',
      clean: false,
    },
  };
}

describe('PROJECT_TARGET_PATHS', () => {
  it('应包含 codebuddy 和 claude-code 的映射', () => {
    expect(PROJECT_TARGET_PATHS).toHaveProperty('codebuddy', '.codebuddy/skills');
    expect(PROJECT_TARGET_PATHS).toHaveProperty('claude-code', '.claude/skills');
  });
});

describe('syncAllSkills（用户级同步）', () => {
  it('首次同步应返回 created 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    const summary = await syncAllSkills([skill], config);

    expect(summary.totalSkills).toBe(1);
    expect(summary.created).toBe(2); /* 两个目标都是新增 */
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(0);
  });

  it('内容未变时应返回 skipped 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    /* 首次同步 */
    await syncAllSkills([skill], config);
    /* 二次同步 */
    const summary = await syncAllSkills([skill], config);

    expect(summary.skipped).toBe(2); /* 两个目标都跳过 */
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('内容变化时应返回 updated 状态', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A v1');
    const config = createTestConfig();

    /* 首次同步 */
    await syncAllSkills([skill], config);

    /* 修改源文件内容 */
    await fs.writeFile(path.join(skill.path, 'SKILL.md'), '# Skill A v2', 'utf-8');

    /* 二次同步 */
    const summary = await syncAllSkills([skill], config);

    expect(summary.updated).toBe(2); /* 两个目标都更新 */
  });

  it('指定 targetFilter 时应只同步对应目标', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-a', '# Skill A');
    const config = createTestConfig();

    const summary = await syncAllSkills([skill], config, 'codebuddy');

    expect(summary.created).toBe(1); /* 只有一个目标 */
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('codebuddy');
  });
});

describe('syncProjectSkills（项目级同步）', () => {
  it('首次项目级同步应创建项目级目录并返回 created', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    const summary = await syncProjectSkills([skill], config, projectDir);

    expect(summary.totalSkills).toBe(1);
    expect(summary.created).toBe(2);

    /* 验证项目级目录已创建 */
    const codebuddyDir = path.join(projectDir, '.codebuddy/skills/skill-b');
    const claudeDir = path.join(projectDir, '.claude/skills/skill-b');

    const codebuddyStat = await fs.stat(codebuddyDir);
    const claudeStat = await fs.stat(claudeDir);

    expect(codebuddyStat.isDirectory()).toBe(true);
    expect(claudeStat.isDirectory()).toBe(true);
  });

  it('内容未变时项目级同步应跳过', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    /* 首次同步 */
    await syncProjectSkills([skill], config, projectDir);
    /* 二次同步 */
    const summary = await syncProjectSkills([skill], config, projectDir);

    expect(summary.skipped).toBe(2);
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
  });

  it('内容变化时项目级同步应更新', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B v1');
    const config = createTestConfig();

    /* 首次同步 */
    await syncProjectSkills([skill], config, projectDir);

    /* 修改源文件内容 */
    await fs.writeFile(path.join(skill.path, 'SKILL.md'), '# Skill B v2', 'utf-8');

    /* 二次同步 */
    const summary = await syncProjectSkills([skill], config, projectDir);

    expect(summary.updated).toBe(2);
  });

  it('指定 targetFilter 时项目级同步应只同步对应目标', async () => {
    const skill = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const config = createTestConfig();

    const summary = await syncProjectSkills([skill], config, projectDir, 'claude-code');

    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('claude-code');
  });

  it('多个 Skills 同时项目级同步', async () => {
    const skillB = await createMockSkill(sourceDir, 'skill-b', '# Skill B');
    const skillC = await createMockSkill(sourceDir, 'skill-c', '# Skill C');
    const config = createTestConfig();

    const summary = await syncProjectSkills([skillB, skillC], config, projectDir);

    expect(summary.totalSkills).toBe(2);
    expect(summary.created).toBe(4); /* 2 Skills × 2 目标 */
  });

  it('仅存在一个工具目录时，应只同步到该工具', async () => {
    /* 创建只有 .codebuddy 的项目目录 */
    const singleToolProjectDir = path.join(tempDir, 'single-tool-project');
    await fs.mkdir(singleToolProjectDir, { recursive: true });
    await fs.mkdir(path.join(singleToolProjectDir, '.codebuddy'), { recursive: true });
    /* 注意：不创建 .claude 目录 */

    const skill = await createMockSkill(sourceDir, 'skill-d', '# Skill D');
    const config = createTestConfig();

    const summary = await syncProjectSkills([skill], config, singleToolProjectDir);

    /* 应该只同步到 codebuddy（1 个目标），不同步到 claude-code */
    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('codebuddy');

    /* 验证 .claude/skills/skill-d 不应存在 */
    const claudeSkillDir = path.join(singleToolProjectDir, '.claude/skills/skill-d');
    await expect(fs.access(claudeSkillDir)).rejects.toThrow();

    /* 验证 .codebuddy/skills/skill-d 应存在 */
    const codebuddySkillDir = path.join(singleToolProjectDir, '.codebuddy/skills/skill-d');
    const stat = await fs.stat(codebuddySkillDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

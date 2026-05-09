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
  await fs.mkdir(path.join(projectDir, '.claude-internal'), { recursive: true });
  /* FEAT-005 US-6：预创建用户级 AI 工具家目录，模拟"用户已安装"场景 */
  await fs.mkdir(path.join(userTargetDir, 'codebuddy'), { recursive: true });
  await fs.mkdir(path.join(userTargetDir, 'claude-internal'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * 创建测试用的全局配置对象（v0.4.0：含 user_subscriptions 字段）
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
        name: 'claude-internal',
        enabled: true,
        user_base: path.join(userTargetDir, 'claude-internal'),
      },
    ],
    sync: {
      default_scope: 'user',
      clean: false,
    },
    /* v0.4.0 新增：空订阅清单（本测试文件聚焦同步引擎，不依赖订阅路由） */
    user_subscriptions: {
      skills: [],
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
    expect(getProjectTargetDir('/work/proj', 'claude-internal', 'agents')).toBe(
      '/work/proj/.claude-internal/agents',
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
    const claudeDir = path.join(projectDir, '.claude-internal/skills/skill-b');

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
      'claude-internal',
    );

    expect(summary.created).toBe(1);
    expect(summary.results[0].targetResults).toHaveLength(1);
    expect(summary.results[0].targetResults[0].targetName).toBe('claude-internal');
  });

  it('仅存在一个工具目录时，应只同步到该工具', async () => {
    const singleToolProjectDir = path.join(tempDir, 'single-tool-project');
    await fs.mkdir(singleToolProjectDir, { recursive: true });
    await fs.mkdir(path.join(singleToolProjectDir, '.codebuddy'), {
      recursive: true,
    });
    /* 注意：不创建 .claude-internal 目录 */

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

    /* 验证 .claude-internal/skills/skill-d 不应存在 */
    const claudeSkillDir = path.join(
      singleToolProjectDir,
      '.claude-internal/skills/skill-d',
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

/* ============================================================
 * v0.4.0 PR-3：任务驱动引擎 syncTasks
 * ============================================================ */

import { syncTasks, type TaskProgressEvent } from '../../src/core/syncer.js';
import type { ExpandedTask } from '../../src/core/subscriptions.js';
import type { Target } from '../../src/types/index.js';

describe('syncTasks（v0.4 任务驱动引擎）', () => {
  /**
   * 构造一个 ExpandedTask：源 skill 已创建 + 推导 targetPath
   */
  async function makeTask(
    skillName: string,
    targetBaseDir: string,
    targetName: string,
    location: ExpandedTask['location'],
  ): Promise<ExpandedTask> {
    const skill = await createMockSkill(sourceDir, skillName, `# ${skillName}`);
    const target: Target = {
      name: targetName,
      enabled: true,
      user_base: targetBaseDir,
    };
    return {
      type: 'skills',
      resource: skill,
      location,
      target,
      /* 目标绝对路径：<targetBaseDir>/skills/<dirName>/ —— 测试里简化为 <targetBaseDir>/<dirName>/，
         syncTasks 取 path.dirname(targetPath) 作为 base */
      targetPath: path.join(targetBaseDir, skillName),
    };
  }

  it('空任务列表返回全零 summary', async () => {
    const summary = await syncTasks([]);
    expect(summary).toEqual({
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      skippedMissingTool: 0,
      failed: 0,
    });
  });

  it('首次同步产生 created 动作', async () => {
    const targetBase = path.join(userTargetDir, 'codebuddy');
    const task = await makeTask('skill-a', targetBase, 'codebuddy', {
      scope: 'user',
    });

    const summary = await syncTasks([task]);

    expect(summary.total).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.skipped).toBe(0);
    /* 目标文件真实存在 */
    const target = path.join(targetBase, 'skill-a', 'SKILL.md');
    expect((await fs.stat(target)).isFile()).toBe(true);
  });

  it('源未变时第二次同步应为 skipped', async () => {
    const targetBase = path.join(userTargetDir, 'codebuddy');
    const task = await makeTask('skill-b', targetBase, 'codebuddy', {
      scope: 'user',
    });

    await syncTasks([task]);
    const summary2 = await syncTasks([task]);

    expect(summary2.skipped).toBe(1);
    expect(summary2.created).toBe(0);
  });

  it('源变更后第二次同步应为 updated', async () => {
    const targetBase = path.join(userTargetDir, 'codebuddy');
    const task = await makeTask('skill-c', targetBase, 'codebuddy', {
      scope: 'user',
    });

    await syncTasks([task]);
    /* 改动源 */
    await fs.writeFile(path.join(task.resource.path, 'SKILL.md'), '# v2');
    const summary2 = await syncTasks([task]);

    expect(summary2.updated).toBe(1);
  });

  it('onProgress 按顺序触发，index/total 正确', async () => {
    const targetBase = path.join(userTargetDir, 'codebuddy');
    const task1 = await makeTask('skill-d', targetBase, 'codebuddy', {
      scope: 'user',
    });
    const task2 = await makeTask('skill-e', targetBase, 'codebuddy', {
      scope: 'user',
    });

    const events: TaskProgressEvent[] = [];
    await syncTasks([task1, task2], (ev) => events.push(ev));

    expect(events).toHaveLength(2);
    expect(events[0].index).toBe(1);
    expect(events[0].total).toBe(2);
    expect(events[1].index).toBe(2);
    expect(events[1].total).toBe(2);
    expect(events[0].task.resource.dirName).toBe('skill-d');
    expect(events[1].task.resource.dirName).toBe('skill-e');
  });

  it('project 落点的任务携带 projectDir 信息', async () => {
    const targetBase = path.join(projectDir, '.codebuddy', 'skills');
    /* 手工构造：syncTasks 取 dirname(targetPath) 作 base，所以先确保目标结构 */
    const skill = await createMockSkill(sourceDir, 'skill-p', '# p');
    const task: ExpandedTask = {
      type: 'skills',
      resource: skill,
      location: { scope: 'project', projectDir },
      target: {
        name: 'codebuddy',
        enabled: true,
        user_base: path.join(userTargetDir, 'codebuddy'),
      },
      targetPath: path.join(targetBase, 'skill-p'),
    };

    const events: TaskProgressEvent[] = [];
    const summary = await syncTasks([task], (ev) => events.push(ev));

    expect(summary.created).toBe(1);
    expect(events[0].task.location.scope).toBe('project');
    expect(events[0].task.location.projectDir).toBe(projectDir);
    /* 目标文件落到项目级目录 */
    expect(
      (await fs.stat(path.join(targetBase, 'skill-p', 'SKILL.md'))).isFile(),
    ).toBe(true);
  });
});

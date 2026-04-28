/**
 * 订阅展开模块 (src/core/subscriptions.ts) 单元测试
 * v0.4.0 PR-2：覆盖 expandSubscriptions 的核心展开算法、孤儿检测、过滤器
 *
 * 注意：本模块是纯计算模块，不依赖文件系统。所有输入都以对象字面量构造。
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  expandSubscriptions,
  resolveTargetPath,
  getUserSubsForType,
  getProjectSubsForType,
  type SubscriptionLocation,
} from '../../src/core/subscriptions.js';
import type {
  Config,
  ProjectConfig,
  ResourceInfo,
  Target,
} from '../../src/types/index.js';

/* ============================================================
 * 测试夹具
 * ============================================================ */

/**
 * 构造一个 skills 类型的 ResourceInfo（最小字段集）
 */
function makeResource(dirName: string): ResourceInfo {
  return {
    name: dirName,
    description: '-',
    path: `/fake/source/skills/${dirName}`,
    dirName,
    /* PR-2 过渡占位；展开模块不依赖此字段 */
    scope: 'user',
    type: 'skills',
  };
}

/** 标准测试 target 集合（codebuddy 启用 + claude-code 启用） */
function makeTargets(): Target[] {
  return [
    { name: 'codebuddy', enabled: true, user_base: '/home/u/.codebuddy' },
    { name: 'claude-code', enabled: true, user_base: '/home/u/.claude' },
  ];
}

/* ============================================================
 * resolveTargetPath
 * ============================================================ */

describe('resolveTargetPath', () => {
  const targets = makeTargets();
  const resource = makeResource('brand-guidelines');

  it('user scope → <user_base>/skills/<dirName>/', () => {
    const location: SubscriptionLocation = { scope: 'user' };
    const p = resolveTargetPath('skills', resource, location, targets[0]);
    expect(p).toBe('/home/u/.codebuddy/skills/brand-guidelines');
  });

  it('project scope → <projectDir>/.<target>/skills/<dirName>/', () => {
    const location: SubscriptionLocation = {
      scope: 'project',
      projectDir: '/home/u/workspace/my-app',
    };
    const p = resolveTargetPath('skills', resource, location, targets[1]);
    expect(p).toBe('/home/u/workspace/my-app/.claude-code/skills/brand-guidelines');
  });

  it('project scope 缺 projectDir → 抛错（避免静默错误）', () => {
    const location: SubscriptionLocation = { scope: 'project' };
    expect(() =>
      resolveTargetPath('skills', resource, location, targets[0]),
    ).toThrow(/projectDir/);
  });

  it('user_base 含 ~ 会被展开（依赖 config.manager.expandTilde）', () => {
    const tildeTarget: Target = {
      name: 'codebuddy',
      enabled: true,
      user_base: '~/.codebuddy',
    };
    const location: SubscriptionLocation = { scope: 'user' };
    const p = resolveTargetPath('skills', resource, location, tildeTarget);
    /* 展开后应是绝对路径（以 / 开头）；不再包含 ~ */
    expect(p.startsWith('/')).toBe(true);
    expect(p).not.toContain('~');
    expect(p.endsWith('/.codebuddy/skills/brand-guidelines')).toBe(true);
  });
});

/* ============================================================
 * expandSubscriptions
 * ============================================================ */

describe('expandSubscriptions', () => {
  const resources = [
    makeResource('brand-guidelines'),
    makeResource('tdd-workflow'),
    makeResource('frontend-design'),
  ];

  it('user 订阅展开为「每个资源 × 每个启用 target」', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines', 'tdd-workflow'],
      projectContext: null,
    });

    /* 2 个订阅 × 2 个 target = 4 个 task */
    expect(result.tasks).toHaveLength(4);
    /* 2 个订阅位置（按资源 × 落点聚合） */
    expect(result.subscriptions).toHaveLength(2);
    /* 每个订阅位置内有 2 个 target 任务 */
    expect(result.subscriptions[0].tasks).toHaveLength(2);
    /* 无孤儿 */
    expect(result.orphanNames).toEqual([]);
  });

  it('project 订阅在提供 projectContext 后正常展开', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: [],
      projectContext: {
        projectDir: '/home/u/work/my-app',
        subscriptions: ['brand-guidelines'],
      },
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0].location).toEqual({
      scope: 'project',
      projectDir: '/home/u/work/my-app',
    });
    expect(result.tasks[0].targetPath).toContain('/.codebuddy/skills/brand-guidelines');
  });

  it('user + project 同时订阅同一个资源 → 展开为 2 个落点', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines'],
      projectContext: {
        projectDir: '/home/u/work/my-app',
        subscriptions: ['brand-guidelines'],
      },
    });

    expect(result.subscriptions).toHaveLength(2);
    const scopes = result.subscriptions.map((s) => s.location.scope).sort();
    expect(scopes).toEqual(['project', 'user']);
    /* 2 个落点 × 2 个 target = 4 个 task */
    expect(result.tasks).toHaveLength(4);
  });

  it('孤儿订阅（订阅但源里没有）→ 收集到 orphanNames，不抛错', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines', 'ghost-skill'],
      projectContext: null,
    });

    expect(result.orphanNames).toEqual(['ghost-skill']);
    /* 只有 brand-guidelines 展开 */
    expect(result.tasks).toHaveLength(2);
  });

  it('user 和 project 同一个孤儿 → 只收集一次', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['ghost'],
      projectContext: {
        projectDir: '/home/u/work/my-app',
        subscriptions: ['ghost'],
      },
    });

    expect(result.orphanNames).toEqual(['ghost']);
    expect(result.tasks).toHaveLength(0);
  });

  it('targetFilter 只保留指定 target', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines'],
      projectContext: null,
      targetFilter: 'claude-code',
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].target.name).toBe('claude-code');
  });

  it('scopeFilter=user 跳过 project 落点', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines'],
      projectContext: {
        projectDir: '/home/u/work/my-app',
        subscriptions: ['tdd-workflow'],
      },
      scopeFilter: 'user',
    });

    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0].location.scope).toBe('user');
  });

  it('scopeFilter=project 跳过 user 落点', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines'],
      projectContext: {
        projectDir: '/home/u/work/my-app',
        subscriptions: ['tdd-workflow'],
      },
      scopeFilter: 'project',
    });

    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0].location.scope).toBe('project');
  });

  it('没有启用的 target 时返回空任务列表', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: [],
      userSubscriptions: ['brand-guidelines'],
      projectContext: null,
    });

    expect(result.tasks).toEqual([]);
    /* 没有任何 target，subscriptions 也为空（订阅展开至少要有一个 target 落点才有意义） */
    expect(result.subscriptions).toEqual([]);
  });

  it('targetPath 正确拼接（user scope）', () => {
    const result = expandSubscriptions({
      type: 'skills',
      resourceDirName: 'skills',
      resources,
      enabledTargets: makeTargets(),
      userSubscriptions: ['brand-guidelines'],
      projectContext: null,
    });
    const codebuddyTask = result.tasks.find(
      (t) => t.target.name === 'codebuddy',
    );
    expect(codebuddyTask?.targetPath).toBe(
      path.join('/home/u/.codebuddy/skills/brand-guidelines'),
    );
  });
});

/* ============================================================
 * getUserSubsForType / getProjectSubsForType
 * ============================================================ */

describe('getUserSubsForType', () => {
  const cfg: Config = {
    source: '~/.aitools',
    targets: makeTargets(),
    sync: { default_scope: 'user', clean: false },
    user_subscriptions: {
      skills: ['s1', 's2'],
      commands: ['c1'],
    },
  };

  it('读取 skills 订阅', () => {
    expect(getUserSubsForType(cfg, 'skills')).toEqual(['s1', 's2']);
  });

  it('读取 commands 订阅', () => {
    expect(getUserSubsForType(cfg, 'commands')).toEqual(['c1']);
  });

  it('缺失类型返回空数组', () => {
    expect(getUserSubsForType(cfg, 'agents')).toEqual([]);
    expect(getUserSubsForType(cfg, 'rules')).toEqual([]);
  });
});

describe('getProjectSubsForType', () => {
  it('projectConfig 为 null 时返回空数组', () => {
    expect(getProjectSubsForType(null, 'skills')).toEqual([]);
  });

  it('读取指定类型订阅', () => {
    const proj: ProjectConfig = {
      skills: ['p1', 'p2'],
      commands: ['cp'],
    };
    expect(getProjectSubsForType(proj, 'skills')).toEqual(['p1', 'p2']);
    expect(getProjectSubsForType(proj, 'commands')).toEqual(['cp']);
    expect(getProjectSubsForType(proj, 'agents')).toEqual([]);
  });
});

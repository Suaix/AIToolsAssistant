/**
 * 资源状态计算模块 (src/core/status.ts) 单元测试
 * v0.4.0 PR-5
 *
 * 覆盖：
 * - 首次同步前目标不存在 → not_synced
 * - 已同步 → synced
 * - 源变更 → changed
 * - 未订阅资源 subscriptions 为空数组（保留在 views 中）
 * - splitBySubscribed / countUnsynced 辅助函数
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  buildResourceViews,
  splitBySubscribed,
  countUnsynced,
} from '../../src/core/status.js';
import type {
  ResourceInfo,
  ResourceView,
  Target,
} from '../../src/types/index.js';

let tempDir: string;
let sourceDir: string;
let targetDir: string;

/**
 * 创建扁平 source/skills/<name>/SKILL.md 并返回 ResourceInfo
 */
async function mkSkill(name: string, content: string): Promise<ResourceInfo> {
  const dir = path.join(sourceDir, 'skills', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf-8');
  return {
    name,
    description: '-',
    path: dir,
    dirName: name,
    scope: 'user',
    type: 'skills',
  };
}

function mkTarget(): Target {
  return {
    name: 'codebuddy',
    enabled: true,
    user_base: targetDir,
  };
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-status-test-'));
  sourceDir = path.join(tempDir, 'source');
  targetDir = path.join(tempDir, 'user-base');
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(targetDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('buildResourceViews', () => {
  it('无订阅时：所有资源 subscriptions 都为空数组', async () => {
    const a = await mkSkill('alpha', '# a');
    const b = await mkSkill('beta', '# b');

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a, b],
      enabledTargets: [mkTarget()],
      userSubscriptions: [],
      projectContext: null,
    });

    expect(views).toHaveLength(2);
    expect(views[0].subscriptions).toEqual([]);
    expect(views[1].subscriptions).toEqual([]);
  });

  it('订阅到 user：目标未同步时 status=not_synced', async () => {
    const a = await mkSkill('alpha', '# a');

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a],
      enabledTargets: [mkTarget()],
      userSubscriptions: ['alpha'],
      projectContext: null,
    });

    expect(views[0].subscriptions).toHaveLength(1);
    expect(views[0].subscriptions[0].scope).toBe('user');
    expect(views[0].subscriptions[0].targets[0].status).toBe('not_synced');
  });

  it('目标已同步（hash 一致）→ status=synced', async () => {
    const a = await mkSkill('alpha', '# a');
    /* 制造 synced 目标：把源原样复制过去 */
    const targetPath = path.join(targetDir, 'skills', 'alpha');
    await fs.mkdir(targetPath, { recursive: true });
    await fs.copyFile(
      path.join(a.path, 'SKILL.md'),
      path.join(targetPath, 'SKILL.md'),
    );

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a],
      enabledTargets: [mkTarget()],
      userSubscriptions: ['alpha'],
      projectContext: null,
    });

    expect(views[0].subscriptions[0].targets[0].status).toBe('synced');
  });

  it('目标存在但内容不同 → status=changed', async () => {
    const a = await mkSkill('alpha', '# a v1');
    const targetPath = path.join(targetDir, 'skills', 'alpha');
    await fs.mkdir(targetPath, { recursive: true });
    /* 目标里写不同的内容 */
    await fs.writeFile(path.join(targetPath, 'SKILL.md'), '# a v2', 'utf-8');

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a],
      enabledTargets: [mkTarget()],
      userSubscriptions: ['alpha'],
      projectContext: null,
    });

    expect(views[0].subscriptions[0].targets[0].status).toBe('changed');
  });

  it('同一资源同时订阅 user + project → subscriptions 数组有 2 条', async () => {
    const a = await mkSkill('alpha', '# a');
    const projectDir = path.join(tempDir, 'my-app');
    await fs.mkdir(projectDir, { recursive: true });

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a],
      enabledTargets: [mkTarget()],
      userSubscriptions: ['alpha'],
      projectContext: { projectDir, subscriptions: ['alpha'] },
    });

    expect(views[0].subscriptions).toHaveLength(2);
    const scopes = views[0].subscriptions.map((s) => s.scope).sort();
    expect(scopes).toEqual(['project', 'user']);
  });

  it('孤儿订阅被收集到 orphanNames，不影响 views', async () => {
    const a = await mkSkill('alpha', '# a');

    const { views, orphanNames } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [a],
      enabledTargets: [mkTarget()],
      userSubscriptions: ['alpha', 'ghost'],
      projectContext: null,
    });

    expect(views).toHaveLength(1); /* 只有 alpha，ghost 不在源里 */
    expect(orphanNames).toEqual(['ghost']);
  });

  it('views 按 dirName 字母序排序', async () => {
    await mkSkill('zebra', '# z');
    await mkSkill('apple', '# a');
    await mkSkill('mango', '# m');

    const { views } = await buildResourceViews({
      type: 'skills',
      resourceDirName: 'skills',
      resources: [
        {
          name: 'zebra',
          description: '-',
          path: path.join(sourceDir, 'skills', 'zebra'),
          dirName: 'zebra',
          scope: 'user',
          type: 'skills',
        },
        {
          name: 'apple',
          description: '-',
          path: path.join(sourceDir, 'skills', 'apple'),
          dirName: 'apple',
          scope: 'user',
          type: 'skills',
        },
        {
          name: 'mango',
          description: '-',
          path: path.join(sourceDir, 'skills', 'mango'),
          dirName: 'mango',
          scope: 'user',
          type: 'skills',
        },
      ],
      enabledTargets: [mkTarget()],
      userSubscriptions: [],
      projectContext: null,
    });

    expect(views.map((v) => v.dirName)).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('splitBySubscribed', () => {
  function mkView(dirName: string, subscribed: boolean): ResourceView {
    return {
      name: dirName,
      dirName,
      description: '-',
      type: 'skills',
      path: '/x',
      sourceHash: 'h',
      subscriptions: subscribed
        ? [{ scope: 'user', targets: [] }]
        : [],
    };
  }

  it('按 subscriptions 是否为空切分', () => {
    const views = [mkView('a', true), mkView('b', false), mkView('c', true)];
    const { subscribed, unsubscribed } = splitBySubscribed(views);
    expect(subscribed.map((v) => v.dirName)).toEqual(['a', 'c']);
    expect(unsubscribed.map((v) => v.dirName)).toEqual(['b']);
  });
});

describe('countUnsynced', () => {
  function mkViewWithStatus(
    statuses: Array<'synced' | 'changed' | 'not_synced'>,
  ): ResourceView {
    return {
      name: 'x',
      dirName: 'x',
      description: '-',
      type: 'skills',
      path: '/x',
      sourceHash: 'h',
      subscriptions: [
        {
          scope: 'user',
          targets: statuses.map((s) => ({
            target: 'codebuddy',
            status: s,
            targetPath: '/t',
          })),
        },
      ],
    };
  }

  it('所有 target 都 synced → 不计数', () => {
    const views = [mkViewWithStatus(['synced', 'synced'])];
    expect(countUnsynced(views)).toBe(0);
  });

  it('任一 target 非 synced → 计数 1', () => {
    const views = [mkViewWithStatus(['synced', 'changed'])];
    expect(countUnsynced(views)).toBe(1);
  });

  it('同一资源多次 non-synced 只计一次', () => {
    const views = [mkViewWithStatus(['not_synced', 'changed', 'not_synced'])];
    expect(countUnsynced(views)).toBe(1);
  });

  it('空 subscriptions 不计数（未订阅资源不参与）', () => {
    const v: ResourceView = {
      name: 'x',
      dirName: 'x',
      description: '-',
      type: 'skills',
      path: '/x',
      sourceHash: 'h',
      subscriptions: [],
    };
    expect(countUnsynced([v])).toBe(0);
  });
});

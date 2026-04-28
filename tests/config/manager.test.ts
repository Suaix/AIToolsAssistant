/**
 * 全局配置管理模块 (src/config/manager.ts) 单元测试
 * v0.4.0 PR-1：覆盖 user_subscriptions 字段的加载、规范化、辅助函数
 *
 * 注意：loadConfig / saveConfig 读写的是 ~/.aitools/config.yaml（真实用户路径）。
 * 为避免污染开发机，本测试通过临时替换 os.homedir 来重定向到临时目录。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  loadConfig,
  saveConfig,
  createConfig,
  getUserSubscriptionList,
  addUserSubscription,
  removeUserSubscription,
  getConfigPath,
} from '../../src/config/manager.js';
import type { Config, Target } from '../../src/types/index.js';

/** 测试用临时主目录（会被 os.homedir spy 替换） */
let fakeHome: string;

beforeEach(async () => {
  /* 为每个用例开新临时目录，避免互相干扰 */
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-manager-test-'));
  /* 拦截 os.homedir()，让 ~/.aitools 指向临时目录 */
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(fakeHome, { recursive: true, force: true });
});

/**
 * 构造一个完整合法的 v0.4 Target 数组
 */
function makeTargets(): Target[] {
  return [
    { name: 'codebuddy', enabled: true, user_base: '~/.codebuddy' },
    { name: 'claude-code', enabled: false, user_base: '~/.claude' },
  ];
}

/* ============================================================
 * createConfig
 * ============================================================ */

describe('createConfig', () => {
  it('默认生成的配置应含空的 user_subscriptions.skills', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    expect(cfg.user_subscriptions).toBeDefined();
    expect(cfg.user_subscriptions.skills).toEqual([]);
    /* 可选字段不应自动填充，保持 YAML 简洁 */
    expect(cfg.user_subscriptions.commands).toBeUndefined();
    expect(cfg.user_subscriptions.agents).toBeUndefined();
    expect(cfg.user_subscriptions.rules).toBeUndefined();
  });

  it('保留 source 与 targets 参数原样写入', () => {
    const targets = makeTargets();
    const cfg = createConfig('/custom/source', targets);
    expect(cfg.source).toBe('/custom/source');
    expect(cfg.targets).toBe(targets);
  });
});

/* ============================================================
 * saveConfig + loadConfig 回环
 * ============================================================ */

describe('saveConfig / loadConfig', () => {
  it('保存后再加载，user_subscriptions 字段来回一致', async () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'skills', 'brand-guidelines');
    addUserSubscription(cfg, 'skills', 'tdd-workflow');
    addUserSubscription(cfg, 'commands', 'deploy');

    await saveConfig(cfg);

    const loaded = await loadConfig();
    expect(loaded).not.toBeNull();
    expect(loaded!.user_subscriptions.skills).toEqual([
      'brand-guidelines',
      'tdd-workflow',
    ]);
    expect(loaded!.user_subscriptions.commands).toEqual(['deploy']);
  });

  it('YAML 中 user_subscriptions 为 null 时，加载后降级为空 skills', async () => {
    /* 手工写入一个 user_subscriptions 为 null 的 YAML，模拟用户随手填写 */
    await fs.mkdir(path.join(fakeHome, '.aitools'), { recursive: true });
    await fs.writeFile(
      getConfigPath(),
      [
        'source: ~/.aitools',
        'targets:',
        '  - name: codebuddy',
        '    enabled: true',
        '    user_base: ~/.codebuddy',
        'sync:',
        '  default_scope: user',
        '  clean: false',
        'user_subscriptions:',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadConfig();
    expect(loaded).not.toBeNull();
    expect(loaded!.user_subscriptions.skills).toEqual([]);
  });

  it('缺少 user_subscriptions 字段的旧配置 → 报错返回 null', async () => {
    /* v0.3 时期的合法配置：缺 user_subscriptions */
    await fs.mkdir(path.join(fakeHome, '.aitools'), { recursive: true });
    await fs.writeFile(
      getConfigPath(),
      [
        'source: ~/.aitools',
        'targets:',
        '  - name: codebuddy',
        '    enabled: true',
        '    user_base: ~/.codebuddy',
        'sync:',
        '  default_scope: user',
        '  clean: false',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadConfig();
    /* 校验失败通过 logger 报错后返回 null；不应抛异常污染用例 */
    expect(loaded).toBeNull();
  });

  it('过滤非字符串/空串元素', async () => {
    await fs.mkdir(path.join(fakeHome, '.aitools'), { recursive: true });
    await fs.writeFile(
      getConfigPath(),
      [
        'source: ~/.aitools',
        'targets:',
        '  - name: codebuddy',
        '    enabled: true',
        '    user_base: ~/.codebuddy',
        'sync:',
        '  default_scope: user',
        '  clean: false',
        'user_subscriptions:',
        '  skills:',
        '    - valid-a',
        '    - ""',
        '    - 123',
        '    - valid-b',
      ].join('\n'),
      'utf-8',
    );

    const loaded = await loadConfig();
    expect(loaded).not.toBeNull();
    expect(loaded!.user_subscriptions.skills).toEqual(['valid-a', 'valid-b']);
  });
});

/* ============================================================
 * getUserSubscriptionList
 * ============================================================ */

describe('getUserSubscriptionList', () => {
  it('读取各资源类型的订阅列表', () => {
    const cfg: Config = {
      source: '~/.aitools',
      targets: makeTargets(),
      sync: { default_scope: 'user', clean: false },
      user_subscriptions: {
        skills: ['s1', 's2'],
        commands: ['c1'],
        agents: ['a1'],
        rules: ['r1'],
      },
    };
    expect(getUserSubscriptionList(cfg, 'skills')).toEqual(['s1', 's2']);
    expect(getUserSubscriptionList(cfg, 'commands')).toEqual(['c1']);
    expect(getUserSubscriptionList(cfg, 'agents')).toEqual(['a1']);
    expect(getUserSubscriptionList(cfg, 'rules')).toEqual(['r1']);
  });

  it('缺失类型字段时返回空数组', () => {
    const cfg: Config = {
      source: '~/.aitools',
      targets: makeTargets(),
      sync: { default_scope: 'user', clean: false },
      user_subscriptions: { skills: [] },
    };
    expect(getUserSubscriptionList(cfg, 'commands')).toEqual([]);
    expect(getUserSubscriptionList(cfg, 'agents')).toEqual([]);
    expect(getUserSubscriptionList(cfg, 'rules')).toEqual([]);
  });
});

/* ============================================================
 * addUserSubscription
 * ============================================================ */

describe('addUserSubscription', () => {
  it('向空列表追加 skills 资源，返回 true', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    const added = addUserSubscription(cfg, 'skills', 'brand-guidelines');
    expect(added).toBe(true);
    expect(cfg.user_subscriptions.skills).toEqual(['brand-guidelines']);
  });

  it('重复订阅返回 false，不重复写入', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'skills', 'brand-guidelines');
    const addedAgain = addUserSubscription(cfg, 'skills', 'brand-guidelines');
    expect(addedAgain).toBe(false);
    expect(cfg.user_subscriptions.skills).toEqual(['brand-guidelines']);
  });

  it('不同资源类型互相独立', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'skills', 's1');
    addUserSubscription(cfg, 'commands', 'c1');
    addUserSubscription(cfg, 'agents', 'a1');
    expect(cfg.user_subscriptions.skills).toEqual(['s1']);
    expect(cfg.user_subscriptions.commands).toEqual(['c1']);
    expect(cfg.user_subscriptions.agents).toEqual(['a1']);
  });
});

/* ============================================================
 * removeUserSubscription
 * ============================================================ */

describe('removeUserSubscription', () => {
  it('移除已存在项返回 true', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'skills', 'foo');
    addUserSubscription(cfg, 'skills', 'bar');

    const removed = removeUserSubscription(cfg, 'skills', 'foo');
    expect(removed).toBe(true);
    expect(cfg.user_subscriptions.skills).toEqual(['bar']);
  });

  it('移除不存在项返回 false，不报错', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    const removed = removeUserSubscription(cfg, 'skills', 'ghost');
    expect(removed).toBe(false);
    expect(cfg.user_subscriptions.skills).toEqual([]);
  });

  it('移除 commands 的最后一项后，字段被 delete 掉（YAML 保持简洁）', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'commands', 'only-one');
    removeUserSubscription(cfg, 'commands', 'only-one');
    expect(cfg.user_subscriptions.commands).toBeUndefined();
  });

  it('移除 skills 最后一项不删字段（skills 是必填字段，保留空数组）', () => {
    const cfg = createConfig('~/.aitools', makeTargets());
    addUserSubscription(cfg, 'skills', 'only-one');
    removeUserSubscription(cfg, 'skills', 'only-one');
    expect(cfg.user_subscriptions.skills).toEqual([]);
  });
});

/**
 * unsubscribe 命令单元测试（v0.4.0 PR-4）
 *
 * 覆盖：
 * - 从用户级取消订阅
 * - 从项目级取消订阅
 * - 幂等：未订阅也不报错
 * - --prune：清理目标侧已同步目录
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { subscribeCommand } from '../../src/commands/subscribe.js';
import { unsubscribeCommand } from '../../src/commands/unsubscribe.js';
import {
  loadConfig,
  saveConfig,
  createConfig,
} from '../../src/config/manager.js';
import { loadProjectConfig, saveProjectConfig } from '../../src/config/project.js';
import { setReporterMode } from '../../src/utils/reporter.js';

let fakeHome: string;
let projectDir: string;
let originalCwd: string;

/**
 * 初始化：源目录 + 指定 skill 清单 + 一个 enabled target
 */
async function setupFakeEnv(skillNames: string[] = []): Promise<void> {
  const skillsRoot = path.join(fakeHome, '.aitools', 'skills');
  for (const name of skillNames) {
    const dir = path.join(skillsRoot, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `# ${name}`, 'utf-8');
  }

  const cfg = createConfig('~/.aitools', [
    {
      name: 'codebuddy',
      enabled: true,
      user_base: path.join(fakeHome, '.codebuddy'),
    },
  ]);
  await saveConfig(cfg);
}

beforeEach(async () => {
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-unsub-test-'));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-unsub-proj-'));
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  originalCwd = process.cwd();
  process.chdir(projectDir);
  setReporterMode('json');
});

afterEach(async () => {
  setReporterMode('human');
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  await fs.rm(fakeHome, { recursive: true, force: true });
  await fs.rm(projectDir, { recursive: true, force: true });
});

/* ============================================================
 * 参数校验
 * ============================================================ */

describe('unsubscribeCommand · 参数校验', () => {
  it('缺参时报错、不改动配置', async () => {
    await setupFakeEnv(['alpha']);
    /* 先订阅一条便于对照 */
    await subscribeCommand('skills', 'alpha', { scope: 'user' });

    await unsubscribeCommand(undefined, undefined, {});

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['alpha']);
  });

  it('未知 type 报错', async () => {
    await setupFakeEnv();
    await unsubscribeCommand('unknown', 'x', {});
    /* 配置依然为空 */
    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });
});

/* ============================================================
 * 用户级取消
 * ============================================================ */

describe('unsubscribeCommand · scope=user', () => {
  it('取消已订阅资源 → 订阅列表移除', async () => {
    await setupFakeEnv(['alpha', 'beta']);
    await subscribeCommand('skills', 'alpha', { scope: 'user' });
    await subscribeCommand('skills', 'beta', { scope: 'user' });

    await unsubscribeCommand('skills', 'alpha', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['beta']);
  });

  it('取消未订阅的资源幂等，不报错', async () => {
    await setupFakeEnv(['alpha']);
    /* 从未订阅 */
    await unsubscribeCommand('skills', 'alpha', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });

  it('取消最后一条 → skills 保留空数组（必填字段）', async () => {
    await setupFakeEnv(['alpha']);
    await subscribeCommand('skills', 'alpha', { scope: 'user' });

    await unsubscribeCommand('skills', 'alpha', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });
});

/* ============================================================
 * 项目级取消
 * ============================================================ */

describe('unsubscribeCommand · scope=project', () => {
  it('项目配置不存在 → 幂等提示，不改动', async () => {
    await setupFakeEnv(['alpha']);
    await unsubscribeCommand('skills', 'alpha', { scope: 'project' });

    const proj = await loadProjectConfig(projectDir);
    expect(proj).toBeNull();
  });

  it('取消已订阅的项目资源', async () => {
    await setupFakeEnv(['alpha']);
    await saveProjectConfig(projectDir, { skills: ['alpha', 'beta'] });

    await unsubscribeCommand('skills', 'alpha', { scope: 'project' });

    const proj = await loadProjectConfig(projectDir);
    expect(proj?.skills).toEqual(['beta']);
  });

  it('取消未订阅的项目资源 → 幂等', async () => {
    await setupFakeEnv(['alpha']);
    await saveProjectConfig(projectDir, { skills: ['beta'] });

    await unsubscribeCommand('skills', 'alpha', { scope: 'project' });

    const proj = await loadProjectConfig(projectDir);
    expect(proj?.skills).toEqual(['beta']);
  });
});

/* ============================================================
 * --prune 清理目标
 * ============================================================ */

describe('unsubscribeCommand · --prune', () => {
  it('用户级 --prune 清理 <user_base>/skills/<name>/', async () => {
    await setupFakeEnv(['alpha']);
    /* 先订阅 + 同步，制造目标文件 */
    await subscribeCommand('skills', 'alpha', { scope: 'user', sync: true });

    const targetDir = path.join(fakeHome, '.codebuddy', 'skills', 'alpha');
    /* 确认同步后目录存在 */
    expect((await fs.stat(targetDir)).isDirectory()).toBe(true);

    await unsubscribeCommand('skills', 'alpha', {
      scope: 'user',
      prune: true,
    });

    /* 目标目录应被删除 */
    await expect(fs.stat(targetDir)).rejects.toThrow();
  });

  it('用户级 --prune 时若目标不存在 → 静默跳过不报错', async () => {
    await setupFakeEnv(['alpha']);
    /* 订阅但不同步 */
    await subscribeCommand('skills', 'alpha', { scope: 'user' });

    await unsubscribeCommand('skills', 'alpha', {
      scope: 'user',
      prune: true,
    });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });

  it('项目级 --prune 清理 <project>/.<target>/skills/<name>/', async () => {
    await setupFakeEnv(['alpha']);
    /* 手工制造项目级目标目录 */
    const targetDir = path.join(projectDir, '.codebuddy', 'skills', 'alpha');
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'SKILL.md'), '# synced', 'utf-8');

    /* 项目订阅清单里先有这一条 */
    await saveProjectConfig(projectDir, { skills: ['alpha'] });

    await unsubscribeCommand('skills', 'alpha', {
      scope: 'project',
      prune: true,
    });

    /* 订阅列表空、目标目录删 */
    const proj = await loadProjectConfig(projectDir);
    expect(proj?.skills).toEqual([]);
    await expect(fs.stat(targetDir)).rejects.toThrow();
  });
});

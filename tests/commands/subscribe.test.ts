/**
 * subscribe 命令单元测试（v0.4.0 PR-4）
 *
 * 覆盖：
 * - 订阅到用户级（写 config.user_subscriptions）
 * - 订阅到项目级（写 project.yaml）
 * - 幂等（重复订阅不报错）
 * - 资源不存在 → 错误退出
 * - JSON 模式下无交互（scope=project 缺项目配置视为取消）
 *
 * 注意：本测试通过 mock os.homedir + process.cwd 模拟真实目录环境
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { subscribeCommand } from '../../src/commands/subscribe.js';
import {
  loadConfig,
  saveConfig,
  createConfig,
} from '../../src/config/manager.js';
import { loadProjectConfig } from '../../src/config/project.js';
import { setReporterMode } from '../../src/utils/reporter.js';

/** 临时主目录，所有 ~/.aitools/* 都落在这里 */
let fakeHome: string;
/** 临时 cwd，作为项目目录 */
let projectDir: string;
/** 原始 cwd，用于 afterEach 恢复 */
let originalCwd: string;

/**
 * 初始化一个最小可用的源目录结构 + config.yaml
 * 为每个用例准备一个空订阅的新鲜 config
 */
async function setupFakeEnv(skillNames: string[] = []): Promise<void> {
  /* 创建 ~/.aitools/skills/<name>/SKILL.md 结构 */
  const skillsRoot = path.join(fakeHome, '.aitools', 'skills');
  for (const name of skillNames) {
    const dir = path.join(skillsRoot, name);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'SKILL.md'), `# ${name}`, 'utf-8');
  }

  /* 写入一个合法的 v0.4 config.yaml */
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
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-sub-test-'));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-sub-proj-'));
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  originalCwd = process.cwd();
  process.chdir(projectDir);
  /* 测试里统一走 JSON 模式：避免 subscribe 的 confirm 交互阻塞 */
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

describe('subscribeCommand · 参数校验', () => {
  it('缺少 type 与 name 参数时报错', async () => {
    await setupFakeEnv();
    await subscribeCommand(undefined, undefined, {});
    /* 配置文件依然不含订阅，说明未执行任何写入 */
    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });

  it('未知 type 报错，不修改配置', async () => {
    await setupFakeEnv(['alpha']);
    await subscribeCommand('unknown-type', 'alpha', {});
    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });
});

/* ============================================================
 * 用户级订阅
 * ============================================================ */

describe('subscribeCommand · scope=user', () => {
  it('订阅已存在资源 → 写入 user_subscriptions.skills', async () => {
    await setupFakeEnv(['alpha', 'beta']);

    await subscribeCommand('skills', 'alpha', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['alpha']);
  });

  it('默认 scope 为 user（不传 scope 时）', async () => {
    await setupFakeEnv(['alpha']);

    await subscribeCommand('skills', 'alpha', {});

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['alpha']);
  });

  it('重复订阅幂等，不重复写入', async () => {
    await setupFakeEnv(['alpha']);

    await subscribeCommand('skills', 'alpha', { scope: 'user' });
    await subscribeCommand('skills', 'alpha', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['alpha']);
  });

  it('多次订阅不同资源 → 累加', async () => {
    await setupFakeEnv(['alpha', 'beta', 'gamma']);

    await subscribeCommand('skills', 'alpha', { scope: 'user' });
    await subscribeCommand('skills', 'beta', { scope: 'user' });
    await subscribeCommand('skills', 'gamma', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('订阅不存在的资源 → 错误退出，不写入', async () => {
    await setupFakeEnv(['alpha']);

    await subscribeCommand('skills', 'ghost', { scope: 'user' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });
});

/* ============================================================
 * 项目级订阅
 * ============================================================ */

describe('subscribeCommand · scope=project', () => {
  it('JSON 模式下项目配置不存在 → 不创建、不订阅', async () => {
    await setupFakeEnv(['alpha']);
    /* JSON 模式已在 beforeEach 设置；subscribe 内部会判定 shouldCreateProjectConfig=false */

    await subscribeCommand('skills', 'alpha', { scope: 'project' });

    /* project.yaml 不存在 */
    const proj = await loadProjectConfig(projectDir);
    expect(proj).toBeNull();
  });

  it('项目配置已存在 → 直接追加订阅', async () => {
    await setupFakeEnv(['alpha']);
    /* 预创建一个空的项目配置 */
    const yamlDir = path.join(projectDir, '.aitools');
    await fs.mkdir(yamlDir, { recursive: true });
    await fs.writeFile(
      path.join(yamlDir, 'project.yaml'),
      'skills: []\n',
      'utf-8',
    );

    await subscribeCommand('skills', 'alpha', { scope: 'project' });

    const proj = await loadProjectConfig(projectDir);
    expect(proj?.skills).toEqual(['alpha']);
  });

  it('幂等：重复订阅到同一项目不重复写入', async () => {
    await setupFakeEnv(['alpha']);
    const yamlDir = path.join(projectDir, '.aitools');
    await fs.mkdir(yamlDir, { recursive: true });
    await fs.writeFile(
      path.join(yamlDir, 'project.yaml'),
      'skills: []\n',
      'utf-8',
    );

    await subscribeCommand('skills', 'alpha', { scope: 'project' });
    await subscribeCommand('skills', 'alpha', { scope: 'project' });

    const proj = await loadProjectConfig(projectDir);
    expect(proj?.skills).toEqual(['alpha']);
  });

  it('项目级订阅不影响用户级订阅', async () => {
    await setupFakeEnv(['alpha']);
    const yamlDir = path.join(projectDir, '.aitools');
    await fs.mkdir(yamlDir, { recursive: true });
    await fs.writeFile(
      path.join(yamlDir, 'project.yaml'),
      'skills: []\n',
      'utf-8',
    );

    await subscribeCommand('skills', 'alpha', { scope: 'project' });

    const cfg = await loadConfig();
    expect(cfg?.user_subscriptions.skills).toEqual([]);
  });
});

/* ============================================================
 * --sync 立即同步
 * ============================================================ */

describe('subscribeCommand · --sync', () => {
  it('用户级订阅 + --sync → 目标目录产生文件', async () => {
    await setupFakeEnv(['alpha']);

    await subscribeCommand('skills', 'alpha', { scope: 'user', sync: true });

    /* 目标：<fakeHome>/.codebuddy/skills/alpha/SKILL.md */
    const targetFile = path.join(
      fakeHome,
      '.codebuddy',
      'skills',
      'alpha',
      'SKILL.md',
    );
    const stat = await fs.stat(targetFile);
    expect(stat.isFile()).toBe(true);
  });
});

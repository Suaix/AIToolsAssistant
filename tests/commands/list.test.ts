/**
 * list 命令单元测试（v0.4.0 PR-5）
 *
 * 覆盖：
 * - JSON 模式：emit list 事件，data 含 ResourceView[]
 * - 未订阅资源出现在结果里（subscriptions 为空）
 * - 订阅后 status 正确反映（synced / changed / not_synced）
 * - 孤儿订阅通过 stderr 提示；不影响 JSON 流
 * - list all：遍历所有已实现类型 + 未实现类型占位
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listCommand } from '../../src/commands/list.js';
import { subscribeCommand } from '../../src/commands/subscribe.js';
import {
  saveConfig,
  createConfig,
  addUserSubscription,
} from '../../src/config/manager.js';
import { setReporterMode } from '../../src/utils/reporter.js';

let fakeHome: string;
let projectDir: string;
let originalCwd: string;
let stdoutChunks: string[];
let originalWrite: typeof process.stdout.write;

/**
 * 初始化：一个合法的 v0.4 config + 源 skills
 */
async function setupEnv(skillNames: string[]): Promise<void> {
  for (const name of skillNames) {
    const dir = path.join(fakeHome, '.aitools', 'skills', name);
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

/**
 * 从 stdout 捕获的内容里提取 JSON 事件数组
 */
function captureJsonEvents(): unknown[] {
  const joined = stdoutChunks.join('');
  return joined
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.trim().endsWith('}'))
    .map((l) => JSON.parse(l));
}

beforeEach(async () => {
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-list-test-'));
  projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-list-proj-'));
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);
  originalCwd = process.cwd();
  process.chdir(projectDir);
  setReporterMode('json');

  /* 拦截 process.stdout.write 收集 JSON 事件 */
  stdoutChunks = [];
  originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
});

afterEach(async () => {
  process.stdout.write = originalWrite;
  setReporterMode('human');
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  await fs.rm(fakeHome, { recursive: true, force: true });
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('listCommand · JSON 模式', () => {
  it('无订阅时：list 事件的 resources 包含所有源资源（subscriptions 为空）', async () => {
    await setupEnv(['alpha', 'beta']);

    await listCommand('skills', {});

    const events = captureJsonEvents();
    const listEvents = events.filter(
      (e) => (e as { event: string }).event === 'list',
    );
    expect(listEvents).toHaveLength(1);
    const data = (listEvents[0] as { data: {
      version: number;
      type: string;
      resources: Array<{ dirName: string; subscriptions: unknown[] }>;
    } }).data;
    expect(data.version).toBe(2);
    expect(data.type).toBe('skills');
    expect(data.resources).toHaveLength(2);
    expect(data.resources.map((r) => r.dirName).sort()).toEqual([
      'alpha',
      'beta',
    ]);
    for (const r of data.resources) {
      expect(r.subscriptions).toEqual([]);
    }
  });

  it('订阅到 user 后：subscriptions 含 user 落点，status 为 not_synced（未同步）', async () => {
    await setupEnv(['alpha']);
    await subscribeCommand('skills', 'alpha', { scope: 'user' });
    /* 清空之前的 stdout 捕获 */
    stdoutChunks = [];

    await listCommand('skills', {});

    const events = captureJsonEvents();
    const listEvent = events.find(
      (e) => (e as { event: string }).event === 'list',
    ) as { data: { resources: Array<{
      dirName: string;
      subscriptions: Array<{
        scope: string;
        targets: Array<{ target: string; status: string }>;
      }>;
    }> } };
    const alpha = listEvent.data.resources.find((r) => r.dirName === 'alpha')!;
    expect(alpha.subscriptions).toHaveLength(1);
    expect(alpha.subscriptions[0].scope).toBe('user');
    expect(alpha.subscriptions[0].targets[0].target).toBe('codebuddy');
    expect(alpha.subscriptions[0].targets[0].status).toBe('not_synced');
  });

  it('订阅并同步后：status=synced', async () => {
    await setupEnv(['alpha']);
    await subscribeCommand('skills', 'alpha', {
      scope: 'user',
      sync: true,
    });
    stdoutChunks = [];

    await listCommand('skills', {});

    const listEvent = captureJsonEvents().find(
      (e) => (e as { event: string }).event === 'list',
    ) as { data: { resources: Array<{
      dirName: string;
      subscriptions: Array<{ targets: Array<{ status: string }> }>;
    }> } };
    const alpha = listEvent.data.resources.find((r) => r.dirName === 'alpha')!;
    expect(alpha.subscriptions[0].targets[0].status).toBe('synced');
  });

  it('源变更后：status=changed', async () => {
    await setupEnv(['alpha']);
    await subscribeCommand('skills', 'alpha', {
      scope: 'user',
      sync: true,
    });
    /* 修改源 */
    await fs.writeFile(
      path.join(fakeHome, '.aitools', 'skills', 'alpha', 'SKILL.md'),
      '# alpha v2',
      'utf-8',
    );
    stdoutChunks = [];

    await listCommand('skills', {});

    const listEvent = captureJsonEvents().find(
      (e) => (e as { event: string }).event === 'list',
    ) as { data: { resources: Array<{
      dirName: string;
      subscriptions: Array<{ targets: Array<{ status: string }> }>;
    }> } };
    const alpha = listEvent.data.resources.find((r) => r.dirName === 'alpha')!;
    expect(alpha.subscriptions[0].targets[0].status).toBe('changed');
  });

  it('孤儿订阅不出现在 resources，但不阻止输出', async () => {
    await setupEnv(['alpha']);
    /* 手动写入一个不存在源的订阅 */
    const cfg = createConfig('~/.aitools', [
      {
        name: 'codebuddy',
        enabled: true,
        user_base: path.join(fakeHome, '.codebuddy'),
      },
    ]);
    addUserSubscription(cfg, 'skills', 'ghost');
    await saveConfig(cfg);
    stdoutChunks = [];

    await listCommand('skills', {});

    const listEvent = captureJsonEvents().find(
      (e) => (e as { event: string }).event === 'list',
    ) as { data: { resources: Array<{ dirName: string }> } };
    expect(listEvent.data.resources.map((r) => r.dirName)).toEqual(['alpha']);
    /* ghost 不出现在 resources */
    expect(
      listEvent.data.resources.find((r) => r.dirName === 'ghost'),
    ).toBeUndefined();
  });

  it('list all：对每个已实现类型都 emit 一条 list 事件', async () => {
    await setupEnv(['alpha']);

    await listCommand(undefined, {});

    const events = captureJsonEvents();
    const listEvents = events.filter(
      (e) => (e as { event: string }).event === 'list',
    );
    /* 当前仅 skills 已实现，所以只有 1 条 list 事件 */
    expect(listEvents).toHaveLength(1);
    expect((listEvents[0] as { data: { type: string } }).data.type).toBe(
      'skills',
    );
  });

  it('cwd 有 project.yaml 时，list 事件含 projectDir 字段', async () => {
    await setupEnv(['alpha']);
    /* 建一个最小项目配置 */
    const yamlDir = path.join(projectDir, '.aitools');
    await fs.mkdir(yamlDir, { recursive: true });
    await fs.writeFile(
      path.join(yamlDir, 'project.yaml'),
      'skills: []\n',
      'utf-8',
    );
    stdoutChunks = [];

    await listCommand('skills', {});

    const listEvent = captureJsonEvents().find(
      (e) => (e as { event: string }).event === 'list',
    ) as { data: { projectDir?: string } };
    /**
     * macOS 上 /var 是 /private/var 的 symlink，process.cwd() 返回解析后的真实路径；
     * 用 fs.realpath 做等价规范化后再比较。
     */
    const expected = await fs.realpath(projectDir);
    expect(listEvent.data.projectDir).toBe(expected);
  });
});

/**
 * target 命令族单元测试（v0.4.2 / RFC-001.1 PR-2）
 *
 * 覆盖矩阵（对应 RFC §3.2 行为矩阵）：
 * - enable 已禁用 → 翻转 + 落盘 + success
 * - enable 已启用 → 幂等（不落盘 mtime 可变，但字段状态不变）+ info
 * - disable 已启用 → 翻转 + 落盘
 * - disable 已禁用 → 幂等
 * - 未知 target → error + exitCode 1 + code=TARGET_NOT_FOUND
 * - 配置缺失 → error + exitCode 1
 *
 * JSON 模式下额外验证事件序列。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  targetEnableCommand,
  targetDisableCommand,
} from '../../src/commands/target.js';
import {
  loadConfig,
  saveConfig,
  createConfig,
} from '../../src/config/manager.js';
import { setReporterMode } from '../../src/utils/reporter.js';

/** 伪造的 HOME 目录（每个用例独立） */
let fakeHome: string;

/**
 * 捕获 stdout 的 JSON 事件行
 * 每条 process.stdout.write 会被这个数组记录；测试用例可断言事件序列
 */
let stdoutLines: string[];

/** 原始 process.stdout.write（afterEach 还原） */
let originalStdoutWrite: typeof process.stdout.write;

/**
 * 安装一个双 target 的最小配置
 * - codebuddy: enabled=true
 * - claude-code: enabled=false
 * 方便用 enable/disable 覆盖"翻转"与"幂等"四象限
 */
async function setupTwoTargets(): Promise<void> {
  const cfg = createConfig('~/.aitools', [
    {
      name: 'codebuddy',
      enabled: true,
      user_base: path.join(fakeHome, '.codebuddy'),
    },
    {
      name: 'claude-code',
      enabled: false,
      user_base: path.join(fakeHome, '.claude'),
    },
  ]);
  await saveConfig(cfg);
}

/**
 * 从 stdout 捕获的 NDJSON 行里解析出事件序列
 * 过滤空行，确保每行是合法 JSON
 */
function parseEvents(): { event: string; data: Record<string, unknown> }[] {
  return stdoutLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
}

beforeEach(async () => {
  fakeHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-target-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(fakeHome);

  /* 捕获 stdout：target 命令在 JSON 模式下通过 process.stdout.write 输出 NDJSON */
  stdoutLines = [];
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: unknown) => {
    if (typeof chunk === 'string') {
      stdoutLines.push(chunk);
    }
    return true;
  }) as typeof process.stdout.write;

  setReporterMode('json');
});

afterEach(async () => {
  setReporterMode('human');
  process.stdout.write = originalStdoutWrite;
  vi.restoreAllMocks();
  await fs.rm(fakeHome, { recursive: true, force: true });
});

/* ============================================================
 * enable：翻转与幂等
 * ============================================================ */

describe('targetEnableCommand · 翻转与幂等', () => {
  it('启用已禁用的 target → enabled 变 true，落盘，JSON 事件 changed=true', async () => {
    await setupTwoTargets();

    await targetEnableCommand('claude-code');

    const cfg = await loadConfig();
    const claude = cfg?.targets.find((t) => t.name === 'claude-code');
    expect(claude?.enabled).toBe(true);

    const events = parseEvents();
    expect(events).toContainEqual({
      event: 'target.enabled',
      data: { name: 'claude-code', changed: true },
    });
    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 0 },
    });
  });

  it('启用已启用的 target → 幂等，不翻转，JSON 事件 changed=false', async () => {
    await setupTwoTargets();

    await targetEnableCommand('codebuddy');

    const cfg = await loadConfig();
    const codebuddy = cfg?.targets.find((t) => t.name === 'codebuddy');
    expect(codebuddy?.enabled).toBe(true);

    const events = parseEvents();
    expect(events).toContainEqual({
      event: 'target.enabled',
      data: { name: 'codebuddy', changed: false },
    });
    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 0 },
    });
  });
});

/* ============================================================
 * disable：翻转与幂等
 * ============================================================ */

describe('targetDisableCommand · 翻转与幂等', () => {
  it('禁用已启用的 target → enabled 变 false，落盘，JSON 事件 changed=true', async () => {
    await setupTwoTargets();

    await targetDisableCommand('codebuddy');

    const cfg = await loadConfig();
    const codebuddy = cfg?.targets.find((t) => t.name === 'codebuddy');
    expect(codebuddy?.enabled).toBe(false);

    const events = parseEvents();
    expect(events).toContainEqual({
      event: 'target.disabled',
      data: { name: 'codebuddy', changed: true },
    });
    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 0 },
    });
  });

  it('禁用已禁用的 target → 幂等，不翻转', async () => {
    await setupTwoTargets();

    await targetDisableCommand('claude-code');

    const cfg = await loadConfig();
    const claude = cfg?.targets.find((t) => t.name === 'claude-code');
    expect(claude?.enabled).toBe(false);

    const events = parseEvents();
    expect(events).toContainEqual({
      event: 'target.disabled',
      data: { name: 'claude-code', changed: false },
    });
    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 0 },
    });
  });
});

/* ============================================================
 * 其他 target 不受影响
 * ============================================================ */

describe('targetEnableCommand · 副作用最小化', () => {
  it('翻转一个 target 不影响其他 target 的 enabled 状态', async () => {
    await setupTwoTargets();

    await targetEnableCommand('claude-code');

    const cfg = await loadConfig();
    const codebuddy = cfg?.targets.find((t) => t.name === 'codebuddy');
    const claude = cfg?.targets.find((t) => t.name === 'claude-code');
    expect(codebuddy?.enabled).toBe(true); // 维持原状
    expect(claude?.enabled).toBe(true); // 被本次操作翻转
  });
});

/* ============================================================
 * 错误路径：未知 target
 * ============================================================ */

describe('targetEnableCommand · 未知 target', () => {
  it('未知 target 名 → error 事件 code=TARGET_NOT_FOUND + exitCode=1', async () => {
    await setupTwoTargets();

    await targetEnableCommand('unknown-tool');

    /* 配置不应被修改 */
    const cfg = await loadConfig();
    expect(cfg?.targets.find((t) => t.name === 'codebuddy')?.enabled).toBe(
      true,
    );
    expect(cfg?.targets.find((t) => t.name === 'claude-code')?.enabled).toBe(
      false,
    );

    const events = parseEvents();
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data.code).toBe('TARGET_NOT_FOUND');
    expect(errorEvent?.data.message).toContain('unknown-tool');

    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 1 },
    });
  });
});

describe('targetDisableCommand · 未知 target', () => {
  it('未知 target 名 → error 事件 code=TARGET_NOT_FOUND + exitCode=1', async () => {
    await setupTwoTargets();

    await targetDisableCommand('unknown-tool');

    const events = parseEvents();
    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent?.data.code).toBe('TARGET_NOT_FOUND');

    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 1 },
    });
  });
});

/* ============================================================
 * 错误路径：配置缺失
 * ============================================================ */

describe('target 命令族 · 配置文件缺失', () => {
  it('config.yaml 不存在 → error + exitCode=1，不崩溃', async () => {
    /* 不调 setupTwoTargets，故意让 ~/.aitools/config.yaml 不存在 */
    await targetEnableCommand('codebuddy');

    const events = parseEvents();
    /* loadConfig 内部会 logger.error，但这条路径不发 error 事件；
     * 唯一确定性的是会 emit done + exitCode=1 */
    expect(events).toContainEqual({
      event: 'done',
      data: { exitCode: 1 },
    });
  });
});

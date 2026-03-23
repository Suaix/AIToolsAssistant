/**
 * detectProjectTools() 函数单元测试
 * 覆盖四种场景：仅 codebuddy、仅 claude-code、两个都有、都没有
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectProjectTools } from '../../src/core/syncer.js';
import type { Target } from '../../src/types/index.js';

/** 测试用的临时项目目录 */
let projectDir: string;

/** 两个已启用目标的固定测试数据 */
const testTargets: Target[] = [
  {
    name: 'codebuddy',
    enabled: true,
    user_path: '~/.codebuddy/skills',
  },
  {
    name: 'claude-code',
    enabled: true,
    user_path: '~/.claude/skills',
  },
];

beforeEach(async () => {
  /* 创建临时测试目录 */
  projectDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'aitools-detect-test-'),
  );
});

afterEach(async () => {
  /* 清理临时目录 */
  await fs.rm(projectDir, { recursive: true, force: true });
});

describe('detectProjectTools', () => {
  it('仅存在 .codebuddy/ 目录时，应只返回 codebuddy 目标', async () => {
    /* 创建 .codebuddy 目录 */
    await fs.mkdir(path.join(projectDir, '.codebuddy'), { recursive: true });

    const result = detectProjectTools(projectDir, testTargets);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('codebuddy');
  });

  it('仅存在 .claude/ 目录时，应只返回 claude-code 目标', async () => {
    /* 创建 .claude 目录 */
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true });

    const result = detectProjectTools(projectDir, testTargets);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('claude-code');
  });

  it('两个目录都存在时，应返回两个目标', async () => {
    /* 创建两个工具目录 */
    await fs.mkdir(path.join(projectDir, '.codebuddy'), { recursive: true });
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true });

    const result = detectProjectTools(projectDir, testTargets);

    expect(result).toHaveLength(2);
    const names = result.map((t) => t.name);
    expect(names).toContain('codebuddy');
    expect(names).toContain('claude-code');
  });

  it('都不存在时，应返回空列表', () => {
    /* 不创建任何工具目录 */
    const result = detectProjectTools(projectDir, testTargets);

    expect(result).toHaveLength(0);
  });

  it('传入空目标列表时，应返回空列表', async () => {
    /* 即使目录存在，空目标列表也应返回空 */
    await fs.mkdir(path.join(projectDir, '.codebuddy'), { recursive: true });

    const result = detectProjectTools(projectDir, []);

    expect(result).toHaveLength(0);
  });

  it('传入未知工具名的目标时，应过滤掉未知目标', async () => {
    /* 即使目录存在，没有映射的目标也不会被返回 */
    const unknownTarget: Target = {
      name: 'unknown-tool',
      enabled: true,
      user_path: '~/.unknown/skills',
    };

    const result = detectProjectTools(projectDir, [unknownTarget]);

    expect(result).toHaveLength(0);
  });
});

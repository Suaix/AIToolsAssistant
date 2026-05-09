/**
 * 工具家目录守卫单元测试（FEAT-005 步骤 8）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  assertToolUserHomeExists,
  assertToolProjectHomeExists,
} from '../../src/utils/tool-home-assert.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-guard-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('assertToolUserHomeExists', () => {
  it('user_base 存在为目录时返回 present', async () => {
    const userBase = path.join(tempDir, '.codebuddy');
    await fs.mkdir(userBase, { recursive: true });

    const status = await assertToolUserHomeExists({
      name: 'codebuddy',
      enabled: true,
      user_base: userBase,
    });

    expect(status.kind).toBe('present');
    expect(status.expectedPath).toBe(userBase);
  });

  it('user_base 不存在时返回 missing', async () => {
    const userBase = path.join(tempDir, '.nonexistent-tool');

    const status = await assertToolUserHomeExists({
      name: 'nonexistent-tool',
      enabled: true,
      user_base: userBase,
    });

    expect(status.kind).toBe('missing');
    expect(status.expectedPath).toBe(userBase);
  });

  it('user_base 是文件而非目录时返回 missing', async () => {
    const filePath = path.join(tempDir, 'fake-tool');
    await fs.writeFile(filePath, 'not a directory', 'utf-8');

    const status = await assertToolUserHomeExists({
      name: 'fake-tool',
      enabled: true,
      user_base: filePath,
    });

    expect(status.kind).toBe('missing');
  });
});

describe('assertToolProjectHomeExists', () => {
  it('项目级标记目录存在时返回 present', async () => {
    const dir = path.join(tempDir, '.codebuddy');
    await fs.mkdir(dir, { recursive: true });

    const status = await assertToolProjectHomeExists(tempDir, 'codebuddy');

    expect(status.kind).toBe('present');
    expect(status.expectedPath).toBe(dir);
  });

  it('项目级标记目录不存在时返回 missing', async () => {
    const status = await assertToolProjectHomeExists(tempDir, 'nonexistent');

    expect(status.kind).toBe('missing');
    expect(status.expectedPath).toBe(path.join(tempDir, '.nonexistent'));
  });
});

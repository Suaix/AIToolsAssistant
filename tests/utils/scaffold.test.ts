/**
 * Scaffold（源目录骨架生成）单元测试
 * v0.4.0：扁平骨架，4 个叶子目录（skills/commands/agents/rules）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ensureResourceSkeleton } from '../../src/utils/scaffold.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-scaffold-test-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * 验证骨架下 4 个叶子目录（扁平）都存在
 */
async function assertAllLeafDirsExist(baseDir: string): Promise<void> {
  const expected = ['skills', 'commands', 'agents', 'rules'];
  for (const rel of expected) {
    const stat = await fs.stat(path.join(baseDir, rel));
    expect(stat.isDirectory()).toBe(true);
  }
}

describe('ensureResourceSkeleton（v0.4 扁平骨架）', () => {
  it('空目录下创建全部 4 个叶子目录', async () => {
    const sourceDir = path.join(tempDir, 'source');

    const result = await ensureResourceSkeleton(sourceDir);

    expect(result.directories).toHaveLength(4);
    expect(result.created).toHaveLength(4);
    expect(result.skipped).toHaveLength(0);

    await assertAllLeafDirsExist(sourceDir);
  });

  it('源目录不存在时自动创建源目录', async () => {
    const sourceDir = path.join(tempDir, 'nested', 'deep', 'source');

    await ensureResourceSkeleton(sourceDir);

    const stat = await fs.stat(sourceDir);
    expect(stat.isDirectory()).toBe(true);
    await assertAllLeafDirsExist(sourceDir);
  });

  it('已存在部分骨架时跳过已有目录，补齐缺失目录', async () => {
    const sourceDir = path.join(tempDir, 'source');
    /* 先手动创建 skills/ */
    await fs.mkdir(path.join(sourceDir, 'skills'), { recursive: true });

    const result = await ensureResourceSkeleton(sourceDir);

    expect(result.directories).toHaveLength(4);
    expect(result.created).toHaveLength(3); /* 3 个新建 */
    expect(result.skipped).toHaveLength(1); /* 1 个已存在 */
    expect(result.skipped[0]).toContain('skills');

    await assertAllLeafDirsExist(sourceDir);
  });

  it('已有业务文件不受影响', async () => {
    const sourceDir = path.join(tempDir, 'source');
    const existingSkill = path.join(sourceDir, 'skills', 'my-skill');
    await fs.mkdir(existingSkill, { recursive: true });
    await fs.writeFile(path.join(existingSkill, 'SKILL.md'), '# keep me', 'utf-8');

    await ensureResourceSkeleton(sourceDir);

    /* 原有文件仍存在 */
    const content = await fs.readFile(
      path.join(existingSkill, 'SKILL.md'),
      'utf-8',
    );
    expect(content).toBe('# keep me');
    await assertAllLeafDirsExist(sourceDir);
  });

  it('重复调用幂等（第二次全部 skipped）', async () => {
    const sourceDir = path.join(tempDir, 'source');

    await ensureResourceSkeleton(sourceDir);
    const result = await ensureResourceSkeleton(sourceDir);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(4);
  });
});

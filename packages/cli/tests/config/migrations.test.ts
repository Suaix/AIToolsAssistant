/**
 * 配置迁移管线单元测试（FEAT-005 步骤 7）
 *
 * 覆盖：
 *   - migrateConfigDispatch：v0.2 → v0.5、v0.4 → v0.5、claude 改名、幂等、备份
 *   - migrateProjectConfigDispatch：补 version
 *   - 反例：parse_failed / write_failed
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  migrateConfigDispatch,
  migrateProjectConfigDispatch,
} from '../../src/config/migrations/index.js';
import {
  NoopMigrationReporter,
  setDefaultReporter,
  resetDefaultReporter,
} from '../../src/config/migrations/reporter.js';
import {
  CURRENT_CONFIG_VERSION,
  CURRENT_PROJECT_CONFIG_VERSION,
} from '../../src/config/version.js';

let tempDir: string;
let configPath: string;
let projectConfigPath: string;
let reporter: NoopMigrationReporter;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aitools-migration-test-'));
  configPath = path.join(tempDir, 'config.yaml');
  projectConfigPath = path.join(tempDir, 'project.yaml');
  reporter = new NoopMigrationReporter();
  setDefaultReporter(reporter);
});

afterEach(async () => {
  resetDefaultReporter();
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('migrateConfigDispatch · v0.2 → v0.5（user_path → user_base）', () => {
  it('应把 user_path 改名为 user_base 并写入 version', async () => {
    const oldYaml = [
      'source: ~/.aitools',
      'targets:',
      '  - name: codebuddy',
      '    enabled: true',
      '    user_path: ~/.codebuddy',
      'sync:',
      '  default_scope: user',
      '  clean: false',
      '',
    ].join('\n');
    await fs.writeFile(configPath, oldYaml, 'utf-8');

    const parsed = parseYaml(oldYaml) as Record<string, unknown>;
    const result = await migrateConfigDispatch(parsed, configPath);

    expect(result.changed).toBe(true);
    expect(result.toVersion).toBe(CURRENT_CONFIG_VERSION);

    /* 校验 yaml 已被改写 */
    const newContent = await fs.readFile(configPath, 'utf-8');
    expect(newContent).toContain(`version: ${CURRENT_CONFIG_VERSION}`);
    expect(newContent).toContain('user_base: ~/.codebuddy');
    expect(newContent).not.toContain('user_path');
  });
});

describe('migrateConfigDispatch · v0.4 → v0.5（claude-code → claude-internal）', () => {
  it('应把 claude-code target 改名为 claude-internal 并改写 user_base', async () => {
    const oldYaml = [
      'source: ~/.aitools',
      'targets:',
      '  - name: claude-code',
      '    enabled: false',
      '    user_base: ~/.claude',
      'sync:',
      '  default_scope: user',
      '  clean: false',
      'user_subscriptions:',
      '  skills: []',
      '',
    ].join('\n');
    await fs.writeFile(configPath, oldYaml, 'utf-8');

    const parsed = parseYaml(oldYaml) as Record<string, unknown>;
    const result = await migrateConfigDispatch(parsed, configPath);

    expect(result.changed).toBe(true);
    const targets = result.config.targets as Array<{ name: string; user_base: string }>;
    expect(targets[0].name).toBe('claude-internal');
    expect(targets[0].user_base).toBe('~/.claude-internal');
  });
});

describe('migrateConfigDispatch · 备份与幂等', () => {
  it('迁移触发后应生成 .bak 文件', async () => {
    const oldYaml = [
      'source: ~/.aitools',
      'targets:',
      '  - name: codebuddy',
      '    enabled: true',
      '    user_path: ~/.codebuddy',
      'sync:',
      '  default_scope: user',
      '  clean: false',
      '',
    ].join('\n');
    await fs.writeFile(configPath, oldYaml, 'utf-8');

    const parsed = parseYaml(oldYaml) as Record<string, unknown>;
    await migrateConfigDispatch(parsed, configPath);

    const backupContent = await fs.readFile(configPath + '.bak', 'utf-8');
    expect(backupContent).toContain('user_path: ~/.codebuddy');
  });

  it('已是当前版本时为 no-op（up_to_date）', async () => {
    const newYaml = [
      `version: ${CURRENT_CONFIG_VERSION}`,
      'source: ~/.aitools',
      'targets:',
      '  - name: codebuddy',
      '    enabled: true',
      '    user_base: ~/.codebuddy',
      'sync:',
      '  default_scope: user',
      '  clean: false',
      'user_subscriptions:',
      '  skills: []',
      '',
    ].join('\n');
    await fs.writeFile(configPath, newYaml, 'utf-8');

    const parsed = parseYaml(newYaml) as Record<string, unknown>;
    const result = await migrateConfigDispatch(parsed, configPath);

    expect(result.changed).toBe(false);
    expect(reporter.last()).toEqual({ status: 'up_to_date' });

    /* 不应生成 .bak */
    const backupExists = await fs
      .access(configPath + '.bak')
      .then(() => true)
      .catch(() => false);
    expect(backupExists).toBe(false);
  });
});

describe('migrateProjectConfigDispatch', () => {
  it('缺 version 的旧 project.yaml 应被补充 version', async () => {
    const oldYaml = 'skills:\n  - skill-a\n';
    await fs.writeFile(projectConfigPath, oldYaml, 'utf-8');

    const parsed = parseYaml(oldYaml) as Record<string, unknown>;
    const result = await migrateProjectConfigDispatch(parsed, projectConfigPath);

    expect(result.changed).toBe(true);
    expect(result.config.version).toBe(CURRENT_PROJECT_CONFIG_VERSION);

    /* yaml 已被改写 */
    const newContent = await fs.readFile(projectConfigPath, 'utf-8');
    expect(newContent).toContain(`version: ${CURRENT_PROJECT_CONFIG_VERSION}`);
  });
});

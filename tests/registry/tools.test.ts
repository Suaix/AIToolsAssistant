/**
 * SSOT 注册表加载与查询 API 单元测试（FEAT-005 步骤 1 验证）
 *
 * 验证目标：
 *   1. shared/tools.json 能被正确加载与校验
 *   2. 公共查询 API 行为符合预期
 *   3. 模块级缓存只读一次（不影响测试可重复性）
 *
 * 注意：本测试不 mock fs，直接读取真实 SSOT 文件，确保数据契约可用。
 */

import { describe, expect, it } from 'vitest';
import {
  findTool,
  getAllTools,
  getDefaultEnabledTools,
  getLegacyAliases,
  getLegacyProjectDirs,
  getLegacyUserBases,
  getToolDisplayName,
} from '../../src/registry/tools.js';

describe('registry/tools - SSOT 加载与查询', () => {
  describe('getAllTools', () => {
    it('应返回非空只读数组', () => {
      const tools = getAllTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it('每个工具应包含完整字段', () => {
      const tools = getAllTools();
      for (const tool of tools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.displayName).toBe('string');
        expect(typeof tool.userBase).toBe('string');
        expect(Array.isArray(tool.projectDirAliases)).toBe(true);
        expect(tool.projectDirAliases.length).toBeGreaterThan(0);
        expect(typeof tool.defaultEnabled).toBe('boolean');
      }
    });

    it('应至少包含 codebuddy 与 claude-internal 两个工具', () => {
      const names = getAllTools().map((t) => t.name);
      expect(names).toContain('codebuddy');
      expect(names).toContain('claude-internal');
    });

    it('不应包含旧名 claude-code', () => {
      const names = getAllTools().map((t) => t.name);
      expect(names).not.toContain('claude-code');
    });
  });

  describe('findTool', () => {
    it('已知工具应返回完整定义', () => {
      const tool = findTool('codebuddy');
      expect(tool).toBeDefined();
      expect(tool?.name).toBe('codebuddy');
      expect(tool?.displayName).toBe('CodeBuddy');
      expect(tool?.userBase).toBe('~/.codebuddy');
    });

    it('未知工具应返回 undefined', () => {
      expect(findTool('nonexistent-tool')).toBeUndefined();
    });
  });

  describe('getToolDisplayName', () => {
    it('已知工具返回 displayName', () => {
      expect(getToolDisplayName('codebuddy')).toBe('CodeBuddy');
      expect(getToolDisplayName('claude-internal')).toBe('Claude Internal');
    });

    it('未知工具回退原 name', () => {
      expect(getToolDisplayName('unknown-x')).toBe('unknown-x');
    });
  });

  describe('getDefaultEnabledTools', () => {
    it('应返回所有 defaultEnabled === true 的工具', () => {
      const defaults = getDefaultEnabledTools();
      for (const tool of defaults) {
        expect(tool.defaultEnabled).toBe(true);
      }
    });

    it('codebuddy 应在默认启用列表中', () => {
      const names = getDefaultEnabledTools().map((t) => t.name);
      expect(names).toContain('codebuddy');
    });

    it('claude-internal 不应默认启用', () => {
      const names = getDefaultEnabledTools().map((t) => t.name);
      expect(names).not.toContain('claude-internal');
    });
  });

  describe('legacy 映射查找表', () => {
    it('getLegacyAliases 应包含 claude-code → claude-internal', () => {
      const aliases = getLegacyAliases();
      expect(aliases['claude-code']).toBe('claude-internal');
    });

    it('getLegacyUserBases 应包含 ~/.claude → ~/.claude-internal', () => {
      const bases = getLegacyUserBases();
      expect(bases['~/.claude']).toBe('~/.claude-internal');
    });

    it('getLegacyProjectDirs 应包含 .claude-code → .claude-internal', () => {
      const dirs = getLegacyProjectDirs();
      expect(dirs['.claude-code']).toBe('.claude-internal');
    });
  });
});

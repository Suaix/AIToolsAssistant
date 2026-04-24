/**
 * Resource Registry 单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  getHandler,
  getAllHandlers,
  listImplementedHandlers,
  listAllTypes,
  isValidResourceType,
} from '../../../src/core/resources/registry.js';

describe('Registry', () => {
  it('getAllHandlers 返回 4 种资源处理器', () => {
    const handlers = getAllHandlers();
    expect(handlers).toHaveLength(4);
    const types = handlers.map((h) => h.type).sort();
    expect(types).toEqual(['agents', 'commands', 'rules', 'skills']);
  });

  it('listAllTypes 返回完整类型列表', () => {
    const types = listAllTypes().sort();
    expect(types).toEqual(['agents', 'commands', 'rules', 'skills']);
  });

  it('listImplementedHandlers 仅返回已实现 handler（当前仅 skills）', () => {
    const implemented = listImplementedHandlers();
    expect(implemented).toHaveLength(1);
    expect(implemented[0].type).toBe('skills');
    expect(implemented[0].implemented).toBe(true);
  });

  it('getHandler 正确返回对应 handler', () => {
    expect(getHandler('skills').type).toBe('skills');
    expect(getHandler('commands').type).toBe('commands');
    expect(getHandler('agents').type).toBe('agents');
    expect(getHandler('rules').type).toBe('rules');
  });

  it('占位 handler 的 implemented 标志为 false', () => {
    expect(getHandler('commands').implemented).toBe(false);
    expect(getHandler('agents').implemented).toBe(false);
    expect(getHandler('rules').implemented).toBe(false);
  });

  it('占位 handler 的 scan 返回空数组', async () => {
    const result = await getHandler('commands').scan('/any/path', 'user');
    expect(result).toEqual([]);
  });

  it('isValidResourceType 正确校验', () => {
    expect(isValidResourceType('skills')).toBe(true);
    expect(isValidResourceType('commands')).toBe(true);
    expect(isValidResourceType('agents')).toBe(true);
    expect(isValidResourceType('rules')).toBe(true);
    expect(isValidResourceType('unknown')).toBe(false);
    expect(isValidResourceType('all')).toBe(false); /* 'all' 不是合法资源类型 */
  });
});

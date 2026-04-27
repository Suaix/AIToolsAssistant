/**
 * Reporter 单元测试
 *
 * 验证：
 * - setReporterMode / getReporterMode / isJsonMode 状态管理
 * - human 模式下不输出 JSON 事件
 * - json 模式下 emitJson 输出合法 NDJSON（可 JSON.parse）
 * - json 模式下 error() 会同时向 stdout emit 事件 + 向 stderr 写文本
 * - json 模式下 success() / raw() / blank() 被抑制到 stdout
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setReporterMode,
  getReporterMode,
  isJsonMode,
  emitJson,
  reporter,
} from '../../src/utils/reporter.js';

describe('Reporter 输出层', () => {
  /** 原始 stdout.write / stderr.write / console.log 引用 */
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  /** 每次测试前重置为 human 模式 + 清空 spy */
  beforeEach(() => {
    setReporterMode('human');
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  /** 每次测试后恢复 */
  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    consoleSpy.mockRestore();
    setReporterMode('human'); // 保险：恢复默认
  });

  describe('模式切换', () => {
    it('默认模式应为 human', () => {
      expect(getReporterMode()).toBe('human');
      expect(isJsonMode()).toBe(false);
    });

    it('setReporterMode("json") 后 isJsonMode 返回 true', () => {
      setReporterMode('json');
      expect(getReporterMode()).toBe('json');
      expect(isJsonMode()).toBe(true);
    });

    it('setReporterMode("human") 后 isJsonMode 返回 false', () => {
      setReporterMode('json');
      setReporterMode('human');
      expect(isJsonMode()).toBe(false);
    });
  });

  describe('emitJson', () => {
    it('human 模式下不写 stdout', () => {
      setReporterMode('human');
      emitJson({ event: 'done', data: { exitCode: 0 } });
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('json 模式下输出一行合法 NDJSON（末尾带 \\n）', () => {
      setReporterMode('json');
      emitJson({ event: 'done', data: { exitCode: 0 } });

      expect(stdoutSpy).toHaveBeenCalledOnce();
      const written = stdoutSpy.mock.calls[0][0] as string;
      expect(written).toMatch(/\n$/);

      const parsed = JSON.parse(written.trim());
      expect(parsed).toEqual({ event: 'done', data: { exitCode: 0 } });
    });

    it('多次 emitJson 应产生多行 NDJSON', () => {
      setReporterMode('json');
      emitJson({ event: 'start', data: { type: 'skills', scope: 'user', total: 2, targets: ['codebuddy'] } });
      emitJson({ event: 'done', data: { exitCode: 0 } });

      expect(stdoutSpy).toHaveBeenCalledTimes(2);
      /* 每一次都应以 \n 结尾 */
      for (const call of stdoutSpy.mock.calls) {
        expect(String(call[0])).toMatch(/\n$/);
      }
    });
  });

  describe('reporter.info / warn / success / error / raw / blank', () => {
    it('human 模式：info 写入 console.log（带蓝色前缀）', () => {
      setReporterMode('human');
      reporter.info('测试消息');
      expect(consoleSpy).toHaveBeenCalledOnce();
    });

    it('json 模式：info 写入 stderr（不污染 stdout）', () => {
      setReporterMode('json');
      reporter.info('测试消息');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(String(stderrSpy.mock.calls[0][0])).toContain('[INFO]');
      expect(String(stderrSpy.mock.calls[0][0])).toContain('测试消息');
    });

    it('json 模式：success 被完全抑制（stdout/stderr 都不写）', () => {
      setReporterMode('json');
      reporter.success('大成功');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('json 模式：warn 写入 stderr 带 [WARN] 前缀', () => {
      setReporterMode('json');
      reporter.warn('小心');
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(String(stderrSpy.mock.calls[0][0])).toContain('[WARN]');
    });

    it('json 模式：error 同时向 stdout 发 error 事件 + 向 stderr 写文本', () => {
      setReporterMode('json');
      reporter.error('出问题了', 'SOURCE_NOT_FOUND');

      /* stdout：error 事件 */
      expect(stdoutSpy).toHaveBeenCalledOnce();
      const event = JSON.parse(String(stdoutSpy.mock.calls[0][0]).trim());
      expect(event).toEqual({
        event: 'error',
        data: { message: '出问题了', code: 'SOURCE_NOT_FOUND' },
      });

      /* stderr：人类可读文本 */
      expect(stderrSpy).toHaveBeenCalledOnce();
      expect(String(stderrSpy.mock.calls[0][0])).toContain('[ERROR]');
    });

    it('json 模式：raw 完全被抑制（只允许结构化事件进 stdout）', () => {
      setReporterMode('json');
      reporter.raw('这是一行表格');
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('json 模式：blank 完全被抑制', () => {
      setReporterMode('json');
      reporter.blank();
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('human 模式：blank 写入一个空行', () => {
      setReporterMode('human');
      reporter.blank();
      expect(consoleSpy).toHaveBeenCalledWith('');
    });
  });
});

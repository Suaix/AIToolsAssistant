/**
 * 输出层抽象（Reporter）
 *
 * 职责：
 * - 在 human 模式下，沿用 logger 彩色输出（给终端用户看）
 * - 在 json 模式下，以 NDJSON（每行一个 JSON）方式写入 stdout（给 GUI 等机器消费方）
 *
 * 设计原则：
 * - 业务代码不直接 console.log，统一调用 reporter
 * - human 模式与 json 模式互斥：json 模式下**禁用**所有彩色文本输出到 stdout，
 *   但允许通过 stderr 输出警告/错误（GUI 可捕获或忽略）
 *
 * v0.3.0 引入，为 GUI 接入提供稳定的数据契约
 */
import pc from 'picocolors';
import type { JsonEvent } from '../types/index.js';

/**
 * Reporter 运行模式
 * - human：人类可读的彩色文本（默认，与 v0.2.0 行为一致）
 * - json：机器可读的 NDJSON 流（每行一个 JSON 对象）
 */
export type ReporterMode = 'human' | 'json';

/** 当前 Reporter 模式（全局单例） */
let currentMode: ReporterMode = 'human';

/**
 * 设置 Reporter 模式
 * 由 CLI 入口在解析完 --json 全局 flag 后调用
 * @param mode 目标模式
 */
export function setReporterMode(mode: ReporterMode): void {
  currentMode = mode;
}

/**
 * 读取当前 Reporter 模式
 * @returns 当前模式
 */
export function getReporterMode(): ReporterMode {
  return currentMode;
}

/**
 * 是否处于 JSON 模式
 * @returns true 表示当前 --json 模式激活
 */
export function isJsonMode(): boolean {
  return currentMode === 'json';
}

/**
 * 向 stdout 写入单个 JSON 事件（NDJSON 格式，以换行结尾）
 *
 * 注意：
 * - 仅在 json 模式下调用才有意义；human 模式调用会被无视
 * - 使用 process.stdout.write 而非 console.log，精确控制输出（避免额外换行问题）
 *
 * @param event 要输出的 JSON 事件对象
 */
export function emitJson(event: JsonEvent): void {
  if (currentMode !== 'json') {
    return;
  }
  /* NDJSON：每个事件一行，末尾一个换行 */
  process.stdout.write(JSON.stringify(event) + '\n');
}

/**
 * 向 stderr 输出日志（JSON 模式使用）
 * GUI 端可选择解析或忽略 stderr，不会干扰 stdout 的 JSON 流
 */
function writeStderr(prefix: string, msg: string): void {
  process.stderr.write(`${prefix} ${msg}\n`);
}

/**
 * Reporter 统一接口
 *
 * 用法：业务代码中替换原 `logger.xxx(...)` 为 `reporter.xxx(...)`
 * - human 模式下，行为与原 logger 完全一致（彩色输出到 stdout）
 * - json 模式下，这些方法会被写到 stderr（不污染 stdout 的 JSON 流），
 *   或者直接忽略（取决于是否是 GUI 关心的信息）
 */
export const reporter = {
  /**
   * 信息级日志（蓝色 ℹ）
   * JSON 模式下：写到 stderr（不污染 JSON 流）
   */
  info(msg: string): void {
    if (currentMode === 'json') {
      writeStderr('[INFO]', msg);
      return;
    }
    console.log(pc.blue('ℹ'), msg);
  },

  /**
   * 成功日志（绿色 ✔）
   * JSON 模式下：忽略（GUI 从事件流中已能感知成功）
   */
  success(msg: string): void {
    if (currentMode === 'json') {
      /* JSON 模式下不输出成功文本，GUI 从 summary/done 事件中获取 */
      return;
    }
    console.log(pc.green('✔'), msg);
  },

  /**
   * 警告日志（黄色 ⚠）
   * JSON 模式下：写到 stderr（GUI 可选择是否展示）
   */
  warn(msg: string): void {
    if (currentMode === 'json') {
      writeStderr('[WARN]', msg);
      return;
    }
    console.log(pc.yellow('⚠'), msg);
  },

  /**
   * 错误日志（红色 ✖）
   * JSON 模式下：通过 error 事件输出到 stdout，并同时写 stderr 便于排查
   */
  error(msg: string, code?: string): void {
    if (currentMode === 'json') {
      emitJson({ event: 'error', data: { message: msg, code } });
      writeStderr('[ERROR]', msg);
      return;
    }
    console.log(pc.red('✖'), msg);
  },

  /**
   * 原始 stdout 输出（用于彩色表格等复杂格式）
   * JSON 模式下：完全抑制（stdout 只允许 JSON 事件）
   */
  raw(msg: string): void {
    if (currentMode === 'json') {
      return;
    }
    console.log(msg);
  },

  /**
   * 空行分隔（仅 human 模式有效）
   */
  blank(): void {
    if (currentMode === 'json') {
      return;
    }
    console.log('');
  },
};

/**
 * AI 工具家目录存在性断言（FEAT-005 步骤 8）
 *
 * 用途：在 syncResourceToDir 等 mkdir 调用之前判断 AI 工具家目录是否存在，
 * 避免 aitools 主动创建 ~/.codebuddy、~/.claude-internal 等不属于自己的目录。
 *
 * 设计语义（02-design.md US-6）：
 *   - aitools 自身目录（~/.aitools/、<project>/.aitools/）：随时 mkdir
 *   - AI 工具家目录（~/.codebuddy/、~/.claude-internal/、<project>/.<tool>/）：
 *     仅在用户/AI 工具自身已创建时才能继续操作；不存在时跳过同步
 *
 * 不抛异常：调用方根据返回值决定 skip / fail，便于流式 onProgress 上报"未检测到工具"。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Target } from '../types/index.js';

/* ============================================================
 * 公共类型
 * ============================================================ */

/** 守卫结果联合类型 */
export type ToolHomeStatus =
  | { kind: 'present'; expectedPath: string }
  | { kind: 'missing'; expectedPath: string };

/* ============================================================
 * 内部辅助
 * ============================================================ */

/**
 * 将 ~/ 开头的路径展开为绝对路径
 *
 * 与 src/config/manager.ts:expandTilde 一致；本模块复制一份，避免依赖循环。
 *
 * @param input 可能含 ~ 的路径
 * @returns 绝对路径
 */
function expandTilde(input: string): string {
  if (input.startsWith('~/') || input === '~') {
    return path.join(os.homedir(), input.slice(1));
  }
  return input;
}

/**
 * 检查路径是否存在且为目录
 *
 * @param targetPath 待检测的绝对路径
 * @returns true 表示存在且是目录
 */
async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/* ============================================================
 * 公共 API
 * ============================================================ */

/**
 * 断言用户级 AI 工具家目录存在
 *
 * 行为：检查 expandTilde(target.user_base) 是否真实存在为目录。
 *   - 存在 → { kind: 'present', expectedPath }
 *   - 不存在 / 文件而非目录 / 权限错误 → { kind: 'missing', expectedPath }
 *
 * 不抛异常；本函数是 syncer 等调用方的"前置守卫"，调用方根据返回值决定 skip。
 *
 * @param target 目标工具配置
 * @returns 守卫结果
 */
export async function assertToolUserHomeExists(
  target: Target,
): Promise<ToolHomeStatus> {
  const expectedPath = expandTilde(target.user_base);
  const exists = await isDirectory(expectedPath);
  return exists
    ? { kind: 'present', expectedPath }
    : { kind: 'missing', expectedPath };
}

/**
 * 断言项目级 AI 工具标记目录存在
 *
 * 行为：检查 <projectDir>/.<targetName> 是否真实存在为目录。
 *
 * @param projectDir 项目根目录绝对路径
 * @param targetName 目标工具名（拼出 .<targetName>）
 * @returns 守卫结果
 */
export async function assertToolProjectHomeExists(
  projectDir: string,
  targetName: string,
): Promise<ToolHomeStatus> {
  const expectedPath = path.join(projectDir, `.${targetName}`);
  const exists = await isDirectory(expectedPath);
  return exists
    ? { kind: 'present', expectedPath }
    : { kind: 'missing', expectedPath };
}

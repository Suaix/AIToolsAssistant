/**
 * CLI 调用抽象层
 *
 * 桥接 Tauri Rust command 与 React UI，对外提供类型安全的业务函数。
 *
 * 设计要点：
 * - 前端不直接拼命令行字符串，只传参数数组；真正的命令拼接在 Rust 侧
 * - NDJSON parse 在前端完成，便于流式处理（阶段 4 做 sync 时会直接复用）
 * - 类型定义与 CLI 的 src/types/index.ts 保持一致（契约文档：src/types/index.ts 中的 JsonEvent）
 */
import { invoke } from '@tauri-apps/api/core';

/* ============================================================
 * 类型定义（对齐 CLI 的 src/types/index.ts）
 * ============================================================ */

/** 资源类型 */
export type ResourceType = 'skills' | 'commands' | 'agents' | 'rules';

/** 资源层级 */
export type ResourceScope = 'user' | 'project';

/** 单个资源对单个目标的同步状态 */
export type SyncStatus = 'synced' | 'changed' | 'not_synced';

/** 单个资源在 list 命令中的条目 */
export interface ResourceListItem {
  /** 资源显示名称 */
  name: string;
  /** 资源文件夹名 */
  dirName: string;
  /** 描述（可能为 '-'） */
  description: string;
  /** 资源层级 */
  scope: ResourceScope;
  /** 源目录的绝对路径 */
  path: string;
  /** 源目录 hash */
  sourceHash: string;
  /** 各目标的同步状态 */
  targets: {
    name: string;
    status: SyncStatus;
    targetPath: string;
  }[];
}

/** list 事件载荷 */
export interface ListEventData {
  type: ResourceType;
  scope: ResourceScope;
  resources: ResourceListItem[];
  enabledTargets: string[];
}

/** 所有 CLI JSON 事件的联合类型 */
export type JsonEvent =
  | { event: 'list'; data: ListEventData }
  | { event: 'done'; data: { exitCode: number } }
  | { event: 'error'; data: { message: string; code?: string } }
  | { event: string; data: unknown };

/* ============================================================
 * Rust command 的返回结构
 * ============================================================ */

interface CliResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/* ============================================================
 * 底层：原始 CLI 调用
 * ============================================================ */

/**
 * 调用 aitools CLI 并返回解析后的 NDJSON 事件数组
 *
 * @param args CLI 参数数组（不含 --json，函数内部会自动加）
 * @throws 当 CLI 不可用或进程启动失败时抛出
 *
 * @example
 *   const events = await invokeCli(['list', 'skills']);
 */
export async function invokeCli(args: string[]): Promise<JsonEvent[]> {
  /* 统一补上 --json flag；放在最前面符合 CLI 的全局 flag 习惯 */
  const fullArgs = ['--json', ...args];

  const result = await invoke<CliResult>('invoke_cli', { args: fullArgs });

  /* 进程层面失败：抛异常供上层捕获 */
  if (result.exit_code !== 0 && !result.stdout) {
    throw new CliError(
      `CLI 执行失败（exit_code=${result.exit_code}）：${result.stderr || '未知错误'}`,
      result.exit_code,
    );
  }

  /* 解析 NDJSON：每一行一个事件 */
  return parseNdjson(result.stdout);
}

/**
 * 检查 aitools CLI 是否在系统 PATH 中可用
 *
 * 桌面 App 启动时调用，决定首屏状态（可用 or 未检测到）。
 */
export async function checkCliAvailable(): Promise<boolean> {
  return await invoke<boolean>('check_cli_available');
}

/* ============================================================
 * NDJSON 解析
 * ============================================================ */

/**
 * 解析 NDJSON 字符串为事件数组
 *
 * - 忽略空行
 * - 解析失败的行会被跳过并记录警告（不应阻塞主流程）
 */
function parseNdjson(raw: string): JsonEvent[] {
  const events: JsonEvent[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as JsonEvent;
      events.push(parsed);
    } catch (err) {
      /* 单行解析失败不致命：可能是 CLI 输出了非 JSON 调试信息 */
      console.warn('[cli] NDJSON 行解析失败：', trimmed, err);
    }
  }

  return events;
}

/* ============================================================
 * 自定义错误：便于 UI 层分辨不同失败场景
 * ============================================================ */

/** CLI 调用错误 */
export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/* ============================================================
 * 高层：业务函数
 * ============================================================ */

/**
 * 单个类型的资源列表查询结果
 * 合并了 user 与 project 两段（CLI 通过两个 list 事件分别发出）
 */
export interface ResourceListResult {
  /** 用户级资源 */
  userResources: ResourceListItem[];
  /** 项目级资源（仅当 cwd 有 .aitools/project.yaml 时非空） */
  projectResources: ResourceListItem[];
  /** 已启用目标列表（来自 user 段的 enabledTargets） */
  enabledTargets: string[];
}

/**
 * 查询指定类型资源的完整列表
 *
 * @param type 资源类型（当前 CLI 仅 'skills' 已实现，其他为占位）
 */
export async function listResources(type: ResourceType): Promise<ResourceListResult> {
  const events = await invokeCli(['list', type]);

  /* 先检查是否有 error 事件 */
  const errorEvent = events.find((e): e is Extract<JsonEvent, { event: 'error' }> =>
    e.event === 'error',
  );
  if (errorEvent) {
    throw new CliError(errorEvent.data.message, -1);
  }

  /* 提取两段 list 事件 */
  const listEvents = events.filter(
    (e): e is Extract<JsonEvent, { event: 'list' }> => e.event === 'list',
  );

  const userEvent = listEvents.find((e) => e.data.scope === 'user');
  const projectEvent = listEvents.find((e) => e.data.scope === 'project');

  return {
    userResources: userEvent?.data.resources ?? [],
    projectResources: projectEvent?.data.resources ?? [],
    enabledTargets: userEvent?.data.enabledTargets ?? [],
  };
}

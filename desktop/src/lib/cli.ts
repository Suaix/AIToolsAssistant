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
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/* ============================================================
 * 类型定义（对齐 CLI v0.4 的 src/types/index.ts）
 * ============================================================ */

/** 资源类型 */
export type ResourceType = 'skills' | 'commands' | 'agents' | 'rules';

/** 订阅落点类型（v0.4：取代旧的 ResourceScope） */
export type SubscriptionScope = 'user' | 'project';

/** 单个资源对单个目标的同步状态 */
export type SyncStatus = 'synced' | 'changed' | 'not_synced';

/**
 * 单个 target 的同步状态（v0.4 新结构）
 */
export interface SubscriptionTargetStatus {
  /** 目标工具名（如 'codebuddy'） */
  target: string;
  /** 在该目标的同步状态 */
  status: SyncStatus;
  /** 该资源在目标中的绝对路径 */
  targetPath: string;
}

/**
 * 单条订阅的展开状态（v0.4 新结构）
 */
export interface SubscriptionStatus {
  /** 订阅落点类型 */
  scope: SubscriptionScope;
  /** 项目目录路径（仅 scope='project' 时有值） */
  projectDir?: string;
  /** 本订阅位置下、各 target 的同步状态 */
  targets: SubscriptionTargetStatus[];
}

/**
 * 一个资源的完整视图（v0.4 核心数据结构）
 * list 命令与 GUI 卡片都以此为单一数据结构
 */
export interface ResourceView {
  /** 资源显示名称 */
  name: string;
  /** 资源文件夹名 */
  dirName: string;
  /** 描述（可能为 '-'） */
  description: string;
  /** 资源类型 */
  type: ResourceType;
  /** 源目录的绝对路径 */
  path: string;
  /** 资源文件夹的 SHA-256 hash */
  sourceHash: string;
  /** 所有订阅位置；空数组表示未被任何位置订阅（候选） */
  subscriptions: SubscriptionStatus[];
}

/**
 * 订阅位置的 JSON 表达（v0.4 sync 事件用于描述落点）
 */
export interface SyncLocationData {
  /** 落点类型 */
  scope: SubscriptionScope;
  /** 项目路径（scope=project 时有值） */
  projectDir?: string;
}

/** list 事件载荷（v0.4 协议 version: 2） */
export interface ListEventData {
  /** 事件协议版本 */
  version: 2;
  /** 资源类型 */
  type: ResourceType;
  /** 本类型下的所有资源视图 */
  resources: ResourceView[];
  /** 已启用目标名列表 */
  enabledTargets: string[];
  /** 当前 cwd 对应的项目路径（仅当 project.yaml 存在时有值） */
  projectDir?: string;
}

/** sync start 事件载荷（v0.4：scope → location） */
export interface SyncStartData {
  /** 事件协议版本 */
  version: 2;
  type: ResourceType;
  /** 订阅落点 */
  location: SyncLocationData;
  /** 本次将要处理的任务总数（resource × target） */
  total: number;
  /** 参与的目标名列表 */
  targets: string[];
}

/** sync progress 事件载荷（v0.4：scope → location） */
export interface SyncProgressData {
  /** 事件协议版本 */
  version: 2;
  /** 资源名（文件夹名） */
  resource: string;
  /** 目标工具名 */
  target: string;
  /** 订阅落点 */
  location: SyncLocationData;
  /** 动作：created / updated / skipped / failed */
  action: 'created' | 'updated' | 'skipped' | 'failed';
  /** 当前进度（1-based） */
  index: number;
  /** 总任务数 */
  total: number;
  /** 失败原因 */
  error?: string;
}

/** sync summary 事件载荷（v0.4：scope → location） */
export interface SyncSummaryData {
  /** 事件协议版本 */
  version: 2;
  type: ResourceType;
  /** 订阅落点 */
  location: SyncLocationData;
  totalSkills: number;
  created: number;
  updated: number;
  skipped: number;
}

/** 所有 CLI JSON 事件的联合类型（v0.4：新增 target.enabled / target.disabled） */
export type JsonEvent =
  | { event: 'list'; data: ListEventData }
  | { event: 'start'; data: SyncStartData }
  | { event: 'progress'; data: SyncProgressData }
  | { event: 'summary'; data: SyncSummaryData }
  | { event: 'done'; data: { exitCode: number } }
  | { event: 'error'; data: { message: string; code?: string } }
  | { event: 'target.enabled'; data: { name: string; changed: boolean } }
  | { event: 'target.disabled'; data: { name: string; changed: boolean } }
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
export async function invokeCli(args: string[], cwd?: string): Promise<JsonEvent[]> {
  /* 统一补上 --json flag；放在最前面符合 CLI 的全局 flag 习惯 */
  const fullArgs = ['--json', ...args];

  const result = await invoke<CliResult>('invoke_cli', {
    args: fullArgs,
    cwd: cwd ?? null,
  });

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
 * 单个类型的资源列表查询结果（v0.4：统一为单段 resources）
 */
export interface ResourceListResult {
  /** 所有资源视图（含订阅与同步状态） */
  resources: ResourceView[];
  /** 已启用目标列表 */
  enabledTargets: string[];
  /** 当前 cwd 对应的项目路径（仅当 project.yaml 存在时有值） */
  projectDir?: string;
}

/**
 * 查询指定类型资源的完整列表
 *
 * v0.4：CLI 每种类型只输出一条 list 事件，不再按 scope 拆分
 *
 * @param type 资源类型
 * @param cwd 可选的工作目录（影响 CLI 的项目级订阅检测）
 */
export async function listResources(type: ResourceType, cwd?: string): Promise<ResourceListResult> {
  const events = await invokeCli(['list', type], cwd);

  /* 先检查是否有 error 事件 */
  const errorEvent = events.find((e): e is Extract<JsonEvent, { event: 'error' }> =>
    e.event === 'error',
  );
  if (errorEvent) {
    throw new CliError(errorEvent.data.message, -1);
  }

  /* v0.4：提取唯一一条 list 事件 */
  const listEvent = events.find(
    (e): e is Extract<JsonEvent, { event: 'list' }> => e.event === 'list',
  );

  return {
    resources: listEvent?.data.resources ?? [],
    enabledTargets: listEvent?.data.enabledTargets ?? [],
    projectDir: listEvent?.data.projectDir,
  };
}

/* ============================================================
 * 订阅 / 取消订阅操作（v0.4 · RFC-002 阶段 2 新增）
 * ============================================================ */

/**
 * 订阅操作的选项
 */
export interface SubscribeOptions {
  /** 资源类型 */
  type: ResourceType;
  /** 资源 dirName */
  name: string;
  /** 订阅落点 */
  scope: SubscriptionScope;
  /** 订阅后是否立即同步 */
  sync?: boolean;
  /** 工作目录（scope=project 时应传入项目路径） */
  cwd?: string;
}

/**
 * 订阅一个资源到指定位置
 */
export async function subscribeResource(options: SubscribeOptions): Promise<JsonEvent[]> {
  const args = ['subscribe', options.type, options.name, '--scope', options.scope];
  if (options.sync) {
    args.push('--sync');
  }
  return await invokeCli(args, options.cwd);
}

/**
 * 取消订阅操作的选项
 */
export interface UnsubscribeOptions {
  /** 资源类型 */
  type: ResourceType;
  /** 资源 dirName */
  name: string;
  /** 订阅落点 */
  scope: SubscriptionScope;
  /** 是否清理已同步文件 */
  prune?: boolean;
  /** 工作目录（scope=project 时应传入项目路径） */
  cwd?: string;
}

/**
 * 取消订阅一个资源
 */
export async function unsubscribeResource(options: UnsubscribeOptions): Promise<JsonEvent[]> {
  const args = ['unsubscribe', options.type, options.name, '--scope', options.scope];
  if (options.prune) {
    args.push('--prune');
  }
  return await invokeCli(args, options.cwd);
}

/* ============================================================
 * Target 管理（v0.4.2 · RFC-001.1 + RFC-002 阶段 3）
 * ============================================================ */

/**
 * 单个 target 在 GUI 中的展示信息
 * 由 `aitools list --json` 的 enabledTargets 和 config 推导
 */
export interface TargetInfo {
  /** target 名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 在该 target 上的订阅资源数 */
  subscriptionCount: number;
}

/**
 * 设置 target 的启用/禁用状态
 *
 * 生成命令：`aitools target enable|disable <name> --json`
 * 返回 CLI 输出的事件数组
 *
 * @param name target 名称
 * @param enabled 目标状态（true=启用，false=禁用）
 */
export async function setTargetEnabled(
  name: string,
  enabled: boolean,
): Promise<JsonEvent[]> {
  const subcommand = enabled ? 'enable' : 'disable';
  return await invokeCli(['target', subcommand, name]);
}

/* ============================================================
 * Config 管理（FEAT-002 新增）
 * ============================================================ */

/**
 * 获取配置项值
 *
 * 调用 `aitools config <key>` 并从 JSON 事件中提取 value
 *
 * @param key 配置项名（如 'root'）
 * @returns 配置值，获取失败返回 null
 */
export async function getConfigValue(key: string): Promise<string | null> {
  try {
    const events = await invokeCli(['config', key]);
    const getEvent = events.find(
      (e) => e.event === 'config.get',
    ) as { event: 'config.get'; data: { key: string; value: string } } | undefined;
    return getEvent?.data.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 更改根目录路径
 *
 * @param newPath 新的根目录路径
 * @param migrate 是否迁移旧目录资源
 * @returns 成功/失败信息
 */
export async function setConfigRoot(
  newPath: string,
  migrate?: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    const args = ['config', 'root', newPath];
    if (migrate) args.push('--migrate');
    const events = await invokeCli(args);

    /** 检查错误事件 */
    const errorEvent = events.find(
      (e): e is Extract<JsonEvent, { event: 'error' }> => e.event === 'error',
    );
    if (errorEvent) {
      return { success: false, error: errorEvent.data.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * 获取 CLI 版本号
 *
 * 调用 aitools --version 并解析输出
 *
 * @returns 版本号字符串（如 "0.4.2"），失败返回 null
 */
export async function getCliVersion(): Promise<string | null> {
  try {
    const result = await invoke<{ exit_code: number; stdout: string; stderr: string }>(
      'invoke_cli',
      { args: ['--version'], cwd: null },
    );
    if (result.exit_code === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/* ============================================================
 * 流式调用：sync 命令专用
 * ============================================================ */

/** 流式 CLI 调用的回调集 */
export interface SyncStreamCallbacks {
  /** 每收到一个 JSON 事件触发（已解析） */
  onEvent: (event: JsonEvent) => void;
  /** CLI 执行结束触发（成功/失败都会触发一次） */
  onDone: (result: { exitCode: number; stderr: string }) => void;
}

/**
 * 启动一次流式 sync 调用
 *
 * 典型用法：
 *   const ctl = await runSyncStream(['sync', 'skills'], {
 *     onEvent: (e) => {...},
 *     onDone:  (r) => {...},
 *   });
 *   // 若用户中途关闭 Modal：ctl.unlisten() 取消监听（不会杀子进程，但前端不再处理）
 *
 * @param args CLI 参数数组（不含 --json，Rust 侧会自动加）
 * @param callbacks 事件回调集
 * @returns 取消订阅的控制器
 */
export async function runSyncStream(
  args: string[],
  callbacks: SyncStreamCallbacks,
  cwd?: string,
): Promise<{ unlisten: () => void }> {
  /* 生成唯一 stream_id：时间戳 + 随机后缀（字母数字短横线，符合 Rust 白名单） */
  const streamId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lineEvent = `cli-stream://${streamId}`;
  const doneEvent = `cli-stream-done://${streamId}`;

  /* 订阅：逐行 NDJSON */
  const unlistenLine: UnlistenFn = await listen<{ line: string }>(
    lineEvent,
    (ev) => {
      const raw = ev.payload?.line ?? '';
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as JsonEvent;
        callbacks.onEvent(parsed);
      } catch (err) {
        /* 单行解析失败不致命：可能是 CLI 输出了非 JSON 调试信息 */
        console.warn('[cli-stream] NDJSON 行解析失败：', raw, err);
      }
    },
  );

  /* 订阅：进程结束 */
  const unlistenDone: UnlistenFn = await listen<{
    exit_code: number;
    stderr: string;
  }>(doneEvent, (ev) => {
    /* 进程结束时自动解除两个监听，避免泄漏 */
    unlistenLine();
    unlistenDone();
    callbacks.onDone({
      exitCode: ev.payload.exit_code,
      stderr: ev.payload.stderr,
    });
  });

  /* 触发 Rust 侧启动子进程；Rust 立即 Ok 返回，真实事件走 listen 频道 */
  try {
    await invoke('invoke_cli_stream', { args, streamId, cwd: cwd ?? null });
  } catch (err) {
    /* 启动失败时也要解除监听，避免泄漏 */
    unlistenLine();
    unlistenDone();
    throw new CliError(
      `启动同步失败: ${err instanceof Error ? err.message : String(err)}`,
      -1,
    );
  }

  /* 返回手动取消控制器，前端可在 Modal 卸载时调用 */
  return {
    unlisten: () => {
      unlistenLine();
      unlistenDone();
    },
  };
}

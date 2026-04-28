/**
 * 订阅解析与展开模块（v0.4.0 PR-2 新增）
 *
 * 职责：把"订阅清单"（config.yaml 的 user_subscriptions + project.yaml）
 * 展开为一条条"同步任务"（资源 × 订阅落点 × 目标工具）。
 *
 * 设计要点：
 * - 本模块**只做计算，不做 IO**（不读文件、不拷贝）。所有订阅清单与资源元数据由
 *   调用方先加载好后传入，这样便于单元测试与未来 GUI 复用。
 * - 输出的 `ExpandedTask` 是同步引擎（sync）与状态查询（list）共用的最小单元。
 * - 本模块不区分 user/project 业务分支；所有分支差异在任务本身的 `location` 字段里。
 *
 * 参考：RFC-001 §2 核心概念、§3.2 资源元数据
 */
import path from 'node:path';
import { expandTilde } from '../config/manager.js';
import type {
  Config,
  ProjectConfig,
  ResourceInfo,
  ResourceType,
  SubscriptionScope,
  Target,
} from '../types/index.js';

/* ============================================================
 * 类型：订阅落点 & 展开后的同步任务
 * ============================================================ */

/**
 * 订阅落点：描述"订阅要把资源送到哪种位置"
 * - user：全局用户级，落到 `<user_base>/<resourceDirName>/<name>/`
 * - project：某个项目级，落到 `<projectDir>/.<target.name>/<resourceDirName>/<name>/`
 */
export interface SubscriptionLocation {
  /** 落点类型 */
  scope: SubscriptionScope;
  /** 项目绝对路径；仅 scope=project 时有值 */
  projectDir?: string;
}

/**
 * 一条展开后的同步任务（最小原子单元）
 * 一次 sync 会产生 N 条 ExpandedTask，一条任务对应"一次文件夹级拷贝 + hash 对比"
 */
export interface ExpandedTask {
  /** 资源类型 */
  type: ResourceType;
  /** 资源元数据（含源路径、dirName 等） */
  resource: ResourceInfo;
  /** 该任务的订阅落点 */
  location: SubscriptionLocation;
  /** 该任务写入的目标工具 */
  target: Target;
  /** 目标侧资源的绝对路径（<base>/<resourceDirName>/<dirName>/） */
  targetPath: string;
}

/**
 * 单条订阅展开后的结果（按"资源 × 落点"聚合；一个聚合产出 N 个 target 任务）
 * 用于 list 命令展示"每个资源订阅到哪个位置、该位置下各 target 的状态"
 */
export interface ExpandedSubscription {
  /** 资源元数据 */
  resource: ResourceInfo;
  /** 订阅落点 */
  location: SubscriptionLocation;
  /** 本落点下、要落到的所有 target 任务（每个 target 一条） */
  tasks: ExpandedTask[];
}

/* ============================================================
 * 目标路径推导
 * ============================================================ */

/**
 * 推导单个「资源 × 落点 × 目标」的绝对写入路径
 * @param type 资源类型（用于拼 resourceDirName，此处直接与 type 字面量相同）
 * @param resourceDirName 资源类型对应的目录名（如 'skills'）
 * @param resource 资源元数据
 * @param location 订阅落点
 * @param target 目标工具配置
 * @returns 目标资源目录的绝对路径
 */
export function resolveTargetPath(
  resourceDirName: string,
  resource: ResourceInfo,
  location: SubscriptionLocation,
  target: Target,
): string {
  if (location.scope === 'user') {
    /* 用户级：<user_base>/<resourceDirName>/<dirName>/ */
    return path.join(
      expandTilde(target.user_base),
      resourceDirName,
      resource.dirName,
    );
  }
  /* 项目级：<projectDir>/.<target.name>/<resourceDirName>/<dirName>/ */
  if (!location.projectDir) {
    /* 类型已约束，但运行期兜底抛错避免静默错误 */
    throw new Error(
      `项目级订阅必须提供 projectDir（资源=${resource.dirName}, target=${target.name}）`,
    );
  }
  return path.join(
    location.projectDir,
    `.${target.name}`,
    resourceDirName,
    resource.dirName,
  );
}

/* ============================================================
 * 订阅展开核心算法
 * ============================================================ */

/**
 * 展开订阅清单的输入参数
 */
export interface ExpandSubscriptionsInput {
  /** 资源类型 */
  type: ResourceType;
  /** 该类型对应的资源目录名（通常等于 type 字面量，但由 handler 声明，保留灵活性） */
  resourceDirName: string;
  /** 源目录扫描到的全部资源（PR-2 扁平扫描结果） */
  resources: ResourceInfo[];
  /** 已启用的目标工具列表（从 config.targets 过滤 enabled） */
  enabledTargets: Target[];
  /** 用户级订阅的资源 dirName 列表（来自 config.user_subscriptions.<type>） */
  userSubscriptions: string[];
  /**
   * 当前项目的订阅上下文
   * - `null` 表示当前 cwd 没有项目配置（不参与项目级展开）
   * - 否则提供 projectDir（绝对路径）和项目订阅的资源 dirName 列表
   */
  projectContext:
    | null
    | {
        /** 项目绝对路径 */
        projectDir: string;
        /** 项目级订阅的资源 dirName 列表（来自 project.yaml.<type>） */
        subscriptions: string[];
      };
  /**
   * 目标过滤器：仅展开指定目标名
   * 对应 CLI 的 `--target <name>`；不传则展开所有已启用目标
   */
  targetFilter?: string;
  /**
   * 落点过滤器：仅展开指定 scope 的订阅
   * 对应 CLI 的 `--scope <scope>`；不传则同时展开 user 与 project
   */
  scopeFilter?: SubscriptionScope;
  /**
   * 资源名过滤器：仅展开指定 dirName 的订阅
   * 对应 CLI 的 `aitools sync <type> <name>` 位置参数
   * 若指定但订阅清单中不包含该名字 → tasks 为空、orphanNames 也为空（不视为孤儿）
   */
  nameFilter?: string;
}

/**
 * 输出：展开后的全部同步任务 + 订阅视图
 */
export interface ExpandSubscriptionsOutput {
  /** 按"资源 × 落点"聚合的订阅视图（用于 list 命令、GUI 卡片） */
  subscriptions: ExpandedSubscription[];
  /** 扁平任务列表（用于 sync 引擎逐条执行） */
  tasks: ExpandedTask[];
  /** 展开过程中发现的"孤儿订阅"：订阅了但源目录已没有的资源名 */
  orphanNames: string[];
}

/**
 * 把订阅清单展开为同步任务与订阅视图
 *
 * 处理顺序：
 * 1. 先扫一遍 user 订阅，按名称匹配 resources → 产出 user 落点的 tasks
 * 2. 再扫一遍 project 订阅（若提供了 projectContext），产出 project 落点的 tasks
 * 3. 对"订阅了但源里不存在"的资源名收集为 orphanNames，不抛错（调用方决定是否 warn）
 *
 * 目标过滤 / 落点过滤在展开阶段就生效，减少下游判断。
 *
 * @param input 展开所需输入（见 ExpandSubscriptionsInput）
 * @returns 展开结果
 */
export function expandSubscriptions(
  input: ExpandSubscriptionsInput,
): ExpandSubscriptionsOutput {
  const {
    type,
    resourceDirName,
    resources,
    enabledTargets,
    userSubscriptions,
    projectContext,
    targetFilter,
    scopeFilter,
    nameFilter,
  } = input;

  /* 先建 dirName → ResourceInfo 索引，避免 N×M 查找 */
  const resourceByName = new Map<string, ResourceInfo>();
  for (const r of resources) {
    resourceByName.set(r.dirName, r);
  }

  /* 过滤目标 */
  const targets = targetFilter
    ? enabledTargets.filter((t) => t.name === targetFilter)
    : enabledTargets;

  /* 名称过滤器：在两条订阅列表上应用同一个 name 过滤 */
  const userSubs = nameFilter
    ? userSubscriptions.filter((n) => n === nameFilter)
    : userSubscriptions;
  const projSubs =
    projectContext !== null
      ? nameFilter
        ? projectContext.subscriptions.filter((n) => n === nameFilter)
        : projectContext.subscriptions
      : [];

  const subscriptions: ExpandedSubscription[] = [];
  const tasks: ExpandedTask[] = [];
  const orphanNames: string[] = [];

  /* ---- user 落点 ---- */
  if (!scopeFilter || scopeFilter === 'user') {
    for (const name of userSubs) {
      const resource = resourceByName.get(name);
      if (!resource) {
        orphanNames.push(name);
        continue;
      }
      const location: SubscriptionLocation = { scope: 'user' };
      const subTasks: ExpandedTask[] = [];
      for (const target of targets) {
        const targetPath = resolveTargetPath(
          resourceDirName,
          resource,
          location,
          target,
        );
        const task: ExpandedTask = {
          type,
          resource,
          location,
          target,
          targetPath,
        };
        subTasks.push(task);
        tasks.push(task);
      }
      if (subTasks.length > 0) {
        subscriptions.push({ resource, location, tasks: subTasks });
      }
    }
  }

  /* ---- project 落点 ---- */
  if (
    (!scopeFilter || scopeFilter === 'project') &&
    projectContext !== null
  ) {
    const location: SubscriptionLocation = {
      scope: 'project',
      projectDir: projectContext.projectDir,
    };
    for (const name of projSubs) {
      const resource = resourceByName.get(name);
      if (!resource) {
        /**
         * 同一个 orphan name 可能在 user / project 都订阅了；去重
         * 保持列表简洁，但保留先加入者（通常是 user 先）
         */
        if (!orphanNames.includes(name)) {
          orphanNames.push(name);
        }
        continue;
      }
      const subTasks: ExpandedTask[] = [];
      for (const target of targets) {
        const targetPath = resolveTargetPath(
          resourceDirName,
          resource,
          location,
          target,
        );
        const task: ExpandedTask = {
          type,
          resource,
          location,
          target,
          targetPath,
        };
        subTasks.push(task);
        tasks.push(task);
      }
      if (subTasks.length > 0) {
        subscriptions.push({ resource, location, tasks: subTasks });
      }
    }
  }

  return { subscriptions, tasks, orphanNames };
}

/* ============================================================
 * 便捷合成：从 Config + ProjectConfig 直接取用户级订阅 dirName 列表
 * ============================================================ */

/**
 * 从全局配置中读取指定类型的用户级订阅 dirName 列表
 * @param config 全局配置
 * @param type 资源类型
 * @returns dirName 数组（可能为空）
 */
export function getUserSubsForType(
  config: Config,
  type: ResourceType,
): string[] {
  const subs = config.user_subscriptions;
  switch (type) {
    case 'skills':
      return subs.skills ?? [];
    case 'commands':
      return subs.commands ?? [];
    case 'agents':
      return subs.agents ?? [];
    case 'rules':
      return subs.rules ?? [];
  }
}

/**
 * 从项目配置中读取指定类型的订阅 dirName 列表
 * @param projectConfig 项目配置（可能为 null）
 * @param type 资源类型
 * @returns dirName 数组（projectConfig 为 null 时返回空数组）
 */
export function getProjectSubsForType(
  projectConfig: ProjectConfig | null,
  type: ResourceType,
): string[] {
  if (!projectConfig) {
    return [];
  }
  switch (type) {
    case 'skills':
      return projectConfig.skills ?? [];
    case 'commands':
      return projectConfig.commands ?? [];
    case 'agents':
      return projectConfig.agents ?? [];
    case 'rules':
      return projectConfig.rules ?? [];
  }
}

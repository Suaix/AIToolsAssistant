/**
 * 资源状态计算模块（v0.4.0 PR-5 新增）
 *
 * 职责：把订阅展开结果 + 实际文件系统状态 → 合成 `ResourceView[]`
 *
 * 工作流：
 *   1. 调用 subscriptions.expandSubscriptions 拿到每个订阅位置的 tasks
 *   2. 对每个 task 做 hash 比对，确定单个 target 的 status
 *   3. 按"资源 × 落点"聚合成 SubscriptionStatus
 *   4. 组装成 ResourceView
 *
 * 参考：RFC-001 §3.2 ResourceView
 */
import { hashDirectory, hashDirectorySafe } from './hasher.js';
import {
  expandSubscriptions,
  type ExpandSubscriptionsInput,
  type ExpandedSubscription,
} from './subscriptions.js';
import type {
  ResourceView,
  SubscriptionStatus,
  SubscriptionTargetStatus,
} from '../types/index.js';

/* ============================================================
 * 单资源视图构建
 * ============================================================ */

/**
 * 为单个订阅聚合计算其 SubscriptionStatus
 * （包含各 target 的同步状态）
 *
 * @param sub 一个展开后的订阅（含 tasks 列表）
 * @param sourceHash 源资源的 hash（多个 target 复用同一 hash，避免重复计算）
 */
async function computeSubscriptionStatus(
  sub: ExpandedSubscription,
  sourceHash: string,
): Promise<SubscriptionStatus> {
  const targets: SubscriptionTargetStatus[] = [];

  for (const task of sub.tasks) {
    const targetHash = await hashDirectorySafe(task.targetPath);
    let status: SubscriptionTargetStatus['status'];
    if (targetHash === null) {
      status = 'not_synced';
    } else if (targetHash === sourceHash) {
      status = 'synced';
    } else {
      status = 'changed';
    }
    targets.push({
      target: task.target.name,
      status,
      targetPath: task.targetPath,
    });
  }

  return {
    scope: sub.location.scope,
    ...(sub.location.projectDir
      ? { projectDir: sub.location.projectDir }
      : {}),
    targets,
  };
}

/* ============================================================
 * 主函数：构建 ResourceView[]
 * ============================================================ */

/**
 * 基于订阅展开结果，为源目录中的每个资源构建 ResourceView
 *
 * 特点：
 * - 所有扫描到的资源都会出现在结果里（即使未被订阅，subscriptions 数组为空）
 *   这样 GUI 可以展示"源里有哪些候选可订阅"
 * - 源 hash 只计算一次、在多个订阅间复用
 * - 孤儿订阅（订阅了但源里没有）由展开模块收集，这里忽略（由调用方决定是否 warn）
 *
 * @param input 与 expandSubscriptions 完全相同的输入
 * @returns ResourceView 数组（按 resource 字母序）与孤儿列表
 */
export async function buildResourceViews(
  input: ExpandSubscriptionsInput,
): Promise<{
  views: ResourceView[];
  orphanNames: string[];
}> {
  /* 先展开，拿到每条订阅对应的 tasks */
  const expanded = expandSubscriptions(input);

  /* 按 resource.dirName 聚合订阅（一个资源可能有多条订阅） */
  const subsByResource = new Map<string, ExpandedSubscription[]>();
  for (const sub of expanded.subscriptions) {
    const key = sub.resource.dirName;
    const arr = subsByResource.get(key);
    if (arr) {
      arr.push(sub);
    } else {
      subsByResource.set(key, [sub]);
    }
  }

  /* 为每个资源构建 ResourceView */
  const views: ResourceView[] = [];
  for (const resource of input.resources) {
    const sourceHash = await hashDirectory(resource.path);
    const subs = subsByResource.get(resource.dirName) ?? [];
    const subscriptions: SubscriptionStatus[] = [];
    for (const sub of subs) {
      subscriptions.push(await computeSubscriptionStatus(sub, sourceHash));
    }
    views.push({
      name: resource.name,
      dirName: resource.dirName,
      description: resource.description,
      type: input.type,
      path: resource.path,
      sourceHash,
      subscriptions,
    });
  }

  /* 按 dirName 排序输出，保证稳定 */
  views.sort((a, b) => a.dirName.localeCompare(b.dirName));

  return {
    views,
    orphanNames: expanded.orphanNames,
  };
}

/* ============================================================
 * 便捷：将 ResourceView 切片为"已订阅 / 未订阅候选"两组
 * human 模式输出时用
 * ============================================================ */

/**
 * 把 ResourceView 数组按"是否已被订阅"切片
 */
export function splitBySubscribed(views: ResourceView[]): {
  subscribed: ResourceView[];
  unsubscribed: ResourceView[];
} {
  const subscribed: ResourceView[] = [];
  const unsubscribed: ResourceView[] = [];
  for (const v of views) {
    if (v.subscriptions.length > 0) {
      subscribed.push(v);
    } else {
      unsubscribed.push(v);
    }
  }
  return { subscribed, unsubscribed };
}

/**
 * 统计 ResourceView 数组中的"未完全同步"个数
 * 规则：只要有任意一条订阅的任意一个 target status !== 'synced'，就计为 1 个未同步
 *
 * @returns 未同步资源个数（用于 list 底部汇总提示）
 */
export function countUnsynced(views: ResourceView[]): number {
  let count = 0;
  for (const v of views) {
    for (const sub of v.subscriptions) {
      if (sub.targets.some((t) => t.status !== 'synced')) {
        count++;
        break;
      }
    }
  }
  return count;
}

/**
 * v0.2.0 → v0.4.0 全局配置迁移（FEAT-005）
 *
 * 历史背景：
 *   v0.2.0 之前，Target 字段名为 user_path；v0.2.0 改为 user_base。
 *   原 validateConfig 检测到 user_path 直接抛错让用户重建，FEAT-005 改为自动迁移。
 *
 * 迁移规则：
 *   targets[].user_path → targets[].user_base
 *   删除 user_path 字段
 */

import type { MigrationChange } from './reporter.js';

/** 单步迁移返回结果 */
export interface MigrationStepResult {
  /** 是否发生了实际变更 */
  changed: boolean;
  /** 人类可读变更描述列表 */
  changes: MigrationChange[];
}

/**
 * 执行 v0.2.0 → v0.4.0 字段迁移
 *
 * 幂等：若 targets 中已无 user_path，直接返回 { changed: false }。
 * 不修改非 targets 字段；缺失 targets 字段视为无操作。
 *
 * @param parsed 已 yaml.parse 后的对象（不可信，需类型守卫）
 * @returns 迁移步骤结果
 */
export function migrateV02ToV04(
  parsed: Record<string, unknown>,
): MigrationStepResult {
  const targets = parsed.targets;
  if (!Array.isArray(targets)) {
    return { changed: false, changes: [] };
  }

  const changes: MigrationChange[] = [];
  let changed = false;

  for (const target of targets) {
    if (!target || typeof target !== 'object') continue;
    const t = target as Record<string, unknown>;

    /* 检测旧字段 user_path */
    if ('user_path' in t && !('user_base' in t)) {
      const oldValue = t.user_path;
      t.user_base = oldValue;
      delete t.user_path;
      changed = true;
      changes.push({
        message: `Target "${String(t.name ?? '?')}" 字段重命名：user_path → user_base`,
        path: `targets[].user_path`,
      });
    } else if ('user_path' in t) {
      /* 两个字段同时存在（极少见的脏数据），删除旧字段 */
      delete t.user_path;
      changed = true;
      changes.push({
        message: `Target "${String(t.name ?? '?')}" 删除冗余字段 user_path（已有 user_base）`,
        path: `targets[].user_path`,
      });
    }
  }

  return { changed, changes };
}

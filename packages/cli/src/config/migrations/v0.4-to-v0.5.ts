/**
 * v0.4.0 → v0.5.0 配置迁移（FEAT-005）
 *
 * 涵盖三件事：
 *   1. 补 user_subscriptions 字段默认值（仅 Config）
 *   2. Claude 工具命名统一：claude-code / claude → claude-internal（含 user_base 改写）
 *   3. 写入 version 字段（CURRENT_CONFIG_VERSION / CURRENT_PROJECT_CONFIG_VERSION）
 *
 * 迁移源数据来自 SSOT：shared/tools.json 的 legacyAliases / legacyUserBases。
 */

import {
  getLegacyAliases,
  getLegacyUserBases,
} from '../../registry/tools.js';
import type { MigrationChange } from './reporter.js';
import type { MigrationStepResult } from './v0.2-to-v0.4.js';

/**
 * 执行全局 Config 的 v0.4 → v0.5 迁移
 *
 * 幂等：所有改动都基于"是否真的需要变更"判断；多次调用不重复变更。
 *
 * @param parsed 已 yaml.parse 后的对象
 * @returns 迁移步骤结果
 */
export function migrateConfigV04ToV05(
  parsed: Record<string, unknown>,
): MigrationStepResult {
  const changes: MigrationChange[] = [];
  let changed = false;

  /* ----- 1. 补 user_subscriptions ----- */
  if (!('user_subscriptions' in parsed) || parsed.user_subscriptions == null) {
    parsed.user_subscriptions = { skills: [] };
    changed = true;
    changes.push({
      message: '补充缺失的 user_subscriptions 字段（默认空 skills 列表）',
      path: 'user_subscriptions',
    });
  }

  /* ----- 2. Claude 工具命名统一 ----- */
  if (Array.isArray(parsed.targets)) {
    const aliases = getLegacyAliases();
    const userBases = getLegacyUserBases();

    for (const target of parsed.targets) {
      if (!target || typeof target !== 'object') continue;
      const t = target as Record<string, unknown>;

      /* 改名：claude-code → claude-internal 等 */
      if (typeof t.name === 'string' && t.name in aliases) {
        const oldName = t.name;
        const newName = aliases[oldName];
        t.name = newName;
        changed = true;
        changes.push({
          message: `Target 命名统一：${oldName} → ${newName}`,
          path: 'targets[].name',
        });
      }

      /* 改 user_base：~/.claude → ~/.claude-internal 等 */
      if (typeof t.user_base === 'string' && t.user_base in userBases) {
        const oldBase = t.user_base;
        const newBase = userBases[oldBase];
        t.user_base = newBase;
        changed = true;
        changes.push({
          message: `Target user_base 统一：${oldBase} → ${newBase}`,
          path: 'targets[].user_base',
        });
      }
    }
  }

  return { changed, changes };
}

/**
 * 执行项目级 ProjectConfig 的 v0.4 → v0.5 迁移
 *
 * 项目级配置主要变更只有"补 version 字段"，由 index.ts 调度器统一处理；
 * 本函数仅处理项目级 yaml 中可能出现的旧 target 名痕迹（实际场景极少，仅作为兜底）。
 *
 * 当前 ProjectConfig 不含 target 名字段，故此函数为空操作；保留接口以备未来扩展。
 *
 * @param _parsed 已 yaml.parse 后的对象
 * @returns 迁移步骤结果
 */
export function migrateProjectConfigV04ToV05(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _parsed: Record<string, unknown>,
): MigrationStepResult {
  /* ProjectConfig 当前 schema 不含 target 名字段，此版本步骤为空 */
  return { changed: false, changes: [] };
}

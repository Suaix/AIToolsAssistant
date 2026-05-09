/**
 * 配置迁移上报器（FEAT-005）
 *
 * 职责：将迁移结果以解耦方式上报给消费方。
 *   - CLI 端：StdoutMigrationReporter（单行 ℹ 提示 / 阻断式 ✗）
 *   - GUI 端：通过 NDJSON `config.migrated` 事件 + ~/.aitools/.last-migration.json 双通道
 *   - 测试：NoopMigrationReporter（不产生副作用）
 *
 * 设计动因（03-technical.md TD-4）：CLI/GUI 双消费方需要不同表达；解耦后 GUI
 * 可以通过 NDJSON 事件接收；测试场景可注入 NoopReporter 避免控制台噪声。
 */

import { logger } from '../../utils/logger.js';

/* ============================================================
 * 公共类型
 * ============================================================ */

/** 迁移结果联合类型 */
export type MigrationOutcome =
  | { status: 'up_to_date' }
  | {
      status: 'migrated';
      fromVersion: number;
      toVersion: number;
      changes: MigrationChange[];
      backupPath: string;
    }
  | {
      status: 'migrated_with_conflicts';
      changes: MigrationChange[];
      conflicts: ResourceConflict[];
      backupPath: string;
    }
  | { status: 'parse_failed'; error: string }
  | { status: 'write_failed'; error: string; backupPath: string };

/** 单条迁移变更（供 UI 展示） */
export interface MigrationChange {
  /** 人类可读描述，如 "Claude 工具命名：claude-code → claude-internal" */
  message: string;
  /** 影响的字段路径（用于调试日志），可选 */
  path?: string;
}

/** 资源冲突项（旧目录与新目录都有同名资源且内容不同） */
export interface ResourceConflict {
  /** 旧位置绝对路径 */
  oldPath: string;
  /** 新位置绝对路径 */
  newPath: string;
  /** 资源类型（如 'skills'） */
  resourceType: string;
}

/** 迁移上报器协议 */
export interface MigrationReporter {
  /**
   * 上报一次迁移结果
   *
   * 实现注意：本方法可能被多次调用（全局 Config 一次、ProjectConfig 一次或多次）；
   * 实现方需自行处理去重 / 累积 / 显示策略。
   */
  report(outcome: MigrationOutcome): void;
}

/* ============================================================
 * CLI 默认实现：StdoutMigrationReporter
 * ============================================================ */

/**
 * CLI 默认迁移上报器
 *
 * 行为约定（02-design.md §3.4）：
 *   - up_to_date：无任何输出（保持安静）
 *   - migrated：单行 ℹ 提示，含 from/to 版本与备份路径，逐条 changes
 *   - migrated_with_conflicts：阻断式 ✗ 报错，列出冲突清单
 *   - parse_failed / write_failed：阻断式 ✗ 报错
 *
 * 输出走 stderr，不污染 NDJSON 主流（NDJSON 强制走 stdout，避免协议交叉）。
 */
export class StdoutMigrationReporter implements MigrationReporter {
  report(outcome: MigrationOutcome): void {
    switch (outcome.status) {
      case 'up_to_date':
        return;

      case 'migrated':
        logger.info(
          `检测到旧版配置，已自动升级 (v${outcome.fromVersion} → v${outcome.toVersion})`,
        );
        logger.info(`  原配置已备份至：${outcome.backupPath}`);
        for (const change of outcome.changes) {
          logger.info(`  · ${change.message}`);
        }
        return;

      case 'migrated_with_conflicts':
        logger.error('配置迁移检测到资源冲突，请手动处理后重试：');
        for (const conflict of outcome.conflicts) {
          logger.error(`  ${conflict.oldPath}  ←→  ${conflict.newPath}`);
        }
        logger.info(`  原配置已备份至：${outcome.backupPath}`);
        logger.info(`  请检查冲突文件，移除其中一份后重新运行 aitools 命令`);
        return;

      case 'parse_failed':
        logger.error(`配置文件解析失败: ${outcome.error}`);
        return;

      case 'write_failed':
        logger.error(`迁移写入失败: ${outcome.error}`);
        logger.info(`  原配置已备份至：${outcome.backupPath}`);
        return;
    }
  }
}

/* ============================================================
 * Noop 实现（测试用）
 * ============================================================ */

/** 测试用 reporter：不产生任何副作用，但保留最近一次结果便于断言 */
export class NoopMigrationReporter implements MigrationReporter {
  /** 最近一次上报的结果（按调用顺序追加） */
  public outcomes: MigrationOutcome[] = [];

  report(outcome: MigrationOutcome): void {
    this.outcomes.push(outcome);
  }

  /** 取最近一次上报的结果（无则返回 undefined） */
  last(): MigrationOutcome | undefined {
    return this.outcomes[this.outcomes.length - 1];
  }

  /** 重置内部状态（多次测试间使用） */
  reset(): void {
    this.outcomes = [];
  }
}

/* ============================================================
 * 全局默认 reporter（CLI 主流程使用）
 * ============================================================ */

/**
 * 默认迁移 reporter（CLI 主进程使用）
 *
 * 测试场景应在调用 loadConfig 前替换为 NoopMigrationReporter（通过 setReporter）。
 */
let defaultReporter: MigrationReporter = new StdoutMigrationReporter();

/** 获取当前默认 reporter */
export function getDefaultReporter(): MigrationReporter {
  return defaultReporter;
}

/**
 * 注入自定义 reporter（测试用）
 *
 * @param reporter 自定义实现
 */
export function setDefaultReporter(reporter: MigrationReporter): void {
  defaultReporter = reporter;
}

/** 重置为默认 StdoutMigrationReporter（测试 teardown 用） */
export function resetDefaultReporter(): void {
  defaultReporter = new StdoutMigrationReporter();
}

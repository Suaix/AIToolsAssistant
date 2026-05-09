/**
 * ConfigMigrationModal · 配置自动升级提示弹窗（FEAT-005）
 *
 * 触发：GUI 启动时检测到 ~/.aitools/.last-migration.json 存在（CLI 端迁移管线落盘）。
 * 时序：读取后立即删除该文件并 ack 至 localStorage，避免重复弹窗。
 *
 * 设计原则（02-design.md §3.1）：
 *   · L2「诚实先于友好」——标题「配置已自动升级」陈述事实，不卖萌
 *   · L2「明确先于惊喜」——展开变更详情，每条变更逐条列出
 *   · 单 Primary 按钮「我知道了」，关闭即写入 ack 标记
 *
 * 复用 .modal 外壳，沿用既有 token，无新组件。
 */

import { useState } from 'react';
import { X } from 'lucide-react';

/** 单条迁移变更（与 src/config/migrations/reporter.ts 对齐） */
export interface MigrationChange {
  message: string;
  path?: string;
}

/** 资源冲突项 */
export interface ResourceConflict {
  oldPath: string;
  newPath: string;
  resourceType: string;
}

/** 迁移结果（与 CLI 端 MigrationOutcome 对齐；GUI 仅消费 migrated / migrated_with_conflicts 两态） */
export type GuiMigrationOutcome =
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
    };

/** ConfigMigrationModal Props */
export interface ConfigMigrationModalProps {
  /** 迁移结果对象 */
  outcome: GuiMigrationOutcome;
  /** 用户点击「我知道了」或关闭按钮时回调 */
  onAck: () => void;
}

/**
 * 配置自动升级弹窗
 */
export function ConfigMigrationModal({ outcome, onAck }: ConfigMigrationModalProps) {
  /** 变更详情默认折叠，节省视觉重量 */
  const [showDetails, setShowDetails] = useState(false);

  const hasConflicts = outcome.status === 'migrated_with_conflicts';
  const conflicts = hasConflicts ? outcome.conflicts : [];

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="config-migration-title"
      onClick={onAck}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal__header">
          <h2 className="modal__title" id="config-migration-title">
            {hasConflicts ? '配置已升级，但需要你处理冲突' : '配置已自动升级'}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="关闭"
            onClick={onAck}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          <p>
            {hasConflicts
              ? '我们检测到旧版配置并完成了部分升级，但发现了同名资源冲突需要你手动处理。'
              : '我们检测到旧版配置并已为你完成升级。'}
          </p>

          <p style={{ marginTop: 'var(--space-3)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>原始配置已备份至：</span>
            <br />
            <code
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '0.875em',
              }}
            >
              {outcome.backupPath}
            </code>
          </p>

          {/* 变更详情区 */}
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setShowDetails(!showDetails)}
              aria-expanded={showDetails}
            >
              {showDetails ? '▼ 隐藏变更详情' : '▶ 查看变更详情'}
            </button>

            {showDetails && (
              <ul
                style={{
                  marginTop: 'var(--space-2)',
                  paddingLeft: 'var(--space-4)',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.875em',
                }}
              >
                {outcome.status === 'migrated' && (
                  <li>
                    Schema 版本：v{outcome.fromVersion} → v{outcome.toVersion}
                  </li>
                )}
                {outcome.changes.map((c, idx) => (
                  <li key={idx}>{c.message}</li>
                ))}
              </ul>
            )}
          </div>

          {/* 冲突区 */}
          {hasConflicts && (
            <div
              style={{
                marginTop: 'var(--space-4)',
                padding: 'var(--space-3)',
                background: 'var(--color-bg-warning-subtle, var(--color-bg-secondary))',
                border: '1px solid var(--color-border-warning, var(--color-border-default))',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p style={{ fontWeight: 'var(--font-weight-medium)' }}>
                ⚠️ 以下文件存在冲突，需要你手动处理：
              </p>
              <ul
                style={{
                  marginTop: 'var(--space-2)',
                  paddingLeft: 'var(--space-4)',
                  fontSize: '0.875em',
                }}
              >
                {conflicts.map((c, idx) => (
                  <li key={idx} style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                    {c.oldPath} ←→ {c.newPath}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="modal__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onAck}
          >
            我知道了
          </button>
        </footer>
      </div>
    </div>
  );
}

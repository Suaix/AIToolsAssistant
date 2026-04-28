/**
 * SubscribePopover · 订阅选择弹出层
 *
 * RFC-002 §4.3：点击 Unused Tab 卡片的「订阅」按钮后弹出
 * 用户选择：
 *   1. 订阅到哪里？（用户级 / 项目级）
 *   2. 订阅后是否立即同步
 *
 * 设计系统：复用 .modal（xs 尺寸）作为简易弹出层
 * L2 原则「明确先于惊喜」：scope 必须显式选择
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import type { SubscriptionScope } from '../lib/cli';

/**
 * 组件 Props
 */
export interface SubscribePopoverProps {
  /** 资源显示名称（用于弹窗标题） */
  resourceName: string;
  /** 是否有项目上下文（决定是否允许选择「项目级」） */
  hasProject: boolean;
  /** 确认回调 */
  onConfirm: (scope: SubscriptionScope, sync: boolean) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 订阅选择弹出层
 */
export function SubscribePopover({
  resourceName,
  hasProject,
  onConfirm,
  onCancel,
}: SubscribePopoverProps) {
  /** 选中的 scope */
  const [scope, setScope] = useState<SubscriptionScope>('user');
  /** 是否勾选「订阅后立即同步」 */
  const [syncAfter, setSyncAfter] = useState(true);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-popover-title"
    >
      <div className="modal modal--xs">
        <header className="modal__header">
          <h2 className="modal__title" id="subscribe-popover-title">
            订阅「{resourceName}」
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="取消"
            onClick={onCancel}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          <p
            style={{
              margin: '0 0 var(--space-4)',
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--color-text-secondary)',
            }}
          >
            订阅到哪里？
          </p>

          {/* scope 单选 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                cursor: 'pointer',
                fontSize: 'var(--text-body-size)',
                color: 'var(--color-text-primary)',
              }}
            >
              <input
                type="radio"
                name="subscribe-scope"
                checked={scope === 'user'}
                onChange={() => setScope('user')}
              />
              用户级（所有工具都接收）
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                cursor: hasProject ? 'pointer' : 'not-allowed',
                fontSize: 'var(--text-body-size)',
                color: hasProject ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                opacity: hasProject ? 1 : 0.5,
              }}
            >
              <input
                type="radio"
                name="subscribe-scope"
                checked={scope === 'project'}
                disabled={!hasProject}
                onChange={() => setScope('project')}
              />
              项目级（仅当前项目）
              {!hasProject && (
                <span
                  style={{
                    fontSize: 'var(--text-caption-size)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  — 未检测到项目配置
                </span>
              )}
            </label>
          </div>

          {/* 同步勾选 */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-5)',
              cursor: 'pointer',
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={syncAfter}
              onChange={(e) => setSyncAfter(e.target.checked)}
            />
            订阅后立即同步
          </label>
        </div>

        <footer className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => onConfirm(scope, syncAfter)}
          >
            确认订阅
          </button>
        </footer>
      </div>
    </div>
  );
}

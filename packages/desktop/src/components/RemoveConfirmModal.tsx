/**
 * RemoveConfirmModal 移除确认弹窗 · FEAT-003
 *
 * 移除工具前的二次确认弹窗。
 * 遵循 L5 · 复用 .modal，确认按钮使用 danger 变体。
 */
import { Loader2 } from 'lucide-react';

/**
 * RemoveConfirmModal 组件属性
 */
interface RemoveConfirmModalProps {
  /** 要移除的工具显示名 */
  toolDisplayName: string;
  /** 确认移除回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 是否正在执行 */
  loading?: boolean;
}

/**
 * 移除确认弹窗组件
 */
export function RemoveConfirmModal({
  toolDisplayName,
  onConfirm,
  onCancel,
  loading = false,
}: RemoveConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div
        className="modal"
        style={{ maxWidth: '360px' }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label="确认移除"
      >
        {/* 头部 */}
        <div className="modal__header">
          <h3 className="modal__title">移除工具</h3>
          {!loading && (
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={onCancel}
              aria-label="关闭"
            >
              ✕
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="modal__body">
          <p style={{
            fontSize: 'var(--text-body-sm-size)',
            color: 'var(--color-text-primary)',
            marginBottom: 'var(--space-2)',
          }}>
            确认移除 {toolDisplayName}？
          </p>
          <p style={{
            fontSize: 'var(--text-body-sm-size)',
            color: 'var(--color-text-secondary)',
          }}>
            移除后该工具将不再接收资源同步，已同步的文件不会被删除。
          </p>
        </div>

        {/* 底部 */}
        <div className="modal__footer" style={{ justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
          >
            {loading && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} />}
            确认移除
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

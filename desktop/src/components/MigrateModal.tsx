/**
 * MigrateModal 迁移确认弹窗
 *
 * FEAT-002：更改源目录时弹出，让用户选择迁移资源或创建空目录。
 * 4 态：选择中 → 执行中 → 成功（自动关闭）→ 失败（显示错误）
 *
 * 遵循 L5 组件规范 · 复用 .modal 样式
 */
import { Package, FolderPlus, Loader2 } from 'lucide-react';

/**
 * MigrateModal 组件属性
 */
interface MigrateModalProps {
  /** 新目录路径 */
  newPath: string;
  /** 迁移资源回调 */
  onMigrate: () => void;
  /** 创建空目录回调 */
  onCreateEmpty: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 是否正在执行 */
  loading?: boolean;
  /** 执行中的提示文案 */
  loadingText?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 迁移确认弹窗组件
 */
export function MigrateModal({
  newPath,
  onMigrate,
  onCreateEmpty,
  onCancel,
  loading = false,
  loadingText,
  error,
}: MigrateModalProps) {
  return (
    <div className="modal-overlay" onClick={loading ? undefined : onCancel}>
      <div
        className="modal"
        style={{ maxWidth: '420px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="更改源目录"
      >
        {/* 头部 */}
        <div className="modal__header">
          <h3 className="modal__title">更改源目录</h3>
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
          {/* 新路径展示 */}
          <p style={{
            fontSize: 'var(--text-body-sm-size)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--space-4)',
          }}>
            新目录：<code style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-code-size)',
              background: 'var(--color-bg-subtle)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
            }}>{newPath}</code>
          </p>

          {/* 执行中状态 */}
          {loading && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-8) 0',
              color: 'var(--color-text-secondary)',
            }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              <span>{loadingText || '处理中…'}</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* 错误状态 */}
          {error && !loading && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-danger-subtle)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-danger-text)',
              fontSize: 'var(--text-body-sm-size)',
              marginBottom: 'var(--space-4)',
            }}>
              {error}
            </div>
          )}

          {/* 选项卡片（非 loading 时显示） */}
          {!loading && (
            <>
              <p style={{
                fontSize: 'var(--text-body-sm-size)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-3)',
              }}>
                是否将当前目录的资源迁移到新目录？
              </p>

              {/* 迁移资源选项 */}
              <button
                type="button"
                className="card"
                onClick={onMigrate}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                  marginBottom: 'var(--space-3)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <Package size={20} style={{ color: 'var(--color-brand-default)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-body-sm-size)', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                    迁移资源
                  </div>
                  <div style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
                    将 skills/、commands/ 等移动到新目录
                  </div>
                </div>
              </button>

              {/* 创建空目录选项 */}
              <button
                type="button"
                className="card"
                onClick={onCreateEmpty}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                  marginBottom: 'var(--space-4)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <FolderPlus size={20} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 'var(--text-body-sm-size)', color: 'var(--color-text-primary)', marginBottom: '2px' }}>
                    创建空目录
                  </div>
                  <div style={{ fontSize: 'var(--text-caption-size)', color: 'var(--color-text-tertiary)' }}>
                    在新目录下创建标准子目录结构
                  </div>
                </div>
              </button>
            </>
          )}
        </div>

        {/* 底部：取消按钮 */}
        {!loading && (
          <div className="modal__footer" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

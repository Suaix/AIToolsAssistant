/**
 * AddToolModal 添加工具弹窗 · FEAT-003
 *
 * 展示预定义工具列表（排除已存在的），点选即添加。
 * 遵循 L5 · 复用 .modal + .card
 */
import { Loader2 } from 'lucide-react';

/** 预定义工具信息 */
export interface ToolDefinition {
  /** 工具唯一标识 */
  name: string;
  /** 显示名 */
  displayName: string;
  /** 用户级目录 */
  userBase: string;
}

/** 预定义支持的工具列表 */
export const AVAILABLE_TOOLS: ToolDefinition[] = [
  { name: 'codebuddy', displayName: 'CodeBuddy', userBase: '~/.codebuddy' },
  { name: 'workbuddy', displayName: 'WorkBuddy', userBase: '~/.workbuddy' },
  { name: 'claude-internal', displayName: 'Claude Internal', userBase: '~/.claude-internal' },
];

/**
 * AddToolModal 组件属性
 */
interface AddToolModalProps {
  /** 当前已存在的 target 名列表 */
  existingNames: string[];
  /** 选中添加后的回调 */
  onAdd: (name: string) => void;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 正在添加的工具名（null=未添加中） */
  addingName?: string | null;
}

/**
 * 添加工具选择弹窗
 */
export function AddToolModal({ existingNames, onAdd, onClose, addingName }: AddToolModalProps) {
  /** 过滤出可添加的工具 */
  const available = AVAILABLE_TOOLS.filter((t) => !existingNames.includes(t.name));

  return (
    <div className="modal-overlay" onClick={addingName ? undefined : onClose}>
      <div
        className="modal"
        style={{ maxWidth: '380px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="添加工具"
      >
        {/* 头部 */}
        <div className="modal__header">
          <h3 className="modal__title">添加工具</h3>
          {!addingName && (
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              onClick={onClose}
              aria-label="关闭"
            >
              ✕
            </button>
          )}
        </div>

        {/* 内容 */}
        <div className="modal__body">
          {available.length === 0 ? (
            /* 空态 */
            <p style={{
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              padding: 'var(--space-6) 0',
            }}>
              所有支持的工具已添加
            </p>
          ) : (
            /* 工具列表 */
            <>
              <p style={{
                fontSize: 'var(--text-body-sm-size)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-3)',
              }}>
                选择要添加的 AI 工具：
              </p>
              {available.map((tool) => {
                const isAdding = addingName === tool.name;
                const isDisabled = !!addingName && !isAdding;

                return (
                  <button
                    key={tool.name}
                    type="button"
                    className="card"
                    disabled={isDisabled}
                    onClick={() => !addingName && onAdd(tool.name)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      marginBottom: 'var(--space-2)',
                      cursor: isDisabled ? 'default' : 'pointer',
                      textAlign: 'left',
                      border: '1px solid var(--color-border-default)',
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                  >
                    {isAdding && (
                      <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 500,
                        fontSize: 'var(--text-body-sm-size)',
                        color: 'var(--color-text-primary)',
                      }}>
                        {tool.displayName}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-caption-size)',
                        color: 'var(--color-text-tertiary)',
                        marginTop: '2px',
                      }}>
                        {tool.userBase}
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* 底部 */}
        {!addingName && (
          <div className="modal__footer" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              取消
            </button>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

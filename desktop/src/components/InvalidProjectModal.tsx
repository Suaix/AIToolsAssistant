/**
 * InvalidProjectModal · 添加项目时目录不合法的提示弹窗（FEAT-004）
 *
 * 触发：用户在 ProjectSwitcher 选择目录后，前端检测到该目录根层级
 *      没有任何已连接工具的标记目录（如 .codebuddy / .claude-internal）。
 *
 * 设计原则：
 *   · L2「诚实先于友好」——直陈事实，标题是「当前目录无法添加为项目」，
 *     不使用「哎呀/小问题」类卖萌词；
 *   · L2「明确先于惊喜」——副提示明确告诉用户"已连接 X / 期望 Y"两段对照，
 *     让用户能立刻定位问题；
 *   · 不提供「跳转到连接工具页面」的引导（Q-5 决策），保持弹窗动作单一。
 *
 * 复用 .modal--sm 外壳，沿用既有 token，无新组件。
 */
import { X } from 'lucide-react';

/** InvalidProjectModal Props */
export interface InvalidProjectModalProps {
  /** 用户选择的目录绝对路径 */
  selectedPath: string;
  /** 当前已连接工具的展示名列表（如 ['CodeBuddy', 'Claude Internal']） */
  connectedTools: string[];
  /** 期望存在的标记目录名（聚合后，如 ['.codebuddy', '.claude-internal']） */
  expectedDirs: string[];
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 添加项目失败提示弹窗
 */
export function InvalidProjectModal({
  selectedPath,
  connectedTools,
  expectedDirs,
  onClose,
}: InvalidProjectModalProps) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invalid-project-title"
      onClick={onClose}
    >
      <div
        className="modal modal--sm"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title" id="invalid-project-title">
            当前目录无法添加为项目
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          {/* 路径 —— 等宽字体强化"对象" */}
          <p
            style={{
              margin: '0 0 var(--space-4)',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--color-text-secondary)',
              wordBreak: 'break-all',
            }}
          >
            {selectedPath}
          </p>

          {/* 主提示 */}
          <p
            style={{
              margin: '0 0 var(--space-4)',
              fontSize: 'var(--text-body-size)',
              color: 'var(--color-text-primary)',
            }}
          >
            该目录的根层级没有任何已连接的 AI 工具目录。
          </p>

          {/* 已连接工具列表 */}
          {connectedTools.length > 0 && (
            <p
              style={{
                margin: '0 0 var(--space-2)',
                fontSize: 'var(--text-body-sm-size)',
                color: 'var(--color-text-secondary)',
              }}
            >
              当前已连接：{connectedTools.join('、')}
            </p>
          )}

          {/* 期望目录列表 */}
          {expectedDirs.length > 0 && (
            <p
              style={{
                margin: 0,
                fontSize: 'var(--text-body-sm-size)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              期望存在：{expectedDirs.join(' 或 ')}
            </p>
          )}
        </div>

        <footer className="modal__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onClose}
            autoFocus
          >
            我知道了
          </button>
        </footer>
      </div>
    </div>
  );
}

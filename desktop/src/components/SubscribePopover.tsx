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
 *
 * FEAT-004：项目级 scope 三态（available / disabled-no-project / disabled-no-tools）
 *   · available           当前项目存在 + 关联工具集合非空 → 副文案"将写入 .x/skills"
 *   · disabled-no-project 无项目上下文 → "未检测到项目配置"（既有行为）
 *   · disabled-no-tools   有项目但 projectTools 为空 → "当前项目未关联任何已连接的 AI 工具"
 *   · loading             projectTools 探测中 → "检测中…"，临时禁用
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import type { SubscriptionScope } from '../lib/cli';
import {
  TOOL_PROJECT_DIR_ALIASES,
  getToolDisplayName,
} from '../lib/tools';

/**
 * 组件 Props
 */
export interface SubscribePopoverProps {
  /** 资源显示名称（用于弹窗标题） */
  resourceName: string;
  /** 是否有项目上下文（决定是否允许选择「项目级」） */
  hasProject: boolean;
  /** 当前项目实际关联的工具 name 列表（FEAT-004） */
  projectTools: string[];
  /** projectTools 是否正在加载（FEAT-004） */
  projectToolsLoading: boolean;
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
  projectTools,
  projectToolsLoading,
  onConfirm,
  onCancel,
}: SubscribePopoverProps) {
  /** 选中的 scope */
  const [scope, setScope] = useState<SubscriptionScope>('user');
  /** 是否勾选「订阅后立即同步」 */
  const [syncAfter, setSyncAfter] = useState(true);

  /**
   * 项目级 scope 是否可选（FEAT-004 三态判定）
   * available 仅当：有项目 + 加载完成 + 关联工具非空
   */
  const projectScopeAvailable =
    hasProject && !projectToolsLoading && projectTools.length > 0;

  /**
   * 项目级 scope 副文案
   */
  let projectScopeHint: string;
  let projectScopeTitle: string | undefined;
  if (!hasProject) {
    projectScopeHint = '— 未检测到项目配置';
    projectScopeTitle = undefined;
  } else if (projectToolsLoading) {
    projectScopeHint = '— 检测中…';
    projectScopeTitle = undefined;
  } else if (projectTools.length === 0) {
    projectScopeHint = '— 无可写入的工具目录';
    projectScopeTitle = '当前项目未关联任何已连接的 AI 工具';
  } else {
    /* 列出将要写入的目录（取每个工具的首选目录） */
    const willWriteDirs = projectTools.map((t) => {
      const aliases = TOOL_PROJECT_DIR_ALIASES[t];
      const primary = aliases?.[0] ?? `.${t}`;
      return `${primary}/skills`;
    });
    projectScopeHint = `— 将写入 ${willWriteDirs.join('、')}`;
    projectScopeTitle = `关联工具：${projectTools.map(getToolDisplayName).join('、')}`;
  }

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

            {/* 项目级：上下结构（FEAT-004 BUG-1 优化）
             *   · 第一行：radio + 主标题，避免与副文案挤在同一行
             *   · 第二行：副文案左缩进对齐主标题，小灰色字
             */}
            <div
              title={projectScopeTitle}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
                opacity: projectScopeAvailable ? 1 : 0.5,
                cursor: projectScopeAvailable ? 'default' : 'not-allowed',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  cursor: projectScopeAvailable ? 'pointer' : 'not-allowed',
                  fontSize: 'var(--text-body-size)',
                  color: projectScopeAvailable
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-tertiary)',
                }}
              >
                <input
                  type="radio"
                  name="subscribe-scope"
                  checked={scope === 'project'}
                  disabled={!projectScopeAvailable}
                  onChange={() => setScope('project')}
                />
                项目级（仅当前项目）
              </label>
              <span
                style={{
                  /* 左缩进 = radio 宽度 + gap，使副文案与主标题文字起点对齐 */
                  paddingLeft: 'calc(var(--space-2) + 16px)',
                  fontSize: 'var(--text-caption-size)',
                  color: 'var(--color-text-tertiary)',
                  fontFamily:
                    projectScopeAvailable && projectTools.length > 0
                      ? 'var(--font-mono)'
                      : undefined,
                }}
              >
                {projectScopeHint}
              </span>
            </div>
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

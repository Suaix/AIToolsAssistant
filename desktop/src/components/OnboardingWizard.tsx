/**
 * OnboardingWizard · 首次启动订阅引导向导
 *
 * RFC-002 §4.1 / Q4 决议：
 * - 触发条件：user_subscriptions 为空 且 源目录有 ≥1 个候选资源
 * - 3 步流程：识别工具 → 选择 Skill → 确认同步
 * - 右上角可关闭，关闭后记住"不再弹出"
 * - detected_ratio < 30% 时替换为"请先安装 AI 工具"引导页
 *
 * 设计系统：复用 .modal-overlay + 自定义内容布局
 * L2「诚实先于友好」：展示真实检测结果
 */
import { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ResourceView } from '../lib/cli';

/**
 * 组件 Props
 */
export interface OnboardingWizardProps {
  /** 已启用的 target 列表 */
  enabledTargets: string[];
  /** 所有已知 target 总数 */
  totalTargets: number;
  /** 源目录中的候选资源（未订阅的） */
  candidates: ResourceView[];
  /** 确认订阅回调（传回选中的 dirName 列表） */
  onConfirm: (selectedNames: string[]) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * Onboarding 向导
 */
export function OnboardingWizard({
  enabledTargets,
  totalTargets,
  candidates,
  onConfirm,
  onClose,
}: OnboardingWizardProps) {
  /* detected_ratio 判定（RFC-002 Q4） */
  const detectedRatio = totalTargets > 0 ? enabledTargets.length / totalTargets : 0;

  /* 低识别率：替换为安装引导页 */
  if (detectedRatio < 0.3 && totalTargets > 0) {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div className="modal">
          <header className="modal__header">
            <h2 className="modal__title">欢迎使用 aitools</h2>
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
            <div className="empty-state" style={{ padding: 'var(--space-6) 0' }}>
              <AlertCircle
                className="empty-state__icon"
                size={48}
                aria-hidden="true"
              />
              <h3 className="empty-state__title">请先安装 AI 工具</h3>
              <p className="empty-state__desc">
                仅检测到 {enabledTargets.length}/{totalTargets} 个工具。
                请安装至少一个支持的 AI 工具（如 CodeBuddy、Claude Code），
                然后重新检测。
              </p>
            </div>
          </div>
          <footer className="modal__footer">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              我知道了，先不用
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={onClose}
            >
              我装好了，重新检测
            </button>
          </footer>
        </div>
      </div>
    );
  }

  /* 正常流程：3 步向导 */
  return <WizardSteps
    enabledTargets={enabledTargets}
    candidates={candidates}
    onConfirm={onConfirm}
    onClose={onClose}
  />;
}

/* ============================================================
 * 3 步向导内部组件
 * ============================================================ */

interface WizardStepsProps {
  enabledTargets: string[];
  candidates: ResourceView[];
  onConfirm: (selectedNames: string[]) => void;
  onClose: () => void;
}

/**
 * 3 步向导
 */
function WizardSteps({
  enabledTargets,
  candidates,
  onConfirm,
  onClose,
}: WizardStepsProps) {
  const [step, setStep] = useState(1);
  /** Step 2 选中的资源 dirName */
  const [selected, setSelected] = useState<Set<string>>(() => {
    /* 默认全选前 5 个 */
    const names = candidates.slice(0, 5).map((c) => c.dirName);
    return new Set(names);
  });

  /** 切换选择 */
  function toggleSelect(dirName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dirName)) {
        next.delete(dirName);
      } else {
        next.add(dirName);
      }
      return next;
    });
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <header className="modal__header">
          <h2 className="modal__title">
            开始使用 · 步骤 {step}/3
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
          {/* Step 1：识别到的工具 */}
          {step === 1 && (
            <div>
              <p
                style={{
                  margin: '0 0 var(--space-4)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                你有这些 AI 工具被识别到
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                {enabledTargets.map((t) => (
                  <div
                    key={t}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--color-bg-subtle)',
                      borderRadius: 'var(--radius-md)',
                    }}
                  >
                    <CheckCircle2
                      size={16}
                      style={{ color: 'var(--color-success)', flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {t}
                    </span>
                    <span
                      className="badge badge--success badge--sm"
                      style={{ marginLeft: 'auto' }}
                    >
                      <span className="badge__dot" />
                      启用
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2：选择要订阅的 Skill */}
          {step === 2 && (
            <div>
              <p
                style={{
                  margin: '0 0 var(--space-4)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                发现 {candidates.length} 个 Skill，勾选的会被订阅到 User 级（所有工具）
              </p>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                  maxHeight: 300,
                  overflowY: 'auto',
                }}
              >
                {candidates.map((c) => (
                  <label
                    key={c.dirName}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      background: selected.has(c.dirName)
                        ? 'var(--color-bg-selected)'
                        : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.dirName)}
                      onChange={() => toggleSelect(c.dirName)}
                    />
                    <span
                      style={{
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {c.name}
                    </span>
                    {c.description && c.description !== '-' && (
                      <span
                        style={{
                          fontSize: 'var(--text-caption-size)',
                          color: 'var(--color-text-tertiary)',
                          marginLeft: 'auto',
                        }}
                      >
                        {c.description}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3：确认 */}
          {step === 3 && (
            <div>
              <p
                style={{
                  margin: '0 0 var(--space-4)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                确认并同步
              </p>
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <p style={{ margin: 0, color: 'var(--color-text-primary)' }}>
                  将订阅 <strong>{selected.size}</strong> 个 Skill 到用户级
                </p>
                <p
                  style={{
                    margin: 'var(--space-2) 0 0',
                    fontSize: 'var(--text-caption-size)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  并立即同步到 {enabledTargets.length} 个工具 ={' '}
                  {selected.size * enabledTargets.length} 个写操作
                </p>
              </div>
              <div style={{ marginTop: 'var(--space-3)' }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-caption-size)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  已选：{[...selected].join('、')}
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="modal__footer">
          {step > 1 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setStep(step - 1)}
            >
              上一步
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setStep(step + 1)}
              disabled={step === 2 && selected.size === 0}
            >
              继续
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              disabled={selected.size === 0}
              onClick={() => onConfirm([...selected])}
            >
              确认，开始同步
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

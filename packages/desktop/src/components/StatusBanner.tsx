/**
 * StatusBanner 全局异常提示条
 *
 * FEAT-001：替代原 HeroCard 的 cli_missing / error 态。
 * 页面顶部条件渲染，不阻塞其他内容展示。
 *
 * 遵循 L5 组件规范 · CSS 类：.status-banner
 */
import { AlertTriangle, XCircle } from 'lucide-react';

/**
 * StatusBanner 组件属性
 */
interface StatusBannerProps {
  /** 提示类型：warning 或 error */
  variant: 'warning' | 'error';
  /** 提示文案（支持 React 节点） */
  message: React.ReactNode;
  /** 操作按钮文案 */
  actionLabel?: string;
  /** 操作回调 */
  onAction?: () => void;
}

/**
 * 全局异常提示条组件
 */
export function StatusBanner({ variant, message, actionLabel, onAction }: StatusBannerProps) {
  /** 根据类型选择图标 */
  const Icon = variant === 'warning' ? AlertTriangle : XCircle;

  return (
    <div className={`status-banner status-banner--${variant}`} role="alert">
      <Icon className="status-banner__icon" />
      <span className="status-banner__text">{message}</span>
      {actionLabel && onAction && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

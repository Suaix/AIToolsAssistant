/**
 * OverviewCard 概览数据卡片
 *
 * FEAT-001：概览页核心展示组件。
 * 通用化设计，通过 props 控制活跃态 / 禁用态。
 *
 * 遵循 L5 组件规范 · CSS 类：.overview-card
 */
import { ChevronRight, type LucideIcon } from 'lucide-react';

/**
 * OverviewCard 组件属性
 */
export interface OverviewCardProps {
  /** 图标组件（Lucide） */
  icon: LucideIcon;
  /** 卡片标题 */
  title: string;
  /** 主数字（支持字符串如 "3 / 5"） */
  metric: React.ReactNode;
  /** 主数字标签 */
  label: string;
  /** 次要指标行 */
  sub?: React.ReactNode;
  /** 是否禁用（功能未实现） */
  disabled?: boolean;
  /** 是否处于加载中 */
  loading?: boolean;
  /** 点击回调（disabled 时不触发） */
  onClick?: () => void;
}

/**
 * 概览数据卡片组件
 */
export function OverviewCard({
  icon: Icon,
  title,
  metric,
  label,
  sub,
  disabled = false,
  loading = false,
  onClick,
}: OverviewCardProps) {
  /** 构建 CSS 类名 */
  const classes = [
    'overview-card',
    !disabled && 'overview-card--active',
    disabled && 'overview-card--disabled',
  ]
    .filter(Boolean)
    .join(' ');

  /** 点击处理 */
  const handleClick = () => {
    if (!disabled && onClick) onClick();
  };

  /** 键盘无障碍 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className={classes}
      role={disabled ? undefined : 'button'}
      tabIndex={disabled ? undefined : 0}
      aria-label={disabled ? undefined : `查看${title}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* 头部：图标 + 标题 + 箭头 */}
      <div className="overview-card__header">
        <Icon className="overview-card__icon" />
        <span className="overview-card__title">{title}</span>
        {!disabled && <ChevronRight className="overview-card__arrow" />}
      </div>

      {/* 主数字 */}
      <div className="overview-card__metric">
        {loading ? <span className="overview-card__skeleton" /> : metric}
      </div>

      {/* 主标签 */}
      <div className="overview-card__label">{loading ? '\u00A0' : label}</div>

      {/* 次要指标行 */}
      {sub && <div className="overview-card__sub">{sub}</div>}
    </div>
  );
}

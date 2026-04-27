/**
 * ThemeToggle 主题切换按钮
 *
 * 设计系统 L4 决策：支持 system / light / dark 三档循环
 * L5 按钮规范：使用 .btn .btn--ghost .btn--icon .btn--sm
 */
import { useState } from 'react';
import { Monitor, Sun, Moon, type LucideIcon } from 'lucide-react';
import { cycleTheme, getStoredTheme, type ThemeMode } from '../lib/theme';

/**
 * 主题图标映射
 * - system：显示器图标
 * - light：太阳图标
 * - dark：月亮图标
 */
const ICON_MAP: Record<ThemeMode, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

const LABEL_MAP: Record<ThemeMode, string> = {
  system: '跟随系统',
  light: '浅色模式',
  dark: '深色模式',
};

/**
 * 主题切换按钮
 * 点击在 system / light / dark 之间循环
 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme());

  const handleClick = () => {
    const next = cycleTheme();
    setMode(next);
  };

  const Icon = ICON_MAP[mode];

  return (
    <button
      className="btn btn--ghost btn--icon btn--sm"
      onClick={handleClick}
      aria-label={`切换主题（当前：${LABEL_MAP[mode]}）`}
      title={LABEL_MAP[mode]}
    >
      <Icon size={16} />
    </button>
  );
}

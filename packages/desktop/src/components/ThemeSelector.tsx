/**
 * ThemeSelector 主题三选一
 *
 * FEAT-002：设置页主题偏好模块。
 * 三选一 Segmented Control：暗色 / 浅色 / 系统。
 *
 * 遵循 L5 组件规范 · CSS 类：.theme-selector
 */
import { Moon, Sun, Monitor } from 'lucide-react';
import { type ThemeMode } from '../lib/theme';

/**
 * ThemeSelector 组件属性
 */
interface ThemeSelectorProps {
  /** 当前激活的主题 */
  current: ThemeMode;
  /** 切换回调 */
  onChange: (mode: ThemeMode) => void;
}

/** 主题选项定义 */
const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: typeof Moon }[] = [
  { mode: 'dark', label: '暗色', icon: Moon },
  { mode: 'light', label: '浅色', icon: Sun },
  { mode: 'system', label: '系统', icon: Monitor },
];

/**
 * 主题三选一组件
 */
export function ThemeSelector({ current, onChange }: ThemeSelectorProps) {
  return (
    <div className="theme-selector" role="radiogroup" aria-label="主题选择">
      {THEME_OPTIONS.map(({ mode, label, icon: Icon }) => {
        const isActive = current === mode;
        const classes = [
          'theme-selector__option',
          isActive && 'theme-selector__option--active',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={mode}
            type="button"
            className={classes}
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(mode)}
          >
            <Icon className="theme-selector__icon" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

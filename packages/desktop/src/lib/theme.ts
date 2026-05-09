/**
 * 主题切换工具
 *
 * 设计系统 L4 规定：
 * - 支持 light / dark / system 三档
 * - 默认跟随系统偏好
 * - 通过 <html data-theme="..."> 切换，tokens.css 自动响应
 */

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** localStorage 键名 */
const STORAGE_KEY = 'aitools-desktop-theme';

/**
 * 读取已存储的主题偏好
 * @returns 当前主题模式，无记录时返回 'system'
 */
export function getStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value;
    }
  } catch {
    /* 忽略 localStorage 访问失败（如隐身模式） */
  }
  return 'system';
}

/**
 * 应用主题到文档根节点
 * - 'system' 模式会移除 data-theme 属性，由 prefers-color-scheme 接管
 * - 同时持久化到 localStorage
 *
 * @param mode 目标主题
 */
export function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement;
  if (mode === 'system') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* 忽略 */
  }
}

/**
 * 在应用启动时调用，立即应用已存储的主题偏好
 * 应在 React 渲染前执行，避免首帧闪烁
 */
export function initTheme(): void {
  applyTheme(getStoredTheme());
}

/**
 * 在 light → dark → system 之间循环切换
 * @returns 切换后的新模式
 */
export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['system', 'light', 'dark'];
  const current = getStoredTheme();
  const next = order[(order.indexOf(current) + 1) % order.length];
  applyTheme(next);
  return next;
}

/**
 * Sidebar 侧栏组件
 *
 * 严格遵循设计系统 L5 组件规范：
 * - 使用 components.css 中定义的 .sidebar / .nav-item 等类，不自写 CSS
 * - 三组结构：状态总览 / 资源对象 / 外部关系 + 底部设置
 * - 未实现项显示 '—'（贯彻 L2 原则 3 诚实）
 *
 * 本文件翻译自 docs/design-system/06-gui-prototype/pages/dashboard.html 的侧栏部分
 */
import {
  Home,
  Package,
  Zap,
  Bot,
  FileText,
  Link2,
  FolderOpen,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { RouteName } from '../lib/routes';

/**
 * 导航项配置
 */
interface NavItemConfig {
  /** 路由名 */
  route: RouteName | null;
  /** 图标组件（Lucide 图标） */
  icon: LucideIcon;
  /** 显示标签 */
  label: string;
  /** 右侧徽章（数字或 '—'） */
  badge?: string;
  /** 是否未实现（L2 原则 3：诚实地显示占位） */
  disabled?: boolean;
}

/** 第一组：状态总览 */
const GROUP_STATUS: NavItemConfig[] = [
  { route: 'dashboard', icon: Home, label: '工作台' },
];

/** 第二组：资源对象（对象导向） */
const GROUP_RESOURCES: NavItemConfig[] = [
  { route: 'skills', icon: Package, label: 'Skills', badge: '—' },
  { route: null, icon: Zap, label: 'Commands', badge: '—', disabled: true },
  { route: null, icon: Bot, label: 'Agents', badge: '—', disabled: true },
  { route: null, icon: FileText, label: 'Rules', badge: '—', disabled: true },
];

/** 第三组：外部关系 */
const GROUP_EXTERNAL: NavItemConfig[] = [
  { route: 'tools', icon: Link2, label: '已连接工具', badge: '—' },
  { route: null, icon: FolderOpen, label: '项目', badge: '—', disabled: true },
];

/**
 * Sidebar 组件 Props
 */
export interface SidebarProps {
  /** 当前激活路由 */
  active: RouteName;
  /** 路由切换回调 */
  onNavigate: (route: RouteName) => void;
}

/**
 * 侧栏主组件
 *
 * @param active 当前激活路由
 * @param onNavigate 路由切换回调
 */
export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="主导航">
      {/* 品牌区 */}
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          A
        </span>
        <span className="sidebar__name">aitools</span>
      </div>

      {/* 第一组：状态总览 */}
      <ul className="sidebar__group">
        {GROUP_STATUS.map((item) => renderNavItem(item, active, onNavigate))}
      </ul>

      {/* 第二组：资源对象 */}
      <ul className="sidebar__group">
        {GROUP_RESOURCES.map((item) => renderNavItem(item, active, onNavigate))}
      </ul>

      {/* 第三组：外部关系 */}
      <ul className="sidebar__group">
        {GROUP_EXTERNAL.map((item) => renderNavItem(item, active, onNavigate))}
      </ul>

      {/* 弹性空间 */}
      <div className="sidebar__spacer" />

      {/* 底部：设置 */}
      <ul className="sidebar__group">
        {renderNavItem(
          { route: 'settings', icon: Settings, label: '设置' },
          active,
          onNavigate,
        )}
      </ul>
    </nav>
  );
}

/**
 * 渲染单个导航项
 */
function renderNavItem(
  item: NavItemConfig,
  active: RouteName,
  onNavigate: (route: RouteName) => void,
) {
  const isActive = item.route !== null && item.route === active;
  const Icon = item.icon;

  /* 构造类名 */
  const classes = ['nav-item'];
  if (isActive) classes.push('nav-item--active');
  if (item.disabled) classes.push('nav-item--disabled');

  /**
   * 点击处理：
   * - 未实现项仍可点击（会跳向空态提示），但首版 MVP 不做跳转
   * - 实现项跳转到目标路由
   */
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (item.disabled || item.route === null) {
      /* 未实现：暂不处理，未来跳向"该资源类型暂未支持"空态 */
      return;
    }
    onNavigate(item.route);
  };

  return (
    <li key={item.label}>
      <a
        href="#"
        className={classes.join(' ')}
        onClick={handleClick}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="nav-item__icon" />
        <span className="nav-item__label">{item.label}</span>
        {item.badge !== undefined && (
          <span className="nav-item__badge tabular-nums">{item.badge}</span>
        )}
      </a>
    </li>
  );
}

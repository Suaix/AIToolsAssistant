/**
 * Sidebar 侧栏组件 · RFC-002 阶段 3
 *
 * 严格遵循设计系统 L5 组件规范：
 * - 使用 components.css 中定义的 .sidebar / .nav-item 等类
 * - 三组结构：状态总览 / 资源对象 / 外部关系 + 底部设置
 * - Skills / Tools 项显示动态计数徽章（RFC-002 §3.1）
 * - 未实现项显示 '—'（L2 原则「诚实」）
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
 * Sidebar 计数数据（由 App 传入）
 */
export interface SidebarCounts {
  /** Skills 订阅总数（User + Project） */
  skills: number | null;
  /** 已连接工具 — "已启用/总数"格式 */
  tools: string | null;
}

/**
 * 导航项配置
 */
interface NavItemConfig {
  /** 路由名 */
  route: RouteName | null;
  /** 图标组件 */
  icon: LucideIcon;
  /** 显示标签 */
  label: string;
  /** 右侧徽章文案 */
  badge?: string;
  /** 是否未实现 */
  disabled?: boolean;
}

/**
 * Sidebar 组件 Props
 */
export interface SidebarProps {
  /** 当前激活路由 */
  active: RouteName;
  /** 路由切换回调 */
  onNavigate: (route: RouteName) => void;
  /** 动态计数（可选；未传入时显示 '—'） */
  counts?: SidebarCounts;
}

/**
 * 侧栏主组件
 */
export function Sidebar({ active, onNavigate, counts }: SidebarProps) {
  /* 构建动态导航项配置 */
  const groupStatus: NavItemConfig[] = [
    { route: 'dashboard', icon: Home, label: '概览' },
  ];

  const groupResources: NavItemConfig[] = [
    {
      route: 'skills',
      icon: Package,
      label: 'Skills',
      badge: counts?.skills !== null && counts?.skills !== undefined
        ? String(counts.skills)
        : '—',
    },
    { route: null, icon: Zap, label: 'Commands', badge: '—', disabled: true },
    { route: null, icon: Bot, label: 'Agents', badge: '—', disabled: true },
    { route: null, icon: FileText, label: 'Rules', badge: '—', disabled: true },
  ];

  const groupExternal: NavItemConfig[] = [
    {
      route: 'tools',
      icon: Link2,
      label: '已连接工具',
      badge: counts?.tools ?? '—',
    },
    { route: null, icon: FolderOpen, label: '项目', badge: '—', disabled: true },
  ];

  return (
    <nav className="sidebar" aria-label="主导航">
      {/* 品牌区 */}
      <div className="sidebar__brand" data-tauri-drag-region>
        <span className="sidebar__logo" aria-hidden="true">
          A
        </span>
        <span className="sidebar__name">aitools</span>
      </div>

      {/* 第一组：状态总览 */}
      <ul className="sidebar__group">
        {groupStatus.map((item) => renderNavItem(item, active, onNavigate))}
      </ul>

      {/* 第二组：资源对象 */}
      <ul className="sidebar__group">
        {groupResources.map((item) => renderNavItem(item, active, onNavigate))}
      </ul>

      {/* 第三组：外部关系 */}
      <ul className="sidebar__group">
        {groupExternal.map((item) => renderNavItem(item, active, onNavigate))}
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

  const classes = ['nav-item'];
  if (isActive) classes.push('nav-item--active');
  if (item.disabled) classes.push('nav-item--disabled');

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (item.disabled || item.route === null) return;
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

/**
 * App 主组件
 *
 * 职责：
 * - 持有当前路由状态
 * - 渲染 app-shell（侧栏 + 主工作区）
 * - 根据路由切换主工作区内容
 *
 * 遵循 L5 组件规范：使用 .app-shell / .app-main / .sidebar 等类
 */
import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { Dashboard } from './pages/Dashboard';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Settings } from './pages/Settings';
import { ROUTE_TITLES, type RouteName } from './lib/routes';

/**
 * 根据路由名返回对应的页面组件
 * @param route 当前路由
 */
function renderPage(route: RouteName): React.ReactElement {
  switch (route) {
    case 'dashboard':
      return <Dashboard />;
    case 'skills':
      return <Skills />;
    case 'skill-detail':
      /* MVP-01 阶段 skill-detail 未实现，回退到 Skills 页 */
      return <Skills />;
    case 'tools':
      return <Tools />;
    case 'settings':
      return <Settings />;
  }
}

/**
 * 应用根组件
 */
export function App() {
  /** 当前激活路由 */
  const [route, setRoute] = useState<RouteName>('dashboard');

  return (
    <div className="app-shell">
      {/* 左侧：侧栏导航 */}
      <Sidebar active={route} onNavigate={setRoute} />

      {/* 右侧：主工作区 */}
      <main className="app-main">
        <header className="app-main__header">
          <h1 className="app-main__title">{ROUTE_TITLES[route]}</h1>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <ThemeToggle />
          </div>
        </header>

        <div className="app-main__content">{renderPage(route)}</div>
      </main>
    </div>
  );
}

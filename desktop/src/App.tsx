/**
 * App 主组件 · RFC-002 阶段 4+5
 *
 * 职责：
 * - 持有路由状态 + 当前项目状态
 * - 顶栏集成项目切换器（阶段 4）
 * - Onboarding 向导蒙层挂载点（阶段 5）
 * - 加载全局数据传给 Sidebar
 *
 * 遵循 L5 组件规范
 */
import { useEffect, useState, useCallback } from 'react';
import { Sidebar, type SidebarCounts } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Dashboard } from './pages/Dashboard';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Settings } from './pages/Settings';
import { ROUTE_TITLES, type RouteName } from './lib/routes';
import {
  listResources,
  subscribeResource,
  type ResourceView,
} from './lib/cli';
import {
  loadGuiState,
  saveGuiState,
  markOnboardingDone,
  type GuiState,
} from './lib/gui-state';

/**
 * 根据路由名返回对应的页面组件
 */
function renderPage(route: RouteName): React.ReactElement {
  switch (route) {
    case 'dashboard':
      return <Dashboard />;
    case 'skills':
      return <Skills />;
    case 'skill-detail':
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
  /** 当前路由 */
  const [route, setRoute] = useState<RouteName>('dashboard');
  /** Sidebar 计数 */
  const [counts, setCounts] = useState<SidebarCounts>({ skills: null, tools: null });
  /** GUI 本地状态 */
  const [guiState, setGuiState] = useState<GuiState | null>(null);
  /** Onboarding 数据（null = 不显示） */
  const [onboardingData, setOnboardingData] = useState<{
    enabledTargets: string[];
    totalTargets: number;
    candidates: ResourceView[];
  } | null>(null);
  /** Onboarding 中的订阅进度 */
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  /* ---- 启动时加载 GUI 状态 ---- */
  useEffect(() => {
    void (async () => {
      const state = await loadGuiState();
      setGuiState(state);
    })();
  }, []);

  /* ---- 加载全局数据（Sidebar 计数 + Onboarding 判定） ---- */
  const loadGlobalData = useCallback(async () => {
    try {
      const result = await listResources('skills');
      const subscribedCount = result.resources.filter(
        (r) => r.subscriptions.length > 0,
      ).length;

      /* target 统计 */
      const allTargetNames = new Set<string>();
      for (const r of result.resources) {
        for (const sub of r.subscriptions) {
          for (const t of sub.targets) {
            allTargetNames.add(t.target);
          }
        }
      }
      const enabledCount = result.enabledTargets.length;
      const totalCount = Math.max(allTargetNames.size, enabledCount);

      setCounts({
        skills: subscribedCount,
        tools: `${enabledCount}/${totalCount}`,
      });

      return result;
    } catch {
      return null;
    }
  }, []);

  /* 启动 + 路由切换时加载 */
  useEffect(() => {
    void loadGlobalData();
  }, [route, loadGlobalData]);

  /* ---- Onboarding 判定（GUI 状态加载后执行一次） ---- */
  useEffect(() => {
    if (!guiState) return;
    if (guiState.onboardingDone) return;

    void (async () => {
      const result = await loadGlobalData();
      if (!result) return;

      const subscribedCount = result.resources.filter(
        (r) => r.subscriptions.length > 0,
      ).length;
      const candidates = result.resources.filter(
        (r) => r.subscriptions.length === 0,
      );

      /* 条件：无订阅 + 有候选 */
      if (subscribedCount === 0 && candidates.length > 0) {
        const allTargetNames = new Set<string>();
        for (const r of result.resources) {
          for (const sub of r.subscriptions) {
            for (const t of sub.targets) {
              allTargetNames.add(t.target);
            }
          }
        }
        setOnboardingData({
          enabledTargets: result.enabledTargets,
          totalTargets: Math.max(allTargetNames.size, result.enabledTargets.length),
          candidates,
        });
      }
    })();
    /* 仅在 guiState 首次加载时跑 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guiState?.onboardingDone]);

  /* ---- Onboarding 确认订阅 ---- */
  async function handleOnboardingConfirm(selectedNames: string[]) {
    if (onboardingBusy) return;
    setOnboardingBusy(true);

    /* 串行调用 subscribe（RFC-002 §4.1 Step 3） */
    for (const name of selectedNames) {
      try {
        await subscribeResource({
          type: 'skills',
          name,
          scope: 'user',
          sync: true,
        });
      } catch {
        /* 单个失败不阻塞 */
      }
    }

    /* 标记完成 */
    if (guiState) {
      const newState = markOnboardingDone(guiState);
      setGuiState(newState);
      void saveGuiState(newState);
    }

    setOnboardingData(null);
    setOnboardingBusy(false);

    /* 刷新 */
    void loadGlobalData();
  }

  /** 关闭 Onboarding（不再弹出） */
  function handleOnboardingClose() {
    if (guiState) {
      const newState = markOnboardingDone(guiState);
      setGuiState(newState);
      void saveGuiState(newState);
    }
    setOnboardingData(null);
  }

  return (
    <div className="app-shell app-shell--native-titlebar">
      {/* 左侧：侧栏导航 */}
      <Sidebar active={route} onNavigate={setRoute} counts={counts} />

      {/* 右侧：主工作区 */}
      <main className="app-main">
        {/* 顶栏 */}
        <header className="app-main__header" data-tauri-drag-region>
          <h1 className="app-main__title" data-tauri-drag-region>
            {ROUTE_TITLES[route]}
          </h1>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <ThemeToggle />
          </div>
        </header>

        <div className="app-main__content">{renderPage(route)}</div>
      </main>

      {/* Onboarding 蒙层（阶段 5） */}
      {onboardingData && !onboardingBusy && (
        <OnboardingWizard
          enabledTargets={onboardingData.enabledTargets}
          totalTargets={onboardingData.totalTargets}
          candidates={onboardingData.candidates}
          onConfirm={(names) => void handleOnboardingConfirm(names)}
          onClose={handleOnboardingClose}
        />
      )}
    </div>
  );
}

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
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { OnboardingWizard } from './components/OnboardingWizard';
import { Overview, type OverviewData } from './pages/Overview';
import { Skills } from './pages/Skills';
import { Tools } from './pages/Tools';
import { Settings } from './pages/Settings';
import { type RouteName } from './lib/routes';
import {
  checkCliAvailable,
  listResources,
  subscribeResource,
  type ResourceView,
} from './lib/cli';
import {
  loadGuiState,
  saveGuiState,
  setCurrentProject,
  markOnboardingDone,
  type GuiState,
} from './lib/gui-state';

/**
 * 根据路由名返回对应的页面组件
 */
function renderPage(
  route: RouteName,
  recentProjectCount: number,
  currentProject: string | null,
  overviewData: OverviewData,
  onNavigate: (route: RouteName) => void,
  onRetry: () => void,
): React.ReactElement {
  switch (route) {
    case 'dashboard':
      return <Overview data={overviewData} onNavigate={onNavigate} onRetry={onRetry} />;
    case 'skills':
      return <Skills recentProjectCount={recentProjectCount} currentProject={currentProject} />;
    case 'skill-detail':
      return <Skills recentProjectCount={recentProjectCount} currentProject={currentProject} />;
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
  /** 当前项目是否有 project.yaml（供 ProjectSwitcher 显示状态） */
  const [hasProjectConfig, setHasProjectConfig] = useState(false);
  /** 概览页聚合数据 */
  const [overviewData, setOverviewData] = useState<OverviewData>({
    status: 'loading',
    skills: { subscribedCount: 0, candidateCount: 0, driftCount: 0 },
    tools: { enabledCount: 0, totalCount: 0, enabledNames: [] },
    project: { currentName: null, recentCount: 0 },
  });

  /* ---- 启动时加载 GUI 状态 ---- */
  useEffect(() => {
    void (async () => {
      const state = await loadGuiState();
      setGuiState(state);
    })();
  }, []);

  /* ---- 加载全局数据（Sidebar 计数 + 概览数据 + Onboarding 判定） ---- */
  const loadGlobalData = useCallback(async (cwd?: string) => {
    /** 更新概览页为 loading 态 */
    setOverviewData((prev) => ({ ...prev, status: 'loading' }));

    /* CLI 健康检查 */
    try {
      const available = await checkCliAvailable();
      if (!available) {
        setOverviewData((prev) => ({ ...prev, status: 'cli_missing' }));
        return null;
      }
    } catch {
      setOverviewData((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: 'CLI 健康检查失败',
      }));
      return null;
    }

    /* 拉取 skills 数据 */
    try {
      const result = await listResources('skills', cwd);
      const subscribedResources = result.resources.filter(
        (r) => r.subscriptions.length > 0,
      );
      const subscribedCount = subscribedResources.length;
      const candidateCount = result.resources.length - subscribedCount;

      /* 统计待同步数 */
      let driftCount = 0;
      for (const r of subscribedResources) {
        const hasNonSynced = r.subscriptions.some((sub) =>
          sub.targets.some((t) => t.status !== 'synced'),
        );
        if (hasNonSynced) driftCount++;
      }

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

      /* 更新 Sidebar 计数 */
      setCounts({
        skills: subscribedCount,
        tools: `${enabledCount}/${totalCount}`,
      });

      setHasProjectConfig(!!result.projectDir);

      /* 更新概览数据 */
      setOverviewData((prev) => ({
        ...prev,
        status: 'ready',
        errorMessage: undefined,
        skills: { subscribedCount, candidateCount, driftCount },
        tools: {
          enabledCount,
          totalCount,
          enabledNames: result.enabledTargets,
        },
      }));

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setOverviewData((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: message,
      }));
      return null;
    }
  }, []);

  /* 启动 + 路由切换时加载 */
  useEffect(() => {
    void loadGlobalData(guiState?.currentProject ?? undefined);
  }, [route, loadGlobalData, guiState?.currentProject]);

  /* 同步 guiState 的项目信息到 overviewData */
  useEffect(() => {
    if (!guiState) return;
    const name = guiState.currentProject
      ? guiState.currentProject.replace(/\/+$/, '').split('/').pop() || null
      : null;
    setOverviewData((prev) => ({
      ...prev,
      project: { currentName: name, recentCount: guiState.recentProjects.length },
    }));
  }, [guiState?.currentProject, guiState?.recentProjects.length]);

  /* ---- 项目切换（全局，所有页面共享） ---- */
  function handleSelectProject(projectDir: string) {
    if (!guiState) return;
    const normalized = projectDir.replace(/\/+$/, '');
    const newState = setCurrentProject(guiState, normalized);
    setGuiState(newState);
    void saveGuiState(newState);
    void loadGlobalData(normalized);
  }

  async function handleOpenDirectory() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const selected = await invoke<string | null>('open_directory_dialog');
      if (selected) handleSelectProject(selected);
    } catch {
      const dir = window.prompt('输入项目目录路径：');
      if (dir) handleSelectProject(dir);
    }
  }

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
        {/* 顶栏：项目切换器（常驻） + 全局操作 */}
        <header
          className="app-main__header"
          data-tauri-drag-region
          style={{ alignItems: 'center' }}
        >
          <ProjectSwitcher
            currentProject={guiState?.currentProject ?? null}
            recentProjects={guiState?.recentProjects ?? []}
            hasProjectConfig={hasProjectConfig}
            onSelect={handleSelectProject}
            onOpenDirectory={() => void handleOpenDirectory()}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <ThemeToggle />
          </div>
        </header>

        <div className="app-main__content" key={guiState?.currentProject ?? '__none__'}>
          {renderPage(
            route,
            guiState?.recentProjects.length ?? 0,
            guiState?.currentProject ?? null,
            overviewData,
            setRoute,
            () => void loadGlobalData(guiState?.currentProject ?? undefined),
          )}
        </div>
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

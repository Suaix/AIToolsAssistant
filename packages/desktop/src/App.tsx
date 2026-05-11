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
import { useEffect, useState, useCallback, useRef } from 'react';
import { Sidebar, type SidebarCounts } from './components/Sidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { ProjectSwitcher } from './components/ProjectSwitcher';
import { OnboardingWizard } from './components/OnboardingWizard';
import { InvalidProjectModal } from './components/InvalidProjectModal';
import {
  ConfigMigrationModal,
  type GuiMigrationOutcome,
} from './components/ConfigMigrationModal';
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
import {
  detectProjectTools,
  aggregateExpectedDirs,
  getToolDisplayName,
} from './lib/tools';

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

  /**
   * 当前已连接工具列表的缓存 ref（FEAT-004 TD-2）
   *
   * 由 loadGlobalData 写入，handleOpenDirectory 添加项目时读取以做合法性校验。
   * 用 ref 而非 state：避免与 loadGlobalData 形成依赖循环。
   */
  const enabledTargetsRef = useRef<string[]>([]);

  /** 校验失败弹窗状态（null=不显示）·FEAT-004 */
  const [invalidProject, setInvalidProject] = useState<{
    selectedPath: string;
    connectedTools: string[];
    expectedDirs: string[];
  } | null>(null);

  /** 配置自动升级弹窗状态（null=不显示）·FEAT-005 */
  const [migrationOutcome, setMigrationOutcome] =
    useState<GuiMigrationOutcome | null>(null);

  /* ---- 启动时探测 .last-migration.json ---- */
  useEffect(() => {
    void (async () => {
      try {
        /* 通过 Tauri 读取 ~/.aitools/.last-migration.json，
           CLI 端迁移管线落盘；GUI 仅消费 migrated / migrated_with_conflicts */
        const { invoke } = await import('@tauri-apps/api/core');
        const { homeDir } = await import('@tauri-apps/api/path');
        const home = await homeDir();
        const fileRel = '.aitools/.last-migration.json';
        const ackKey = 'aitools.migrationAck';

        const raw = await invoke<string | null>('read_text_file_optional', {
          basePath: home,
          relativePath: fileRel,
        }).catch(() => null);

        if (!raw) return;

        const parsed = JSON.parse(raw) as
          | (GuiMigrationOutcome & { persistedAt?: string; backupPath?: string | null })
          | null;
        if (!parsed) return;

        /* FIX-001：陈旧记录校验
           如果 backupPath 指向的文件已不存在（被 tmp 清理 / 用户删除 / 路径异常），
           则判定为陈旧记录，静默清理 .last-migration.json 不弹窗。
           避免向用户展示指向不存在备份的误导性弹窗。 */
        if (typeof parsed.backupPath === 'string' && parsed.backupPath.length > 0) {
          const exists = await invoke<boolean>('file_exists_absolute', {
            path: parsed.backupPath,
          }).catch(() => false);
          if (!exists) {
            await invoke('delete_file_optional', {
              basePath: home,
              relativePath: fileRel,
            }).catch(() => {});
            return;
          }
        }

        /* localStorage ack：按 persistedAt 维度去重，避免重复弹窗 */
        const ackedAt = window.localStorage.getItem(ackKey);
        if (ackedAt && parsed.persistedAt && ackedAt === parsed.persistedAt) {
          return;
        }

        if (
          parsed.status === 'migrated' ||
          parsed.status === 'migrated_with_conflicts'
        ) {
          setMigrationOutcome(parsed);
        }
      } catch {
        /* 兜底通道失败不影响主流程 */
      }
    })();
  }, []);

  /** 关闭迁移弹窗：写 ack + 清理落盘文件 */
  const handleAckMigration = useCallback(() => {
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { homeDir } = await import('@tauri-apps/api/path');
        const home = await homeDir();
        await invoke('delete_file_optional', {
          basePath: home,
          relativePath: '.aitools/.last-migration.json',
        }).catch(() => {});

        if (migrationOutcome && 'persistedAt' in migrationOutcome) {
          const persistedAt = (migrationOutcome as { persistedAt?: string })
            .persistedAt;
          if (persistedAt) {
            window.localStorage.setItem('aitools.migrationAck', persistedAt);
          }
        }
      } catch {
        /* ack 写入失败不影响主流程 */
      }
      setMigrationOutcome(null);
    })();
  }, [migrationOutcome]);

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

      /* FEAT-004：缓存当前已连接工具列表，供 handleOpenDirectory 合法性校验复用 */
      enabledTargetsRef.current = result.enabledTargets;

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
    /** 选中目录后的统一校验+落地入口 */
    const handlePicked = async (selected: string) => {
      const connected = enabledTargetsRef.current;

      /* FEAT-004：合法性校验
       *   · 当用户已连接至少一个工具时，要求选中目录根层级至少存在一个对应标记目录；
       *   · 当 connected 为空（首次使用、尚未走 onboarding）时，不阻断添加，
       *     这是 TD-5 的"克制先于全面"决策。
       */
      if (connected.length > 0) {
        const projectTools = await detectProjectTools(selected, connected);
        if (projectTools.length === 0) {
          setInvalidProject({
            selectedPath: selected,
            connectedTools: connected.map(getToolDisplayName),
            expectedDirs: aggregateExpectedDirs(connected),
          });
          return; // 不写入 recentProjects、不切换 currentProject
        }
      }
      handleSelectProject(selected);
    };

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const selected = await invoke<string | null>('open_directory_dialog');
      if (selected) await handlePicked(selected);
    } catch {
      const dir = window.prompt('输入项目目录路径：');
      if (dir) await handlePicked(dir);
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

      {/* 添加项目失败弹窗（FEAT-004） */}
      {invalidProject && (
        <InvalidProjectModal
          selectedPath={invalidProject.selectedPath}
          connectedTools={invalidProject.connectedTools}
          expectedDirs={invalidProject.expectedDirs}
          onClose={() => setInvalidProject(null)}
        />
      )}

      {/* 配置自动升级弹窗（FEAT-005） */}
      {migrationOutcome && (
        <ConfigMigrationModal
          outcome={migrationOutcome}
          onAck={handleAckMigration}
        />
      )}
    </div>
  );
}

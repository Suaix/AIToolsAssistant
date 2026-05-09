/**
 * Skills 列表页 · RFC-002 阶段 2 Tab 化
 *
 * 遵循设计系统 L2 原则：
 * - 「状态先于功能」：4 态（loading / error / empty / ready）
 * - 「明确先于惊喜」：订阅 scope 由用户在 Popover 中显式选择
 * - 「克制先于全面」：订阅后不自动跳 Tab，只刷新并 toast 提示
 *
 * 三段 Tab 归类规则（来自 RFC-002 §3.3）：
 *   User Subscriptions：至少有一个 subscriptions[scope=user]
 *   Project Subscriptions：至少有一个 subscriptions[scope=project, projectDir=当前]
 *   Unused：无任何订阅（或只有其他项目的订阅）
 *
 * 同一资源可能在多个 Tab 都出现——用户看到的是「订阅关系」而非「资源身份」。
 */
import { useEffect, useState } from 'react';
import {
  Package,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowRightCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  listResources,
  subscribeResource,
  unsubscribeResource,
  type ResourceView,
  type ResourceListResult,
  type SubscriptionScope,
  type SyncStatus,
  CliError,
} from '../lib/cli';
import { SyncProgressModal } from '../components/SyncProgressModal';
import { SubscribePopover } from '../components/SubscribePopover';
import { detectProjectTools, getToolDisplayName } from '../lib/tools';

/* ============================================================
 * 常量映射
 * ============================================================ */

/** 同步状态展示映射（badge 文案） */
const STATUS_LABEL: Record<SyncStatus, string> = {
  synced: '已同步',
  changed: '需更新',
  not_synced: '未同步',
};

/** 同步状态到 badge 修饰类的映射 */
const STATUS_BADGE_CLASS: Record<SyncStatus, string> = {
  synced: 'badge--success',
  changed: 'badge--warning',
  not_synced: 'badge--neutral',
};

/* ============================================================
 * 类型定义
 * ============================================================ */

/** Tab 标识 */
type TabName = 'user' | 'project' | 'unused';

/** 同步任务上下文 */
type SyncTask =
  | { kind: 'all' }
  | { kind: 'one'; dirName: string; displayName: string };

/** 正在进行的订阅操作（用于显示 Popover） */
interface PendingSubscribe {
  /** 目标资源 dirName */
  dirName: string;
  /** 资源显示名 */
  displayName: string;
}

/** 正在进行的取消订阅操作（用于显示确认对话框） */
interface PendingUnsubscribe {
  /** 目标资源 dirName */
  dirName: string;
  /** 资源显示名 */
  displayName: string;
  /** 取消订阅的 scope */
  scope: SubscriptionScope;
}

/* ============================================================
 * 主组件
 * ============================================================ */

/** Skills 组件 Props */
export interface SkillsProps {
  /** 使用过本工具的项目总数（来自 gui-state.recentProjects.length） */
  recentProjectCount?: number;
  /** 当前选中的项目路径（影响 CLI 的 cwd） */
  currentProject?: string | null;
}

/**
 * Skills 页面主组件
 */
export function Skills({ recentProjectCount = 0, currentProject }: SkillsProps) {
  /** 页面状态：loading | error | ready */
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  /** 查询结果 */
  const [result, setResult] = useState<ResourceListResult | null>(null);
  /** 错误消息 */
  const [errorMsg, setErrorMsg] = useState('');
  /** 当前激活 Tab */
  const [activeTab, setActiveTab] = useState<TabName>('user');
  /** 同步任务（控制 SyncProgressModal） */
  const [syncTask, setSyncTask] = useState<SyncTask | null>(null);
  /** 正在进行的订阅操作（控制 SubscribePopover） */
  const [pendingSub, setPendingSub] = useState<PendingSubscribe | null>(null);
  /** 正在进行的取消订阅操作（控制确认对话框） */
  const [pendingUnsub, setPendingUnsub] = useState<PendingUnsubscribe | null>(null);
  /** 取消订阅时是否勾选 --prune */
  const [unsubPrune, setUnsubPrune] = useState(false);
  /** 操作中（防快速重复点击） */
  const [busy, setBusy] = useState(false);
  /** toast 消息 */
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  /**
   * 当前项目实际关联的工具集合（FEAT-004）
   * 由 loadData 后通过 detectProjectTools 动态计算，不持久化（Q-1 决策）。
   */
  const [projectTools, setProjectTools] = useState<string[]>([]);
  /** projectTools 是否正在加载（用于 SubscribePopover 的"检测中..."态） */
  const [projectToolsLoading, setProjectToolsLoading] = useState(false);

  /* 首次挂载加载 */
  useEffect(() => {
    void loadData(currentProject ?? undefined);
  }, []);

  /* toast 自动消失 */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * 从 CLI 加载 skills 数据
   * @param projectCwd 可选的项目目录（影响 CLI 的项目级订阅检测）
   *
   * FEAT-004：加载完毕后基于 result.projectDir + result.enabledTargets
   *   动态探测当前项目实际关联的工具集合，写入 projectTools state。
   */
  async function loadData(projectCwd?: string) {
    setStatus('loading');
    try {
      const data = await listResources('skills', projectCwd);
      setResult(data);
      setStatus('ready');

      /* 动态探测项目关联工具集合 */
      const projectDir = data.projectDir;
      if (projectDir && data.enabledTargets.length > 0) {
        setProjectToolsLoading(true);
        try {
          const tools = await detectProjectTools(projectDir, data.enabledTargets);
          setProjectTools(tools);
        } finally {
          setProjectToolsLoading(false);
        }
      } else {
        setProjectTools([]);
        setProjectToolsLoading(false);
      }
    } catch (err) {
      const message =
        err instanceof CliError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误';
      setErrorMsg(message);
      setStatus('error');
    }
  }

  /* ============================================================
   * 数据分类（Tab 归类）
   * ============================================================ */
  const allResources = result?.resources ?? [];
  /** CLI cwd 检测到的项目路径（当 App 层切换项目后，此值即为选中的项目） */
  const cliProjectDir = result?.projectDir ?? null;

  /** User Tab：至少有一个 scope=user 的订阅 */
  const userResources = allResources.filter((r) =>
    r.subscriptions.some((s) => s.scope === 'user'),
  );
  /** Project Tab：以用户选中的项目为准；未选择项目时为空 */
  const projectResources = cliProjectDir
    ? allResources.filter((r) =>
        r.subscriptions.some(
          (s) =>
            s.scope === 'project' &&
            normalizePath(s.projectDir ?? '') === normalizePath(cliProjectDir),
        ),
      )
    : [];
  /** Unused Tab：无任何订阅 */
  const unusedResources = allResources.filter(
    (r) => r.subscriptions.length === 0,
  );

  /* Tab 计数 */
  const tabCounts: Record<TabName, number> = {
    user: userResources.length,
    project: projectResources.length,
    unused: unusedResources.length,
  };

  /** 当前 Tab 对应的资源列表 */
  function getTabResources(): ResourceView[] {
    switch (activeTab) {
      case 'user':
        return userResources;
      case 'project':
        return projectResources;
      case 'unused':
        return unusedResources;
    }
  }

  /* ============================================================
   * 订阅操作
   * ============================================================ */

  /**
   * 执行订阅
   */
  async function handleSubscribe(scope: SubscriptionScope, sync: boolean) {
    if (!pendingSub || busy) return;
    setBusy(true);
    setPendingSub(null);
    try {
      /* scope=project 时，先确保项目配置存在（CLI JSON 模式不会自动创建） */
      if (scope === 'project' && cliProjectDir) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('ensure_project_config', { projectDir: cliProjectDir });
      }
      const events = await subscribeResource({
        type: 'skills',
        name: pendingSub.dirName,
        scope,
        sync,
        cwd: scope === 'project' && cliProjectDir ? cliProjectDir : undefined,
      });
      /* 检查是否有错误 */
      const errEvt = events.find((e) => e.event === 'error');
      if (errEvt) {
        const msg = (errEvt.data as { message: string }).message;
        setToast({ text: msg, kind: 'error' });
      } else {
        const scopeLabel = scope === 'user' ? '用户级' : '项目级';
        setToast({
          text: `已订阅「${pendingSub.displayName}」到${scopeLabel}`,
          kind: 'success',
        });
      }
      /* 刷新列表 */
      await loadData(cliProjectDir ?? undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ text: `订阅失败：${msg}`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /**
   * 执行取消订阅
   */
  async function handleUnsubscribe() {
    if (!pendingUnsub || busy) return;
    setBusy(true);
    setPendingUnsub(null);
    try {
      const events = await unsubscribeResource({
        type: 'skills',
        name: pendingUnsub.dirName,
        scope: pendingUnsub.scope,
        prune: unsubPrune,
        cwd: pendingUnsub.scope === 'project' && cliProjectDir ? cliProjectDir : undefined,
      });
      const errEvt = events.find((e) => e.event === 'error');
      if (errEvt) {
        const msg = (errEvt.data as { message: string }).message;
        setToast({ text: msg, kind: 'error' });
      } else {
        setToast({
          text: `已取消订阅「${pendingUnsub.displayName}」`,
          kind: 'success',
        });
      }
      setUnsubPrune(false);
      await loadData(cliProjectDir ?? undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ text: `取消订阅失败：${msg}`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /* ============================================================
   * 状态 1：加载中
   * ============================================================ */
  if (status === 'loading') {
    return (
      <div className="empty-state" aria-live="polite" aria-busy="true">
        <Loader2
          className="empty-state__icon"
          size={64}
          aria-hidden="true"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <h3 className="empty-state__title">正在读取 Skills…</h3>
        <p className="empty-state__desc">正在调用 aitools --json list skills</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ============================================================
   * 状态 2：加载失败
   * ============================================================ */
  if (status === 'error') {
    return (
      <div className="empty-state" aria-live="assertive">
        <AlertCircle className="empty-state__icon" size={64} aria-hidden="true" />
        <h3 className="empty-state__title">无法读取 Skills</h3>
        <p className="empty-state__desc">{errorMsg}</p>
        <button
          type="button"
          className="btn btn--primary"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => void loadData(cliProjectDir ?? currentProject ?? undefined)}
        >
          重试
        </button>
      </div>
    );
  }

  /* ============================================================
   * 状态 3：空态
   * ============================================================ */
  if (allResources.length === 0) {
    return (
      <div className="empty-state">
        <Package className="empty-state__icon" size={64} aria-hidden="true" />
        <h3 className="empty-state__title">还没有 Skills</h3>
        <p className="empty-state__desc">
          在源目录（~/.aitools/skills/）下新建 Skill 文件夹，再回来刷新即可。
        </p>
      </div>
    );
  }

  /* ============================================================
   * 状态 4：有数据，Tab 化渲染
   * ============================================================ */
  const currentResources = getTabResources();

  return (
    <div>
      {/* 页面 header：统计 + 操作区（无重复标题，标题由侧栏标识） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
          gap: 'var(--space-3)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-body-size)',
            color: 'var(--color-text-primary)',
            fontWeight: 500,
            margin: 0,
          }}
        >
          共 {allResources.length} 项 · 订阅项目{' '}
          {recentProjectCount}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="刷新"
            onClick={() => void loadData(cliProjectDir ?? undefined)}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setSyncTask({ kind: 'all' })}
          >
            同步全部 Skills
          </button>
        </div>
      </div>

      {/* 三段 Tab */}
      <div className="tabs" role="tablist">
        <TabButton
          label="用户级订阅"
          count={tabCounts.user}
          active={activeTab === 'user'}
          onClick={() => setActiveTab('user')}
        />
        <TabButton
          label="项目级订阅"
          count={tabCounts.project}
          active={activeTab === 'project'}
          onClick={() => setActiveTab('project')}
        />
        <TabButton
          label="未订阅"
          count={tabCounts.unused}
          active={activeTab === 'unused'}
          onClick={() => setActiveTab('unused')}
        />
      </div>

      {/* Tab 内容 */}
      <div className="tabs__panel" role="tabpanel">
        {currentResources.length === 0 ? (
          <TabEmpty
            tab={activeTab}
            projectDir={cliProjectDir}
            hasProjectConfig={!!cliProjectDir}
          />
        ) : (
          <div className="card-grid">
            {currentResources.map((item) => (
              <SkillCard
                key={`${activeTab}-${item.dirName}`}
                item={item}
                tab={activeTab}
                projectDir={cliProjectDir}
                projectTools={projectTools}
                onSync={() =>
                  setSyncTask({
                    kind: 'one',
                    dirName: item.dirName,
                    displayName: item.name,
                  })
                }
                onSubscribe={() =>
                  setPendingSub({
                    dirName: item.dirName,
                    displayName: item.name,
                  })
                }
                onUnsubscribe={(scope) =>
                  setPendingUnsub({
                    dirName: item.dirName,
                    displayName: item.name,
                    scope,
                  })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Toast 消息 */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast--${toast.kind === 'success' ? 'success' : 'danger'}`}>
            <div className="toast__body">
              <p className="toast__title">{toast.text}</p>
            </div>
          </div>
        </div>
      )}

      {/* 订阅 Popover */}
      {pendingSub && (
        <SubscribePopover
          resourceName={pendingSub.displayName}
          hasProject={!!cliProjectDir}
          projectTools={projectTools}
          projectToolsLoading={projectToolsLoading}
          onConfirm={(scope, sync) => void handleSubscribe(scope, sync)}
          onCancel={() => setPendingSub(null)}
        />
      )}

      {/* 取消订阅确认对话框 */}
      {pendingUnsub && (
        <UnsubscribeConfirm
          resourceName={pendingUnsub.displayName}
          scope={pendingUnsub.scope}
          prune={unsubPrune}
          onPruneChange={setUnsubPrune}
          onConfirm={() => void handleUnsubscribe()}
          onCancel={() => {
            setPendingUnsub(null);
            setUnsubPrune(false);
          }}
        />
      )}

      {/* 同步 Modal */}
      {syncTask && (
        <SyncProgressModal
          args={buildSyncArgs(syncTask)}
          title={buildSyncTitle(syncTask)}
          /* FEAT-004 BUG-2：项目级同步必须显式传 cwd，否则 CLI fallback 到 $HOME 找不到 .aitools/project.yaml */
          cwd={cliProjectDir ?? currentProject ?? undefined}
          onClose={() => setSyncTask(null)}
          onSyncedSomething={() =>
            void loadData(cliProjectDir ?? currentProject ?? undefined)
          }
        />
      )}
    </div>
  );
}

/* ============================================================
 * Tab 按钮子组件
 * ============================================================ */

interface TabButtonProps {
  /** Tab 显示文案 */
  label: string;
  /** 右侧计数 */
  count: number;
  /** 是否激活 */
  active: boolean;
  /** 点击回调 */
  onClick: () => void;
}

/**
 * Tab 按钮（复用设计系统 .tabs__tab）
 */
function TabButton({ label, count, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tabs__tab${active ? ' tabs__tab--active' : ''}`}
      onClick={onClick}
    >
      {label}
      <span
        className="tabular-nums"
        style={{
          marginLeft: 'var(--space-2)',
          fontSize: 'var(--text-caption-size)',
          color: active ? 'var(--color-brand-default)' : 'var(--color-text-tertiary)',
        }}
      >
        {count}
      </span>
    </button>
  );
}

/* ============================================================
 * Tab 空态子组件
 * ============================================================ */

interface TabEmptyProps {
  tab: TabName;
  projectDir: string | null;
  /** 选中的项目是否有 .aitools/project.yaml */
  hasProjectConfig: boolean;
}

/**
 * 各 Tab 的空态展示
 */
function TabEmpty({ tab, projectDir, hasProjectConfig }: TabEmptyProps) {
  /* 项目级订阅的三态提示 */
  const projectMsg = !projectDir
    ? { title: '请先选择项目', desc: '在顶部项目切换器中选择一个项目目录，即可查看该项目的订阅。' }
    : !hasProjectConfig
      ? {
          title: '当前项目未初始化',
          desc: '切换到「未订阅」Tab 选择一个 Skill 订阅到「项目级」，将自动创建项目配置。或在终端执行 aitools subscribe skills <name> --scope project。',
        }
      : {
          title: '当前项目没有订阅',
          desc: '切换到「未订阅」Tab，选择「项目级」订阅到当前项目。',
        };

  const messages: Record<TabName, { title: string; desc: string }> = {
    user: {
      title: '没有用户级订阅',
      desc: '切换到「未订阅」Tab，点击「订阅」将 Skill 添加到用户级。',
    },
    project: projectMsg,
    unused: {
      title: '所有 Skills 都已订阅',
      desc: '源目录中的所有 Skill 都已被订阅到至少一个位置。',
    },
  };

  const msg = messages[tab];

  return (
    <div className="empty-state">
      <Package className="empty-state__icon" size={48} aria-hidden="true" />
      <h3 className="empty-state__title">{msg.title}</h3>
      <p className="empty-state__desc">{msg.desc}</p>
    </div>
  );
}

/* ============================================================
 * 取消订阅确认对话框
 * ============================================================ */

interface UnsubscribeConfirmProps {
  resourceName: string;
  scope: SubscriptionScope;
  prune: boolean;
  onPruneChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 取消订阅确认弹窗
 * RFC-002 §4.3：直接确认对话框 + --prune 勾选
 */
function UnsubscribeConfirm({
  resourceName,
  scope,
  prune,
  onPruneChange,
  onConfirm,
  onCancel,
}: UnsubscribeConfirmProps) {
  const scopeLabel = scope === 'user' ? '用户级' : '项目级';

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsub-confirm-title"
    >
      <div className="modal modal--xs">
        <header className="modal__header">
          <h2 className="modal__title" id="unsub-confirm-title">
            取消订阅
          </h2>
        </header>
        <div className="modal__body">
          <p style={{ margin: '0 0 var(--space-4)', color: 'var(--color-text-primary)' }}>
            取消订阅「{resourceName}」（{scopeLabel}）？
          </p>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              cursor: 'pointer',
              fontSize: 'var(--text-body-sm-size)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={prune}
              onChange={(e) => onPruneChange(e.target.checked)}
            />
            同时从工具目录中删除已同步的文件（--prune）
          </label>
        </div>
        <footer className="modal__footer">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn--danger" onClick={onConfirm}>
            确认取消订阅
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
 * CLI 参数构造
 * ============================================================ */

/**
 * 构造 sync CLI 参数
 */
function buildSyncArgs(task: SyncTask): string[] {
  if (task.kind === 'all') {
    return ['sync', 'skills'];
  }
  return ['sync', 'skills', task.dirName];
}

/**
 * 构造 Modal 标题
 */
function buildSyncTitle(task: SyncTask): string {
  if (task.kind === 'all') {
    return '同步全部 Skills';
  }
  return `同步 · ${task.displayName}`;
}

/* ============================================================
 * SkillCard 子组件
 * ============================================================ */

interface SkillCardProps {
  /** 资源条目 */
  item: ResourceView;
  /** 当前所在 Tab（决定显示哪些按钮） */
  tab: TabName;
  /** 当前项目路径 */
  projectDir: string | null;
  /**
   * 当前项目实际关联的工具集合（FEAT-004）
   *   仅项目级订阅 Tab 用：判定行内 target 是否处于"工具已断开"灰态
   */
  projectTools: string[];
  /** 同步回调 */
  onSync: () => void;
  /** 订阅回调（Unused Tab 可见） */
  onSubscribe: () => void;
  /** 取消订阅回调（User/Project Tab 可见） */
  onUnsubscribe: (scope: SubscriptionScope) => void;
}

/**
 * Skill 卡片组件（Tab 感知）
 *
 * - Unused Tab：显示「订阅」按钮
 * - User/Project Tab：显示同步状态 badge + 「取消订阅」+「同步」按钮
 */
function SkillCard({
  item,
  tab,
  projectDir,
  projectTools,
  onSync,
  onSubscribe,
  onUnsubscribe,
}: SkillCardProps) {
  const desc =
    item.description && item.description !== '-'
      ? item.description
      : '（该 Skill 未填写描述）';

  /* 根据 Tab 获取当前视角的订阅 */
  const currentSub =
    tab === 'user'
      ? item.subscriptions.find((s) => s.scope === 'user')
      : tab === 'project'
        ? item.subscriptions.find(
            (s) =>
              s.scope === 'project' &&
              normalizePath(s.projectDir ?? '') === normalizePath(projectDir ?? ''),
          )
        : undefined;

  /* 当前视角的 target 状态（Unused Tab 无） */
  const targetStatuses = currentSub?.targets ?? [];
  const hasUnsynced = targetStatuses.some((t) => t.status !== 'synced');
  /**
   * FEAT-004：仅项目级订阅有"工具断开"概念。
   * 是否所有 target 都已断开——若是则隐藏"同步"按钮（无可同步对象）。
   */
  const allDisconnected =
    currentSub?.scope === 'project' &&
    targetStatuses.length > 0 &&
    targetStatuses.every((t) => !projectTools.includes(t.target));

  /* Unused Tab 下的 scope 推导 */
  const scopeLabel =
    tab === 'user'
      ? '用户级'
      : tab === 'project'
        ? '项目级'
        : '候选';

  return (
    <article className="card">
      <header className="card__header">
        <h3 className="card__title">{item.name}</h3>
      </header>
      <div className="card__meta">
        <span className="tag">Skill</span>
        <span className="tag tag--neutral">{scopeLabel}</span>
        <span
          className="font-mono"
          style={{
            marginLeft: 'var(--space-2)',
            fontSize: 'var(--text-caption-size)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {item.sourceHash.slice(0, 8)}
        </span>
      </div>
      <p className="card__desc">{desc}</p>
      <div className="card__footer">
        {/* 同步状态 badge（User / Project Tab）
         *  FEAT-004：项目级订阅下，若 target 不在 projectTools 中（即工具已被断开），
         *  渲染为 .badge--disabled 灰态并展示「<displayName> 连接已断开」短提示，
         *  禁用同步按钮。用户级订阅不受此影响。
         */}
        {targetStatuses.map((t) => {
          const isProjectScope = currentSub?.scope === 'project';
          const isDisconnected =
            isProjectScope && !projectTools.includes(t.target);
          if (isDisconnected) {
            return (
              <span
                key={t.target}
                className="badge badge--disabled"
                title={t.targetPath}
              >
                <span className="badge__dot" />
                {getToolDisplayName(t.target)} 连接已断开
              </span>
            );
          }
          return (
            <span
              key={t.target}
              className={`badge ${STATUS_BADGE_CLASS[t.status]}`}
              title={t.targetPath}
            >
              <span className="badge__dot" />
              {STATUS_LABEL[t.status]} · {getToolDisplayName(t.target)}
            </span>
          );
        })}

        {/* 操作按钮区：靠右对齐 */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-2)' }}>
          {/* Unused Tab：订阅按钮 */}
          {tab === 'unused' && (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={onSubscribe}
              aria-label={`订阅 ${item.name}`}
            >
              <Plus size={14} aria-hidden="true" />
              订阅
            </button>
          )}

          {/* User / Project Tab：取消订阅 + 同步 */}
          {tab !== 'unused' && currentSub && (
            <>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onUnsubscribe(currentSub.scope)}
                aria-label={`取消订阅 ${item.name}`}
              >
                <Trash2 size={14} aria-hidden="true" />
                取消订阅
              </button>
              {hasUnsynced && !allDisconnected && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={onSync}
                  aria-label={`同步 ${item.name}`}
                >
                  <ArrowRightCircle size={14} aria-hidden="true" />
                  同步
                </button>
              )}
            </>
          )}
        </span>
      </div>
    </article>
  );
}

/* ============================================================
 * 工具函数
 * ============================================================ */

/**
 * 路径规范化：去尾部斜杠，保证匹配一致性
 */
function normalizePath(p: string): string {
  return p.replace(/\/+$/, '');
}

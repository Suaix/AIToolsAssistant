/**
 * Dashboard 工作台页面 · RFC-002 阶段 3 完整 5 态
 *
 * L2 原则「状态先于功能」：
 * HeroCard 5 态对齐 RFC-002 §3.4：
 *   - loading：正在调用 CLI
 *   - cli_missing：未检测到 aitools CLI
 *   - error：上一次操作有错误
 *   - empty / no_subscription：无订阅
 *   - synced：全部就绪
 *   - drift：存在未同步 / 需更新
 */
import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Terminal,
  RefreshCw,
  Package,
} from 'lucide-react';
import {
  checkCliAvailable,
  listResources,
  type ResourceView,
  CliError,
} from '../lib/cli';
import { SyncProgressModal } from '../components/SyncProgressModal';

/**
 * Dashboard 5 态状态机（对齐 RFC-002 §3.4 HeroCard 5 态）
 */
type DashboardState =
  | { kind: 'loading' }
  | { kind: 'cli_missing' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'no_subscription'; candidateCount: number }
  | { kind: 'synced'; subscribeCount: number; candidateCount: number }
  | { kind: 'drift'; subscribeCount: number; candidateCount: number; driftCount: number };

/**
 * 工作台主页面
 */
export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    void loadDashboard();
  }, []);

  /**
   * 加载 Dashboard 数据
   */
  async function loadDashboard() {
    setState({ kind: 'loading' });

    /* CLI 健康检查 */
    try {
      const available = await checkCliAvailable();
      if (!available) {
        setState({ kind: 'cli_missing' });
        return;
      }
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    /* 拉取 skills 数据 */
    try {
      const result = await listResources('skills');
      const allResources = result.resources;
      const subscribedResources = allResources.filter(
        (r) => r.subscriptions.length > 0,
      );
      const candidateCount = allResources.length - subscribedResources.length;
      const driftCount = countUnsynced(subscribedResources);

      /* 5 态判定（RFC-002 §3.4） */
      if (allResources.length === 0) {
        setState({ kind: 'empty' });
      } else if (subscribedResources.length === 0) {
        setState({ kind: 'no_subscription', candidateCount });
      } else if (driftCount === 0) {
        setState({
          kind: 'synced',
          subscribeCount: subscribedResources.length,
          candidateCount,
        });
      } else {
        setState({
          kind: 'drift',
          subscribeCount: subscribedResources.length,
          candidateCount,
          driftCount,
        });
      }
    } catch (err) {
      const message =
        err instanceof CliError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误';
      setState({ kind: 'error', message });
    }
  }

  return (
    <div>
      <HeroCard
        state={state}
        onRetry={() => void loadDashboard()}
        onSync={() => setSyncOpen(true)}
      />

      {/* 同步进度弹窗 */}
      {syncOpen && (
        <SyncProgressModal
          args={['sync', 'skills']}
          title="同步全部 Skills"
          onClose={() => setSyncOpen(false)}
          onSyncedSomething={() => void loadDashboard()}
        />
      )}
    </div>
  );
}

/* ============================================================
 * HeroCard 子组件 —— 完整 5 态
 * ============================================================ */

interface HeroCardProps {
  state: DashboardState;
  onRetry: () => void;
  onSync: () => void;
}

/**
 * 首屏状态卡片：5 态驱动（RFC-002 §3.4）
 */
function HeroCard({ state, onRetry, onSync }: HeroCardProps) {
  /* ---- loading ---- */
  if (state.kind === 'loading') {
    return (
      <section className="hero-card" aria-live="polite" aria-busy="true">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <Loader2
              className="hero-card__icon"
              style={{ animation: 'spin 1s linear infinite' }}
            />
            <h2 className="hero-card__title">正在检查同步状态…</h2>
          </div>
          <p className="hero-card__sub">调用 aitools CLI 获取实时数据</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </section>
    );
  }

  /* ---- cli_missing ---- */
  if (state.kind === 'cli_missing') {
    return (
      <section className="hero-card hero-card--warning" aria-live="assertive">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <Terminal className="hero-card__icon" />
            <h2 className="hero-card__title">未检测到 aitools CLI</h2>
          </div>
          <p className="hero-card__sub">
            请在终端执行{' '}
            <code
              className="font-mono"
              style={{
                background: 'var(--color-bg-subtle)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              npm i -g aitools-cli
            </code>{' '}
            安装
          </p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            重新检查
          </button>
        </div>
      </section>
    );
  }

  /* ---- error ---- */
  if (state.kind === 'error') {
    return (
      <section className="hero-card hero-card--danger" aria-live="assertive">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <AlertTriangle className="hero-card__icon" />
            <h2 className="hero-card__title">无法获取同步状态</h2>
          </div>
          <p className="hero-card__sub">{state.message}</p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            查看错误
          </button>
        </div>
      </section>
    );
  }

  /* ---- empty：源目录无资源 ---- */
  if (state.kind === 'empty') {
    return (
      <section className="hero-card" aria-live="polite">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <Package className="hero-card__icon" />
            <h2 className="hero-card__title">你写一次，它到处都在</h2>
          </div>
          <p className="hero-card__sub">
            在 ~/.aitools/skills/ 下放置 Skill 文件夹，开始你的第一次同步
          </p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            开始订阅
          </button>
        </div>
      </section>
    );
  }

  /* ---- no_subscription：有资源但没订阅 ---- */
  if (state.kind === 'no_subscription') {
    return (
      <section className="hero-card" aria-live="polite">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <Package className="hero-card__icon" />
            <h2 className="hero-card__title">你写一次，它到处都在</h2>
          </div>
          <p className="hero-card__sub">
            发现 {state.candidateCount} 个候选 Skill · 去 Skills 页订阅你的第一个
          </p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            订阅第一个 skill
          </button>
        </div>
      </section>
    );
  }

  /* ---- synced：全部就绪 ---- */
  if (state.kind === 'synced') {
    return (
      <section className="hero-card hero-card--success" aria-live="polite">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <CheckCircle2 className="hero-card__icon" />
            <h2 className="hero-card__title">你写一次，它到处都在</h2>
          </div>
          <p className="hero-card__sub">
            {state.subscribeCount} 个订阅 · {state.candidateCount} 个候选 · 0 个需同步
          </p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            查看详情
          </button>
        </div>
      </section>
    );
  }

  /* ---- drift：存在需同步 ---- */
  return (
    <section className="hero-card hero-card--warning" aria-live="polite">
      <div className="hero-card__bar" />
      <div className="hero-card__content">
        <div className="hero-card__main">
          <AlertTriangle className="hero-card__icon" />
          <h2 className="hero-card__title">你写一次，它到处都在</h2>
        </div>
        <p className="hero-card__sub">
          {state.subscribeCount} 个订阅 · {state.candidateCount} 个候选 ·{' '}
          {state.driftCount} 个需同步
        </p>
      </div>
      <div className="hero-card__action">
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onRetry}
          aria-label="刷新"
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn--primary" onClick={onSync}>
          一键同步全部
        </button>
      </div>
    </section>
  );
}

/* ============================================================
 * 工具函数
 * ============================================================ */

/**
 * 统计已订阅资源中"未同步或需更新"的项数
 */
function countUnsynced(resources: ResourceView[]): number {
  let count = 0;
  for (const r of resources) {
    const hasNonSynced = r.subscriptions.some((sub) =>
      sub.targets.some((t) => t.status !== 'synced'),
    );
    if (hasNonSynced) count++;
  }
  return count;
}

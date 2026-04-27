/**
 * Dashboard 工作台页面 · 阶段 3 对接 CLI 只读
 *
 * 遵循 L2 原则 2「状态先于功能」：
 * HeroCard 根据真实环境呈现 4 态之一：
 *   - loading：正在调用 CLI
 *   - cli_missing：未检测到 aitools CLI（指引安装）
 *   - all_synced：所有资源已同步（success 型）
 *   - has_unsynced：存在未同步/需更新（warning 型）
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Terminal } from 'lucide-react';
import {
  checkCliAvailable,
  listResources,
  type ResourceListItem,
  CliError,
} from '../lib/cli';

/** Dashboard 状态机的 5 种状态 */
type DashboardState =
  | { kind: 'loading' }
  | { kind: 'cli_missing' }
  | { kind: 'error'; message: string }
  | { kind: 'all_synced'; total: number }
  | { kind: 'has_unsynced'; total: number; unsyncedCount: number };

/**
 * 工作台主页面
 */
export function Dashboard() {
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });

  useEffect(() => {
    void loadDashboard();
  }, []);

  /**
   * 加载 Dashboard 数据：
   * 1. 先检查 CLI 可用性
   * 2. 若可用，调用 list skills 拿资源汇总
   * 3. 统计同步状态
   */
  async function loadDashboard() {
    setState({ kind: 'loading' });

    /* 步骤 1：CLI 健康检查 */
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

    /* 步骤 2：拉取 skills 数据 */
    try {
      const result = await listResources('skills');
      const allResources = [...result.userResources, ...result.projectResources];
      const unsyncedCount = countUnsynced(allResources);

      if (allResources.length === 0) {
        /* 空源目录：按"都同步了（0 项）"处理，文案仍写 0 项，不制造焦虑 */
        setState({ kind: 'all_synced', total: 0 });
        return;
      }

      if (unsyncedCount === 0) {
        setState({ kind: 'all_synced', total: allResources.length });
      } else {
        setState({
          kind: 'has_unsynced',
          total: allResources.length,
          unsyncedCount,
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
      <HeroCard state={state} onRetry={() => void loadDashboard()} />

      {/* 开发进度区（保留，作为 MVP 阶段的透明沟通） */}
      <section className="page-section">
        <div className="page-section__header">
          <h2 className="page-section__title">开发进度</h2>
        </div>
        <div className="card-stack">
          <article className="card">
            <h3 className="card__title">✅ 阶段 1 · CLI 改造</h3>
            <p className="card__desc">
              已完成：新增 --json 输出模式，支持 NDJSON 流式事件，为 GUI 提供稳定数据契约。
            </p>
          </article>
          <article className="card">
            <h3 className="card__title">✅ 阶段 2 · 桌面骨架</h3>
            <p className="card__desc">
              已完成：Tauri + React + TypeScript 工程；Sidebar；主题切换；macOS 标题栏适配。
            </p>
          </article>
          <article className="card">
            <h3 className="card__title">🔨 阶段 3 · 对接 CLI 只读（当前）</h3>
            <p className="card__desc">
              已完成：Rust invoke_cli command；NDJSON 解析层；Skills 页 4 态化；Dashboard 实时健康度。
            </p>
          </article>
          <article className="card">
            <h3 className="card__title">⏳ 阶段 4 · 双向同步</h3>
            <p className="card__desc">
              待开发：同步按钮；Tauri event 流式进度；640ms 同步魔法动效。
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
 * HeroCard 子组件 —— 按状态渲染 4 种变体
 * ============================================================ */

interface HeroCardProps {
  state: DashboardState;
  onRetry: () => void;
}

/**
 * 首屏状态卡片：5 态驱动的视觉焦点
 */
function HeroCard({ state, onRetry }: HeroCardProps) {
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
            安装，装好后点击右侧刷新
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

  if (state.kind === 'error') {
    return (
      <section className="hero-card hero-card--warning" aria-live="assertive">
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
            重试
          </button>
        </div>
      </section>
    );
  }

  if (state.kind === 'all_synced') {
    return (
      <section className="hero-card hero-card--success" aria-live="polite">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <CheckCircle2 className="hero-card__icon" />
            <h2 className="hero-card__title">
              {state.total === 0
                ? '暂无 Skills · 等待你添加'
                : `全部就绪 · ${state.total} 个 Skills 已同步`}
            </h2>
          </div>
          <p className="hero-card__sub">
            {state.total === 0
              ? '在 ~/.aitools/skills/ 下放置 Skill 文件夹，刷新后即可看到'
              : '所有 AI 工具的配置文件与源目录保持一致'}
          </p>
        </div>
        <div className="hero-card__action">
          <button type="button" className="btn btn--ghost" onClick={onRetry}>
            刷新
          </button>
        </div>
      </section>
    );
  }

  /* has_unsynced */
  return (
    <section className="hero-card hero-card--warning" aria-live="polite">
      <div className="hero-card__bar" />
      <div className="hero-card__content">
        <div className="hero-card__main">
          <AlertTriangle className="hero-card__icon" />
          <h2 className="hero-card__title">
            {state.unsyncedCount} 处待同步 · 共 {state.total} 个 Skills
          </h2>
        </div>
        <p className="hero-card__sub">
          源目录中部分变更尚未同步到 AI 工具的配置中
        </p>
      </div>
      <div className="hero-card__action">
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          刷新
        </button>
      </div>
    </section>
  );
}

/* ============================================================
 * 工具函数
 * ============================================================ */

/**
 * 统计资源列表中"未同步或需更新"的项数
 *
 * 定义：只要有任意一个 target 状态不是 synced，就计为 1 项未同步
 */
function countUnsynced(resources: ResourceListItem[]): number {
  let count = 0;
  for (const r of resources) {
    const hasNonSynced = r.targets.some((t) => t.status !== 'synced');
    if (hasNonSynced) count++;
  }
  return count;
}

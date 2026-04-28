/**
 * Skills 列表页 · 阶段 4 双向同步
 *
 * 严格遵循设计系统 L2 原则 2「状态先于功能」：
 * 页面有 4 个明确状态 —— 加载中 / 错误 / 空态 / 列表
 * 每种状态都用视觉卡位清晰告知用户当前发生什么。
 *
 * 阶段 4 新增：
 * - 页面 header 的「同步全部 Skills」主按钮
 * - 每张 Skill 卡内嵌「同步」按钮（按 dirName 精准同步）
 * - SyncProgressModal 承载同步过程
 *
 * 翻译自 docs/design-system/06-gui-prototype/pages/skills.html 的"所有 Skills"区块
 * （搜索栏与同步魔法演示区为后续阶段实现）
 */
import { useEffect, useState } from 'react';
import { Package, AlertCircle, Loader2, RefreshCw, ArrowRightCircle } from 'lucide-react';
import {
  listResources,
  type ResourceListItem,
  type ResourceListResult,
  type SyncStatus,
  CliError,
} from '../lib/cli';
import { SyncProgressModal } from '../components/SyncProgressModal';

/** 同步状态展示映射（用于 badge 文案） */
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

/**
 * 同步任务上下文：描述当前 Modal 需要执行什么
 * - kind='all'：同步全部 skills
 * - kind='one'：同步某个 skill（dirName）
 */
type SyncTask =
  | { kind: 'all' }
  | { kind: 'one'; dirName: string; displayName: string };

/**
 * Skills 页面主组件
 */
export function Skills() {
  /** 4 态之一：loading | error | ready */
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  /** 查询结果（ready 状态下有效） */
  const [result, setResult] = useState<ResourceListResult | null>(null);
  /** 错误消息（error 状态下有效） */
  const [errorMsg, setErrorMsg] = useState<string>('');
  /** 当前同步任务；null 表示 Modal 未打开 */
  const [syncTask, setSyncTask] = useState<SyncTask | null>(null);

  /* 首次挂载时加载数据 */
  useEffect(() => {
    void loadData();
  }, []);

  /**
   * 从 CLI 加载 skills 数据
   */
  async function loadData() {
    setStatus('loading');
    try {
      const data = await listResources('skills');
      setResult(data);
      setStatus('ready');
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
          onClick={() => void loadData()}
        >
          重试
        </button>
      </div>
    );
  }

  /* ============================================================
   * 状态 3 & 4：ready
   * ============================================================ */
  const userResources = result?.userResources ?? [];
  const projectResources = result?.projectResources ?? [];
  const totalCount = userResources.length + projectResources.length;

  /* ---- 状态 3：空态（CLI 调用成功，但源目录里没有 Skills） ---- */
  if (totalCount === 0) {
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

  /* ---- 状态 4：有数据，正常渲染 ---- */
  return (
    <div>
      {/* 页面 header：标题 + 动作区（同屏仅 1 个 primary） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
          gap: 'var(--space-3)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-h1-size)',
              fontWeight: 'var(--text-h1-weight)',
              lineHeight: 'var(--text-h1-line)',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            Skills
          </h1>
          <p
            style={{
              marginTop: 'var(--space-1)',
              fontSize: 'var(--text-caption-size)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            共 {totalCount} 项 · 用户级 {userResources.length} · 项目级{' '}
            {projectResources.length}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="刷新"
            onClick={() => void loadData()}
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

      {/* 用户级资源段 */}
      {userResources.length > 0 && (
        <section className="page-section">
          <div className="page-section__header">
            <h2 className="page-section__title">用户级 Skills</h2>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-caption-size)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {userResources.length} 项
            </span>
          </div>
          <div className="card-grid">
            {userResources.map((item) => (
              <SkillCard
                key={`user-${item.dirName}`}
                item={item}
                scope="用户级"
                onSync={() =>
                  setSyncTask({
                    kind: 'one',
                    dirName: item.dirName,
                    displayName: item.name,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* 项目级资源段 */}
      {projectResources.length > 0 && (
        <section className="page-section">
          <div className="page-section__header">
            <h2 className="page-section__title">项目级 Skills</h2>
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-caption-size)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {projectResources.length} 项
            </span>
          </div>
          <div className="card-grid">
            {projectResources.map((item) => (
              <SkillCard
                key={`project-${item.dirName}`}
                item={item}
                scope="项目级"
                onSync={() =>
                  setSyncTask({
                    kind: 'one',
                    dirName: item.dirName,
                    displayName: item.name,
                  })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* 同步 Modal —— 按任务上下文挂载 */}
      {syncTask && (
        <SyncProgressModal
          args={buildSyncArgs(syncTask)}
          title={buildSyncTitle(syncTask)}
          onClose={() => setSyncTask(null)}
          onSyncedSomething={() => void loadData()}
        />
      )}
    </div>
  );
}

/**
 * 构造 CLI 参数
 * - 全部同步：`sync skills`
 * - 单个同步：`sync skills --skill <dirName>`（CLI 的 sync.ts 已支持该模式）
 */
function buildSyncArgs(task: SyncTask): string[] {
  if (task.kind === 'all') {
    return ['sync', 'skills'];
  }
  return ['sync', 'skills', '--skill', task.dirName];
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
 * 单个 Skill 卡片
 * ============================================================ */

interface SkillCardProps {
  /** 资源条目 */
  item: ResourceListItem;
  /** 层级显示文案（用户级 / 项目级） */
  scope: string;
  /** 点击「同步」触发；仅该卡有未同步目标时才会渲染按钮 */
  onSync: () => void;
}

/**
 * 单个 Skill 卡片组件
 * 复用设计系统的 .card 结构；不自定义样式
 */
function SkillCard({ item, scope, onSync }: SkillCardProps) {
  /* 描述文案：CLI 用 '-' 表示无描述，这里改为友好文案 */
  const desc =
    item.description && item.description !== '-'
      ? item.description
      : '（该 Skill 未填写描述）';

  /* 只要有任意 target 不是 synced，就允许"单卡同步" */
  const hasUnsynced = item.targets.some((t) => t.status !== 'synced');

  return (
    <article className="card">
      <header className="card__header">
        <h3 className="card__title">{item.name}</h3>
      </header>
      <div className="card__meta">
        <span className="tag">Skill</span>
        <span className="tag tag--neutral">{scope}</span>
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
        {item.targets.map((t) => (
          <span
            key={t.name}
            className={`badge ${STATUS_BADGE_CLASS[t.status]}`}
            title={t.targetPath}
          >
            <span className="badge__dot" />
            {STATUS_LABEL[t.status]} · {t.name}
          </span>
        ))}
        {/* 卡内「同步」按钮：只在有未同步项时出现（状态先于功能：没有待办就不显示动作） */}
        {hasUnsynced && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            style={{ marginLeft: 'auto' }}
            onClick={onSync}
            aria-label={`同步 ${item.name}`}
          >
            <ArrowRightCircle size={14} aria-hidden="true" />
            同步
          </button>
        )}
      </div>
    </article>
  );
}

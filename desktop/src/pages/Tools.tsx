/**
 * 已连接工具页 · RFC-002 阶段 3
 *
 * 展示 config.targets 列表，每个 target 显示：
 * - 名称 + 启用状态开关
 * - 该 target 上的订阅资源数
 *
 * 启用/禁用操作走 `invoke_cli` 调用 `aitools target enable|disable`（RFC-001.1）
 * L2「状态先于功能」：首屏先展示 target 状态，开关是次要动作
 */
import { useEffect, useState } from 'react';
import {
  Link2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import {
  listResources,
  setTargetEnabled,
  type ResourceListResult,
  CliError,
} from '../lib/cli';

/** 页面状态 */
type PageStatus = 'loading' | 'error' | 'ready';

/** 单个 target 的展示数据 */
interface TargetRow {
  /** target 名称 */
  name: string;
  /** 是否启用 */
  enabled: boolean;
  /** 在该 target 上的已订阅资源数（基于 subscriptions[].targets[] 统计） */
  subCount: number;
}

/** target 美化名映射 */
const DISPLAY_NAME: Record<string, string> = {
  codebuddy: 'CodeBuddy',
  'claude-code': 'Claude Code',
  cursor: 'Cursor',
};

/**
 * 已连接工具页主组件
 */
export function Tools() {
  const [status, setStatus] = useState<PageStatus>('loading');
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  /** 正在切换中的 target 名（防快速重复点击） */
  const [toggling, setToggling] = useState<string | null>(null);
  /** toast */
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  /* toast 自动消失 */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * 加载 target 数据
   * 通过 list skills 的 enabledTargets 拿到已启用列表，
   * 再用 resources 的 subscriptions 统计每个 target 的订阅数
   */
  async function loadData() {
    setStatus('loading');
    try {
      const result = await listResources('skills');
      setTargets(buildTargetRows(result));
      setStatus('ready');
    } catch (err) {
      const msg =
        err instanceof CliError
          ? err.message
          : err instanceof Error
            ? err.message
            : '未知错误';
      setErrorMsg(msg);
      setStatus('error');
    }
  }

  /**
   * 切换 target 启用状态
   */
  async function handleToggle(name: string, currentEnabled: boolean) {
    if (toggling) return;
    setToggling(name);
    try {
      const events = await setTargetEnabled(name, !currentEnabled);
      const errEvt = events.find((e) => e.event === 'error');
      if (errEvt) {
        const msg = (errEvt.data as { message: string }).message;
        setToast({ text: msg, kind: 'error' });
      } else {
        const verb = !currentEnabled ? '已启用' : '已禁用';
        setToast({ text: `${displayName(name)} ${verb}`, kind: 'success' });
      }
      /* 刷新列表以反映变化 */
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ text: `操作失败：${msg}`, kind: 'error' });
    } finally {
      setToggling(null);
    }
  }

  /* ---- 加载中 ---- */
  if (status === 'loading') {
    return (
      <div className="empty-state" aria-live="polite" aria-busy="true">
        <Loader2
          className="empty-state__icon"
          size={64}
          aria-hidden="true"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <h3 className="empty-state__title">正在读取工具配置…</h3>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ---- 错误 ---- */
  if (status === 'error') {
    return (
      <div className="empty-state" aria-live="assertive">
        <AlertCircle className="empty-state__icon" size={64} aria-hidden="true" />
        <h3 className="empty-state__title">无法读取工具配置</h3>
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

  /* ---- 空态 ---- */
  if (targets.length === 0) {
    return (
      <div className="empty-state">
        <Link2 className="empty-state__icon" size={64} aria-hidden="true" />
        <h3 className="empty-state__title">没有已配置的工具</h3>
        <p className="empty-state__desc">
          运行 aitools init 配置你的 AI 工具。
        </p>
      </div>
    );
  }

  /* ---- 有数据 ---- */
  const enabledCount = targets.filter((t) => t.enabled).length;

  return (
    <div>
      {/* 页面 header：统计 + 操作（无重复标题） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-6)',
        }}
      >
        <p
          style={{
            fontSize: 'var(--text-caption-size)',
            color: 'var(--color-text-tertiary)',
            margin: 0,
          }}
        >
          {enabledCount}/{targets.length} 个已启用
        </p>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label="刷新"
          onClick={() => void loadData()}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {/* target 列表 */}
      <div className="card-stack">
        {targets.map((t) => (
          <article
            key={t.name}
            className="card"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-6)',
              opacity: t.enabled ? 1 : 0.6,
            }}
          >
            {/* 左侧：启用开关 */}
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label={t.enabled ? `禁用 ${displayName(t.name)}` : `启用 ${displayName(t.name)}`}
              disabled={toggling !== null}
              onClick={() => void handleToggle(t.name, t.enabled)}
              style={{ color: t.enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}
            >
              {t.enabled ? (
                <ToggleRight size={24} aria-hidden="true" />
              ) : (
                <ToggleLeft size={24} aria-hidden="true" />
              )}
            </button>

            {/* 中间：名称 + 状态 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 'var(--text-body-size)',
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                }}
              >
                {displayName(t.name)}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-caption-size)',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '2px',
                }}
              >
                {t.enabled ? `${t.subCount} 个订阅资源` : '已禁用'}
              </div>
            </div>

            {/* 右侧：状态 badge */}
            <span
              className={`badge ${t.enabled ? 'badge--success' : 'badge--neutral'}`}
            >
              <span className="badge__dot" />
              {t.enabled ? '启用' : '禁用'}
            </span>
          </article>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast--${toast.kind === 'success' ? 'success' : 'danger'}`}>
            <div className="toast__body">
              <p className="toast__title">{toast.text}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * 工具函数
 * ============================================================ */

/**
 * 从 list 结果构建 TargetRow 数组
 *
 * enabledTargets 只包含已启用的 target 名，要获取所有 target（含禁用的）
 * 需要从 resources 的 subscriptions[].targets[] 中汇总所有出现过的 target 名
 * 再和 enabledTargets 做交叉比对
 */
function buildTargetRows(result: ResourceListResult): TargetRow[] {
  const enabledSet = new Set(result.enabledTargets);

  /* 汇总所有 target 名（包括禁用的不会出现在 enabledTargets 中，
     但可能在用户期望中存在；这里从 enabledTargets 入手作为已知 target 列表） */
  const targetSubCounts = new Map<string, number>();

  /* 初始化所有已知 target */
  for (const name of result.enabledTargets) {
    targetSubCounts.set(name, 0);
  }

  /* 遍历资源的订阅统计每个 target 的订阅数 */
  for (const resource of result.resources) {
    for (const sub of resource.subscriptions) {
      for (const t of sub.targets) {
        const prev = targetSubCounts.get(t.target) ?? 0;
        targetSubCounts.set(t.target, prev + 1);
      }
    }
  }

  /* 构建行 */
  const rows: TargetRow[] = [];
  for (const [name, subCount] of targetSubCounts) {
    rows.push({
      name,
      enabled: enabledSet.has(name),
      subCount,
    });
  }

  /* 启用的排前面 */
  rows.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

/**
 * target 名美化显示
 */
function displayName(name: string): string {
  return DISPLAY_NAME[name] ?? name;
}

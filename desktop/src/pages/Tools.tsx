/**
 * 已连接工具页 · RFC-002 阶段 3 + FEAT-003 增强
 *
 * 展示 config.targets 列表，每个 target 显示：
 * - 名称 + 启用状态开关
 * - 该 target 上的订阅资源数
 * - 移除按钮（垃圾桶图标，hover 显示）
 *
 * FEAT-003 新增：
 * - 「添加工具」按钮 + AddToolModal
 * - 行尾垃圾桶按钮 + RemoveConfirmModal
 *
 * 启用/禁用操作走 `aitools target enable|disable`
 * 添加/移除操作走 `aitools target add|remove`
 */
import { useEffect, useState } from 'react';
import {
  Link2,
  Loader2,
  AlertCircle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  listResources,
  setTargetEnabled,
  addTarget,
  removeTarget,
  type ResourceListResult,
  CliError,
} from '../lib/cli';
import { AddToolModal, AVAILABLE_TOOLS } from '../components/AddToolModal';
import { RemoveConfirmModal } from '../components/RemoveConfirmModal';

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
  workbuddy: 'WorkBuddy',
  'claude-internal': 'Claude Internal',
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
  /** AddToolModal 是否打开 */
  const [showAddModal, setShowAddModal] = useState(false);
  /** 正在添加的工具名 */
  const [addingName, setAddingName] = useState<string | null>(null);
  /** RemoveConfirmModal 状态 */
  const [removeTarget_state, setRemoveTargetState] = useState<{
    open: boolean;
    name: string;
    displayName: string;
    loading: boolean;
  }>({ open: false, name: '', displayName: '', loading: false });

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

  /**
   * 添加工具（FEAT-003）
   */
  async function handleAdd(name: string) {
    setAddingName(name);
    const result = await addTarget(name);
    if (result.success) {
      setToast({ text: `${displayName(name)} 已添加`, kind: 'success' });
      setShowAddModal(false);
      await loadData();
    } else {
      setToast({ text: result.error || '添加失败', kind: 'error' });
    }
    setAddingName(null);
  }

  /**
   * 移除工具确认（FEAT-003）
   */
  async function handleRemoveConfirm() {
    setRemoveTargetState((prev) => ({ ...prev, loading: true }));
    const result = await removeTarget(removeTarget_state.name);
    if (result.success) {
      setToast({ text: `${removeTarget_state.displayName} 已移除`, kind: 'success' });
      setRemoveTargetState({ open: false, name: '', displayName: '', loading: false });
      await loadData();
    } else {
      setToast({ text: result.error || '移除失败', kind: 'error' });
      setRemoveTargetState((prev) => ({ ...prev, loading: false }));
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
      <div>
        <div className="empty-state">
          <Link2 className="empty-state__icon" size={64} aria-hidden="true" />
          <h3 className="empty-state__title">没有已配置的工具</h3>
          <p className="empty-state__desc">
            点击下方按钮添加你的 AI 工具。
          </p>
          <button
            type="button"
            className="btn btn--primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} style={{ marginRight: '4px' }} />
            添加工具
          </button>
        </div>

        {/* AddToolModal */}
        {showAddModal && (
          <AddToolModal
            existingNames={targets.map((t) => t.name)}
            onAdd={(name) => void handleAdd(name)}
            onClose={() => setShowAddModal(false)}
            addingName={addingName}
          />
        )}
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
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => setShowAddModal(true)}
            disabled={AVAILABLE_TOOLS.every((at) => targets.some((t) => t.name === at.name))}
          >
            <Plus size={14} style={{ marginRight: '4px' }} />
            添加工具
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="刷新"
            onClick={() => void loadData()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>
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

            {/* 移除按钮（hover 显示） */}
            <button
              type="button"
              className="btn btn--ghost btn--icon btn--sm"
              aria-label={`移除 ${displayName(t.name)}`}
              style={{
                opacity: 0,
                transition: 'opacity var(--duration-fast) var(--easing-standard), color var(--duration-fast)',
                color: 'var(--color-text-tertiary)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-danger-text)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '0';
                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-tertiary)';
              }}
              onClick={() => setRemoveTargetState({
                open: true,
                name: t.name,
                displayName: displayName(t.name),
                loading: false,
              })}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
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

      {/* AddToolModal */}
      {showAddModal && (
        <AddToolModal
          existingNames={targets.map((t) => t.name)}
          onAdd={(name) => void handleAdd(name)}
          onClose={() => setShowAddModal(false)}
          addingName={addingName}
        />
      )}

      {/* RemoveConfirmModal */}
      {removeTarget_state.open && (
        <RemoveConfirmModal
          toolDisplayName={removeTarget_state.displayName}
          onConfirm={() => void handleRemoveConfirm()}
          onCancel={() => setRemoveTargetState({ open: false, name: '', displayName: '', loading: false })}
          loading={removeTarget_state.loading}
        />
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
 * FEAT-003 修复：使用 allTargets（含禁用的）构建完整列表，
 * 而非仅依赖 enabledTargets。
 */
function buildTargetRows(result: ResourceListResult): TargetRow[] {
  const enabledSet = new Set(result.enabledTargets);

  /* 从 allTargets 初始化所有 target（含禁用的） */
  const targetSubCounts = new Map<string, number>();
  if (result.allTargets && result.allTargets.length > 0) {
    for (const t of result.allTargets) {
      targetSubCounts.set(t.name, 0);
    }
  } else {
    /* 降级：如果 CLI 版本不支持 allTargets，仍用 enabledTargets */
    for (const name of result.enabledTargets) {
      targetSubCounts.set(name, 0);
    }
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

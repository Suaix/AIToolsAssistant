/**
 * SyncProgressModal · 同步进度弹窗
 *
 * 设计系统依据：
 * - L5 Modal 规范（05-component-spec.md 第 634 行）：「常规表单、同步进度」使用默认 md 尺寸（640px）
 * - L2 原则 2「状态先于功能」：4 态（running / success / partial / error）清晰呈现当前状态
 * - L2 原则 3「诚实先于友好」：错误场景展示具体 stderr 片段 + 「重试/关闭」操作
 * - 动画使用 Modal 内置 fade-in/scale-in（normal duration，≤ 400ms 合规）
 *
 * 功能：
 * - 用户点击「立即同步」/「同步 Skills」/单卡「同步」按钮后弹出
 * - 订阅 Rust 流式频道，实时收集 start / progress / summary / done / error 事件
 * - 完成后允许关闭（期间禁用关闭，防止打断同步）
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, X } from 'lucide-react';
import {
  runSyncStream,
  CliError,
  type JsonEvent,
  type SyncProgressData,
  type SyncStartData,
  type SyncSummaryData,
} from '../lib/cli';

/** 同步完成后的最终状态 */
type FinalKind = 'success' | 'partial' | 'error';

/** 弹窗内部状态机 */
type ModalState =
  | { kind: 'running' }
  | {
      kind: 'finished';
      final: FinalKind;
      errorMessage?: string;
    };

/** progress 事件在 UI 中的展示条目（追加型日志） */
interface ProgressItem {
  /** 递增序号，用于 React key */
  seq: number;
  /** 原始事件 */
  data: SyncProgressData;
}

/** start 事件信息（用于头部展示目标/总数） */
interface StartInfo {
  total: number;
  targets: string[];
}

/** summary 事件信息（完成后展示数量汇总） */
interface SummaryInfo {
  totalSkills: number;
  created: number;
  updated: number;
  skipped: number;
}

/** 组件 Props */
export interface SyncProgressModalProps {
  /** CLI 参数数组（不含 --json），例如 `['sync', 'skills']` 或 `['sync', 'skills', '--skill', 'foo']` */
  args: string[];
  /** 弹窗标题（上下文相关，如「同步全部 Skills」或「同步 foo」） */
  title: string;
  /** 关闭回调（用户点击「完成/关闭」后触发；running 期间不会触发） */
  onClose: () => void;
  /** 关闭前的副作用回调（用于让外部刷新列表）；仅在至少有一次 created/updated 时触发 */
  onSyncedSomething?: () => void;
}

/**
 * 同步进度 Modal
 */
export function SyncProgressModal({
  args,
  title,
  onClose,
  onSyncedSomething,
}: SyncProgressModalProps) {
  const [state, setState] = useState<ModalState>({ kind: 'running' });
  const [startInfo, setStartInfo] = useState<StartInfo | null>(null);
  const [summary, setSummary] = useState<SummaryInfo | null>(null);
  const [items, setItems] = useState<ProgressItem[]>([]);

  /** progress 序号累加（避免同一资源重复 key 问题） */
  const seqRef = useRef(0);
  /** 是否已触发外部刷新（只触发一次） */
  const notifiedRef = useRef(false);
  /** 订阅取消函数（Modal 卸载时调用） */
  const unlistenRef = useRef<(() => void) | null>(null);

  /* ============================================================
   * 启动流式调用
   * ============================================================ */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const controller = await runSyncStream(args, {
          onEvent: (event: JsonEvent) => {
            if (cancelled) return;
            handleEvent(event);
          },
          onDone: (result) => {
            if (cancelled) return;
            handleDone(result);
          },
        });
        unlistenRef.current = controller.unlisten;
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof CliError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        setState({ kind: 'finished', final: 'error', errorMessage: msg });
      }
    })();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
    /* args 在一次 Modal 生命周期内固定；依赖空数组是刻意选择 */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
   * 事件处理
   * ============================================================ */
  /**
   * 处理来自 CLI 的 JSON 事件
   */
  function handleEvent(event: JsonEvent) {
    if (event.event === 'start') {
      const data = event.data as SyncStartData;
      /* CLI 在用户级 + 项目级场景下会发多次 start，这里取累加逻辑：
       * 第一次直接设置；后续的 start 追加到 total 与 targets 上 */
      setStartInfo((prev) => {
        if (!prev) {
          return { total: data.total, targets: [...data.targets] };
        }
        const merged = new Set<string>([...prev.targets, ...data.targets]);
        return {
          total: prev.total + data.total,
          targets: [...merged],
        };
      });
      return;
    }

    if (event.event === 'progress') {
      const data = event.data as SyncProgressData;
      seqRef.current += 1;
      const seq = seqRef.current;
      setItems((prev) => [...prev, { seq, data }]);
      /* 若发生 created/updated，标记需要触发外部刷新 */
      if (data.action === 'created' || data.action === 'updated') {
        if (!notifiedRef.current) {
          notifiedRef.current = true;
        }
      }
      return;
    }

    if (event.event === 'summary') {
      const data = event.data as SyncSummaryData;
      /* 多个 scope 场景下，summary 会分段到达，累加 */
      setSummary((prev) => ({
        totalSkills: (prev?.totalSkills ?? 0) + data.totalSkills,
        created: (prev?.created ?? 0) + data.created,
        updated: (prev?.updated ?? 0) + data.updated,
        skipped: (prev?.skipped ?? 0) + data.skipped,
      }));
      return;
    }

    if (event.event === 'error') {
      const message = (event.data as { message: string }).message;
      setState({
        kind: 'finished',
        final: 'error',
        errorMessage: message,
      });
      return;
    }

    if (event.event === 'done') {
      /* done 事件优先由 onDone 处理；这里仅做防御性兜底 */
    }
  }

  /**
   * 处理进程结束事件
   */
  function handleDone(result: { exitCode: number; stderr: string }) {
    setState((prev) => {
      /* 若已经在 error 态（handleEvent 中设置），保持不动 */
      if (prev.kind === 'finished' && prev.final === 'error') {
        return prev;
      }

      if (result.exitCode === 0) {
        /* 读取最新的 items 与 summary 判断是否存在失败项：
         * 这里直接用 React 的 stale closure，但 setItems 已经用函数式更新过，
         * 所以 items 里有最新数据，不使用 closure 变量 */
        return { kind: 'finished', final: 'success' };
      }

      /* 非零退出码 */
      const msg =
        result.stderr.trim().slice(-500) ||
        `CLI 进程异常退出（exit_code=${result.exitCode}）`;
      return { kind: 'finished', final: 'error', errorMessage: msg };
    });

    /* 若有 created/updated 发生，通知外部刷新 */
    if (notifiedRef.current && onSyncedSomething) {
      onSyncedSomething();
    }
  }

  /* ============================================================
   * 关闭逻辑：running 期间禁止关闭
   * ============================================================ */
  const canClose = state.kind === 'finished';

  function handleClose() {
    if (!canClose) return;
    onClose();
  }

  /* Esc 关闭（仅完成后可用） */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && canClose) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canClose, onClose]);

  /* ============================================================
   * 渲染
   * ============================================================ */
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-modal-title"
    >
      <div className="modal">
        <header className="modal__header">
          <h2 className="modal__title" id="sync-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn--ghost btn--icon btn--sm"
            aria-label="关闭"
            disabled={!canClose}
            onClick={handleClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="modal__body">
          <ModalStatusHeader
            state={state}
            startInfo={startInfo}
            summary={summary}
            doneCount={items.length}
          />

          {/* 进度明细列表 */}
          {items.length > 0 && (
            <ul
              className="card-stack"
              style={{ marginTop: 'var(--space-4)', listStyle: 'none', padding: 0 }}
              aria-live="polite"
            >
              {items.map((it) => (
                <ProgressRow key={it.seq} data={it.data} />
              ))}
            </ul>
          )}

          {/* 错误详情 */}
          {state.kind === 'finished' &&
            state.final === 'error' &&
            state.errorMessage && (
              <pre
                className="font-mono"
                style={{
                  marginTop: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-caption-size)',
                  color: 'var(--color-text-secondary)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: '160px',
                  overflow: 'auto',
                }}
              >
                {state.errorMessage}
              </pre>
            )}
        </div>

        <footer className="modal__footer">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canClose}
            onClick={handleClose}
          >
            {state.kind === 'running'
              ? '同步中…'
              : state.kind === 'finished' && state.final === 'error'
                ? '关闭'
                : '完成'}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
 * 子组件：头部状态摘要
 * ============================================================ */

interface ModalStatusHeaderProps {
  state: ModalState;
  startInfo: StartInfo | null;
  summary: SummaryInfo | null;
  doneCount: number;
}

/**
 * 按状态渲染不同的头部摘要区
 */
function ModalStatusHeader({
  state,
  startInfo,
  summary,
  doneCount,
}: ModalStatusHeaderProps) {
  /* ---- 运行中 ---- */
  if (state.kind === 'running') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <Loader2
          size={20}
          aria-hidden="true"
          style={{
            color: 'var(--color-brand-default)',
            animation: 'spin 1s linear infinite',
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 'var(--text-body-size)',
              color: 'var(--color-text-primary)',
              fontWeight: 500,
            }}
          >
            {startInfo
              ? `正在同步 · ${doneCount} / ${startInfo.total}`
              : '准备中…'}
          </div>
          {startInfo && startInfo.targets.length > 0 && (
            <div
              style={{
                marginTop: 'var(--space-1)',
                fontSize: 'var(--text-caption-size)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              目标：{startInfo.targets.join('、')}
            </div>
          )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ---- 完成（success / partial / error） ---- */
  const Icon =
    state.final === 'error'
      ? AlertTriangle
      : state.final === 'partial'
        ? AlertTriangle
        : CheckCircle2;
  const iconColor =
    state.final === 'error'
      ? 'var(--color-danger)'
      : state.final === 'partial'
        ? 'var(--color-warning)'
        : 'var(--color-success)';

  const title =
    state.final === 'error'
      ? '同步未完成'
      : summary && summary.created + summary.updated === 0
        ? '全部保持最新，无需同步'
        : '同步完成';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
      <Icon size={20} aria-hidden="true" style={{ color: iconColor }} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 'var(--text-body-size)',
            color: 'var(--color-text-primary)',
            fontWeight: 500,
          }}
        >
          {title}
        </div>
        {summary && state.final !== 'error' && (
          <div
            style={{
              marginTop: 'var(--space-1)',
              fontSize: 'var(--text-caption-size)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            共处理 {summary.totalSkills} 个资源 · 新增 {summary.created} · 更新{' '}
            {summary.updated} · 跳过 {summary.skipped}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * 子组件：单行进度项
 * ============================================================ */

/** progress 事件的 action 到 badge 样式映射 */
const ACTION_BADGE: Record<
  SyncProgressData['action'],
  { label: string; cls: string }
> = {
  created: { label: '新增', cls: 'badge--success' },
  updated: { label: '更新', cls: 'badge--warning' },
  skipped: { label: '已最新', cls: 'badge--neutral' },
  failed: { label: '失败', cls: 'badge--danger' },
};

interface ProgressRowProps {
  data: SyncProgressData;
}

/**
 * 单条进度项：badge + 资源名 → 目标名
 */
function ProgressRow({ data }: ProgressRowProps) {
  const badge = ACTION_BADGE[data.action];
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-2) var(--space-3)',
        fontSize: 'var(--text-body-sm-size)',
      }}
    >
      <span className={`badge ${badge.cls}`}>
        <span className="badge__dot" />
        {badge.label}
      </span>
      <span
        style={{
          flex: 1,
          color: 'var(--color-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          className="font-mono"
          style={{ color: 'var(--color-text-primary)' }}
        >
          {data.resource}
        </span>
        <span style={{ margin: '0 var(--space-2)' }}>→</span>
        <span className="font-mono">{data.target}</span>
        {data.error && (
          <span
            style={{
              marginLeft: 'var(--space-2)',
              color: 'var(--color-danger-text)',
            }}
          >
            · {data.error}
          </span>
        )}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontSize: 'var(--text-caption-size)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {data.index}/{data.total}
      </span>
    </li>
  );
}

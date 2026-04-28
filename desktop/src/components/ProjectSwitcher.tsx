/**
 * ProjectSwitcher · 项目切换器
 *
 * RFC-002 §3.2 / §4.2：嵌入顶栏的下拉选择器
 * - 显示当前选中的项目目录名
 * - 下拉列出最近打开的项目
 * - 「打开其他目录…」按钮调用 Tauri 文件对话框
 * - 若无 .aitools/project.yaml 则显示「未初始化」提示
 *
 * 设计系统：不自写 CSS，用 Token + 内联 style
 * L2「明确先于惊喜」：切换项目是显式操作，不自动检测
 */
import { useState, useRef, useEffect } from 'react';
import { FolderOpen, ChevronDown, Plus } from 'lucide-react';
import { getProjectDisplayName } from '../lib/gui-state';

/**
 * 组件 Props
 */
export interface ProjectSwitcherProps {
  /** 当前项目路径（null = 未选择） */
  currentProject: string | null;
  /** 最近打开的项目列表 */
  recentProjects: string[];
  /** 当前项目是否有 project.yaml */
  hasProjectConfig: boolean;
  /** 选择项目回调 */
  onSelect: (projectDir: string) => void;
  /** 打开目录选择器回调 */
  onOpenDirectory: () => void;
}

/**
 * 项目切换器
 */
export function ProjectSwitcher({
  currentProject,
  recentProjects,
  hasProjectConfig,
  onSelect,
  onOpenDirectory,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* 点击外部关闭 */
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  /* Esc 关闭 */
  useEffect(() => {
    if (!open) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [open]);

  /** 显示文案 */
  const displayText = currentProject
    ? getProjectDisplayName(currentProject)
    : '未选择项目';

  /** 初始化状态标注 */
  const statusHint = currentProject && !hasProjectConfig ? '（未初始化）' : '';

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* 触发按钮 */}
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setOpen(!open)}
        style={{
          gap: 'var(--space-2)',
          maxWidth: 280,
          overflow: 'hidden',
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <FolderOpen size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayText}
          {statusHint && (
            <span
              style={{
                fontSize: 'var(--text-caption-size)',
                color: 'var(--color-text-tertiary)',
                marginLeft: 'var(--space-1)',
              }}
            >
              {statusHint}
            </span>
          )}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            transition: 'transform var(--duration-fast)',
            transform: open ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>

      {/* 下拉面板 */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 'var(--space-1)',
            minWidth: 280,
            maxWidth: 400,
            background: 'var(--color-bg-default)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {/* 最近项目列表 */}
          {recentProjects.length > 0 && (
            <div style={{ padding: 'var(--space-2) 0' }}>
              <div
                style={{
                  padding: 'var(--space-1) var(--space-3)',
                  fontSize: 'var(--text-caption-size)',
                  color: 'var(--color-text-tertiary)',
                  fontWeight: 500,
                }}
              >
                最近项目
              </div>
              {recentProjects.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="option"
                  aria-selected={p === currentProject}
                  onClick={() => {
                    onSelect(p);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    width: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    background:
                      p === currentProject
                        ? 'var(--color-bg-selected)'
                        : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 'var(--text-body-sm-size)',
                    color: 'var(--color-text-primary)',
                    textAlign: 'left',
                  }}
                >
                  <FolderOpen
                    size={14}
                    style={{ flexShrink: 0, color: 'var(--color-text-tertiary)' }}
                  />
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}
                    title={p}
                  >
                    {getProjectDisplayName(p)}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      flexShrink: 0,
                    }}
                  >
                    {shortenPath(p)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 分隔线 */}
          {recentProjects.length > 0 && (
            <div
              style={{
                height: 1,
                background: 'var(--color-border-default)',
              }}
            />
          )}

          {/* 打开其他目录 */}
          <div style={{ padding: 'var(--space-2)' }}>
            <button
              type="button"
              onClick={() => {
                onOpenDirectory();
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--text-body-sm-size)',
                color: 'var(--color-brand-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Plus size={14} aria-hidden="true" />
              打开其他目录…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 缩短路径显示（仅显示最后 2 段）
 */
function shortenPath(fullPath: string): string {
  const parts = fullPath.replace(/\/+$/, '').split('/');
  if (parts.length <= 3) return fullPath;
  return '…/' + parts.slice(-2).join('/');
}

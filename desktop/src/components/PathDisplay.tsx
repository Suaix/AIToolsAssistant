/**
 * PathDisplay 路径展示行
 *
 * FEAT-002：源目录路径展示组件。
 * 只读展示 + 更改按钮。
 *
 * 遵循 L5 组件规范 · CSS 类：.path-display
 */
import { FolderOpen } from 'lucide-react';

/**
 * PathDisplay 组件属性
 */
interface PathDisplayProps {
  /** 当前路径 */
  path: string;
  /** 是否加载中 */
  loading?: boolean;
  /** 是否禁用（CLI 不可用时） */
  disabled?: boolean;
  /** 点击更改按钮的回调 */
  onChangeClick: () => void;
}

/**
 * 路径展示行组件
 */
export function PathDisplay({
  path: displayPath,
  loading = false,
  disabled = false,
  onChangeClick,
}: PathDisplayProps) {
  return (
    <div className="path-display">
      <FolderOpen className="path-display__icon" />
      <span className={`path-display__path${disabled ? ' path-display__path--disabled' : ''}`}>
        {loading ? '加载中…' : displayPath}
      </span>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={onChangeClick}
        disabled={disabled || loading}
      >
        更改
      </button>
    </div>
  );
}

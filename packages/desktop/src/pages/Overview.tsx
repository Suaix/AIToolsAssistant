/**
 * Overview 概览页面 · FEAT-001
 *
 * 替代原 Dashboard（HeroCard 5 态），改为数据概览面板。
 * 上区：Skills / Commands / Agents / Rules — 2×2 九宫格
 * 下区：已连接工具 / 项目 — 左右两列
 *
 * 遵循 L2 原则：
 * - 「状态先于功能」：CLI 异常时顶部 Banner 提示
 * - 「诚实先于友好」：未实现功能显示 0 + disabled 样式
 */
import {
  Package,
  Zap,
  Bot,
  FileText,
  Link2,
  FolderOpen,
} from 'lucide-react';
import { OverviewCard } from '../components/OverviewCard';
import { StatusBanner } from '../components/StatusBanner';
import type { RouteName } from '../lib/routes';

/* ============================================================
 * 类型定义
 * ============================================================ */

/** 概览页面的聚合数据 */
export interface OverviewData {
  /** 页面加载状态 */
  status: 'loading' | 'cli_missing' | 'error' | 'ready';
  /** 错误信息（status='error' 时有值） */
  errorMessage?: string;

  /** Skills 数据 */
  skills: {
    subscribedCount: number;
    candidateCount: number;
    driftCount: number;
  };

  /** 已连接工具数据 */
  tools: {
    enabledCount: number;
    totalCount: number;
    enabledNames: string[];
  };

  /** 项目数据（来自 GuiState） */
  project: {
    currentName: string | null;
    recentCount: number;
  };
}

/** Overview 组件属性 */
interface OverviewProps {
  /** 聚合数据 */
  data: OverviewData;
  /** 路由跳转 */
  onNavigate: (route: RouteName) => void;
  /** 重试加载 */
  onRetry: () => void;
}

/* ============================================================
 * Overview 主组件
 * ============================================================ */

/**
 * 概览页面主组件
 */
export function Overview({ data, onNavigate, onRetry }: OverviewProps) {
  /** 是否正在加载 */
  const isLoading = data.status === 'loading';

  return (
    <div>
      {/* CLI 异常 Banner */}
      {data.status === 'cli_missing' && (
        <StatusBanner
          variant="warning"
          message={
            <>
              未检测到 aitools CLI，请执行{' '}
              <code>npm i -g aitools-cli</code> 安装
            </>
          }
          actionLabel="重新检查"
          onAction={onRetry}
        />
      )}
      {data.status === 'error' && (
        <StatusBanner
          variant="error"
          message={data.errorMessage || '无法获取同步状态'}
          actionLabel="重试"
          onAction={onRetry}
        />
      )}

      {/* ===== 上区：资源概览 2×2 ===== */}
      <div className="overview-section-label">资源概览</div>
      <div className="overview-grid">
        {/* Skills（活跃） */}
        <OverviewCard
          icon={Package}
          title="Skills"
          metric={isLoading ? undefined : data.skills.subscribedCount}
          label="已订阅"
          loading={isLoading}
          onClick={() => onNavigate('skills')}
          sub={
            !isLoading && (
              <>
                <span>{data.skills.candidateCount} 候选</span>
                {data.skills.driftCount > 0 && (
                  <>
                    <span className="overview-card__dot" />
                    <span className="overview-card__warning">
                      {data.skills.driftCount} 待同步
                    </span>
                  </>
                )}
              </>
            )
          }
        />

        {/* Commands（占位） */}
        <OverviewCard
          icon={Zap}
          title="Commands"
          metric={0}
          label={'\u00A0'}
          disabled
          sub={<span className="overview-card__coming-soon">即将推出</span>}
        />

        {/* Agents（占位） */}
        <OverviewCard
          icon={Bot}
          title="Agents"
          metric={0}
          label={'\u00A0'}
          disabled
          sub={<span className="overview-card__coming-soon">即将推出</span>}
        />

        {/* Rules（占位） */}
        <OverviewCard
          icon={FileText}
          title="Rules"
          metric={0}
          label={'\u00A0'}
          disabled
          sub={<span className="overview-card__coming-soon">即将推出</span>}
        />
      </div>

      {/* ===== 分隔 ===== */}
      <div className="overview-divider" />

      {/* ===== 下区：环境与连接 1×2 ===== */}
      <div className="overview-section-label">环境与连接</div>
      <div className="overview-grid">
        {/* 已连接工具（活跃） */}
        <OverviewCard
          icon={Link2}
          title="已连接工具"
          metric={
            isLoading ? undefined : (
              <>
                {data.tools.enabledCount}
                <span className="overview-card__metric-secondary">
                  {' '}/ {data.tools.totalCount}
                </span>
              </>
            )
          }
          label="已启用"
          loading={isLoading}
          onClick={() => onNavigate('tools')}
          sub={
            !isLoading && data.tools.enabledNames.length > 0 && (
              <span>{data.tools.enabledNames.join(' · ')}</span>
            )
          }
        />

        {/* 项目（占位） */}
        <OverviewCard
          icon={FolderOpen}
          title="项目"
          metric={data.project.currentName ? 1 : 0}
          label={data.project.currentName || '未选择项目'}
          disabled
          sub={
            data.project.recentCount > 0 ? (
              <span>{data.project.recentCount} 个最近项目</span>
            ) : (
              <span className="overview-card__coming-soon">即将推出</span>
            )
          }
        />
      </div>
    </div>
  );
}

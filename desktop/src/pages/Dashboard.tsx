/**
 * Dashboard 工作台页面 · MVP-01 骨架版
 *
 * 当前阶段说明：
 * - 仅展示 HeroCard 空壳（数据来自 hardcoded placeholder）
 * - 阶段 3 MVP-02 才对接 CLI 拿真实数据
 *
 * 翻译自 docs/design-system/06-gui-prototype/pages/dashboard.html
 */
import { CheckCircle2 } from 'lucide-react';

/**
 * 工作台主页面
 */
export function Dashboard() {
  return (
    <div>
      {/* HeroCard：全局状态（当前为静态占位） */}
      <section className="hero-card hero-card--success" aria-live="polite">
        <div className="hero-card__bar" />
        <div className="hero-card__content">
          <div className="hero-card__main">
            <CheckCircle2 className="hero-card__icon" />
            <h2 className="hero-card__title">桌面 App 骨架就绪</h2>
          </div>
          <p className="hero-card__sub">
            这是 MVP-01 阶段的空壳占位 · 下一阶段将对接真实 CLI 数据
          </p>
        </div>
      </section>

      {/* 占位说明区 */}
      <section className="page-section">
        <div className="page-section__header">
          <h2 className="page-section__title">开发进度</h2>
        </div>
        <div className="card-stack">
          <article className="card">
            <h3 className="card__title">✅ 阶段 1 · CLI 改造</h3>
            <p className="card__desc">
              已完成：新增 --json 输出模式，支持 NDJSON 流式事件，为 GUI 接入提供稳定数据契约。
            </p>
          </article>
          <article className="card">
            <h3 className="card__title">🔨 阶段 2 · 桌面骨架（当前）</h3>
            <p className="card__desc">
              已完成：Tauri + React + TypeScript 工程初始化；Sidebar 组件；主题切换；5 个页面路由。
            </p>
          </article>
          <article className="card">
            <h3 className="card__title">⏳ 阶段 3 · 对接 CLI 只读</h3>
            <p className="card__desc">
              待开发：Rust 后端通过 Tauri Command 调用 aitools --json list，React UI 渲染真实 Skills 列表。
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}

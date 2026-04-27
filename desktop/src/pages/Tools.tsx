/**
 * 已连接工具页 · MVP-01 空壳
 */
import { Link2 } from 'lucide-react';

export function Tools() {
  return (
    <div className="empty-state">
      <Link2 className="empty-state__icon" size={64} aria-hidden="true" />
      <h3 className="empty-state__title">已连接工具</h3>
      <p className="empty-state__desc">
        阶段 3 将从配置文件读取已连接的 AI 工具并展示连接状态。
      </p>
    </div>
  );
}

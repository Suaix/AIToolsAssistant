/**
 * Skills 列表页 · MVP-01 空壳
 * 阶段 3 对接 CLI 后填充真实数据
 */
import { Package } from 'lucide-react';

export function Skills() {
  return (
    <div className="empty-state">
      <Package className="empty-state__icon" size={64} aria-hidden="true" />
      <h3 className="empty-state__title">Skills 列表</h3>
      <p className="empty-state__desc">
        阶段 3 将对接 aitools --json list skills 展示真实数据。
      </p>
    </div>
  );
}

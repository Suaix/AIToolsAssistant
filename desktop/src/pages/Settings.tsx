/**
 * 设置页 · MVP-01 空壳
 */
import { Settings as SettingsIcon } from 'lucide-react';

export function Settings() {
  return (
    <div className="empty-state">
      <SettingsIcon className="empty-state__icon" size={64} aria-hidden="true" />
      <h3 className="empty-state__title">设置</h3>
      <p className="empty-state__desc">
        未来将支持源目录管理、同步策略、主题偏好等配置项。
      </p>
    </div>
  );
}

/**
 * SettingsSection 设置区块容器
 *
 * FEAT-002：设置页分区布局的通用容器。
 * 遵循 L5 组件规范 · CSS 类：.settings-section
 */

/**
 * SettingsSection 组件属性
 */
interface SettingsSectionProps {
  /** 区块标题 */
  title: string;
  /** 区块描述 */
  description?: string;
  /** 子内容 */
  children: React.ReactNode;
}

/**
 * 设置区块容器组件
 */
export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <h3 className="settings-section__title">{title}</h3>
      {description && <p className="settings-section__desc">{description}</p>}
      <div className="settings-section__content">{children}</div>
    </section>
  );
}

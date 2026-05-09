/**
 * Settings 设置页 · FEAT-002
 *
 * 三个配置模块：
 * 1. 源目录管理：展示路径 + 更改（文件夹选择器 + 迁移弹窗）
 * 2. 主题偏好：暗色 / 浅色 / 系统 三选一
 * 3. 关于：CLI 版本 + GUI 版本
 *
 * 遵循 L2 原则「诚实先于友好」「明确先于惊喜」
 */
import { useEffect, useState, useCallback } from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { PathDisplay } from '../components/PathDisplay';
import { ThemeSelector } from '../components/ThemeSelector';
import { MigrateModal } from '../components/MigrateModal';
import {
  getConfigValue,
  setConfigRoot,
  getCliVersion,
  checkCliAvailable,
} from '../lib/cli';
import { applyTheme, getStoredTheme, type ThemeMode } from '../lib/theme';

/** GUI 版本号（构建时注入，开发模式降级为 package.json version） */
const GUI_VERSION = '1.0.0';

/**
 * 设置页主组件
 */
export function Settings() {
  /* ---- 状态 ---- */

  /** 当前根目录路径 */
  const [rootPath, setRootPath] = useState<string | null>(null);
  /** 路径加载中 */
  const [rootLoading, setRootLoading] = useState(true);
  /** CLI 是否可用 */
  const [cliAvailable, setCliAvailable] = useState(true);
  /** CLI 版本号 */
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  /** 当前主题 */
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  /** 迁移弹窗状态 */
  const [migrateModal, setMigrateModal] = useState<{
    open: boolean;
    newPath: string;
    loading: boolean;
    loadingText?: string;
    error?: string;
  }>({ open: false, newPath: '', loading: false });

  /* ---- 初始化加载 ---- */

  /** 加载设置数据 */
  const loadSettings = useCallback(async () => {
    setRootLoading(true);

    /* CLI 可用性检查 */
    try {
      const available = await checkCliAvailable();
      setCliAvailable(available);
      if (!available) {
        setRootLoading(false);
        return;
      }
    } catch {
      setCliAvailable(false);
      setRootLoading(false);
      return;
    }

    /* 并行加载 config root 和 CLI 版本 */
    const [root, version] = await Promise.all([
      getConfigValue('root'),
      getCliVersion(),
    ]);

    setRootPath(root);
    setCliVersion(version);
    setRootLoading(false);
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  /* ---- 主题切换 ---- */

  /** 处理主题切换 */
  function handleThemeChange(mode: ThemeMode) {
    applyTheme(mode);
    setTheme(mode);
  }

  /* ---- 源目录更改 ---- */

  /** 打开文件夹选择器 */
  async function handleChangeRoot() {
    let selectedPath: string | null = null;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      selectedPath = await invoke<string | null>('open_directory_dialog');
    } catch {
      /* Tauri 不可用，降级为 prompt */
      selectedPath = window.prompt('输入新的根目录路径：');
    }

    if (!selectedPath) return;

    /* 打开迁移确认弹窗 */
    setMigrateModal({
      open: true,
      newPath: selectedPath,
      loading: false,
      error: undefined,
    });
  }

  /** 执行迁移 */
  async function handleMigrate() {
    setMigrateModal((prev) => ({
      ...prev,
      loading: true,
      loadingText: '正在迁移资源…',
      error: undefined,
    }));

    const result = await setConfigRoot(migrateModal.newPath, true);

    if (result.success) {
      setRootPath(migrateModal.newPath);
      setMigrateModal({ open: false, newPath: '', loading: false });
      /* 此处可补充 Toast 成功提示 */
    } else {
      setMigrateModal((prev) => ({
        ...prev,
        loading: false,
        error: result.error || '迁移失败',
      }));
    }
  }

  /** 创建空目录 */
  async function handleCreateEmpty() {
    setMigrateModal((prev) => ({
      ...prev,
      loading: true,
      loadingText: '正在创建目录…',
      error: undefined,
    }));

    const result = await setConfigRoot(migrateModal.newPath, false);

    if (result.success) {
      setRootPath(migrateModal.newPath);
      setMigrateModal({ open: false, newPath: '', loading: false });
    } else {
      setMigrateModal((prev) => ({
        ...prev,
        loading: false,
        error: result.error || '创建失败',
      }));
    }
  }

  /** 关闭弹窗 */
  function handleCancelMigrate() {
    if (migrateModal.loading) return;
    setMigrateModal({ open: false, newPath: '', loading: false });
  }

  /* ---- 渲染 ---- */

  return (
    <div>
      {/* 源目录管理 */}
      <SettingsSection
        title="源目录管理"
        description="aitools 资源的根目录路径，所有 skills、commands 等资源存储在此目录下"
      >
        <PathDisplay
          path={rootPath || '未配置'}
          loading={rootLoading}
          disabled={!cliAvailable}
          onChangeClick={() => void handleChangeRoot()}
        />
        {!cliAvailable && !rootLoading && (
          <p style={{
            fontSize: 'var(--text-caption-size)',
            color: 'var(--color-warning-text)',
            marginTop: 'var(--space-2)',
          }}>
            需安装 aitools CLI 后才能更改
          </p>
        )}
      </SettingsSection>

      {/* 主题偏好 */}
      <SettingsSection
        title="主题偏好"
        description="选择界面主题，更改后立即生效"
      >
        <ThemeSelector current={theme} onChange={handleThemeChange} />
      </SettingsSection>

      {/* 关于 */}
      <SettingsSection title="关于">
        <div className="version-row">
          <span className="version-row__label">CLI 版本</span>
          <span className={`version-row__value${!cliVersion ? ' version-row__value--disabled' : ''}`}>
            {cliVersion || '未安装'}
          </span>
        </div>
        <div className="version-row">
          <span className="version-row__label">GUI 版本</span>
          <span className="version-row__value">{GUI_VERSION}</span>
        </div>
      </SettingsSection>

      {/* 迁移确认弹窗 */}
      {migrateModal.open && (
        <MigrateModal
          newPath={migrateModal.newPath}
          onMigrate={() => void handleMigrate()}
          onCreateEmpty={() => void handleCreateEmpty()}
          onCancel={handleCancelMigrate}
          loading={migrateModal.loading}
          loadingText={migrateModal.loadingText}
          error={migrateModal.error}
        />
      )}
    </div>
  );
}

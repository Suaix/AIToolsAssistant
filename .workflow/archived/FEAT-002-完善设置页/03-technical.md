# 技术方案：完善设置页

> **任务编号**：FEAT-002
> **创建日期**：2026-04-29
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：已确认

---

## 1. 概述

### 1.1 技术目标

1. **CLI 侧**：新增 `aitools config` 命令族（get/set 隐式模式 + `--migrate` flag）
2. **GUI 侧**：重写 `Settings.tsx`，实现三个配置模块 + 迁移确认弹窗

### 1.2 技术约束

- CLI 使用 commander 嵌套子命令模式（类似 target 命令族）
- GUI 通过 `invokeCli` 调用 config 命令，不直接读写 YAML
- 主题持久化复用现有 `lib/theme.ts`（localStorage）
- 版本号：CLI 通过 `aitools --version`，GUI 从构建注入

---

## 2. 架构设计

### 2.1 CLI 侧：config 命令

```
aitools config <key> [value] [--migrate]

无 value → get（查询并输出）
有 value → set（修改并落盘）
--migrate → 仅 root key 生效：移动旧目录资源到新目录
```

**JSON 模式输出**：
```json
{"event":"config.get","data":{"key":"root","value":"~/.aitools"}}
{"event":"config.set","data":{"key":"root","oldValue":"~/.aitools","newValue":"~/new-aitools","migrated":false}}
{"event":"done","data":{"exitCode":0}}
```

### 2.2 GUI 侧：数据流

```
Settings.tsx
  ├── 加载时：invokeCli(['config', 'root']) → 获取当前根目录
  ├── 加载时：invokeCli(['--version']) → 获取 CLI 版本
  ├── 更改目录：open_directory_dialog → MigrateModal
  │     ├── 迁移：invokeCli(['config', 'root', newPath, '--migrate'])
  │     └── 新建：invokeCli(['config', 'root', newPath])
  └── 主题切换：applyTheme() → 立即生效 + localStorage
```

### 2.3 目录结构变更

```
src/commands/
└── config.ts              ← 新增：config 命令处理

desktop/src/
├── pages/
│   └── Settings.tsx       ← 重写（17行 → ~200行）
├── components/
│   ├── SettingsSection.tsx ← 新增：设置区块容器
│   ├── ThemeSelector.tsx   ← 新增：三选一主题切换
│   ├── PathDisplay.tsx     ← 新增：路径展示行
│   └── MigrateModal.tsx    ← 新增：迁移确认弹窗
├── lib/
│   └── cli.ts             ← 修改：新增 getConfigValue / setConfigValue 函数
└── styles/
    └── components.css     ← 修改：新增 settings/theme-selector/path-display 样式
```

---

## 3. 接口定义

### 3.1 CLI 命令签名

```typescript
// src/commands/config.ts

/**
 * aitools config <key> [value] [--migrate]
 *
 * 支持的 key：
 * - root：aitools 根目录路径（对应 config.yaml 的 source 字段）
 * - version：只读，输出 CLI 版本号
 *
 * --migrate：仅 root key 有效，将旧目录资源移动到新目录
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  options: { migrate?: boolean },
): Promise<void>
```

### 3.2 CLI JSON 事件

```typescript
// 新增事件类型
| { event: 'config.get'; data: { key: string; value: string } }
| { event: 'config.set'; data: { key: string; oldValue: string; newValue: string; migrated: boolean } }
```

### 3.3 GUI - CLI 桥接函数

```typescript
// desktop/src/lib/cli.ts 新增

/** 获取配置项值 */
export async function getConfigValue(key: string): Promise<string | null>

/** 设置配置项值 */
export async function setConfigRoot(newPath: string, migrate?: boolean): Promise<{ success: boolean; error?: string }>

/** 获取 CLI 版本号 */
export async function getCliVersion(): Promise<string | null>
```

### 3.4 GUI 组件接口

```typescript
// SettingsSection
interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

// ThemeSelector
interface ThemeSelectorProps {
  current: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}

// PathDisplay
interface PathDisplayProps {
  path: string;
  loading?: boolean;
  disabled?: boolean;
  onChangeClick: () => void;
}

// MigrateModal
interface MigrateModalProps {
  newPath: string;
  onMigrate: () => void;
  onCreateEmpty: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}
```

---

## 4. 数据模型

### config.yaml 中的 source 字段

```yaml
# 现有结构不变，source 字段即为"根目录"
source: "~/.aitools"
```

`aitools config root` 实际操作的就是 `config.source` 字段。

---

## 5. 影响范围分析

### 5.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|------|---------|---------|
| `src/index.ts` | 注册 config 命令 | 低 |
| `desktop/src/pages/Settings.tsx` | 完全重写 | 高 |
| `desktop/src/lib/cli.ts` | 新增 3 个桥接函数 | 低 |
| `desktop/src/styles/components.css` | 新增样式 | 中 |

### 5.2 新增文件

| 文件 | 用途 |
|------|------|
| `src/commands/config.ts` | CLI config 命令实现（~150 行） |
| `desktop/src/components/SettingsSection.tsx` | 设置区块容器（~30 行） |
| `desktop/src/components/ThemeSelector.tsx` | 主题三选一（~60 行） |
| `desktop/src/components/PathDisplay.tsx` | 路径展示行（~40 行） |
| `desktop/src/components/MigrateModal.tsx` | 迁移确认弹窗（~120 行） |

### 5.3 依赖变更

无新增依赖。

---

## 6. 实现步骤

| 步骤 | 描述 | 预计工作量 |
|------|------|-----------|
| 1 | CLI：创建 `src/commands/config.ts`，实现 get/set/migrate 逻辑 | 中 |
| 2 | CLI：在 `src/index.ts` 注册 config 命令 | 小 |
| 3 | CLI：构建并验证命令可用 | 小 |
| 4 | GUI：在 `cli.ts` 新增 `getConfigValue` / `setConfigRoot` / `getCliVersion` | 小 |
| 5 | GUI：在 `components.css` 新增 settings 相关样式 | 小 |
| 6 | GUI：创建 `SettingsSection` / `ThemeSelector` / `PathDisplay` 组件 | 中 |
| 7 | GUI：创建 `MigrateModal` 组件 | 中 |
| 8 | GUI：重写 `Settings.tsx`，组装所有模块 | 中 |
| 9 | 自测：CLI config 命令 + GUI 设置页完整流程 | 小 |

---

## 7. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| config root --migrate 文件移动失败（权限/跨卷） | 中 | 高 | 使用 fs.cp + fs.rm 而非 fs.rename（跨卷兼容），失败时回滚 config |
| Tauri open_directory_dialog 在开发模式下不可用 | 低 | 低 | 降级为 window.prompt（已有 handleOpenDirectory 先例） |
| CLI 版本号获取超时 | 低 | 低 | 设置 5s 超时，失败显示「未知」 |

---

## 8. 回滚方案

- CLI config 命令是独立新增，不影响现有命令
- Settings.tsx 重写前有 git 历史可恢复
- config.yaml 的 source 字段修改是可逆的（旧值在 JSON 事件中返回）

---

## 9. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| TD-1 | config 命令用单一参数模式（key [value]）而非 get/set 子命令 | commander 注册 get/set 两个子命令 | 更简洁，类 git config |
| TD-2 | migrate 用 fs.cp + fs.rm 而非 fs.rename | fs.rename 更快 | fs.rename 不支持跨文件系统（如 /tmp → /home） |
| TD-3 | GUI 版本号从 import.meta.env 构建注入 | 读 package.json | Vite 构建时注入更可靠，无需运行时文件 IO |
| TD-4 | 主题持久化仍用 localStorage（现有 theme.ts） | 存入 gui-state.json | 主题需在 React 渲染前生效，localStorage 同步读取最快 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-04-29 | 初稿创建 | AI |

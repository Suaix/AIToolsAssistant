# 技术方案：连接工具管理-新增与移除

> **任务编号**：FEAT-003
> **创建日期**：2026-04-30
> **需求文档**：[01-requirements.md](./01-requirements.md)
> **设计文档**：[02-design.md](./02-design.md)
> **状态**：已确认

---

## 1. 概述

### 1.1 技术目标

1. **CLI 侧**：在 target 命令族中新增 `add` / `remove` 子命令
2. **GUI 侧**：Tools.tsx 新增添加按钮 + 行尾垃圾桶按钮 + 两个弹窗组件

### 1.2 技术约束

- 开关保持 enable/disable 不变，垃圾桶按钮独立处理 remove
- 预定义工具列表硬编码（三个工具）
- add 默认 enabled: true，remove 不清理文件

---

## 2. 架构设计

### 2.1 CLI 新增命令

```
aitools target add <name>      # 新增 target（预定义 user_base，enabled: true）
aitools target remove <name>   # 移除 target（从 targets 数组删除）

JSON 事件：
  target.added   { name, user_base }
  target.removed { name }
```

### 2.2 GUI 数据流

```
Tools.tsx
  ├── 添加：「添加工具」按钮 → AddToolModal → invokeCli(['target', 'add', name]) → 刷新
  ├── 启用/禁用：开关 → invokeCli(['target', 'enable/disable', name]) → 刷新（保持不变）
  └── 移除：垃圾桶按钮 → RemoveConfirmModal → invokeCli(['target', 'remove', name]) → 刷新
```

### 2.3 预定义工具清单

```typescript
/** 预定义支持的工具 */
const AVAILABLE_TOOLS = [
  { name: 'codebuddy', displayName: 'CodeBuddy', userBase: '~/.codebuddy' },
  { name: 'workbuddy', displayName: 'WorkBuddy', userBase: '~/.workbuddy' },
  { name: 'claude-internal', displayName: 'Claude Internal', userBase: '~/.claude-internal' },
] as const;
```

### 2.4 目录结构变更

```
src/commands/
└── target.ts              ← 修改：新增 targetAddCommand / targetRemoveCommand + 预定义列表

desktop/src/
├── pages/
│   └── Tools.tsx          ← 修改：Header 添加按钮 + 行尾垃圾桶 + 引入弹窗
├── components/
│   ├── AddToolModal.tsx   ← 新增
│   └── RemoveConfirmModal.tsx ← 新增
└── lib/
    └── cli.ts             ← 修改：新增 addTarget / removeTarget
```

---

## 3. 接口定义

### 3.1 CLI 命令

```typescript
/** 新增 target：从预定义列表获取 user_base，追加到 config.targets */
export async function targetAddCommand(name: string): Promise<void>

/** 移除 target：从 config.targets 中删除匹配项 */
export async function targetRemoveCommand(name: string): Promise<void>
```

**边界处理**：
- add 已存在 → 幂等跳过 + 提示「已存在」
- add 不在预定义列表 → 报错 + 提示可用列表
- remove 不存在 → 报错

### 3.2 GUI 桥接函数

```typescript
export async function addTarget(name: string): Promise<{ success: boolean; error?: string }>
export async function removeTarget(name: string): Promise<{ success: boolean; error?: string }>
```

### 3.3 GUI 组件

```typescript
interface AddToolModalProps {
  existingNames: string[];      // 当前已存在的 target 名
  onAdd: (name: string) => void;
  onClose: () => void;
  loading?: boolean;
}

interface RemoveConfirmModalProps {
  toolDisplayName: string;      // 要移除的工具显示名
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}
```

---

## 4. 影响范围分析

### 4.1 修改的现有文件

| 文件 | 修改内容 | 影响程度 |
|------|---------|---------|
| `src/commands/target.ts` | 新增 add/remove + 预定义列表 | 中 |
| `src/index.ts` | 注册 target add / target remove | 低 |
| `desktop/src/pages/Tools.tsx` | Header 按钮 + 行尾垃圾桶 + 弹窗集成 | 中 |
| `desktop/src/lib/cli.ts` | 新增 addTarget / removeTarget | 低 |

### 4.2 新增文件

| 文件 | 行数估算 |
|------|---------|
| `desktop/src/components/AddToolModal.tsx` | ~100 行 |
| `desktop/src/components/RemoveConfirmModal.tsx` | ~60 行 |

---

## 5. 实现步骤

| 步骤 | 描述 | 预计工作量 |
|------|------|-----------|
| 1 | CLI：target.ts 新增 add/remove + 预定义工具列表 | 中 |
| 2 | CLI：index.ts 注册子命令 | 小 |
| 3 | CLI：构建验证 | 小 |
| 4 | GUI：cli.ts 新增 addTarget / removeTarget | 小 |
| 5 | GUI：创建 AddToolModal | 中 |
| 6 | GUI：创建 RemoveConfirmModal | 小 |
| 7 | GUI：修改 Tools.tsx（Header + 行尾按钮 + 弹窗） | 中 |
| 8 | 自测 | 小 |

---

## 6. 风险评估

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|---------|
| add 重复 | 低 | 低 | 幂等处理 |
| remove 后 subscriptions 残留引用 | 中 | 低 | sync 时自动跳过不存在的 target |
| 垃圾桶按钮与开关视觉混淆 | 低 | 低 | 垃圾桶 hover 显示 + danger 色，与开关视觉区分明显 |

---

## 7. 技术决策记录

| 编号 | 决策 | 备选方案 | 选择原因 |
|------|------|---------|---------|
| TD-1 | 预定义列表硬编码在 target.ts | 配置文件/注册表 | MVP 三个工具固定 |
| TD-2 | add 默认 enabled: true | 默认 false | 添加即意味着想使用 |
| TD-3 | 开关保留 enable/disable，垃圾桶独立 remove | 混合 | 正交操作不混合 |
| TD-4 | remove 不清理文件 | --prune | 安全优先 |

---

## 变更记录

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-04-30 | 重写技术方案，对齐修正后的设计 | AI |

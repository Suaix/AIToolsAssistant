# 编码日志：连接工具管理-新增与移除

> **任务编号**：FEAT-003
> **创建日期**：2026-04-30
> **技术方案**：[03-technical.md](./03-technical.md)
> **状态**：进行中

---

## 编码进度

| 步骤 | 描述 | 状态 | 完成日期 |
|------|------|------|---------|
| 1 | CLI：target.ts 新增 add/remove + 预定义列表 | ✅ 已完成 | 2026-04-30 |
| 2 | CLI：index.ts 注册 add/remove 子命令 | ✅ 已完成 | 2026-04-30 |
| 3 | CLI：构建验证 | ✅ 已完成 | 2026-04-30 |
| 4 | GUI：cli.ts 新增 addTarget / removeTarget | ✅ 已完成 | 2026-04-30 |
| 5 | GUI：创建 AddToolModal | ✅ 已完成 | 2026-04-30 |
| 6 | GUI：创建 RemoveConfirmModal | ✅ 已完成 | 2026-04-30 |
| 7 | GUI：修改 Tools.tsx（Header + 垃圾桶 + 弹窗） | ✅ 已完成 | 2026-04-30 |
| 8 | 自测 | ⬜ 待开始 | |

---

## 变更记录

### 2026-04-30 - Step 1-7 全部完成

**CLI 侧**：
- `src/commands/target.ts` — 新增 ~120 行：targetAddCommand / targetRemoveCommand + AVAILABLE_TOOLS
- `src/index.ts` — 注册 target add / target remove 子命令

**GUI 侧**：
- `desktop/src/lib/cli.ts` — 新增 addTarget / removeTarget 桥接函数
- `desktop/src/components/AddToolModal.tsx` — 新增（~150 行）
- `desktop/src/components/RemoveConfirmModal.tsx` — 新增（~100 行）
- `desktop/src/pages/Tools.tsx` — 修改：import + state + handleAdd/handleRemoveConfirm + Header 按钮 + 行尾垃圾桶 + 弹窗渲染 + DISPLAY_NAME 扩展

**自测**：
- [x] CLI 构建成功
- [x] Tools.tsx Lint 零错误

---

## 偏离记录

| 编号 | 技术方案描述 | 实际实现 | 偏离原因 |
|------|-------------|---------|---------|
| 无 | — | — | — |

---

## 遗留问题

| 编号 | 问题 | 优先级 | 处理计划 |
|------|------|--------|---------|
| 1 | 垃圾桶 hover 用内联 style 实现，后续可改为 CSS :hover 更优雅 | 低 | CSS 优化时处理 |

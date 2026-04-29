# AI 开发工作流规范

> 版本：v1.0
> 创建日期：2026-04-29

---

## 概述

本工作流是个人开发的 AI 辅助工作流规范，通过结构化 Markdown + YAML 文件驱动 AI 协作。
核心思想：**文件即协议，状态可追踪，上下文可恢复**。

---

## 目录结构

```
.workflow/
├── workflow.config.yaml          ← 全局配置（编号计数器、阶段和门禁定义）
├── README.md                     ← 本文件（规范说明）
├── templates/                    ← 各阶段文档模板
│   ├── manifest.tpl.yaml         ← 任务状态追踪模板
│   ├── 01-requirements.tpl.md    ← 需求分析模板
│   ├── 02-design.tpl.md          ← UI/UX 设计模板
│   ├── 03-technical.tpl.md       ← 技术方案模板
│   ├── 04-coding-log.tpl.md      ← 编码日志模板
│   └── 05-testing.tpl.md         ← 测试验收模板
├── tasks/                        ← 进行中的任务（AI 扫描此目录恢复上下文）
│   └── FEAT-002-xxx/
└── archived/                     ← 已归档的任务（验收通过后移入）
    └── FEAT-001-xxx/
```

> **关键设计**：`tasks/` 只存放进行中的任务，`archived/` 存放已完成的任务。
> AI 恢复上下文时**只扫描 `tasks/`**，避免误读已归档任务。
> 归档操作：TESTING → ARCHIVED 门禁通过后，将任务目录从 `tasks/` 移动到 `archived/`。

---

## 状态机

### 任务总状态

```
ANALYSIS → DESIGN → TECHNICAL → CODING → TESTING → ARCHIVED
```

任何阶段可标记 `sub_status: blocked | revision`。

### 阶段状态

```
pending → in_progress → completed
                ↑            ↓
                └── revision ←┘
```

---

## 门禁规则

阶段间流转必须通过门禁检查：

- **通过**：检查项加入 `passed[]`
- **跳过**：必须在 `skipped[]` 中注明 `item`、`reason`、`date`
- **不允许**：未通过且未标注原因的项，阻止进入下一阶段

---

## ID 编号规则

| 前缀 | 类型 | 示例 |
|------|------|------|
| FEAT | 新功能 | FEAT-001 |
| FIX | 缺陷修复 | FIX-001 |
| REFACTOR | 重构 | REFACTOR-001 |

计数器维护在 `workflow.config.yaml` 的 `counters` 字段。

---

## AI 协作协议

### 恢复上下文

1. 读取 `.workflow/tasks/<任务>/manifest.yaml`（**只扫描 tasks/，不扫描 archived/**）
2. 确认 `status` 和 `sub_status`
3. 读取 `context.next_action` 了解待办
4. 读取当前阶段输出文件获取详细上下文
5. 继续工作

### 归档

1. TESTING → ARCHIVED 门禁通过后
2. 将任务目录从 `.workflow/tasks/<ID>-<标题>/` 移动到 `.workflow/archived/<ID>-<标题>/`
3. 更新 `manifest.yaml` 状态为 `ARCHIVED`

### 阶段流转

1. 完成当前阶段输出文件
2. 更新 `manifest.yaml` 中阶段状态为 `completed`
3. 校验门禁：逐项确认 checklist
4. 未通过项必须标注跳过原因
5. 门禁通过后更新任务总状态，进入下一阶段

### 每次工作结束时

必须更新 `manifest.yaml`：
- `updated` 时间戳
- 当前阶段 `status`
- `context.last_action` 和 `context.next_action`
- 如有决策，追加到 `context.decisions`

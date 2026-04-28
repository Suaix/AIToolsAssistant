# RFCs · 架构重大变更提案

本目录存放对 aitools 架构有**结构性影响**的提案（Request For Comments）。

---

## 什么场景写 RFC？

符合以下任一条件的变更，**在写代码前先写 RFC**：

- 涉及破坏性变更（Breaking Changes）
- 跨 CLI / GUI / 配置文件三者
- 引入新的核心概念（如订阅、工作区、插件）
- 影响用户数据迁移
- 单次工作量预计 > 3 人日

符合以下条件的变更**不用写 RFC**：

- Bug 修复
- 现有 API 的小幅增强
- 单一模块重构
- UI 美化 / 文案调整

---

## 流程

```
1. 创建   docs/rfcs/<version>-<slug>.md           （作者）
2. Review 团队讨论 + AI 助手把每节的"开放问题"收敛 （所有相关人）
3. 定稿   修改状态字段为 🟢 Accepted               （作者）
4. 拆 PR  按 RFC 的"分阶段实施计划"逐个 PR 推进     （作者）
5. 归档   发布后将 RFC 状态改为 ✅ Shipped         （作者）
```

---

## 索引

| 编号 | 版本 | 标题 | 状态 |
|---|---|---|---|
| 001 | v0.4.0 | [订阅模型（Subscription Model）](./v0.4.0-subscription-model.md) | 🟢 Accepted |
| 002 | 待定 | GUI 订阅视图重设计（占位） | ⚪ 未起草 |

---

## 状态标记

- ⚪ **未起草** — 占位，等待作者动笔
- 🟡 **Draft** — 草案，等 review
- 🟢 **Accepted** — 已批准，可开工
- 🔵 **In Progress** — 实施中
- ✅ **Shipped** — 已发布
- 🔴 **Rejected** — 不采纳，留存历史参考
- ⚫ **Superseded** — 被后续 RFC 取代

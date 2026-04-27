# AIToolsAssistant · 设计系统（Design System）

> 这里是产品所有设计决策的**单一事实源**（Single Source of Truth）。  
> 任何团队成员、贡献者、AI 助手在做设计决策前，都应当先查阅本目录。

---

## 🚨 AI 助手请先读这里

如果你是 AI 助手（CodeBuddy / Cursor / Claude Code / GitHub Copilot 等），在处理任何 UI / 视觉 / 页面相关任务前：

**👉 必读**：[`AI_INSTRUCTIONS.md`](./AI_INSTRUCTIONS.md)（给 AI 的操作契约，含任务路由表 + 3 条铁律 + 场景 SOP + 自查清单）

**违反设计系统的产出不会被接受。**

---

## 📐 设计体系的 7 层架构

设计系统按"**从战略到战术**"的层级结构组织，**上一层决定下一层**，绝不允许跳层决策。

| 层级 | 文件 | 状态 | 说明 |
|---|---|---|---|
| **AI 入口** | [`AI_INSTRUCTIONS.md`](./AI_INSTRUCTIONS.md) | ✅ v1.0 | 🚨 AI 助手强制读入的操作契约 |
| **L1** | [`01-brand-strategy.md`](./01-brand-strategy.md) | ✅ v1.0 | 品牌战略：产品定义、用户画像、气质坐标 |
| **L2** | [`02-design-principles.md`](./02-design-principles.md) | ✅ v1.0 | 设计原则：4 条可判对错的铁律 |
| **L3** | [`03-information-architecture.md`](./03-information-architecture.md) | ✅ v1.0 | 信息架构：双形态、5 页清单、3 条核心流 |
| **L4** | [`04-visual-language.md`](./04-visual-language.md) + [`tokens.css`](./tokens.css) | ✅ v1.0 | 视觉语言：Teal 主色、暗色优先、完整 Token |
| **L5** | [`05-component-spec.md`](./05-component-spec.md) + [`components.css`](./components.css) | ✅ v1.0 | 组件规范：12 个核心组件五段式规范 |
| **L6** | [`06-gui-prototype/`](./06-gui-prototype/) | ✅ v1.0 | 初版 GUI：5 页原型 + Popover + 组件 Showcase + 同步魔法动效 |
| **L7** | [`07-review-checklist.md`](./07-review-checklist.md) | ✅ v1.0 | 走查清单：4 大原则分组 + 红灯条款 |

---

## 🧭 如何使用本设计系统

### 如果你是**产品设计师 / 开发者**

1. **新增页面/组件前**：先读 L1~L3，确认方向；再读 L4~L5，确认可用元素
2. **做完后**：按 L7 走查清单自查
3. **规范冲突时**：修改上游文档并记录版本，不要悄悄打破规则

### 如果你是**AI 助手**

⚠️ 请严格按 [`AI_INSTRUCTIONS.md`](./AI_INSTRUCTIONS.md) 执行。该文件定义了：

- 按任务类型的**任务路由表**（告诉你读哪些文件）
- **3 条不可逾越的铁律**（硬编码 / 自创组件 / 违反 4 原则）
- **场景 SOP**（新页面 / 改颜色 / 加错误提示等常见场景的标准流程）
- **自查清单**（生成代码后必须附带的 7 项自查）

**简化版约束**：

1. 颜色/字体/间距/圆角/阴影必须引用 [`tokens.css`](./tokens.css) 的变量
2. 所有组件必须使用 [`components.css`](./components.css) 里已定义的 class
3. 生成的产出必须通过 [`07-review-checklist.md`](./07-review-checklist.md) 的检查
4. 不确定时先问用户，不要自由发挥

---

## 📌 核心结论速查（30 秒了解产品气质）

> **产品隐喻**：抽屉（不是中控台）  
> **一句话**：你写一次，它到处都在。  
> **目标用户**：Alex，28 岁前端，同时用 2+ 个 AI 助手  
> **核心承诺**：让你永远用到"最新版本的自己"  
> **气质坐标**：冷静 × 工程精准，带一点友好的圆润  
> **灵感参照**：Raycast / Linear / Arc / Vercel Dashboard  
> **反面参照**：Notion（太暖）/ JIRA（太冷）/ 钉钉（太 B 端）

### 4 条设计原则（铁律，按仲裁优先级排列）

1. **诚实先于友好** —— 失败就说失败，不糊弄、不卖萌
2. **状态先于功能** —— 先告诉用户"现在怎样"，再给"能做什么"
3. **明确先于惊喜** —— 清楚 > 惊艳，能用文字说清的不用动画
4. **克制先于全面** —— 宁可少做一个，不做半成品

### 视觉基调（L4 已定）

- **主色**：Teal 暮光青（`#14B8A6` / 暗色 `#2DD4BF`）
- **中性**：Slate 石板灰（带轻微蓝冷调）
- **状态色**：Mint 绿（成功）/ Amber 黄（警告）/ Rose 红（危险）/ Sky 蓝（信息）
- **字体**：Inter + PingFang SC + JetBrains Mono（等宽用于路径/hash）
- **圆角**：卡片 12px、按钮 8px、Pill 全圆
- **默认主题**：跟随系统，偏好暗色

### 产品形态（L3 已定）

- **菜单栏常驻** + **主窗口**（双形态）
- 菜单栏图标用 🟢🟡🔴⚙️ 色点承载"全局新鲜度"
- 首版 5 个核心页面：工作台 / Skills 列表 / Skill 详情 / 已连接工具 / 设置
- 重点打磨用户流：**新增 Skill → 自动同步到所有工具**（产品"魔法瞬间"）

---

## 📝 变更记录

| 日期 | 变更 |
|---|---|
| 2026-04-27 | 🎉 设计系统 v1.0 封版 —— 7 层架构全部完成（L1-L7）+ AI_INSTRUCTIONS.md |

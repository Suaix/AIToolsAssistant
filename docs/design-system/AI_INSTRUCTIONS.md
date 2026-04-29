# AI 工作指令（AI Instructions）

> **这份文件是给 AI 助手看的"操作契约"。**  
> 你（AI）在处理本项目任何设计 / UI / 视觉相关任务前，**必须完整读完本文件**，然后按约定执行。  
> 这不是建议，是**硬性约束**——违反约束的产出不会被接受。

---

## 🚨 STOP：在写任何 UI / CSS / 页面代码之前

**请先确认你已经读过以下 2 个文件：**

1. `docs/design-system/README.md` —— 设计系统总览
2. `docs/design-system/01-brand-strategy.md` —— 品牌战略（尤其是"对下游约束清单"和"气质坐标"）

**如果你没读过，现在就去读。** 其它文档按任务需要再读（见下方"任务路由表"）。

---

## 📍 任务路由表（按任务类型查要读的文件）

AI 助手遇到不同任务时，按下表决定读哪些文档：

| 任务类型 | 必读文件 | 必用资源 |
|---|---|---|
| **加一个新按钮 / 徽章 / 卡片等现有组件** | `05-component-spec.md` 对应章节 | `components.css` 已有类名 |
| **给现有页面加一个小区域** | `03-information-architecture.md` + `05-component-spec.md` | `tokens.css` + `components.css` |
| **加一个全新页面** | L1 + L2 + L3（信息架构）+ L5 | 整套 Token + 组件 + L7 走查 |
| **换颜色 / 换字体 / 改间距** | `04-visual-language.md` | **只能改 `tokens.css` 的变量**，不允许散点改 |
| **加新状态 / 新徽章类型** | `05-component-spec.md` 第 2 节 | 先补 L5 规范再改 `desktop/src/styles/components.css` |
| **加动画 / 过渡** | `04-visual-language.md` 第 7 节 | **动画时长 ≤ 400ms**，同步动效 ≤ 640ms 例外 |
| **加错误提示 / Toast** | `02-design-principles.md` 原则 3 + `05-component-spec.md` Toast | 文案必须"原因 + 操作" |
| **加 Empty State** | `05-component-spec.md` EmptyState | 必含"图标 + 标题 + 描述 + CTA" |
| **加 Modal / 弹窗** | `05-component-spec.md` Modal | 破坏性操作必须二次确认 |
| **写文案 / UI 文字** | `01-brand-strategy.md` 第 6 节（语气规范） | 动词开头，禁用装饰 Emoji |

---

## 🔒 3 条不可逾越的铁律

### 铁律 1 · 禁止硬编码

❌ **你生成的 CSS / HTML 中绝对禁止出现：**

```css
color: #14B8A6;           /* 硬编码颜色 */
padding: 15px;            /* 非 4px 栅格 */
border-radius: 6px;       /* 非规范圆角 */
font-size: 15px;          /* 非规范字号 */
box-shadow: 0 3px 5px #000; /* 自创阴影 */
```

✅ **必须改为 Token 引用：**

```css
color: var(--color-brand-default);
padding: var(--space-4);              /* = 16px */
border-radius: var(--radius-md);      /* = 8px */
font-size: var(--text-body-size);     /* = 14px */
box-shadow: var(--shadow-sm);
```

**如果 `tokens.css` 里没有你需要的 Token**：停止生成代码，先向用户汇报："这个值不在 Token 系统中，是否需要 L4 补充？"——**绝不自己发明**。

---

### 铁律 2 · 禁止自创组件

❌ **禁止行为：**

- 自己写 `<div>` + 一堆内联样式来实现"看起来像卡片"的东西
- 自己发明"次次要按钮"或"超迷你徽章"这类 L5 里没有的变体
- 在 HTML 里写 `<style>` 或 `style="color:..."` （除了布局相关的 `display:flex` / `margin` 可接受）

✅ **必须行为：**

- 找 `components.css` 里已有的类名直接用
- 如果真的没有合适的组件：**停止生成，向用户汇报**"组件库里没有 X 组件，需要先补 L5 规范再实现吗？"

---

### 铁律 3 · 所有产出必须符合 L2 四原则

生成任何 UI 前，用 4 条原则自查：

1. **状态先于功能** —— 用户一眼能看到"现状"吗？
2. **明确先于惊喜** —— 有没有装饰性动画 / 花哨元素？
3. **诚实先于友好** —— 错误文案说清"原因 + 操作"了吗？禁用卖萌话术
4. **克制先于全面** —— 这个功能/元素真的必要吗？能不能删？

**任一条违反 = 重来**。不要"这次先这样，以后改"——设计系统的漂移就是从这种念头开始的。

---

## 🧭 场景 SOP（常见场景的标准流程）

### 场景 A · 用户说"加一个新功能页面"

```
1. 读 docs/design-system/03-information-architecture.md
   → 确认新页面是否符合"首版 5 页清单"的克制原则
   → 如果是已有 5 页外的新页面，先问用户"为什么不能放在现有页面里？"

2. 读 docs/design-system/05-component-spec.md
   → 确认页面需要的组件全部已有定义

3. 基于 desktop/src/pages/ 中现有页面为模板
   → 复制粘贴、改内容，不要重写结构

4. 样式引用：
   - tokens.css 通过 @design-system 别名引入
   - components.css 通过 ./styles/components.css 引入

5. 写完后按 07-review-checklist.md 自查
```

### 场景 B · 用户说"把主色换成紫色"

```
1. 不要在页面里改！
2. 打开 docs/design-system/tokens.css
3. 只改 --teal-* 色阶 → --iris-*（或 --purple-*），并更新所有语义 Token 引用
4. 同步更新 docs/design-system/04-visual-language.md 中的色值表
5. 在文档变更记录里加一条
```

### 场景 C · 用户说"帮我加一个错误提示"

```
1. 读 02-design-principles.md 原则 3（诚实先于友好）
2. 读 05-component-spec.md Toast 章节
3. 生成的文案必须满足：
   - ✅ 包含"具体原因"（不是"出错了"）
   - ✅ 包含"具体操作"（按钮或链接）
   - ✅ 失败类 persist: true（不自动消失）
   - ❌ 禁用 "哎呀/噢豁/稍后重试" 类话术
4. 使用 window.showToast({...}) 调用
```

### 场景 D · 用户说"这个动效能不能更好看点"

```
⚠️ 警惕这个需求！先反问用户：
  "能具体说说'好看点'是指什么吗？"
  
可能的合理解读：
  - 过渡不够流畅 → 检查 duration / easing 是否合规
  - 状态切换看不清 → 可能是动效"不够"而非"不够酷"
  
禁止的解读：
  - 加粒子效果
  - 加 3D 翻转
  - 超过 400ms 的装饰性动效
  
如果用户坚持要"更花哨"，引用 L2 原则 2：
  "这不符合我们'明确先于惊喜'的原则，咱们先用现有动效上线，收集真实反馈？"
```

---

## 🔍 自查清单（生成代码后必须跑一遍）

生成任何 UI 代码后，AI 助手 **应当在回复中附上自查结果**：

```
[ ] 所有颜色都用了 var(--color-*)
[ ] 所有间距都是 var(--space-*)
[ ] 所有组件都是 desktop/src/styles/components.css 里已定义的类
[ ] 没有行内 style 写颜色（布局类可接受）
[ ] 文案遵循动词开头 + 无卖萌 Emoji
[ ] 符合 L2 四条原则
[ ] 暗色模式仍可正常显示（未破坏对比度）
```

**如发现任何项未过 → 修改后重新生成，而不是"交付 + 说明后续可改"。**

---

## ❓ 什么情况下可以打破规则？

**只有一种情况**：用户**明确知情并同意**。

举例：
- ✅ 用户说："我知道这违反了'克制'原则，但我需要一个临时的统计页，做吧。"
- ❌ 你自己判断"这个场景应该例外"——**不可以，先问用户**

打破规则时，必须：
1. 在代码注释中标明 `// DESIGN-SYSTEM-EXCEPTION: <原因>`
2. 在回复中告知用户："这部分违反了 L2 原则 X，已按你要求执行，建议后续在 L1/L2 文档中追加例外说明。"

---

## 📚 完整文档索引（从本文内链接）

| 层级 | 文档 | 何时读 |
|---|---|---|
| L1 | [`01-brand-strategy.md`](./01-brand-strategy.md) | 每次接 UI 任务，必读气质坐标 |
| L2 | [`02-design-principles.md`](./02-design-principles.md) | 评审产出时按 4 原则逐条自查 |
| L3 | [`03-information-architecture.md`](./03-information-architecture.md) | 涉及新页面、新导航 |
| L4 | [`04-visual-language.md`](./04-visual-language.md) | 改颜色、字体、间距、动效 |
| —  | [`tokens.css`](./tokens.css) | 永远用它的变量，不自己写色值 |
| L5 | [`05-component-spec.md`](./05-component-spec.md) | 用组件前先查它 |
| —  | `desktop/src/styles/components.css` | 永远用它的类名，不自创组件 |
| L7 | [`07-review-checklist.md`](./07-review-checklist.md) | 完工后逐条走查 |

---

## 🎯 元原则（给 AI 的一句话）

> **当你不确定时，请"克制"——宁可问用户，也不要自由发挥。**  
> 这套设计系统是用户的心血，你的工作是"忠实执行"，不是"创造性发挥"。

---

## 📝 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-04-27 | 首版发布，配套 L1-L7 封版 |

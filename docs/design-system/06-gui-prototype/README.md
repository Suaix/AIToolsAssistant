# L6 · GUI 原型（Hi-Fi Prototype）

> **这是可以直接在浏览器里运行的高保真原型。**  
> 它使用 L4 的 `tokens.css` 和 L5 的 `components.css`，不额外写样式——**只做"拼装"，不做"创造"**。

| 项 | 值 |
|---|---|
| 版本 | v1.0 |
| 创建日期 | 2026-04-27 |
| 所属层级 | L6 · GUI Prototype |
| 上游依赖 | L1 / L2 / L3 / L4 / L5 |

---

## 🚀 如何预览

### ⚠️ 重要：必须从 `design-system/` 目录启动

原型页面引用了上一级目录的 `tokens.css` 和 `components.css`（保持单一真相源，不重复）。  
**必须从 `design-system/` 目录启动 HTTP 服务器**，这样页面才能访问到 CSS。

### 方式 1：本地服务器（推荐）

```bash
# 关键：cd 到 design-system 目录（不是 06-gui-prototype）
cd docs/design-system
python3 -m http.server 8080
```

然后访问 **http://localhost:8080/06-gui-prototype/** 即可。

### 方式 2：直接用浏览器打开文件

双击 `index.html` 会跳转到 `pages/dashboard.html`。  
部分浏览器（Chrome 较严格）可能因 CORS / file:// 限制导致 CSS 加载失败，此时请使用方式 1。

### 方式 3：VS Code Live Server 插件

在 VS Code 中：
1. 打开整个 `aiproject/AIToolsAssistant` 项目
2. 右键 `docs/design-system/06-gui-prototype/index.html` → Open with Live Server
3. Live Server 会以项目根为服务器根，路径解析正常

---

## 📦 文件结构

```
06-gui-prototype/
├── README.md                   ← 本文档
├── index.html                  ← 入口
├── pages/
│   ├── dashboard.html          ← P1 工作台（首屏，含 HeroCard）
│   ├── skills.html             ← P2 Skills 列表（含同步魔法动效入口）
│   ├── skill-detail.html       ← P3 Skill 详情（Tab 切换）
│   ├── tools.html              ← P4 已连接工具
│   ├── settings.html           ← P5 设置
│   └── tray-popover.html       ← 菜单栏 Popover 模拟
├── components/
│   └── showcase.html           ← 所有 L5 组件的活文档
└── scripts/
    ├── app.js                  ← 共享：主题切换、页面高亮
    └── sync-magic.js           ← Flow 2 同步魔法动效
```

## 🎬 关键可交互演示

| 位置 | 交互 |
|---|---|
| 所有页面右上角 | 🌗 切换亮/暗主题 |
| 侧栏 | 点击跳转各页面 |
| `skills.html` 顶部 | 点击「▶️ 演示同步魔法」可观看 Flow 2 的同步动效 |
| `skill-detail.html` | Tab 切换（内容 / 同步目标 / 历史） |
| `dashboard.html` | 点击 Hero 卡的「重新扫描」按钮可切换到不同状态 |
| `components/showcase.html` | 所有组件的各状态一览，点击元素可复制 HTML 片段 |

---

## 📐 定位：这是什么，不是什么

| 它是 | 它不是 |
|---|---|
| ✅ 可视化的设计评审材料 | ❌ 真实产品 |
| ✅ 设计规范的"活证明" | ❌ 连接真实数据的应用 |
| ✅ 未来 Tauri/React 工程的 CSS 源 | ❌ 最终 UI 库 |
| ✅ 团队/贡献者走查用的参考 | ❌ 用户手册 |

---

## 🔄 如何迭代

1. **改 Token**：修改 `../tokens.css`，所有页面自动更新
2. **改组件**：修改 `../components.css`，所有页面自动更新
3. **加页面**：复制一个 `pages/*.html`，改内容即可，**不要写新样式**
4. **发现样式不够用**：**回 L5 文档**，补充组件规范后再写——**不允许在页面中直接写 style**

---

## ⚠️ 使用铁律

- ❌ 禁止在 HTML 中写 `<style>` 或 `style="..."`
- ❌ 禁止在 HTML 中引用非 Token 的颜色值
- ✅ 所有样式必须来自 `tokens.css` / `components.css`
- ✅ 如发现组件库不够用，先补 L5，再用

这样才能保证原型真正是设计系统的"证明"，而不是另一份独立的 UI。

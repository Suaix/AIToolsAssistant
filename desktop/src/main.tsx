/**
 * aitools 桌面应用入口
 * 挂载 React 根组件到 DOM
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

/*
 * 接入设计系统的样式（单一真相源）
 * 通过 Vite alias 解析到 ../docs/design-system/
 * 这样改设计系统文档，桌面 App 实时更新；不允许在 desktop/src/ 下自写 CSS
 */
import '@design-system/tokens.css';
import '@design-system/components.css';

/* 初始化主题（在渲染前执行，避免首帧闪烁） */
import { initTheme } from './lib/theme';
initTheme();

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('找不到 #root 挂载点');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

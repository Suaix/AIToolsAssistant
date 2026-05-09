/**
 * aitools 桌面应用入口
 * 挂载 React 根组件到 DOM
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

/*
 * 样式引入：
 * - tokens.css：设计系统 Token（多端真相源，通过 Vite alias 引用）
 * - components.css：桌面端组件样式（已移入 desktop/src/styles/）
 */
import '@design-system/tokens.css';
import './styles/components.css';

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

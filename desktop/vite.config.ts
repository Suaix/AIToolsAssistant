import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite 配置
 *
 * 关键设计：通过 alias 接入设计系统的 tokens.css 和 components.css
 * - 保持"单一真相源"：设计系统文档即组件库，改文档直接反映到桌面 App
 * - 禁止在 desktop/src/ 下自写 CSS，只能引用设计系统或用 Token
 */
export default defineConfig({
  plugins: [react()],

  /* 路径别名配置 */
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@design-system': path.resolve(__dirname, '../docs/design-system'),
      /* FEAT-005：跨包共享的 SSOT（仓库根 shared/） */
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },

  /* Tauri dev server 默认端口 */
  server: {
    port: 1420,
    strictPort: true,
    /* 允许 Vite 访问 docs/design-system（位于项目根，非 desktop 子目录） */
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },

  /* Tauri 需要明确的产物目录 */
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },

  /* 禁用 Vite 的 clearScreen，便于在 tauri dev 时看到完整日志 */
  clearScreen: false,
});

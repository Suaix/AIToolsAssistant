import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * 仓库根 ESLint 配置（Flat Config）
 *
 * 职责：全仓统一的 JS/TS 校验规则
 * 作用域：packages/*\/src/**、packages/*\/tests/**
 * 忽略：各包 dist/node_modules、desktop Rust target、.codebuddy 等工具目录
 */
export default tseslint.config(
  {
    ignores: [
      /* workspace 构建产物与依赖 */
      'packages/*/dist',
      'packages/*/node_modules',
      /* desktop Tauri Rust 端产物（体量大且无需 JS 校验） */
      'packages/desktop/src-tauri/target',
      /* desktop React 源码：包含 react-hooks 等专属规则，由 desktop 自己的 lint 配置处理
         （根 eslint 只负责 @aitools/cli 这类 Node TS 项目） */
      'packages/desktop/src',
      /* 辅助工具与历史目录 */
      'node_modules',
      'dist',
      '.codebuddy',
      '.claude',
      '.claude-code',
      '.claude-internal',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      ecmaVersion: 2022,
    },
  }
);

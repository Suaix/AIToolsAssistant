import { defineConfig } from 'tsup';

/**
 * tsup 构建配置
 *
 * 关键设计（REFACTOR-001 PR-2）：
 *   - noExternal: ['@aitools/shared']
 *     强制把 workspace 包 @aitools/shared 的 .ts 源码 + tools.json 内容
 *     全部 inline 进 dist/index.js 单文件。
 *     否则 Node 运行 dist 时会尝试 external resolve 到 packages/shared/src/index.ts，
 *     而 Node 原生不识别 .ts 扩展名导致崩溃（ERR_UNKNOWN_FILE_EXTENSION）。
 *
 * 产物特征：
 *   - dist/index.js 单文件 ~50 KB（含 shared 全部导出）
 *   - 不含对 @aitools/shared 的 runtime import
 *   - 不含独立的 shared/tools.json 文件
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  minify: true,
  sourcemap: true,
  noExternal: ['@aitools/shared'],
});

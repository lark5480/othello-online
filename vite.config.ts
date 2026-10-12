import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createMockApi } from './server/mockApi';

/**
 * 本地开发中间件：在 dev / preview 下挂载内存版 /api，
 * 使本地无需 EdgeOne / KV 即可用两个浏览器窗口验证完整对局。
 * 生产构建（vite build）不会包含此逻辑。
 */
function mockApiPlugin(): Plugin {
  const handler = createMockApi();
  return {
    name: 'othello-mock-api',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApiPlugin()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // e2e 下的 *.spec.ts 由 Playwright 运行，vitest 不收集
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
  build: {
    // dist/ 在项目根目录内，Vite 默认清空 outDir；这里显式写出以固化意图、防回退。
    //
    // 历史（2026-10-12 已实测推翻）：此处曾因「清空 dist 会触发 safe-delete 拦截导致
    // 构建失败」而设为 false，并改用固定产物名（entryFileNames: 'assets/index.js'）。
    // 复测结论：该约束已不成立 ——
    //   1. Vite 清空 outDir 走的是内部 Node fs 删除，不经过 shell，与本机 safe-delete
    //      包装无关（当时的报错是 ERROR_FILE_NOT_FOUND 0x80070002，属瞬时失败而非策略拦截）；
    //   2. `vite build --emptyOutDir` 实测 EXIT=0，且成功清掉了陈旧的 ai.worker-5T0219aS.js。
    //
    // 因此恢复「清空 + 默认内容 hash 文件名」，一次解决两个问题：
    //   a. 发版后 JS URL 随内容变化 → CDN 长缓存不会让老用户停留在旧代码；
    //   b. 不再残留上一版产物。
    // 详见 docs/release/asset-cache-strategy.md
    emptyOutDir: true,
  },
});

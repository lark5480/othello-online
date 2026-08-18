import { defineConfig, type Plugin } from 'vite';
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
  build: {
    // 关闭 emptyOutDir：当前环境下 Vite 清空 dist 会触发 safe-delete 拦截而构建失败。
    // 改用固定产物文件名，每次构建原地覆盖，避免残留旧哈希文件。
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});

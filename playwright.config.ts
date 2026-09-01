import { defineConfig } from '@playwright/test';

/**
 * 双窗口 E2E：直接复用 dev server 的 mockApi（内存 Map 充当 KV），
 * 两个浏览器上下文共享同一后端，即可完整验证「建房→加入→交替落子→状态同步」。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

import { defineConfig } from '@playwright/test';

/**
 * 双窗口 E2E：直接复用 dev server 的 mockApi（内存 Map 充当 KV），
 * 两个浏览器上下文共享同一后端，即可完整验证「建房→加入→交替落子→状态同步」。
 *
 * 端口说明（E2E 与 dev server 刻意用不同端口）：
 *   本地开发端口 5173 常被**其它项目**的 Vite dev server 占用（本机实测即如此——
 *   5173 上跑着另一个项目，标题为「硬参 · 新房家电选购参考」）。此前这里配的是
 *   `reuseExistingServer: !CI`，本地为 true，于是 Playwright 会把那个**陌生服务**
 *   当成本项目的 dev server 直接复用，黑白棋 E2E 实际跑在一家电评测站上：
 *   表现为「找不到『创建房间』按钮」的全红超时，具有极强误导性；
 *   更危险的是若对方页面恰好存在同名元素，可能拿到**假绿**。
 *   根治手段：端口与 dev 错开 + 一律不复用外部服务。宁可报「端口被占」，
 *   也不要静默测错应用。
 *
 * E2E_PORT：默认端口被占用（例如上一次 Playwright 的 vite 在 Windows 上未回收干净，
 *   或多人 / 多 agent 并行跑测试）时，可用环境变量换一个端口，避免整轮全军覆没：
 *     E2E_PORT=5274 npm run test:e2e
 *   注意这是「换端口」而非「自动让路」—— 自动探测空闲端口存在 TOCTOU 竞态
 *   （探测释放后到 vite 绑定前仍可能被占），反而会产生更隐蔽的错位失败。
 */
const E2E_PORT = Number(process.env.E2E_PORT) || 5273; // 默认避开 5173/5174 等 Vite 常见默认端口

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // 走 scripts/serve-e2e.mjs 而非直接 `node vite`：Playwright 结束时只发 SIGTERM，
    // 而 Windows 上 vite 收 SIGTERM **不退出**（实测 8 秒内 exit 事件不触发），
    // 导致命令挂起 3–5 分钟直到被外部 timeout 杀掉（exit 124）——
    // 迷惑之处是**用例全绿、退出码却非 0**，极易被误判为「用例 flaky」。
    // 该脚本收到信号后用 taskkill /F /T 连同 esbuild 子进程硬杀，Playwright 才能立刻收尾。
    command: 'node ./scripts/serve-e2e.mjs',
    url: `http://localhost:${E2E_PORT}`,
    // 绝不复用已存在的服务（本地与 CI 一致）：杜绝「静默测错应用」
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

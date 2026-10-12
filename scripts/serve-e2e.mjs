/**
 * E2E 专用 dev server 启动器：解决 Windows 上 vite 无法被正常回收的问题。
 *
 * 背景（实测定位，非推测）：
 *   Playwright 的 webServer 在测试结束后会终止它启动的进程，但**只发 SIGTERM**。
 *   在 Windows 上 vite 收到 SIGTERM 后**不会退出**（实测：`p.kill('SIGTERM')` 后
 *   8 秒内 `exit` 事件始终不触发），于是 Playwright 一直等不到进程结束，
 *   命令挂起 3–5 分钟直到被外部 timeout 杀掉（exit 124）。
 *   最迷惑之处在于**用例全部通过、退出码却非 0** —— 极易被误判为「用例 flaky」。
 *   注：端口本身是能正常释放的（实测退出后端口已空），纯粹是进程不退出。
 *
 * 方案：本脚本自己 spawn vite，收到 SIGTERM / SIGINT 时用
 *   `taskkill /F /T`（Windows 硬杀，进程树）把它**连同 esbuild 子进程**一起清掉，
 *   然后自身退出。这样 Playwright 无论用 SIGTERM 还是 SIGINT 收尾都能立刻拿到 EOF。
 *
 * 非 Windows 平台退化为普通 SIGTERM，行为不变（Linux/macOS 上 vite 本就能正常退出）。
 */
import { spawn } from 'node:child_process';

const PORT = process.env.E2E_PORT ?? '5273';
const isWindows = process.platform === 'win32';

const viteArgs = [
  './node_modules/vite/bin/vite.js',
  '--port',
  PORT,
  '--strictPort',
];

// 用 process.execPath（当前 node）而非依赖 PATH 中的 node
const child = spawn(process.execPath, viteArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  const done = () => process.exit(0);

  if (isWindows) {
    // /F 强制终止 /T 连同子进程（esbuild）一起清理
    const killer = spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], {
      stdio: 'ignore',
    });
    killer.on('exit', done);
    killer.on('error', done);
    // 兜底：taskkill 本身卡住时也不能无限期挂住 Playwright
    setTimeout(done, 5000);
  } else {
    child.kill(signal);
    // 兜底同上
    setTimeout(done, 5000);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

child.on('exit', (code, signal) => {
  // vite 自行退出（端口被占等）时，把退出码如实传递给 Playwright
  process.exit(signal ? 1 : (code ?? 0));
});

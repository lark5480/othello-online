# 黑白棋 · 在线对战（Othello Online）

一个零成本部署的黑白棋（Othello / Reversi）网页游戏：两人通过**房间码**联机对战，无需注册登录。前端 React + Vite，后端用 EdgeOne Makers 的 Edge Functions + KV 实现状态同步。

## 功能特性

- 8×8 标准棋盘，木纹棋板主题，黑白子高对比渐变。
- 房间码创建 / 加入，跨设备实时同步（轮询）。
- 合法落子自动翻转，带翻转动画。
- 无合法落子时自动跳过并提示对方；双方均不可落子或棋盘满时判定胜负。
- **落子提示可配置开关**：联网对战默认关闭（靠棋力，保公平），休闲对局可在对局页手动开启；提示状态按设备保存在 localStorage。
- **人机对战（P2）**：单机离线即可挑战 AI，四档难度——简单（随机）、中等（2 层预判）、困难（4 层 Minimax + 剪枝）、大师（迭代加深 + 残局精确），AI 计算在 Web Worker 中进行不卡界面，并按难度记录本地战绩。无需后端 / KV。
- 程序化音效（Web Audio 合成，零音频文件）+ 静音开关。
- 走子历史侧栏（联机与人机模式均展示）。
- 暗色模式（跟随系统 `prefers-color-scheme`）。
- 最后落子位置高亮（青色描边），方便追踪局势。
- 响应式布局，支持键盘聚焦与屏幕阅读器（`aria-label`）。
- 测试覆盖：Vitest 单元/组件测试 + Playwright 双窗口 E2E，GitHub Actions CI 自动执行。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18、Vite 6、TypeScript、Tailwind CSS v4 |
| 后端 | EdgeOne Makers Edge Functions（V8）、KV 存储 |
| 同步 | 前端轮询（`usePolling`）+ `currentTurn`/`updatedAt` 防并发与陈旧数据 |
| 测试 | Vitest（单元/组件）+ Playwright（双窗口 E2E），GitHub Actions CI |
| 部署 | EdgeOne Makers（GitHub 自动部署 / `edgeone makers deploy`） |

## 快速开始（本地）

需要 **Node.js ≥ 22.22.2**（推荐 24 LTS；本项目测试依赖 jsdom 30 / undici 8，均要求新版本 Node）。

```bash
npm install
npm run dev
```

打开两个浏览器窗口（或两台设备），一个创建房间、一个用房间码加入即可对弈。
本地验证无需配置 EdgeOne / KV——`server/mockApi.ts` 会在 `npm run dev` 时自动挂载一个内存版接口，端点形状与生产一致。

想挑战电脑？打开 `/ai` 即可与 AI 对战（简单 / 中等 / 困难），同样是纯本地、无需任何后端配置。

## 构建与部署

```bash
npm run build     # 产物输出到 dist/
npm run preview   # 本地预览构建产物
```

部署到 EdgeOne Makers：

1. 在 EdgeOne 控制台创建 KV 命名空间，绑定项目变量（如 `OTHELLO_KV`）。
2. 关联 GitHub 仓库自动部署，或执行 `edgeone makers deploy`（构建 `npm run build`、输出 `dist`）。
3. SPA 路由已在 `edgeone.json` 配置 fallback（`/room/:roomId` 刷新不 404）。

> 详细部署步骤与架构约束见 [`docs/deployment.md`](docs/deployment.md)；完整产品需求见 [`docs/prd.md`](docs/prd.md)。

## 项目结构

```
src/                   前端源码
├─ pages/              Home（首页）、Room（联机对局）、AIGame（人机对战，路由 /ai）
├─ components/         Board / Cell / GameInfo / MoveHistory / StatsPanel / ThemeToggle / icons
├─ hooks/              usePolling（状态轮询）、useBoardSound（音效）
├─ workers/            ai.worker.ts（AI 异步计算，不阻塞主线程）
├─ utils/              gameLogic.ts（规则引擎）、ai.ts（AI 引擎）、hints.ts（提示开关）、
│                      api.ts / player.ts / roomCode.ts / sound.ts / stats.ts / theme.ts
├─ test/               setup.ts（Vitest：jsdom + jest-dom）
└─ index.css           设计令牌 + 棋盘/棋子/提示样式
edge-functions/        Edge Functions：create / join / [roomId]/{state, move, restart} + lib（router/kv/types）
server/mockApi.ts      本地免 EdgeOne 验证的 Vite 中间件（内存 KV，端点与生产一致）
e2e/                   Playwright 双窗口冒烟测试（room.spec.ts）
scripts/               类型剥离自测脚本
.github/workflows/     CI（typecheck + 单测 + E2E）
docs/                  prd.md、deployment.md、ai-mode.md、competitive-analysis.md
edgeone.json           SPA fallback 配置
```

## 开发与测试

```bash
npm run typecheck   # 类型检查（tsc --noEmit，含 e2e）
npm test            # 单元 / 组件测试（vitest）
npm run test:e2e    # 双窗口 E2E 冒烟（playwright，需先安装浏览器）
```

## 目录约定

- 游戏规则等纯逻辑集中在 `src/utils/gameLogic.ts`，前后端共用；Edge Functions 不得引入 npm 包。
- 视觉令牌集中在 `src/index.css` 的 `:root`，组件用专属 CSS 类（如 `is-hint` / `is-last`）控制状态样式。
- 棋子用 CSS 圆形 + 内联 SVG 图标，项目内不使用 emoji 图标。

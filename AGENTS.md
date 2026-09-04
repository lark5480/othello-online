# AGENTS.md — 给 AI 编码代理的指引

黑白棋（Othello / Reversi）在线双人对战网页游戏。React + Vite 前端，EdgeOne Makers（原 EdgeOne Pages）的 Edge Functions + KV 作零成本后端，房间码对战、不注册。

## 技术栈

- 前端：React 18 + Vite 6 + TypeScript + Tailwind CSS v4（CSS-first，配置靠 `src/index.css` 的 `:root` 设计令牌，无 `tailwind.config.js`）。
- 后端：Edge Functions（V8 runtime）+ KV 存储；前端用轮询（`usePolling`）同步状态。
- 测试：Vitest（`npm test`，jsdom + jest-dom，setup 在 `src/test/setup.ts`）+ Playwright 双窗口 E2E（`npm run test:e2e`）。
- 部署：EdgeOne Makers，构建 `npm run build` → 产物 `dist/`；支持 GitHub 自动部署或 `edgeone makers deploy`。CI：`.github/workflows/ci.yml`（typecheck + 单测 + E2E）。

## 常用命令

> **需要 Node.js ≥ 22.22.2（推荐 24 LTS）。** 测试依赖 `jsdom@30` / `undici@8`，其 `engines` 要求 `^22.22.2 || ^24.15.0 || >=26`；Node 20 跑 `npm test` 会因缺少 `node:webidl` 直接崩溃（`TypeError: webidl.util.markAsUncloneable is not a function`）。CI 已固定 Node 24，`package.json` 亦声明 `engines`。

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（含 mockApi 中间件，见下）
npm run build      # 生产构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # tsc --noEmit（含 e2e 的 tsconfig）
npm test           # vitest run
npm run test:e2e   # playwright test（双窗口冒烟，需先 npx playwright install chromium）
```

> 注意：**不要替用户启动/重启 dev server 或后端进程**，也不要用 `java -jar`/进程方式拉起任何服务。把"如何运行/验证"的命令交给用户自己执行。

## 仓库结构

```
src/
  pages/        Home（建/进房间）、Room（联机对局页，提示开关在此）、AIGame（人机对战页，路由 /ai）
  components/   Board / Cell / GameInfo / MoveHistory / StatsPanel / ThemeToggle / icons
  hooks/        usePolling、useBoardSound
  workers/      ai.worker.ts（AI 计算放 Web Worker，主线程不阻塞）
  utils/        gameLogic.ts（纯规则引擎，前后端共用）、ai.ts（AI 对手引擎：Minimax+剪枝、难度分级）、api.ts、player.ts、roomCode.ts（房间码生成/校验，前后端共用）、hints.ts（提示开关持久化，按模式分 key）、sound.ts / stats.ts / theme.ts
  test/         setup.ts（Vitest：jsdom + jest-dom）
  index.css     设计令牌 + 棋盘/棋子/提示样式
edge-functions/api/room/   服务端：create/join/[roomId]/{state,move,restart}
edge-functions/lib/        router.ts（镜像文件路由的最小路由器，测试用）、kv.ts、types.ts
server/mockApi.ts           Vite 中间件，本地免 EdgeOne 验证（复用 gameLogic + 内存 Map 当 KV）
e2e/                        Playwright 双窗口冒烟（room.spec.ts）
scripts/                    类型剥离自测脚本
docs/                       prd.md、deployment.md、ai-mode.md、competitive-analysis.md
edgeone.json                SPA fallback 配置
```

## 关键架构约束（改动前必读）

1. **Edge Functions 是 V8 runtime，不能 import npm 包。** 游戏规则等纯逻辑必须写在 `src/utils/gameLogic.ts`（零依赖纯 TS/JS），Edge Functions 跨目录 `import` 它复用；不要在 edge-functions 里引入第三方库。
2. **KV 仅 Edge Functions 可调用**，value 必须是字符串（JSON 序列化）；存在最终一致性（约数十秒延迟）。前端用 `currentTurn` + `updatedAt` 过滤陈旧数据（`Room.tsx` 的 `applyState`）。
3. **SPA 必须配 fallback**：`/room/:roomId` 刷新会 404，已由 `edgeone.json` 的 rewrite 处理；本地由 Vite 自带 history fallback 覆盖。
4. **本地免 EdgeOne 验证**：`server/mockApi.ts` 仅在 dev/preview 挂载，端点形状与 Edge Functions 一致（含错误码与脱敏行为，改任一侧必须同步另一侧）。用户只需 `npm run dev` 即可开两个浏览器窗口对弈。**Edge Functions 的测试要走真实路由层**：用 `edge-functions/lib/router.ts` 的 `routeRequest(method, url, env, body)` 按 URL 分派（镜像平台文件路由与 `[roomId]` 动态段提取），不要直接调 handler 函数绕过 `context.params`（曾因此测试绿但生产 join 路由坏）。
5. **落子提示（showHints）已解耦**：`Board` 中 `interactive`（可点击，按合法格）与 `isHint`（视觉，按合法格+开关）是两个独立集合。隐藏提示后棋盘仍需可点击——改提示逻辑时不要把它们重新绑死。`src/utils/hints.ts` 按模式分 localStorage key（联网默认关、solo/ai 默认开），并迁移旧全局键 `othello_show_hints`。
6. **playerId 兼作落子凭证，绝不外发**：所有 API 响应中的 `state.players` 必须经 `toPublicState()`（gameLogic.ts）把双方 playerId 置 null——`GET /state` 是无鉴权的，泄漏 playerId 等于把落子权交给任何拿到房间码的人。前端识别自己是哪一方用 `player.ts` 的房间颜色记忆（`rememberRoomColor`/`recallRoomColor`），不要依赖服务端回传。
7. **房间码统一走 `src/utils/roomCode.ts`**：生成用 WebCrypto（无则退回 Math.random）、校验 `isValidRoomId`（32 字符集、6 位）、URL 传入先 `normalizeRoomId`（trim+大写归一，非法返回 null → 400 invalid roomId）。Edge Functions 与 mockApi 两端必须共用，防行为漂移。

## 代码约定

- 纯逻辑下沉到 `src/utils`，单文件职责清晰；组件用专属 CSS 类（如 `is-interactive`/`is-hint`/`is-last`）而非散落的 Tailwind 背景类覆盖。
- 棋子用 CSS 圆形 + 内联 SVG 图标，**不用 emoji 图标**；避免紫粉渐变与 AI 模板味文案。
- 视觉令牌集中在 `src/index.css` 的 `:root`，禁止散落硬编码色值。

## 验证清单

- 改完跑 `npm run typecheck` 与 `npm test`（含核心算法 + Edge Functions 全流程测试 + 组件/页面/hook 测试）。
- 涉及前端交互（Board/Room/AIGame）改动：确认相关组件测试同步更新，必要时跑 `npm run test:e2e` 双窗口冒烟。
- 涉及提示/棋盘视觉：确认"关提示仍可落子"、最后落子标记（青色 `--last-move`）不与提示点（琥珀 `--hint`）混淆。
- 部署相关改动：提醒用户用 `edgeone makers dev`(8088) 或 `edgeone makers deploy` 在真实环境验证 KV 与 fallback（本环境无法联网验证）。
- 文档同步：改完代码后检查 `docs/`、`README.md`、`AGENTS.md` 是否有过时描述（文件/命令/接口/数据），同步更新或删除无效内容。
- **外部事实必须核验后入档**：写进 `docs/`、`README.md` 的任何外部仓库、版本号、数据，引用前须先核验其存在性与当前状态——首选 `gh api repos/<owner>/<repo>` 查存续与 `isFork`/`pushedAt`，读其 `package.json`/README 核验技术栈；无 `gh` 时用 GitHub MCP 或 web 检索代替。**曾因只检索未核验，把不存在的 `Captnjo/reversi` 写入竞品文档并引用 4 次。**
- **调研先发现、后核验**：两步不可合并——语义检索只负责扩大候选集，核验负责剔除不存在 / 已归档 / fork 的项。调研方法与通道选型见 `docs/competitive-analysis.md` 文末附录。

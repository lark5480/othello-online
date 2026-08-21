# AGENTS.md — 给 AI 编码代理的指引

黑白棋（Othello / Reversi）在线双人对战网页游戏。React + Vite 前端，EdgeOne Makers（原 EdgeOne Pages）的 Edge Functions + KV 作零成本后端，房间码对战、不注册。

## 技术栈

- 前端：React 18 + Vite 6 + TypeScript + Tailwind CSS v4（CSS-first，配置靠 `src/index.css` 的 `:root` 设计令牌，无 `tailwind.config.js`）。
- 后端：Edge Functions（V8 runtime）+ KV 存储；前端用轮询（`usePolling`）同步状态。
- 测试：Vitest（`npm test`）。
- 部署：EdgeOne Makers，构建 `npm run build` → 产物 `dist/`；支持 GitHub 自动部署或 `edgeone pages deploy`。

## 常用命令

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（含 mockApi 中间件，见下）
npm run build      # 生产构建到 dist/
npm run preview    # 预览构建产物
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

> 注意：**不要替用户启动/重启 dev server 或后端进程**，也不要用 `java -jar`/进程方式拉起任何服务。把"如何运行/验证"的命令交给用户自己执行。

## 仓库结构

```
src/
  pages/        Home（建/进房间）、Room（联机对局页，提示开关在此）、AIGame（人机对战页，路由 /ai）
  components/   Board / Cell / GameInfo / icons
  hooks/        usePolling
  utils/        gameLogic.ts（纯规则引擎，前后端共用）、ai.ts（AI 对手引擎：Minimax+剪枝、难度分级）、api.ts、player.ts、hints.ts（提示开关持久化）
  index.css     设计令牌 + 棋盘/棋子/提示样式
edge-functions/api/room/   服务端：create/join/[roomId]/{state,move,restart}
server/mockApi.ts           Vite 中间件，本地免 EdgeOne 验证（复用 gameLogic + 内存 Map 当 KV）
scripts/                    类型剥离自测脚本
docs/                       需求PRD.md、部署指南.md
edgeone.json                SPA fallback 配置
```

## 关键架构约束（改动前必读）

1. **Edge Functions 是 V8 runtime，不能 import npm 包。** 游戏规则等纯逻辑必须写在 `src/utils/gameLogic.ts`（零依赖纯 TS/JS），Edge Functions 跨目录 `import` 它复用；不要在 edge-functions 里引入第三方库。
2. **KV 仅 Edge Functions 可调用**，value 必须是字符串（JSON 序列化）；存在最终一致性（约数十秒延迟）。前端用 `currentTurn` + `updatedAt` 过滤陈旧数据（`Room.tsx` 的 `applyState`）。
3. **SPA 必须配 fallback**：`/room/:roomId` 刷新会 404，已由 `edgeone.json` 的 rewrite 处理；本地由 Vite 自带 history fallback 覆盖。
4. **本地免 EdgeOne 验证**：`server/mockApi.ts` 仅在 dev/preview 挂载，端点形状与 Edge Functions 一致。用户只需 `npm run dev` 即可开两个浏览器窗口对弈。**Edge Functions 的测试要走真实路由层**，不要直接调函数绕过 `context.params`（曾因此测试绿但生产 join 路由坏）。
5. **落子提示（showHints）已解耦**：`Board` 中 `interactive`（可点击，按合法格）与 `isHint`（视觉，按合法格+开关）是两个独立集合。隐藏提示后棋盘仍需可点击——改提示逻辑时不要把它们重新绑死。`src/utils/hints.ts` 的 `getDefaultShowHints(mode)` 预留了模式感知默认值（联网默认关、solo/ai 默认开）。

## 代码约定

- 纯逻辑下沉到 `src/utils`，单文件职责清晰；组件用专属 CSS 类（如 `is-interactive`/`is-hint`/`is-last`）而非散落的 Tailwind 背景类覆盖。
- 棋子用 CSS 圆形 + 内联 SVG 图标，**不用 emoji 图标**；避免紫粉渐变与 AI 模板味文案。
- 视觉令牌集中在 `src/index.css` 的 `:root`，禁止散落硬编码色值。

## 验证清单

- 改完跑 `npm run typecheck` 与 `npm test`（含核心算法 + Edge Functions 全流程测试）。
- 涉及提示/棋盘视觉：确认"关提示仍可落子"、最后落子标记（青色 `--last-move`）不与提示点（琥珀 `--hint`）混淆。
- 部署相关改动：提醒用户用 `edgeone pages dev`(8088) 或 `edgeone pages deploy` 在真实环境验证 KV 与 fallback（本环境无法联网验证）。

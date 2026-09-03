# 黑白棋（Othello）在线对战游戏 — 产品需求文档（PRD）

> 注：本文撰写时平台名为 **EdgeOne Pages**（旧称），已于 2026-06 品牌升级为 **EdgeOne Makers**，功能、架构与部署方式不变。正文除本处说明外统一使用新名，CLI 命令统一为 `edgeone makers ...`；部署细节以《deployment.md》为准。

---

## 一、产品概述

| 项目 | 内容 |
|------|------|
| 产品名称 | Othello Online（黑白棋在线对战） |
| 产品类型 | 双人回合制策略棋类网页游戏 |
| 部署平台 | 腾讯云 EdgeOne Makers |
| 目标 | 两人通过房间码在线对战，无需注册，即开即玩 |

---

## 二、目标用户

- 想和朋友在线下棋的休闲玩家
- 黑白棋爱好者
- 不需要注册/登录，降低使用门槛

---

## 三、核心功能需求

### 3.1 游戏核心玩法

| 编号 | 功能 | 描述 | 优先级 |
|------|------|------|--------|
| G-01 | 棋盘展示 | 8×8 棋盘，显示黑白棋子、可落子提示 | P0 |
| G-02 | 落子 | 点击合法位置落子（注意 KV 无事务，靠 currentTurn 校验缓解并发，见 5.4） | P0 |
| G-03 | 翻转动画 | 被夹住的棋子翻转，带翻转动画 | P0 |
| G-04 | 合法落子提示（可配置） | 可落子位置高亮，联网对战默认关闭，提供「显示落子提示」开关并持久化到 localStorage；未来练习/AI 模式可默认开启 | P0 |
| G-05 | 跳过回合 | 无合法落子时自动跳过，提示对方 | P0 |
| G-06 | 胜负判定 | 双方均无法落子或棋盘满时判定胜负 | P0 |
| G-07 | 棋子计数 | 实时显示双方棋子数量 | P1 |
| G-08 | 最后落子标记 | 标记对方最后一步落子位置 | P1 |

### 3.2 房间系统

| 编号 | 功能 | 描述 | 优先级 |
|------|------|------|--------|
| R-01 | 创建房间 | 生成 6 位房间码（生成时需校验 KV 中是否已存在，冲突则重试） | P0 |
| R-02 | 加入房间 | 输入房间码加入 | P0 |
| R-03 | 等待状态 | 房主创建后等待对方加入 | P0 |
| R-04 | 房间状态 | 等待中 / 对局中 / 已结束 | P0 |
| R-05 | 断线重连 | 刷新页面后可用 localStorage 的 playerId 重新 GET state 进入；需处理「重连时房间已被对方推进/已结束」的边界展示 | P1 |
| R-06 | 再来一局 | 对局结束后可重新开始 | P1 |

### 3.3 对局交互

| 编号 | 功能 | 描述 | 优先级 |
|------|------|------|--------|
| I-01 | 回合提示 | 显示"轮到你"/"等待对方" | P0 |
| I-02 | 对方落子同步 | 轮询获取对方最新落子 | P0 |
| I-03 | 对局结束弹窗 | 显示胜负结果 + 棋子数 | P0 |
| I-04 | 悔棋请求 | 发起悔棋，对方同意则撤回（可选） | P2 |

---

## 四、页面结构

```
/                  → 首页（创建房间 / 加入房间 / 人机对战入口）
/room/:roomId      → 游戏房间页（棋盘 + 状态）
/ai                → 人机对战页（棋盘 + AI 对手，离线单机）
```

共 **3 个页面**，保持极简。

> ⚠️ `/room/:roomId` 是前端路由（SPA）。EdgeOne Makers 不会自动把未知路径回退到 `index.html`，**直接刷新或深链会 404**。必须配置 SPA fallback（见 10.4）。

---

## 五、技术架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────┐
│              EdgeOne Makers                      │
│                                                  │
│  ┌────────────┐         ┌────────────────────┐  │
│  │  前端 SPA   │  HTTP   │  Edge Functions    │  │
│  │  (React)   │◄──────►│  (游戏逻辑 API)    │  │
│  └────────────┘         └─────────┬──────────┘  │
│                                   │              │
│                          ┌────────▼─────────┐   │
│                          │   KV 存储         │   │
│                          │  (游戏状态)       │   │
│                          └──────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 5.2 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | React + Vite | 轻量快速 |
| UI 样式 | Tailwind CSS v4 | 用 `@tailwindcss/vite` 插件，无需 config 文件 |
| 后端逻辑 | EdgeOne Edge Functions（V8 runtime） | 处理游戏逻辑；KV 仅能在 Edge Functions 中调用 |
| 数据存储 | EdgeOne KV | 存房间和游戏状态（需控制台申请开通并绑定） |
| 状态同步 | 轮询（Polling） | `waiting` 3s / `playing` 2s / `finished` 5s 拉取最新状态；**自己回合不轮询**（`Room.tsx`: `pollEnabled = !myTurn`） |
| 部署 | EdgeOne Makers | 前端 + 函数一体部署 |

> 关于 Edge Functions vs Node Functions：EdgeOne Makers 提供两种函数。
> - **Edge Functions**（边缘节点，V8 runtime）：超低延迟、有 KV，但**不支持 WebSocket、不支持 npm 包**。
> - **Node Functions / Cloud Functions**（云服务器，Node.js）：支持 WebSocket、完整 npm，但**无 KV**，需接外部数据库。
>
> 本项目用 **Edge Functions + KV**：零成本、无需外部数据库，且回合制轮询体验足够。若日后要真·实时，再评估 Node Functions + 数据库方案。

### 5.3 为什么用轮询而不是 WebSocket？

Edge Functions **不支持 WebSocket**（但 Node Functions 支持，见 5.2）。本项目选轮询不是因为"平台整体不支持 WebSocket"，而是因为：

1. 用 Edge Functions 才能用 KV，避免引入外部数据库；
2. 回合制游戏 2~3 秒轮询完全够用，体验无感知差异；
3. 轮询实现简单、零成本，契合"即开即玩"目标。

> 若未来追求真·实时（落子即时同步），可改用 Node Functions（支持 WebSocket）+ 外部数据库，代价是复杂度与成本上升。

### 5.4 Edge Functions 运行时与 KV 限制（编码前必读）

这些约束 PRD 原版未写明，但直接影响实现，务必遵守：

| 项 | 限制 / 说明 |
|----|------------|
| 运行时 | V8（类 Cloudflare Workers），**只能用标准 Web API**（Response / Request / fetch），**不能 `require`/引入 npm 包** |
| 代码包大小 | ≤ 5 MB（游戏逻辑纯 JS 足够） |
| CPU 时间 | ≤ 200 ms / 请求；请求体 ≤ 1 MB（棋盘数据极小，绰绰有余） |
| KV 调用范围 | **仅 Edge Functions 可调用 KV**（Node Functions 无 KV） |
| KV value 类型 | **只能是字符串**，对象必须 `JSON.stringify` 存、`JSON.parse` 取 |
| KV 一致性 | **最终一致性，60s 内全球同步**。双人对战时若两人被路由到不同边缘节点，读方可能看到最多数十秒旧棋盘 → 逻辑/体验风险 |
| KV 开通 | 需控制台**申请开通**（限量配额）→ 建命名空间 → 绑定项目变量名（如 `OTHELLO_KV`），代码用 `context.env.OTHELLO_KV` |
| KV 容量 | 账户容量 100MB、命名空间上限 10 个（本项目绰绰有余） |

**一致性风险缓解**：
- 落子接口强制校验 `currentTurn` 是否为当前玩家（PRD 7.1 已有）；
- state 中维护 `updatedAt`（或版本号），客户端轮询时比对，发现陈旧不误判；
- 休闲场景（两人同区域）通常秒级同步，可接受；介意则改 Node Functions + 强一致数据库。

**并发落子边界**：KV 无事务。极端情况下两个请求读同一份旧棋盘可能双写，靠 `currentTurn` 校验已能缓解大部分，标记为已知低风险。

---

## 六、数据结构设计

### 6.1 房间状态（KV 存储）

```json
{
  "roomId": "A3F8K2",
  "status": "playing",        // waiting | playing | finished
  "board": [
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,2,0,0,0],
    [0,0,0,2,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0]
  ],
  "currentTurn": "black",     // black | white
  "players": {
    "black": null,            // 对外响应恒为 null（见 6.2）；playerId 仅存于 KV
    "white": null
  },
  "moveCount": 4,
  "lastMove": { "row": 2, "col": 3 },
  "winner": null,             // null | "black" | "white" | "draw"
  "createdAt": 1700000000,
  "updatedAt": 1700000000
}
```

> `0` = 空，`1` = 黑，`2` = 白。
> KV 的 value 必须是字符串，存储时 `await kv.put(roomId, JSON.stringify(state))`，读取时 `JSON.parse(await kv.get(roomId))`。

### 6.2 玩家身份

不注册不登录，用浏览器 `localStorage` 生成一个随机 `playerId`（WebCrypto，`p_` + 16 字符），加入房间时绑定。断线后凭同一 `playerId` 重连（见 R-05）。

**凭证不外发**：playerId 兼作落子凭证，而 `GET /state` 无鉴权（任何拿到房间码的人都能观战）。因此所有 API 响应里的 `state.players` 恒为 `{ black: null, white: null }`（`toPublicState` 脱敏）；真实 playerId 只存在 KV 中供服务端校验。前端识别自己是黑/白方，靠本地房间颜色记忆（create→黑、join→白，`player.ts` 的 `rememberRoomColor`）。

房间码规则：32 字符集（去掉易混的 0/O/1/I）、6 位；URL/输入框传入先大写归一（小写等价），格式非法返回 `400 invalid roomId`。

---

## 七、API 设计

Edge Functions 是**文件路由**：URL 路径由 `edge-functions/` 目录结构生成，动态段用 `[xxx].ts`，全匹配用 `[[default]].ts`。每个文件默认导出 `onRequest(context)`，可按方法导出 `onRequestGet` / `onRequestPost` 等。

| 方法 | 路径 | 对应文件 | 说明 | 请求体 |
|------|------|----------|------|--------|
| POST | `/api/room/create` | `edge-functions/api/room/create.ts` | 创建房间 | `{ playerId }` |
| POST | `/api/room/join` | `edge-functions/api/room/join.ts` | 加入房间 | `{ roomId, playerId }` |
| GET | `/api/room/:roomId/state` | `edge-functions/api/room/[roomId]/state.ts` | 获取房间状态（轮询） | — |
| POST | `/api/room/:roomId/move` | `edge-functions/api/room/[roomId]/move.ts` | 落子 | `{ playerId, row, col }` |
| POST | `/api/room/:roomId/restart` | `edge-functions/api/room/[roomId]/restart.ts` | 再来一局 | `{ playerId }` |

### 7.1 落子接口逻辑（Edge Functions 真实形态）

```ts
// edge-functions/api/room/[roomId]/move.ts
export async function onRequestPost(context: EventContext) {
  const kv = context.env.OTHELLO_KV;            // 绑定的 KV 命名空间（变量名）
  const roomId = context.params.roomId;          // 动态路由参数
  const { playerId, row, col } = await context.request.json();

  const raw = await kv.get(roomId);
  if (!raw) return json({ error: 'room not found' }, 404);
  const state = JSON.parse(raw);                 // KV 值是字符串，需 parse

  // 1. 校验房间状态
  if (state.status !== 'playing') return json({ error: 'not playing' }, 409);
  // 2. 校验是否是当前回合的玩家
  if (state.players[state.currentTurn] !== playerId)
    return json({ error: 'not your turn' }, 409);
  // 3. 校验落子位置是否合法（能翻转至少一颗对方棋子）
  if (!isValidMove(state.board, row, col, state.currentTurn))
    return json({ error: 'invalid move' }, 400);
  // 4. 执行翻转
  applyMove(state, row, col, state.currentTurn);
  // 5. 判断对方是否有合法落子
  const opponent = state.currentTurn === 'black' ? 'white' : 'black';
  if (hasAnyValidMove(state.board, opponent)) {
    state.currentTurn = opponent;                // 切换回合
  } else if (hasAnyValidMove(state.board, state.currentTurn)) {
    // 对方跳过，保持当前回合
  } else {
    state.status = 'finished';                   // 双方都无子可下，结束
    state.winner = decideWinner(state.board);
  }
  state.lastMove = { row, col };
  state.updatedAt = Date.now();
  // 6. 写回 KV（value 必须字符串）
  await kv.put(roomId, JSON.stringify(state));
  // 7. 返回最新棋盘状态
  return json(state);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
}
```

> 游戏逻辑（合法判定 / 翻转 / 胜负）写成纯 TS/JS 模块，**不能引第三方 npm 库**；可放在 `src/` 下与前端共用，或函数目录内 `import` 普通 `.ts` 模块。

---

## 八、前端页面设计

### 8.1 首页

```
┌──────────────────────────────┐
│                              │
│        ♟ Othello Online      │
│                              │
│   [ 创建房间 ]               │
│   [ 人机对战 ]               │
│                              │
│   房间码: [______] [加入]    │
│                              │
└──────────────────────────────┘
```

### 8.2 游戏页

```
┌──────────────────────────────┐
│  房间: A3F8K2    [复制]      │
│                              │
│  ⚫ 黑: 12    ⚪ 白: 8       │
│                              │
│  ┌─────────────────────┐    │
│  │                     │    │
│  │      8×8 棋盘        │    │
│  │   (可落子提示：可在设置中开关，默认关闭)    │    │
│  │                     │    │
│  └─────────────────────┘    │
│                              │
│  ● 轮到你落子（黑棋）        │
└──────────────────────────────┘
```

### 8.3 结束弹窗

```
┌──────────────────────────────┐
│       🎉 游戏结束！           │
│                              │
│    ⚫ 黑棋 38 : 26 白棋 ⚪   │
│                              │
│       黑棋获胜！              │
│                              │
│   [ 再来一局 ]  [ 返回首页 ]  │
└──────────────────────────────┘
```

---

## 九、游戏核心算法

### 9.1 合法落子判断

```
对于空位 (row, col)，检查 8 个方向：
  上、下、左、右、左上、右上、左下、右下

每个方向上：
  1. 紧邻的必须是对方棋子
  2. 继续沿该方向走，必须是连续的对方棋子
  3. 最终遇到己方棋子 → 合法，中间全部翻转
  4. 遇到空位或边界 → 该方向不合法

任一方向合法 → 该位置可落子
```

### 9.2 翻转执行

```
落子后，对所有合法方向：
  将该方向上连续的对方棋子全部改为己方颜色
```

---

## 十、部署方案（EdgeOne Makers）

### 10.1 项目结构

```
othello-online/
├── src/                    # React 前端（Vite 构建到 dist/）
│   ├── pages/
│   │   ├── Home.tsx        # 首页
│   │   ├── Room.tsx        # 游戏页（联机）
│   │   └── AIGame.tsx     # 人机对战页（/ai，离线单机）
│   ├── components/
│   │   ├── Board.tsx       # 棋盘组件
│   │   ├── Cell.tsx        # 格子组件
│   │   └── GameInfo.tsx    # 状态信息
│   ├── hooks/
│   │   └── usePolling.ts   # 轮询 Hook
│   └── utils/
│       └── gameLogic.ts    # 前端展示用逻辑（与函数端共用纯 JS 逻辑）
├── edge-functions/         # Edge Functions（V8 runtime，可调用 KV）
│   └── api/
│       ├── room/
│       │   ├── create.ts
│       │   ├── join.ts
│       │   ├── [roomId]/
│       │   │   ├── state.ts
│       │   │   ├── move.ts
│       │   │   └── restart.ts
│       │   └── [[default]].ts   # 可选 catch-all（SPA fallback 方案二）
├── edgeone.json            # EdgeOne 项目配置（重定向/重写，CLI 自动生成）
├── package.json
└── vite.config.ts          # 含 @tailwindcss/vite 插件
```

> 函数目录是 **`edge-functions/`**（不是 Cloudflare 的 `functions/`）。配置文件是 **`edgeone.json`**（不是 `edgeone.pages.json`）。

### 10.2 部署步骤

```bash
# 1. 初始化项目（React + TypeScript）
npm create vite@latest othello-online -- --template react-ts
cd othello-online

# 2. 安装依赖（Tailwind CSS v4 推荐用 Vite 插件，无需 config 文件）
npm install
npm install tailwindcss @tailwindcss/vite
# vite.config.ts 中加上 @tailwindcss/vite 插件，src/index.css 里 @import "tailwindcss";

# 3. 安装 EdgeOne CLI（本地联调 + 部署）
npm install -g edgeone

# 4. 开发调试（前端 + 函数统一在 http://localhost:8088，支持热更新）
#    本地要用 KV，需先关联项目：edgeone makers link
edgeone makers dev

# 5. 部署到 EdgeOne Makers（二选一，详见《deployment.md》）
#    方式 A：GitHub 仓库连接 → 控制台配置构建命令 npm run build / 输出 dist → 自动构建部署
#    方式 B：CLI 手动部署
edgeone makers deploy . -n othello-online
```

### 10.3 轮询策略

| 场景 | 轮询间隔 | 说明 |
|------|----------|------|
| 等待对方加入 | 3 秒 | 低频 |
| 等待对方落子 | 2 秒 | 中频 |
| 自己回合 | 不轮询 | 无需 |
| 游戏结束 | 5 秒 | 低频轮询：对手点「再来一局」后本端自动恢复，无需手动刷新 |

### 10.4 SPA fallback（必须配置，否则 /room/:roomId 刷新 404）

EdgeOne Makers 不会自动把未知前端路由回退到 `index.html`，需二选一：

**方案 A（推荐）：`edgeone.json` 重写**
```json
{
  "redirects": [],
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html", "has": { "type": "header", "key": "accept", "value": "text/html" } }
  ]
}
```
（仅对 HTML 请求回退；静态资源如 `/assets/*.js` 不受影响）

**方案 B：catch-all 函数** `edge-functions/[[default]].ts` 返回 `index.html` 内容（注意与 `/api/*` 路由不冲突）。

---

## 十一、里程碑排期

| 阶段 | 内容 | 预估时间 |
|------|------|----------|
| **M1** | 棋盘渲染 + 本地落子逻辑（单机可玩） | 1 天 |
| **M2** | Edge Functions + KV 存储 + 房间创建/加入 | 1 天 |
| **M3** | 轮询同步 + 双人对战跑通 | 0.5 天 |
| **M4** | UI 美化 + 翻转动画 + 结束弹窗 | 0.5 天 |
| **M5** | 部署上线 + 测试 | 0.5 天 |
| **总计** | | **约 3~4 天** |

---

## 十二、后续可扩展（P2）

- [x] AI 对战模式（Minimax + 迭代加深，难度分级：简单/中等/困难/大师；引擎 `src/utils/ai.ts`，Web Worker 异步计算 `src/workers/ai.worker.ts`，离线单机，详见《ai-mode.md》）
- [x] 落子预览（ghost disc + 翻转高亮）：hover 合法格显示半透明己方棋子和将被翻转的棋子脉冲描边
- [x] 暗色模式：`prefers-color-scheme` 自动切换设计令牌，全部组件通过语义化 CSS 类适配
- [x] 程序化音效：Web Audio 合成落子/翻转/胜负短音（零音频文件），`othello_sound` 静音开关默认开
- [x] 走子历史侧栏：`MoveHistory` 展示当前对局走子序列（Room 与 AIGame 均接入）
- [x] 本地战绩：按难度记录胜/负/和局与最大子差（`othello_stats`，人机对战）
- [x] CI：GitHub Actions 自动跑 typecheck + 单测 + Playwright 双窗口 E2E（push/PR 触发）
- [ ] 观战功能
- [ ] 对局回放
- [ ] 落子提示说明：提示为客户端视觉辅助，按设备持久化；若需全局一致的辅助（如房间级 assist 开关）需服务端字段。**solo/AI 模式默认开启提示（见 `getDefaultShowHints`），联网对战默认关闭以保公平。**
- [ ] 排行榜（接外部数据库）
- [ ] 自定义棋盘大小（6×6 / 10×10）
- [ ] 聊天功能

---

## 附：相对原版的主要修正（评审记录）

1. 函数目录 `functions/` → `edge-functions/`（EdgeOne 文件路由约定，KV 仅 Edge Functions 可用）
2. 配置文件 `edgeone.pages.json` → `edgeone.json`
3. WebSocket 说法修正：Edge Functions 不支持、Node Functions 支持；本项目选轮询是为零成本 + KV 简单
4. 新增 5.4：Edge Functions V8 无 npm、KV 字符串值、最终一致性 60s、需申请开通等约束与一致性风险缓解
5. 新增 10.4：SPA fallback 配置（避免刷新 404）
6. API 路由改为文件路由映射，7.1 落子逻辑改为真实 Edge Functions 形态
7. R-01 房间码冲突重试、R-05 重连边界、G-02 并发落子风险、Tailwind v4 安装方式等补强

> 修正后的 PRD 可直接作为开发依据。需要我接下来帮你生成具体的代码吗？可以从棋盘组件或 Edge Functions 开始。

# 现状架构文档

> 本文是**从代码反向梳理**的现状记录，不是 PRD 重写，也不是目标架构设计。
> 梳理时间：2026-10-12，代码基线：`src/` 5 498 行 TS/TSX（44 个文件）。
> 全部结论附文件:行号，可逐条复核。

---

## 1. 系统概览

一个「零资产、无常驻后端」的两人黑白棋在线对弈应用，同时提供本地人机对战。

- **前端**：React 18 + Vite 6 + TypeScript + Tailwind v4（CSS-first，无 PostCSS 配置），3 条路由
- **后端**：EdgeOne Makers Edge Functions（V8 isolate）+ 平台 KV 绑定，共 5 个端点
- **同步**：HTTP 轮询（2 s），无 WebSocket / SSE / 长连接
- **运行时依赖**：3 个（react / react-dom / react-router-dom），无其他
- **资产**：0 音频 / 0 位图 / 0 字体文件 / 0 SVG 文件；音效 Web Audio 合成，棋子与棋盘纯 CSS
- **测试**：126 个单测/组件测试（vitest + jsdom）+ Playwright 双窗口 E2E 冒烟

---

## 2. 模块分层

```
┌──────────────────────────────────────────────────────────────┐
│ L4  页面层（路由容器：持有状态、编排副作用）                    │
│     Home.tsx(126)   Room.tsx(369)   AIGame.tsx(480)          │
└──────────────────────────────────────────────────────────────┘
                              │ props / 回调
┌──────────────────────────────────────────────────────────────┐
│ L3  组件层（纯展示，尽量无状态）                               │
│     Board(99) ─ Cell(99)    GameInfo(120)   MoveHistory(127)  │
│     StatsPanel(48)  ThemeToggle(41)   icons(103, 内联 SVG)     │
└──────────────────────────────────────────────────────────────┘
                              │ 读派生 / 调 actions
┌──────────────────────────────────────────────────────────────┐
│ L2  Hook 层（跨组件复用的有状态逻辑）                            │
│     usePolling(53) ── 轮询调度               useBoardSound(58)│
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│ L1  能力层（无状态 / 局部状态；浏览器专用）                     │
│     api.ts(88)        网络请求封装 + ApiError                │
│     player.ts(45)     playerId 与房间颜色的 localStorage 持久化│
│     stats.ts(64)      本地战绩（仅人机模式）                    │
│     sound.ts(139)     Web Audio 合成 + 静音开关               │
│     hints.ts(43)      落子提示开关（按设备+模式持久化）           │
│     theme.ts(19)      主题偏好                                │
│     roomCode.ts(34)   房间码生成与校验（含随机源）               │
│     coords.ts(11)     坐标 → 人类可读标签（A1/B2）              │
│     ai.ts(338)        AI 引擎（easy/medium/hard/master）        │
│     workers/ai.worker.ts(17)  Worker 薄壳（转发到 ai.ts）       │
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│ L0  领域核心（零依赖、纯函数、运行环境中立）★ 前后端共用 ★        │
│     src/utils/gameLogic.ts(328)                              │
│     棋盘规则 · 翻转 · 跳过 · 胜负 · 房间状态转移 · toPublicState │
└──────────────────────────────────────────────────────────────┘
                              ▲
┌──────────────────────────────────────────────────────────────┐
│ 后端传输层（仅 Edge 侧）                                        │
│     edge-functions/types.ts(20)      手写最小运行时类型          │
│     edge-functions/lib/http.ts(15)   json() / error()          │
│     edge-functions/lib/kv.ts(51)     getKV / getState / putState │
│     edge-functions/lib/router.ts(74) 镜像平台文件路由（仅测试用）│
└──────────────────────────────────────────────────────────────┘
                              │
┌──────────────────────────────────────────────────────────────┐
│ 端点层（5 个 handler，文件目录即路由）                           │
│     create.ts(41)  join.ts(42)  state.ts(19)                  │
│     move.ts(55)    restart.ts(42)                            │
└──────────────────────────────────────────────────────────────┘

开发期（不进生产构建，vite.config.ts:11-22 挂中间件）
┌──────────────────────────────────────────────────────────────┐
│     server/mockApi.ts(137)  内存 Map 版 /api，与 L0 同源          │
└──────────────────────────────────────────────────────────────┘
```

**分层中最重要的一条边界**：**L0 是唯一被前后端共享的层**（`edge-functions/api/room/create.ts:4` 跨目录 import `../../../src/utils/gameLogic`）。这条边界的成立条件是 L0 保持运行环境中立 —— 不碰 DOM、不读 `window`、不用 `performance.now()`。详见 [ADR-0001](adr/ADR-0001-shared-rules-engine.md)。

**注意 `lib/router.ts` 不是生产代码**：`:1-9` 的注释说明它是「镜像 EdgeOne Makers 文件路由的最小路由器」，存在的唯一原因是「曾因此出现『测试绿但生产 join 路由坏』」——即让测试通过 URL + method 走一遍与平台一致的分派逻辑。它不被任何端点 import，只被 `router.test.ts` 与 `flow.test.ts` 使用。

---

## 3. 关键数据流

### 3.1 一次落子：从点击到对方可见的完整链路

这是本作最重要的数据流。以「黑方在 `/room/ABC123` 落子」为例：

```
① 渲染门控
   Room.tsx:72-73   myTurn = status==='playing' && myColor==='black' && currentTurn==='black'
   Room.tsx:280     <Board interactive={!!myTurn} />
   → Board.tsx:33-39  legalSet（仅 interactive 时填充）
   → Board.tsx:76     isLegal → Cell.tsx:64  disabled={!interactive}
   → 即：非我方回合，64 格全部 disabled，物理上不可点

② 用户点击（浏览器）
   Cell.tsx:65      <button onClick={onClick}>
   → Board.tsx:92   onClick={() => onMove(r, c)}
   → Room.tsx:283   onMove={handleMove}
   → Room.tsx:127   守卫：!state || busy || !myTurn → return（防双击）

③ 客户端前置计算（本地，纯函数，<1ms）
   Room.tsx:131     postMove(roomId, playerId, row, col, state.updatedAt)
                    ↑ 携带当前所见状态的版本戳（乐观并发，见 ADR-0002）

④ 网络
   api.ts:70-75     fetch POST /api/room/ABC123/move
                    body: {playerId, row, col, expectedUpdatedAt}

⑤ Edge Function（V8 isolate）
   move.ts:12       normalizeRoomId('ABC123') → 校验 6 位 + 字符集
   move.ts:21-25    解析 JSON body
   move.ts:28-35    类型校验 playerId/row/col
   move.ts:37       getState(kv, roomId)          ← KV 读
   move.ts:43-48    乐观并发：state.updatedAt !== expectedUpdatedAt → 409
   move.ts:50       applyMoveToState(state, playerId, row, col)   ← 与前端同一函数（L0）
                      gameLogic.ts:254  status !== 'playing' → 409
                      gameLogic.ts:258  players[currentTurn] !== playerId → 409 'not your turn'
                      gameLogic.ts:262  整数 + 范围校验 → 400
                      gameLogic.ts:272  isValidMove → 400
                      gameLogic.ts:283-290 回合切换 / 跳过 / 终局判定
   move.ts:53       putState(kv, res.state)       ← KV 写（带 24h TTL）
   move.ts:54       json({state: toPublicState(res.state)})  ← 脱敏

⑥ 发起方 UI 更新（网络 RTT 量级，几十 ms）
   Room.tsx:132     applyState(ns)
   Room.tsx:44-49   if (s.updatedAt >= lastAt.current) → setState
   → Board 重渲染 64 格
   → Cell.tsx:28-41 检测到旧色→新色 → setFlip(true) → 播放 disc-flip-anim（0.36s rotateY）
   → GameInfo.tsx:26 countStones 重算比分；:76 进度条 width 过渡 0.35s
   → MoveHistory.tsx:32-34 moveCount 增加 → 追加一条记录
   → useBoardSound.ts:51 moveCount 净增 → playPlace()

⑦ 对方端（被动，最长 2 s）
   Room.tsx:94-96   对手回合 pollEnabled=true, pollInterval=2000
   usePolling.ts:38-43  串行循环：await refresh() → setTimeout(下一轮)
   api.ts:59        fetch GET /api/room/ABC123/state
   state.ts:15-18   getState → json({state: toPublicState(state)})
   Room.tsx:111     applyState(polledState)  ← 同一套更新路径
   → 棋盘/比分/记录/音效 全部同上

⑧ 冲突分支（若⑤中 409）
   Room.tsx:134-141 catch 409/400 → 重新 getRoomState → applyState
   → 棋盘刷新，用户重新落子
```

**延迟分解**：

| 段 | 耗时 | 是否阻塞 UI |
|---|---|---|
| ①②③ 点击 + 本地前置计算 | < 1 ms | 否 |
| ④→⑤→⑥ 网络 RTT + KV 读写 + 规则计算 | 数十 ms（**估算，未实测**） | **是**（`busy` 期间禁用落子） |
| ⑦ 对方端可见 | 平均 ~1 s，最坏 2 s + RTT（**待人工验证**） | 否 |

关键设计：**⑥ 不等轮询**。`move.ts:54` 的响应直接携带新状态，因此自己的落子是 RTT 量级而非 2 s 量级。只有对方需要等轮询。

### 3.2 AI 回合数据流（人机模式）

```
① AIGame.tsx:116-119  effect 检测：status==='playing' && currentTurn===aiColor
② AIGame.tsx:120      thinkingRef.current 守卫（防重入）
③ AIGame.tsx:123-124  setThinking(true) → GameInfo 显示「AI 思考中…」
④ AIGame.tsx:126      人工延迟 450 + random*350 ms（体验节奏，非性能需要）
⑤ AIGame.tsx:127      currentRequestId = ++requestIdRef.current
⑥ AIGame.tsx:152-157  worker.postMessage({id, board, aiPlayer, difficulty})
                       ↑ 整块棋盘结构化克隆到 Worker
⑦ ai.worker.ts:11-14  chooseAIMove(board, aiPlayer, difficulty)  ← 同步搜索
                       ai.ts:279-298 迭代加深 + 时间预算（hard 800ms / master 1500ms）
                       ↑ 主线程在此期间完全空闲（UI 60fps）
⑧ Worker → 主线程     postMessage({id, move})
⑨ AIGame.tsx:147      if (e.data.id !== currentRequestId) return   ← 丢弃过期响应
⑩ AIGame.tsx:148      removeEventListener（一次性监听器）
⑪ AIGame.tsx:136-140 setState(applyMoveToState(prev, ...))  ← 复用 L0，与联网同一规则
⑫ AIGame.tsx:141-142  thinkingRef=false, setThinking(false)
```

**Worker 不可用时**（`AIGame.tsx:158-161`）：在 ④ 的人工延迟之后于主线程同步调用 `chooseAIMove` —— 不会有"点击瞬间卡死"，但 master 会有一次约 1.5 s 的主线程阻塞。详见 [ADR-0004](adr/ADR-0004-ai-in-web-worker.md)。

### 3.3 状态的三条来源与收敛

前端 `state` 有三个写入来源，全部收敛到 `applyState`（`Room.tsx:44-49`）：

| 来源 | 触发 | 路径 |
|---|---|---|
| 首次加载 | `useEffect` 挂载 | `Room.tsx:54-56` → `applyState` |
| 自己的写操作 | 落子 / 再来一局 | `Room.tsx:132` / `:156` → `applyState` |
| 轮询 | 每 2 s / 3 s / 5 s | `Room.tsx:111` → `applyState` |

**收敛规则**：`applyState` 用 `if (s.updatedAt >= lastAt.current)` 单调过滤（`Room.tsx:45`），`lastAt` 是跨渲染的 ref（`:27`）。因此**陈旧响应不会让 UI 倒退**。这是 KV 可能最终一致下的关键防线（ADR-0002 §决策-4）。

同时 `usePolling` 关闭了「自己回合」的轮询（`Room.tsx:95` `pollEnabled = !myTurn`），避免了「自己刚下的子被下一轮轮询覆盖回去」的可能（虽然 `>=` 过滤已能挡住，但省掉这轮请求更省）。

---

## 4. 已识别的架构风险清单

按 **严重 / 中等 / 低** 分级。「严重」在本项目语境下指会导致安全漏洞、对局数据错误或功能不可用。

### 严重

**当前无「严重」级风险。**

三项在审计初期被怀疑为严重的项，经逐行核验后判定为**不成立**，记录如下以免后续重复排查：

| 疑似风险 | 核验结论 |
|---|---|
| playerId 经 API 泄漏 → 可冒充对局双方 | ❌ **不成立**。`toPublicState`（`gameLogic.ts:312-314`）把 `players` 全置 null；在全部 5 个端点、6 个返回分支上 100% 生效（逐行核验：`create.ts:40`、`join.ts:39`、`join.ts:41`、`state.ts:18`、`move.ts:54`、`restart.ts:41`）。所有错误分支走 `http.ts:13-15`，只返回 `{error}` |
| `GET /state` 无鉴权导致状态外泄 | ❌ **不成立**。暴露的仅是公开观战信息（棋盘/回合/胜负），观战本就是设计意图（`GameInfo.tsx:34` 显式支持"观战中"）。房间码空间 `32^6 ≈ 10.9 亿`（`roomCode.ts:7`），不可枚举 |
| 落子越界导致服务端崩溃 | ❌ **不成立**。`gameLogic.ts:262-271` 校验整数 + 范围，且注释记录了这是一个真实踩过的坑（`board[3.5]` 为 undefined，再取列会抛 TypeError） |

### 中等

#### M1 · 乐观并发只覆盖 `move`，`join` 存在静默踢人竞态

- **位置**：`edge-functions/api/room/[roomId]/join.ts:36-40`
- **现象**：两个客户端几乎同时 join 同一房间，双方都读到「白方空位」，都执行 `joinState` + `putState`，**后写者覆盖先写者**。先到的玩家被踢出，且其客户端仍以为自己已加入（`join.ts:39` 已返回成功）。
- **触发条件**：房间码被分享给第三方，或两人同时输入同一码。中等概率（需并发而非串行，但 KV 网络延迟使窗口不小）。
- **对照**：`move` 有 `expectedUpdatedAt` 校验（`move.ts:43-48`），`join` 没有。
- **修法**：`join` 也接受并校验 `expectedUpdatedAt`（约 10 行，与 `move` 同构）。
- **判定**：真实缺陷，但影响可恢复（被踢者下次 join 会拿到 `room full`，UI 提示"房间已满"，`Home.tsx:57`）。**本轮不修，记入技术债。**

#### M2 · `updatedAt` 为毫秒精度，同毫秒内的两次写入可绕过乐观并发

- **位置**：`gameLogic.ts:212`（`now = Date.now()` 的默认参数）
- **现象**：若两次 read-modify-write 落在同一毫秒内完成，`expectedUpdatedAt` 校验会通过（值相等），覆盖仍然发生。
- **触发条件**：需两次写都在 1 ms 内完成网络往返到同一 KV。**概率极低**，且严格回合制（`gameLogic.ts:254-260`）已把并发窗口压到极小。
- **修法**：改用单调递增计数器（`state.version += 1`）而非时间戳。约 5 行，但会与 `Room.tsx:45` 的过滤逻辑耦合（需同步改）。
- **判定**：理论漏洞，**本轮不修，记入技术债。**

#### M3 · 无 CSP / 无安全响应头

- **位置**：`index.html:1-13`（无 meta CSP）、`edge-functions/lib/http.ts:3-11`（只设 `Content-Type` 与 `Cache-Control`）、`edgeone.json`（SPA fallback `rewrites` + 两条 `Cache-Control` `headers`；**仍无** `X-Frame-Options` / `X-Content-Type-Options` / CSP）
- **暴露**：`X-Frame-Options` / `X-Content-Type-Options` / CSP 均缺失。
- **实际风险**：**低**。应用零用户生成内容、无第三方脚本、无 iframe 嵌入需求 → XSS 面积极小。缺 `X-Frame-Options` 只意味着可被嵌入（点击劫持），而本作无被嵌入价值。
- **修法**：加 `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff`（约 2 行，在 `http.ts:6-9`）。
- **判定**：低成本高防御性，**本轮不修（严守"只读审计"约束），强烈建议下轮补上。**

#### M4 · 生产环境 KV 一致性与绑定状态未验证（部署风险，非代码缺陷）

- **位置**：`kv.ts:24-26`（`context.env.OTHELLO_KV ?? null`）、`kv.ts:9`（`STORAGE_ERROR`）
- **两种失效模式**：
  1. KV 已绑定但为**最终一致** → 乐观并发是必需的，且已验证对该模型有效（ADR-0002 §验证）
  2. **KV 未绑定** → 所有端点返回 503，前端展示 `STORAGE_HINT`（`api.ts:18-19`），联机对战整体不可用，**只有人机对战与本地模式可用**
- **风险**：若部署后才发现是模式 2，用户看到的第一个界面就是"联机不可用"。这是**产品可见的失败**。
- **判定**：**必须在部署后立即验证**，见 `asset-audit.md` §4 的 V5。代码侧已有优雅降级（这是对的），但**降级不等于可用**。

#### M5 · `create` 端点无速率限制

- **位置**：`edge-functions/api/room/create.ts:20-41`
- **现象**：任何人可无限制创建房间，每个房间 KV TTL 24 h（`kv.ts:16`）。
- **风险**：持续恶意创建消耗 KV 配额/计费。
- **判定**：**低危但真实**。房间码 10.9 亿空间，创建无收益，纯破坏性。修法约 5 行（基于 IP 的简单令牌桶，或复用平台限流）。**本轮不修，记入技术债。**

### 低

#### L1 · 共享设备上的「房间颜色记忆」继承

- **位置**：`src/utils/player.ts:12`（键 `othello_room_color_<roomId>`）、`Room.tsx:71`（`recallRoomColor`）
- **现象**：换人使用同一浏览器 → 沿用前一人 playerId 与其在该房间的颜色记忆。新人打开该房间会被识别为前一人（服务端也认，因为他带的 playerId 确实匹配），**可以替前一人落子**。
- **判定**：**体验缺陷，非安全漏洞**（服务端校验通过是"正确"的，只是产品语义上缺少会话边界）。修它需引入房间退出/会话机制，属新功能，超出打磨期。**记入技术债。**

#### L2 · 轮询无抖动，且观战者也轮询

- **位置**：`Room.tsx:88-102`（观战者 `pollEnabled` 与对局方无区分）、`usePolling.ts:42`（`setTimeout(loop, intervalMs)` 固定间隔）
- **现象**：所有等待方 2 s 整频率打点 → 服务端周期性尖峰；N 人 → 0.5N req/s。观战者本可放宽。
- **量化**：请求量已在预算内（`performance-budget.md` B13 = 0.5 req/s，边界值）。
- **修法**：间隔加 ±20% 抖动 + 观战场景放宽到 5 s。约 8 行。
- **判定**：**本轮不修，记入技术债。**

#### L3 · `emptyOutDir: false` 导致 `dist/` 残留陈旧 chunk

- **位置**：`vite.config.ts:36-39`（注释说明是为绕过环境 safe-delete 拦截）
- **现象**：实测 `dist/assets/` 同时存在 `ai.worker-5T0219aS.js`（8-31，陈旧）与 `ai.worker-DASYiwcF.js`（本次）。部署若整目录上传会多传 3.3 KB 死文件。
- **功能影响**：**无**。`dist/index.html` 只引新哈希。
- **修法**：部署前清空 `dist/`。成本 0。
- **判定**：**建议写进部署 checklist**，见 `asset-audit.md` §3.5。

#### L4 · 音效 UI 在两个页面重复约 58 行

- **位置**：`Room.tsx:245-273`（音效开关）≈ `AIGame.tsx:329-357`；`Room.tsx:220-243`（提示开关）≈ `AIGame.tsx:304-327`
- **修法**：抽 `<ToggleRow>` 组件（`label` + `description` + `checked` + `onToggle`），可省约 30 行。
- **判定**：纯 UI 重构，收益低、回归风险非零。**打磨期不重构，记入技术债** —— 这是全项目最明显的一处可抽取重复。

#### L5 · `getCtx()` 无法从 `closed` 状态的 AudioContext 恢复

- **位置**：`sound.ts:50-57`（`if (!ctx)` 判断不含状态检查）
- **现象**：若 AudioContext 进入 `closed`，不会重建 → 音效永久静默直到刷新。
- **概率**：正常浏览中几乎不发生。
- **修法**：`if (!ctx || ctx.state === 'closed')`。约 3 行。
- **判定**：**记入技术债。**

#### L6 · 三个音效函数为死代码

- **位置**：`sound.ts:104`（`playFlip`）、`:110`（`playPass`）、`:136`（`playInvalid`）
- **核验**：`useBoardSound.ts:3` 只 import `playPlace/playWin/playLose/playDraw`；grep 确认这三个函数**零调用点**。
- **判定**：**有意保留的 API**（`sound.ts:103` 把 `playFlip` 标为"可选"）。零运行开销（三个函数共约 8 行）。**不修，仅记录。**

#### L7 · 比分进度条用 `width` 做过渡（唯一触发布局的动画）

- **位置**：`GameInfo.tsx:74-77`（内联 `width` style）、`index.css:476`（`transition: width 0.35s`）
- **影响**：每步落子一次小范围 layout + paint。元素 6 px 高且 `overflow:hidden`（`index.css:472`），实测不可感知。
- **修法**：改 `transform: scaleX()` + `transform-origin: left`。约 4 行。
- **判定**：收益极低，**记入技术债**。详见 `performance-budget.md` §2.1。

#### L8 · 工具链落后 2 个大版本

- **位置**：`package.json:24-40`（devDependencies）
- **量化**：vite 6.4.3（最新 8.3.4）、vitest 3.2.7（最新 5.0.3）、@vitejs/plugin-react 4.7.0（最新 6.1.2）、typescript 5.9.3（最新 7.0.2）。均经 `npm view` 实测（2026-10-12）。
- **风险**：安全补丁滞后；`vite.config.ts:1` 从 `vitest/config` import `defineConfig`，这三者版本互相耦合，**不能单独升级**。
- **判定**：CI 已提供三道安全网（typecheck / vitest / Playwright，`.github/workflows/ci.yml`）。**升级应作为 Phase 7 独立任务，一次升到位，切勿在打磨期动。**

#### L9 · `cell.worker` 与主 bundle 的共享依赖依赖 Rollup 自动提取

- **位置**：`ai.ts` 同时被 `AIGame.tsx:3` 与 `ai.worker.ts:1` import
- **现状**：构建产物 `index.js` 200 KB + worker 3.35 KB，无重复代码 —— **说明共享提取正常工作**。
- **风险**：若未来 worker 入口变化（如改成动态字符串路径），共享提取可能失效，worker chunk 会膨胀。**当前无问题，仅记录依赖关系。**

---

## 5. 架构特征总结

**做得好的地方**（这些是当前架构稳定性的来源，建议在后续改动中保持）：

1. **单一规则来源**（ADR-0001）—— 前端、本地 mock、Edge 三处调用同一个 `gameLogic.ts`，规则不可能漂移
2. **关键安全约束落在类型与结构上** —— `toPublicState` 与状态定义同模块，且五端点全覆盖
3. **读操作全部幂等且无缓存** —— `GET /state` 无副作用 + `Cache-Control: no-store`，天然适配轮询
4. **自己回合停轮询**（`Room.tsx:95`）—— 一个条件把平均请求量减半，且消除了一类竞态
5. **Worker 隔离 CPU 且不阻塞 UI**（ADR-0004），且带 ID 校验与三层降级
6. **写操作不依赖轮询** —— `move.ts:54` 响应直接带新状态，自己的落子是 RTT 量级
7. **无外部资产**（ADR-0005）—— 首屏无图片/字体/音频请求瀑布，无版权风险
8. **无障碍双侧处理** —— `prefers-reduced-motion` 在 CSS（`index.css:452-460`）与 JS（`Cell.tsx:36`）两侧都生效
9. **降级路径完整** —— KV 未配置 / 房间不存在 / 冲突 / 网络失败，四类失败都有明确 UI 反馈
10. **CI 三道关** —— typecheck + 126 个单测 + Playwright 双窗口 E2E，且 `engines` 约束与 CI Node 版本一致（`package.json:6-8` vs `ci.yml`）

**结构性约束**（未来改动必须继续满足）：

1. **`gameLogic.ts` 必须保持运行环境中立** —— 它同时跑在浏览器与 V8 isolate。任何 `window`/`DOM`/`performance.now()` 都会在 Edge 侧炸掉
2. **`src/` 是共享源码目录，不只是前端目录** —— `edge-functions/` 依赖 `../src/utils/gameLogic`，靠 `flow.test.ts` / `router.test.ts` 兜底（跨目录 import 断裂会立即测出来）
3. **`edge-functions/lib/router.ts` 必须与平台文件路由保持同步** —— 新增端点时必须同步更新 `ROUTES`（`router.ts:8` 注释明确此要求）
4. **端点新增时必须调用 `toPublicState`** —— 这是硬性安全约束（`gameLogic.ts:308-311`）
5. **AI 引擎保持同步纯函数** —— Worker 只是薄壳（`ai.worker.ts` 全文 17 行）。异步化会破坏 `ai.test.ts` 的 24 个用例

---

## 6. 相关文档

| 文档 | 内容 |
|---|---|
| [`performance-budget.md`](performance-budget.md) | 15 项量化预算与实测值、AI 耗时基准、渲染性能审查 |
| [`asset-audit.md`](asset-audit.md) | 依赖清单审计、零资产策略评估、安全面复核、9 项待人工验证清单 |
| [`adr/ADR-0001`](adr/ADR-0001-shared-rules-engine.md) | 规则引擎下沉到 `src/utils` 并前后端共用 |
| [`adr/ADR-0002`](adr/ADR-0002-optimistic-concurrency-over-kv.md) | KV 无事务 → 乐观并发控制 |
| [`adr/ADR-0003`](adr/ADR-0003-polling-over-websocket.md) | HTTP 轮询而非 WebSocket |
| [`adr/ADR-0004`](adr/ADR-0004-ai-in-web-worker.md) | AI 计算放入 Web Worker |
| [`adr/ADR-0005`](adr/ADR-0005-web-audio-programmatic-sound.md) | 零音频资产的 Web Audio 程序化音效 |
| [`adr/ADR-0006`](adr/ADR-0006-spa-fallback-official-form.md) | SPA fallback 采用官方精确形式（`/* → /index.html`），移除自造 `has` 条件 |
| `../prd.md` | 产品需求文档（第 5 章含原始架构描述，本文已从代码反向核验并更新） |

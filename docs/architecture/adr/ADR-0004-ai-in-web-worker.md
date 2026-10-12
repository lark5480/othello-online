# ADR-0004：AI 计算放入 Web Worker

- **状态**：已采纳（Accepted）
- **日期**：2026-09
- **决策者**：技术负责人
- **相关代码**：`src/workers/ai.worker.ts`（17 行）、`src/pages/AIGame.tsx:62-171`、`src/utils/ai.ts`（338 行）

---

## 背景

人机对战模式下，AI 需要在每一步算出最优落子。当前引擎 `src/utils/ai.ts` 是一个 **同步阻塞的 CPU 密集型搜索**：

- `evaluate`（`ai.ts:83-108`）每次求值要遍历 64 格 + 调 2 次 `getValidMoves`
- `minimax`（`ai.ts:133-177`）是带 alpha-beta 剪枝的递归搜索，`hard` 中盘深度 4、`master` 中盘深度 6（`ai.ts:58-62` 的 `MAX_DEPTH`）
- `master` 有 1500 ms 时间预算（`ai.ts:53-56` 的 `TIME_BUDGET`）

**核心冲突**：`chooseAIMove` 是同步函数（`ai.ts:242-300`）。若在主线程调用，`master` 会**冻结 UI 最长约 1.5 s** —— 表现为：点击「新对局」无响应、主题切换按钮点了没反应、落子提示开关点不动、棋盘上的 CSS 动画**全部冻结**（浏览器无法在长任务期间渲染新帧）。

这是典型的 layout-freeze 型卡顿，比「响应慢」严重得多：**用户会以为页面崩了**。

同时还有一个次要但真实的诉求：AI 计算期间棋盘仍需可交互（关闭弹窗、切换页面）。

## 决策

**把 `chooseAIMove` 的调用放进一个 module Web Worker，让搜索在独立线程执行；主线程只负责发棋盘快照、收落子坐标。**

具体实现（四部分，缺一不可）：

### 1. Worker 极薄，只做转发

`src/workers/ai.worker.ts` 全文只有 17 行，核心逻辑 3 行：

```ts
self.onmessage = (e: MessageEvent<AIMessage>) => {
  const { id, board, aiPlayer, difficulty } = e.data;
  const move = chooseAIMove(board, aiPlayer, difficulty);
  (self as unknown as Worker).postMessage({ id, move });
};
```

**决策要点：引擎本身（`ai.ts`）零改动**，仍是纯同步函数。Worker 只是它的一层包装壳。→ 这让 `ai.ts` 保持可在 Node / vitest 下直接单测（`ai.test.ts` 24 个用例实测 16.59 s，其中包含 hard vs hard 自对弈与强度差异测试，**无需任何 Worker mock**）。这是本决策最重要的设计收益。

### 2. 用 `new URL(..., import.meta.url)` 让构建器识别 Worker 入口

`AIGame.tsx:66`：

```ts
worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' });
```

这是 Vite 官方的 Worker 打包方式 —— 构建时把 `ai.worker.ts` **独立成一个 chunk**（实测产物：`dist/assets/ai.worker-DASYiwcF.js`，3 351 B raw / **1 457 B gzip**），而非内联进主 bundle。

**收益**：Worker 代码异步加载，**不进入首屏**。已核验 `dist/index.html` 只引 `index.js` + `index.css`，不含 worker 的 preload。

### 3. 请求 ID 机制：解决「旧响应污染新对局」

这是本决策最容易被忽略、但**不可省略**的正确性要点。

`AIGame.tsx:127` 分配 `currentRequestId = ++requestIdRef.current`，随消息一起发给 worker（`:157`）。收到响应时（`:146-150`）：

```ts
handler = (e) => {
  if (e.data.id !== currentRequestId) return;   // 丢弃过期响应
  worker.removeEventListener('message', handler!);  // 摘掉监听器
  apply(e.data.move);
};
```

**为什么必须有**：`master` 可能跑 1.5 s。若用户在 AI 计算中途点「新对局」（`AIGame.tsx:372-378`），旧 worker 响应会在 1.5 s 后到达。若不校验 ID，它会把旧棋盘的落子应用到新棋局上 —— **一个难以复现、极难调试的幽灵 bug**。

三处协同防护：
1. `requestIdRef` 单调递增（`AIGame.tsx:60,106,127,167`）
2. `apply` 内部二次校验状态（`:136-140`）：`prev.status === 'playing' && prev.currentTurn === aiColor` 才应用
3. effect cleanup 中摘监听器 + 递增 ID（`:164-170`）

**已有针对性的回归测试**（实测通过）：
- `AIGame.test.tsx > AIGame Worker 请求隔离 > 重开后的旧响应不落子，也不会消费新请求的监听器`
- `AIGame.test.tsx > AIGame Worker 请求隔离 > 重开点击后、effect cleanup 前收到旧响应也不会污染新棋局`

### 4. 三层降级，永不卡死

| 层 | 条件 | 行为 | 位置 |
|---|---|---|---|
| 1. Worker 正常 | `new Worker` 成功 | worker 计算 | `AIGame.tsx:145-157` |
| 2. Worker 构造失败 | `try/catch` 捕获 | `workerRef.current = null`，改主线程 | `AIGame.tsx:64-70`（注释：「极端环境（无 Worker 支持）」） |
| 3. 运行时分支 | `worker` 为 falsy | `apply(chooseAIMove(...))` 同步算 | `AIGame.tsx:158-161`（注释：「Worker 不可用时仍用同一引擎落子，避免 AI 卡死」） |

### 5. 人工思考延迟垫底

`AIGame.tsx:126`：`const delay = 450 + Math.random() * 350;` —— 在 postMessage 之前先等 450–800 ms。注释（`:125`）：「模拟思考节奏，体验更自然；计算本身是同步的，延迟后再执行以避免卡顿观感」。

**这实际解决了降级层的问题**：即使 Worker 不可用而回落到主线程，`master` 的 1.5 s 计算**发生在一个人为延迟之后**，用户此时看到的是「AI 思考中…」（`GameInfo.tsx:36`）而不会在点击瞬间被打断。降级路径的体验损失被削弱到可接受。

## 后果

**正面**：

- **主线程永不被 AI 阻塞**。即使 master 跑满 1.5 s，UI 保持 60 fps，CSS 动画（含棋子翻转、提示脉冲）不冻结。这是本决策的核心价值。
- **引擎零改动且可单测**。`ai.ts` 保持同步纯函数，因此能在 vitest（jsdom）下直接跑，无需 Worker polyfill。实测 `ai.test.ts` 24 个用例包含自对弈与强度差异验证（`hard vs hard 多局均正常终局且棋子守恒`、`hard 作为黑方对 easy 白方，胜局占优`）。若把引擎改成 async 或改成基于 Worker 的架构，**这些测试全部需要重写**。
- **Worker 独立 chunk 且不进首屏**。1 457 B gzip，异步加载。首屏预算因此不受影响（`performance-budget.md` B1/B3）。
- **三处 ID 校验把幽灵 bug 挡在门外**，且有针对性回归测试。
- **worker 产物极小**（3.35 KB）。因为引擎被主 bundle 和 worker **共享**（`ai.ts` 被 `AIGame.tsx:3` 和 `ai.worker.ts:1` 同时 import，Rollup 提取共享 chunk），没有代码重复。

**负面 / 代价**：

1. **多了一次结构化克隆 + 两次线程切换**。每步要传棋盘快照（`gameLogic.ts:20` 的 `Stone[][]`，64 个数字）过去、传一个 `Move` 回来。**实测耗时在噪声量级（< 1 ms），对 18.9–1559.3 ms 的搜索耗时可忽略。**
2. **代码复杂度明显增加**。`AIGame.tsx` 的 AI 回合 effect（`:116-171`）是全文件最复杂的部分，含 6 个 ref（`thinkingRef`/`timerRef`/`workerRef`/`requestIdRef`/`recordedRef` + `prev`）来处理生命周期。**这 56 行是典型的「异步竞态复杂度税」。**
3. **降级层（主线程兜底）在 master 下会造成 1.5 s 卡顿**。缓解措施是 §5 的 450–800 ms 人为延迟，但**这个降级路径未经真机验证**（见下）。
4. **module Worker 的兼容性**。`{ type: 'module' }` 在较旧的浏览器（尤其移动端 WebView）上可能抛错 → 落入降级层 2 → master 卡顿。`try/catch`（`:65-69`）捕获了构造失败，但**部分浏览器是构造成功、运行时才失败** —— 这种情况的兜底不完全。**记入人工验证项 V8。**
5. **无 Worker 取消能力**。`worker.terminate()` 只在 unmount 时调用（`:72`）。若 AI 正在计算时用户重开，**旧计算会跑完**（只是结果被丢弃）。`master` 最坏浪费 1.5 s CPU。**判定：可接受** —— 一次性的 CPU 浪费，无正确性影响（结果被 ID 校验丢弃）。

## 替代方案

| 方案 | 为何未采纳 |
|---|---|
| **A. 主线程同步计算（不用 Worker）** | master 冻结 UI 最长 1.5 s，CSS 动画全冻结，用户观感为「页面卡死」。**这是本 ADR 要解决的问题本身。否决。** |
| **B. 改成异步/分片的 AI 搜索（每 N 个节点 `await` 让出主线程）** | 从根上解决阻塞，且不需要 Worker。**但**：(a) 必须把 `ai.ts` 的 `minimax`（`ai.ts:133-177`）改成 async，**递归链上每一层都要 await**，`ai.test.ts` 的 24 个用例（含 16.59 s 的自对弈与强度测试）全部要改；(b) 引擎复杂度大幅上升；(c) 45 层搜索中反复让出主线程的开销可能超过 Worker 的线程切换。**否决。** |
| **C. WebAssembly / 现有 JS othello 引擎库** | 引入运行时依赖（违反零依赖约束）且 wasm 有加载/编译开销。**否决。** |
| **D. 时间分片（budget 调小，如 master 降到 200 ms）** | 直接降低 AI 棋力以换取流畅 —— 用棋力换性能，方向错误。且深度 1–2 的 master 约等于 hard（`ai.ts:6-7` 的描述）。**否决。** |
| **E. Web Worker 但把引擎整体搬进去（`AIGame.tsx` 不再 import `ai.ts`）** | 这样 worker chunk 会包含完整引擎（约 +8–12 KB gzip），且**主线程仍需 `applyMoveToState`（`AIGame.tsx:138`）等 gameLogic**，拆分不彻底。当前「薄壳 + 共享 chunk」方案更优。**否决。** |
| **F. Node.js worker_threads / 服务端算 AI** | 人机对战是纯本地功能（`ai.ts:311-321` 的 `createAIGameState` 用本地常量 id，无 KV、无网络）。搬到服务端要引入网络延迟 + 状态同步，**把一个 0 依赖功能变成有依赖功能**。且失去离线可玩性。**否决。** |

## 验证与失效条件

**已验证（自动化 / 本机实测）**：
- `src/utils/ai.test.ts` 24 用例全通过（引擎行为未被 Worker 化改变）
- `src/pages/AIGame.test.tsx` 11 用例全通过，含 **2 个专门的 Worker 请求隔离测试**
- `npm run build` 实测：worker 独立 chunk 3 351 B / 1 457 B gzip，且 `dist/index.html` 不含其 preload → 不进首屏
- `npm test` 全量：14 文件 / 126 用例通过（2026-10-12）
- **AI 耗时实测**（临时基准脚本，8 次采样，见 `performance-budget.md` §1）：
  - 中盘（empty≈40）：easy 0.0–0.3 ms / medium 0.8–3.0 ms / hard 18.9–66.7 ms / master 279.5–1559.3 ms
  - 残局（empty=12）：medium 0.2–1.2 ms / hard 1.5–6.0 ms / master 10.5–34.1 ms
  - 极残局（empty=6）：hard 0.5–1.0 ms / master 0.8–1.2 ms

**必须人工验证**：
- **V8**：`{type:'module'}` Worker 在目标浏览器矩阵（含移动端 WebView）中的可用性。若降级到主线程，master 会有 1.5 s 卡顿。验证方式：目标浏览器实测人机对战 + DevTools Performance 观察长任务。

**失效条件（应重新评估本决策）**：
1. 引擎全部耗时降到 < 50 ms（例如把 master 深度限制为 3）—— Worker 的复杂度税（56 行竞态代码）将超过收益，应退回同步方案 A
2. 需要在 AI 计算过程中途改变难度或撤销 —— 需要引入 Worker 消息协议扩展与真正的任务取消
3. 需要在服务端算 AI（多人对战含 AI）—— Worker 模型不适用（见方案 F）

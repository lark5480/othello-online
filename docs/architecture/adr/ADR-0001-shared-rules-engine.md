# ADR-0001：规则引擎下沉到 `src/utils` 并由前后端共用

- **状态**：已采纳（Accepted）
- **日期**：2026-09
- **决策者**：技术负责人
- **相关代码**：`src/utils/gameLogic.ts`（328 行）

---

## 背景

黑白棋的规则（8 方向翻转、跳过、终局判定、胜负计算）在项目里有**两个必然的执行位置**：

1. 浏览器端 —— 玩家落子后必须立刻更新棋盘，不能等服务端往返
2. Edge Functions（V8 运行时）—— 房间状态的权威裁决方

如果两端各写一份规则，会出现三类典型故障：

- **规则漂移**：修改了一处而忘了另一处，联网模式与人机模式行为不一致
- **不可测**：规则散落在组件与 handler 里，难以脱离 UI 与网络做纯函数测试
- **不可信**：客户端先算一遍、服务端算一遍，两份结果不一致时以谁为准无法界定

项目**刻意不引入**游戏规则库（如 `othello.js` 之类），因此规则必须自研，自研就必然面对「放哪里」的选择。

## 决策

**把规则引擎实现为一个零依赖的纯函数模块 `src/utils/gameLogic.ts`，放在 `src/` 内，由前端与 Edge Functions 共同 import。**

具体约束：

1. **零依赖、零副作用**：文件头注释（`gameLogic.ts` 顶部）声明「不依赖任何外部库，可在 V8 / 浏览器 / Node 下直接运行」，所有导出函数不触碰 DOM、不读环境变量、不用模块级可变状态。
2. **纯函数 + 返回新对象**：棋盘更新走 `applyMoveBoard`，内部先 `cloneBoard`；状态更新走 `applyMoveToState`，返回 `{ok:true, state}` 或 `{ok:false, status, error}` 判别联合。
3. **房间状态层面的逻辑也放进来**，而非留在 Edge Functions：`joinState`、`restartState`、`createInitialState` 都在 `gameLogic.ts` 内。该段上方的注释明确了这一取舍的理由 —— 「便于单测」。
4. **安全净化函数与规则同模块**：`toPublicState` 放在规则模块内，其上方的注释把它定性为一条**硬性安全约束**：「playerId 兼作落子凭证，绝不能经任何 API 响应外泄」。让净化函数与状态定义物理同处，可以降低「新增端点时忘记调用」的概率。
5. **Edge Functions 跨目录 import**：`edge-functions/api/room/create.ts:4` 直接 `import { createInitialState, toPublicState } from '../../../src/utils/gameLogic'`。路径穿过 `edge-functions/` 与 `src/` 两棵树。

## 后果

**正面**：

- **规则单一来源**。人机对战（`AIGame.tsx:181`）与联网对战（`move.ts:50`）调用的是同一个 `applyMoveToState`，行为必然一致。`AIGame.tsx:414` 的注释直接记录了这个收益：「复用在线模式同一套状态转移，保证翻转/跳过/胜负规则完全一致」。
- **规则可独立测试**。`src/utils/gameLogic.test.ts`（299 行）能不渲染任何组件、不 mock 网络地测完所有规则分支。这是「规则放在组件里」做不到的。
- **本地 mock 与生产同源**。`server/mockApi.ts:9-15` import 的是同一模块，本地双窗口验证的规则与生产完全一致（`mockApi.ts:3-5` 注释明说这一点）。
- **零运行时依赖**。这是 §`asset-audit.md` 中「3 个运行时依赖」成绩的直接来源之一。
- **校验逻辑可审计**。落子校验的三重检查（`:262-274`）集中在一处，且带一条从真实 bug 提炼的注释（`:261`）。

**负面 / 代价**：

- **`src/` 不再是「前端源码目录」，而是「共享源码目录」**。这是本决策最重要的架构含义：`src/utils/gameLogic.ts` 同时是前端代码和后端代码。含义之一是**它必须保持运行环境中立** —— 任何用到 DOM、`window`、`performance.now()` 的写法都会在 Edge 侧炸掉。当前代码确实守住了（`gameLogic.ts` 全文无任何浏览器 API）。
- **Edge Functions 跨目录 import 破坏了目录的自洽性**。`edge-functions/` 名义上是独立的后端目录，却依赖了 `../src/` 的文件。若未来有人把 `edge-functions/` 整体抽成独立仓库或独立构建产物，这条 import 会立刻断裂。**缓解措施**：目前靠 `edge-functions/lib/router.ts:1-9` 的注释与 `edge-functions/flow.test.ts`（211 行端到端流程测试）守着 —— 跨目录 import 一旦断掉，测试会立刻红。这是一个**有意识的、靠测试兜底的耦合**，不是疏漏。
- **没有类型层面的隔离**。`src/utils/gameLogic.ts` 与 Edge 之间只有 TypeScript 结构类型（`GameState` 接口）作为契约，没有独立的 `.d.ts` 或 schema（如 zod）做运行时校验。**判定：可接受** —— 状态数据来自自家 KV 而非不可信输入，且已在两端做了防御性处理（`kv.ts:34-39` 的 JSON.parse try/catch、`types.ts:6-10` 手写最小类型）。

**中性**：

- 规则引擎的**性能特征被限定**。`getValidMoves`（`:129-139`）是最热的函数：它对每个空格调用 `isValidMove` → `getFlips`（`:89-116`），最坏 64 × 8 方向 × 7 格。AI 引擎在搜索中会反复调用它（`ai.ts:97-98` 的 `evaluate` 每次都调 2 次）。当前实现**没有增量更新、没有位棋盘（bitboard）优化**，靠「8×8 足够小」这一事实成立。实测依据见 `performance-budget.md` §1（中盘 hard 18.9–66.7 ms、master 最坏 1559.3 ms）。**若未来棋盘尺寸不是 8×8，这个实现会立刻失效。**

## 替代方案

| 方案 | 为何未采纳 |
|---|---|
| **A. 前后端各写一份规则** | 直接导致本文档「背景」列出的三类故障。**否决。** |
| **B. 规则放 `edge-functions/lib/`，前端 import 后端代码** | 语义倒挂：规则是领域逻辑，不是传输层关注点。且会让 `src/` 反向依赖 `edge-functions/`，与当前方向相反。**否决。** |
| **C. 抽成独立 npm 包（本地 workspace / monorepo）** | 三个运行时依赖即零（`package.json:20-23`）的极简约束是有意的项目特征（见 `asset-audit.md` §1.1）。为 328 行代码引入 monorepo 构建，收益远小于成本。**否决，但若项目扩展到多产品线共享规则，应重新评估。** |
| **D. 规则下沉到独立包 / npm 上成熟的 othello 库** | 引入运行时依赖，与零依赖约束冲突；且成熟库的规则约定（坐标方向、翻转语义、终局条件）常与 PRD 不一致，改造成本高于自研。自研 328 行的成本已被证明可控。**否决。** |
| **E. 把规则塞进 Edge Functions，前端通过服务端计算** | 会让每次落子都必须等服务端往返（网络 RTT + `performance-budget.md` B6 的 2 s 轮询量级），交互体验灾难性劣化；且离线/降级时（KV 未配置，见 `api.ts:18-19`）前端根本无法落子。**否决。** |

## 验证与失效条件

**如何确认本决策仍然成立**：若把 `gameLogic.ts` 复制一份给 Edge 用（即方案 A），`gameLogic.test.ts` 只需改一处 import 就能同时测两份，但两份会独立漂移。判据是：改一条规则时，**是否只需改一个文件就能保证两端一致** —— 当前为「是」。

**失效条件（应重新评估本决策）**：
1. 棋盘尺寸不再是 8×8（`BOARD_SIZE`，`:10`）—— 当前无位棋盘优化的实现会失效
2. 项目扩展到多个应用共享同一套规则 —— 应转向方案 C
3. 需要在没有 `src/` 的环境部署 Edge Functions（如分离构建）—— 跨目录 import 会断裂

# AI 对战模式（P2）接口与集成说明

黑白棋人机对战功能，对应 PRD 的 P2 阶段。设计为**纯本地离线模式**：无需 EdgeOne / KV / 后端，前端直接复用 `src/utils/gameLogic.ts` 的规则引擎驱动 AI，玩家只需 `npm run dev` 即可对弈。

## 1. 架构概览

```
src/utils/ai.ts        # AI 引擎（纯 TS、零依赖，可被前端/测试/Edge Functions 共用）
src/pages/AIGame.tsx   # 人机对战页（复用 Board / GameInfo / Cell）
src/components/GameInfo.tsx  # 新增 aiThinking / subtitle 透传，显示「AI 思考中…」
src/App.tsx            # 新增路由 /ai
src/pages/Home.tsx     # 新增「人机对战」入口按钮
```

- AI 落子、回合切换、跳过、胜负判定**全部复用 `gameLogic.applyMoveToState`**，与联网模式规则严格一致（单一事实来源，无重复规则实现）。
- 状态为本地 `GameState`，不进入 KV，因此无最终一致性延迟、无需轮询。

## 2. AI 引擎公共接口（`src/utils/ai.ts`）

### 类型与常量

```ts
export type Difficulty = 'easy' | 'medium' | 'hard';
export const AI_PLAYER_ID = 'ai-opponent';     // 本地对局中 AI 的固定玩家 id
export const LOCAL_PLAYER_ID = 'local-player';  // 本地对局中玩家的固定玩家 id
```

### `chooseAIMove(board, aiPlayer, difficulty, rng?)` → `Move | null`

选择 AI 落子点。

| 参数 | 说明 |
| --- | --- |
| `board` | 当前 8×8 棋盘（`Board` 类型，来自 `gameLogic`） |
| `aiPlayer` | AI 执子方 `'black' \| 'white'` |
| `difficulty` | 难度，见 §3 |
| `rng` | 仅 `easy` 使用，可注入以固定随机（默认 `Math.random`），便于测试 |

- 返回 `Move {row, col}`；当 AI 当前无合法落子时返回 `null`（正常对局中不会在对 AI 回合调用到此）。
- 纯函数、无副作用；相同输入恒得相同落子（确定性，便于单测）。

### `createAIGameState(playerColor, difficulty)` → `GameState`

创建一局本地人机对局初始状态。

- `playerColor`：玩家执子方；AI 自动执对方。
- 返回的 `GameState.players` 以 `LOCAL_PLAYER_ID` / `AI_PLAYER_ID` 填充，`status: 'playing'`，初始 2:2。
- `difficulty` 仅用于提示，不在状态中持久化（每步落子时显式传入）。

### `applyAIMove(state, aiColor, difficulty, rng?)` → `GameState`

在现有状态上应用 AI 的一步，返回新状态（不修改入参）。

- 内部先 `chooseAIMove` 取点，再 `applyMoveToState` 完成翻转 / 跳过 / 胜负判定。
- 若 AI 当前无合法落子，原样返回 `state`（边界保护）。

### `evaluate(board, me)` → `number`（评估函数，可被外部复用/调参）

从 `me` 视角评估局面：位置权重矩阵（角最高、`X/C` 位为负）+ 行动力差 + 残局子数差。

## 3. 难度分级与行为

| 难度 | 策略 | 搜索深度 | 强度 |
| --- | --- | --- | --- |
| `easy` | 合法点中等概率随机 | — | 热身用，可被任意策略战胜 |
| `medium` | Minimax + alpha-beta | 中盘 2 层；残局(≤8 空格)精确到底 | 会抢角、避免 `X/C` 位 |
| `hard` | Minimax + alpha-beta + **落子顺序剪枝**（角优先） | 中盘 4 层；残局(≤10 空格)精确解 | 强；单步 < 2s（已测） |

> **落子顺序（move ordering）**：遍历合法点时按位置权重降序（角优先），使 alpha-beta 更早命中剪枝点，将整文件测试从 140s 降至 ~8s，且**不改变搜索结果**。

## 4. 前端交互流程

1. 首页点「人机对战」→ 路由 `/ai`。
2. 设置阶段：选难度（简单/中等/困难）+ 执子（黑先手 / 白后手）→ 开始对局。
3. 对局阶段：
   - 玩家回合：`Board` 可点击，落子后 `applyMoveToState` 切换回合。
   - AI 回合：`useEffect` 侦测到 `currentTurn === aiColor` → 显示「AI 思考中…」→ 延迟 450–800ms（自然节奏）→ `applyAIMove` 落子。
   - 自动处理「对方无子可下 → 跳过」与连续跳过；双方均无子可下则 `finished` 弹窗（你赢 / AI 获胜 / 平局）。
4. 落子提示开关：AI 模式默认开启（`getShowHints('ai')`），可在对局页随时切换，按设备持久化（`localStorage`）。关闭提示后棋盘仍可正常落子（与 `Board` 的 `interactive` / `isHint` 解耦一致）。

## 5. 运行与验证

```bash
npm install
npm run dev        # 浏览器开 /ai 即与 AI 对弈，无需后端
npm run typecheck  # tsc --noEmit，应无错误
npm test           # vitest，AI 引擎 15 用例 + 既有 21 用例，共 36 全绿
```

测试覆盖（`src/utils/ai.test.ts`）：评估函数性质、各难度合法落子、easy 的 rng 可控性、medium/hard 确定性、本地状态编排（先手/跳过/不抢手）、自对弈回合与终局不变量（棋子守恒、胜负一致）、**hard 首步与中盘单步均 < 2s**、hard 稳定战胜 easy。

## 6. 集成清单（已落地）

- [x] `src/utils/ai.ts` —— AI 引擎（零依赖、纯函数、可测试）
- [x] `src/pages/AIGame.tsx` —— 人机对战页（设置/对局/结算三段式）
- [x] `src/App.tsx` —— `/ai` 路由
- [x] `src/pages/Home.tsx` —— 「人机对战」入口
- [x] `src/components/GameInfo.tsx` —— `aiThinking` / `subtitle` 透传
- [x] `src/utils/ai.test.ts` —— 完整单元测试（确定性 + 性能回归）
- [x] `npm run typecheck` 与 `npm test` 全绿

> 注：本模式不依赖 KV/EdgeOne，`edge-functions` 无需改动；如需"人机对战也走房间/排行榜"，可后续在 `createAIGameState` 基础上对接 `api.ts`，但当前按 PRD 的离线单机设计实现。

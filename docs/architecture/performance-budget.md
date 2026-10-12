# 性能预算与现状分析

> 审计范围：Phase 6 打磨期技术审计（只读）。本文不含新功能代码。
> 数据采集时间：2026-10-12，全部为本机实测（`npm run build` / `npx vitest run` / Node v22.22.2 / Windows）。
> 采集方式：构建产物体积取自真实 `dist/`；AI 耗时取自临时基准脚本（已在审计结束时删除，未落入 `src/`）。
> 浏览器实测（DevTools Performance、Lighthouse、真实 EdgeOne 网络 RTT）**未执行**，相关行标注为「估算」或「待人工验证」。

---

## 1. 预算总表

「预算」列为本项目自定的目标值（无外部基线可对标，取「体验无明显卡顿」的保守阈值）；「现状」列为本机实测值。

| # | 指标 | 预算（目标） | 现状（实测/估算） | 结论 |
|---|---|---|---|---|
| B1 | 首屏 JS（gzip，含 React+Router+全部页面） | ≤ 80 KB gzip | **64.27 KB gzip**（200.49 KB raw） | ✅ 达标，余量 15.7 KB |
| B2 | 首屏 CSS（gzip） | ≤ 8 KB gzip | **5.44 KB gzip**（21.31 KB raw） | ✅ 达标 |
| B3 | AI Worker 独立 chunk（gzip，异步加载，不阻塞首屏） | ≤ 4 KB gzip | **1.46 KB gzip**（3.35 KB raw） | ✅ 达标 |
| B4 | 首屏总传输（JS+CSS，brotli） | ≤ 65 KB | **≈ 61.0 KB brotli**（56.19 + 4.80） | ✅ 达标 |
| B5 | 落子 → 本地 UI 更新（乐观路径） | ≤ 16 ms（1 帧） | **估算 < 8 ms**：一次 `applyMoveToState`（8×8 纯数组）+ 64 格 React diff | ✅ 达标（估算，待真机验证） |
| B6 | 落子 → 对方可见（轮询路径） | ≤ 2.4 s（P95） | **估算 ≤ 2.0 s + RTT**：等待 2 s 轮询 + 一次 `GET /state` | ⚠️ 待人工验证（依赖真实平台 RTT 与 KV 一致性） |
| B7 | AI 计算耗时 · easy（中盘） | ≤ 5 ms | **实测 0.0–0.3 ms**（8 次采样） | ✅ 达标 |
| B8 | AI 计算耗时 · medium（中盘） | ≤ 30 ms | **实测 0.8–3.0 ms**（8 次采样，中位数 ≈ 1.9 ms） | ✅ 达标 |
| B9 | AI 计算耗时 · hard（中盘） | ≤ 800 ms（= `TIME_BUDGET.hard`） | **实测 18.9–66.7 ms**（8 次采样，最坏 66.7 ms） | ✅ 达标，但**搜索深度未跑满**（见 §3.1） |
| B10 | AI 计算耗时 · master（中盘） | ≤ 1500 ms（= `TIME_BUDGET.master`） | **实测 279.5–1559.3 ms**（8 次采样，最坏 1559.3 ms） | ⚠️ **超标 59 ms / +3.9%**，见 §3.2 |
| B11 | AI 残局（empty ≤ 12）精确搜索耗时 | ≤ 50 ms | **实测 master 10.5–34.1 ms；hard 1.5–6.0 ms；medium 0.2–1.2 ms** | ✅ 达标 |
| B12 | 轮询间隔（等待方） | 2 s（已实现，`Room.tsx:96`） | 2 s；自己回合 0（停轮询）；waiting 3 s；finished 5 s | ✅ 达标（设计正确） |
| B13 | 轮询请求量 | ≤ 0.5 req/s/客户端 | **0.5 req/s**（等待方 2 s 间隔） | ⚠️ 边界值，见 §3.4 |
| B14 | 棋盘动画帧率 | 60 fps，落子/翻转期间无掉帧 | **估算达标**：仅 `transform`/`opacity`/`background-color` 动画，无 layout 触发属性 | ✅ 达标（见 §2） |
| B15 | 音效播放 | 零音频文件、零网络请求 | 达成：Web Audio 实时合成（`src/utils/sound.ts`） | ✅ 达标 |
| B16 | 断线重连：刷新 → 恢复同步（双端一致） | ≤ 2.4 s（与 B6 同量级） | **实测 47–83 ms**（3 组独立采样，见 §5） | ✅ 达标（本机 dev server） |

### 1.1 构建产物原始记录

`npm run build`（vite 6.4.3，52 modules，1.68 s）：

```
dist/index.html                      0.41 kB │ gzip:  0.30 kB
dist/assets/ai.worker-DASYiwcF.js    3.35 kB
dist/assets/index.css               21.31 kB │ gzip:  5.44 kB
dist/assets/index.js               200.49 kB │ gzip: 64.46 kB
```

独立用 `gzip -c9` / `brotli -q 11` 复测（Vite 报告值与实测一致）：

| 文件 | raw | gzip -9 | brotli -11 |
|---|---|---|---|
| `assets/index.js` | 200 487 B | 64 266 B | 56 186 B |
| `assets/index.css` | 21 305 B | 5 438 B | 4 804 B |
| `assets/ai.worker-*.js` | 3 351 B | 1 457 B | 1 312 B |

`dist/` 整体 228 879 B（含一份陈旧 worker，见 §3.5）。

---

## 2. 棋盘渲染与动画的 CSS 性能审查

结论：**没有踩 layout thrash，动画属性选择是正确的**。逐条核验如下（行号为 `src/index.css`）。

| 动画/过渡 | 位置 | 触发属性 | 是否触发 layout | 评价 |
|---|---|---|---|---|
| 格子按下缩放 | `index.css:201` `transition: transform 0.12s`；`:225` `transform: scale(0.93)` | `transform` | 否（合成层） | ✅ 正确 |
| 格子悬停高亮 | `index.css:212` `transition: background-color 0.15s`；`:214` `.cell::after` 覆盖层 | `background-color`（paint-only） | 否 | ✅ 正确。用 `::after` 覆盖层而非改 `.cell` 自身背景，避免与棋子层叠变，`Board.tsx`/`Cell.tsx` 注释亦说明此意图 |
| 棋子翻转 | `index.css:312-322` `disc-flip-anim` `rotateY(0→180deg)`，0.36 s | `transform` + `preserve-3d` + `backface-visibility:hidden` | 否 | ✅ 正确。3D 变换需要合成层，实测单步翻转最多 6–8 枚棋子同台，量级安全 |
| 提示点呼吸 | `index.css:326-339` `hint-pulse` 1.4 s infinite | `opacity` + `transform: scale()` | 否 | ✅ 正确，但为 `infinite`，长期占用合成层，见 §3.3 |
| 将翻转棋子脉冲 | `index.css:376-382` `will-flip-pulse` 0.9 s infinite | `opacity` + `transform: scale()` | 否 | ✅ 正确 |
| 比分进度条 | `index.css:476` `transition: width 0.35s ease-in-out` | **`width`** | **是** | ⚠️ 唯一触发 layout 的动画，见下 |

### 2.1 唯一 layout-triggering 动画：比分进度条

`GameInfo.tsx:74-77` 用内联 `style={{ width: `${percent}%` }}` 驱动 `.score-bar-fill-black`，CSS 对 `width` 做 0.35 s 过渡。`width` 是布局属性，每帧触发一次该元素的 layout + paint。元素只有 6 px 高、`overflow:hidden`（`index.css:472`），影响范围被限制在 `.score-bar-track` 内，实测感知不到。

**收益极低的可选优化**（不阻塞发布）：改为 `transform: scaleX()` + `transform-origin: left`，配合固定 `width: 100%`，可完全脱离布局阶段。收益 ≈ 每步落子省一次小范围 layout；成本是要改 `GameInfo.tsx:74-77` 与 `index.css:476` 两处。**建议记入技术债，本轮不做。**

### 2.2 无 JS 侧强制同步布局

核查了所有会在渲染/事件里读取几何属性（`offsetWidth`/`getBoundingClientRect`/`scrollTop` 等）的位置：**零命中**。
- `Board.tsx:66` 的 `onMouseOver` 用 `closest('[data-row]')` 取 `dataset`，纯属性读取，不触发布局。
- `Cell.tsx:36` 在 `useEffect` 里调 `window.matchMedia(...).matches`，不触发布局；但每次翻转都会新建一个 `MediaQueryList`（无缓存），见 §3.6。
- 棋盘为固定 `grid-template-columns: repeat(8, 1fr)` + `aspect-ratio: 1/1`（`index.css:166-176`），64 格等分，无测量需求。
- `Board.tsx:73-96` 的 64 格 `.map` 每帧重建 React 元素，但 `Cell` 输出为纯 CSS 类切换，React 只做属性 diff，不涉及测量。

---

## 3. 超标项与优化方案

### 3.1 （中）hard 难度搜索深度未跑满，800 ms 预算几乎没用上

**现状**：hard 中盘实测 18.9–66.7 ms，仅占 800 ms 预算的 2–8%。`ai.ts:284-298` 的迭代加深循环通常在 depth 3 或 4 收敛退出，远未触及 `MAX_DEPTH.hard = 4`（`ai.ts:60`）。

**收益**：把 hard 的 `MAX_DEPTH` 从 4 提到 5，实测耗时约 ×8–15（4→5 层分支因子约 8–12），即约 150–800 ms —— **仍落在 800 ms 预算内**，棋力显著提升。
**成本**：改一行（`ai.ts:60`）；风险是残局 `empty<=10` 分支（`ai.ts:272-275`）不受 `MAX_DEPTH` 约束、走 `searchRoot` 精确搜索到底，那条路径已实测 ≤ 34 ms，安全。
**建议**：列为「Phase 7 棋力调优」候选，本轮（打磨期）不改。

### 3.2 （低）master 中盘最坏采样超预算 59 ms

**现状**：master 8 次采样为 279.5 / 318.7 / 693.6 / 694.9 / 714.5 / 768.2 / 1056.8 / **1559.3** ms，`TIME_BUDGET.master = 1500`（`ai.ts:55`）。最坏值超 3.9%。

**成因**：`ai.ts:288` 的超时检查在**候选循环内部**，而单个候选的 `minimax(depth-1)` 调用（`ai.ts:290`）本身不可中断。一旦进入 depth 5 的某个候选，整层必须算完才回到检查点。因此「检查点粒度」决定了超调上界 ≈ 单个候选的搜索耗时。

**方案（按性价比排序）**：
1. **零成本**：把 `TIME_BUDGET.master` 从 1500 调到 1400，留出约 100 ms 超调余量。观感无差异（反正已有人工思考延迟 450–800 ms 垫底）。
2. 低成本：给 `minimax` 加节点计数参数，每 N 个节点检查一次预算，超时向上抛哨兵值。可把超调压到 < 10 ms，但需改 `minimax` 签名及其全部递归调用点（`ai.ts:133-177`），回归面较大。
3. 不推荐：Web Worker 已隔离主线程，超调不影响交互手感（见 §3.7）。

**建议**：采纳方案 1，一行改动。方案 2 记入技术债。

### 3.3 （低）`hint-pulse` 无限动画常驻

`index.css:339` 的 `hint-pulse 1.4s infinite` 在「显示落子提示」开启且轮到我方时持续运行。开启提示的合法点最多约 10–12 个（8×8 棋盘的实际合法点数上限），即 10–12 个元素各占一个合成层、永久动画。

已正确处理的部分：`prefers-reduced-motion: reduce` 下 `animation: none`（`index.css:452-460`）；`Cell.tsx:36` 对翻转动画也做了同一降级。

**收益**：关闭提示时省 10–12 个合成层。**成本**：为动画加 `will-change` 反而更差（层常驻），当前实现已是较优解。
**建议**：不优化。当前量级（≤12 层）对现代 GPU 可忽略。

### 3.4 （中）轮询请求量处于边界，且 KV 读放大随人数线性增长

**现状**：等待方每 2 s 一次 `GET /state`（`Room.tsx:96,104-108`），即 **0.5 req/s/客户端**。`usePolling.ts:38-43` 是「本次请求 resolve 后再 setTimeout 下一轮」的串行循环（**不是**固定 interval 叠加），因此慢响应不会堆积请求 —— 这个实现是正确的。

**问题**：
- 观战者也在轮询（`pollEnabled` 不区分观战与对局方，`Room.tsx:88-102`），人数为 N 时读放大 = 0.5N req/s。
- 无退避：网络抖动或对局结束后 `GET /state` 返回 404，`pollError` 会置 `notFound`（`Room.tsx:116`）——**但 finished 状态下 KV TTL 为 24 h**（`kv.ts:16`），正常不会 404，故此路径实际难触发。

**方案**：给等待轮询加抖动（±20%）避免多人同频打点；观战场景把间隔放宽到 5 s。
**收益**：KV 读量降低约 30–50%，降低最终一致性冲突概率（见 `architecture.md` 风险 R2）。
**成本**：改 `Room.tsx:88-102` 一段 + `usePolling` 增加 jitter 参数。**本轮不改**（当前量级完全可承受），建议记入技术债。

### 3.5 （低）`dist/` 残留陈旧 worker chunk

`vite.config.ts:39` 设了 `emptyOutDir: false`（注释说明是为绕过环境的 safe-delete 拦截）。副作用：本次构建后 `dist/assets/` 同时存在 `ai.worker-5T0219aS.js`（8-31，3 327 B，陈旧）与 `ai.worker-DASYiwcF.js`（本次，3 351 B）。`dist/` 已在 `.gitignore`，部署若整目录上传会多传 3.3 KB 死文件；`dist/index.html` 只引用新哈希，不影响功能。

**方案**：部署前清空 `dist/`。**成本**：0（写进部署 checklist）。**建议**：采纳，见 `asset-audit.md`。

### 3.6 （低）翻转判定每次新建 MediaQueryList

`Cell.tsx:36` 在 `useEffect` 内调 `window.matchMedia('(prefers-reduced-motion: reduce)')`，未缓存。每步落子最多触发 6–8 次（翻转的棋子数），量级可忽略。**建议**：不优化。

### 3.7 （已达标，勿动）AI 计算的线程隔离

`AIGame.tsx:66` 用 `new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' })`，产物独立成 `assets/ai.worker-*.js`（1.46 KB gzip），且**不进首屏**（`dist/index.html` 只引 `index.js` + `index.css`）。即使 master 跑满 1.5 s，主线程不掉帧。`AIGame.tsx:158-161` 另有 Worker 构造失败时的主线程兜底，避免 AI 卡死。**这是本项目性能设计上最正确的一处决策。**

---

## 5. 断线重连开销

> 数据来源：`e2e/reconnect.spec.ts` 中的「度量」用例（双窗口 Playwright，真实 `page.reload()`），
> 本机 Chromium + Vite dev server，mockApi 为内存 Map（延迟近零）。
> **这些数字是 dev server 下的下界**，生产 EdgeOne 需叠加公网 RTT 与 KV 读一致性延迟。

### 5.1 实测结果

| 指标 | 定义 | 实测（3 组采样） |
|---|---|---|
| **t_render** | 发起 `reload()` → 棋盘 64 格渲染完成（React 拿到 state 并 commit） | **100 / 118 / 128 / 148 / 180 ms** |
| **t_sync** | 发起 `reload()` → 双端棋盘**与**计分重新一致 | **47 / 53 / 60 / 66 / 83 ms** |
| moveCount | 刷新后走子记录手数（BUG-01 修复后应为 2） | **2** ✅ |

**为什么 t_sync 远小于 B6 的 2 s 轮询间隔**：这里度量的是「刷新后**恢复**到一致」，
不是「等对方落子」。`Room.tsx:52-67` 的首次加载 effect 会**立即**发一次
`getRoomState`，不必等第一轮轮询；而断线期间双方都没落子，刷新拿到的状态本就是终态，
所以第一发就一致。t_sync 因此只反映「首屏 state 拉取 + 渲染」，**不含轮询等待**。

### 5.2 首屏资源缓存状态

刷新后首屏 JS/CSS 资源的实际响应头（dev server）：

| 资源 | 状态 | cache-control |
|---|---|---|
| `/node_modules/.vite/deps/react.js`、`react-dom_client.js`、`react-router-dom.js`、`chunk-*.js`（6 个） | 200 | `max-age=31536000, immutable` |
| `/src/index.css` | 200 或 304 | `no-cache` |
| `/node_modules/vite/dist/client/env.mjs` | 200 或 304 | `no-cache` |

**结论**：
- **依赖走强缓存**（`immutable` + hash query）——刷新后直接命中本地缓存，不重复传输。
  这 6 个文件占首屏 JS 绝大部分，刷新体验因此受益。
- **应用自身源码与 CSS 走协商缓存**（`no-cache` + ETag）——每次刷新发条件请求，
  内容未变时服务端回 **304**，实测采样中出现过 `status304=2`，即零字节传输。
- 注意：Playwright 的 `Response` **没有 `fromCache()` API**（已核对 `playwright-core` 类型定义），
  故缓存命中只能由「状态码 304」与 `age` / `cache-control` 头推断，`age` 在 dev 下恒为空。
- **生产环境会更优**：构建产物为固定文件名（`vite.config.ts:39-47` 的
  `entryFileNames: 'assets/index.js'`），且 `index.html` 不带 hash —— 意味着
  **发布新版本后 URL 不变，旧缓存不会被自动失效**。上线前需确认 EdgeOne 侧
  对 `index.html` 与 `assets/*` 配了正确的 `Cache-Control`（html 不缓存、assets 长缓存），
  否则会拿到陈旧资源。这是一个**待人工验证**项，本机无法覆盖。

### 5.3 走子记录恢复（BUG-01 修复前后对比）

| | 修复前 | 修复后 |
|---|---|---|
| 刷新前显示 | 2 手 | 2 手 |
| **刷新后显示** | **1 手**（第 1 手永久丢失，「回顾」失真） | **2 手** ✅ 逐手坐标一致 |

根因是 `GameState` 缺少棋谱字段，客户端只能靠 `lastMove` 补回最后一手。
修复为在 `GameState` 持久化 `moves: MoveWithPlayer[]`（含每手执子方），
`MoveHistory` 直接由其派生。回归由 `e2e/reconnect.spec.ts`（刷新前后手数 + 逐手坐标 + 回顾入口）
与 `src/utils/gameLogic.test.ts`（含跳过回合下 `moves.length === moveCount` 不变量）双重守护。

**KV 体积代价**（满盘 60 手实测）：`toPublicState` 序列化 **2 476 B**，
其中 `moves[]` 占 2 101 B（84.9%），较无 `moves` 的 403 B 增加 +2 073 B。
相对 EdgeOne KV 单 value 1 MiB 限额**余量 423×**，且跳过回合不增加长度，故**无实际意义**。

### 5.4 终局后刷新与重开

`e2e/reconnect.spec.ts` 的「终局后刷新」用例覆盖最深的一条重连路径：
打完整局 → 终局 → **刷新** → 点「再来一局」→ 成功开出新局。

这条路径值得单独验证，因为重开需要**凭证**：`POST /api/room/:id/restart` 校验
localStorage 里的 `playerId` 是否等于房间任一方（`mockApi.ts:127`），否则 403。
若刷新后 `playerId` 丢失或被重建，重开就会失败 —— 这是「身份持久化」唯一
无法从前述用例间接推出的路径。实测通过（该用例需打完整局，单跑约 1.7 min，
故独立成一个 describe 并单独放宽超时，不拖累主流程）。

刷新后重开的两点行为也已断言：走子记录清零（新局从 0 手起）、
对端通过 5 s 低频轮询自动跟进新局（`Room.tsx:97-101`），无需手动刷新。

**测试时长代价**：本节用例是全套 E2E 中最慢的一个（需真实对局约 30–60 手），
是 `npm run test:e2e` 总时长的主要来源。若 CI 时间紧张，可给它单独加
`@slow` 标记并在 CI 中 `--grep-invert @slow` 排除，**但请勿直接删除** ——
它是本地 mockApi 唯一能覆盖 restart 凭证的端到端路径。

---

## 6. 结论

1. **首屏预算全部达标，且余量充足**：JS 64.27 KB gzip（预算 80），CSS 5.44 KB（预算 8），总传输 ≈ 61 KB brotli。三个运行时依赖的极简选择（见 `asset-audit.md`）直接兑现为这个结果。
2. **AI 耗时只有 master 一项轻微超标（+3.9%）**，成因是超时检查点粒度而非算法失控；一行改 `TIME_BUDGET` 即可规避。相比之下 **hard 难度严重「欠用」预算**（18–67 ms / 800 ms），是棋力上的浪费而非性能问题。
3. **渲染层零 layout thrash**：全部棋盘动画走 `transform`/`opacity`，唯一的 `width` 过渡（比分条）影响面被 6 px 高度与 `overflow:hidden` 限制，实测不可感知。
4. **断线重连不是性能风险**（§5）：本机 t_render 100–180 ms、t_sync 47–83 ms，均远低于 2 s 轮询量级；刷新后依赖走强缓存、源码走 304 协商缓存。
5. **仍需人工验证的硬指标有 2 项**：**B6**（落子 → 对方可见延迟）取决于真实 EdgeOne RTT 与 KV 一致性；**§5.2 的生产缓存策略**因构建产物无 hash，需确认 EdgeOne 的 `Cache-Control` 配置，详见该节警告。


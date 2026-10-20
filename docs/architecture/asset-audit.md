# 资产与依赖审计

> 审计时间：2026-10-12。范围：运行时依赖、构建链配置、项目资产清单、安全暴露面。
> 审计方式：只读。未修改任何源码。版本信息经 `npm view <pkg> version` 实测（联网核验，核验日期同上）。
> 引用其中行号 / 数字前请按当前代码复核（如 `gameLogic.ts` 在 BUG-01 棋谱持久化后整体行号已下移）。

---

## 1. 依赖清单审计

### 1.1 运行时依赖（3 个）

| 包 | package.json 声明 | 实装（lock） | 必要性 | 判定 |
|---|---|---|---|---|
| `react` | `^18.3.1` | 18.3.1 | 必需 | ✅ 保留 |
| `react-dom` | `^18.3.1` | 18.3.1 | 必需 | ✅ 保留 |
| `react-router-dom` | `^6.28.0` | 6.30.4 | **必要，但成本偏高**（见 §1.3） | ⚠️ 保留，列入观察 |

**结论：三个运行时依赖全部有真实引用，无冗余。** 逐个核验引用点：

- `react` / `react-dom`：`src/main.tsx:1-2`（`createRoot`）、`src/App.tsx:1`、全部 12 个组件/页面。
- `react-router-dom`：`src/main.tsx:3`（`BrowserRouter`）、`src/App.tsx:1-4`（`Routes`/`Route` × 3）、`src/pages/Home.tsx:3`（`useNavigate`）、`src/pages/Room.tsx:2`（`useNavigate` + `useParams`）、`src/pages/AIGame.tsx:2`（`useNavigate`）。

除此之外**无任何运行时第三方依赖** —— 规则引擎、AI、音效、统计、房间码全部为项目自研零依赖模块。这个约束被严格执行，`package.json:20-23` 的 `dependencies` 只有 3 项可直接印证。

### 1.2 开发依赖版本风险

实测最新版本（`npm view`，2026-10-12）对比：

| 包 | 声明 | 实装 | 最新 | 落后跨度 | 风险 |
|---|---|---|---|---|---|
| `vite` | `^6.0.7` | 6.4.3 | **8.3.4**（6.x 线最新 6.4.4） | 跨 **2 个大版本** | 🟡 中 |
| `vitest` | `^3.2.7` | 3.2.7 | **5.0.3** | 跨 2 个大版本 | 🟡 中 |
| `@vitejs/plugin-react` | `^4.3.4` | 4.7.0 | **6.1.2** | 跨 2 个大版本 | 🟡 中 |
| `tailwindcss` | `^4.0.0` | 4.3.3 | **4.3.3** | 同版本 | 🟢 低 |
| `@tailwindcss/vite` | `^4.0.0` | 4.3.3 | 4.3.3 | 同版本 | 🟢 低 |
| `typescript` | `^5.7.2` | 5.9.3 | **7.0.2** | 跨 1 个大版本 | 🟡 中 |
| `@playwright/test` | `^1.62.1` | 1.62.1 | **1.64.0** | 2 个 patch | 🟢 低 |
| `jsdom` | `^30.0.1` | 30.x | — | — | 🟢 低 |

**风险判定与建议**：

- **Vite 6 / Vitest 3 / plugin-react 4 三件套同时落后 2 个大版本，是本项目最大的工具链债。** 但升级必须在同一批次做（这三者互相锁版本，单独升一个会引入 peer 冲突），且 `vite.config.ts` 用了 `defineConfig` from `vitest/config`（`vite.config.ts:1`）—— 这行本身就依赖 vitest 与 vite 的版本耦合。CI（`.github/workflows/ci.yml`）已覆盖 typecheck + vitest + Playwright 三道关，升级有安全网。**建议：Phase 7 单开一个「工具链升级」任务，一次升到 vite 8 / vitest 5 / plugin-react 6，勿在打磨期动。**
- **TypeScript 5.9 → 7.0** 是跨大版本，`tsconfig.json` 的严格设置与 `edge-functions/types.ts` 的手写最小类型（`types.ts:1-20`）都可能受影响。**建议同上，同批处理。**
- Tailwind v4 与 `@tailwindcss/vite` **已是最新**，无风险。
- `package.json:6-8` 的 `engines` 声明 `^22.22.2 || ^24.15.0 || >=26`，与 CI 的 `node-version: 24`（`ci.yml`）一致，本机实测 Node v22.22.2 亦在范围内。**这一约束来自 jsdom 30 / undici 8 的 Node 要求，注释已说明，属正确的防御性约束。**

### 1.3 `react-router-dom` 的成本收益（唯一可议的运行时依赖）

**成本**：仅 3 条路由（`App.tsx:9-11`：`/`、`/room/:roomId`、`/ai`），却引入整个 React Router 生态；对产物体积的贡献包含在 64.27 KB gzip 的 `index.js` 中（React 18 + ReactDOM 本身约 40+ KB gzip，Router 及其依赖大致再占 15–25 KB gzip —— **此拆分为估算，未做 bundle 分析器实测**）。

**替代方案**：约 20 行手写路由 —— 读 `location.pathname` 匹配 `/room/:roomId`、派发到对应页面、`pushState` 导航。项目的路由需求极简（3 条、无嵌套、无 loader、无鉴权门）。

**判定**：**不换。** 理由：(a) 手写路由要自己处理 `popstate`、404、可访问性焦点管理，收益（~20 KB gzip）不足以抵消引入回归的风险；(b) 200 KB raw 的整体体积对当前项目已远低于预算（B1 余量 15.7 KB gzip，见 `performance-budget.md`）；(c) 打磨期改路由层是典型的高风险低收益变更。**建议：维持现状，此条仅作为「若未来体积成为硬约束」的预案记录在案。**

### 1.4 Tailwind v4 与 Vite 插件配置健康度

| 检查项 | 位置 | 结论 |
|---|---|---|
| 插件注册 | `vite.config.ts:3,25`（`import tailwindcss from '@tailwindcss/vite'` → `plugins: [react(), tailwindcss(), mockApiPlugin()]`） | ✅ v4 官方推荐方式，无废弃的 `@tailwind base/components/utilities` 指令残留 |
| CSS 入口 | `src/main.tsx:5` `import './index.css'` | ✅ 正确 |
| Tailwind 层叠 | `src/index.css` | ✅ 手写组件类（`.card`/`.board-grid`/`.cell`/`.disc-*`/`.btn-*`）与 utilities 共存，无 `@layer` 冲突告警 |
| 生产环境扫描 | 构建日志 52 modules，无 warning | ✅ 无 content 配置缺失 |
| PostCSS 配置 | 无 `postcss.config.*` | ✅ v4 不需要，配置正确 |

**配置健康。** 唯一注意点：`vite.config.ts:36-39` 的 `emptyOutDir: false` 是环境妥协（注释已说明 Vite 清空 `dist` 触发 safe-delete 拦截），副作用是陈旧 chunk 残留，已记入 `performance-budget.md` §3.5。**这是有意识的权衡，不是配置错误。**

---

## 2. 资产清单：「零资产」策略评估

### 2.1 事实清单（经文件系统与代码核验）

| 资产类别 | 数量 | 实现方式 | 证据 |
|---|---|---|---|
| 音频文件 | **0** | Web Audio API 振荡器 + 指数包络实时合成 | `src/utils/sound.ts:75-90`（`tone()`）、`:92-94`（`arp()`）；6 个音效 `playPlace/Flip/Pass/Win/Lose/Draw/Invalid`（`:97-139`） |
| 位图（png/jpg/webp/gif） | **0** | 无 | 全项目无图片引用 |
| 字体文件 | **0** | 系统字体栈 | `src/index.css` 无 `@font-face` |
| SVG 图标 | **0 个文件**，内联组件 | 手写 `<svg>`，统一 `base(size)` 描边参数 | `src/components/icons.tsx:8-22`（`CopyIcon`/`RestartIcon`/`HomeIcon`/`HistoryIcon`/`CloseIcon`/`SoundOnIcon`/`SoundOffIcon`，共 103 行）；`src/pages/Home.tsx:7-14`（`Logo` 双色棋子 SVG） |
| 棋子 | **0 张图片** | 纯 CSS 圆形 + 渐变 + 双面 3D 结构 | `src/index.css` `.disc-black`/`.disc-white`（`:260,281,289` 阴影）、`.disc-flip-container`/`.disc-face-front/back`（`:303-322`） |
| 棋盘纹理 | **0 张图片** | CSS 渐变叠加模拟木纹 | `src/index.css:182-193`（`repeating-linear-gradient` 木纹 + `linear-gradient` 光影） |
| 3D 模型 / 字体图标库 | **0** | — | 依赖清单已证 |

**核验方式**：`src/`、`edge-functions/`、`server/`、`e2e/` 全目录扫描无二进制资产；`dist/` 三个产物文件中仅 `index.html`/`index.js`/`index.css`/`ai.worker.js`，无任何图片/音频/字体产物。

### 2.2 收益

1. **构建产物即全部资产**：`dist/` 总计 228 879 B（224 KB），其中陈旧文件占 3.3 KB。首屏只需 `index.js` + `index.css`，无水图、无 preload 链、无字体 FOUT/CLS —— 这直接兑现了 `performance-budget.md` 中 CSS 5.44 KB gzip 的成绩。
2. **无版权风险**：不存在第三方素材授权问题。
3. **无外部网络依赖**：即使 EdgeOne CDN 的静态资源全部失效，JS/CSS 本体仍自包含。
4. **首屏无请求瀑布**：没有图片/字体请求与 JS 竞争带宽。
5. **音效零成本、零延迟**：`sound.ts` 的合成音在用户手势后立即播放（`sound.ts:58-60` 懒 `resume()`），不存在音频文件下载延迟导致的「音效慢半拍」。
6. **深浅色主题零成本**：棋子与棋盘全用 CSS 变量（`var(--disc-black)`/`var(--board-cell)` 等），切主题无需替换任何资源（`src/utils/theme.ts`、`src/components/ThemeToggle.tsx`）。

### 2.3 代价

| 代价 | 具体表现 | 严重度 | 判定 |
|---|---|---|---|
| **视觉表现力天花板** | 棋子是纯渐变圆，无纹理、无立体感；棋盘木纹是 `repeating-linear-gradient` 近似（`index.css:182-190`），近看有重复条纹感 | 🟡 中 | **可接受**：本作是工具型对弈应用而非视觉作品；棋盘纹理不影响可玩性与可读性（棋子与格子的对比度充足） |
| **无法表达「木纹方向随机」等细节** | 渐变平铺天然规整 | 🟢 低 | 可接受 |
| **无图片 CDN 缓存优化空间** | 也**不需要** —— 没有多尺寸/多格式图片要协商 | 🟢 无代价 | 优势 |
| **音效音色受振荡器波形限制** | 只有 `sine`/`triangle`/`square` 三种波形（`sound.ts:69` 的 `OscillatorType`），无采样音色，听感偏「电子」 | 🟡 中 | **可接受**：对弈类应用音效承担的是「落子确认」功能反馈而非氛围营造；`sound.ts:1-4` 的注释显示这是有意借鉴 GameHelix 的方案 |
| **不可静音系统级音量以外的分级** | 只有一个全局开关（`othello_sound`，`sound.ts:13`），无音量滑杆 | 🟢 低 | 可接受，全局开关已满足需求 |
| **Web Audio 手势解锁的边界情况** | 首次播放需 `resume()`（`sound.ts:58-60`），某些浏览器策略下首个音效可能丢失 | 🟢 低 | **已妥善处理**：落子本身即用户手势（`sound.ts:6-8` 注释说明此设计），必然解锁 |
| **`matchMedia` 无障碍降级依赖 CSS 而非 JS** | 已在 CSS 与 JS 双侧处理：`index.css:452-460`（`prefers-reduced-motion` 关闭全部动画）+ `Cell.tsx:36`（JS 侧跳过翻转态） | 🟢 无代价 | 做得比大多数项目好 |

### 2.4 结论

**「零资产」策略成立，建议维持。** 核心理由：本作的全部资产需求（棋子、格子、音效、图标）都是**几何/波形级别的低复杂度需求**，用 CSS 与 Web Audio 表达不仅够用，而且比任何资产方案都更小（省下整个资源目录、构建流水线的一环、以及全部网络请求）。代价集中在视觉表现力，而这不是本作的核心竞争力。

**不建议引入的**：图片棋子、采样音效、图标字体包、字体文件。任何一个引入都会打破 `performance-budget.md` 中已达标且余量充足的体积预算，收益却仅是观感。

---

## 3. 安全面复核

### 3.1 `GET /state` 无鉴权的暴露面

**代码事实**：`edge-functions/api/room/[roomId]/state.ts:7-19` —— 无任何鉴权，持有房间码即可读。

**暴露的数据**：`toPublicState(state)`（`state.ts:18`）。而 `toPublicState` 在 `gameLogic.ts` 的实现是：

```ts
export function toPublicState(state: GameState): GameState {
  return { ...state, players: { black: null, white: null } };
};
```

即**把 `players` 全置 null**，不返回任何 playerId。

**因此 `GET /state` 的实际暴露面**：
- ✅ 棋盘局面（`board`）—— 公开观战本就是设计意图（`Room.tsx:71` 的 `recallRoomColor` 返回 null 即观战者，UI 显式支持「观战中」，`GameInfo.tsx:34`）
- ✅ 回合、状态、步数、最后落子、胜负 —— 同属观战必需信息
- ❌ **playerId —— 零泄漏**（这是本项目安全设计最关键的一条，已在 `gameLogic.ts:308-311` 的注释中显式记录此约束）

**结论：无鉴权的 `GET /state` 是可接受的设计权衡。** 房间码空间为 `32^6 ≈ 10.9 亿`（`roomCode.ts:7`，字符集排除易混的 `0/O/1/I`），暴力枚举不现实；且能读到的东西本来就是公开观战信息。

### 3.2 `toPublicState()` 全路径生效核验（逐个端点）

**五个端点逐一核验**（这是本次审计的重点，因为漏一处就等于 playerId 全量泄漏）：

| # | 端点 | 文件:行 | 是否调用 `toPublicState` | 返回形状 | 判定 |
|---|---|---|---|---|---|
| 1 | `POST /api/room/create` | `create.ts:40` | ✅ `json({ roomId, state: toPublicState(state) }, 201)` | `{roomId, state}` | ✅ 安全 |
| 2 | `POST /api/room/:roomId/join` | `join.ts:39` | ✅ `toPublicState(updated)`（加入成功分支） | `{state}` | ✅ 安全 |
| 2b | 同上（重连分支） | `join.ts:41` | ✅ `toPublicState(state)` | `{state}` | ✅ 安全（**两个 return 分支都覆盖**） |
| 3 | `GET /api/room/:roomId/state` | `state.ts:18` | ✅ `toPublicState(state)` | `{state}` | ✅ 安全 |
| 4 | `POST /api/room/:roomId/move` | `move.ts:54` | ✅ `toPublicState(res.state)` | `{state}` | ✅ 安全 |
| 5 | `POST /api/room/:roomId/restart` | `restart.ts:41` | ✅ `toPublicState(updated)` | `{state}` | ✅ 安全 |

**旁路核验（额外检查所有返回响应的路径）**：
- `http.ts:13-15` 的 `error(message, status)` 只返回 `{error: string}`，不含状态数据 → 全部错误分支天然安全（`create.ts:28,33`、`join.ts:13,25,28,32`、`move.ts:34,38,47,51`、`restart.ts:13,27,33,36`、`state.ts:13,16`）
- `state.ts` 是**唯一无 body 参数**的端点，也无其他出口
- 每个端点都只有单一 `return json(...)` 出口，未发现绕过 `toPublicState` 的分支

**结论：`toPublicState()` 在全部 5 个端点、6 个返回分支上 100% 生效，零遗漏。** 结论可靠，依据是逐行读取全部 6 个端点源文件（非抽样）。

### 3.3 playerId 泄漏风险的整体评估

**playerId 的双重身份**（`player.ts:1-5` 注释已明确定义）：
1. 身份标识（本地持久化，供断线重连）
2. **落子凭证** —— 服务端凭它校验回合归属：`gameLogic.ts:258` `if (state.players[player] !== playerId) return {ok:false, status:409, error:'not your turn'}`

因此 playerId 泄漏 = 可冒充对局双方落子。**泄漏路径逐条排查**：

| 可能泄漏路径 | 核验结果 |
|---|---|
| API 响应体 | ✅ 已封堵，见 §3.2 |
| 前端日志 / console | ✅ 全项目无 `console.log` 残留（已 grep 确认） |
| URL query / hash | ✅ 房���在 path（`/room/:roomId`），playerId 只走 POST body |
| localStorage | ⚠️ **见下** |
| 源码硬编码 | ✅ 无。`ai.ts:30-31` 的 `AI_PLAYER_ID='ai-opponent'` / `LOCAL_PLAYER_ID='local-player'` 是**纯本地人机模式的常量**（`ai.ts:311-321` 的 `createAIGameState` 使用），不参与联网鉴权 |

**localStorage 的实际暴露**：`player.ts:9` 键 `othello_player_id` → playerId；`player.ts:12` 键 `othello_room_color_<roomId>` → 自己的颜色。

- **同源 XSS 即可读取全部** —— 这是 localStorage 方案的固有属性。
- **跨源不可读** —— 浏览器同源策略保护。
- **共享设备风险**：换人用同一浏览器 → 沿用前一人 playerId。若前一人曾在某房间执黑，新人打开该房间会**被识别为黑方**（`Room.tsx:71` 的 `recallRoomColor`）。此时 `myColor='black'`，UI 显示「轮到你落子」，但 `postMove` 带的 playerId 确实匹配服务端 → **可以替前一人落子**。

**判定**：
- localStorage 存储 playerId —— 🟢 **可接受**。「不注册不登录 + localStorage 持久化」是明确的产品决策（`player.ts:1-3`），16 字符 base36 ≈ 82 bit 熵（`player.ts:4`）由 `crypto.getRandomValues` 生成（`player.ts:16-17`），**不可猜测**。残余风险仅限共享设备物理接触 + XSS，两者都不在当前威胁模型内。
- 共享设备上的「颜色记忆继承」—— 🟡 **低危体验缺陷，非安全漏洞**。UI 不会误显示（因为服务端也确实认这个人是黑方），只是产品语义上「换人」没有会话边界。**本轮不修**（修它需要引入会话/房间退出机制，属新功能，超出打磨期范围）。记入技术债。

### 3.4 其他安全面核验

| 面 | 核验结果 |
|---|---|
| **落子输入校验** | ✅ 完整。`gameLogic.ts:262-271` 校验 `Number.isInteger` + 范围，且注释（`:261`）记录了一个真实教训：「整数检查必须在数组下标访问之前，`board[3.5]` 为 undefined，再取列会抛 TypeError」。随后 `:272-274` 校验落子合法性 |
| **restart 鉴权** | ✅ 三重校验：仅 `status === 'finished'`（`restart.ts:26-28`）、`playerId` 非空（`:31-34`）、必须是房间内玩家（`:35-37` 返回 403）。注释明说「避免被任意请求重置对局」 |
| **join 幂等与房间满** | ✅ `join.ts:31-33` 房间满判定、`join.ts:36-41` 白方空位才加入、否则视为重连 |
| **create 无鉴权** | 🟡 **任何人可无限创建房间**。每个房间 KV TTL 24 h（`kv.ts:16`），持续恶意创建会消耗配额。**判定：低危**（房间码 10.9 亿空间，创建无收益，且未见计费/配额临界）。缓解措施零成本可加：`create.ts` 无频率限制 —— **本轮不修**，记入技术债 |
| **房间码冲突处理** | ✅ `create.ts:11-17` 最多重试 20 次，兜底用时间戳后缀 |
| **KV 值损坏处理** | ✅ `kv.ts:34-39` `try/catch` 包 `JSON.parse`，损坏当作房间不存在，避免未捕获异常变 500 |
| **缓存头** | ✅ `http.ts:8` 统一 `Cache-Control: no-store`，状态响应不会被 CDN 缓存（**这一条很关键**：若被缓存，轮询会读到陈旧状态） |
| **传输加密** | 前端 `api.ts:3` `BASE='/api'` 相对路径 → 随页面走 HTTPS。`router.ts:66` 构造的 `https://router.local` 仅用于本地测试 |
| **CSP / 安全响应头** | ❌ **未设置**。`index.html:1-13` 无 meta CSP，`http.ts` 未设 `X-Content-Type-Options`/`X-Frame-Options`。`edgeone.json` 只配了 SPA fallback（`rewrites`）与两条 `Cache-Control`（`headers`）—— **不含任何安全类响应头**。**判定：低危** —— 应用零用户生成内容、无第三方脚本、无 iframe 嵌入需求，XSS 面积极小；`X-Frame-Options: DENY` 可防点击劫持（本作无被嵌入价值） |
| **localStorage 配额/隐私模式** | ✅ 全部写入点都包了 `try/catch`：`stats.ts:34-40`、`sound.ts:34-38`、`player.ts:28-33`（后者未包，但 localStorage 读取失败会返回 null→生成新 id，不崩溃）。✅ |
| **`Math.random` 兜底** | 🟡 `player.ts:18-20` 与 `roomCode.ts:28-30` 在无 `crypto` 时退回 `Math.random`（`Math.random` 熵低于 `crypto.getRandomValues`）。**判定：低危** —— 仅影响无 crypto 的极端环境；现代浏览器与 Node ≥ 19 均有 `globalThis.crypto`。注：`ai.ts:246` 的 `rng = Math.random` 是**故意**用于 easy 难度的可注入随机源，非安全用途 |

### 3.5 安全小结

**做得好的（无需改动）**：
1. `toPublicState()` 在 5 端点 / 6 分支 100% 生效 —— 关键安全约束已落实
2. 落子输入的整数 + 范围 + 合法性三重校验，且带一条从真实 bug 提炼的注释
3. 乐观并发控制（`move.ts:43-48`）防止并发覆盖，等价于防「重复提交刷步」
4. `Cache-Control: no-store` 防 CDN 缓存污染
5. playerId 用 crypto 随机，82 bit 熵
6. KV 解析失败优雅降级，不 500

**待办（均已记入技术债，不阻塞发布）**：
1. 🟡 无 CSP / 无 `X-Frame-Options`
2. 🟡 `create` 无速率限制
3. 🟡 共享设备上的颜色记忆继承

---

## 4. 必须人工验证的项（不联网 / 本机无法判定）

以下条目**必须由人工在真实环境验证**，本审计无法给出结论。请勿把本文档当作这些项的验收依据。

| # | 待验证项 | 为何本机无法验证 | 建议验证方式 |
|---|---|---|---|
| V1 | **EdgeOne KV 的真实读写语义**：是否强一致？读后写是否可见？`expirationTtl` 是否被平台真实支持？ | `edge-functions/types.ts:6-10` 是**手写的最小类型声明**（注释明说「真实类型由 EdgeOne 平台在运行时注入」），本机用的是 `server/mockApi.ts:18` 的内存 `Map` 替身。KV 的最终一致性行为直接决定 `move.ts:43-48` 的乐观并发是否可靠 | 部署后双窗口并发落子测试；确认平台是否支持 `expirationTtl`；确认 KV 是否存在额外的传播延迟 |
| V2 | **真实平台网络 RTT 与轮询的实际「落子→对方可见」延迟**（对应 `performance-budget.md` B6） | 本机无 EdgeOne 网络 | 部署后双窗口实测：一方落子 → 另一方看到的时间差，测 20 次取 P50/P95。预算 ≤ 2.4 s |
| V3 | **`edgeone.json` 的 rewrite 规则是否真的不误伤 `/api/*`** | 配置语义由平台决定。**2026-10-12 已改**：`rewrites` 现为官方 SPA fallback 精确形式 `{ "source": "/*", "destination": "/index.html" }`（原先是自造的 `/(.*)` + `has: accept: text/html`，见 [`ADR-0006`](adr/ADR-0006-spa-fallback-official-form.md)）。官方文档承诺「先匹配静态资源与函数，未命中才回退首页」，因此 `/api/*` 与 `/assets/*` 理论上不会被吞 —— **但该承诺本身仍须实测确认** | 部署后 `curl -i https://<域名>/api/room/XXXXXX/state`，确认返回 `application/json` 而非 `index.html`。⚠️ **不能只看状态码**：SPA fallback 下未命中的路径会回退成 `index.html` 并返回 `200`，故必须核 `Content-Type` / body |
| V4 | **Edge Functions 文件路由与本地 `lib/router.ts` 的一致性** | `lib/router.ts:1-9` 的注释记录了一次真实事故：「曾因此出现『测试绿但生产 join 路由坏』」。该镜像路由**无法保证**与平台的文件路由规则永远同步 | 部署后逐一 `curl` 五个端点（含动态段 `[roomId]`），确认全部命中 |
| V5 | **`kv.ts:24-26` 的 `context.env.OTHELLO_KV` 绑定在生产环境是否真的注入** | 若未注入，所有端点返回 503 `storage not configured`，前端降级提示（`api.ts:18-19` 的 `STORAGE_HINT`）。这是设计好的降级路径，但**生产是否走 KV 还是走降级，本机无从得知** | 部署后 `curl -X POST https://<域名>/api/room/create -d '{"playerId":"probe"}'`，看返回 201 还是 503 |
| V6 | **KV 24 h TTL 的实际回收行为** | `kv.ts:16` `ROOM_TTL_SECONDS = 86400`，注释称「每次写入都会刷新该 TTL」——**此行为需平台确认**。若 TTL 不刷新，进行中的对局可能被回收 | 建一个房间，等待并观察是否被回收 |
| V7 | **生产环境 Tailwind CSS 是否完整生成** | 本机构建无 warning，但生产 CDN 上的 CSS 内容与本机 `dist` 是否一致需实测（尤其 `index.css` 里的 CSS 变量主题是否生效） | 部署后查看页面源与 DevTools → Network → CSS |
| V8 | **`new Worker(new URL(...), {type:'module'})` 在目标浏览器矩阵中的可用性** | `AIGame.tsx:66` 有 try/catch + 主线程兜底（`:158-161`），但兜底路径**未经真机验证**，且 module worker 在旧浏览器上会失败 → 落回主线程 → master 难度会有 1.5 s 卡顿 | 在目标浏览器（尤其移动端 WebView）实测人机对战；观察 DevTools Performance 是否有长任务 |
| V9 | **外部事实核验说明** | §1.2 的版本号经 `npm view` 实测（2026-10-12，联网核验通过）。但**「最新版本」会随时间推移失效**，本表仅在核验日有效 | 升级前重新核验 |

---

## 5. 结论

1. **依赖面健康**：3 个运行时依赖全部必要、零冗余；Tailwind v4 + Vite 插件配置正确、已是最新版本；Tailwind 无需 PostCSS 配置这件事做对了。唯一系统性债务是 Vite/Vitest/plugin-react/TS 四件套落后 2 个大版本，应在 Phase 7 单开批次升级（CI 三道关提供安全网），**勿在打磨期动**。
2. **「零资产」策略成立，建议维持**：0 音频 / 0 位图 / 0 字体文件 / 0 SVG 文件，棋子与棋盘全 CSS，音效全 Web Audio 合成。收益是首屏 61 KB brotli、零版权风险、零请求瀑布、主题切换零成本；代价仅是视觉表现力与音色丰富度，而这不是本作的核心竞争力。**不建议引入图片棋子 / 采样音效 / 图标字体包** —— 任何一个都会打破已达标且有 15.7 KB 余量的体积预算。
3. **安全面基本健康，关键防线已落实**：`toPublicState()` 在 5 个端点、6 个返回分支上 100% 生效（逐行核验，非抽样），playerId 零泄漏；`GET /state` 无鉴权但只暴露公开观战信息，且房间码空间 10.9 亿不可枚举；落子 / restart / join 的输入与权限校验完整；`no-store` 防 CDN 缓存污染。遗留三项低危（无 CSP/X-Frame-Options、create 无速率限制、共享设备颜色记忆继承），**均不阻塞发布**。
4. **9 项必须人工验证**，其中最关键三项为 **V1（KV 真实一致性，决定乐观并发是否可靠）**、**V3（rewrite 是否误伤 `/api/*`）**、**V5（生产是否真的绑定了 KV，还是全量走降级路径）**。

# 黑白棋在线对战（othello-online）· 竞品生态简报

> 复核日期：2026-09-03（初版 2026-09-01，本次按 GitHub API 全量复核并重写结论）
> 复核方式：GitHub GraphQL API 核验仓库存续 / 星标 / 活跃度 → 读取仓库 `package.json` 与 README 核验技术栈 → Exa 检索补齐生态
> 适用范围：本仓库是**纯前端 + 自研多等级 AI，无引擎进程、无常驻服务端**。非同栈项目（Flutter / C++ / Python+pygame）不作为对标对象，仅列作体验参照。
> 数据口径：星标与最后提交时间均为 2026-09-03 实测值，会随时间漂移，引用前请自行复核。

---

## 〇、先读这三条

1. **初版的对标样本不成立。** 原清单 12 项合计仅 21★，其中 8 项为 0★，且 `Captnjo/reversi` 经 API 核验**并不存在**（该用户名下有且仅有 `deadbolt / homebrew-tap / pulsecheck`）。初版"整体优于绝大多数竞品"的结论建立在这批僵尸项目之上，本版予以撤销。

2. **真正值得对标的只有两个对象。** 工程完备度看 [`cozyGarage/Othello`](https://github.com/cozyGarage/Othello)（0★，但 2026-08-30 仍在活跃维护，工程链完整）；AI 棋力看 [`Egaroucid`](https://github.com/Nyanyan/Egaroucid)（172★，世界冠军级）。星标数低不等于质量低——cozyGarage 就是反例。

3. **"造轮子"的风险只在联机层。** 规则引擎与 AI **必须自研**（Edge Functions 禁 npm 包，见第一节判断），不算重复造轮子；但"房间码 + 轮询"这套联机机制，`boardgame.io` 等成熟框架已有现成实现，仅在"坚持零常驻 Serverless"的前提下才值得自研。

---

## 一、现成轮子盘点：哪些该用，哪些用不了

调研目的是"哪些轮子已经存在"，因此这一节排在竞品清单之前。

| 轮子 | 形态 | 能力 | 本项目是否适用 |
|------|------|------|----------------|
| [`boardgame.io`](https://boardgame.io) / [`board-game-engine`](https://www.npmjs.com/package/board-game-engine) | 联机框架（含 Othello 规则定义） | 房间、大厅、多人状态同步、合法着法高亮 | **仅当接受常驻 Node 服务时才值得迁移**；与本项目"零常驻 Serverless"目标冲突，当前不采用 |
| [`othello.js`](https://github.com/mtripg6666tdr/othello.js) | npm，纯 TS 零依赖规则实现 | 规则 + 事件（`black/white/finish`） | ❌ 不可用：Edge Functions 禁 npm 包（见下方判断） |
| [`reversi-logic`](https://github.com/naosim/reversi-logic) | npm，无 UI 的纯逻辑库 | 不可变 board、`placeDisk` | ❌ 同上 |
| [`thaw-reversi-engine.ts`](https://github.com/tom-weatherhead/thaw-reversi-engine.ts) | npm 引擎 | α-β 剪枝 + 启发式，`findBestMove(board, player, maxPly)` | ❌ 同上；且其评估函数不弱于本项目 `hard` 档，可作对照参考 |
| [`othello-danyo`](https://github.com/dhong9/othello-danyo) | npm | Minimax + Q-learning 强化学习、FEN 记谱 | ❌ 同上；**FEN 记谱法值得借鉴**，可作残局库/局面存档格式 |
| [`@gui-chat-plugin/othello`](https://github.com/receptron/GUIChatPluginOthello) | Vue 插件 | 合法着法提示、终局判定 | ❌ React 栈不兼容；仅作交互参照 |

### 关键判断：为什么本项目自研规则引擎不算"重复造轮子"

Edge Functions 是 V8 runtime，**不允许 import npm 包**（`AGENTS.md` 关键架构约束 1）。这意味着任何 npm 形态的规则库都无法在服务端复用。而本项目要让"前后端共用同一套规则"（防止规则漂移的核心手段），规则引擎就必须是**零依赖纯 TS**——即现在的 `src/utils/gameLogic.ts`。因此自研规则层是被部署环境倒逼的正确选择，不是重复造轮子。

同理，AI 引擎跑在 Web Worker 里、要按难度分级与 UI 深度耦合，引入外部引擎收益有限。

> **结论**：本节真正需要决策的只有一项——**联机层是否继续自研**。只要坚持"零常驻 Serverless + KV"，自研房间码就是唯一解；若未来愿意接受常驻服务，应直接迁移到 `boardgame.io` / Colyseus，而不是继续自研。

---

## 二、AI 棋力参照系（初版完全缺失的一节）

本项目的 AI 是"自研多等级"，但初版只与几个 hobby 项目比深度，缺乏客观标尺。

### 2.1 世界级参照

| 项目 | 星标 | 技术要点 | 对本项目的价值 |
|------|------|----------|----------------|
| [`Nyanyan/Egaroucid`](https://github.com/Nyanyan/Egaroucid) | **172** | bitboard（2×64bit）+ SIMD（AVX2，比通用版快约 1.5×）、Negascout（Minimax 系）、Logistello 模式评估（Buro 1997/1999）、**60 阶段评估函数**、训练数据 **32 亿+ 局面**、Adam 优化；残局用轻量评估做 move ordering（MAE 4.2 子） | CodinGame Othello 世界冠军（2021 / 2023 / 2025）。**提供 `Egaroucid for Web`（浏览器可玩）与实验性 C ABI 引擎库** |
| [`okuhara/edax-reversi-AVX`](https://github.com/okuhara/edax-reversi-AVX) | — | bitboard + 多线程 + 精确中局评估 + 开局库学习 + 多协议（GGS） | Edax 4.4.0 的 SSE/AVX 优化版；上游为 [`abulmo/edax-reversi`](https://github.com/abulmo/edax-reversi) 4.6 |

### 2.2 客观基准（可直接用来量化本项目 AI）

- **FFO 残局测试集**（`fforum-20-39` / `fforum-40-59`）：完全求解残局的耗时与 NPS，是行业通用速度基准。Egaroucid 7.7.0 在 i9-13900K 上解 `fforum-40-59` 约 20.7s（SIMD）/ 31.9s（Generic），Edax 约 22.8–27.5s。
- **XOT 开局**：用于避免对局重复棋路，做胜率统计时应当使用。
- **对局指标**：胜率 + 平均子差。Egaroucid 7.7.0 对 Edax 4.5.5 在 Level 1 为胜率 0.726、平均 +10.92 子。

### 2.3 一条对本项目有直接指导价值的结论

Egaroucid 作者实测过 NNUE（将棋/国象的小网络评估）在黑白棋上的表现：128 输入（bitboard 直连）→ 两层 32 节点全连接 + ReLU，其对训练数据的 **MAE 为 5.4 子，明显劣于模式评估的 3.5 子**，结论是"并非完全没可能，但做出高性能评估函数相当困难"。

→ **本项目走"位置权重矩阵 + 机动性 + 角位"的路线方向正确，不必去追神经网络。**

### 2.4 本项目 `master` 档的准确定位

初版称本项目 master 档相对竞品"中上水平"，这一判断偏高：`cozyGarage/Othello` 的 `hard` 档是 **Timed iterative-deepening minimax + α-β + shared evaluation**，与本项目 master 档（迭代加深 + 残局精确搜索）**架构同构**。

两者的真实差距不在算法框架，而在：
1. **评估函数质量**——本项目是手工位置权重，Egaroucid 是 60 阶段、32 亿局面训练拟合；
2. **搜索速度**——本项目用数组棋盘，Egaroucid/Edax 用 bitboard + SIMD。

**可量化的下一步**：
- 棋盘改用 **bitboard（2×64bit）** 重写合法着法生成与翻转计算，浏览器内通常可直接加深 2–3 层；
- 用 FFO 子集（如 `fforum-40-59`）做残局求解速度基准，量化 master 档；
- 让 master 档与 **Egaroucid for Web** 对打若干局，得到胜率/平均子差的客观定位。

---

## 三、同类完整应用（GitHub 实测）

> 均为 2026-09-03 实测。⚠️ 标记表示初版描述与实测不符。

| # | 仓库 | ★ | 最后提交 | 主语言 | 状态与说明 |
|---|------|---|----------|--------|------------|
| — | ~~`Captnjo/reversi`~~ | — | — | — | ⚠️ **不存在（404）**。该用户名下无此仓库。初版在清单、对比表、优势 1、不足 1 共 4 处引用了它，本版全部移除 |
| 1 | [`cozyGarage/Othello`](https://github.com/cozyGarage/Othello) | 0 | **2026-08-30** | TS | **最值得对标**：monorepo（`othello-engine` + `othello-react`）、Bun 1.3.4 + Vite 5.4.21 + TS 5.9.3 + React 18.2.0；144 引擎测试 + 169 React 测试（=313，已核实 README badge）；撤销/重做；**棋类计时**（Bullet 1+0 / Blitz 3+2 / Rapid 10+5 / Classical 30+20，含 Fischer 加秒、超时判定、10 秒音频警告）；husky + commitlint + eslint + prettier + type-check 全链路；deploy/test 双 workflow badges；GitHub Pages 已上线 |
| 2 | [`GameHelix/othello`](https://github.com/GameHelix/othello) | 0 | 2026-03-09 | TS | 已核验 `package.json`：`next@16.1.6`、`react@19.2.3`、`framer-motion@^12.35.2`、`tailwindcss@^4`。UX/动效参照。注：初版所述"Web Audio 音效"未在依赖中体现（Web Audio 是浏览器原生 API，需读源码确认，暂标未证实） |
| 3 | [`OrangeX4/Reversi`](https://github.com/OrangeX4/Reversi) | **17** | 2022-03-28 | TS | ⚠️ 初版写作 `orangex4/reversi`（大小写与仓库名均不符）。12 项中唯一有星标者；React + Ant Design + Python 后端 AI |
| 4 | [`felipeap92/othello-game`](https://github.com/felipeap92/othello-game) | 3 | 2020-06-16 | TS | 停滞约 6 年。Colyseus 联机 + AI 可插拔，分层架构有参考价值 |
| 5 | [`zhiliangxu/othello-game-ts`](https://github.com/zhiliangxu/othello-game-ts) | 0 | 2025-08-11 | TS | 技术栈与本项目最接近（React + Vite + Vitest，Minimax + α-β） |
| 6 | [`Agrannya-Singh/Othello-Dojo`](https://github.com/Agrannya-Singh/Othello-Dojo) | 1 | 2026-08-03 | TS | Next.js + Gemini 走子建议与决策解说，教育向；LLM 解说思路可借鉴 |
| 7 | [`diwasrimal/reversi-web`](https://github.com/diwasrimal/reversi-web) | 0 | 2024-12-28 | JS | 原生 JS + WebSocket，房间码 + 随机匹配，Render 部署 |
| 8 | [`calvinchan999/reversi`](https://github.com/calvinchan999/reversi) | 0 | 2024-09-06 | JS | Socket.IO + Redis，含聊天、走子历史、i18n（英/繁中） |
| 9 | [`d3r3k-d4nk/Othello-game-flutter`](https://github.com/d3r3k-d4nk/Othello-game-flutter) | 0 | 2025-05-28 | Dart | ⚠️ **`isFork: true`**，非原创作品，参考价值打折。非同栈，仅作体验参照 |
| 10 | [`rytlebsk/Reversi`](https://github.com/rytlebsk/Reversi) | 0 | 2025-04-17 | **C++** | ⚠️ 初版未提主语言为 C++。非同栈，仅作体验参照 |
| 11 | [`jbrun0r/Othello-PDP`](https://github.com/jbrun0r/Othello-PDP) | 0 | 2025-01-09 | Python | pygame + RPC，局域网双人。非同栈，仅作体验参照 |

**样本说明**：11 个有效项中 7 个 0★，合计 21★；真正"活跃维护 + 工程完备"的只有 cozyGarage（0★ 但持续更新）。这批样本**不足以支撑任何"领先"论断**——初版正是据此得出了过于乐观的结论。

---

## 四、横向对比（修正版）

| 维度 | **本项目** | cozyGarage/Othello（唯一活跃对标） | 其余样本 |
|------|-----------|-----------------------------------|----------|
| 前端栈 | React 18 + Vite 6 + TS + Tailwind v4 | React 18.2 + Vite 5.4 + TS 5.9 + Bun | 原生 JS / Next.js 居多 |
| 联机 | Edge Functions(V8) + KV，前端轮询 | 无联机（单机） | 多为 Socket.IO/Colyseus/常驻服务 |
| 部署成本 | **零常驻**（EdgeOne Makers 免费额度） | GitHub Pages（零成本） | 多数需常驻服务 |
| AI | Minimax+αβ，4 档；位置权重+机动性；hard/master 迭代加深(800/1500ms)+残局精确 | 3 档；**hard = 定时迭代加深 + αβ + 共享评估**（与本项目 master 同构） | 多为贪心/随机或深度受限 αβ |
| 安全 | `toPublicState()` 剥离 playerId；乐观锁 `expectedUpdatedAt` | 单机无此问题 | hobby 项目普遍未做隔离 |
| 测试 | 13 文件 109 用例 + Playwright 双窗口 E2E + CI | **313 用例**（144 引擎 + 169 React）+ CI + badges | 多数零测试 |
| 工程规范 | 有 AGENTS.md 约束与 4 份文档；**无 lint/prettier/commitlint/husky** | **husky + commitlint + eslint + prettier + type-check 全链路** | 多为单 README |
| 社区资产 | **无 LICENSE / badges / CONTRIBUTING** | 有 deploy/test badges | — |

---

## 五、真实优势（收紧后的表述）

1. **零常驻 Serverless 联机**：Edge Functions + KV，无常驻进程、无长连接，免费额度即可联机对战。对比需要常驻 Node/Python 服务的项目（felipeap92、calvinchan999、diwasrimal），运维成本优势是真实的。
2. **安全设计有专业度**：`toPublicState()` 剥离 `playerId`，`GET /state` 无鉴权也不泄露落子凭证；`applyMoveToState` 内置回合归属校验。这是多数 hobby 项目没有的意识。
3. **联机一致性务实处理**：`move.ts` 用 `expectedUpdatedAt` 做乐观并发控制，冲突返回 409 让客户端重拉重试；前端用 `updatedAt` 过滤 KV 最终一致性的陈旧数据。
4. **前后端共用零依赖规则引擎**：`src/utils/gameLogic.ts` 被 Edge Functions 直接复用，规则不会前后端漂移——这是被 Edge 禁 npm 包约束倒逼出的合理架构。
5. **提示开关与可点击解耦**：`interactive` 与 `isHint` 是两个独立集合，关闭提示后棋盘仍可点击。

---

## 六、差距清单（诚实版，含被反超项）

### 6.1 工程规范与社区资产：实际落后于 cozyGarage
- 本项目**无 eslint / prettier / commitlint / husky**，cozyGarage 有完整链路；
- 本项目**无 LICENSE / badges / CONTRIBUTING**，cozyGarage 有 deploy/test 双 badge。
- 这一项在初版"优势"中被写作"工程规范与文档优于平均"，与实际不符，本版改列差距。

### 6.2 功能完备度
- **无棋类计时**（cozyGarage 有 4 种时限 + Fischer 加秒 + 超时判定 + 音频警告）；
- **无撤销/重做**（cozyGarage 有完整走子历史 + 键盘快捷键）；
- **无认输 / 对手离开检测 / 断线重连**：对手消失后本端只会持续轮询；
- **无 i18n**：UI 仅中文；
- **无持久化**：刷新后无法恢复对局（cozyGarage 有 Persistence）。

### 6.3 联机实时性（表述修正）
`Room.tsx:95` 为 `pollEnabled = !myTurn`——**自己回合完全不轮询**，因此感知延迟只发生在"等待对手落子"时，最长约 2s（`playing` 间隔 2000ms；`waiting` 3000ms、`finished` 5000ms）。初版笼统写成"轮询带来 2–5s 延迟"不够精确，但对"等待时手感偏钝"的判断仍成立。

### 6.4 部署门槛
`docs/deployment.md` 已记载 EdgeOne KV 内测/名单开放问题，未开通则 `/api/room/create` 直接 500。**该说法具时效性，引用前需重新向平台确认。**

### 6.5 环境门槛（2026-09-01 刚踩过的坑）
`jsdom@30` / `undici@8` 要求 Node `^22.22.2 || ^24.15.0 || >=26`。CI 曾配 Node 20，导致 `webidl.util.markAsUncloneable is not a function` 而整体崩溃。现已改为 Node 24，并在 `package.json` 声明 `engines`、README 标注版本要求。

---

## 七、下一步建议（仅保留未完成项）

| 优先级 | 事项 | 说明 |
|--------|------|------|
| **P0** | 补 `LICENSE`（MIT）+ README badges（build/test/license） | 几行成本，是对外展示的硬性门槛 |
| **P0** | 让 `master` 档与 **Egaroucid for Web** 对打若干局 | 得到胜率/平均子差，把"AI 强度"从主观描述变成可量化指标 |
| **P1** | 引入 eslint + prettier（+ 可选 husky/commitlint） | 对齐 cozyGarage 的工程底线 |
| **P1** | 棋盘改 **bitboard（2×64bit）** | 合法着法生成与翻转计算提速，浏览器内通常可加深 2–3 层 |
| **P2** | 补认输 / 对手离开提示 / 断线重连；用 KV TTL 清理孤儿房间 | 补齐对局生命周期管理 |
| **P2** | 评估 `boardgame.io` 迁移可行性 | 仅在愿意接受常驻 Node 服务时考虑；否则维持自研房间码 |
| **P3** | i18n、撤销/重做、棋类计时、对局持久化 | 功能完备度补齐，直接对标 cozyGarage |

---

## 八、结论（修正自评）

本项目的**差异化**是真实且清晰的：零常驻 Serverless 联机、playerId 安全隔离、乐观并发控制、前后端共用的零依赖规则引擎——这套组合在 GitHub 同类 hobby 项目里并不常见。

但初版"整体优于绝大多数竞品、工程规范优于平均"的自评**不成立**：其依据是 12 个合计 21★、多数已停更的僵尸项目（其中一个根本不存在）。按实测数据，本项目在**工程规范完备度（无 lint 链）、社区资产（无 LICENSE/badges）、功能完备度（无计时/撤销/持久化）**三个维度上，被 0★ 但活跃维护的 `cozyGarage/Othello` 明确反超；AI 方面 master 档与其 hard 档架构同构，谈不上"中上水平"的领先。

**定位建议**：把本项目定位为"Serverless 联机架构 + 安全细节的样板工程"，而非"功能与工程完备度全面领先的产品"。前者的差异化是真的，后者经不起核验。


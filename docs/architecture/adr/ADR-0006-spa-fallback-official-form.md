# ADR-0006：SPA fallback 采用平台官方精确形式，移除自造的 `has` 条件

- **状态**：已采纳（Accepted）
- **日期**：2026-10-12
- **决策者**：技术负责人
- **相关代码/配置**：`edgeone.json`（`rewrites`）、`docs/deployment.md` §3（已于 2026-10-12 同步修正）、`docs/prd.md` §10.4（已于 2026-10-12 同步修正）、`docs/release/asset-cache-strategy.md` §4.2、`docs/release/go-live-checklist.md` B.1 / B.2 / B.3 / B.4 / B.6 / C8 / C9

> **文档同步状态（2026-10-12）**：本决策涉及的六处文档已全部一致 —— `edgeone.json`（配置本体）、本 ADR、`deployment.md` §3、`prd.md` §10.4、`asset-cache-strategy.md` §4.x、`go-live-checklist.md` B/C 段。`prd.md` §10.4 与 `deployment.md` §3 均在各自原文中写明了「请勿再加回 `has` 条件」。

---

## 背景

`/room/:roomId` 是前端路由（SPA）。EdgeOne Makers **不会**自动把未知路径回退到 `index.html`，所以必须显式配置 SPA fallback，否则「刷新房间页」与「分享出去的房间深链」都会 404（`docs/prd.md:73`）。

本项目此前的配置（当时记录于 `docs/prd.md` §10.4「方案 A（推荐）」；该节已于 2026-10-12 改写为下文的新形式）是：

```json
{ "rewrites": [
    { "source": "/(.*)", "destination": "/index.html",
      "has": { "type": "header", "key": "accept", "value": "text/html" } } ] }
```

设计意图是：**只对 HTML 请求回退**，从而「静态资源如 `/assets/*.js` 不受影响」，也避免把 `/api/*` 的响应吞成首页。

但这个写法有三个**未经核验的假设**，而它保护的是本项目最核心的分享能力（房间深链），不能建立在假设上：

1. 假设 `/(.*)` 是平台支持的 `source` 写法；
2. 假设 `has` 是 `edgeone.json` 支持的字段；
3. 假设「带条件的普通 rewrite」能承担 SPA fallback 的职责。

## 决策

**改为平台官方文档给出的 SPA fallback 精确形式，不再自行加条件：**

```json
{ "rewrites": [ { "source": "/*", "destination": "/index.html" } ] }
```

依据（EdgeOne 官方 `edgeone.json` 文档，中英文两版一致）：

> **SPA 前端路由**：对于以 `/index.html` 为入口的单页应用，可通过以下配置显式声明 SPA fallback：`{ "rewrites": [ { "source": "/*", "destination": "/index.html" } ] }`
> Makers 会将该**精确配置**识别为 SPA fallback：请求**优先匹配项目中的其他路由（包括静态资源和函数）**，仅在未命中任何其他路由时返回 `/index.html`，并交由前端路由处理。**该规则不会作为普通重写规则生效。**

即：**「先匹配静态资源与函数、未命中才回退」这条保证是平台内建的** —— 它恰好就是原先那段 `has: accept: text/html` 想手工达成的效果，而且比手工条件**更强**（手工条件只区分「请求头像不像浏览器」，无法区分「路径是否真的存在」）。

同时修正三处与此冲突的旧假设：

| 旧假设 | 实际情况（官方文档） |
|---|---|
| `/(.*)` 是合法 `source` | `source` 是**路径匹配语法**（精确路径 / `:id` 占位符 / `*` 通配 / `*.png` 带后缀），**最多一个 `*`**，且明确「`*` 是 URL 路径通配符，不是文件系统 Glob，也不是正则」。`(.*)` 不在四种形式之中 |
| `has` 可用于 `edgeone.json` | `edgeone.json` 的 `rewrites` 只记载 `source` / `destination`；`has` / `missing` 出现在**构建输出 API**（`.edgeone/config.json` 的 `routes[].src`，那里才是 RE2 正则）中，是**另一套配置面** |
| 普通 rewrite 能做 SPA fallback | 官方文档的 `rewrites` 章节只在「SPA 前端路由」小节给出了上面那一种形式；官方《反向代理》一文更直接写明「Rewrites do not support frontend route rewriting for SPA」 |

## 后果

**正面**

- **语义从「未文档化」变为「已文档化」**。这是本决策的主要收益：房间深链是分享出去的、无法事后补救的资源，其可用性不应依赖对平台行为的猜测。
- **`/api/*` 与 `/assets/*` 的不被误伤由平台内建保证**（「包括静态资源和函数」），不再依赖客户端 `Accept` 头恰好是 `*/*` 这种**巧合**。
- **配置回归到 `edgeone.json` 的受支持字段面**，消除「`has` 被忽略 → rewrite 退化为无条件 catch-all」这一类静默失效的可能。
- **不需要区分请求头就能得到一致行为**：浏览器导航、`curl`、`fetch` 走同一套「先匹配、后回退」逻辑，线上验证不再需要为「带不带 `Accept`」做特判。

**负面 / 代价（必须知道）**

1. **不存在的路径现在返回首页而不是 404。** 例如 `/api/room/typo/state`、`/assets/index-<旧hash>.js` 都会拿到 `index.html`（HTML，`200`）。**代价是配置错误变得更隐蔽**：以前一个拼错的端点会明确 404，现在会被回退成 HTML 200。
   **缓解**：上线校验不能只看状态码，必须**校验 body 的类型/内容**（`Content-Type: application/json` / body 以 `{` 开头）。`go-live-checklist.md` 的 B.3 / B.4 已按此调整口径。
2. **与 `/assets/*` 的 `immutable` 头部存在叠加**：一个**已不存在**的哈希资源 URL，可能返回 HTML 且被 `/assets/*` 规则标为 `immutable`（一年）。理论上会让某个旧 URL 在浏览器侧长期存着 HTML。
   **实际影响低**：哈希 URL 由 `index.html` 生成，而 `index.html` 是 `no-cache`（见 `asset-cache-strategy.md` §4），浏览器不会「学到」已经不存在的哈希 URL；风险集中在**部署瞬间仍开着旧标签页、且去请求已被清掉的旧 chunk** 这一窄窗口。
   **不额外处理**，记入观察项（`go-live-checklist.md` C 段）。
3. **`has` 移除后，超时/非 HTML 客户端（如监控探针）访问未知路径也会拿到 HTML 200**。对我们的场景无实际影响。

## 替代方案

| 方案 | 为何未采纳 |
|---|---|
| **A. 官方精确形式 `/* → /index.html`** | **采纳。** 唯一被平台文档明确识别为 SPA fallback 的形式，且自带「静态资源与函数优先匹配」语义。 |
| **B. 保持 `/(.*)` + `has: accept: text/html`** | **否决。** 三重未核验假设（见背景）；`has` 不在 `edgeone.json` 的受支持字段内；`/(.*)` 不在文档的四种 `source` 形式内；且官方《反向代理》文档明确「rewrites 不支持 SPA 前端路由重写」。最坏情况不是「不生效」，而是**`has` 被忽略后退化为无条件的 `/(.*) → /index.html`**，那会把静态资源也重写成 HTML，属灾难性且静默。**这是本决策最关键的否决理由。** |
| **C. catch-all 函数 `edge-functions/[[default]].ts`** | 是官方给出的另一条路（`prd.md` §10.4 方案 B）。**否决**：把一个纯静态托管问题变成需要部署、需要与 `/api/*` 文件路由共存、需要自己读取并返回 `index.html` 内容的运行时组件；`router.ts` 的注释记录过「测试绿但生产 join 路由坏」的事故，说明项目对**平台文件路由的不确定性**已有教训，不宜再往部署路径里加代码。若 A 在真实环境被证伪（见「失效条件」），C 是**首选备选**。 |
| **D. 改用 hash 路由（`/#/room/:id`）** | **否决**：`/room/:id` 是**可分享的深链**（产品需求），hash 路由会改变分享形态且不受服务端控制，等于用产品降级换取工程省事。 |
| **E. 什么都不做（接受深链 404）** | **否决**：直接破坏「分享房间链接」这一核心流程。 |

## 验证与失效条件

**归档约束（`edgeone.json` 的字段限制，已用脚本校验）**：`rewrites` ≤ 100 条、`source`/`destination` ≤ 500 字符、`source` 必须以 `/` 开头；`headers` ≤ 30 条、key 1–100 字符、value 1–1000 字符且不支持中文。

**必须在真实部署后验证（静态配置无法在本地证实）**：

- `go-live-checklist.md` **B.6 ②**：`/`、`/assets/index-<hash>.js`、`/room/some-id` 三条 `cache-control` + **状态码**（期望均为 `200`）。
- `go-live-checklist.md` **B.3 / B.4**：逐个端点的 **body 类型**（不能是 HTML）——这是本 ADR「负面 1」的直接对策。
- **最关键的一条**：真实浏览器打开 `/room/<ROOM>` 深链（或对房间页按 F5），必须渲染棋盘而不是 404 —— 即 `e2e/reconnect.spec.ts` 覆盖的路径（本机 Playwright 环境异常，**未在本轮执行**，属已知缺口）。

**失效条件（应重新评估本决策）**：

1. 「`/* → /index.html` 精确形式」在真实环境**未**被识别为 SPA fallback（深链仍 404）→ 立即转为**替代方案 C**（catch-all 函数），并回填本 ADR。
2. 平台推出独立的、显式的 SPA 配置项（如 `"spa": true`）→ 改为使用该配置项。
3. 平台行为变化导致 `/api/*` 或 `/assets/*` 被回退到 HTML → 按替代方案 C 处理，或在 `rewrites` 中显式加回 `/api/*`、`/assets/*` 的排除规则（**需先确认平台对多条 rewrite 的优先级语义**）。
4. 迁离 EdgeOne Makers → 本 ADR 连同 `edgeone.json` 一起替换。

---

## 附：证据

- EdgeOne Makers `edgeone.json` 官方文档（中文，含「SPA 前端路由」小节）：<https://cloud.tencent.com/document/api/614/127389>
- 同上（英文）：<https://pages.edgeone.ai/document/edgeone-json>
- EdgeOne《使用 Pages 作为反向代理》（含「Rewrites do not support frontend route rewriting for SPA」与 30 条上限的说法）：<https://pages.edgeone.ai/resources/use-pages-as-reverse-proxy>
- 构建输出 API（`has` / `missing` / RE2 `src` 的**真正**归属地）：<https://edgeone.ai/zh/document/204988861724463104>

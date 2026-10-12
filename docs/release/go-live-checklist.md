# 上线检查清单

> 项目：`othello-online`（React + Vite 前端 / EdgeOne Makers Edge Functions + KV 后端）
> 用法：**每次合并到 `main` 之前**走一遍 A 块；**合并发布之后**按 B 块在真实环境自查。
> 相关：[`versioning.md`](versioning.md)（版本号规范）、[`asset-cache-strategy.md`](asset-cache-strategy.md)（产物命名与缓存策略）、[`../../CHANGELOG.md`](../../CHANGELOG.md)、[`../deployment.md`](../deployment.md)（部署步骤，既有资产，本文件不重复）。
> 约定：下文 `<你的域名>` 一律替换成你实际访问的地址。

**本清单的重心是 A 块**：那是合并之前、在你自己电脑上就能确认的东西，也是唯一能**提前拦住问题**的一环。B 块是合并后的线上确认，多数需要你手动操作，部分项在当前环境下未必测得成（会明确标注）。

---

## A. 合并前（本机可确认 · 重心）

> 这些项全部在你本机完成，不依赖线上环境。**全绿再合并。**

- [ ] **A1 版本号已升。** `package.json` 的 `version` 已改，且与 `CHANGELOG.md` 最新条目的版本号一致。
      *为什么必做*：版本号是**人类可读的发布标识** —— 只有它对得上号，出问题时才能快速回答「线上跑的是哪一版、那一版改了什么」。产物名虽然带内容哈希，但哈希不是给人读的。详见 [`versioning.md`](versioning.md) §3。
- [ ] **A2 CHANGELOG 已落条目。** `Unreleased` 的内容已移到新版本号下并写上发布日期；「未发布」字样已去掉。
- [ ] **A3 类型检查通过。** `npm run typecheck`
- [ ] **A4 单元 / 组件测试通过。** `npm test`
- [ ] **A5 双窗口 E2E 通过。** `npm run test:e2e`
      - E2E 默认端口 **5273**（刻意避开 5173），且**不会复用**已在运行的服务 —— 这是为了避免把端口上别的项目当成自己的应用来测。
      - 若报「端口被占」：`E2E_PORT=5274 npm run test:e2e`。
      - 若命令挂了很久才结束、或退出码非 0 但用例全绿：属于 Windows 下 vite 进程回收的已知现象（已由 `scripts/serve-e2e.mjs` 处理），若仍复现，看该脚本是否被绕过。
- [ ] **A6 跨端数据形状检查**（改了接口/对局状态时必做）。若本次动了 `GameState` 的字段，确认：**只新增、不删除、不改名**；`server/mockApi.ts` 与 `edge-functions/` 两侧行为一致。
      *为什么*：已打开旧标签页的玩家不会随发版刷新，线上会短暂存在「旧前端 + 新后端」，不兼容的字段改动会打断正在进行的对局。详见 [`versioning.md`](versioning.md) §4。
- [ ] **A7 构建产物正确。**
      ```bash
      npm run build && ls dist/ dist/assets/
      ```
      期望 `dist/` 下共 4 个文件：`index.html`、`assets/index-<hash>.js`、`assets/index-<hash>.css`、`assets/ai.worker-<hash>.js`（worker 同样带哈希，属正常）。
      同时确认**没有上一版的残留**：若出现**两份** `ai.worker-*.js`，说明输出目录没被清空 —— 回看 `vite.config.ts` 的注释与 [`versioning.md`](versioning.md) §3。
      - 本项只校验**本机构建结果**；这些改动**是否已提交**见 A8（产物名带哈希 + 清空输出目录这两项改动目前仍在工作区）。
      - 已实测参考（2026-10-12）：`EXIT=0`；产出 `index-DsGNGShv.js` / `index-CWKVhQgF.css` / `ai.worker-DASYiwcF.js`；陈旧的那份 worker 已被清掉；连续两次构建哈希一致（构建确定性 OK）。
- [ ] **A8 工作区是干净的、该提交的都提交了。** `git status`
      *这一条最容易翻车*：**未提交的改动不会被平台部署**。当前工作区就有一批未提交的改动（棋谱修复、`docs/architecture/`、`tests/playtest/`、E2E 相关），不提交等于这次修复根本没上线。
- [ ] **A9 记录上线前的实例指纹**（用于发布后判断客户端有没有拿到新版本）
      ```bash
      ls dist/assets/                                              # 记下本次构建的 index-<hash>.js 文件名
      curl -s https://<你的域名>/ | grep -o 'assets/index-[^"]*'   # 记下线上当前引用的文件名
      ```
      把两者都抄下来。首次上线（线上还什么都没有）可以填「首次上线，无基线」。

---

## B. 合并发布之后（真实环境自查）

> 用户的工作流：**合并到 `main` → 平台自动构建发布**。B 块就是发布后确认它「真的生效了」。

### B.0 关于预览链接（客观说明，不是故障排查）

如果你现在用的是形如 `https://xxxxx.edgeone.cool/?eo_token=...&eo_time=...` 的地址，需要知道它的规则（依据：EdgeOne Makers 官方「域名管理概览」，链接见文末，已于 2026-10-12 核验）：

- 当项目的加速区域含**中国大陆**时，通过项目域名 / 部署域名访问**必须使用系统生成的预览链接**，该链接**有效期为 3 小时，超时后返回 401**。这是平台的**内容合规机制**。
- 预览链接可在控制台「**项目概览**」界面右上角的「**预览**」按钮**定期刷新**。
- 另外，成功部署记录超过 3 个之后，平台只保留最近 3 次的构建产物，更早的部署记录会过期并对访问返回 401（可用「重新部署」恢复）。
- **因此预览链接不适合作为长期分享给玩家的地址。** 想长期稳定访问，需要绑定**自定义域名**；加速区域含中国大陆时，自定义域名需完成 ICP 备案（选择「全球可用区（不含中国大陆）」则不要求备案，但中国大陆网络环境需经预览链接访问）。

> 对你的意义：**预览链接只是给自己短暂看一眼新版用的。** 这个游戏的用途是邀请朋友联机下棋，所以要真的对外能玩，得绑一个已备案的自定义域名。

**用 curl 测预览链接上的接口时，必须带上同样的 query 参数**（预览链路的校验在最外层，任何路径都需要），例如：

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  "https://<你的域名>/api/room/state?eo_token=<token>&eo_time=<time>"
```

### B.1 先确认能打开

```bash
curl -s -o /dev/null -w "首页 HTTP %{http_code}\n" https://<你的域名>/
# 想更接近真实浏览器可加 -H "Accept: text/html"；当前 SPA fallback 与请求头无关，两者结果应一致
```

- **通过**：`200`。
- 若为 `401`：先读上面的 **B.0「关于预览链接」** —— 大多数情况下这不是故障，而是预览链路的正常机制。去控制台点一次「预览」换新链接再试。
- 若为 `404`：按当前的 SPA fallback（`/* → /index.html`，见 B.3），**几乎任何路径都会回退到首页**，所以首页 404 基本只可能意味着 `index.html` 不存在 —— 先查平台构建是否成功（与缓存无关）。

### B.2 V5 · 生产是否真的绑定了 KV

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST https://<你的域名>/api/room/create \
  -H 'Content-Type: application/json' \
  -d '{"playerId":"probe"}'
```

- **通过**：`HTTP 201`，且 body 形如 `{"roomId":"XXXXXX","state":{...}}`，`roomId` 是 6 位房间码。
- **未通过**：`HTTP 503` 且 body 为 `{"error":"storage not configured"}` → 生产没有拿到 `OTHELLO_KV` 绑定，联机功能会全部不可用（前端会提示「后端存储(KV)尚未配置…」）。属于**配置遗漏**，需在控制台把 KV 命名空间绑定到本项目（变量名 `OTHELLO_KV`）后重新部署。
- ⚠️ **别把「路由没命中」误诊成「KV 没绑定」**：若这里拿到的是 HTML（`200`、body 是首页），那是 `create` 端点没进函数、被 SPA fallback 兜走了（见 B.3/B.4 的判据说明），与 KV 无关。
- 把返回的 `roomId` 记下来，后面几步要用（下文记作 `<ROOM>`）。

### B.3 V3 · SPA 重写是否误伤 `/api/*`

```bash
curl -s -D - -o /tmp/state.json "https://<你的域名>/api/room/<ROOM>/state"
```

- **通过**：`HTTP 200`、`Content-Type: application/json`、body 以 `{` 开头（形如 `{"state":{...}}`），且响应头含 `Cache-Control: no-store`。
- ⚠️ **判据是 body 类型，不是状态码。** 自 2026-10-12 起 SPA fallback 采用平台的官方精确形式 `{ "source": "/*", "destination": "/index.html" }`，平台语义为「**优先匹配静态资源与函数，未命中才回退首页**」，因此 `/api/*` 理论上不会被吞 —— **但这个承诺本身必须实测**（论证、代价与失效条件见 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)）。
- **未通过**：拿到 `text/html`（body 是 `<!doctype html>` 或首页内容）→ API 请求没进函数、被 SPA fallback 兜到了首页。此时**务必看清状态码**：fallback 会把未命中的路径也返回 **`200` + HTML**（不再是 `404`），所以「看到 200 就算过」在这里会把「路由坏掉」看成「通过」。
- **简记（状态码与 body 各自管什么）**：**状态码只能用来发现「连首页都没返回」；要判断「是不是走到了正确的处理器」，只能看 `Content-Type` / body。** 二者不是二选一 —— `200` 是**必要不充分条件**。（B.6 ③ 同样要看 200，也是这个道理，不是两套标准。）
- 命令保持裸 `curl`（不加 `Accept`）：**不是因为加了会改变结果**（fallback 与请求头无关），而是因为**前端是用 `fetch` 调这些接口的、`fetch` 默认 `Accept: */*`** —— 这条命令的价值就是忠实模拟真实流量。

### B.4 V4 · 平台的文件路由是否与本地镜像一致

逐一执行五条（连同 B.3 一共五个端点）：

```bash
# 1) create
curl -s -o /dev/null -w "create   %{http_code}\n" -X POST https://<你的域名>/api/room/create \
  -H 'Content-Type: application/json' -d '{"playerId":"probe"}'

# 2) join（动态段 [roomId]；换个 playerId 代表第二位玩家）
curl -s -o /dev/null -w "join     %{http_code}\n" -X POST https://<你的域名>/api/room/<ROOM>/join \
  -H 'Content-Type: application/json' -d '{"roomId":"<ROOM>","playerId":"probe2"}'

# 3) state
curl -s -o /dev/null -w "state    %{http_code}\n" "https://<你的域名>/api/room/<ROOM>/state"

# 4) move（probe 执黑先手，2/3 是黑棋首步的合法位置）
curl -s -o /dev/null -w "move     %{http_code}\n" -X POST https://<你的域名>/api/room/<ROOM>/move \
  -H 'Content-Type: application/json' -d '{"playerId":"probe","row":2,"col":3}'

# 5) restart（此时对局未结束，应被拒绝 —— 返回 409 才说明路由通且业务校验生效）
curl -s -o /dev/null -w "restart  %{http_code}\n" -X POST https://<你的域名>/api/room/<ROOM>/restart \
  -H 'Content-Type: application/json' -d '{"playerId":"probe"}'
```

- **通过**：`create 201` / `join 200` / `state 200` / `move 200` / `restart 409`，且**每个响应都是 JSON**（`Content-Type: application/json`、body 以 `{` 开头）。
- `restart 409` **是预期结果**（对局还没结束），不是失败；若返回 `200`，说明「仅终局可重开」的校验没生效。
- ⚠️ **若某个端点返回 HTML**（状态码是 **`200`**、body 是 `<!doctype html>` 或首页内容）→ **该端点的函数路由没命中**，请求被 SPA fallback 兜到了首页。检查 `edge-functions/api/room/` 下的目录与文件名。
- ⚠️ **不要再按「404」判断路由是否命中。** 自 2026-10-12 起 SPA fallback 为官方精确形式，**未命中的路径会返回首页、且状态码是 `200`**；因此这条验证的唯一可靠判据是 **body 类型**。只看状态码会把「路由坏了」看成「通过」—— 这正是本次配置变更的主要代价（见 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)「负面 1」）。
- **为什么必须逐个测**：`edge-functions/lib/router.ts` 的注释记录过一次真实事故 —— 「测试绿但生产 join 路由坏」。本地镜像路由无法保证永远与平台的文件路由一致。

> **状态说明（2026-10-12）**：V3 / V4 / V5 在本轮**均未执行过**（当时手头只有短期有效的预览链接）。上表就是给你在真实环境自查用的；测完把结论回填到本节，避免下次又当成「已验过」。

### B.5 双窗口 + F5 刷新（人工 · 最重要的一项）

> QA 的判定：这是**唯一同时满足「零容忍」+「此前无任何证据」+「自动化只能证明数据对不对、证不了人看不看得懂」**的一条路径。

1. 打开 **一个普通窗口** + **一个无痕窗口**。
   ⚠️ **必须是一个普通窗口 + 一个无痕窗口**：同一个浏览器 profile 下的两个普通窗口**共享 localStorage**，会被服务器认成同一个玩家 —— 这是最常见的「假失败」原因。
2. 普通窗口：首页「创建房间」→ 记下 6 位房间码（你是黑棋）。
3. 无痕窗口：输入房间码「加入」（你是白棋）。
4. 交替落子 **4 手**：两边计分一致、轮到谁提示明确（同步延迟目标 ≤ 2.4 秒，顺手记一下秒数）。
5. **普通窗口按 F5 刷新** ← 关键动作。刷新回来后逐条确认：
   - [ ] 仍在同一对局，房间码没变
   - [ ] 自己**仍是黑棋**（没有黑白颠倒）
   - [ ] 比分与刷新前一致，棋盘每个子的位置一致
   - [ ] **走子记录显示「4 手」，且第 1 手点开「回顾」能看到正确棋形** ← 本次修复的验收点（修复前这里会退化成「1 手」）
   - [ ] 轮到自己时能正常落子
6. 刷新后再落 1 手，另一个窗口能正常收到。
7. 走到终局，**逐格点一遍**，确认「终局比分 = 棋盘实际黑/白子数」。
8. 点「再来一局」：棋盘清空、比分归零、黑棋先手；另一个窗口**不用刷新**也能进入新对局。

**通过判据：以上 8 步全过。**

### B.6 缓存行为确认（必做）

**⚠️ 前提：响应头只有发版之后才生效。** `edgeone.json` 已声明两条 `Cache-Control` 规则（`/*` → `no-cache`；`/assets/*` → 一年 + `immutable`），但**本次部署之前测到的仍是平台默认行为，不算数** —— 所以这一步必须在部署完成后跑。

**① 线上 `index.html` 引用的文件名 = 本次构建产物**
```bash
# 线上当前引用的文件名
curl -s https://<你的域名>/ | grep -o 'assets/index-[^"]*'

# 本地本次构建的文件名
ls dist/assets/
```
- **通过**：两边的 hash 一致。
- 不一致 → 线上还是旧版：先在控制台确认构建已完成，再查是否被中间缓存挡住。

**② 声明的响应头是否真的生效（第 2 条是规则优先级的判别器）**

```bash
# ① 首页
curl -sI https://<你的域名>/ \
  | grep -iE "^(HTTP/|cache-control)"
#    期望：HTTP/... 200 + cache-control: no-cache

# ② 哈希资源
curl -sI https://<你的域名>/assets/index-<hash>.js \
  | grep -iE "^(HTTP/|cache-control)"
#    期望：HTTP/... 200 + public, max-age=31536000, immutable

# ③ SPA 深链 —— 关键（Accept 可带可不带，见下）
curl -sI https://<你的域名>/room/some-id \
  | grep -iE "^(HTTP/|cache-control)"
#    期望：HTTP/... 200 + cache-control: no-cache
```

- **通过**：三条都同时满足「状态码 **200**」与「缓存头符合期望」。
- ⚠️ **状态码要判，但判它的理由变了。** 自 2026-10-12 起 SPA fallback 采用官方精确形式（`/* → /index.html`），**与 `Accept` 头无关**，所以第 ③ 条**不再必须**带 `Accept: text/html`（想更接近真实浏览器可以加，两者结果应一致）。仍然要看状态码，是因为 **`no-cache` 这个值在 `404` 响应上也会出现** —— 只有 `HTTP/... 200` 才能证明请求真的命中了 `index.html`，而不是一个恰好也带 `no-cache` 的错误页。
- **对照探针（建议做，一次性验证 fallback 语义）**：第 ③ 条分别跑「不带 Accept」与「带 Accept」两条命令，**两者都应返回 `200 + no-cache`**。若结果不同（例如不带 Accept 时 404），说明线上 fallback 不是官方精确形式下的行为 —— 按 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md) 的失效条件处理，**不要去调 `headers`**。
- 第 ③ 条若返回 `404`：问题在 **SPA fallback（`rewrites`）**、不在 `headers` —— 两类失败分开报。
- 若 `-I`（HEAD）在平台上表现异常（少数 CDN 对 HEAD 不走 fallback），改用 GET 只看头部：
  ```bash
  curl -s -o /dev/null -D - https://<你的域名>/room/some-id | grep -iE "^(HTTP/|cache-control)"
  ```
- **第 3 条是关键**：`/room/:id` 是分享出去的房间深链入口，必须和首页同为 `no-cache`。否则那个链接日后就永远指向旧版本 —— 这是本项目最容易漏、后果最直接的一条。
- 第 2 条返回长缓存是**期望结果**（文件名带哈希，安全），不是风险。
- **若第 1 或第 3 条返回了较大的 `max-age`（且状态码为 200）**：说明 `headers` 规则**根本没生效** —— 这两条路径只命中 `/*`，**不涉及规则重叠**，所以与优先级无关。兜底方案：改回**白名单式**写法 —— 不用 `/*` 兜底，而是逐条列出 HTML 入口（`/`、`/room/*` 等）配 `no-cache`。**把结果反馈给工程侧。**
- **若第 2 条返回的不是长缓存**：**这才是规则优先级问题**。`/*` 与 `/assets/*` 重叠，而平台**未文档化**优先级。**第 2 条就是优先级的判别器**：返回 `immutable` → 平台是「末条命中」语义，当前顺序（`/*` 在前）已最优；返回 `no-cache` → 平台是「首条命中」语义，此时**把两条 `headers` 规则交换顺序**即可拿到长缓存收益（交换后请顺带复核第 ①②③ 条仍为 `200 + no-cache`）。注意：**交换顺序不影响正确性**，只影响哈希资源能否拿到长缓存。
- 细节与理由见 [`asset-cache-strategy.md`](asset-cache-strategy.md) §4 / §4.1 / §4.2。

**③ 浏览器端拿到的不是旧代码**
1. 开**无痕窗口**访问 `https://<你的域名>/`（无痕没有本地缓存，拿到的必然是当前线上版本）。新功能/修复应当可见。
2. 再用**之前访问过该站点的普通窗口**打开一次：表现应与无痕窗口一致；若仍是旧行为，按 **Ctrl+Shift+R**（macOS 为 Cmd+Shift+R）强刷确认。
3. 想在 DevTools → Network 里核实时：看加载的是不是 ① 里那个 `index-<hash>.js`。
- **通过判据：无痕窗口表现 = 普通窗口表现 = 你本次发布预期。三者有一个不符，就不能宣布发布成功。**

### B.7 其他线上项（建议同期看，非阻塞）

| # | 项 | 怎么做 | 通过判据 |
|---|---|---|---|
| V7 | 生产 CSS 是否完整生成 | 先取文件名再取内容：`CSS=$(curl -s https://<你的域名>/ \| grep -o 'assets/index-[^"]*\.css') && curl -s "https://<你的域名>/$CSS" \| grep -c 'disc-black'` | 输出 ≥ 1 |
| V8 | Web Worker 在目标浏览器（尤其手机 WebView）可用 | 手机浏览器打一局「大师」难度 | 界面不冻结（Worker 不可用时退回主线程，会有可感卡顿） |
| V6 | 房间状态 24h 有效期是否被平台支持 | 建一个房间，隔一段时间再看是否被提前回收 | 进行中的对局不消失 |

---

## C. 已知情况与风险（不需要动作，但要知道）

| # | 情况 | 说明 |
|---|---|---|
| C1 | 预览链接限时 | 3 小时有效、超时 401；这是含中国大陆加速区域的合规机制，会在控制台「项目概览」右上角「预览」按钮刷新。**不适合作为分享给玩家的地址。** |
| C2 | 部署记录过期 | 成功部署超过 3 次后，更早的部署域名会过期并返回 401（可用「重新部署」恢复）。 |
| C3 | 前端产物缓存风险 | ✅ **已于 2026-10-12 修复**：产物名改为带内容哈希，发版后 URL 变化，老用户不会被留在旧代码上。此前产物名被固定为 `assets/index.js`（无哈希），成因是一次关于本机构建环境的误判，已被复测推翻。<br>⚠️ **若有人把固定文件名或 `emptyOutDir: false` 改回来，风险立即复现** —— 见 `vite.config.ts` 注释与 [`versioning.md`](versioning.md) §3。 |
| C4 | `dist/` 残留旧产物 | ✅ **已于 2026-10-12 修复**：构建恢复清空输出目录（`emptyOutDir: true`），上一版残留文件不会再被一起上传。A7 会顺带确认这一点。 |
| C5 | 旧标签页不会被强制刷新 | 线上会短暂新旧混跑，因此接口必须保持向后兼容（只加字段）。详见 [`versioning.md`](versioning.md) §4。 |
| C6 | KV 最终一致性 | 平台特性（约数十秒级传播）。靠 `currentTurn` + `updatedAt` 缓解。若实测「落子→对方可见」明显超过 2.4 秒，记入观察。 |
| C7 | 无 CSP / `X-Frame-Options`、`create` 接口无频率限制、共享设备上的执子色记忆继承 | 均为低危，已记入技术债，不阻塞发布。 |
| C8 | `edgeone.json` 的两类改动**都要发版才生效** | `headers`（`/*` → `no-cache`、`/assets/*` → 一年 `immutable`）与 `rewrites`（SPA fallback 改官方精确形式）**在部署前都不生效**，线上仍是旧行为。因此 B.3 / B.4 / B.6 必须在本次部署**之后**跑，否则测的是上一次的配置。详见 [`asset-cache-strategy.md`](asset-cache-strategy.md) §4.1 / §4.2。 |
| C9 | SPA fallback 语义变更的代价：**未命中的路径不再 404，而是返回首页 HTML 200** | ✅ 这是「改用官方精确形式」换来的确定行为（换取的是「不再依赖未文档化配置」）。代价是**配置错误变得更隐蔽** —— 以前拼错的端点会明确 404，现在会被回退成 HTML 200。**对策：所有路由类判据一律看 body 类型，不看状态码**（B.3/B.4 已按此调整）。<br>　同源的窄窗口观察项：一个**已不存在**的哈希资源 URL 现在会返回 HTML，并可能被 `/assets/*` 规则标为 `immutable`。实际影响低（`index.html` 是 `no-cache`，浏览器不会「学到」失效 URL），嫌疑集中在「部署瞬间仍开着旧标签页」。详见 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)「负面 1 / 2」。 |

---

## D. 怎么算「这次发布成功」

**全部满足才算成功：**

- [ ] A 块全绿（且已提交、已合并到 `main`）
- [ ] B.1 首页返回 200
- [ ] B.2 / B.3 / B.4 按各自判据通过（即 V5 / V3 / V4）—— **判据是响应 body 类型为 JSON，不是状态码**
- [ ] B.5 双窗口 + F5 刷新 8 步全过
- [ ] B.6 缓存三项确认通过（含第 ③ 条的对照探针：带/不带 `Accept` 结果一致）

**发现问题时**：

1. 判断影响面：整站打不开 / 联机全废 → 最优先。
2. 回滚：在控制台「构建与部署」记录里，对上一个正常部署执行「重新部署」即可恢复（本项目没有 deploy job，回滚在控制台做；Git 侧回滚提交同样会触发一次自动部署）。
3. 记录：把现象、时间、判定写进 `CHANGELOG.md` 与缺陷模板 `tests/playtest/bug-report-template.md`。
4. ⚠️ 回滚后**务必再跑一次 B.6**：URL 里带的是内容哈希，光看地址无法判断你拿到的是回滚前还是回滚后的文件；浏览器与中间层也可能还缓存着旧的那一份。

---

## 引用来源（均已核验可访问，2026-10-12）

- EdgeOne Makers 域名管理概览（中文）：<https://edgeone.ai/zh/document/175201428447723520>
- Domain Management Overview（英文）：<https://pages.edgeone.ai/document/domain-overview>
- 部署概览（部署生命周期 / 过期规则）：<https://edgeone.ai/document/173005620251889664>

配置侧的依据（`rewrites` 官方精确形式、`headers` 字段限制、SPA fallback 的失效条件）集中在项目内 ADR，本文不重复列外部链接：

- [`ADR-0006`：SPA fallback 采用平台官方精确形式](../architecture/adr/ADR-0006-spa-fallback-official-form.md)（含全部官方文档出处与失效条件）
- [`asset-cache-strategy.md`](asset-cache-strategy.md)：产物命名、缓存响应头与「待实测项」

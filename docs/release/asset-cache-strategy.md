# 前端产物缓存策略

> 这份文档是「前端产物怎么命名、怎么缓存」的**单一出处**，供 `vite.config.ts` 的注释引用。
> 由来：2026-10-12 修正了一次关于构建环境的误判（详见 §3）。相关：[`versioning.md`](versioning.md) §3、[`go-live-checklist.md`](go-live-checklist.md) 的「缓存行为确认」、[`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)（SPA fallback 形式，见本文 §4.2）。

## 1. 当前策略（2026-10-12 起）

| 项 | 配置 | 效果 |
|---|---|---|
| 产物文件名 | **带内容哈希**（Vite 默认），如 `assets/index-DsGNGShv.js`、`assets/index-CWKVhQgF.css` | 内容一变，URL 就变 → 浏览器与 CDN 会自然取到新文件 |
| 输出目录 | `emptyOutDir: true`（构建前清空 `dist/`） | 不再残留、上传上一版产物 |
| `index.html`（及 `/room/:id` 等 SPA 路由入口） | 引用着带哈希的 JS 文件名 | **已声明 `no-cache`**（见 §4），否则用户拿不到新的引用 |

一句话：**哈希文件名负责「让新文件能被拿到」，`index.html` 的短缓存负责「让用户知道有新文件」。** 两者缺一不可 —— 只做哈希而 `index.html` 被长缓存，用户仍然会一直在旧版本上。

## 2. 责任边界

- **`/assets/index-<hash>.js`、`/assets/index-<hash>.css`**：内容随文件名变化，**可以**配长缓存（一年 + `immutable`）。这是哈希文件名带来的收益。
- **`/`（`index.html`）与 `/room/:id` 等 SPA 路由入口**：必须 `no-cache` 或很短的有效期 —— 否则用户连新的 JS 引用都拿不到，分享出去的房间深链也会永远指向旧版本。
- **`/api/*`**：接口响应由后端统一带 `Cache-Control: no-store`（`edge-functions/lib/http.ts`），不受前端缓存策略影响。

以上三条**已在 `edgeone.json` 显式声明为 `headers` 规则**（2026-10-12 落地，见 §4）；静态配置层面不再有空白，剩余工作只是「上线后实测它是否真的生效」（§4.1）。

## 3. 为什么不是「固定文件名」——历史与防回退

2026-10-12 之前，本项目曾把产物名固定为 `assets/index.js`（无哈希）并关闭输出目录清空，理由是「本机 Vite 清空 `dist` 会触发安全删除（safe-delete）拦截导致构建失败」。复测结论：**该理由不成立** ——

1. Vite 清空 `outDir` 走的是内部 Node 文件系统调用，**不经过 shell**，与本机的 safe-delete 包装无关（当时的报错是 `ERROR_FILE_NOT_FOUND 0x80070002`，属瞬时失败而非策略拦截）；
2. `vite build --emptyOutDir` 实测 `EXIT=0`，并成功清掉了陈旧的 `ai.worker-5T0219aS.js`。

固定文件名带来两个后果，均已消除：

| # | 后果 | 现状 |
|---|---|---|
| A | 发版后 JS 的 URL 不变 → CDN/浏览器长缓存会让老用户一直跑旧代码，修复「看起来没生效」 | ✅ 已消除（哈希文件名） |
| B | `dist/` 里的上一版残留文件（曾出现两个版本的 `ai.worker-*.js` 并存）会一起被上传 | ✅ 已消除（`emptyOutDir: true`） |

> **防回退**：不要把产物名改回固定名字、也不要重新关掉 `emptyOutDir`。若确有必要，先读本节两条后果。

## 4. 缓存响应头（2026-10-12 已落地）

上一版文档在此处留下的空白是：**`edgeone.json` 只有 SPA fallback 规则、没有任何缓存/响应头规则，`index.html` 的缓存行为完全由平台默认值决定**。该空白已补齐 —— 现在 `edgeone.json` 显式声明了两条 `headers` 规则：

```json
"headers": [
  { "source": "/*",        "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
  { "source": "/assets/*", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
]
```

对应 §2 的责任边界：`/assets/*` 拿长缓存（文件名带哈希，安全），其余路径（含 `/` 与 `/room/:id`）走 `no-cache`。

三个需要知道的点：

1. **规则顺序只影响「哈希资源能否拿到长缓存」这一性能项，不影响正确性。** `/assets/*` 与 `/*` 是两条都会命中的重叠规则，而**平台未文档化两者的优先级**。推演四种可能语义：`/room/:id` 这类路径只命中 `/*`，在**任何**语义下都是 `no-cache`（**安全性恒成立**）；而 `/assets/*` 要么命中自身规则拿到长缓存、要么先命中 `/*` 退化为 `no-cache` —— 后者虽然浪费了哈希文件名的收益，但**同样安全**（哈希文件本就不该被长缓存以外的方式对待）。当前顺序（`/*` 在前）是优先级未知时的保守选择。
   **B.6 第 ② 条本身就是优先级的判别器**：它返回 `immutable` → 平台是「末条命中」语义，当前顺序已最优；它返回 `no-cache` → 平台是「首条命中」语义，此时**把两条规则交换顺序**即可拿到长缓存收益（此时应顺带核对第 ①③ 条仍为 `200 + no-cache`）。
2. **`source` 匹配的是请求 URL 路径**（官方文档：「`source` 用于匹配请求 URL 路径」）。因此 `/room/abc` 这类 SPA 深链虽然由 SPA fallback 返回 `index.html` 的内容，`headers` 匹配的仍是 `/room/abc` → 命中 `/*` → `no-cache`。这正是我们要的结果：**任意 SPA 路由入口都不会被长缓存**，而不只是首页。
3. **`/*` 用 `no-cache` 而不是 `no-store`。** `no-cache` 允许缓存但每次都要回源校验（可配 ETag 拿到 304，省流量），足以保证用户拿到最新 `index.html`；`no-store` 则完全禁用缓存。对 SPA 入口页，`no-cache` 是更省流量的等价选择。

## 4.1 仍需真实环境复核的一项

以上是**静态配置层面的结论**，尚未在真实 EdgeOne 环境实测响应头。上线后请按 [`go-live-checklist.md`](go-live-checklist.md) 的 B.6「缓存行为确认」复核三条路径：

```bash
# ① 首页
curl -sI https://<域名>/ \
  | grep -iE "^(HTTP/|cache-control)"          # 期望 200 + no-cache

# ② 哈希资源
curl -sI https://<域名>/assets/index-<hash>.js \
  | grep -iE "^(HTTP/|cache-control)"          # 期望 200 + public, max-age=31536000, immutable

# ③ SPA 深链（关键）
curl -sI https://<域名>/room/some-id \
  | grep -iE "^(HTTP/|cache-control)"          # 期望 200 + no-cache
```

**为什么要看状态码（期望 200）**：`no-cache` 这个值在 404 响应上也会出现，只看它会**把生效误判成失败、把失败误判成通过**。只有 `HTTP/... 200` 才能证明请求真的命中了 `index.html`。第 ③ 条若出现 `404`，问题在 SPA fallback（`rewrites`），不在 `headers`，属另一类缺陷，**分开报**。

**`Accept` 头现在不必加，但加上更接近真实浏览器。** 自 2026-10-12 起 SPA fallback 采用的是平台官方精确形式 `{ "source": "/*", "destination": "/index.html" }`，语义是「先匹配静态资源与函数、未命中才回退」，**与请求头无关**（详见 §4.2 与 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)）。因此 ①②③ 用裸 `curl` 即可。需要忠实模拟浏览器时可加 `-H "Accept: text/html"`，结果应完全一致。

> **对照验证（可一次性验证 fallback 语义）**：对第 ③ 条分别跑「不带 Accept」与「带 Accept」两条命令，**两者都应返回 `200 + no-cache`**。若二者结果不同（例如不带 Accept 时 404），说明线上 SPA fallback **不是**官方精确形式下的行为 —— 此时应回到 `ADR-0006` 的失效条件处理，而不是去调 `headers`。

若第 ① 或第 ③ 条返回了较大的 `max-age`（且状态码为 200），说明 `headers` 规则**根本没有生效**（这两条路径只命中 `/*`，不涉及规则重叠），此时应改回「白名单式」写法 —— 不用 `/*` 兜底，而是逐条列出 HTML 入口（`/`、`/room/*` 等）配 `no-cache`。

---

## 4.2 SPA fallback 的形式变更（2026-10-12）

`edgeone.json` 的 `rewrites` 已改为**平台官方精确形式**，不再自行加 `has: accept: text/html` 条件：

```json
"rewrites": [ { "source": "/*", "destination": "/index.html" } ]
```

一句话理由：官方文档只为**这一精确形式**保证「先匹配静态资源与函数，未命中才回退首页」；旧写法（`/(.*)` + `has`）既不在文档的 `source` 语法内，`has` 也不属于 `edgeone.json` 的受支持字段，属**未文档化依赖**。完整论证、代价与失效条件见 [`ADR-0006`](../architecture/adr/ADR-0006-spa-fallback-official-form.md)。

**对本文（缓存）的两个影响**：

1. **`/room/:id` 等深链依旧拿到 `no-cache`**（它们不匹配任何静态文件或函数，回退到 `index.html`，命中 `/*` 规则）。结论不变，验证方式见 §4.1。
2. **新增一个窄窗口观察项**：**已不存在**的哈希资源 URL 现在会回退成 `index.html`（HTML），并可能被 `/assets/*` 规则标为 `immutable`。实际影响很小 —— 哈希 URL 由 `no-cache` 的 `index.html` 生成，浏览器不会「学到」已失效的 URL —— 但若出现「部署瞬间仍开着的旧标签页报错」，这里是第一嫌疑点。

## 5. 与版本号的关系

产物名带哈希之后，**版本号不再承担「区分线上版本」的技术职责**，但仍是**人类可读的发布标识**：`CHANGELOG.md` 的分节、以及「这次合并对应哪个版本」的对应关系都靠它。
**结论不变：每次上线都要升版本号。** 理由与细则见 [`versioning.md`](versioning.md) §3。

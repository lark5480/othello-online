# Othello Online — EdgeOne Makers 部署指南

> 适用：把本项目的 React 前端 + Edge Functions（游戏 API）+ KV（房间状态）零成本部署到腾讯云 EdgeOne Makers。
> 读者：已读完《需求PRD.md》，准备本地联调并上线。

> ⚠️ **产品更名提醒**：原 **EdgeOne Pages** 已于 2026-06 品牌升级为 **EdgeOne Makers**，功能、架构与部署方式完全不变（仍含 Edge Functions / Cloud Functions / KV）。下文 CLI 命令已更新为 `edgeone makers ...`；旧的 `edgeone pages ...` 在过渡期内通常仍可兼容，建议直接用新命令。

---

## 0. 前置准备（一次性）

下面每一项都给出**入口位置（点击路径）**与**直达链接**。直达链接若未来变动，按"点击路径"在控制台里也能找到同样的位置。

### 0.1 腾讯云账号 + 实名认证（前提）

- **入口位置**：腾讯云控制台（`https://console.cloud.tencent.com`）→ 右上角头像菜单 → 「账号信息」→「实名认证」。
- **直达链接**：`https://console.cloud.tencent.com/account`（在「实名认证」页按提示完成个人/企业实名）。
- **说明**：EdgeOne Makers 属腾讯云产品，未实名无法开通与绑定域名。已有实名账号可跳过。

### 0.2 开通 EdgeOne Makers（Pages 服务）

- **入口位置**：腾讯云控制台 → 顶部搜索「EdgeOne」或从「产品」找到「边缘安全加速平台 EO」→ 进入产品后左侧导航「Pages」→ 点击「立即开通」。
- **直达链接（Pages 控制台）**：`https://console.cloud.tencent.com/edgeone/pages?tab=projects`
  - `?tab=projects` = 项目列表；`?tab=kv` = KV 存储（见 0.3）。
- **说明**：首次进入会要求"立即开通" Pages 服务，按提示确认即可（公测/免费额度阶段通常无需付费）。

### 0.3 申请 KV 存储（关键，最容易漏）

> KV 用于存房间状态。本项目后端用 Edge Functions，而 KV **仅 Edge Functions 可调用**，所以必须开通并绑定。

- **入口位置**：Pages 控制台 → 顶部「KV Storage / KV 存储」标签页 → 点击「立即申请 / Apply now」。
- **直达链接**：`https://console.cloud.tencent.com/edgeone/pages?tab=kv`
- **操作步骤**：
  1. 点「立即申请」→ 填写**申请理由**（简述业务场景，如"黑白棋房间状态存储"）→ 提交。
  2. 等待审核（限量配额，通常较快，高峰期可能需等待；页面显示「审核中」）。
  3. 审核通过后，在同一页点「创建命名空间 / Create Namespace」→ 输入名称（如 `othello`）→ 创建。
  4. 进入该命名空间 → 「绑定项目 / Bind Namespace」→ 选择你的 Pages 项目 → 填写**变量名**（如 `OTHELLO_KV`）→ 绑定。
- **代码里怎么用**：绑定后函数内通过 `context.env.OTHELLO_KV` 访问（变量名即上一步填的那个）。
- **官方文档**：`https://edgeone.cloud.tencent.com/pages/document/162936897742577664`

### 0.4 准备代码仓库（GitHub，推荐用于自动部署）

- **入口位置**：Pages 控制台 → 「创建项目」→ 「绑定 GitHub」（首次会跳 GitHub 授权）。
- **说明**：授权后选仓库即可；也可不绑仓库，纯用 CLI 手动部署（见第 8 节）。支持 GitHub / Gitee。

### 0.5 安装 EdgeOne CLI（本地联调 + 部署用）

```bash
npm install -g edgeone
```
- 文档/下载说明在 EdgeOne Makers 官方文档站；CLI 子命令：`edgeone makers dev` / `deploy` / `link`。
- 国内 npm 慢可先设镜像：`npm config set registry https://registry.npmmirror.com`。

---

### 前置准备 检查清单（全部打勾再继续）

- [ ] 腾讯云账号已实名（`https://console.cloud.tencent.com/account`）
- [ ] 已开通 Makers 服务（`https://console.cloud.tencent.com/edgeone/pages?tab=projects`）
- [ ] 已申请 KV 并通过审核、创建命名空间 `othello`、绑定本项目变量名 `OTHELLO_KV`（`https://console.cloud.tencent.com/edgeone/pages?tab=kv`）
- [ ] 代码已推到 GitHub（或准备用 CLI 部署）
- [ ] 本地已 `npm install -g edgeone`

> 控制台直链里的 `edgeone/pages` 路径在产品更名后通常会自动跳转到 Makers 控制台，属正常现象，无需担心。

> 费用：EdgeOne Makers 公测期有免费额度；商业化后个人版约 ¥9.9/月（含流量+请求）。KV 在免费/低用量下近乎零成本，适合个人小项目。

---

## 1. 本地开发环境

### 1.1 安装 EdgeOne CLI

```bash
npm install -g edgeone
```

> 国内安装慢可加镜像：`npm config set registry https://registry.npmmirror.com`。

### 1.2 关联项目（本地用 KV 必须）

在**项目根目录**执行：

```bash
edgeone makers link
```

按提示选择/输入你的 Makers 项目名称。这一步把控制台的 KV 绑定、环境变量拉到本地，本地 `edgeone makers dev` 才能访问 `context.env.OTHELLO_KV`。

### 1.3 本地联调（前端 + 函数一把梭）

```bash
npm install
edgeone makers dev
```

- 启动后访问 **http://localhost:8088**（前端页面和 Edge Functions 在同一端口，无需额外代理）。
- 支持热更新；改代码自动生效。
- ⚠️ Edge Functions 调试服务有**启动次数限制**，不要频繁退出/重启 dev；靠热更新即可。
- 函数里用 `console.log(...)` 调试，日志会打印在终端。

### 1.4 目录约定（务必对齐）

```
othello-online/
├── src/                     # React 前端
├── edge-functions/          # Edge Functions（V8 runtime）
│   └── api/
│       └── room/...
├── edgeone.json             # 项目配置（重定向/重写）
├── package.json
└── vite.config.ts
```

- 函数目录是 **`edge-functions/`**（不是 Cloudflare 的 `functions/`）。
- URL 由目录生成：`edge-functions/api/room/create.ts` → `POST /api/room/create`；动态段 `[roomId].ts` → `/api/room/:roomId`。

---

## 2. Edge Functions 写法要点

Edge Functions 跑在 **V8 runtime**（类 Cloudflare Workers），限制如下，写代码时遵守：

- ✅ 标准 Web API：`Response` / `Request` / `fetch` / `TextEncoder` 等。
- ❌ **不能 `require` 或引入 npm 包**。游戏逻辑（合法判定/翻转/胜负）写成纯 TS/JS 模块；可函数内 `import` 普通本地 `.ts/.js`，但别引第三方库。
- CPU ≤ 200ms / 请求体 ≤ 1MB / 代码包 ≤ 5MB（棋盘数据极小，完全够）。
- 默认导出 `onRequest(context)`；按方法导出 `onRequestGet` / `onRequestPost` 等。

### 2.1 读取请求与参数

```ts
export async function onRequestPost(context: EventContext) {
  const roomId = context.params.roomId;          // 动态路由参数
  const body = await context.request.json();      // POST body
  const kv = context.env.OTHELLO_KV;               // 绑定的 KV 命名空间
  // ...
}
```

### 2.2 KV 读写（值是字符串！）

```ts
// 写：value 必须字符串
await kv.put(roomId, JSON.stringify(state));

// 读：返回字符串或 null
const raw = await kv.get(roomId);
const state = raw ? JSON.parse(raw) : null;
```

> ⚠️ KV **最终一致性，60s 内全球同步**。双人对战时若两人被路由到不同边缘节点，读方可能看到最多数十秒旧棋盘。缓解：落子接口强制校验 `currentTurn`；state 带 `updatedAt`，客户端比对检测陈旧（详见 PRD 5.4）。休闲场景通常秒级同步，可接受。

### 2.3 返回 JSON

```ts
return new Response(JSON.stringify(state), {
  status: 200,
  headers: { 'Content-Type': 'application/json; charset=UTF-8' },
});
```

> 前端与函数**同域部署**（都在 `*.edgeone.app` 或你的自定义域名下），**无需配 CORS**。

---

## 3. SPA fallback（必须配，否则刷新 /room/:roomId 会 404）

`/room/:roomId` 是前端路由。EdgeOne Makers 不会自动回退到 `index.html`，直接刷新或分享深链会 404。二选一：

### 方案 A（推荐，最稳）：catch-all 函数

新建 `edge-functions/[[default]].ts`：

```ts
export function onRequest(context: EventContext) {
  // 已匹配 /api/* 的请求不会走到这里（具体路由优先）。
  // 仅对没有静态文件、也没有 api 文件的路径返回首页 HTML。
  const html = `<!doctype html>...`; // 实际部署时返回构建产物 dist/index.html 内容
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}
```

> 注意：需要读取 `dist/index.html` 内容返回。可在构建后由函数读取（或用方案 B）。

### 方案 B：edgeone.json 重写

在项目根 `edgeone.json` 配置重写规则（字段以官方最新文档为准）：

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> 此写法对所有未命中路径回退到 `index.html`；静态资源（`/assets/*.js` 等）由平台优先以静态文件返回，不受影响。若你的 edgeone.json 字段与控制台/官方文档不一致，以官方为准，或优先用方案 A。

---

## 4. KV 实操清单

1. 控制台「KV 存储」→ 申请开通 → 创建命名空间（如 `othello`）。
2. 命名空间「绑定项目」→ 填变量名 `OTHELLO_KV` → 绑定本项目。
3. 本地 `edgeone makers link` 拉取绑定。
4. 代码用 `context.env.OTHELLO_KV.put/get`。
5. 上线后在控制台 KV 命名空间里可手动查看/清空房间记录（调试用）。

> 命名空间上限 10 个、账户容量 100MB，本项目完全够。房间状态 JSON 很小（一个 8×8 棋盘 + 元数据），可长期留存或按需在 `restart`/结束后清理。

---

## 5. 项目结构（最终）

```
othello-online/
├── src/
│   ├── pages/Home.tsx / Room.tsx / AIGame.tsx   # 首页 / 联机对局 / 人机对战
│   ├── components/Board.tsx / Cell.tsx / GameInfo.tsx / MoveHistory.tsx / StatsPanel.tsx / ThemeToggle.tsx
│   ├── hooks/usePolling.ts / useBoardSound.ts
│   ├── workers/ai.worker.ts     # AI 计算放 Web Worker，不阻塞主线程
│   ├── utils/gameLogic.ts       # 纯 JS 游戏逻辑（前端与函数端共用）
│   ├── utils/ai.ts / hints.ts / api.ts / player.ts / roomCode.ts / sound.ts / stats.ts / theme.ts
│   ├── test/setup.ts            # Vitest（jsdom + jest-dom）环境
│   └── index.css                # 设计令牌（Tailwind v4 CSS-first）
├── edge-functions/
│   ├── lib/router.ts / kv.ts / types.ts
│   └── api/room/
│       ├── create.ts
│       ├── join.ts
│       ├── [roomId]/state.ts
│       ├── [roomId]/move.ts
│       └── [roomId]/restart.ts
├── server/mockApi.ts            # 本地免 EdgeOne 的 Vite 中间件（内存 KV）
├── e2e/                         # Playwright 双窗口冒烟测试
├── .github/workflows/ci.yml     # typecheck + 单测 + E2E
├── edgeone.json                 # SPA fallback 重写配置
├── package.json
├── vite.config.ts               # 含 @tailwindcss/vite + mockApi 中间件 + Vitest 配置
└── index.html
```

---

## 6. 构建配置（Vite + Tailwind v4）

`vite.config.ts`（当前实际形态，含 mockApi 中间件与 Vitest 配置）：

```ts
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createMockApi } from './server/mockApi';

// 本地 dev/preview 挂载内存版 /api，端点形状与 Edge Functions 一致（生产构建不含）
function mockApiPlugin(): Plugin {
  const handler = createMockApi();
  return {
    name: 'othello-mock-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApiPlugin()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```

`src/index.css` 顶部：

```css
@import "tailwindcss";
```

> 不再需要 `tailwind.config.js` 和 `postcss.config.js`（Tailwind v4 默认零配置）。
> 本地 `npm run dev` 时 mockApi 自动挂载，无需 EdgeOne / KV 即可双窗口对弈；`vite build` 不会打包该逻辑。

---

## 7. 部署方式一：GitHub 自动部署（推荐）

1. 把代码推到 GitHub 仓库。
2. 控制台 → Pages → 创建项目 → 绑定 GitHub → 选仓库。
3. 构建设置：
   - **构建命令**：`npm run build`
   - **输出目录**：`dist`
   - **部署分支**：`main`（监听推送自动部署）
4. 保存 → 首次部署。之后每次 `git push` 自动构建上线。
5. 在 Pages 项目里「KV 存储」确认已绑定命名空间（第 4 节）。
6. 访问平台分配的 `*.edgeone.app` 域名即可游玩。

> ⚠️ git 部署时整仓可用，平台自动识别 `edge-functions/` 并部署函数。不要只在 `dist/` 里放前端而丢了函数目录。

---

## 8. 部署方式二：CLI 手动部署

```bash
# 先本地构建
npm run build

# 部署当前目录（平台会同时打包前端 dist 与 edge-functions）
edgeone makers deploy . -n othello-online
```

- `-n` 指定项目名，不存在则自动创建。
- 若手动把构建输出拷到 `dist/` 再部署，记得把 `edge-functions/` 一并放进去，否则函数不会上线。
- 部署成功后控制台给出预览/生产域名。

---

## 9. 自定义域名（可选）

1. 准备已备案域名（国内访问需备案）。
2. 控制台 → 项目 → 添加自定义域名 → 按提示在 DNS 服务商加 **CNAME** 记录。
3. EdgeOne 自动签发 SSL 证书，几分钟后可访问。
4. 国内访问延迟低（依托腾讯云边缘节点），比 GitHub Pages / Cloudflare 快。

---

## 10. 避坑清单（上线前逐项核对）

| # | 坑 | 正确做法 |
|---|----|----------|
| 1 | 函数目录写成 `functions/` | 必须用 **`edge-functions/`** |
| 2 | 配置文件写成 `edgeone.pages.json` | 实际是 **`edgeone.json`** |
| 3 | 忘了申请 KV | 控制台先「申请开通 KV」再建命名空间 + 绑定 |
| 4 | 本地用 KV 报 undefined | 先 `edgeone makers link` 关联项目 |
| 5 | KV 直接存对象 | **value 必须字符串**：`JSON.stringify` 存、`JSON.parse` 取 |
| 6 | 在 Edge Functions 里 `require` npm 包 | V8 runtime 不支持 npm，逻辑写纯 JS |
| 7 | `/room/:roomId` 刷新 404 | 配 SPA fallback（catch-all 或 edgeone.json 重写） |
| 8 | 频繁重启 `edgeone makers dev` | Edge Functions 有启动次数限制，靠热更新 |
| 9 | 误以为双端实时同步 | KV 最终一致性 ~60s；靠 `currentTurn`+`updatedAt` 缓解 |
| 10 | 担心跨域 | 前端与函数同域，无需 CORS |
| 11 | 构建后函数没上线 | git 部署整仓可用；手动部署把 `edge-functions/` 一并打包 |
| 12 | Tailwind 按旧版装 | 用 `@tailwindcss/vite` + `@import "tailwindcss"`，无需 config |

---

## 11. 本地联调最小验证流程

1. `edgeone makers link` → `edgeone makers dev`
2. 浏览器开两个窗口（或无痕窗口模拟两个玩家）：
   - 窗口 A：首页「创建房间」→ 拿到 6 位码
   - 窗口 B：输入房间码「加入」
   - A 落子 → B 轮询看到更新 → 互相对弈到结束
3. 刷新窗口 B → 断线重连应能回到当前对局
4. 在控制台 KV 命名空间查看房间记录，确认 state 正确写入
5. 直接访问 `http://localhost:8088/room/A3F8K2` 刷新，确认不 404（SPA fallback 生效）

---

> 部署有问题优先看控制台「部署记录」日志 + 终端 `console.log`。更多以 EdgeOne Makers 官方文档为准（控制台内「文档」入口）。

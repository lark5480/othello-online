import { expect, test, type Page, type Response } from '@playwright/test';
import {
  boardState,
  createRoomWithTwoPlayers,
  expectMyTurn,
  expectWaiting,
  moveCount,
  playOneMove,
  playUntilFinished,
  readBoardBaseline,
  scores,
} from './helpers';

/**
 * 断线重连（页面刷新）双窗口 E2E —— 补上此前完全缺失的一类证据。
 *
 * 背景：`room.spec.ts` 建立的是「两个窗口从建房到落子 4 手」的连通性基线，
 * 全文没有任何 `reload()`。而玩家的执子颜色只存在于 localStorage
 * （`utils/player.ts` 的 rememberRoomColor / recallRoomColor），
 * 刷新后能否还原完全依赖浏览器本地存储 —— 这是只能由真实刷新验证的假设。
 *
 * 本文件覆盖：
 *   1. A 建房 → B 加入 → 双方交替落子 2 手
 *   2. A 刷新：URL 保持 /room/:id、页面正常渲染、执子色不变（仍是黑 + 轮到你落子）、
 *      棋盘局面完整还原、同步续上（A 落第 3 手 B 能看到）
 *   3. B 刷新：执子色不变（仍是白 + 等待对方落子）、双向刷新后双向同步仍正常
 *
 * 两点工程约定：
 *
 * - **同步断言一律用 `expect.poll` / 比对双端**。轮询间隔为 2 s（`Room.tsx:96`），
 *   一次性断言 + 固定 sleep 必然 flaky。
 * - **刷新后的局面一致性用服务端权威派生的棋盘与计分校验**，语义最强。
 *   走子记录另有专门的 BUG-01 回归用例盯住（含逐手坐标与「回顾」功能），
 *   不与主流程断言混在一起，便于失败时快速定位是哪一类回归。
 *
 * 附带的度量用例见本文件末尾「断线重连开销度量」一节（刷新恢复耗时 + 首屏缓存状态），
 * 对应 docs/architecture/performance-budget.md §5。
 */

/** 跨端棋盘一致（轮询有 2s 间隔，必须 poll 收敛） */
async function expectSameBoard(pageA: Page, pageB: Page) {
  await expect
    .poll(async () => {
      // 任一端读取无效（null）都视为「尚未就绪」，必须继续重试。
      // 不能让 null === null 或 '' === '' 这类哨兵值把断言「比相等」骗过去。
      const [a, b] = await Promise.all([boardState(pageA), boardState(pageB)]);
      if (a === null || b === null) return false;
      return a === b;
    }, {
      timeout: 15_000,
      message: '两端棋盘应一致',
    })
    .toBe(true);
}

/** 跨端计分一致 */
async function expectSameScores(pageA: Page, pageB: Page) {
  await expect
    .poll(async () => (await scores(pageA)).join(',') === (await scores(pageB)).join(','), {
      timeout: 15_000,
      message: '两端计分应一致',
    })
    .toBe(true);
}

/** 断言「页面已正常渲染出对局界面」：棋盘在、不是 404、不是加载中 */
async function expectRoomRendered(page: Page) {
  await expect(page.locator('.board-grid')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('房间不存在或已结束')).toHaveCount(0);
  await expect(page.getByText('加载中…')).toHaveCount(0);
  await expect(page.locator('.board-grid button')).toHaveCount(64);
}

test.describe('断线重连（页面刷新）', () => {
  test('A 端 F5 刷新：URL / 页面 / 执子色 / 局面保留，且同步续上', async ({ browser }) => {
    const { ctxA, ctxB, pageA, pageB, roomId } = await createRoomWithTwoPlayers(browser);

    // --- 交替落子 2 手（A 黑、B 白），此后应轮到 A 落第 3 手 ---
    await playOneMove(pageA);
    await playOneMove(pageB);

    await expectMyTurn(pageA);
    // 刷新前基线：走子记录 2 手（此处尚未刷新，计数可信）
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).toBe(2);
    await expect.poll(() => moveCount(pageB), { timeout: 15_000 }).toBe(2);
    const boardBeforeReload = await readBoardBaseline(pageA);
    const scoresBeforeReload = (await scores(pageA)).join(',');
    await expectSameBoard(pageA, pageB);

    // --- A 端 F5 刷新 ---
    await pageA.reload();

    // 断言 1：URL 仍是 /room/:id（依赖 SPA fallback；生产由 edgeone.json 提供）
    expect(pageA.url()).toMatch(new RegExp(`/room/${roomId}$`));
    // 断言 2：页面正常渲染 —— 不是 404、不是白屏、棋盘 64 格齐全
    await expectRoomRendered(pageA);

    // 断言 3：执子色没变 —— 仍是黑方，第 3 手仍轮到自己
    // （若 localStorage 颜色记忆丢失，myColor 变 null → 退化为「观战中」且无合法格）
    await expectMyTurn(pageA);
    await expect(pageA.getByText('观战中')).toHaveCount(0);
    // 仍可落子：myTurn 为 true 才会渲染 is-interactive
    await expect(pageA.locator('.board-grid button.is-interactive').first()).toBeVisible({
      timeout: 10_000,
    });

    // 断言 4：棋盘局面完整还原（服务端权威状态，刷新前后应完全一致）
    expect(await boardState(pageA)).toBe(boardBeforeReload);
    expect((await scores(pageA)).join(',')).toBe(scoresBeforeReload);
    // 断线期间 B 端也未动过棋，双方仍一致
    await expectSameBoard(pageA, pageB);

    // 断言 5：同步续上 —— A 落第 3 手，B 端能看到（棋盘与计分都更新）
    await playOneMove(pageA);
    await expect.poll(async () => (await boardState(pageB))?.length ?? 0, { timeout: 15_000 }).toBe(64);
    await expectSameBoard(pageA, pageB);
    await expectSameScores(pageA, pageB);
    // 落子后棋盘确实变了（避免「双端一致但都停在旧局面」的假通过）
    expect(await boardState(pageA)).not.toBe(boardBeforeReload);

    await ctxA.close();
    await ctxB.close();
  });

  test('B 端 F5 刷新：执子色不变（仍为白方等待），双向刷新后同步仍正常', async ({ browser }) => {
    const { ctxA, ctxB, pageA, pageB, roomId } = await createRoomWithTwoPlayers(browser);

    // 交替落子 2 手 → 轮到 A
    await playOneMove(pageA);
    await playOneMove(pageB);
    await expectMyTurn(pageA);
    const boardBeforeReload = await readBoardBaseline(pageA);

    // --- 两端先后刷新，覆盖「双向都断过线」的最坏情况 ---
    await pageA.reload();
    expect(pageA.url()).toMatch(new RegExp(`/room/${roomId}$`));
    await expectRoomRendered(pageA);
    await expectMyTurn(pageA); // A 刷新后仍是黑方且轮到自己

    await pageB.reload();
    expect(pageB.url()).toMatch(new RegExp(`/room/${roomId}$`));
    await expectRoomRendered(pageB);

    // 断言 1：B 刷新后执子色没变 —— 仍是白方，显示「等待对方落子…」
    await expectWaiting(pageB);
    await expect(pageB.getByText('观战中')).toHaveCount(0);
    // B 非当前回合，不应有可落子格
    await expect(pageB.locator('.board-grid button.is-interactive')).toHaveCount(0);
    // B 端局面同样完整还原
    expect(await boardState(pageB)).toBe(boardBeforeReload);

    // 断言 2：之后 A 落第 3 手，B 能看到（证明双向刷新后同步正常）
    await playOneMove(pageA);
    await expectSameBoard(pageA, pageB);
    await expectSameScores(pageA, pageB);

    // 断言 3：再由 B 落第 4 手，A 能看到（证明两个方向都通）
    await expectMyTurn(pageB);
    const boardBeforeFourth = await readBoardBaseline(pageA);
    await playOneMove(pageB);
    await expectSameBoard(pageA, pageB);
    await expectSameScores(pageA, pageB);
    expect(await boardState(pageA)).not.toBe(boardBeforeFourth);

    await ctxA.close();
    await ctxB.close();
  });
});

/**
 * BUG-01 回归：刷新后走子记录必须完整保留。
 *
 * 历史成因（已修复，作为回归依据保留说明）：
 *   `MoveHistory` 原先用纯 `useState` + `useEffect` 从「上一帧 → 当前帧」的增量差分
 *   重建记录（仅当 `state.moveCount > prevCount.current` 时 push `state.lastMove`）。
 *   刷新后组件重新挂载、差分基线归零，而服务端 state 只有 `lastMove`/`moveCount`、
 *   不含完整棋谱，于是只补回最后一手 → 「2 手」显示成「1 手」，第 1 手永久丢失，
 *   「回顾该手棋形」也随之失真。
 *
 * 修复：`GameState` 新增 `moves: MoveWithPlayer[]`（每手坐标 + 执子方），
 *   `MoveHistory` 直接由 `state.moves` 派生，刷新后由服务端状态完整还原。
 *
 * 本用例断言的是「刷新前后手数与逐手内容完全一致」，防的回归有三种：
 *   1. 退回增量差分实现（手数对不上：只剩 1 手）；
 *   2. `restartState` 漏清空 moves（重开后残留上一局记录）；
 *   3. moves 未随 `toPublicState` 下发（刷新后为空 → 记录整体丢失）。
 */
test.describe('BUG-01 回归：刷新后走子记录完整保留', () => {
  test('刷新前 2 手，刷新后仍为 2 手且逐手坐标一致', async ({ browser }) => {
    const { ctxA, ctxB, pageA, pageB } = await createRoomWithTwoPlayers(browser);

    await playOneMove(pageA);
    await playOneMove(pageB);

    // 刷新前：走子记录正确累积到 2 手，且两行都可点（回顾功能入口存在）
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).toBe(2);
    const entriesBefore = await pageA.locator('.card ol li').allTextContents();
    expect(entriesBefore).toHaveLength(2);

    // 刷新后：仍应为 2 手，且逐手内容（序号 + 坐标）与刷新前完全一致
    await pageA.reload();
    await expectRoomRendered(pageA);
    await expectMyTurn(pageA);
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).toBe(2);
    const entriesAfter = await pageA.locator('.card ol li').allTextContents();
    expect(entriesAfter).toHaveLength(2);
    expect(entriesAfter).toEqual(entriesBefore);

    // 刷新后「回顾」仍可用：点第 1 手能重放出该手棋形（依赖完整棋谱）
    await pageA.locator('.card ol li button').first().click();
    await expect(pageA.getByText(/^第 1 手 · /)).toBeVisible({ timeout: 10_000 });
    await pageA.getByRole('button', { name: '关闭回顾' }).click();

    await ctxA.close();
    await ctxB.close();
  });
});

/**
 * 刷新后的终局弹窗与「再来一局」仍可用。
 *
 * 为什么单独一个用例：终局只能靠打完整局到达（本地 mockApi 无「置为终局」接口），
 * 成本高于前面几个用例，因此不与主流程混在一起。
 *
 * 重点验证的是**重开凭证**：POST /restart 需要 localStorage 里的 playerId
 * （`Room.tsx:155`），若刷新后 playerId 丢失或被重建，重开会被服务端 403 拒绝
 * （`mockApi.ts:127`）。这条断言把「刷新 → 终局 → 重开」串起来，
 * 是 localStorage 身份持久化在最深路径上的一次端到端验证。
 */
test.describe('断线重连：终局后重开', () => {
  test('终局后刷新：「再来一局」仍可点，且能重开出新局', async ({ browser }) => {
    test.setTimeout(180_000); // 需打完整局，单独放宽超时

    const { ctxA, ctxB, pageA, pageB } = await createRoomWithTwoPlayers(browser);

    // 打完整局直到终局（终局弹窗含「再来一局」按钮）
    await playUntilFinished(pageA, pageB);
    await expect(pageA.getByRole('button', { name: '再来一局' })).toBeVisible({ timeout: 15_000 });
    // 终局时走子记录应被完整保留（依赖 moves[]，见 BUG-01 回归）
    const finishedMoveCount = await moveCount(pageA);

    // --- 终局后刷新 A ---
    await pageA.reload();

    // 刷新后仍是终局态：终局弹窗与「再来一局」都还在（不因刷新退回对局中）
    await expectRoomRendered(pageA);
    await expect(pageA.getByRole('button', { name: '再来一局' })).toBeVisible({ timeout: 15_000 });
    // 走子记录不因刷新而丢失
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).toBe(finishedMoveCount);

    // 点「再来一局」—— 若 playerId 在刷新后丢失，服务端会返回 403，此处会失败
    await pageA.getByRole('button', { name: '再来一局' }).click();

    // 重开成功：弹窗消失、黑方（A）重新获得回合、棋盘复位为初始 4 子
    await expect(pageA.getByRole('button', { name: '再来一局' })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expectMyTurn(pageA);
    await expect
      .poll(async () => (await boardState(pageA))?.split('').filter((c) => c !== '.').length ?? -1, {
        timeout: 15_000,
      })
      .toBe(4); // 初始盘面恰好 4 子
    // 走子记录已清零（新一局从 0 手开始）
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).toBe(0);
    // B 端应通过 5s 低频轮询自动跟进新局，无需手动刷新
    await expect
      .poll(async () => (await boardState(pageB))?.split('').filter((c) => c !== '.').length ?? -1, {
        timeout: 20_000,
      })
      .toBe(4);

    await ctxA.close();
    await ctxB.close();
  });
});

/**
 * 断线重连开销度量（对应 docs/architecture/performance-budget.md §5 / B16）。
 *
 * 本用例是**度量工具**而非回归断言：把三个真实指标打印到 stdout 便于人工记录进预算文档：
 *   1. t_render —— 从「发起 reload」到「棋盘 64 格渲染完成」的耗时；
 *   2. t_sync   —— 从「发起 reload」到「双端棋盘/计分重新一致」的耗时，
 *                  这是 B6 之外另一个真实延迟指标（含 2 s 轮询间隔的影响）；
 *   3. cache    —— 刷新后首屏 JS/CSS 资源的缓存状态。
 *
 * 断言刻意宽松（只要求「必须能完成」且局面一致），不设性能阈值 ——
 * 阈值判断留给预算文档，避免本机 CI 抖动造成误报。
 */

/** Playwright 的 Response 没有 fromCache() API（已核对 types.d.ts），
 * 故缓存状态只能由「状态码 304 = 协商缓存命中」与 age / cache-control 头判断。 */
interface ResourceInfo {
  url: string;
  status: number;
  notModified: boolean;
  age: string | null;
  cacheControl: string | null;
  etag: string | null;
}

test('度量：刷新后恢复渲染耗时 / 恢复同步耗时 / 首屏缓存状态', async ({ browser }) => {
  test.setTimeout(120_000);

  const { ctxA, ctxB, pageA, pageB } = await createRoomWithTwoPlayers(browser);

  await playOneMove(pageA);
  await playOneMove(pageB);
  await expectMyTurn(pageA);

  const boardBefore = await readBoardBaseline(pageA);
  const scoresBefore = (await scores(pageA)).join(',');

  const resources: ResourceInfo[] = [];
  pageA.on('response', (res: Response) => {
    const url = res.url();
    if (!/\.(js|mjs|css)(\?|$)/.test(url)) return;
    const headers = res.headers();
    const status = res.status();
    resources.push({
      url: url.replace(/^https?:\/\/[^/]+/, ''),
      status,
      notModified: status === 304,
      age: headers['age'] ?? null,
      cacheControl: headers['cache-control'] ?? null,
      etag: headers['etag'] ?? null,
    });
  });

  // --- 刷新后恢复渲染耗时 ---
  const t0 = Date.now();
  await pageA.reload();
  // 64 格渲染完成 = React 已拿到 state 并完成 commit
  await expect(pageA.locator('.board-grid button')).toHaveCount(64, { timeout: 30_000 });
  const tRender = Date.now() - t0;

  // --- 刷新后恢复同步耗时（轮询收敛到双端一致） ---
  const tSync0 = Date.now();
  await expect
    .poll(
      async () => {
        const a = await boardState(pageA);
        const b = await boardState(pageB);
        // null = 本次读取撞上导航窗口，无效，必须继续重试
        if (a === null || b === null) return false;
        const sa = (await scores(pageA)).join(',');
        const sb = (await scores(pageB)).join(',');
        return a === b && sa === sb;
      },
      { timeout: 30_000 }
    )
    .toBe(true);
  const tSync = Date.now() - tSync0;

  // 关键上下文：刷新前后盘面一致（证明度量的是「恢复」而非「变化」）
  expect(await boardState(pageA)).toBe(boardBefore);
  expect((await scores(pageA)).join(',')).toBe(scoresBefore);

  const notModified = resources.filter((r) => r.notModified).length;

  console.log('[metrics] === 断线重连开销（本机 dev server，非生产） ===');
  console.log(`[metrics] t_render_ms=${tRender}  (reload → 棋盘 64 格渲染完成)`);
  console.log(`[metrics] t_sync_ms=${tSync}  (reload → 双端棋盘/计分重新一致, 含 ≤2s 轮询)`);
  console.log(`[metrics] moveCount_after_reload=${await moveCount(pageA)} (BUG-01 修复后应为 2)`);
  console.log(`[metrics] resources_total=${resources.length} status304=${notModified}`);
  for (const r of resources.slice(0, 12)) {
    console.log(
      `[metrics]   ${r.status} age=${r.age ?? '-'} cc=${r.cacheControl ?? '-'} etag=${
        r.etag ? 'yes' : '-'
      } ${r.url}`
    );
  }
  console.log('[metrics] === end ===');

  await ctxA.close();
  await ctxB.close();
});

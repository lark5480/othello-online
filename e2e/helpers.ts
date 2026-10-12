/**
 * E2E 共享定位器与棋局操作助手。
 *
 * 与既有 `room.spec.ts` 的定位风格保持一致（同样的 class 选择器），
 * 抽成共享模块以便断线重连等用例复用；`room.spec.ts` 本轮不改动（保持既有回归原样），
 * 后续可择机迁移到本文件。
 *
 * 选择器约定（均来自 src/ 现有 class，未新增 test id）：
 *   - 棋盘格位：`.board-grid button`（8×8 行优先，nth(r*8+c)）
 *   - 可落子格：`.board-grid button.is-interactive`（Cell.tsx 仅在合法且可点击时加）
 *   - 计分数字：`.text-strong.text-2xl.tabular-nums`（GameInfo 黑/白各一个）
 *   - 走子手数：文本 `{n} 手`（MoveHistory 头部计数）
 */

import { expect, type Page } from '@playwright/test';

/** 按棋盘坐标取格位（row 从上到下、col 从左到右） */
export const cell = (page: Page, r: number, c: number) =>
  page.locator('.board-grid button').nth(r * 8 + c);

/**
 * 整盘序列化：每个格位 → "B" / "W" / "."。
 *
 * 实现说明（刻意不用 `.disc-black`）：翻转动画期间 Cell 会同时渲染
 * 正反两面（`disc-face-front` + `disc-face-back`，Cell.tsx:84-88），
 * 其中一面永远带 `.disc-black`，用 class 查询会在动画中途误判。
 * `aria-label` 由 `value` 直接派生（Cell.tsx:62-72），与动画无关，最稳定。
 */
export const boardState = async (page: Page): Promise<string | null> => {
  try {
    return await page
      .locator('.board-grid button')
      .evaluateAll((btns) =>
        btns
          .map((b) => {
            const label = b.getAttribute('aria-label') || '';
            if (label.includes('黑')) return 'B';
            if (label.includes('白')) return 'W';
            return '.';
          })
          .join('')
      );
  } catch {
    // 撞上 reload 的导航窗口（Execution context was destroyed）：返回 null 表示
    // 「本次读取无效」。**不能**返回 '' —— 那样双端比较时可能两侧同时为 ''，
    // 反而「相等」而误判通过。用 null 让 expect.poll 重试。
    return null;
  }
};

/**
 * 读取 64 格完整盘面作为「基线」，用于刷新前后比对。
 * 读取无效（null，撞上导航窗口）或格数不足 64 时直接重试 —— 基线绝不能是
 * null/残缺值，否则后续 `toBe(baseline)` 会出现「null === null」的假通过。
 */
export async function readBoardBaseline(page: Page, timeout = 15_000): Promise<string> {
  await expect
    .poll(async () => {
      const s = await boardState(page);
      return s !== null && s.length === 64 ? s : null;
    }, { timeout, message: '应能读到 64 格完整盘面' })
    .not.toBeNull();
  const s = await boardState(page);
  if (s === null || s.length !== 64) {
    throw new Error('盘面基线读取失败：读取无效或格数不足 64');
  }
  return s;
}

/** GameInfo 计分数字（形如 ["2", "2"]，黑在前白在后） */
export const scores = async (page: Page): Promise<string[]> => {
  try {
    return await page.locator('.text-strong.text-2xl.tabular-nums').allTextContents();
  } catch {
    return [];
  }
};

/** 走子记录手数（MoveHistory 头部 `{n} 手`），返回数字
 *
 * 容错：刷新（reload）会销毁执行上下文，若读取正好撞上导航窗口，
 * Playwright 会抛 "Execution context was destroyed"。此时返回 NaN 而非抛出 ——
 * 配合 `expect.poll` 即可自然重试，避免把一次瞬时导航误报成断言失败。
 */
export const moveCount = async (page: Page): Promise<number> => {
  try {
    const text = await page.getByText(/^\d+ 手$/).first().textContent({ timeout: 5_000 });
    if (!text) return NaN;
    return Number(text.replace(/\D/g, ''));
  } catch {
    return NaN; // 导航窗口内读不到，等下一次 poll
  }
};

/** 轮到我方（同时校验文案与「你」徽标） */
export const expectMyTurn = (page: Page, timeout = 15_000) =>
  expect(page.getByText('轮到你落子')).toBeVisible({ timeout });

/** 等待对方落子 */
export const expectWaiting = (page: Page, timeout = 15_000) =>
  expect(page.getByText('等待对方落子…')).toBeVisible({ timeout });

/**
 * 落一手：先确认轮到我方且存在合法格，再点第一个合法格。
 * 走「第一个合法格」而非固定坐标，是为了让用例只关心「同步是否续上」，
 * 不依赖某个具体开局变化。
 */
export const playOneMove = async (page: Page): Promise<void> => {
  await expectMyTurn(page);
  const target = page.locator('.board-grid button.is-interactive').first();
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.click();
};

/** 读取本端持久化的 playerId（供需要以 API 身份驱动对局的场景使用） */
export const readPlayerId = (page: Page): Promise<string> =>
  page.evaluate(() => localStorage.getItem('othello_player_id') ?? '');

/**
 * 建房 + 加入，返回两端页面与房间号。
 * A 创建 → 执黑先手；B 输入房间码加入 → 执白。
 */
export async function createRoomWithTwoPlayers(browser: import('@playwright/test').Browser) {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await pageA.goto('/');
  await pageA.getByRole('button', { name: '创建房间' }).click();
  await pageA.waitForURL(/\/room\/[A-Z0-9]{6}/);
  const roomId = pageA.url().match(/\/room\/([A-Z0-9]{6})/)![1];

  await pageB.goto('/');
  await pageB.getByPlaceholder('房间码').fill(roomId);
  await pageB.getByRole('button', { name: '加入' }).click();
  await pageB.waitForURL(new RegExp(`/room/${roomId}`));

  await expectMyTurn(pageA);
  await expectWaiting(pageB);

  return { ctxA, ctxB, pageA, pageB, roomId };
}

/**
 * 自动打完整局：双方轮流点第一个合法格，直到分出终局。
 *
 * 用于把对局推进到 `finished`（终局弹窗 + 「再来一局」按钮出现），
 * 以覆盖刷新后的重开路径。走「第一个合法格」而非固定坐标，是为了不依赖
 * 任何具体开局变化 —— 只关心「终局能否到达、刷新后能否重开」。
 *
 * 为什么不能用 `isVisible()` 轮询判断轮到谁（实测踩过的坑）：
 *   落子后，落子方页面会**立即**变为「等待对方落子…」，而对方页面要等
 *   **最多 2 s** 的轮询（`Room.tsx:96`）才变「轮到你落子」。这中间存在一个
 *   「双方都不显示轮到你落子」的窗口；且点击的瞬间落子方页面可能尚未更新，
 *   出现「双方都显示轮到你落子」的假象。此时按瞬时可见性选人就会选错或重复落子，
 *   最终以 `轮到你落子` 等待超时收场。
 *   正确做法：以**服务端权威的走子手数**为步进依据 —— 每手落子后等手数 +1，
 *   再用 poll 等到恰好有一方进入自己的回合。
 *
 * @param maxMoves 兜底上限，防止极端情况下（理论上不会）无限循环
 * @returns 实际落子手数
 */
export async function playUntilFinished(
  pageA: Page,
  pageB: Page,
  maxMoves = 80
): Promise<number> {
  const finished = async () =>
    pageA.getByRole('button', { name: '再来一局' }).isVisible().catch(() => false);

  // 以 A 端走子手数作为全局进度基准（两端手数始终相等）
  let moves = await moveCount(pageA);
  if (Number.isNaN(moves)) {
    await expect.poll(() => moveCount(pageA), { timeout: 15_000 }).not.toBeNaN();
    moves = await moveCount(pageA);
  }

  while (moves < maxMoves) {
    if (await finished()) return moves;

    // 等到「恰好一方」进入自己的回合（poll 天然消化 2 s 轮询间隔）
    await expect
      .poll(
        async () => {
          if (await finished()) return 'finished' as const;
          const [a, b] = await Promise.all([
            pageA.getByText('轮到你落子').isVisible().catch(() => false),
            pageB.getByText('轮到你落子').isVisible().catch(() => false),
          ]);
          if (a && !b) return 'A' as const;
          if (b && !a) return 'B' as const;
          return null; // 两端都无 / 都显示 → 尚未收敛，继续等
        },
        { timeout: 20_000, message: '等待恰好一方进入自己的回合' }
      )
      .not.toBeNull();

    // 上面的 poll 已确保收敛；重新读一次拿到具体是谁（poll 断言不返回实际值）
    if (await finished()) return moves;
    const [aTurn, bTurn] = await Promise.all([
      pageA.getByText('轮到你落子').isVisible().catch(() => false),
      pageB.getByText('轮到你落子').isVisible().catch(() => false),
    ]);
    if (!aTurn && !bTurn) {
      throw new Error(`第 ${moves} 手：双方均未进入自己的回合且未终局，疑似卡死`);
    }
    const page = aTurn ? pageA : pageB;

    await playOneMove(page);

    // 等这一手真正落地（走子手数 +1），再决定下一手 —— 避免在响应未到时重复落子
    await expect.poll(() => moveCount(pageA), { timeout: 20_000 }).toBe(moves + 1);
    moves += 1;
  }

  if (await finished()) return moves;
  throw new Error(`playUntilFinished 超过 ${maxMoves} 手仍未终局`);
}

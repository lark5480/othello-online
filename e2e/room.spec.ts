import { expect, test, type Page } from '@playwright/test';

/** 按棋盘坐标取格位（8×8 行优先，row 从上到下、col 从左到右） */
const cell = (page: Page, r: number, c: number) =>
  page.locator('.board-grid button').nth(r * 8 + c);

/** GameInfo 计分数字（黑白各一个，形如 ["2", "2"]） */
const scores = async (page: Page) =>
  page.locator('.text-strong.text-2xl.tabular-nums').allTextContents();

/** 整盘序列化：每个格位 → "B" / "W" / "."，用于强校验双端看到同一盘棋 */
const boardState = async (page: Page) =>
  page.locator('.board-grid button').evaluateAll((btns) =>
    btns.map((b) =>
      b.querySelector('.disc-black') ? 'B' : b.querySelector('.disc-white') ? 'W' : '.'
    )
  );

/**
 * 双窗口对局冒烟：
 * A 建房拿码 → B 加入 → 双方交替落子 4 手 → 校验双向同步（回合流转 / 走子记录 / 双方计分一致）。
 * 完整终局结算已由 gameLogic / Room 单元测试覆盖，此处聚焦「双窗口 + 轮询 + mockApi」全链路。
 */
test('双窗口对局冒烟：建房 → 加入 → 交替落子 → 状态双向同步', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // --- A 创建房间 ---
  await pageA.goto('/');
  await pageA.getByRole('button', { name: '创建房间' }).click();
  await pageA.waitForURL(/\/room\/[A-Z0-9]{6}/);
  const roomId = pageA.url().match(/\/room\/([A-Z0-9]{6})/)![1];
  await expect(pageA.getByText('等待对方加入…')).toBeVisible();

  // --- B 输入房间码加入 ---
  await pageB.goto('/');
  await pageB.getByPlaceholder('房间码').fill(roomId);
  await pageB.getByRole('button', { name: '加入' }).click();
  await pageB.waitForURL(/\/room\/[A-Z0-9]{6}/);

  // 创建者执黑先手，加入者执白等待
  await expect(pageA.getByText('轮到你落子')).toBeVisible({ timeout: 8000 });
  await expect(pageB.getByText('等待对方落子…')).toBeVisible();

  // --- 交替落子 4 手：每方轮流点击当前回合的第一个合法格 ---
  for (let i = 0; i < 4; i++) {
    const page = i % 2 === 0 ? pageA : pageB;
    await expect(page.getByText('轮到你落子')).toBeVisible({ timeout: 8000 });
    await page.locator('.board-grid button.is-interactive').first().click();
  }

  // 4 手后轮到黑（A），A 端应再次可落子
  await expect(pageA.getByText('轮到你落子')).toBeVisible({ timeout: 8000 });

  // --- 双向同步校验 ---
  // 双方走子记录一致：4 手
  await expect(pageA.getByText('4 手')).toBeVisible();
  await expect(pageB.getByText('4 手')).toBeVisible();
  // 双方计分一致（不关心具体数值，只要求双端看到同一盘棋）
  expect(await scores(pageA)).toEqual(await scores(pageB));
  // 整盘棋子分布强一致（B 端轮询可能有短暂延迟，用 poll 收敛）
  await expect
    .poll(async () => {
      const a = await boardState(pageA);
      const b = await boardState(pageB);
      return a.join('') === b.join('');
    })
    .toBe(true);

  await ctxA.close();
  await ctxB.close();
});

/** 非法房间码 / 不存在的房间给出明确错误 */
test('加入不存在的房间提示「房间不存在」', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('房间码').fill('AAAAAA');
  await page.getByRole('button', { name: '加入' }).click();
  await expect(page.getByText('房间不存在')).toBeVisible();
});

import type { Move } from './gameLogic';

const COLS = 'abcdefgh';

/**
 * 把棋盘坐标转为棋类惯例标签：列用 a–h，行用 1–8（从上到下）。
 * 例：(row=2, col=4) → "e3"。
 */
export function moveToLabel(m: Move): string {
  return `${COLS[m.col]}${m.row + 1}`;
}

/** 落子提示开关：按设备持久化到 localStorage，并预留模式感知默认值钩子 */

const SHOW_HINTS_KEY = 'othello_show_hints';

/**
 * 游戏模式。当前仅 'online' 存在；solo/ai/practice 为未来扩展占位。
 * 不在此文件引入 GameState 依赖，避免循环引用。
 */
export type GameMode = 'online' | 'solo' | 'ai' | 'practice';

/**
 * 不同模式下「显示落子提示」的默认值（模式感知默认）。
 * - online：联网双人对战，OFF —— 公平原则，靠棋力，不默认给提示。
 * - solo/ai/practice：练习/单机，ON —— 辅助学习。
 */
export function getDefaultShowHints(mode: GameMode = 'online'): boolean {
  switch (mode) {
    case 'online':
      return false;
    case 'solo':
    case 'ai':
    case 'practice':
      return true;
    default:
      return false;
  }
}

export function getShowHints(mode: GameMode = 'online'): boolean {
  const raw = localStorage.getItem(SHOW_HINTS_KEY);
  if (raw === null) return getDefaultShowHints(mode); // 首次：用模式默认值
  return raw === 'true';
}

export function setShowHints(value: boolean): void {
  localStorage.setItem(SHOW_HINTS_KEY, value ? 'true' : 'false');
}

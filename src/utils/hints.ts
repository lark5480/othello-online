/** 落子提示开关：按「设备 + 模式」持久化到 localStorage，模式感知默认值 */

/** 旧版全局键（单键不分模式），仅作一次性迁移读取 */
const LEGACY_SHOW_HINTS_KEY = 'othello_show_hints';

const keyFor = (mode: GameMode) => `othello_show_hints_${mode}`;

/**
 * 游戏模式。online = 联网对战，ai = 人机对战；solo/practice 为未来扩展占位。
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
  const raw = localStorage.getItem(keyFor(mode));
  if (raw !== null) return raw === 'true';
  // 迁移：老版本用全局单键，尊重用户已作出的选择
  const legacy = localStorage.getItem(LEGACY_SHOW_HINTS_KEY);
  if (legacy !== null) return legacy === 'true';
  return getDefaultShowHints(mode); // 首次：用模式默认值
}

export function setShowHints(mode: GameMode, value: boolean): void {
  localStorage.setItem(keyFor(mode), value ? 'true' : 'false');
}

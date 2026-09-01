import { describe, it, expect, beforeEach } from 'vitest';
import { getShowHints, setShowHints, getDefaultShowHints } from './hints';
import { rememberRoomColor, recallRoomColor } from './player';

/** 最小 localStorage stub（node 测试环境没有 DOM） */
function stubLocalStorage() {
  const m = new Map<string, string>();
  const storage: Storage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
  return m;
}

describe('hints 模式感知持久化', () => {
  beforeEach(() => stubLocalStorage());

  it('首次访问按模式取默认值（online 关 / ai 开）', () => {
    expect(getShowHints('online')).toBe(false);
    expect(getShowHints('ai')).toBe(true);
    expect(getDefaultShowHints('solo')).toBe(true);
  });

  it('按模式独立持久化：online 关掉不影响 ai 的默认开', () => {
    setShowHints('online', false);
    expect(getShowHints('online')).toBe(false);
    expect(getShowHints('ai')).toBe(true); // 未动过 → 仍是模式默认
    setShowHints('ai', false);
    expect(getShowHints('ai')).toBe(false);
    expect(getShowHints('online')).toBe(false);
  });

  it('迁移：旧版全局单键 othello_show_hints 的选择被尊重', () => {
    localStorage.setItem('othello_show_hints', 'true');
    expect(getShowHints('online')).toBe(true); // 老用户开过提示 → 不被模式默认覆盖
    expect(getShowHints('ai')).toBe(true);
  });
});

describe('player 房间颜色记忆', () => {
  beforeEach(() => stubLocalStorage());

  it('remember / recall 往返；未知房间返回 null', () => {
    expect(recallRoomColor('ABC234')).toBeNull();
    rememberRoomColor('ABC234', 'black');
    expect(recallRoomColor('ABC234')).toBe('black');
    rememberRoomColor('XYZ789', 'white');
    expect(recallRoomColor('XYZ789')).toBe('white');
  });

  it('getPlayerId：生成一次后稳定复用（p_ 前缀）', async () => {
    const a = await getPlayerIdSafe();
    const b = await getPlayerIdSafe();
    expect(a).toBe(b);
    expect(a.startsWith('p_')).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(10);
  });
});

// player.ts 的 getPlayerId 依赖模块级导入时的 localStorage 存在性，
// 这里动态导入保证 stub 先就位
async function getPlayerIdSafe(): Promise<string> {
  const { getPlayerId } = await import('./player');
  return getPlayerId();
}

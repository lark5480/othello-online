import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getStats, recordResult, getAllStats, type Stats } from './stats';

/** 内存版 localStorage，便于在 Node 测试环境下验证持久化逻辑 */
function installMemoryStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal('localStorage', storage);
  return map;
}

const ZERO: Stats = { games: 0, wins: 0, losses: 0, draws: 0, bestMargin: 0 };

describe('stats', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('未记录时返回零值', () => {
    expect(getStats('hard')).toEqual(ZERO);
  });

  it('记录胜局累计胜场与最大子差', () => {
    recordResult('hard', 'win', 12);
    recordResult('hard', 'win', 8);
    const s = getStats('hard');
    expect(s.games).toBe(2);
    expect(s.wins).toBe(2);
    expect(s.bestMargin).toBe(12); // 取较大者
  });

  it('区分不同难度', () => {
    recordResult('easy', 'loss', 3);
    recordResult('master', 'win', 20);
    expect(getStats('easy').losses).toBe(1);
    expect(getStats('master').wins).toBe(1);
    expect(getStats('master').bestMargin).toBe(20);
  });

  it('平局不计入最大子差', () => {
    recordResult('medium', 'draw', 0);
    const s = getStats('medium');
    expect(s.draws).toBe(1);
    expect(s.bestMargin).toBe(0);
  });

  it('持久化到 localStorage，getAllStats 可回读', () => {
    recordResult('hard', 'win', 5);
    const all = getAllStats();
    expect(all.hard?.games).toBe(1);
    expect(all.hard?.wins).toBe(1);
  });
});

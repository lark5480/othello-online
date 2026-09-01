/**
 * 本地战绩统计（人机对战专用，按难度维度）。
 * 持久化到 localStorage（单一 JSON，键 `othello_stats`），记录胜/负/和局数与最大净胜子差。
 */

import type { Difficulty } from './ai';

export type Outcome = 'win' | 'loss' | 'draw';

export interface Stats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** 胜负时的最大子差（绝对值）；平局记 0 */
  bestMargin: number;
}

const KEY = 'othello_stats';
type Store = Partial<Record<Difficulty, Stats>>;

const EMPTY: Stats = { games: 0, wins: 0, losses: 0, draws: 0, bestMargin: 0 };

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* 忽略存储异常（隐私模式 / 配额） */
  }
}

export function getStats(d: Difficulty): Stats {
  return readStore()[d] ?? { ...EMPTY };
}

export function getAllStats(): Store {
  return readStore();
}

/** 记录一局结果，返回该难度更新后的战绩（便于 UI 即时刷新） */
export function recordResult(d: Difficulty, outcome: Outcome, margin: number): Stats {
  const store = readStore();
  const cur = store[d] ?? { ...EMPTY };
  const next: Stats = {
    games: cur.games + 1,
    wins: cur.wins + (outcome === 'win' ? 1 : 0),
    losses: cur.losses + (outcome === 'loss' ? 1 : 0),
    draws: cur.draws + (outcome === 'draw' ? 1 : 0),
    bestMargin: Math.max(cur.bestMargin, outcome === 'draw' ? 0 : Math.abs(margin)),
  };
  store[d] = next;
  writeStore(store);
  return next;
}

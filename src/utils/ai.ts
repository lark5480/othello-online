/**
 * Othello AI 对手引擎 —— P2「人机对战」核心逻辑。
 * 纯 TS/JS、零依赖，可在浏览器 / Node / Edge Functions(V8) 下直接运行，并复用 gameLogic 的纯规则。
 *
 * 设计要点：
 * - 难度分级：easy(随机) / medium(2 层 Minimax) / hard(4 层 alpha-beta + 落子顺序剪枝，残局精确搜索)。
 * - 评估函数：位置权重矩阵(角最高、X/C 位为负) + 行动力(mobility) 差，残局叠加子数差。
 * - 所有搜索均为纯函数、无全局副作用；随机源(仅 easy)可注入，便于单测确定性。
 * - 回合管理 / 跳过 / 胜负判定完全复用 gameLogic.applyMoveToState，保证与联网模式规则一致。
 */

import {
  applyMoveBoard,
  applyMoveToState,
  countStones,
  createInitialState,
  getValidMoves,
  hasAnyValidMove,
  opponentOf,
  stoneOf,
  type Board,
  type GameState,
  type Move,
  type Player,
} from './gameLogic';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'master';

export const AI_PLAYER_ID = 'ai-opponent';
export const LOCAL_PLAYER_ID = 'local-player';

/**
 * 位置权重矩阵（经典 8×8 Reversi 启发式）。
 * 角(100) 极稳定应优先占据；紧贴角的 X/C 位(-50/-20) 危险性高需规避；
 * 普通边(10) 与内部(1~5) 价值居中。对称矩阵，与某一方无关。
 */
const POSITION_WEIGHTS: ReadonlyArray<ReadonlyArray<number>> = [
  [100, -20, 10, 5, 5, 10, -20, 100],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [10, -2, 1, 1, 1, 1, -2, 10],
  [5, -2, 1, 1, 1, 1, -2, 5],
  [5, -2, 1, 1, 1, 1, -2, 5],
  [10, -2, 1, 1, 1, 1, -2, 10],
  [-20, -50, -2, -2, -2, -2, -50, -20],
  [100, -20, 10, 5, 5, 10, -20, 100],
];

/** 残局/终局的绝对胜负分值（远大于任何位置权重，确保搜索优先取胜） */
const TERMINAL_WIN = 1_000_000;

/** 各难度的迭代加深时间预算（毫秒） */
const TIME_BUDGET: Record<string, number> = {
  hard: 800,
  master: 1500,
};

/** 各难度在中盘的最大搜索深度 */
const MAX_DEPTH: Record<string, number> = {
  hard: 4,
  master: 6,
};

/**
 * 落子顺序：按位置权重降序（角优先、X/C 位靠后）。
 * 仅用于改变搜索遍历顺序——让 alpha-beta 更早命中剪枝点，不改搜索结果，
 * 因此对外保持确定性（相同输入恒得相同落子）。
 */
function orderedMoves(board: Board, player: Player): Move[] {
  return getValidMoves(board, player).sort(
    (a, b) => POSITION_WEIGHTS[b.row][b.col] - POSITION_WEIGHTS[a.row][a.col]
  );
}

/* ------------------------------------------------------------------ */
/* 评估函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 从 me 视角评估局面：位置权重(含己方+/对方-) + 行动力差(己方可落子数 - 对方)。
 * 仅在残局(空格极少)时叠加真实子数差，避免中盘「贪吃子」导致战略失衡。
 */
export function evaluate(board: Board, me: Player): number {
  const opp = opponentOf(me);
  const myStone = stoneOf(me);
  const oppStone = stoneOf(opp);

  let positional = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const v = board[r][c];
      if (v === myStone) positional += POSITION_WEIGHTS[r][c];
      else if (v === oppStone) positional -= POSITION_WEIGHTS[r][c];
    }
  }

  const myMobility = getValidMoves(board, me).length;
  const oppMobility = getValidMoves(board, opp).length;
  const mobility = (myMobility - oppMobility) * 5;

  const { black, white, empty } = countStones(board);
  const myDiscs = me === 'black' ? black : white;
  const oppDiscs = me === 'black' ? white : black;
  // 残局(<=10 空格)以子数差收束，结合位置/行动力
  const discDiff = empty <= 10 ? myDiscs - oppDiscs : 0;

  return positional + mobility + discDiff;
}

/** 己方子数 - 对方子数（用于终局打分） */
function discDifference(board: Board, me: Player): number {
  const { black, white } = countStones(board);
  return me === 'black' ? black - white : white - black;
}

/** 终局评分：以大分值体现「赢多少子」 */
function terminalScore(board: Board, me: Player): number {
  const diff = discDifference(board, me);
  if (diff > 0) return TERMINAL_WIN + diff;
  if (diff < 0) return -TERMINAL_WIN + diff;
  return 0;
}

/* ------------------------------------------------------------------ */
/* Minimax + Alpha-Beta 剪枝                                           */
/* ------------------------------------------------------------------ */

/**
 * 在 toMove 方视角下，对 me 的搜索深度 depth 做极大极小搜索。
 * 遇无子可下则跳过(切换行动方、不消耗深度)；双方均无子可下则进入终局评分。
 * alpha/beta 剪枝在不改变搜索结果的前提下大幅削减分支。
 */
function minimax(
  board: Board,
  me: Player,
  toMove: Player,
  depth: number,
  alpha: number,
  beta: number
): number {
  if (depth <= 0) return evaluate(board, me);

  const moves = orderedMoves(board, toMove);
  if (moves.length === 0) {
    // 当前方跳过；若对方也无法落子，对局结束
    if (!hasAnyValidMove(board, opponentOf(toMove))) {
      return terminalScore(board, me);
    }
    return minimax(board, me, opponentOf(toMove), depth - 1, alpha, beta);
  }

  const opp = opponentOf(toMove);
  if (toMove === me) {
    let value = -Infinity;
    for (const m of moves) {
      const next = applyMoveBoard(board, m.row, m.col, toMove);
      value = Math.max(value, minimax(next, me, opp, depth - 1, alpha, beta));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break; // 剪枝
    }
    return value;
  } else {
    let value = Infinity;
    for (const m of moves) {
      const next = applyMoveBoard(board, m.row, m.col, toMove);
      value = Math.min(value, minimax(next, me, opp, depth - 1, alpha, beta));
      beta = Math.min(beta, value);
      if (alpha >= beta) break; // 剪枝
    }
    return value;
  }
}

/** 依据难度与剩余空格决定搜索深度 */
function searchDepth(board: Board, difficulty: Difficulty): number {
  const { empty } = countStones(board);
  if (difficulty === 'medium') {
    // 中盘浅搜(2 层)，残局(<8 空格)精确到底
    return empty <= 8 ? empty : 2;
  }
  if (difficulty === 'hard') return empty <= 10 ? empty : 4;
  // master：常规 6 层；残局(<10 空格)精确到底
  return empty <= 10 ? empty : 6;
}

/**
 * 对候选步做一次浅层搜索（depth=1）评估，按分数降序排列。
 * 相比纯静态权重排序，能更准确地把强着法排在前面，提升 alpha-beta 剪枝效率。
 */
function shallowOrderedMoves(board: Board, player: Player): Move[] {
  const scored: Array<{ move: Move; score: number }> = [];
  for (const m of orderedMoves(board, player)) {
    const next = applyMoveBoard(board, m.row, m.col, player);
    const score = minimax(next, player, opponentOf(player), 1, -Infinity, Infinity);
    scored.push({ move: m, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.move);
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */

/**
 * 选择 AI 的落子点。
 * - easy：在合法点中等概率随机（rng 可注入，便于测试确定性）。
 * - medium/hard/master：Minimax(+alpha-beta) 选定评估最优的一步。
 * 无合法落子(不应在对 AI 回合调用)时返回 null。
 */
export function chooseAIMove(
  board: Board,
  aiPlayer: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random
): Move | null {
  const moves = getValidMoves(board, aiPlayer);
  if (moves.length === 0) return null;

  if (difficulty === 'easy') {
    const idx = Math.min(moves.length - 1, Math.floor(rng() * moves.length));
    return moves[idx];
  }

  if (difficulty === 'medium') {
    const depth = searchDepth(board, difficulty);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of shallowOrderedMoves(board, aiPlayer)) {
      const next = applyMoveBoard(board, m.row, m.col, aiPlayer);
      const score = minimax(next, aiPlayer, opponentOf(aiPlayer), depth - 1, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // 残局精确到底，不走时间预算
  const { empty } = countStones(board);
  if (empty <= 10) {
    const depth = searchDepth(board, difficulty);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of shallowOrderedMoves(board, aiPlayer)) {
      const next = applyMoveBoard(board, m.row, m.col, aiPlayer);
      const score = minimax(next, aiPlayer, opponentOf(aiPlayer), depth - 1, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // 迭代加深：从深度 2 开始逐层加深，超时返回上一层结果
  const budget = TIME_BUDGET[difficulty] ?? 800;
  const maxDepth = MAX_DEPTH[difficulty] ?? 4;
  const start = performance.now();
  let best = moves[0];

  for (let depth = 2; depth <= maxDepth; depth++) {
    let currentBest = moves[0];
    let currentBestScore = -Infinity;
    const ordered = shallowOrderedMoves(board, aiPlayer);
    for (const m of ordered) {
      if (performance.now() - start > budget && depth > 2) break;
      const next = applyMoveBoard(board, m.row, m.col, aiPlayer);
      const score = minimax(next, aiPlayer, opponentOf(aiPlayer), depth - 1, -Infinity, Infinity);
      if (score > currentBestScore) {
        currentBestScore = score;
        currentBest = m;
      }
    }
    best = currentBest;
    if (performance.now() - start >= budget) break;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 本地对局状态编排（人机模式专用，复用 gameLogic 的回合/胜负逻辑）      */
/* ------------------------------------------------------------------ */

/**
 * 创建一局本地人机对局的初始状态。
 * 玩家执 playerColor，AI 执对方；双方 players 字段均以本地固定 id 填充，
 * 因此可直接复用 applyMoveToState 的「回合归属」校验，无需真实 playerId / KV。
 */
export function createAIGameState(playerColor: Player, difficulty: Difficulty): GameState {
  void difficulty; // 难度在每步落子时传入，状态本身不持久化
  const base = createInitialState('AI-LOCAL', playerColor === 'black' ? LOCAL_PLAYER_ID : AI_PLAYER_ID);
  base.players = {
    black: playerColor === 'black' ? LOCAL_PLAYER_ID : AI_PLAYER_ID,
    white: playerColor === 'black' ? AI_PLAYER_ID : LOCAL_PLAYER_ID,
  };
  base.status = 'playing';
  base.updatedAt = Date.now();
  return base;
}

/**
 * 在现有本地对局状态上应用 AI 的一步落子，返回新状态（不修改入参）。
 * 内部调用 chooseAIMove 取点，再用 applyMoveToState 完成翻转/跳过/胜负判定。
 * 若 AI 当前无合法落子(异常边界)，原样返回状态。
 */
export function applyAIMove(
  state: GameState,
  aiColor: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random
): GameState {
  const move = chooseAIMove(state.board, aiColor, difficulty, rng);
  if (!move) return state;
  const res = applyMoveToState(state, state.players[aiColor]!, move.row, move.col);
  return res.ok ? res.state : state;
}

import { describe, it, expect } from 'vitest';
import {
  chooseAIMove,
  evaluate,
  createAIGameState,
  applyAIMove,
  AI_PLAYER_ID,
  LOCAL_PLAYER_ID,
  type Difficulty,
} from './ai';
import {
  BLACK,
  WHITE,
  EMPTY,
  createInitialBoard,
  getValidMoves,
  applyMoveToState,
  countStones,
  decideWinner,
  type Board,
  type GameState,
  type Winner,
} from './gameLogic';

/** 确定性伪随机（mulberry32），用于 easy 难度的可复现测试 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'master'];

describe('评估函数 evaluate', () => {
  it('角位权重为正且远高于内部', () => {
    const board = createInitialBoard();
    // 用相同子数构造两个局面：一个黑占角(0,0)，一个黑占内部(3,3)
    const cornerBoard: Board = board.map((r) => r.slice());
    cornerBoard[0][0] = BLACK;
    cornerBoard[0][1] = WHITE; // 维持翻转逻辑无关的占位
    const innerBoard: Board = board.map((r) => r.slice());
    innerBoard[3][3] = BLACK;
    expect(evaluate(cornerBoard, 'black')).toBeGreaterThan(evaluate(innerBoard, 'black'));
  });

  it('返回有限数值', () => {
    const board = createInitialBoard();
    expect(Number.isFinite(evaluate(board, 'black'))).toBe(true);
  });
});

describe('chooseAIMove 基本性质', () => {
  it('初始局面下各难度均返回合法落子', () => {
    const board = createInitialBoard();
    for (const d of DIFFS) {
      const move = chooseAIMove(board, 'black', d);
      expect(move).not.toBeNull();
      expect(getValidMoves(board, 'black')).toContainEqual(move);
    }
  });

  it('无可落子时返回 null', () => {
    // 棋盘填满（全黑）→ 双方均无合法落子
    const full: Board = Array.from({ length: 8 }, () => Array(8).fill(BLACK));
    expect(chooseAIMove(full, 'black', 'hard')).toBeNull();
  });

  it('easy 受 rng 控制：rng=0 取第一个，rng≈1 取最后一个', () => {
    const board = createInitialBoard();
    const moves = getValidMoves(board, 'black');
    expect(chooseAIMove(board, 'black', 'easy', () => 0)).toEqual(moves[0]);
    expect(chooseAIMove(board, 'black', 'easy', () => 0.999)).toEqual(moves[moves.length - 1]);
  });

  it('medium / hard 确定性：相同输入返回相同落子', () => {
    const board = createInitialBoard();
    expect(chooseAIMove(board, 'black', 'medium')).toEqual(chooseAIMove(board, 'black', 'medium'));
    expect(chooseAIMove(board, 'white', 'hard')).toEqual(chooseAIMove(board, 'white', 'hard'));
  });

  it('唯一合法落子为角时，各难度都会落该角', () => {
    // 构造黑方唯一合法落子 = (0,0) 的局面
    const board: Board = Array.from({ length: 8 }, () => Array(8).fill(BLACK));
    board[0][0] = EMPTY;
    board[1][0] = WHITE; // 经 (1,0) 白子后接 (2,0) 黑子 → (0,0) 合法
    for (const d of DIFFS) {
      expect(chooseAIMove(board, 'black', d)).toEqual({ row: 0, col: 0 });
    }
  });
});

describe('本地对局状态编排', () => {
  it('createAIGameState：状态 playing、双方就位、初始 2:2', () => {
    const s = createAIGameState('black', 'hard');
    expect(s.status).toBe('playing');
    expect(s.players.black).toBe(LOCAL_PLAYER_ID);
    expect(s.players.white).toBe(AI_PLAYER_ID);
    expect(countStones(s.board)).toEqual({ black: 2, white: 2, empty: 60 });

    const s2 = createAIGameState('white', 'easy');
    expect(s2.players.white).toBe(LOCAL_PLAYER_ID);
    expect(s2.players.black).toBe(AI_PLAYER_ID);
  });

  it('applyAIMove：AI 先手落子后切换回合到玩家', () => {
    // 玩家执白 → AI 执黑先手
    let s = createAIGameState('white', 'medium');
    expect(s.currentTurn).toBe('black'); // AI 先手
    s = applyAIMove(s, 'black', 'medium');
    expect(s.moveCount).toBe(1);
    expect(s.currentTurn).toBe('white'); // 轮到玩家
    expect(s.lastMove).not.toBeNull();
  });

  it('applyAIMove：玩家执黑时 AI(白) 不会抢先落子', () => {
    const s = createAIGameState('black', 'hard');
    expect(s.currentTurn).toBe('black'); // 玩家先手
    // 直接对 AI 调用应无副作用（当前不是 AI 回合的不变量由页面保证，此处验证其返回原状态）
    const after = applyAIMove(s, 'white', 'hard');
    expect(after).toBe(s);
  });
});

describe('自对弈不变量（回合管理 + 跳过 + 终局）', () => {
  function playSelfPlay(blackDiff: Difficulty, whiteDiff: Difficulty, easyRng: () => number): GameState {
    let s = createAIGameState('black', 'hard');
    let guard = 0;
    while (s.status === 'playing' && guard < 200) {
      guard++;
      const color = s.currentTurn;
      const diff = color === 'black' ? blackDiff : whiteDiff;
      const rng = diff === 'easy' ? easyRng : Math.random;
      const move = chooseAIMove(s.board, color, diff, rng);
      expect(move).not.toBeNull();
      if (!move) break;
      const res = applyMoveToState(s, s.players[color]!, move.row, move.col);
      expect(res.ok).toBe(true);
      if (res.ok) s = res.state;
      // 不变量：进行中时，当前行动方必有合法落子（AI 会自动处理跳过）
      if (s.status === 'playing') {
        expect(getValidMoves(s.board, s.currentTurn).length).toBeGreaterThan(0);
      }
    }
    return s;
  }

  it('hard vs hard 多局均正常终局且棋子守恒', () => {
    for (let g = 0; g < 2; g++) {
      const s = playSelfPlay('hard', 'hard', mulberry32(g + 1));
      expect(s.status).toBe('finished');
      const { black, white, empty } = countStones(s.board);
      expect(black + white + empty).toBe(64);
      expect(s.winner).toBe(decideWinner(s.board));
    }
  });

  it('medium vs medium 同样终局守恒', () => {
    const s = playSelfPlay('medium', 'medium', mulberry32(7));
    expect(s.status).toBe('finished');
    expect(countStones(s.board).black + countStones(s.board).white).toBe(64 - countStones(s.board).empty);
  });
});

describe('难度分级强度差异', () => {
  // 8 局完整对局模拟（hard 为深度 4 Minimax），计算量大，放宽超时
  it('hard 作为黑方对 easy(确定性随机)白方，胜局占优', () => {

    let hardWins = 0;
    let easyWins = 0;
    const GAMES = 8;
    for (let g = 0; g < GAMES; g++) {
      let s = createAIGameState('black', 'hard');
      const rng = mulberry32(g * 1000 + 1);
      let guard = 0;
      while (s.status === 'playing' && guard < 200) {
        guard++;
        const color = s.currentTurn;
        const diff: Difficulty = color === 'black' ? 'hard' : 'easy';
        const move = chooseAIMove(s.board, color, diff, diff === 'easy' ? rng : Math.random);
        if (!move) break;
        const res = applyMoveToState(s, s.players[color]!, move.row, move.col);
        if (res.ok) s = res.state;
      }
      const w: Winner = s.winner;
      if (w === 'black') hardWins++;
      else if (w === 'white') easyWins++;
    }
    expect(hardWins).toBeGreaterThan(easyWins);
  }, 20_000);
});

describe('master 难度', () => {
  it('初始局面返回合法落子且在时间预算内完成', () => {
    const board = createInitialBoard();
    const t0 = Date.now();
    const m = chooseAIMove(board, 'black', 'master');
    const dt = Date.now() - t0;
    expect(m).not.toBeNull();
    expect(getValidMoves(board, 'black')).toContainEqual(m);
    expect(dt).toBeLessThan(3000);
  });

  it('easy 不受迭代加深影响（rng 仍决定结果）', () => {
    const board = createInitialBoard();
    const moves = getValidMoves(board, 'black');
    expect(chooseAIMove(board, 'black', 'easy', () => 0)).toEqual(moves[0]);
    expect(chooseAIMove(board, 'black', 'easy', () => 0.999)).toEqual(moves[moves.length - 1]);
  });

  it('残局 ≤10 空格精确求解（唯一合法落子为角）', () => {
    // 构造一个空格极少、唯一合法落子为 (7,7) 的局面：
    // 全盘填白，仅第 8 行中间放连续黑子，白方在 (7,7) 落子可翻转整段黑子。
    const board: Board = Array.from({ length: 8 }, () => Array(8).fill(WHITE));
    for (let c = 1; c <= 6; c++) board[7][c] = BLACK;
    board[7][7] = EMPTY;
    for (const d of ['hard', 'master'] as Difficulty[]) {
      expect(chooseAIMove(board, 'white', d)).toEqual({ row: 7, col: 7 });
    }
  });
});

describe('性能', () => {
  it('hard 首步在 2 秒内完成', () => {
    const board = createInitialBoard();
    const t0 = Date.now();
    const m = chooseAIMove(board, 'black', 'hard');
    const dt = Date.now() - t0;
    expect(m).not.toBeNull();
    expect(dt).toBeLessThan(2000);
  });

  it('hard 中盘单步在 2 秒内完成（真实对局不卡顿）', () => {
    // 自对弈若干步构造中盘局面（约 20~40 空格），验证真实对局中 AI 计算不冻结 UI
    let s = createAIGameState('black', 'hard');
    const rng = mulberry32(42);
    for (let i = 0; i < 22 && s.status === 'playing'; i++) {
      const color = s.currentTurn;
      const m = chooseAIMove(s.board, color, 'medium', rng);
      if (!m) break;
      const res = applyMoveToState(s, s.players[color]!, m.row, m.col);
      if (res.ok) s = res.state;
    }
    const { empty } = countStones(s.board);
    expect(empty).toBeLessThan(50);
    expect(empty).toBeGreaterThan(12); // 确属中盘
    const t0 = Date.now();
    const m = chooseAIMove(s.board, s.currentTurn, 'hard');
    const dt = Date.now() - t0;
    expect(m).not.toBeNull();
    expect(dt).toBeLessThan(2000);
  });
});

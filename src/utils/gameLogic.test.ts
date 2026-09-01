import { describe, it, expect } from 'vitest';
import {
  BLACK,
  WHITE,
  EMPTY,
  createInitialBoard,
  getValidMoves,
  isValidMove,
  getFlips,
  applyMoveBoard,
  applyMoveToState,
  createInitialState,
  joinState,
  restartState,
  countStones,
  decideWinner,
  isGameOver,
  hasAnyValidMove,
  opponentOf,
  toPublicState,
  type GameState,
} from './gameLogic';

function freshState(): GameState {
  return createInitialState('TEST01', 'player-black');
}

describe('初始棋盘', () => {
  it('中心 4 子交叉摆放，黑白各 2', () => {
    const board = createInitialBoard();
    expect(board[3][3]).toBe(WHITE);
    expect(board[3][4]).toBe(BLACK);
    expect(board[4][3]).toBe(BLACK);
    expect(board[4][4]).toBe(WHITE);
    const { black, white } = countStones(board);
    expect(black).toBe(2);
    expect(white).toBe(2);
  });
});

describe('合法落子判定', () => {
  it('开局黑方有 4 个合法点', () => {
    const board = createInitialBoard();
    const moves = getValidMoves(board, 'black');
    expect(moves).toHaveLength(4);
    expect(moves).toEqual(
      expect.arrayContaining([
        { row: 2, col: 3 },
        { row: 3, col: 2 },
        { row: 4, col: 5 },
        { row: 5, col: 4 },
      ])
    );
  });

  it('(2,3) 合法，(0,0) 非法', () => {
    const board = createInitialBoard();
    expect(isValidMove(board, 2, 3, 'black')).toBe(true);
    expect(isValidMove(board, 0, 0, 'black')).toBe(false);
  });

  it('getFlips 只翻转被夹住的对方子', () => {
    const board = createInitialBoard();
    const flips = getFlips(board, 2, 3, 'black');
    expect(flips).toEqual([{ row: 3, col: 3 }]);
  });
});

describe('翻转执行', () => {
  it('黑落 (2,3) 后白 (3,3) 翻为黑，黑 4 白 1', () => {
    const board = createInitialBoard();
    const next = applyMoveBoard(board, 2, 3, 'black');
    expect(next[2][3]).toBe(BLACK);
    expect(next[3][3]).toBe(BLACK);
    const { black, white } = countStones(next);
    expect(black).toBe(4);
    expect(white).toBe(1);
  });

  it('不修改原棋盘（纯函数）', () => {
    const board = createInitialBoard();
    const snapshot = JSON.stringify(board);
    applyMoveBoard(board, 2, 3, 'black');
    expect(JSON.stringify(board)).toBe(snapshot);
  });
});

describe('applyMoveToState 校验', () => {
  it('非当前回合返回 409', () => {
    const s = joinState(freshState(), 'player-white');
    const res = applyMoveToState(s, 'player-white', 2, 3);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it('非法落子返回 400', () => {
    const s = joinState(freshState(), 'player-white');
    const res = applyMoveToState(s, 'player-black', 0, 0);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
  });

  it('正常落子后切换回合到白方', () => {
    const s = joinState(freshState(), 'player-white');
    const res = applyMoveToState(s, 'player-black', 2, 3);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.currentTurn).toBe('white');
      expect(res.state.moveCount).toBe(1);
      expect(res.state.lastMove).toEqual({ row: 2, col: 3 });
    }
  });
});

describe('joinState / restartState', () => {
  it('加入后白方就位且状态 playing', () => {
    const s = joinState(freshState(), 'player-white');
    expect(s.players.white).toBe('player-white');
    expect(s.status).toBe('playing');
  });

  it('restart 重置棋盘与计数，保留玩家', () => {
    let s = freshState();
    s = joinState(s, 'player-white');
    const moved = applyMoveToState(s, 'player-black', 2, 3);
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      const r = restartState(moved.state);
      expect(r.moveCount).toBe(0);
      expect(r.currentTurn).toBe('black');
      expect(r.status).toBe('playing');
      expect(r.players).toEqual({ black: 'player-black', white: 'player-white' });
      expect(countStones(r.board)).toEqual({ black: 2, white: 2, empty: 60 });
    }
  });
});

describe('胜负判定', () => {
  it('棋子多者获胜，相等为和棋', () => {
    const board = createInitialBoard();
    board[0][0] = BLACK;
    expect(decideWinner(board)).toBe('black');

    // 构造 32:32 的终局棋盘 → 和棋
    const draw: typeof board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => EMPTY as typeof EMPTY)
    );
    for (let c = 0; c < 8; c++) {
      draw[0][c] = BLACK;
      draw[1][c] = BLACK;
      draw[2][c] = BLACK;
      draw[3][c] = BLACK;
      draw[4][c] = WHITE;
      draw[5][c] = WHITE;
      draw[6][c] = WHITE;
      draw[7][c] = WHITE;
    }
    expect(decideWinner(draw)).toBe('draw');
  });
});

describe('整局随机模拟（不变量）', () => {
  it('随机对弈 200 局均正常结束且无崩溃', () => {
    for (let game = 0; game < 200; game++) {
      let s = freshState();
      s = joinState(s, 'player-white');
      let guard = 0;
      while (s.status === 'playing' && guard < 100) {
        guard++;
        const moves = getValidMoves(s.board, s.currentTurn);
        expect(moves.length).toBeGreaterThan(0);
        const pick = moves[Math.floor(Math.random() * moves.length)];
        const res = applyMoveToState(s, s.players[s.currentTurn]!, pick.row, pick.col);
        expect(res.ok).toBe(true);
        if (res.ok) s = res.state;
      }
      expect(s.status).toBe('finished');
      const { black, white, empty } = countStones(s.board);
      expect(black + white + empty).toBe(64);
      expect(s.winner).toBe(decideWinner(s.board));
      if (s.winner === 'draw') expect(black).toBe(white);
    }
  });
});

describe('边界：跳过与终局（构造性用例）', () => {
  it('一步吃光对方全部棋子 → 直接终局（无白子则双方均无棋可下）', () => {
    // 第 0 列：(0,0)空 (1..3,0)白 (4,0)黑。黑落 (0,0) 翻掉 3 颗白子，白方 0 子。
    // 白 0 子时黑也无从翻转 → 双方均无棋可下 → finished，黑胜
    const board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => EMPTY)
    ) as GameState['board'];
    board[4][0] = BLACK;
    board[1][0] = WHITE;
    board[2][0] = WHITE;
    board[3][0] = WHITE;

    let s = createInitialState('TEST01', 'pb');
    s = { ...joinState(s, 'pw'), board, status: 'playing' as const };

    const res = applyMoveToState(s, 'pb', 0, 0);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(countStones(res.state.board).white).toBe(0);
      expect(res.state.status).toBe('finished');
      expect(res.state.winner).toBe('black');
    }
  });

  it('跳过分支：落子后对方无棋可下且己方仍可下 → 保持当前回合', () => {
    // 固定种子随机对弈，搜索真实出现的「跳过」局面做构造性断言
    // （种子固定 → 序列确定，测试恒定可复现；黑白棋随机对局中跳过高频出现）
    let seed = 20260831;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let found = false;
    search: for (let game = 0; game < 500; game++) {
      let s = joinState(createInitialState('TEST01', 'pb'), 'pw');
      let guard = 0;
      while (s.status === 'playing' && guard < 100) {
        guard++;
        const moves = getValidMoves(s.board, s.currentTurn);
        const pick = moves[Math.floor(rng() * moves.length)];
        const res = applyMoveToState(s, s.players[s.currentTurn]!, pick.row, pick.col);
        if (!res.ok) break;
        if (
          res.state.status === 'playing' &&
          res.state.currentTurn === s.currentTurn
        ) {
          // 跳过发生：落子方落完后仍是自己的回合
          expect(hasAnyValidMove(res.state.board, opponentOf(s.currentTurn))).toBe(false);
          expect(hasAnyValidMove(res.state.board, s.currentTurn)).toBe(true);
          expect(res.state.moveCount).toBe(s.moveCount + 1);
          found = true;
          break search;
        }
        s = res.state;
      }
    }
    expect(found).toBe(true);
  });

  it('落子后棋盘下满 → 双方无棋可下，对局结束并判定胜负', () => {
    // 全盘黑，仅 (0,0) 空与 (1,0)(2,0) 白：黑落 (0,0) 翻 2 白后全满
    const board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => BLACK)
    ) as GameState['board'];
    board[0][0] = EMPTY;
    board[1][0] = WHITE;
    board[2][0] = WHITE;

    let s = createInitialState('TEST01', 'pb');
    s = { ...joinState(s, 'pw'), board, status: 'playing' as const };

    const res = applyMoveToState(s, 'pb', 0, 0);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(countStones(res.state.board)).toEqual({ black: 64, white: 0, empty: 0 });
      expect(res.state.status).toBe('finished');
      expect(res.state.winner).toBe('black');
    }
  });

  it('异常坐标（越界/小数/NaN）一律 400，不产生非法棋盘', () => {
    const s = joinState(createInitialState('TEST01', 'pb'), 'pw');
    for (const [row, col] of [
      [-1, 3],
      [8, 3],
      [3, -1],
      [3, 8],
      [3.5, 3],
      [NaN, NaN],
    ] as const) {
      const res = applyMoveToState(s, 'pb', row, col);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    }
    expect(countStones(s.board)).toEqual({ black: 2, white: 2, empty: 60 }); // 原状态未被污染
  });

  it('toPublicState：抹掉双方 playerId 且不修改原状态', () => {
    let s = createInitialState('TEST01', 'pb');
    s = joinState(s, 'pw');
    const pub = toPublicState(s);
    expect(pub.players).toEqual({ black: null, white: null });
    expect(pub.board).toEqual(s.board);
    expect(pub.status).toBe(s.status);
    expect(s.players).toEqual({ black: 'pb', white: 'pw' }); // 原对象保持含 id
  });

  it('基础工具一致性', () => {
    const board = createInitialBoard();
    expect(opponentOf('black')).toBe('white');
    expect(hasAnyValidMove(board, 'white')).toBe(true);
    expect(isGameOver(board)).toBe(false);
  });
});

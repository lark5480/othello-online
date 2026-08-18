/**
 * Othello (Reversi) 纯逻辑模块 —— 前端与 Edge Functions 共用。
 * 不依赖任何外部库，可在 V8 / 浏览器 / Node 下直接运行。
 *
 * 棋盘约定：
 *   0 = 空, 1 = 黑, 2 = 白
 *   8×8 二维数组 board[row][col]，row 从上到下、col 从左到右。
 */

export const BOARD_SIZE = 8;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type Stone = 0 | 1 | 2;
export type Player = 'black' | 'white';
export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type Winner = 'black' | 'white' | 'draw' | null;

export type Board = Stone[][];

export interface Move {
  row: number;
  col: number;
}

export interface GameState {
  roomId: string;
  status: RoomStatus;
  board: Board;
  currentTurn: Player;
  players: {
    black: string | null;
    white: string | null;
  };
  moveCount: number;
  lastMove: Move | null;
  winner: Winner;
  createdAt: number;
  updatedAt: number;
}

/** 8 个方向：上、下、左、右、左上、右上、左下、右下 */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export function stoneOf(player: Player): Stone {
  return player === 'black' ? BLACK : WHITE;
}

export function opponentOf(player: Player): Player {
  return player === 'black' ? 'white' : 'black';
}

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/** 深拷贝棋盘，避免函数式更新时污染原状态 */
export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice() as Stone[]);
}

/** 生成标准初始棋盘（中心 4 子交叉摆放） */
export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => EMPTY as Stone)
  );
  const mid = BOARD_SIZE / 2;
  board[mid - 1][mid - 1] = WHITE;
  board[mid - 1][mid] = BLACK;
  board[mid][mid - 1] = BLACK;
  board[mid][mid] = WHITE;
  return board;
}

/**
 * 计算在 (row,col) 落 player 棋子时会翻转的所有对方棋子坐标。
 * 若没有任何可翻转的棋子，返回空数组（该位置非法）。
 */
export function getFlips(
  board: Board,
  row: number,
  col: number,
  player: Player
): Move[] {
  if (!inBounds(row, col) || board[row][col] !== EMPTY) return [];

  const me = stoneOf(player);
  const opp = stoneOf(opponentOf(player));
  const flips: Move[] = [];

  for (const [dr, dc] of DIRECTIONS) {
    const line: Move[] = [];
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c) && board[r][c] === opp) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    // 方向末端必须是己方棋子，且中间至少夹住一颗对方棋子
    if (line.length > 0 && inBounds(r, c) && board[r][c] === me) {
      flips.push(...line);
    }
  }
  return flips;
}

/** (row,col) 是否为当前 player 的合法落子点 */
export function isValidMove(
  board: Board,
  row: number,
  col: number,
  player: Player
): boolean {
  return getFlips(board, row, col, player).length > 0;
}

/** 返回当前 player 所有合法落子点 */
export function getValidMoves(board: Board, player: Player): Move[] {
  const moves: Move[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY && isValidMove(board, r, c, player)) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

/** 当前 player 是否还有合法落子 */
export function hasAnyValidMove(board: Board, player: Player): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === EMPTY && isValidMove(board, r, c, player)) {
        return true;
      }
    }
  }
  return false;
}

/** 统计双方棋子数 */
export function countStones(board: Board): { black: number; white: number; empty: number } {
  let black = 0;
  let white = 0;
  let empty = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const v = board[r][c];
      if (v === BLACK) black++;
      else if (v === WHITE) white++;
      else empty++;
    }
  }
  return { black, white, empty };
}

/** 双方是否都无子可下（对局结束条件之一） */
export function isGameOver(board: Board): boolean {
  return (
    !hasAnyValidMove(board, 'black') && !hasAnyValidMove(board, 'white')
  );
}

/** 依据棋子数判定胜负：黑多黑胜、白多白胜、相等和棋；棋盘未结束返回 null */
export function decideWinner(board: Board): Winner {
  const { black, white } = countStones(board);
  if (black > white) return 'black';
  if (white > black) return 'white';
  return 'draw';
}

/**
 * 在棋盘上应用一步落子，返回新棋盘（不修改入参）。
 * 调用前需保证该位置合法（getFlips 非空）。
 */
export function applyMoveBoard(
  board: Board,
  row: number,
  col: number,
  player: Player
): Board {
  const flips = getFlips(board, row, col, player);
  if (flips.length === 0) return cloneBoard(board);
  const next = cloneBoard(board);
  const me = stoneOf(player);
  next[row][col] = me;
  for (const f of flips) {
    next[f.row][f.col] = me;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* 房间状态层面的逻辑（供 Edge Functions 直接调用，便于单测）            */
/* ------------------------------------------------------------------ */

export function createInitialState(
  roomId: string,
  blackPlayerId: string,
  now: number = Date.now()
): GameState {
  return {
    roomId,
    status: 'waiting',
    board: createInitialBoard(),
    currentTurn: 'black',
    players: { black: blackPlayerId, white: null },
    moveCount: 0,
    lastMove: null,
    winner: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** 加入房间：第二个玩家作为白方，状态切到 playing */
export function joinState(state: GameState, whitePlayerId: string, now: number = Date.now()): GameState {
  return {
    ...state,
    players: { ...state.players, white: whitePlayerId },
    status: 'playing',
    updatedAt: now,
  };
}

export type MoveResult =
  | { ok: true; state: GameState }
  | { ok: false; status: number; error: string };

/**
 * 应用一步落子到完整房间状态，返回新状态或错误。
 * 内置全部校验：房间状态、回合归属、落子合法性、跳过与胜负判定。
 * 与 PRD 7.1 的落子逻辑一一对应。
 */
export function applyMoveToState(
  state: GameState,
  playerId: string,
  row: number,
  col: number,
  now: number = Date.now()
): MoveResult {
  if (state.status !== 'playing') {
    return { ok: false, status: 409, error: 'not playing' };
  }
  const player = state.currentTurn;
  if (state.players[player] !== playerId) {
    return { ok: false, status: 409, error: 'not your turn' };
  }
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return { ok: false, status: 400, error: 'invalid move' };
  }
  if (!isValidMove(state.board, row, col, player)) {
    return { ok: false, status: 400, error: 'invalid move' };
  }

  const board = applyMoveBoard(state.board, row, col, player);
  const opponent = opponentOf(player);

  let currentTurn = player;
  let status: RoomStatus = 'playing';
  let winner: Winner = null;

  if (hasAnyValidMove(board, opponent)) {
    currentTurn = opponent; // 正常切换回合
  } else if (hasAnyValidMove(board, player)) {
    currentTurn = player; // 对方无子可下 → 跳过，保持当前回合
  } else {
    status = 'finished'; // 双方都无子可下 → 结束
    winner = decideWinner(board);
  }

  return {
    ok: true,
    state: {
      ...state,
      board,
      currentTurn,
      status,
      winner,
      moveCount: state.moveCount + 1,
      lastMove: { row, col },
      updatedAt: now,
    },
  };
}

/** 再来一局：保留房间与玩家，重置棋盘与对局状态 */
export function restartState(state: GameState, now: number = Date.now()): GameState {
  return {
    ...state,
    status: 'playing',
    board: createInitialBoard(),
    currentTurn: 'black',
    moveCount: 0,
    lastMove: null,
    winner: null,
    updatedAt: now,
  };
}

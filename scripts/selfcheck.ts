/**
 * 不依赖任何 npm 包的核心逻辑自测：用 Node 类型剥离直接跑 gameLogic.ts。
 * 运行：node --experimental-strip-types scripts/selfcheck.ts
 */
import assert from 'node:assert/strict';
import {
  BLACK,
  WHITE,
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
  type GameState,
} from '../src/utils/gameLogic.ts';

let passed = 0;
function ok(name: string, cond: boolean) {
  assert.equal(cond, true, name);
  passed++;
}

// 1. 初始棋盘
{
  const board = createInitialBoard();
  ok('初始中心4子', board[3][3] === WHITE && board[3][4] === BLACK && board[4][3] === BLACK && board[4][4] === WHITE);
  const c = countStones(board);
  ok('初始黑白各2', c.black === 2 && c.white === 2);
}

// 2. 开局合法落子 4 个
{
  const board = createInitialBoard();
  const moves = getValidMoves(board, 'black');
  ok('开局黑方4个合法点', moves.length === 4);
  ok('(2,3)合法/(0,0)非法', isValidMove(board, 2, 3, 'black') && !isValidMove(board, 0, 0, 'black'));
  const flips = getFlips(board, 2, 3, 'black');
  ok('getFlips 仅夹住 (3,3)', JSON.stringify(flips) === JSON.stringify([{ row: 3, col: 3 }]));
}

// 3. 翻转执行
{
  const board = createInitialBoard();
  const next = applyMoveBoard(board, 2, 3, 'black');
  ok('落子点变黑', next[2][3] === BLACK);
  ok('被夹白子翻黑', next[3][3] === BLACK);
  const c = countStones(next);
  ok('翻转后黑4白1', c.black === 4 && c.white === 1);
  // 纯函数不修改原棋盘
  ok('原棋盘未变', countStones(board).black === 2);
}

// 4. applyMoveToState 校验（需先 join 使状态进入 playing）
{
  const s = joinState(createInitialState('T1', 'pb'), 'pw');
  const r1 = applyMoveToState(s, 'pw', 2, 3);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.status, 409); // 非当前回合

  const r2 = applyMoveToState(s, 'pb', 0, 0);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.status, 400); // 非法落子

  const r3 = applyMoveToState(s, 'pb', 2, 3);
  assert.equal(r3.ok, true);
  if (r3.ok) {
    assert.equal(r3.state.currentTurn, 'white');
    assert.equal(r3.state.moveCount, 1);
    assert.deepEqual(r3.state.lastMove, { row: 2, col: 3 });
  }
  passed += 3;
}

// 5. join / restart
{
  let s = createInitialState('T2', 'pb');
  s = joinState(s, 'pw');
  ok('加入后白方就位', s.players.white === 'pw' && s.status === 'playing');
  const moved = applyMoveToState(s, 'pb', 2, 3);
  assert.equal(moved.ok, true);
  if (moved.ok) {
    const r = restartState(moved.state);
    ok('restart 重置', r.moveCount === 0 && r.currentTurn === 'black' && r.status === 'playing');
    ok('restart 保留玩家', r.players.black === 'pb' && r.players.white === 'pw');
    const c = countStones(r.board);
    ok('restart 棋盘重置', c.black === 2 && c.white === 2 && c.empty === 60);
  }
}

// 6. 胜负判定
{
  const board = createInitialBoard();
  board[0][0] = BLACK;
  ok('黑多黑胜', decideWinner(board) === 'black');
}

// 7. 整局随机模拟 200 局不变量
{
  let games = 0;
  for (let g = 0; g < 200; g++) {
    let s = createInitialState('G' + g, 'pb');
    s = joinState(s, 'pw');
    let guard = 0;
    while (s.status === 'playing' && guard < 100) {
      guard++;
      const moves = getValidMoves(s.board, s.currentTurn);
      assert.ok(moves.length > 0, '进行中必有合法落子');
      const pick = moves[Math.floor(Math.random() * moves.length)];
      const res = applyMoveToState(s, s.players[s.currentTurn]!, pick.row, pick.col);
      assert.equal(res.ok, true);
      if (res.ok) s = res.state;
    }
    assert.equal(s.status, 'finished', '对局必结束');
    const c = countStones(s.board);
    assert.equal(c.black + c.white + c.empty, 64, '棋子总数=64');
    assert.equal(s.winner, decideWinner(s.board), 'winner 一致');
    games++;
  }
  ok('200局随机模拟通过', games === 200);
}

// 8. 边界：终局与无子判定
{
  const board = createInitialBoard();
  ok('开局未结束', !isGameOver(board));
  ok('开局双方均有子', hasAnyValidMove(board, 'black') && hasAnyValidMove(board, 'white'));
}

console.log(`\n✅ selfcheck 通过：${passed} 项断言（含模拟局）`);

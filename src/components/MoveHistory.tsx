import { useEffect, useRef, useState } from 'react';
import {
  applyMoveBoard,
  createInitialBoard,
  BLACK,
  type Board as BoardType,
  type GameState,
  type Move,
  type Player,
} from '../utils/gameLogic';
import { moveToLabel } from '../utils/coords';
import Board from './Board';
import { CloseIcon, HistoryIcon } from './icons';

interface Entry {
  move: Move;
  player: Player;
}

/**
 * 走子记录侧栏：随对局进行累计每一步坐标（从 board 上最后一手的颜色反推执子方，
 * 因此对跳过的回合同样准确）。点击某手可「回顾」该时刻的棋盘（通过重放重建，
 * 不影响实时对局）。联网 / 人机 / 本地双人模式通用。
 */
export default function MoveHistory({ state }: { state: GameState }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [review, setReview] = useState<number | null>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    const lm = state.lastMove;
    if (state.moveCount > prevCount.current && lm) {
      const mover: Player = state.board[lm.row][lm.col] === BLACK ? 'black' : 'white';
      setEntries((e) => [...e, { move: lm, player: mover }]);
    } else if (state.moveCount < prevCount.current) {
      setEntries([]); // 重开：清空记录
      setReview(null);
    }
    prevCount.current = state.moveCount;
  }, [state]);

  const reviewBoard: BoardType | null = review === null ? null : reconstruct(entries, review);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HistoryIcon size={16} />
          <span className="text-strong text-sm font-medium">走子记录</span>
        </div>
        <span className="text-muted text-xs tabular-nums">{entries.length} 手</span>
      </div>

      <div className="mt-3 max-h-44 overflow-y-auto pr-1">
        {entries.length === 0 ? (
          <p className="text-muted text-xs">对局开始后显示每一步坐标，点击可回顾该手棋形。</p>
        ) : (
          <ol className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            {entries.map((e, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setReview(i)}
                  className="btn-ghost-border flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors"
                >
                  <span className="text-muted w-5 text-right tabular-nums">{i + 1}.</span>
                  <span className={`disc disc-mini ${e.player === 'black' ? 'disc-black' : 'disc-white'}`} />
                  <span className="text-strong font-mono">{moveToLabel(e.move)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {review !== null && reviewBoard && entries[review] && (
        <div
          className="overlay-bg fixed inset-0 z-20 flex items-center justify-center px-4"
          onClick={() => setReview(null)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-strong text-sm font-medium">
                第 {review + 1} 手 · {moveToLabel(entries[review].move)}
              </span>
              <button
                type="button"
                onClick={() => setReview(null)}
                className="btn-ghost-border flex items-center justify-center rounded-lg p-1.5"
                aria-label="关闭回顾"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <Board
                board={reviewBoard}
                validMoves={[]}
                lastMove={entries[review].move}
                interactive={false}
                showHints={false}
                currentTurn={null}
                onMove={() => {}}
              />
            </div>
            <button
              type="button"
              onClick={() => setReview(null)}
              className="btn-solid mt-4 w-full rounded-xl py-2.5 text-sm font-medium"
            >
              返回实时棋局
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 从初始棋盘重放前 index 手，重建当时局面 */
function reconstruct(entries: Entry[], index: number): BoardType {
  let board = createInitialBoard();
  for (let i = 0; i <= index; i++) {
    board = applyMoveBoard(board, entries[i].move.row, entries[i].move.col, entries[i].player);
  }
  return board;
}

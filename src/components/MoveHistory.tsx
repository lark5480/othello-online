import { useState } from 'react';
import {
  applyMoveBoard,
  createInitialBoard,
  type Board as BoardType,
  type GameState,
  type MoveWithPlayer,
} from '../utils/gameLogic';
import { moveToLabel } from '../utils/coords';
import Board from './Board';
import { CloseIcon, HistoryIcon } from './icons';

/**
 * 走子记录侧栏：由服务端 state.moves（完整棋谱）直接派生，
 * 因此刷新 / 断线重连后依然完整，且每手执子方由持久化字段给出、无需从棋盘反推。
 * 点击某手可「回顾」该时刻的棋盘（通过重放重建，不影响实时对局）。
 * 联网 / 人机 / 本地双人模式通用。
 */
export default function MoveHistory({ state }: { state: GameState }) {
  const [review, setReview] = useState<number | null>(null);
  const entries = state.moves;

  // 重开后棋谱为空，若仍停留在旧索引上会导致回顾越界，故夹到合法范围
  const reviewIndex = review !== null && review < entries.length ? review : null;
  const reviewBoard: BoardType | null = reviewIndex === null ? null : reconstruct(entries, reviewIndex);

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
                  <span className="text-strong font-mono">{moveToLabel(e)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {reviewIndex !== null && reviewBoard && entries[reviewIndex] && (
        <div
          className="overlay-bg fixed inset-0 z-20 flex items-center justify-center px-4"
          onClick={() => setReview(null)}
        >
          <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-strong text-sm font-medium">
                第 {reviewIndex + 1} 手 · {moveToLabel(entries[reviewIndex])}
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
                lastMove={entries[reviewIndex]}
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
function reconstruct(entries: MoveWithPlayer[], index: number): BoardType {
  let board = createInitialBoard();
  for (let i = 0; i <= index; i++) {
    const m = entries[i];
    board = applyMoveBoard(board, m.row, m.col, m.player);
  }
  return board;
}

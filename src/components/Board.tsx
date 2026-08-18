import { useMemo } from 'react';
import { type Board as BoardType, type Move } from '../utils/gameLogic';
import Cell from './Cell';

interface BoardProps {
  board: BoardType;
  validMoves: Move[];
  lastMove: Move | null;
  interactive: boolean; // = myTurn：是否当前玩家回合（决定是否可点击）
  showHints: boolean; // 是否渲染落子提示点（来自开关）
  onMove: (row: number, col: number) => void;
}

export default function Board({
  board,
  validMoves,
  lastMove,
  interactive,
  showHints,
  onMove,
}: BoardProps) {
  // 合法格集合：始终在我方回合计算（决定可点击），与 showHints 无关
  const legalSet = useMemo(() => {
    const set = new Set<string>();
    if (interactive) {
      for (const m of validMoves) set.add(`${m.row},${m.col}`);
    }
    return set;
  }, [validMoves, interactive]);

  // 提示视觉集合：仅当「我方回合 且 开关开启」时填充
  const hintSet = useMemo(() => {
    const set = new Set<string>();
    if (interactive && showHints) {
      for (const m of validMoves) set.add(`${m.row},${m.col}`);
    }
    return set;
  }, [validMoves, interactive, showHints]);

  return (
    <div className="board-grid">
      {board.map((rowArr, r) =>
        rowArr.map((v, c) => {
          const key = `${r},${c}`;
          const isLegal = legalSet.has(key); // 是否合法落子（可点击）
          const isHint = hintSet.has(key); // 是否显示提示点
          return (
            <Cell
              key={key}
              value={v}
              isHint={isHint}
              isLast={lastMove?.row === r && lastMove?.col === c}
              interactive={isLegal}
              onClick={() => onMove(r, c)}
            />
          );
        })
      )}
    </div>
  );
}

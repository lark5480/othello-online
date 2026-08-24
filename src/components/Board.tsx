import { useMemo, useState } from 'react';
import {
  getFlips,
  type Board as BoardType,
  type Move,
  type Player,
} from '../utils/gameLogic';
import Cell from './Cell';

interface BoardProps {
  board: BoardType;
  validMoves: Move[];
  lastMove: Move | null;
  interactive: boolean; // = myTurn：是否当前玩家回合（决定是否可点击）
  showHints: boolean; // 是否渲染落子提示点（来自开关）
  /** 当前回合执子方（用于落子预览颜色），非对局中传 null */
  currentTurn: Player | null;
  onMove: (row: number, col: number) => void;
}

export default function Board({
  board,
  validMoves,
  lastMove,
  interactive,
  showHints,
  currentTurn,
  onMove,
}: BoardProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);

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

  // 落子预览：hover 到合法格时计算将被翻转的棋子集合与 ghost 颜色
  const preview = useMemo(() => {
    if (!interactive || !currentTurn || !hoverKey) return null;
    if (!legalSet.has(hoverKey)) return null;
    const [r, c] = hoverKey.split(',').map(Number);
    const flips = getFlips(board, r, c, currentTurn);
    return {
      flipSet: new Set(flips.map((f) => `${f.row},${f.col}`)),
    };
  }, [board, currentTurn, hoverKey, interactive, legalSet]);

  return (
    <div
      className="board-grid"
      onMouseLeave={() => setHoverKey(null)}
      onMouseOver={(e) => {
        const el = (e.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
        if (!el) return setHoverKey(null);
        const r = el.dataset.row!;
        const c = el.dataset.col!;
        setHoverKey(`${r},${c}`);
      }}
    >
      {board.map((rowArr, r) =>
        rowArr.map((v, c) => {
          const key = `${r},${c}`;
          const isLegal = legalSet.has(key); // 是否合法落子（可点击）
          const isHint = hintSet.has(key); // 是否显示提示点
          const isGhost = preview !== null && key === hoverKey && v === 0;
          const willFlip = preview?.flipSet.has(key) ?? false;
          return (
            <Cell
              key={key}
              data-row={r}
              data-col={c}
              value={v}
              isHint={isHint}
              isLast={lastMove?.row === r && lastMove?.col === c}
              interactive={isLegal}
              ghost={isGhost}
              willFlip={willFlip}
              ghostColor={currentTurn}
              onClick={() => onMove(r, c)}
            />
          );
        })
      )}
    </div>
  );
}

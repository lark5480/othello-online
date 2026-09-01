import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Board from './Board';
import { BLACK, createInitialBoard, getValidMoves } from '../utils/gameLogic';

/** 开局黑方合法落子点 */
const INITIAL_BLACK_MOVES = [
  { row: 2, col: 3 },
  { row: 3, col: 2 },
  { row: 4, col: 5 },
  { row: 5, col: 4 },
];

function renderBoard(props?: Partial<ComponentProps<typeof Board>>) {
  const board = createInitialBoard();
  const validMoves = getValidMoves(board, 'black');
  const onMove = vi.fn();
  const utils = render(
    <Board
      board={board}
      validMoves={validMoves}
      lastMove={null}
      interactive
      showHints
      currentTurn="black"
      onMove={onMove}
      {...props}
    />
  );
  return { ...utils, onMove, board, validMoves };
}

const cellAt = (r: number, c: number) =>
  document.querySelectorAll('.board-grid button')[r * 8 + c] as HTMLButtonElement;

describe('Board 渲染', () => {
  it('渲染 8×8=64 个格位', () => {
    renderBoard();
    expect(document.querySelectorAll('.board-grid button')).toHaveLength(64);
  });

  it('初始棋盘中心 4 子交叉摆放（黑 2 白 2）', () => {
    renderBoard();
    expect(cellAt(3, 3).querySelector('.disc-white')).toBeInTheDocument();
    expect(cellAt(3, 4).querySelector('.disc-black')).toBeInTheDocument();
    expect(cellAt(4, 3).querySelector('.disc-black')).toBeInTheDocument();
    expect(cellAt(4, 4).querySelector('.disc-white')).toBeInTheDocument();
  });
});

describe('Board 三态：提示 / 可点击 / 最后落子', () => {
  it('showHints=true 且 interactive 时，合法格显示提示点且可点击', () => {
    renderBoard({ interactive: true, showHints: true });
    expect(document.querySelectorAll('.hint-dot')).toHaveLength(INITIAL_BLACK_MOVES.length);
    for (const m of INITIAL_BLACK_MOVES) {
      expect(cellAt(m.row, m.col)).not.toBeDisabled();
      expect(cellAt(m.row, m.col)).toHaveAccessibleName('可落子位置');
    }
  });

  it('showHints=false 时隐藏提示点，但合法格仍可点击（提示与交互解耦）', () => {
    renderBoard({ interactive: true, showHints: false });
    expect(document.querySelectorAll('.hint-dot')).toHaveLength(0);
    // 关键：隐藏提示后棋盘仍可落子
    for (const m of INITIAL_BLACK_MOVES) {
      expect(cellAt(m.row, m.col)).not.toBeDisabled();
      expect(cellAt(m.row, m.col)).toHaveAccessibleName('可落子位置');
    }
    // 非合法格依旧不可点
    expect(cellAt(0, 0)).toBeDisabled();
  });

  it('interactive=false（非我方回合）时全部格位不可点击', () => {
    renderBoard({ interactive: false });
    expect(document.querySelectorAll('.board-grid button:disabled')).toHaveLength(64);
    expect(document.querySelectorAll('.hint-dot')).toHaveLength(0);
  });

  it('点击合法格触发 onMove 并携带正确坐标', async () => {
    const { onMove } = renderBoard({ interactive: true, showHints: false });
    await userEvent.click(cellAt(2, 3));
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(2, 3);
    await userEvent.click(cellAt(4, 5));
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onMove).toHaveBeenCalledWith(4, 5);
  });

  it('点击非合法格不触发 onMove', async () => {
    const { onMove } = renderBoard({ interactive: true, showHints: false });
    await userEvent.click(cellAt(0, 0));
    expect(onMove).not.toHaveBeenCalled();
  });

  it('lastMove 对应的格位渲染最后落子标记', () => {
    renderBoard({ lastMove: { row: 3, col: 3 } });
    expect(cellAt(3, 3).querySelector('.last-move-triangle')).toBeInTheDocument();
    // 其余格位无标记
    expect(cellAt(2, 3).querySelector('.last-move-triangle')).not.toBeInTheDocument();
  });

  it('落子预览颜色跟随 currentTurn（ghost 子）', () => {
    const board = createInitialBoard();
    board[2][3] = BLACK;
    renderBoard({ board, currentTurn: 'white' });
    expect(cellAt(2, 3).querySelector('.disc-black')).toBeInTheDocument();
  });
});

describe('Board 无障碍', () => {
  it('有子格位用「棋子 黑/白」标注，空位标注为「空位」', () => {
    renderBoard();
    expect(cellAt(3, 3)).toHaveAccessibleName('棋子 白');
    expect(cellAt(3, 4)).toHaveAccessibleName('棋子 黑');
    expect(cellAt(0, 0)).toHaveAccessibleName('空位');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GameInfo from './GameInfo';
import { createInitialBoard, type GameState } from '../utils/gameLogic';

function state(over?: Partial<GameState>): GameState {
  return {
    roomId: 'ROOM12',
    status: 'playing',
    board: createInitialBoard(),
    currentTurn: 'black',
    players: { black: null, white: null },
    moveCount: 0,
    lastMove: null,
    winner: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

describe('GameInfo 状态文案', () => {
  it('waiting 显示「等待对方加入…」', () => {
    render(<GameInfo roomId="ROOM12" state={state({ status: 'waiting' })} myColor={null} />);
    expect(screen.getByText('等待对方加入…')).toBeInTheDocument();
  });

  it('playing 且轮到我方 → 「轮到你落子」+ 我标记', () => {
    render(<GameInfo roomId="ROOM12" state={state()} myColor="black" />);
    expect(screen.getByText('轮到你落子')).toBeInTheDocument();
    expect(screen.getByText('你')).toBeInTheDocument();
  });

  it('playing 且轮到对方 → 「等待对方落子…」', () => {
    render(
      <GameInfo
        roomId="ROOM12"
        state={state({ currentTurn: 'white' })}
        myColor="black"
      />
    );
    expect(screen.getByText('等待对方落子…')).toBeInTheDocument();
  });

  it('观战者（myColor=null）→ 「观战中」', () => {
    render(<GameInfo roomId="ROOM12" state={state()} myColor={null} />);
    expect(screen.getByText('观战中')).toBeInTheDocument();
  });

  it('人机模式 AI 思考中 → 「AI 思考中…」', () => {
    render(
      <GameInfo
        roomId="ROOM12"
        state={state({ currentTurn: 'black' })}
        myColor="white"
        aiThinking
        subtitle="人机对战 · 困难"
      />
    );
    expect(screen.getByText('AI 思考中…')).toBeInTheDocument();
    expect(screen.getByText('人机对战 · 困难')).toBeInTheDocument();
  });
});

describe('GameInfo 计分与复制', () => {
  it('显示双方棋子数与房间号', () => {
    render(<GameInfo roomId="ROOM12" state={state()} myColor={null} />);
    // 初始棋盘黑 2 白 2
    const scoreNumbers = screen.getAllByText('2');
    expect(scoreNumbers.length).toBe(2);
    expect(screen.getByText('ROOM12')).toBeInTheDocument();
  });

  it('点击复制触发 onCopyCode', async () => {
    const onCopyCode = vi.fn();
    render(
      <GameInfo roomId="ROOM12" state={state()} myColor={null} onCopyCode={onCopyCode} />
    );
    await userEvent.click(screen.getByRole('button', { name: /复制/ }));
    expect(onCopyCode).toHaveBeenCalledTimes(1);
  });
});

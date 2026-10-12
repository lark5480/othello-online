import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AIGame from './AIGame';
import { createAIGameState, type Difficulty } from '../utils/ai';
import {
  applyMoveToState,
  createInitialState,
  getValidMoves,
  joinState,
  type Board,
  type GameState,
  type Move,
  type Player,
} from '../utils/gameLogic';
import { useBoardSound } from '../hooks/useBoardSound';
import { getStats, recordResult } from '../utils/stats';

vi.mock('../utils/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/ai')>();
  return { ...actual, createAIGameState: vi.fn(actual.createAIGameState) };
});

vi.mock('../utils/gameLogic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/gameLogic')>();
  return { ...actual, applyMoveToState: vi.fn(actual.applyMoveToState) };
});

vi.mock('../hooks/useBoardSound', () => ({ useBoardSound: vi.fn() }));

vi.mock('../utils/stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/stats')>();
  return { ...actual, recordResult: vi.fn(actual.recordResult) };
});

interface AIRequest {
  id: number;
  board: Board;
  aiPlayer: Player;
  difficulty: Difficulty;
}

class MockWorker extends EventTarget {
  static instances: MockWorker[] = [];
  postMessage = vi.fn<(request: AIRequest) => void>();
  terminate = vi.fn();

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  respond(id: number, move: Move | null) {
    this.dispatchEvent(new MessageEvent('message', { data: { id, move } }));
  }
}

function renderGame() {
  return render(<MemoryRouter><AIGame /></MemoryRouter>);
}

function startAsWhite() {
  const view = renderGame();
  fireEvent.click(screen.getByRole('button', { name: '执白 · 后手' }));
  fireEvent.click(screen.getByRole('button', { name: '开始对局' }));
  return { ...view, worker: MockWorker.instances[0] };
}

function advanceThinking() {
  act(() => vi.advanceTimersByTime(800));
}

function requestAt(worker: MockWorker, index: number) {
  return worker.postMessage.mock.calls[index][0];
}

function currentSoundOptions() {
  const calls = vi.mocked(useBoardSound).mock.calls;
  return calls[calls.length - 1][0];
}

const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

beforeEach(() => {
  vi.mocked(window.matchMedia).mockReturnValue(mediaQuery);
  vi.clearAllMocks();
  vi.useFakeTimers();
  MockWorker.instances = [];
  vi.stubGlobal('Worker', MockWorker);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AIGame Worker 请求隔离', () => {
  it('重开后的旧响应不落子，也不会消费新请求的监听器', () => {
    const { worker } = startAsWhite();
    advanceThinking();
    const oldRequest = requestAt(worker, 0);
    fireEvent.click(screen.getByRole('button', { name: '新对局' }));
    advanceThinking();
    const newRequest = requestAt(worker, 1);
    expect(newRequest.id).not.toBe(oldRequest.id);
    expect(MockWorker.instances).toHaveLength(1);
    expect(worker.terminate).not.toHaveBeenCalled();

    act(() => worker.respond(oldRequest.id, { row: 2, col: 3 }));
    expect(applyMoveToState).not.toHaveBeenCalled();
    expect(currentSoundOptions().state?.moveCount).toBe(0);
    expect(screen.getByText('AI 思考中…')).toBeInTheDocument();

    act(() => worker.respond(newRequest.id, { row: 3, col: 2 }));
    expect(applyMoveToState).toHaveBeenCalledTimes(1);
    expect(currentSoundOptions().state?.lastMove).toEqual({ row: 3, col: 2 });
    expect(screen.getByText('轮到你落子')).toBeInTheDocument();
  });

  it('重开点击后、effect cleanup 前收到旧响应也不会污染新棋局', () => {
    const { worker } = startAsWhite();
    advanceThinking();
    const request = requestAt(worker, 0);
    const restart = screen.getByRole('button', { name: '新对局' });

    act(() => {
      restart.click();
      worker.respond(request.id, { row: 2, col: 3 });
    });

    expect(applyMoveToState).not.toHaveBeenCalled();
    expect(currentSoundOptions().state?.moveCount).toBe(0);
    advanceThinking();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
  });

  it('匹配响应后移除监听器，重复响应不会在后续 AI 回合再次落子', () => {
    const { worker } = startAsWhite();
    const add = vi.spyOn(worker, 'addEventListener');
    const remove = vi.spyOn(worker, 'removeEventListener');
    advanceThinking();
    const request = requestAt(worker, 0);
    act(() => worker.respond(request.id, { row: 2, col: 3 }));
    expect(remove).toHaveBeenCalledWith('message', add.mock.calls[0][1]);

    const state = currentSoundOptions().state!;
    const move = getValidMoves(state.board, 'white')[0];
    const cell = document.querySelectorAll('.board-grid button')[move.row * 8 + move.col];
    fireEvent.click(cell);
    advanceThinking();
    const nextRequest = requestAt(worker, 1);
    vi.mocked(applyMoveToState).mockClear();

    act(() => worker.respond(request.id, { row: 2, col: 3 }));
    expect(applyMoveToState).not.toHaveBeenCalled();
    expect(currentSoundOptions().state?.moveCount).toBe(2);
    act(() => worker.respond(nextRequest.id, getValidMoves(nextRequest.board, 'black')[0]));
    expect(applyMoveToState).toHaveBeenCalledTimes(1);
    expect(currentSoundOptions().state?.moveCount).toBe(3);
  });

  it.each(['重新设置', '卸载'])('%s 清理未完成请求的监听器', (action) => {
    const { worker, unmount } = startAsWhite();
    const add = vi.spyOn(worker, 'addEventListener');
    const remove = vi.spyOn(worker, 'removeEventListener');
    advanceThinking();
    const request = requestAt(worker, 0);

    if (action === '卸载') unmount();
    else fireEvent.click(screen.getByRole('button', { name: action }));

    expect(remove).toHaveBeenCalledWith('message', add.mock.calls[0][1]);
    act(() => worker.respond(request.id, { row: 2, col: 3 }));
    expect(applyMoveToState).not.toHaveBeenCalled();
    if (action === '卸载') expect(worker.terminate).toHaveBeenCalledTimes(1);
    else expect(screen.getByRole('button', { name: '开始对局' })).toBeInTheDocument();
  });

  it.each(['重新设置', '卸载'])('%s 取消尚未发送的延时请求', (action) => {
    const { worker, unmount } = startAsWhite();
    if (action === '卸载') unmount();
    else fireEvent.click(screen.getByRole('button', { name: action }));
    advanceThinking();
    expect(worker.postMessage).not.toHaveBeenCalled();
  });
});

describe('AIGame 和棋结果', () => {
  function startDraw(color: Player) {
    const state: GameState = {
      ...joinState(createInitialState('AI-LOCAL', 'black-player'), 'white-player'),
      board: Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, () => row < 4 ? 1 : 2)),
      status: 'finished',
      winner: 'draw',
      moveCount: 60,
    };
    vi.mocked(createAIGameState).mockReturnValueOnce(state);
    renderGame();
    if (color === 'white') fireEvent.click(screen.getByRole('button', { name: '执白 · 后手' }));
    fireEvent.click(screen.getByRole('button', { name: '开始对局' }));
    return state;
  }

  it.each(['black', 'white'] as const)('执%s 和棋记为 draw，重新渲染不重复记录', (color) => {
    startDraw(color);
    expect(recordResult).toHaveBeenCalledWith('medium', 'draw', 0);
    fireEvent.click(screen.getByRole('switch', { name: '显示落子提示' }));
    expect(recordResult).toHaveBeenCalledTimes(1);
    expect(getStats('medium')).toEqual({ games: 1, wins: 0, losses: 0, draws: 1, bestMargin: 0 });
  });

  it.each(['black', 'white'] as const)('执%s 和棋传给棋盘音效的结果为 draw', (color) => {
    const state = startDraw(color);
    expect(currentSoundOptions().resolveOutcome?.(state)).toBe('draw');
  });
});

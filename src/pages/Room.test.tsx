import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Room from './Room';
import {
  createInitialState,
  joinState,
  toPublicState,
  type GameState,
} from '../utils/gameLogic';
import { ApiError, getRoomState, postMove, STORAGE_HINT } from '../utils/api';

vi.mock('../utils/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/api')>();
  return {
    ...actual,
    getRoomState: vi.fn(),
    postMove: vi.fn(),
    restartRoom: vi.fn(),
  };
});

const mockGetRoomState = vi.mocked(getRoomState);
const mockPostMove = vi.mocked(postMove);

const ROOM_ID = 'ROOM12';
const COLOR_KEY = `othello_room_color_${ROOM_ID}`;

function waitingState(now = 1000): GameState {
  return toPublicState(createInitialState(ROOM_ID, 'p-black', now));
}

function playingState(now = 2000, moveCount = 0): GameState {
  const joined = joinState(createInitialState(ROOM_ID, 'p-black', 1000), 'p-white', now);
  return toPublicState({ ...joined, moveCount, updatedAt: now });
}

function renderRoom() {
  return render(
    <MemoryRouter initialEntries={[`/room/${ROOM_ID}`]}>
      <Routes>
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const cellAt = (r: number, c: number) =>
  document.querySelectorAll('.board-grid button')[r * 8 + c] as HTMLButtonElement;

beforeEach(() => {
  mockGetRoomState.mockReset();
  mockPostMove.mockReset();
});

describe('Room 加载与错误路径', () => {
  it('首次加载显示加载中', () => {
    mockGetRoomState.mockReturnValue(new Promise(() => {}));
    renderRoom();
    expect(screen.getByText('加载中…')).toBeInTheDocument();
  });

  it('房间不存在（404）时提示并展示返回首页', async () => {
    mockGetRoomState.mockRejectedValue(new ApiError('room not found', 404));
    renderRoom();
    expect(await screen.findByText('房间不存在或已结束')).toBeInTheDocument();
    // 顶部导航与错误卡片各有一个「返回首页」，均可返回
    expect(screen.getAllByRole('button', { name: '返回首页' }).length).toBeGreaterThanOrEqual(1);
  });

  it('存储未配置（503）时给出可操作的友好提示', async () => {
    mockGetRoomState.mockRejectedValue(new ApiError('storage not configured', 503));
    renderRoom();
    expect(await screen.findByText(STORAGE_HINT)).toBeInTheDocument();
  });

  it('其他错误显示加载失败', async () => {
    mockGetRoomState.mockRejectedValue(new Error('boom'));
    renderRoom();
    expect(await screen.findByText('加载失败')).toBeInTheDocument();
  });
});

describe('Room 正常渲染', () => {
  it('waiting 状态展示房间号、等待文案与棋盘', async () => {
    mockGetRoomState.mockResolvedValue({ state: waitingState() });
    renderRoom();
    expect(await screen.findByText('等待对方加入…')).toBeInTheDocument();
    expect(screen.getByText(ROOM_ID)).toBeInTheDocument();
    expect(document.querySelectorAll('.board-grid button')).toHaveLength(64);
  });

  it('轮询：等待方自动感知对手加入并开始对局', async () => {
    localStorage.setItem(COLOR_KEY, 'black');
    // 第 1 次：首次加载返回 waiting；后续轮询返回 playing
    mockGetRoomState.mockResolvedValueOnce({ state: waitingState() });
    mockGetRoomState.mockResolvedValue({ state: playingState() });
    renderRoom();
    expect(await screen.findByText('等待对方加入…')).toBeInTheDocument();
    // waiting 轮询间隔 3s，真实 timers 等待对手加入
    expect(await screen.findByText('轮到你落子', {}, { timeout: 6000 })).toBeInTheDocument();
    expect(mockGetRoomState.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Room 落子与冲突重试', () => {
  it('我方回合可落子：点击合法格调用 postMove 并携带回合版本', async () => {
    localStorage.setItem(COLOR_KEY, 'black');
    mockGetRoomState.mockResolvedValue({ state: playingState() });
    mockPostMove.mockResolvedValue({ state: playingState(3000, 1) });
    renderRoom();
    await screen.findByText('轮到你落子');

    await userEvent.click(cellAt(2, 3));
    await waitFor(() => expect(mockPostMove).toHaveBeenCalledTimes(1));
    expect(mockPostMove).toHaveBeenCalledWith(ROOM_ID, expect.any(String), 2, 3, 2000);
  });

  it('409 冲突（对方已落子）时自动重新拉取最新状态', async () => {
    localStorage.setItem(COLOR_KEY, 'black');
    mockGetRoomState.mockResolvedValueOnce({ state: playingState() });
    mockPostMove.mockRejectedValueOnce(new ApiError('state conflict', 409));
    // 冲突后重拉：返回对手已落子、轮到我方的新状态
    mockGetRoomState.mockResolvedValueOnce({ state: playingState(5000, 1) });
    renderRoom();
    await screen.findByText('轮到你落子');

    await userEvent.click(cellAt(2, 3));
    await waitFor(() => expect(mockPostMove).toHaveBeenCalledTimes(1));
    // 409 触发重新拉取
    await waitFor(() => expect(mockGetRoomState).toHaveBeenCalledTimes(2));
  });

  it('落子网络错误时提示「落子失败，请重试」', async () => {
    localStorage.setItem(COLOR_KEY, 'black');
    mockGetRoomState.mockResolvedValueOnce({ state: playingState() });
    mockPostMove.mockRejectedValueOnce(new Error('network down'));
    renderRoom();
    await screen.findByText('轮到你落子');

    await userEvent.click(cellAt(2, 3));
    expect(await screen.findByText('落子失败，请重试')).toBeInTheDocument();
  });
});

describe('Room 偏好开关', () => {
  it('落子提示开关：切换后持久化到 localStorage（联网默认关）', async () => {
    mockGetRoomState.mockResolvedValue({ state: waitingState() });
    renderRoom();
    await screen.findByText('等待对方加入…');
    const toggle = screen.getByRole('switch', { name: '显示落子提示' });
    expect(toggle).toHaveAttribute('aria-checked', 'false'); // 联网默认关
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('othello_show_hints_online')).toBe('true');
    await userEvent.click(toggle);
    expect(localStorage.getItem('othello_show_hints_online')).toBe('false');
  });

  it('音效开关：切换后状态翻转', async () => {
    mockGetRoomState.mockResolvedValue({ state: waitingState() });
    renderRoom();
    await screen.findByText('等待对方加入…');
    const toggle = screen.getByRole('switch', { name: '音效开关' });
    const initial = toggle.getAttribute('aria-checked');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe(initial === 'true' ? 'false' : 'true');
  });
});

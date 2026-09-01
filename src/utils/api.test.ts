import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ApiError,
  createRoom,
  getRoomState,
  isStorageError,
  postMove,
} from './api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api 请求封装', () => {
  it('createRoom 发送 POST /api/room/create 并携带 playerId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ roomId: 'ABC123', state: {} }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await createRoom('p-1');
    expect(res.roomId).toBe('ABC123');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/room/create',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ playerId: 'p-1' });
  });

  it('postMove 携带 expectedUpdatedAt 回合版本号', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ state: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await postMove('ABC123', 'p-1', 2, 3, 12345);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/room/ABC123/move',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ playerId: 'p-1', row: 2, col: 3, expectedUpdatedAt: 12345 });
  });

  it('getRoomState 使用 GET 请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ state: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await getRoomState('ABC123');
    expect(fetchMock).toHaveBeenCalledWith('/api/room/ABC123/state');
  });
});

describe('api 错误路径', () => {
  it('非 2xx 抛 ApiError 并携带状态码与错误消息', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'room not found' }, 404))
    );
    await expect(getRoomState('NOPE')).rejects.toMatchObject({
      status: 404,
      message: 'room not found',
    });
  });

  it('响应体为非法 JSON 时不抛错并返回空对象', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));
    await expect(getRoomState('ABC123')).resolves.toEqual({});
  });

  it('isStorageError 识别 503 存储未配置', () => {
    expect(isStorageError(new ApiError('storage not configured', 503))).toBe(true);
    expect(isStorageError(new ApiError('boom', 500))).toBe(false);
    expect(isStorageError(new Error('plain'))).toBe(false);
  });
});

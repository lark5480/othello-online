import type { GameState } from './gameLogic';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 与 edge-functions/lib/kv.ts 的 STORAGE_ERROR 保持一致：后端存储未配置 */
const STORAGE_ERROR = 'storage not configured';

/** 存储未配置时给用户的友好提示（可直接玩人机对战 / 本地双人开玩） */
export const STORAGE_HINT =
  '在线对战后端存储(KV)尚未配置,暂时无法联机对战。可直接玩「人机对战」,或本地 npm run dev 双人开玩。';

export function isStorageError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 503 || e.message === STORAGE_ERROR);
}

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
  }
  return data;
}

export async function createRoom(
  playerId: string
): Promise<{ roomId: string; state: GameState }> {
  const res = await fetch(`${BASE}/room/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  return parse(res);
}

export async function joinRoom(
  roomId: string,
  playerId: string
): Promise<{ state: GameState }> {
  const res = await fetch(`${BASE}/room/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, playerId }),
  });
  return parse(res);
}

export async function getRoomState(
  roomId: string
): Promise<{ state: GameState }> {
  const res = await fetch(`${BASE}/room/${roomId}/state`);
  return parse(res);
}

export async function postMove(
  roomId: string,
  playerId: string,
  row: number,
  col: number,
  expectedUpdatedAt?: number
): Promise<{ state: GameState }> {
  const res = await fetch(`${BASE}/room/${roomId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, row, col, expectedUpdatedAt }),
  });
  return parse(res);
}

export async function restartRoom(
  roomId: string,
  playerId: string
): Promise<{ state: GameState }> {
  const res = await fetch(`${BASE}/room/${roomId}/restart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
  return parse(res);
}

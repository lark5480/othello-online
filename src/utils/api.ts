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
  col: number
): Promise<{ state: GameState }> {
  const res = await fetch(`${BASE}/room/${roomId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, row, col }),
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

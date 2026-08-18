import type { EdgeContext, KVNamespace } from '../types';
import type { GameState } from '../../src/utils/gameLogic';

export function getKV(context: EdgeContext): KVNamespace | null {
  return context.env.OTHELLO_KV ?? null;
}

export async function getState(
  kv: KVNamespace,
  roomId: string
): Promise<GameState | null> {
  const raw = await kv.get(roomId);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

export async function putState(kv: KVNamespace, state: GameState): Promise<void> {
  // KV 值必须是字符串
  await kv.put(state.roomId, JSON.stringify(state));
}

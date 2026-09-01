import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, putState, STORAGE_ERROR } from '../../../lib/kv';
import { joinState, toPublicState } from '../../../../src/utils/gameLogic';
import { normalizeRoomId } from '../../../../src/utils/roomCode';

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error(STORAGE_ERROR, 503);

  const rawRoomId = String(context.params.roomId ?? '');
  const roomId = normalizeRoomId(rawRoomId);
  if (!roomId) return error('invalid roomId', 400);

  let body: { playerId?: unknown };
  try {
    body = await context.request.json();
  } catch {
    return error('invalid body', 400);
  }

  const playerId = body?.playerId;
  if (typeof playerId !== 'string' || !playerId) {
    return error('playerId required', 400);
  }

  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  // 白方已存在且不是当前玩家 → 房间已满
  if (state.players.white && state.players.white !== playerId) {
    return error('room full', 409);
  }

  // 白方空位 → 加入；已是该玩家 → 视为重连
  if (!state.players.white) {
    const updated = joinState(state, playerId);
    await putState(kv, updated);
    return json({ state: toPublicState(updated) });
  }
  return json({ state: toPublicState(state) });
}

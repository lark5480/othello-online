import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, putState, STORAGE_ERROR } from '../../../lib/kv';
import { restartState, toPublicState } from '../../../../src/utils/gameLogic';
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

  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  // 仅对局结束后可再来一局
  if (state.status !== 'finished') {
    return error('game not finished', 409);
  }

  // 仅房间内玩家可发起；缺 playerId 直接拒绝，避免被任意请求重置对局
  const playerId = body?.playerId;
  if (typeof playerId !== 'string' || !playerId) {
    return error('playerId required', 400);
  }
  if (state.players.black !== playerId && state.players.white !== playerId) {
    return error('not a player', 403);
  }

  const updated = restartState(state);
  await putState(kv, updated);
  return json({ state: toPublicState(updated) });
}

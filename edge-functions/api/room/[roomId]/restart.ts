import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, putState } from '../../../lib/kv';
import { restartState } from '../../../../src/utils/gameLogic';

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error('KV not configured', 500);

  const roomId = context.params.roomId;

  let body: { playerId?: string };
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

  // 仅房间内玩家可发起
  const playerId = body?.playerId;
  if (
    playerId &&
    state.players.black !== playerId &&
    state.players.white !== playerId
  ) {
    return error('not a player', 403);
  }

  const updated = restartState(state);
  await putState(kv, updated);
  return json({ state: updated });
}

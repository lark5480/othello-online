import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, STORAGE_ERROR } from '../../../lib/kv';
import { toPublicState } from '../../../../src/utils/gameLogic';
import { normalizeRoomId } from '../../../../src/utils/roomCode';

export async function onRequestGet(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error(STORAGE_ERROR, 503);

  const rawRoomId = String(context.params.roomId ?? '');
  const roomId = normalizeRoomId(rawRoomId);
  if (!roomId) return error('invalid roomId', 400);

  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  return json({ state: toPublicState(state) });
}

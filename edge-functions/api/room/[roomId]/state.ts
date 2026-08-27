import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, STORAGE_ERROR } from '../../../lib/kv';

export async function onRequestGet(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error(STORAGE_ERROR, 503);

  const roomId = context.params.roomId;
  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  return json({ state });
}

import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState } from '../../../lib/kv';

export async function onRequestGet(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error('KV not configured', 500);

  const roomId = context.params.roomId;
  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  return json({ state });
}

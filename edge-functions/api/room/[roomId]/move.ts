import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, putState } from '../../../lib/kv';
import { applyMoveToState } from '../../../../src/utils/gameLogic';

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error('KV not configured', 500);

  const roomId = context.params.roomId;

  let body: { playerId?: string; row?: number; col?: number };
  try {
    body = await context.request.json();
  } catch {
    return error('invalid body', 400);
  }

  const { playerId, row, col } = body;
  if (
    typeof playerId !== 'string' ||
    typeof row !== 'number' ||
    typeof col !== 'number'
  ) {
    return error('playerId, row, col required', 400);
  }

  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  const res = applyMoveToState(state, playerId, row, col);
  if (!res.ok) return error(res.error, res.status);

  await putState(kv, res.state);
  return json({ state: res.state });
}

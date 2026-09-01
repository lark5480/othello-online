import type { EdgeContext } from '../../types';
import { error, json } from '../../lib/http';
import { getKV, putState, STORAGE_ERROR } from '../../lib/kv';
import { createInitialState, toPublicState } from '../../../src/utils/gameLogic';
import { randomRoomCodeSuffix } from '../../../src/utils/roomCode';

/** 生成房间码并在 KV 中校验冲突后重试 */
async function generateRoomId(
  kv: import('../../types').KVNamespace
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = randomRoomCodeSuffix(6);
    const existing = await kv.get(id);
    if (!existing) return id;
  }
  // 极端兜底：用时间戳后缀保证唯一（同为 6 位合法码）
  return 'R' + Date.now().toString(36).slice(-5).toUpperCase();
}

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error(STORAGE_ERROR, 503);

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

  const roomId = await generateRoomId(kv);
  const state = createInitialState(roomId, playerId);
  await putState(kv, state);

  return json({ roomId, state: toPublicState(state) }, 201);
}

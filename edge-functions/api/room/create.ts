import type { EdgeContext } from '../../types';
import { error, json } from '../../lib/http';
import { getKV, putState } from '../../lib/kv';
import { createInitialState } from '../../../src/utils/gameLogic';

// 排除易混字符 0/O/1/I 的 6 位房间码字符集
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(len: number): string {
  let id = '';
  for (let i = 0; i < len; i++) {
    id += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return id;
}

/** 生成房间码并在 KV 中校验冲突后重试 */
async function generateRoomId(
  kv: import('../../types').KVNamespace
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = randomCode(6);
    const existing = await kv.get(id);
    if (!existing) return id;
  }
  // 极端兜底：用时间戳后缀保证唯一
  return 'R' + Date.now().toString(36).slice(-5).toUpperCase();
}

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error('KV not configured', 500);

  let body: { playerId?: string };
  try {
    body = await context.request.json();
  } catch {
    return error('invalid body', 400);
  }

  const playerId = body?.playerId;
  if (!playerId) return error('playerId required', 400);

  const roomId = await generateRoomId(kv);
  const state = createInitialState(roomId, playerId);
  await putState(kv, state);

  return json({ roomId, state }, 201);
}

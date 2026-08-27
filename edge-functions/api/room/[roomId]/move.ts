import type { EdgeContext } from '../../../types';
import { error, json } from '../../../lib/http';
import { getKV, getState, putState, STORAGE_ERROR } from '../../../lib/kv';
import { applyMoveToState } from '../../../../src/utils/gameLogic';

export async function onRequestPost(context: EdgeContext) {
  const kv = getKV(context);
  if (!kv) return error(STORAGE_ERROR, 503);

  const roomId = context.params.roomId;

  let body: { playerId?: string; row?: number; col?: number; expectedUpdatedAt?: number };
  try {
    body = await context.request.json();
  } catch {
    return error('invalid body', 400);
  }

  const { playerId, row, col, expectedUpdatedAt } = body;
  if (
    typeof playerId !== 'string' ||
    typeof row !== 'number' ||
    typeof col !== 'number'
  ) {
    return error('playerId, row, col required', 400);
  }

  const state = await getState(kv, roomId);
  if (!state) return error('room not found', 404);

  // 乐观并发控制：客户端基于其看到的旧状态落子，若服务端状态已变化
  // （对手已落子 / 重复提交），拒绝本次写入并让客户端拉取最新后重试，
  // 避免一步合法落子在 read-modify-write 中被静默覆盖。
  if (typeof expectedUpdatedAt === 'number' && state.updatedAt !== expectedUpdatedAt) {
    return error('state conflict', 409);
  }

  const res = applyMoveToState(state, playerId, row, col);
  if (!res.ok) return error(res.error, res.status);

  await putState(kv, res.state);
  return json({ state: res.state });
}

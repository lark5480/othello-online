import type { EdgeContext, KVNamespace } from '../types';
import type { GameState } from '../../src/utils/gameLogic';

/**
 * 后端存储未配置时的统一错误文案。前端据此识别并给出友好提示，
 * 提示用户可改玩「人机对战」或本地双人开玩，而非抛出生硬报错。
 * 前后端文案需保持一致。
 */
export const STORAGE_ERROR = 'storage not configured';

/**
 * 房间状态在 KV 中的存活时间（秒）。每次写入都会刷新该 TTL，
 * 因此进行中的对局不会过期；对局结束后仍保留一段时间以便「再来一局」/复盘，
 * 之后由平台自动回收，避免废弃房间无限占用存储。
 */
export const ROOM_TTL_SECONDS = 60 * 60 * 24; // 24h

/**
 * 取共享状态后端。当前仅支持 EdgeOne KV 绑定（OTHELLO_KV）。
 * 若未配置（如 KV 存储申请未通过），返回 null，调用方据此向前端返回
 * STORAGE_ERROR，由界面提示用户，而不要让对局 silently 失败。
 * 自托管时可在此替换为其他可达的存储实现。
 */
export function getKV(context: EdgeContext): KVNamespace | null {
  return context.env.OTHELLO_KV ?? null;
}

export async function getState(
  kv: KVNamespace,
  roomId: string
): Promise<GameState | null> {
  const raw = await kv.get(roomId);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

export async function putState(
  kv: KVNamespace,
  state: GameState,
  opts?: { expirationTtl?: number }
): Promise<void> {
  // KV 值必须是字符串；expirationTtl 为平台选项（EdgeOne KV 兼容 Cloudflare KV 命名）
  await kv.put(state.roomId, JSON.stringify(state), {
    expirationTtl: opts?.expirationTtl ?? ROOM_TTL_SECONDS,
  });
}

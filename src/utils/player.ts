/**
 * 玩家身份：不注册不登录，用 localStorage 持久化一个随机 playerId 用于断线重连。
 * playerId 同时是联机落子的唯一凭证（服务端按它校验回合归属），
 * 因此用 crypto 随机生成足够熵（16 字符 base36 ≈ 82 bit），避免被猜中冒充。
 */

import type { Player } from './gameLogic';

const STORAGE_KEY = 'othello_player_id';
/** 房间颜色记忆：othello_room_color_<roomId> -> 'black' | 'white'。
 * 服务端 state 响应不再回传 playerId（防冒充），客户端据此识别自己是哪一方。 */
const ROOM_COLOR_PREFIX = 'othello_room_color_';

function randomId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = '';
  for (const b of bytes) id += b.toString(36).padStart(2, '0');
  return id.slice(0, 16);
}

export function getPlayerId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = 'p_' + randomId();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/** 记住自己在某房间执的颜色（create -> black，join -> white） */
export function rememberRoomColor(roomId: string, color: Player): void {
  localStorage.setItem(ROOM_COLOR_PREFIX + roomId, color);
}

/** 读取自己在某房间执的颜色；未参与过该房间（观战者）返回 null */
export function recallRoomColor(roomId: string): Player | null {
  const v = localStorage.getItem(ROOM_COLOR_PREFIX + roomId);
  return v === 'black' || v === 'white' ? v : null;
}

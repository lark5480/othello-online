/** 玩家身份：不注册不登录，用 localStorage 持久化一个随机 playerId 用于断线重连 */

const STORAGE_KEY = 'othello_player_id';

export function getPlayerId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

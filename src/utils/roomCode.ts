/**
 * 房间码工具 —— Edge Functions 与本地 mock 共用，保证两端行为一致。
 * 零依赖纯 TS/JS，可在 V8 / 浏览器 / Node 下直接运行。
 */

/** 排除易混字符 0/O/1/I 的 6 位房间码字符集，码空间 32^6 ≈ 10.9 亿 */
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function isValidRoomId(roomId: string): boolean {
  return (
    roomId.length === ROOM_CODE_LENGTH &&
    roomId.split('').every((ch) => CODE_CHARS.includes(ch))
  );
}

/** URL / 输入框里的房间码统一转大写后再校验（小写码等价于大写码） */
export function normalizeRoomId(raw: string): string | null {
  const id = raw.trim().toUpperCase();
  return isValidRoomId(id) ? id : null;
}

/** 随机填充 len 个房间码字符；优先 WebCrypto，无 crypto 时退回 Math.random */
export function randomRoomCodeSuffix(len: number): string {
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = '';
  for (let i = 0; i < len; i++) id += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return id;
}

import { describe, it, expect } from 'vitest';
import {
  CODE_CHARS,
  isValidRoomId,
  normalizeRoomId,
  randomRoomCodeSuffix,
} from './roomCode';

describe('roomCode', () => {
  it('isValidRoomId：6 位合法字符集', () => {
    expect(isValidRoomId('ABC234')).toBe(true);
    expect(isValidRoomId('A')).toBe(false);
    expect(isValidRoomId('ABC23')).toBe(false); // 5 位
    expect(isValidRoomId('ABC2345')).toBe(false); // 7 位
    expect(isValidRoomId('abc234')).toBe(false); // 小写需先归一
    expect(isValidRoomId('ABC012')).toBe(false); // 0/1 不在字符集
    expect(isValidRoomId('ABO234')).toBe(false); // O/I 排除
    expect(isValidRoomId('')).toBe(false);
  });

  it('normalizeRoomId：trim + 大写归一，非法返回 null', () => {
    expect(normalizeRoomId(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomId('ABC234')).toBe('ABC234');
    expect(normalizeRoomId('ABC23')).toBeNull();
    expect(normalizeRoomId('ABC@23')).toBeNull();
  });

  it('randomRoomCodeSuffix：长度与字符集正确，多次生成不恒同', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const c = randomRoomCodeSuffix(6);
      expect(c).toHaveLength(6);
      for (const ch of c) expect(CODE_CHARS.includes(ch)).toBe(true);
      codes.add(c);
    }
    expect(codes.size).toBeGreaterThan(1); // 非确定性
  });
});

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// 部分测试文件（如 edge-functions/router.test.ts）用 // @vitest-environment node 强制 node 环境，
// 此处需对「无 window / localStorage」的环境做保护性降级。
if (typeof window !== 'undefined') {
  // Cell 的翻转动画依赖 prefers-reduced-motion；jsdom 未实现 matchMedia，需补齐
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* node 环境下无 localStorage */
  }
  vi.restoreAllMocks();
});

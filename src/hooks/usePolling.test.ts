import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePolling } from './usePolling';

afterEach(() => {
  vi.useRealTimers();
});

describe('usePolling', () => {
  it('enabled=false 时不调用', () => {
    const fn = vi.fn().mockResolvedValue('v');
    renderHook(() => usePolling(fn, 1000, false));
    expect(fn).not.toHaveBeenCalled();
  });

  it('enabled=true 立即调用一次并写入 data', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() => usePolling(fn, 1000, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('v1');
    expect(result.current.error).toBeNull();
  });

  it('按 interval 周期重复调用', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() => usePolling(fn, 1000, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    fn.mockResolvedValueOnce('v2');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('v2');
  });

  it('调用失败时设置 error，后续成功自动清除', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    const { result } = renderHook(() => usePolling(fn, 1000, true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error?.message).toBe('boom');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('ok');
  });

  it('enabled 变为 false 后停止轮询', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('v');
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => usePolling(fn, 1000, enabled),
      { initialProps: { enabled: true } }
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('refresh 可手动触发一次且结果写入 data', async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockResolvedValue('v1');
    const { result } = renderHook(() => usePolling(fn, 1000, false));
    fn.mockResolvedValueOnce('v2');
    await act(async () => {
      await result.current.refresh();
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.data).toBe('v2');
  });
});

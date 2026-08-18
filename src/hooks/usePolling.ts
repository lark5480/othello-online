import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingResult<T> {
  data: T | null;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * 轮询 Hook：enabled 为 true 时按 intervalMs 周期调用 fn。
 * 自己回合（无需拉取对方）时传入 enabled=false 即可停止轮询。
 */
export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  enabled: boolean
): PollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const loop = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer = setTimeout(loop, intervalMs);
    };
    loop();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, intervalMs, refresh]);

  return { data, error, refresh };
}

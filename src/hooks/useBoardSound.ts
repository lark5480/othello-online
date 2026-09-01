import { useEffect, useRef } from 'react';
import type { GameState } from '../utils/gameLogic';
import { playPlace, playWin, playLose, playDraw } from '../utils/sound';

export type SoundOutcome = 'win' | 'loss' | 'draw' | null;

/**
 * 棋盘音效钩子：监听对局状态变化自动播音，无需在各落子点手动触发。
 *
 * 规则：
 * - 进入 finished：按 resolveOutcome 视角播放 胜/负/和（旁观者传 null → 中性「和」音）。
 * - 进行中对 moveCount 净增：播放落子音（轮询导致的同内容状态更新不会重复触发，
 *   因为 moveCount 未变；重开（moveCount 归零）不播音）。
 * - 首次挂载不播音。
 */
export function useBoardSound(opts: {
  state: GameState | null;
  resolveOutcome?: (state: GameState) => SoundOutcome;
}): void {
  const { state } = opts;
  // resolveOutcome 用 ref 持有，避免其引用变化导致每次渲染都跑 effect
  const cbRef = useRef(opts.resolveOutcome);
  cbRef.current = opts.resolveOutcome;

  const prevCountRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state) {
      prevCountRef.current = null;
      prevStatusRef.current = null;
      return;
    }

    const prevCount = prevCountRef.current;
    const prevStatus = prevStatusRef.current;

    // 首次挂载：仅记录基线，不发声
    if (prevCount === null) {
      prevCountRef.current = state.moveCount;
      prevStatusRef.current = state.status;
      return;
    }

    const finishedNow = prevStatus !== 'finished' && state.status === 'finished';
    if (finishedNow) {
      const o = cbRef.current ? cbRef.current(state) : 'draw';
      if (o === 'win') playWin();
      else if (o === 'loss') playLose();
      else playDraw();
    } else if (state.moveCount > prevCount && state.status === 'playing') {
      playPlace();
    }

    prevCountRef.current = state.moveCount;
    prevStatusRef.current = state.status;
  }, [state]);
}

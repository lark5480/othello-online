import { useEffect, useRef, useState } from 'react';
import { BLACK, EMPTY, type Player, type Stone } from '../utils/gameLogic';

interface CellProps {
  value: Stone;
  isHint: boolean;
  isLast: boolean;
  interactive: boolean;
  ghost?: boolean;
  willFlip?: boolean;
  ghostColor?: Player | null;
  onClick: () => void;
}

export default function Cell({
  value,
  isHint,
  isLast,
  interactive,
  ghost = false,
  willFlip = false,
  ghostColor,
  onClick,
}: CellProps) {
  const prev = useRef<Stone>(value);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    // 仅「棋子被翻转」（旧色 → 新色）时播放翻转动画；
    // 新落子（空 → 有子）直接以正确颜色出现，不做翻转
    if (
      prev.current !== EMPTY &&
      prev.current !== value &&
      value !== EMPTY &&
      // 系统开启「减少动态效果」时动画被禁用，跳过翻转态，直接显示正确颜色
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setFlip(true);
    }
    prev.current = value;
  }, [value]);

  const hasStone = value !== EMPTY;
  const isBlack = value === BLACK;

  // 翻转动画期间：正面 = 翻转前旧色、背面 = 当前新色，0°→180° 恰好呈现旧色翻成新色；
  // 静态（未翻转）时：正面 = 当前颜色，保证任何时候最终显示都正确
  const currentFace = isBlack ? 'disc-black' : 'disc-white';
  const otherFace = isBlack ? 'disc-white' : 'disc-black';

  const stateClass = [
    'cell',
    interactive ? 'is-interactive' : '',
    isHint ? 'is-hint' : '',
    isLast ? 'is-last' : '',
    willFlip ? 'is-will-flip' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      aria-label={
        hasStone
          ? `棋子 ${value === BLACK ? '黑' : '白'}`
          : interactive // 合法格（无论视觉提示是否开启）都标注为可落子位置
            ? '可落子位置'
            : '空位'
      }
      className={stateClass}
    >
      {hasStone && (
        <span
          className={`disc-flip-container ${flip ? 'is-flipped' : ''}`}
          onAnimationEnd={(e) => {
            // 仅翻转动画结束时复位；过滤子元素冒泡的其他动画事件
            if (e.animationName === 'disc-flip-anim') setFlip(false);
          }}
        >
          <span
            className={`disc disc-face-front ${flip ? otherFace : currentFace}`}
          />
          <span
            className={`disc disc-face-back ${flip ? currentFace : otherFace}`}
            aria-hidden="true"
          />
        </span>
      )}
      {ghost && !hasStone && (
        <span className={`disc disc-ghost ${ghostColor === 'black' ? 'disc-black' : 'disc-white'}`} />
      )}
      {isHint && !hasStone && <span className="hint-pulse hint-dot" />}
      {isLast && <span className="last-move-triangle" />}
    </button>
  );
}

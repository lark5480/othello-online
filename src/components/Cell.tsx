import { useEffect, useRef, useState } from 'react';
import { BLACK, EMPTY, type Stone } from '../utils/gameLogic';

interface CellProps {
  value: Stone;
  isHint: boolean;
  isLast: boolean;
  interactive: boolean;
  onClick: () => void;
}

export default function Cell({ value, isHint, isLast, interactive, onClick }: CellProps) {
  const prev = useRef<Stone>(value);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (prev.current !== value && value !== EMPTY) {
      setFlip(true);
    }
    prev.current = value;
  }, [value]);

  const hasStone = value !== EMPTY;

  const stateClass = [
    'cell',
    interactive ? 'is-interactive' : '',
    isHint ? 'is-hint' : '',
    isLast ? 'is-last' : '',
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
          onAnimationEnd={() => setFlip(false)}
          className={`disc ${value === BLACK ? 'disc-black' : 'disc-white'} ${
            flip ? 'stone-flip' : ''
          }`}
        />
      )}
      {isHint && !hasStone && <span className="hint-pulse hint-dot" />}
    </button>
  );
}

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
    if (prev.current !== value && value !== EMPTY) {
      setFlip(true);
    }
    prev.current = value;
  }, [value]);

  const hasStone = value !== EMPTY;
  const isBlack = value === BLACK;

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
        <span className={`disc-flip-container ${flip ? 'is-flipped' : ''}`}>
          <span className={`disc disc-face-front ${isBlack ? 'disc-black' : 'disc-white'}`} />
          <span
            className={`disc disc-face-back ${isBlack ? 'disc-white' : 'disc-black'}`}
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

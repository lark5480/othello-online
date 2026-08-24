import type { GameState, Player } from '../utils/gameLogic';
import { countStones } from '../utils/gameLogic';
import { CopyIcon } from './icons';

interface GameInfoProps {
  roomId: string;
  state: GameState;
  myColor: Player | null;
  copied?: boolean;
  onCopyCode?: () => void;
  /** 人机模式：非我方回合且 AI 正在计算时显示「AI 思考中…」 */
  aiThinking?: boolean;
  /** 人机模式：标题区副文案（如「人机对战 · 困难」） */
  subtitle?: string;
}

export default function GameInfo({
  roomId,
  state,
  myColor,
  copied,
  onCopyCode,
  aiThinking = false,
  subtitle,
}: GameInfoProps) {
  const { black, white } = countStones(state.board);
  const blackRatio = black + white === 0 ? 0.5 : black / (black + white);
  const isMyTurn = myColor !== null && state.currentTurn === myColor;

  let statusText = '';
  if (state.status === 'waiting') {
    statusText = '等待对方加入…';
  } else if (state.status === 'playing') {
    if (myColor === null) statusText = '观战中';
    else if (isMyTurn) statusText = '轮到你落子';
    else if (aiThinking) statusText = 'AI 思考中…';
    else statusText = '等待对方落子…';
  }

  const blackActive = state.status === 'playing' && state.currentTurn === 'black';
  const whiteActive = state.status === 'playing' && state.currentTurn === 'white';

  return (
    <div className="card w-full p-5">
      <div className="flex items-center justify-between gap-3">
        {subtitle ? (
          <div className="text-sm font-medium text-muted">{subtitle}</div>
        ) : (
          <>
            <div className="text-sm text-muted">
              房间号
              <span className="text-strong ml-2 select-all font-mono text-lg font-semibold tracking-widest">
                {roomId}
              </span>
            </div>
            <button
              type="button"
              onClick={onCopyCode}
              className="btn-ghost-border flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm active:scale-95"
            >
              <CopyIcon size={16} />
              {copied ? '已复制' : '复制'}
            </button>
          </>
        )}
      </div>

      <div className="mt-5 flex items-center justify-center gap-8">
        <ScoreDisc kind="black" count={black} active={blackActive} />
        <ScoreDisc kind="white" count={white} active={whiteActive} />
      </div>

      <div className="score-bar-track" aria-hidden="true">
        <div
          className="score-bar-fill-black"
          style={{ width: `${Math.round(blackRatio * 100)}%` }}
        />
      </div>

      {statusText && (
        <div className="text-body mt-5 flex items-center justify-center gap-2 text-sm font-medium">
          {state.status === 'playing' && (
            <span
              className={`disc disc-mini ${
                state.currentTurn === 'black' ? 'disc-black' : 'disc-white'
              }`}
            />
          )}
          <span>{statusText}</span>
          {isMyTurn && (
            <span className="btn-solid rounded-full px-2 py-0.5 text-xs font-normal">
              你
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreDisc({
  kind,
  count,
  active,
}: {
  kind: 'black' | 'white';
  count: number;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 transition-opacity duration-200 ${
        active ? 'opacity-100' : 'opacity-55'
      }`}
    >
      <span className={`disc disc-mini ${kind === 'black' ? 'disc-black' : 'disc-white'}`} />
      <span className="text-strong text-2xl font-semibold tabular-nums">{count}</span>
    </div>
  );
}

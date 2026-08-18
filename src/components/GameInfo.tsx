import type { GameState, Player } from '../utils/gameLogic';
import { countStones } from '../utils/gameLogic';
import { CopyIcon } from './icons';

interface GameInfoProps {
  roomId: string;
  state: GameState;
  myColor: Player | null;
  copied: boolean;
  onCopyCode: () => void;
}

export default function GameInfo({
  roomId,
  state,
  myColor,
  copied,
  onCopyCode,
}: GameInfoProps) {
  const { black, white } = countStones(state.board);
  const isMyTurn = myColor !== null && state.currentTurn === myColor;

  let statusText = '';
  if (state.status === 'waiting') {
    statusText = '等待对方加入…';
  } else if (state.status === 'playing') {
    if (myColor === null) statusText = '观战中';
    else if (isMyTurn) statusText = '轮到你落子';
    else statusText = '等待对方落子…';
  }

  const blackActive = state.status === 'playing' && state.currentTurn === 'black';
  const whiteActive = state.status === 'playing' && state.currentTurn === 'white';

  return (
    <div className="card w-full p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-neutral-500">
          房间号
          <span className="ml-2 select-all font-mono text-lg font-semibold tracking-widest text-neutral-900">
            {roomId}
          </span>
        </div>
        <button
          type="button"
          onClick={onCopyCode}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 active:scale-95"
        >
          <CopyIcon size={16} />
          {copied ? '已复制' : '复制'}
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-8">
        <ScoreDisc kind="black" count={black} active={blackActive} />
        <ScoreDisc kind="white" count={white} active={whiteActive} />
      </div>

      {statusText && (
        <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-neutral-600">
          {state.status === 'playing' && (
            <span
              className={`disc disc-mini ${
                state.currentTurn === 'black' ? 'disc-black' : 'disc-white'
              }`}
            />
          )}
          <span>{statusText}</span>
          {isMyTurn && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-normal text-white">
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
      <span className="text-2xl font-semibold tabular-nums text-neutral-900">{count}</span>
    </div>
  );
}

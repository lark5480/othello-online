import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPlayerId } from '../utils/player';
import { getShowHints, setShowHints } from '../utils/hints';
import { ApiError, getRoomState, postMove, restartRoom } from '../utils/api';
import { countStones, getValidMoves, type GameState, type Player } from '../utils/gameLogic';
import { usePolling } from '../hooks/usePolling';
import Board from '../components/Board';
import GameInfo from '../components/GameInfo';
import { HomeIcon, RestartIcon } from '../components/icons';

export default function Room() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const playerId = useMemo(() => getPlayerId(), []);

  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [showHints, setShowHintsState] = useState<boolean>(() => getShowHints('online'));
  const lastAt = useRef(0);

  // 落子提示开关：切换即持久化到 localStorage（联网模式默认关，靠棋力；休闲可开启）
  const toggleShowHints = () => {
    setShowHintsState((prev) => {
      const next = !prev;
      setShowHints(next);
      return next;
    });
  };

  // 应用远端状态，并通过 updatedAt 过滤 KV 最终一致性带来的陈旧数据
  const applyState = (s: GameState) => {
    if (s.updatedAt >= lastAt.current) {
      lastAt.current = s.updatedAt;
      setState(s);
    }
  };

  // 首次加载
  useEffect(() => {
    let cancelled = false;
    getRoomState(roomId)
      .then((d) => {
        if (!cancelled) applyState(d.state);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setError('加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const myColor: Player | null = state
    ? state.players.black === playerId
      ? 'black'
      : state.players.white === playerId
        ? 'white'
        : null
    : null;
  const myTurn =
    state?.status === 'playing' && myColor !== null && state.currentTurn === myColor;

  let pollEnabled = false;
  let pollInterval = 3000;
  if (state && !notFound) {
    if (state.status === 'waiting') {
      pollEnabled = true;
      pollInterval = 3000;
    } else if (state.status === 'playing') {
      pollEnabled = !myTurn; // 自己回合不轮询
      pollInterval = 2000;
    }
  }

  const { data: polledState, error: pollError, refresh } = usePolling(
    () => getRoomState(roomId).then((d) => d.state),
    pollInterval,
    pollEnabled
  );

  useEffect(() => {
    if (polledState) applyState(polledState);
  }, [polledState]);

  useEffect(() => {
    if (!pollError) return;
    if (pollError instanceof ApiError && pollError.status === 404) setNotFound(true);
    else setError('与服务器同步失败');
  }, [pollError]);

  const validMoves = useMemo(() => {
    if (!state || !myTurn) return [];
    return getValidMoves(state.board, state.currentTurn);
  }, [state, myTurn]);

  const handleMove = async (row: number, col: number) => {
    if (!state || busy || !myTurn) return;
    setBusy(true);
    setError(null);
    try {
      const { state: ns } = await postMove(roomId, playerId, row, col);
      applyState(ns);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.status === 400)) {
        // 并发/校验失败：重新拉取最新状态
        try {
          const d = await getRoomState(roomId);
          applyState(d.state);
        } catch {
          /* 忽略 */
        }
      } else {
        setError('落子失败，请重试');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async () => {
    if (!state || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { state: ns } = await restartRoom(roomId, playerId);
      applyState(ns);
    } catch {
      setError('重新开始失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  return (
    <main className="page-bg px-4 py-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-800"
          >
            <HomeIcon size={18} />
            返回首页
          </button>
          <span className="text-sm font-medium tracking-wide text-neutral-400">
            黑白棋 · 在线对战
          </span>
        </div>

        {notFound ? (
          <div className="card p-10 text-center">
            <p className="text-neutral-700">房间不存在或已结束</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-5 rounded-xl bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              返回首页
            </button>
          </div>
        ) : !state ? (
          <div className="card p-10 text-center text-neutral-500">加载中…</div>
        ) : (
          <>
            <GameInfo
              roomId={roomId}
              state={state}
              myColor={myColor}
              copied={copied}
              onCopyCode={handleCopy}
            />

            <div className="card flex items-center justify-between gap-4 p-4">
              <div>
                <div className="text-sm font-medium text-neutral-800">显示落子提示</div>
                <div className="mt-0.5 text-xs text-neutral-500">
                  高亮可落子位置（休闲友好；竞技默认关闭，靠棋力）
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showHints}
                aria-label="显示落子提示"
                onClick={toggleShowHints}
                className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
                  showHints ? 'bg-neutral-900' : 'bg-neutral-300'
                }`}
              >
                <span
                  className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    showHints ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="flex justify-center">
              <Board
                board={state.board}
                validMoves={validMoves}
                lastMove={state.lastMove}
                interactive={!!myTurn}
                showHints={showHints}
                onMove={handleMove}
              />
            </div>

            {error && <p className="text-center text-sm text-red-600">{error}</p>}

            {state.status === 'finished' && (
              <EndModal
                state={state}
                myColor={myColor}
                busy={busy}
                onRestart={handleRestart}
                onHome={() => navigate('/')}
                onRefresh={refresh}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

interface EndModalProps {
  state: GameState;
  myColor: Player | null;
  busy: boolean;
  onRestart: () => void;
  onHome: () => void;
  onRefresh: () => void;
}

function EndModal({ state, myColor, busy, onRestart, onHome, onRefresh }: EndModalProps) {
  const { black, white } = countStones(state.board);

  let title = '';
  if (state.winner === 'draw') title = '平局';
  else if (myColor === null) title = state.winner === 'black' ? '黑棋获胜' : '白棋获胜';
  else if (state.winner === myColor) title = '你赢了！';
  else title = '你输了';

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-xs p-6 text-center">
        <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <span className="disc disc-mini disc-black" />
            <span className="text-xl font-semibold tabular-nums text-neutral-900">{black}</span>
          </div>
          <span className="text-neutral-400">:</span>
          <div className="flex items-center gap-2">
            <span className="disc disc-mini disc-white" />
            <span className="text-xl font-semibold tabular-nums text-neutral-900">{white}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
          >
            <RestartIcon size={18} />
            再来一局
          </button>
          <button
            type="button"
            onClick={onHome}
            className="rounded-xl border border-neutral-200 py-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            返回首页
          </button>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="mt-3 text-xs text-neutral-400 hover:text-neutral-600"
        >
          刷新状态
        </button>
      </div>
    </div>
  );
}

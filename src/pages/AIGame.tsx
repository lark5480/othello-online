import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chooseAIMove, createAIGameState, type Difficulty } from '../utils/ai';
import { getShowHints, setShowHints } from '../utils/hints';
import {
  applyMoveToState,
  countStones,
  getValidMoves,
  opponentOf,
  type Move,
  type GameState,
  type Player,
} from '../utils/gameLogic';
import Board from '../components/Board';
import GameInfo from '../components/GameInfo';
import { HomeIcon, RestartIcon, SoundOnIcon, SoundOffIcon } from '../components/icons';
import { getSoundEnabled, toggleSound } from '../utils/sound';
import { useBoardSound } from '../hooks/useBoardSound';
import { getStats, recordResult, type Outcome, type Stats } from '../utils/stats';
import MoveHistory from '../components/MoveHistory';
import StatsPanel from '../components/StatsPanel';

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
  master: '大师',
};

const DIFFICULTY_DESC: Record<Difficulty, string> = {
  easy: '随机落子，适合热身',
  medium: '2 层预判，会抢角',
  hard: '4 层 Minimax + 剪枝，残局精确',
  master: '6 层迭代加深搜索，残局精确到底',
};

export default function AIGame() {
  const navigate = useNavigate();

  // 设置阶段
  const [started, setStarted] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<Player>('black');

  // 对局阶段
  const [state, setState] = useState<GameState | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showHints, setShowHintsState] = useState<boolean>(() => getShowHints('ai'));

  // 音效开关（全局偏好，持久化于 localStorage）
  const [soundOn, setSoundOn] = useState<boolean>(() => getSoundEnabled());
  // 当前难度的本地战绩（终局后刷新）
  const [stats, setStats] = useState<Stats>(() => getStats(difficulty));
  // 防止终局音效/战绩被重复记录（重开时复位）
  const recordedRef = useRef(false);

  const thinkingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);

  // 初始化 / 销毁 Worker（构造失败则降级到主线程计算，见下方 AI 回合）
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('../workers/ai.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      worker = null; // 极端环境（无 Worker 支持）：workerRef 保持 null，AI 回合改用主线程
    }
    workerRef.current = worker;
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  const myColor: Player = playerColor;
  const aiColor: Player = opponentOf(playerColor);

  const myTurn =
    !!state && state.status === 'playing' && state.currentTurn === myColor && !thinking;

  // 棋盘音效：落子自动发声，终局按视角播放胜/负/和
  useBoardSound({
    state,
    resolveOutcome: (s) => (s.winner === myColor ? 'win' : s.winner === null ? 'draw' : 'loss'),
  });

  // 落子提示开关（AI 模式默认开启，按设备+模式持久化）
  const toggleShowHints = () => {
    setShowHintsState((prev) => {
      const next = !prev;
      setShowHints('ai', next);
      return next;
    });
  };

  // 音效开关：切换并持久化全局偏好
  const toggleSoundOn = () => {
    setSoundOn(toggleSound());
  };

  // 开始 / 重开：用当前设置重建本地对局状态
  const startGame = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    thinkingRef.current = false;
    setThinking(false);
    recordedRef.current = false;
    setStats(getStats(difficulty)); // 刷新当前难度的战绩展示
    setState(createAIGameState(playerColor, difficulty));
    setStarted(true);
  };

  // AI 回合：状态切到 AI 且对局进行中时，延迟一段时间后落子（含连续跳过情形）
  useEffect(() => {
    if (!state) return;
    if (state.status !== 'playing') return;
    if (state.currentTurn !== aiColor) return;
    if (thinkingRef.current) return;

    const worker = workerRef.current;
    thinkingRef.current = true;
    setThinking(true);
    // 模拟思考节奏，体验更自然；计算本身是同步的，延迟后再执行以避免卡顿观感
    const delay = 450 + Math.random() * 350;
    const currentRequestId = ++requestIdRef.current;

    timerRef.current = setTimeout(() => {
      if (state.status !== 'playing' || state.currentTurn !== aiColor) return;

      const apply = (move: Move | null) => {
        // 只认最新一次请求的响应：对局被重开/重设后，旧计算结果直接丢弃
        if (currentRequestId !== requestIdRef.current || !move) return;
        setState((prev) => {
          if (!prev || prev.status !== 'playing' || prev.currentTurn !== aiColor) return prev;
          const res = applyMoveToState(prev, prev.players[aiColor]!, move.row, move.col);
          return res.ok ? res.state : prev;
        });
        thinkingRef.current = false;
        setThinking(false);
      };

      if (worker) {
        const handler = (e: MessageEvent<{ id: number; move: Move | null }>) => apply(e.data.move);
        worker.addEventListener('message', handler, { once: true });
        worker.postMessage({
          id: currentRequestId,
          board: state.board,
          aiPlayer: aiColor,
          difficulty,
        });
      } else {
        // 主线程兜底：Worker 不可用时仍用同一引擎落子，避免 AI 卡死
        apply(chooseAIMove(state.board, aiColor, difficulty));
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      thinkingRef.current = false;
      setThinking(false);
    };
  }, [state, aiColor, difficulty]);

  const validMoves = useMemo(() => {
    if (!state || !myTurn) return [];
    return getValidMoves(state.board, state.currentTurn);
  }, [state, myTurn]);

  const handleMove = (row: number, col: number) => {
    if (!state || thinking || state.currentTurn !== myColor || state.status !== 'playing') return;
    // 复用在线模式同一套状态转移 applyMoveToState，保证翻转/跳过/胜负规则完全一致
    const res = applyMoveToState(state, state.players[myColor]!, row, col);
    if (res.ok) setState(res.state);
  };

  // 终局记录战绩（仅一次），并刷新战绩面板
  useEffect(() => {
    if (state?.status === 'finished' && !recordedRef.current) {
      recordedRef.current = true;
      const { black, white } = countStones(state.board);
      const outcome: Outcome =
        state.winner === myColor ? 'win' : state.winner === null ? 'draw' : 'loss';
      setStats(recordResult(difficulty, outcome, Math.abs(black - white)));
    } else if (state?.status !== 'finished') {
      recordedRef.current = false;
    }
  }, [state, difficulty, myColor]);

  if (!started || !state) {
    return (
      <main className="page-bg flex min-h-full items-center justify-center px-4 py-10">
        <div className="card w-full max-w-sm p-8">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-strong text-2xl font-semibold tracking-tight">人机对战</h1>
            <p className="text-muted mt-1 text-sm">选择一个难度，挑战 AI 对手</p>
          </div>

          <Section title="难度">
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                    difficulty === d
                      ? 'btn-solid'
                      : 'btn-ghost-border'
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
            <p className="text-muted mt-2 text-xs">{DIFFICULTY_DESC[difficulty]}</p>
          </Section>

          <Section title="执子">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlayerColor('black')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                  playerColor === 'black'
                    ? 'btn-solid'
                    : 'btn-ghost-border'
                }`}
              >
                <span className="disc disc-mini disc-black" />
                执黑 · 先手
              </button>
              <button
                type="button"
                onClick={() => setPlayerColor('white')}
                className={`flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                  playerColor === 'white'
                    ? 'btn-solid'
                    : 'btn-ghost-border'
                }`}
              >
                <span className="disc disc-mini disc-white" />
                执白 · 后手
              </button>
            </div>
          </Section>

          <div className="mt-6">
            <StatsPanel difficulty={difficulty} stats={stats} />
          </div>

          <button
            type="button"
            onClick={startGame}
            className="btn-solid mt-8 w-full rounded-xl py-3 text-sm font-medium"
          >
            开始对局
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-ghost-border mt-3 w-full rounded-xl py-3 text-sm font-medium"
          >
            返回首页
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-bg px-4 py-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-body"
          >
            <HomeIcon size={18} />
            返回首页
          </button>
          <span className="text-sm font-medium tracking-wide text-muted">
            黑白棋 · 人机对战
          </span>
        </div>

        <GameInfo
          roomId={state.roomId}
          state={state}
          myColor={myColor}
          aiThinking={thinking}
          subtitle={`人机对战 · ${DIFFICULTY_LABELS[difficulty]} · 你执${myColor === 'black' ? '黑' : '白'}`}
        />

        <div className="card flex items-center justify-between gap-4 p-4">
          <div>
            <div className="text-strong text-sm font-medium">显示落子提示</div>
            <div className="text-muted mt-0.5 text-xs">
              高亮可落子位置（练习模式默认开启，辅助学习）
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showHints}
            aria-label="显示落子提示"
            onClick={toggleShowHints}
            className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
              showHints ? 'toggle-on' : 'toggle-off'
            }`}
          >
            <span
              className={`toggle-knob h-5 w-5 rounded-full shadow transition-transform ${
                showHints ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="card flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-2">
            <span className={soundOn ? 'text-strong' : 'text-muted'}>
              {soundOn ? <SoundOnIcon size={18} /> : <SoundOffIcon size={18} />}
            </span>
            <div>
              <div className="text-strong text-sm font-medium">音效</div>
              <div className="text-muted mt-0.5 text-xs">
                落子与胜负提示音（Web Audio，无需音频文件）
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soundOn}
            aria-label="音效开关"
            onClick={toggleSoundOn}
            className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${
              soundOn ? 'toggle-on' : 'toggle-off'
            }`}
          >
            <span
              className={`toggle-knob h-5 w-5 rounded-full shadow transition-transform ${
                soundOn ? 'translate-x-5' : 'translate-x-0.5'
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
            currentTurn={state.status === 'playing' ? state.currentTurn : null}
            onMove={handleMove}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={startGame}
            className="btn-solid flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
          >
            <RestartIcon size={18} />
            新对局
          </button>
          <button
            type="button"
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              thinkingRef.current = false;
              setThinking(false);
              setStarted(false);
              setState(null);
            }}
            className="btn-ghost-border flex-1 rounded-xl py-3 text-sm font-medium"
          >
            重新设置
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StatsPanel difficulty={difficulty} stats={stats} />
          <MoveHistory state={state} />
        </div>

        {state.status === 'finished' && (
          <EndModal
            state={state}
            myColor={myColor}
            onRestart={startGame}
            onHome={() => navigate('/')}
          />
        )}
      </div>
    </main>
  );
}

/* 本地落子已在 handleMove 中直接复用 gameLogic.applyMoveToState，规则与联网模式一致 */

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div className="mt-6">
      <div className="text-strong mb-2 text-sm font-medium">{title}</div>
      {children}
    </div>
  );
}

interface EndModalProps {
  state: GameState;
  myColor: Player;
  onRestart: () => void;
  onHome: () => void;
}

function EndModal({ state, myColor, onRestart, onHome }: EndModalProps) {
  const { black, white } = countStones(state.board);

  let title = '';
  if (state.winner === 'draw') title = '平局';
  else if (state.winner === myColor) title = '你赢了！';
  else title = 'AI 获胜';

  return (
    <div className="overlay-bg fixed inset-0 z-10 flex items-center justify-center px-4">
      <div className="card w-full max-w-xs p-6 text-center">
        <h2 className="text-strong text-xl font-semibold">{title}</h2>
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <span className="disc disc-mini disc-black" />
            <span className="text-strong text-xl font-semibold tabular-nums">{black}</span>
          </div>
          <span className="text-muted">:</span>
          <div className="flex items-center gap-2">
            <span className="disc disc-mini disc-white" />
            <span className="text-strong text-xl font-semibold tabular-nums">{white}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onRestart}
            className="btn-solid flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
          >
            <RestartIcon size={18} />
            再来一局
          </button>
          <button
            type="button"
            onClick={onHome}
            className="btn-ghost-border rounded-xl py-3 text-sm font-medium"
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
}

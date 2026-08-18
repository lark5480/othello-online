import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPlayerId } from '../utils/player';
import { ApiError, createRoom, joinRoom } from '../utils/api';

function Logo() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="22" cy="28" r="15" fill="#111418" />
      <circle cx="34" cy="28" r="15" fill="#ffffff" stroke="#c4ccd6" strokeWidth="1.5" />
    </svg>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const { roomId } = await createRoom(getPlayerId());
      navigate(`/room/${roomId}`);
    } catch {
      setError('创建房间失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const roomId = code.trim().toUpperCase();
    if (roomId.length !== 6) {
      setError('请输入 6 位房间码');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await joinRoom(roomId, getPlayerId());
      navigate(`/room/${roomId}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : '';
      setError(
        msg === 'room not found'
          ? '房间不存在'
          : msg === 'room full'
            ? '房间已满'
            : '加入失败，请稍后重试'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page-bg flex min-h-full items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-neutral-900">
            Othello Online
          </h1>
          <p className="mt-1 text-sm text-neutral-500">黑白棋 · 在线对战</p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="mt-8 w-full rounded-xl bg-neutral-900 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-60"
        >
          创建房间
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200" />
          或输入房间码加入
          <span className="h-px flex-1 bg-neutral-200" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="房间码"
            className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-center font-mono text-lg tracking-widest uppercase outline-none transition-colors focus:border-neutral-400"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy}
            className="shrink-0 rounded-xl border border-neutral-900 px-5 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-60"
          >
            加入
          </button>
        </div>

        {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
      </div>
    </main>
  );
}

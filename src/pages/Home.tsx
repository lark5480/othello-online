import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import { getPlayerId } from '../utils/player';
import { ApiError, createRoom, joinRoom } from '../utils/api';

function Logo() {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <circle cx="22" cy="28" r="15" fill="var(--text-strong)" />
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
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className="flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-strong">
            Othello Online
          </h1>
          <p className="mt-1 text-sm text-muted">黑白棋 · 在线对战</p>
        </div>

        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="btn-solid mt-8 w-full rounded-xl py-3 text-sm font-medium"
        >
          创建房间
        </button>

        <button
          type="button"
          onClick={() => navigate('/ai')}
          disabled={busy}
          className="btn-outline mt-3 w-full rounded-xl py-3 text-sm font-medium"
        >
          人机对战
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="divider-line h-px flex-1" />
          或输入房间码加入
          <span className="divider-line h-px flex-1" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="房间码"
            className="input-field w-full rounded-xl px-4 py-3 text-center font-mono text-lg tracking-widest uppercase"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={busy}
            className="btn-outline shrink-0 rounded-xl px-5 py-3 text-sm font-medium"
          >
            加入
          </button>
        </div>

        {error && <p className="text-error mt-4 text-center text-sm">{error}</p>}
      </div>
    </main>
  );
}

import type { Difficulty } from '../utils/ai';
import type { Stats } from '../utils/stats';
import { TrophyIcon } from './icons';

const LABELS: Record<Difficulty, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
  master: '大师',
};

/** 本地战绩面板（人机对战专用，按难度展示）。 */
export default function StatsPanel({
  difficulty,
  stats,
}: {
  difficulty: Difficulty;
  stats: Stats;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <TrophyIcon size={16} />
        <span className="text-strong text-sm font-medium">战绩 · {LABELS[difficulty]}</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Metric label="胜" value={stats.wins} />
        <Metric label="负" value={stats.losses} />
        <Metric label="和" value={stats.draws} />
        <Metric label="局" value={stats.games} />
      </div>

      <div className="text-muted mt-3 text-xs">
        最大净胜子差：<span className="text-strong tabular-nums">{stats.bestMargin}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-black/5 py-2 dark:bg-white/5">
      <div className="text-strong text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-muted text-xs">{label}</div>
    </div>
  );
}

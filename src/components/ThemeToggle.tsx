import { useEffect, useState } from 'react';
import { getThemePreference, setThemePreference, type ThemePreference } from '../utils/theme';
import { MoonIcon, SunIcon, SystemThemeIcon } from './icons';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '亮色',
  dark: '暗色',
};

/** 主题图标（内联 SVG，不用 emoji —— 见 AGENTS.md 代码约定） */
function ThemeIcon({ pref, size = 14 }: { pref: ThemePreference; size?: number }) {
  if (pref === 'light') return <SunIcon size={size} />;
  if (pref === 'dark') return <MoonIcon size={size} />;
  return <SystemThemeIcon size={size} />;
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getThemePreference());

  // 将偏好写入 <html data-theme>，CSS 据此切换令牌
  useEffect(() => {
    if (pref === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', pref);
    }
  }, [pref]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setThemePreference(next);
    setPref(next);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      className="btn-ghost-border flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
      aria-label={`主题：${LABELS[pref]}`}
      title={`当前：${LABELS[pref]}（点击切换）`}
    >
      <ThemeIcon pref={pref} />
      {LABELS[pref]}
    </button>
  );
}

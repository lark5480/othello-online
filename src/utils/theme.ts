/** 主题偏好：跟随系统 / 强制亮色 / 强制暗色，按设备持久化到 localStorage */

const THEME_KEY = 'othello_theme';

export type ThemePreference = 'system' | 'light' | 'dark';

export function getThemePreference(): ThemePreference {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw === 'light' || raw === 'dark') return raw;
  return 'system';
}

export function setThemePreference(pref: ThemePreference): void {
  if (pref === 'system') {
    localStorage.removeItem(THEME_KEY);
  } else {
    localStorage.setItem(THEME_KEY, pref);
  }
}

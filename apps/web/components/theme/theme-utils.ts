export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'flikker-theme';
export const THEME_CHANGE_EVENT = 'flikker-theme-change';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

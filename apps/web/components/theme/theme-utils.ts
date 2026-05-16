export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'flikker-theme';
export const THEME_CHANGE_EVENT = 'flikker-theme-change';

export function getInitialTheme(): ThemeMode {
  return 'light';
}

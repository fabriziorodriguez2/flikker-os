'use client';

import { useEffect, useState } from 'react';
import {
  getInitialTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './theme-utils';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const isDark = theme === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  }, [theme]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark  'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark  'light' : 'dark')}
      className={`relative inline-flex h-9 w-[62px] items-center rounded-full border px-[4px] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(145,136,245,0.28)] ${
        isDark
           'border-[color:rgba(145,136,245,0.22)] bg-[#9188f5]'
          : 'border-[color:var(--border)] bg-[#d5dbe5]'
      }`}
    >
      <span
        className={`absolute h-[23px] w-[23px] rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-transform duration-200 ${
          isDark  'translate-x-[31px]' : 'translate-x-0'
        }`}
      />
      <span className="sr-only">
        {isDark  'Modo oscuro activo' : 'Modo claro activo'}
      </span>
      <span className="relative z-10 flex w-full items-center justify-between px-[4px]">
        <span
          aria-hidden="true"
          className={`h-[5px] w-[5px] rounded-full transition-opacity ${
            isDark  'opacity-0' : 'bg-white/72 opacity-100'
          }`}
        />
        <span
          aria-hidden="true"
          className={`h-[5px] w-[5px] rounded-full transition-opacity ${
            isDark  'bg-white/78 opacity-100' : 'opacity-0'
          }`}
        />
      </span>
    </button>
  );
}

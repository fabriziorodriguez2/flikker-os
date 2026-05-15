'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  getInitialTheme,
  THEME_CHANGE_EVENT,
  type ThemeMode,
} from '@/components/theme/theme-utils';

interface BrandMarkProps {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export default function BrandMark({
  className,
  width = 64,
  height = 50,
  priority = false,
}: BrandMarkProps) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = (document.documentElement.dataset.theme ||
        getInitialTheme()) as ThemeMode;
      setTheme(nextTheme === 'dark'  'dark' : 'light');
    };

    syncTheme();

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeMode>;
      setTheme(customEvent.detail === 'dark'  'dark' : 'light');
    };

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);

    return () => {
      observer.disconnect();
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    };
  }, []);

  return (
    <Image
      src={theme === 'dark'  '/flikker-mark-white.svg' : '/flikker-mark.svg'}
      alt="Flikker"
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}

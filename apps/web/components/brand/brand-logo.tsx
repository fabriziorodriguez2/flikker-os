'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  getInitialTheme,
  THEME_CHANGE_EVENT,
  type ThemeMode,
} from '@/components/theme/theme-utils';

interface BrandLogoProps {
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}

export default function BrandLogo({
  className,
  width = 182,
  height = 155,
  priority = false,
}: BrandLogoProps) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    const syncTheme = () => {
      const nextTheme = (document.documentElement.dataset.theme ||
        getInitialTheme()) as ThemeMode;
      setTheme(nextTheme === 'dark' ? 'dark' : 'light');
    };

    syncTheme();

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<ThemeMode>;
      setTheme(customEvent.detail === 'dark' ? 'dark' : 'light');
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
      src={theme === 'dark' ? '/flikker-wordmark-white.svg' : '/flikker-wordmark.svg'}
      alt="Flikker"
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}

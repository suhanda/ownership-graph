'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/**
 * shadcn drives dark mode from a `.dark` class rather than `prefers-color-scheme`, so the class has
 * to be put there by something. `defaultTheme="system"` keeps the OS preference as the default.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}

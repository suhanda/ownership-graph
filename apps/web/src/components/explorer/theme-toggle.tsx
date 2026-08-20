'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

const ORDER = ['system', 'light', 'dark'] as const;
const ICON = { system: Monitor, light: Sun, dark: Moon };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Before hydration the resolved theme is unknown; rendering a guess causes a flash and a mismatch.
  const current = mounted ? ((theme ?? 'system') as (typeof ORDER)[number]) : 'system';
  const Icon = ICON[current] ?? Monitor;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={`Theme: ${current}. Click to change.`}
      onClick={() => setTheme(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system')}
    >
      <Icon className="size-4" />
    </Button>
  );
}

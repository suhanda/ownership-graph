/**
 * Colour encodes the role a node plays in an investigation; shape encodes the exact label. Identity
 * is therefore never colour-alone, which also carries the colour-vision-deficiency case.
 *
 * The hues live in globals.css as --chart-1..5 and were validated across all pairs in both themes.
 * They are read from the DOM rather than duplicated here, so the chart cannot drift from the theme.
 */
import type { NodeKind } from '@ownership/shared';

export const KIND_STYLE: Record<
  NodeKind,
  { token: string; symbol: string; size: number; role: string }
> = {
  Person: { token: '--chart-1', symbol: 'circle', size: 44, role: 'Person' },
  Company: { token: '--chart-4', symbol: 'roundRect', size: 50, role: 'Company' },
  Address: { token: '--chart-2', symbol: 'diamond', size: 38, role: 'Shared address' },
  Intermediary: { token: '--chart-2', symbol: 'triangle', size: 38, role: 'Corporate agent' },
  Jurisdiction: { token: '--chart-5', symbol: 'circle', size: 28, role: 'Jurisdiction' },
  Watchlist: { token: '--chart-3', symbol: 'pin', size: 42, role: 'Watchlist' },
};

export const readToken = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

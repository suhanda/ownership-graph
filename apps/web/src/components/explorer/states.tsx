'use client';

import { AlertTriangle, RotateCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ApiError } from '@ownership/shared';
import { Button } from '@/components/ui/button';

/**
 * The hero query is ~1.3s warm and ~2s cold on the free tier. Rather than hide that behind a
 * spinner, the wait narrates the traversal — the delay becomes evidence that real work is happening.
 */
export function TracingState({ steps }: { steps: string[] }) {
  const [reached, setReached] = useState(0);

  useEffect(() => {
    setReached(0);
    const timer = setInterval(() => setReached((n) => Math.min(n + 1, steps.length)), 260);
    return () => clearInterval(timer);
  }, [steps]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-card px-8">
      <div className="flex w-full max-w-sm flex-col gap-2.5" aria-live="polite">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`flex items-center gap-3 text-sm transition-opacity duration-300 ${
              i < reached ? 'opacity-100' : 'opacity-30'
            }`}
          >
            <span className={i < reached ? 'text-foreground' : 'text-muted-foreground'}>
              {step}
            </span>
            <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: i < reached ? '100%' : '0%' }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Walking ownership on a shared free-tier instance. A five-layer rollup takes about a second.
      </p>
    </div>
  );
}

/** An empty answer is a finding, not a failure — so it says what the absence means. */
export function EmptyState({
  headline,
  detail,
  action,
}: {
  headline: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-8 text-center">
      <Search className="size-7 text-muted-foreground" aria-hidden />
      <h3 className="text-base font-semibold text-balance">{headline}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{detail}</p>
      {action ? (
        <Button onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The driver cannot tell a bad hostname from a paused instance from a blocked network, so this does
 * not pretend to. It retries on a backing-off timer and says when it will try again.
 */
const MAX_BACKOFF_SECONDS = 30;

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const base = error.retryAfter ?? 5;
  const [seconds, setSeconds] = useState(base);
  // Held in a ref so the interval reads the current delay without being torn down each tick.
  const delay = useRef(base);

  useEffect(() => {
    delay.current = base;
    setSeconds(base);
    const timer = setInterval(() => {
      setSeconds((remaining) => {
        if (remaining > 1) return remaining - 1;
        onRetry();
        // Back off toward 30s so a forgotten tab cannot hammer a struggling instance.
        delay.current = Math.min(delay.current * 2, MAX_BACKOFF_SECONDS);
        return delay.current;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [base, onRetry]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-card px-8 text-center">
      <AlertTriangle className="size-7 text-destructive" aria-hidden />
      <h3 className="text-base font-semibold text-balance">
        {error.kind === 'database_unreachable'
          ? 'The database is unreachable'
          : 'Something went wrong'}
      </h3>
      <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
      <div className="mt-1 flex items-center gap-3">
        <Button onClick={onRetry}>
          <RotateCw className="size-4" /> Try again
        </Button>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          retrying in {seconds}s
        </span>
      </div>
    </div>
  );
}

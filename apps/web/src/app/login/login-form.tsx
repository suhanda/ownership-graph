'use client';

import { Database, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function Form() {
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError((body as { error?: string } | null)?.error ?? 'That password is not right.');
        return;
      }
      // A full navigation, not a client push: the middleware has to re-read the new cookie.
      window.location.href = params.get('next') || '/';
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <Database className="size-[18px] text-primary" aria-hidden />
          Ownership Graph
        </div>
        <CardTitle className="text-sm font-normal text-muted-foreground">
          This demo is password protected. The password is in the submission email.
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              autoFocus
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'password-error' : undefined}
            />
          </div>
          {error ? (
            <p id="password-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || password.length === 0}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ? 'Checking…' : 'Enter'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoginForm() {
  // useSearchParams needs a Suspense boundary to keep the page statically renderable.
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}

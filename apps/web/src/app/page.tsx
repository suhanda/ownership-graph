import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { fetchHealth } from '@/lib/api';

/**
 * Scaffold vertical slice: a Server Component calls the NestJS API, which pings CognoDB.
 * If this renders "reachable", the whole chain — workspace, shared schemas, Nest DI, driver,
 * env config, CORS — is wired correctly.
 */
export default async function Page() {
  const health = await fetchHealth();
  const unreachable = 'error' in health;
  const state = unreachable ? 'unreachable' : health.database;

  const tone = {
    reachable: { Icon: CheckCircle2, className: 'text-primary', label: 'Connected' },
    unreachable: { Icon: XCircle, className: 'text-destructive', label: 'Unreachable' },
    misconfigured: { Icon: AlertTriangle, className: 'text-chart-2', label: 'Misconfigured' },
  }[state];

  const rows: [string, string][] = unreachable
    ? [['Detail', health.error]]
    : [
        ['Server', health.serverAgent ?? '—'],
        ['Bolt protocol', health.boltProtocol ?? '—'],
        ['Round trip', health.latencyMs === undefined ? '—' : `${health.latencyMs} ms`],
        ...(health.detail ? ([['Detail', health.detail]] as [string, string][]) : []),
      ];

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Ownership Graph</h1>
        <p className="text-muted-foreground">
          Trace who really owns a company, through every layer.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-xs font-semibold tracking-[0.11em] text-muted-foreground uppercase">
            Database
          </CardTitle>
          <Badge variant="outline" className="gap-1.5">
            <tone.Icon className={`size-3.5 ${tone.className}`} aria-hidden />
            {tone.label}
          </Badge>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-8 gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono tabular-nums break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </main>
  );
}

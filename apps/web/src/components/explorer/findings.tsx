'use client';

import { Badge } from '@/components/ui/badge';

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);

function Shell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

const Hop = ({ children, accent }: { children: React.ReactNode; accent?: boolean }) => (
  <span
    className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${
      accent ? 'border-chart-2 text-foreground' : 'border-border bg-secondary text-foreground'
    }`}
  >
    {children}
  </span>
);

/** Each answer earns its own presentation; a generic table would flatten what makes each finding land. */
export function Findings({ questionId, rows }: { questionId: string; rows: Row[] }) {
  if (rows.length === 0) return null;

  if (questionId === 'owners' || questionId === 'watchlist') {
    const sorted = [...rows].sort((a, b) => num(b['effectivePct']) - num(a['effectivePct']));
    const isWatchlist = questionId === 'watchlist';
    return (
      <Shell
        label={
          isWatchlist
            ? 'Controlled companies · effective stake'
            : 'Beneficial owners · effective stake'
        }
      >
        <div className="divide-y divide-border">
          {sorted.map((row, i) => (
            <div
              key={`${str(row['id'])}-${str(row['companyId'])}-${i}`}
              className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 py-2"
            >
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{str(row[isWatchlist ? 'company' : 'name'])}</span>
                  {!isWatchlist && str(row['kind']) === 'Person' ? (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      sanctioned
                    </Badge>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isWatchlist
                    ? `via ${str(row['listedParty'])} · ${num(row['depth'])} hop(s)`
                    : `${str(row['kind'])} · ${num(row['shortestChain'])} hop(s) away`}
                </div>
              </div>
              <span className="font-mono text-[15px] font-semibold tabular-nums">
                {num(row['effectivePct'])}
                <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">%</span>
              </span>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  if (questionId === 'link') {
    return (
      <Shell label={`${rows.length} independent connection(s)`}>
        <div className="flex flex-col gap-1.5">
          {rows.map((row, i) => {
            const path = list(row['path']);
            const via = list(row['via']);
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5 py-1 text-xs">
                {path.map((step, j) => (
                  <span key={`${step}-${j}`} className="flex items-center gap-1.5">
                    <Hop accent={j > 0 && j < path.length - 1}>{step}</Hop>
                    {j < via.length ? (
                      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                        {via[j]?.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    ) : null}
                  </span>
                ))}
                <Badge variant="secondary" className="ml-1">
                  {num(row['hops'])} hops
                </Badge>
              </div>
            );
          })}
        </div>
      </Shell>
    );
  }

  if (questionId === 'cycles') {
    return (
      <Shell label={`${rows.length} closed ring(s)`}>
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-1 py-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {list(row['ring']).map((name, j) => (
                <span key={`${name}-${j}`} className="flex items-center gap-1.5">
                  <Hop>{name}</Hop>
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    owns
                  </span>
                </span>
              ))}
              <Hop>{list(row['ring'])[0]}</Hop>
            </div>
            <p className="text-xs text-muted-foreground">
              Ownership returns to where it started, so it never reaches a person. Effective
              ownership is undefined — which is what the structure is for.
            </p>
          </div>
        ))}
      </Shell>
    );
  }

  if (questionId === 'nominee') {
    const principal = rows.find((r) => str(r['relation']) === 'NOMINEE_FOR');
    const fronts = rows.filter((r) => str(r['relation']) === 'OFFICER_OF');
    return (
      <Shell label="Nominee">
        <p className="text-sm">
          <span className="font-medium">{str(principal?.['nominee'] ?? rows[0]?.['nominee'])}</span>{' '}
          acts on behalf of <span className="font-medium">{str(principal?.['other'] ?? '—')}</span>
          {fronts.length ? (
            <>
              , and is an officer of{' '}
              <span className="font-medium">{fronts.map((f) => str(f['other'])).join(', ')}</span>
            </>
          ) : null}
          .
        </p>
      </Shell>
    );
  }

  if (questionId === 'shared') {
    const row = rows[0] ?? {};
    const addressCount = num(row['addressShareCount']);
    const agentCount = num(row['agentShareCount']);
    return (
      <Shell label="Shared registration">
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Hop accent>{str(row['address'])}</Hop>
            <Badge variant={addressCount > 20 ? 'secondary' : 'default'}>
              shared by {addressCount}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {addressCount > 20
                ? 'mass registration — weak evidence on its own'
                : 'a narrow overlap'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Hop accent>{str(row['agent'])}</Hop>
            <Badge variant={agentCount > 20 ? 'secondary' : 'default'}>
              shared by {agentCount}
            </Badge>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}

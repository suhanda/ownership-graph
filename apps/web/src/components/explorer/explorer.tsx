'use client';

import type { ApiError, CanvasState, GraphNode, GraphPayload, Health } from '@ownership/shared';
import { ArrowLeft, Database, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, type QueryResult } from '@/lib/api';
import dynamic from 'next/dynamic';
import { ChatPanel } from './chat-panel';
import { Findings } from './findings';

/**
 * ECharts is ~1.1 MB minified even tree-shaken to the graph series alone, and it needs a DOM, so it
 * is loaded after first paint rather than shipped in the initial bundle. The server-rendered
 * findings are already on screen by the time it arrives.
 */
const GraphCanvas = dynamic(() => import('./graph-canvas').then((m) => m.GraphCanvas), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden />,
});
import { DEFAULT_QUESTION, QUESTIONS, type Question } from './questions';
import { EmptyState, ErrorState, TracingState } from './states';
import { ThemeToggle } from './theme-toggle';

type Status = 'ready' | 'loading' | 'empty' | 'error';

interface View {
  questionId: string;
  title: string;
  subtitle: string;
  tracing: string[];
  status: Status;
  rows: Record<string, unknown>[];
  graph?: GraphPayload;
  focusIds: string[];
  error?: ApiError;
  meta?: string;
  empty: { headline: string; detail: string };
  /** Set when the view was reached by clicking a node, so we can offer a way back. */
  from?: { title: string; restore: () => void };
}

export function Explorer({ initial, health }: { initial: QueryResult; health: Health | null }) {
  const first = DEFAULT_QUESTION;
  const [view, setView] = useState<View>(() => ({
    questionId: first.id,
    title: first.title,
    subtitle: first.subtitle,
    tracing: first.tracing,
    status: initial.rows.length ? 'ready' : 'empty',
    rows: initial.rows,
    graph: initial.graph,
    focusIds: first.focusIds,
    empty: first.empty,
    meta: `${initial.rows.length} owners`,
  }));

  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [expanding, setExpanding] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [matches, setMatches] = useState<Record<string, unknown>[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runQuestion = useCallback(async (question: Question) => {
    setView((current) => ({
      ...current,
      questionId: question.id,
      title: question.title,
      subtitle: question.subtitle,
      tracing: question.tracing,
      status: 'loading',
      empty: question.empty,
      focusIds: question.focusIds,
      from: undefined,
    }));
    const started = Date.now();
    const result = await question.run();
    if (!result.ok) {
      setView((c) => ({ ...c, status: 'error', error: result.error, rows: [], graph: undefined }));
      return;
    }
    const { rows, graph } = result.data;
    setView((c) => ({
      ...c,
      status: rows.length === 0 ? 'empty' : 'ready',
      rows,
      graph,
      meta: `${rows.length} result(s) · ${Date.now() - started} ms`,
    }));
  }, []);

  const retry = useCallback(() => {
    const question = QUESTIONS.find((q) => q.id === view.questionId);
    if (question) void runQuestion(question);
  }, [view.questionId, runQuestion]);

  /**
   * Double-click pulls a node's neighbours into the graph that is already on screen, rather than
   * replacing it. "Expand" in a graph means grow, and replacing loses the context the user built up
   * by expanding in the first place.
   */
  const expand = useCallback(async (node: GraphNode) => {
    setExpanding(node.id);
    const result = await api.neighbours(node.id, 40);
    setExpanding(null);
    if (!result.ok) {
      setView((c) => ({ ...c, status: 'error', error: result.error }));
      return;
    }
    const incoming = result.data.graph;
    if (!incoming) return;

    setView((current) => {
      const base = current.graph ?? { nodes: [], links: [] };
      const nodes = [...base.nodes];
      const seen = new Set(nodes.map((n) => n.id));
      let added = 0;
      for (const n of incoming.nodes) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          nodes.push(n);
          added++;
        }
      }
      const links = [...base.links];
      const linkKey = (l: { source: string; target: string; type: string }) =>
        `${l.source}>${l.target}:${l.type}`;
      const seenLinks = new Set(links.map(linkKey));
      for (const l of incoming.links) {
        if (!seenLinks.has(linkKey(l))) {
          seenLinks.add(linkKey(l));
          links.push(l);
        }
      }
      return {
        ...current,
        status: 'ready',
        graph: { nodes, links },
        focusIds: [...new Set([...current.focusIds, node.id])],
        meta: added === 0 ? 'already expanded' : `+${added} node(s) · ${nodes.length} total`,
      };
    });
  }, []);

  /** A chat answer repaints the chart in place rather than opening a separate view. */
  const showChatGraph = useCallback((graph: GraphPayload, label: string) => {
    const root = graph.nodes[0];
    setView((c) => ({
      ...c,
      questionId: 'chat',
      title: 'From the conversation',
      subtitle: label,
      status: 'ready',
      rows: [],
      graph,
      focusIds: root ? [root.id] : [],
      meta: `${graph.nodes.length} nodes`,
      from: undefined,
    }));
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (term.trim().length < 2) {
      setMatches([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const result = await api.entities(term.trim(), 6);
      setMatches(result.ok ? result.data : []);
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [term]);

  const openEntity = async (id: string, label: string) => {
    setTerm('');
    setMatches([]);
    setView((c) => ({
      ...c,
      questionId: 'owners',
      title: `Who really owns ${label}?`,
      subtitle: 'Beneficial ownership, up to five layers.',
      tracing: ['Resolving entity', 'Walking ownership', 'Rolling up percentages'],
      status: 'loading',
      focusIds: [id],
      empty: {
        headline: 'No owner found within five layers',
        detail: 'Ownership never reaches a natural person inside the depth limit.',
      },
      from: undefined,
    }));
    const result = await api.beneficialOwners(id, 5);
    if (!result.ok) {
      setView((c) => ({ ...c, status: 'error', error: result.error, rows: [], graph: undefined }));
      return;
    }
    setView((c) => ({
      ...c,
      status: result.data.rows.length === 0 ? 'empty' : 'ready',
      rows: result.data.rows,
      graph: result.data.graph,
      meta: `${result.data.rows.length} owner(s)`,
    }));
  };

  // Capped at 40 to match the schema and keep the per-turn cost bounded; the count tells the model
  // when it is only seeing part of the picture.
  const canvas: CanvasState = {
    title: view.title,
    nodes: (view.graph?.nodes ?? []).slice(0, 40).map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      ...(n.watchlisted ? { watchlisted: true } : {}),
    })),
    totalNodes: view.graph?.nodes.length ?? 0,
  };

  const connected = health?.database === 'reachable';

  return (
    <div className="grid h-svh min-h-[640px] grid-cols-1 grid-rows-[auto_auto_minmax(320px,1fr)_auto] gap-px bg-border lg:grid-cols-[264px_minmax(0,1fr)_372px] lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center gap-4 bg-card px-4 py-3 lg:col-span-3">
        <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <Database className="size-[18px] text-primary" aria-hidden />
          Ownership Graph
        </div>
        <div className="hidden rounded-md border border-border bg-secondary px-2.5 py-1 sm:block">
          <div className="text-[9px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Contract under review
          </div>
          <div className="text-xs font-medium">Northgate Transit Extension</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 font-mono text-[11px]">
            <span
              className={`size-1.5 rounded-full ${connected ? 'bg-primary' : 'bg-destructive'}`}
            />
            {connected ? `CognoDB · Bolt ${health?.boltProtocol ?? ''}` : 'database unreachable'}
          </Badge>
          <ThemeToggle />
        </div>
      </header>

      <nav className="flex flex-col overflow-y-auto bg-card" aria-label="Questions">
        <div className="p-4 pb-2">
          <div className="mb-2 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
            Find an entity
          </div>
          <div className="relative">
            <Search
              className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Company, person or agent…"
              className="pl-8"
              aria-label="Search for an entity"
            />
          </div>
          {matches.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {matches.map((m) => (
                <li key={String(m['id'])}>
                  <button
                    onClick={() => void openEntity(String(m['id']), String(m['name']))}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  >
                    <span className="font-medium">{String(m['name'])}</span>
                    <span className="ml-1.5 text-muted-foreground">{String(m['kind'])}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
          Ask of this case
        </div>
        <div className="flex flex-col gap-px px-2 pb-4">
          {QUESTIONS.map((question) => (
            <button
              key={question.id}
              onClick={() => void runQuestion(question)}
              aria-current={view.questionId === question.id}
              className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary aria-[current=true]:bg-primary/10 aria-[current=true]:shadow-[inset_2px_0_0_var(--primary)]"
            >
              <span className="text-[13px] leading-tight font-medium">{question.label}</span>
              <span className="text-[11px] text-muted-foreground">{question.hint}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="flex min-w-0 flex-col bg-card">
        <div className="flex items-start gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {view.from ? (
              <button
                onClick={view.from.restore}
                className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
              >
                <ArrowLeft className="size-3" /> back to “{view.from.title}”
              </button>
            ) : null}
            <h1 className="text-[17px] leading-tight font-semibold tracking-tight text-balance">
              {view.title}
            </h1>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">{view.subtitle}</p>
          </div>
          {view.meta ? (
            <Badge
              variant="outline"
              className="ml-auto shrink-0 font-mono text-[11px] tabular-nums"
            >
              {view.meta}
            </Badge>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1">
          {view.graph && view.status === 'ready' ? (
            <GraphCanvas
              graph={view.graph}
              focusIds={view.focusIds}
              onSelect={setSelected}
              onExpand={(n) => void expand(n)}
            />
          ) : null}
          {view.status === 'loading' ? <TracingState steps={view.tracing} /> : null}
          {view.status === 'empty' ? (
            <EmptyState headline={view.empty.headline} detail={view.empty.detail} />
          ) : null}
          {view.status === 'error' && view.error ? (
            <ErrorState error={view.error} onRetry={retry} />
          ) : null}
        </div>

        {view.status === 'ready' && selected ? (
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-sm">
            <span className="font-medium">{selected.label}</span>
            <span className="text-xs text-muted-foreground">
              {selected.kind}
              {selected.jurisdictionCode ? ` · ${selected.jurisdictionCode}` : ''}
              {selected.legalForm ? ` · ${selected.legalForm}` : ''}
            </span>
            {selected.watchlisted ? (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                sanctioned
              </Badge>
            ) : null}
            <span className="ml-auto text-xs text-muted-foreground">
              {expanding === selected.id ? 'expanding…' : 'double-click to expand'}
            </span>
          </div>
        ) : null}

        {view.status === 'ready' && view.rows.length > 0 ? (
          <section className="max-h-[35%] overflow-y-auto border-t border-border px-4 py-3">
            <Findings questionId={view.questionId} rows={view.rows} />
          </section>
        ) : null}
      </main>

      <ChatPanel onGraph={showChatGraph} canvas={canvas} />
    </div>
  );
}

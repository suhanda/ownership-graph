'use client';

import {
  chatEventSchema,
  type CanvasState,
  type ChatEvent,
  type GraphPayload,
} from '@ownership/shared';
import { Send, Sparkles, Wrench } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from './markdown';

type Entry =
  | { kind: 'you'; text: string }
  | { kind: 'claude'; text: string }
  | { kind: 'tool'; name: string; args: string; summary?: string }
  | { kind: 'notice'; text: string };

/** Only the spoken turns; tool calls and local notices are not part of the conversation. */
function historyFrom(entries: Entry[]): { role: 'user' | 'assistant'; content: string }[] {
  return entries
    .filter(
      (e): e is Extract<Entry, { kind: 'you' | 'claude' }> =>
        e.kind === 'you' || e.kind === 'claude',
    )
    .slice(-10)
    .map((e) => ({
      role: e.kind === 'you' ? ('user' as const) : ('assistant' as const),
      content: e.text,
    }));
}

const SUGGESTIONS = [
  'Who owns Harbour Line Construction?',
  'Is anyone here sanctioned?',
  'Which companies own each other?',
];

/**
 * Consumes the SSE contract in `packages/shared/src/chat.ts`. The chart repaints the moment a
 * `tool_result` carrying a graph arrives — before narration starts — which is what hides the query.
 */
export function ChatPanel({
  onGraph,
  canvas,
}: {
  onGraph: (graph: GraphPayload, label: string) => void;
  /** What the chart is showing, so the model can reason about the screen the user sees. */
  canvas?: CanvasState;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  /** Model-generated, grounded in the current canvas. Falls back to the static list until one arrives. */
  const [followups, setFollowups] = useState<string[] | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  const push = (entry: Entry) => {
    setEntries((current) => [...current, entry]);
    queueMicrotask(() =>
      log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }),
    );
  };

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setValue('');
    setFollowups(null);
    push({ kind: 'you', text: question });
    setBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Without this a follow-up like "yes" or "now show me who owns that" has no antecedent,
        // and the model falls back to describing what it can do.
        body: JSON.stringify({ message: question, history: historyFrom(entries), canvas }),
      });

      if (!response.ok || !response.body) {
        push({
          kind: 'notice',
          text:
            response.status === 404
              ? 'The chat service is not available yet. The questions on the left work without it.'
              : 'The chat service is unavailable right now. The questions on the left still work.',
        });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamed = '';

      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          const parsed = chatEventSchema.safeParse(JSON.parse(line.slice(5).trim()));
          if (!parsed.success) continue;
          const event: ChatEvent = parsed.data;

          if (event.type === 'tool_call') {
            // The turn may produce several assistant messages around tool calls. Reset the
            // accumulator, or the next message reopens with the previous one's text.
            streamed = '';
            push({ kind: 'tool', name: event.name, args: JSON.stringify(event.args) });
          } else if (event.type === 'tool_result') {
            if (event.graph) onGraph(event.graph, event.summary);
            setEntries((current) => {
              const next = [...current];
              for (let i = next.length - 1; i >= 0; i--) {
                const entry = next[i];
                if (entry?.kind === 'tool' && entry.name === event.name && !entry.summary) {
                  next[i] = { ...entry, summary: event.summary };
                  break;
                }
              }
              return next;
            });
          } else if (event.type === 'text_delta') {
            streamed += event.text;
            setEntries((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.kind === 'claude')
                next[next.length - 1] = { kind: 'claude', text: streamed };
              else next.push({ kind: 'claude', text: streamed });
              return next;
            });
          } else if (event.type === 'suggestions') {
            setFollowups(event.questions);
          } else if (event.type === 'error') {
            push({ kind: 'notice', text: event.message });
          }
        }
      }
    } catch {
      push({ kind: 'notice', text: 'Lost the connection to the chat service.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex min-h-0 flex-col bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <span className="text-[10px] font-semibold tracking-[0.11em] text-muted-foreground uppercase">
          Ask in plain language
        </span>
      </div>

      <div ref={log} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask about any company or person in the graph. Answers come from the same queries the
            buttons on the left run — nothing is invented.
          </p>
        ) : null}

        {entries.map((entry, i) => {
          if (entry.kind === 'tool') {
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border border-dashed border-border bg-secondary px-2.5 py-1.5 text-[11px] text-muted-foreground"
              >
                <Wrench className="size-3 shrink-0 text-primary" aria-hidden />
                <span className="truncate">
                  <b className="font-semibold text-foreground">{entry.name}</b>{' '}
                  <span className="font-mono">{entry.args}</span>
                  {entry.summary ? ` → ${entry.summary}` : ' …'}
                </span>
              </div>
            );
          }
          if (entry.kind === 'notice') {
            return (
              <p key={i} className="text-xs text-muted-foreground italic">
                {entry.text}
              </p>
            );
          }
          return (
            <div
              key={i}
              className={`flex ${entry.kind === 'you' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                  entry.kind === 'you'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm border border-border bg-secondary'
                }`}
              >
                {entry.kind === 'claude' ? <Markdown>{entry.text}</Markdown> : entry.text}
              </div>
            </div>
          );
        })}
      </div>

      {!busy && (followups ?? (entries.length === 0 ? SUGGESTIONS : [])).length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {(followups ?? SUGGESTIONS).map((s) => (
            <button
              key={s}
              onClick={() => void ask(s)}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(value);
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask about these companies…"
          aria-label="Ask a question about the graph"
          disabled={busy}
        />
        <Button type="submit" size="icon" disabled={busy || !value.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </form>
    </aside>
  );
}

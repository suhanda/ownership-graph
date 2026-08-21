'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Chat answers arrive as Markdown — the model reaches for bold and numbered lists to structure an
 * ownership chain, which is exactly right and reads as literal asterisks without this.
 *
 * Raw HTML is deliberately not enabled (no rehype-raw): the content is model output shaped by a
 * user's question, so there is no reason to let it inject markup.
 *
 * Spacing is tight on purpose. These render inside a chat bubble, not an article.
 */
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0 marker:text-muted-foreground">
      {children}
    </ol>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0 marker:text-muted-foreground">
      {children}
    </ul>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  code: ({ children }) => (
    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md bg-black/10 p-2 text-[0.85em] last:mb-0 dark:bg-white/10">
      {children}
    </pre>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
  hr: () => <hr className="my-2 border-border" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full text-left text-[0.9em]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border pb-1 font-medium">{children}</th>,
  td: ({ children }) => <td className="py-0.5 pr-3 tabular-nums">{children}</td>,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}

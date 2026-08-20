# Build the chat endpoint

Type: task
Status: open
Blocked by: 10

## Question

Implement the streaming chat over the tool contract from ticket 07.

Everything is specified: `chat/tools.ts` holds the eight `betaZodTool` definitions and the system
prompt, `packages/shared/src/chat.ts` holds the SSE event union and request schema.

Work:
- `POST /chat` streaming Server-Sent Events, using `client.beta.messages.toolRunner` with the tools
  bound to the live `GraphService`.
- `claude-opus-5`, adaptive thinking, `output_config.effort: 'low'`, `max_tokens: 2048`.
- Emit `tool_call` → `tool_result` → `text_delta`* → `done`. The `tool_result` carries the
  `GraphPayload`, so **the chart repaints before narration begins** — that is what hides the query
  latency.
- Guardrails: per-IP rate limit, max 6 tool turns per question, and a daily token budget. On
  exhaustion, emit `budget_exhausted` and have `GET /chat/status` report `available: false` so the UI
  degrades to the preset questions with the graph fully usable.
- Prompt caching: keep the tool list and system prompt byte-stable so they cache; only the
  conversation varies.
- Failure paths per ticket 07: no tool matched → decline plus `suggestions`; ambiguous name → ask;
  database dead mid-turn → `database_unreachable` chat event.

**Done when** the six preset questions all work end to end, a follow-up like "now show me who owns
that" resolves, and an out-of-scope question declines gracefully with suggestions.

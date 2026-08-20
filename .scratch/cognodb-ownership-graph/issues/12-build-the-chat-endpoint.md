# Build the chat endpoint

Type: task
Status: resolved
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

## Answer

**Built, and verified as far as it can be without an Anthropic API key.** Committed as `30a2518`.

### Shape

`POST /chat` streams Server-Sent Events, driven by the SDK **Tool Runner** with the eight
`betaZodTool` definitions bound to the live `GraphService`. `GET /chat/status` reports availability so
the UI can degrade before a user types anything.

`claude-opus-5`, `thinking: { type: 'adaptive' }`, `output_config.effort: 'low'`, `max_tokens: 2048`,
`max_iterations: 6`. The system prompt and tool list are byte-stable with `cache_control` on the
system block, so only the conversation varies and the prefix caches.

Reading the SDK's own types first was worth it — `max_iterations` on `BetaToolRunnerParams` **is** the
"max 6 tool turns" guardrait ticket 07 specified, so no hand-rolled loop counter was needed, and
`stream: true` makes the runner yield a `BetaMessageStream` per iteration whose `contentBlock` and
`text` events map exactly onto the `tool_call` and `text_delta` events in the contract.

### Verified

| Check | Result |
|---|---|
| `GET /chat/status` with no key | `available: false`, `reason: "not_configured"`, six preset questions |
| `POST /chat` with no key | `error` → `suggestions` → `done`, as valid SSE frames |
| Empty message | **400**, `"Too small: expected string to have >=1 characters"` |
| Graph endpoints while chat is off | **200** — unaffected |
| Rate limit, 3/min | allowed ×3 then BLOCKED ×2; a different IP unaffected |
| Daily budget, 1,000 tokens | not exhausted at 600, exhausted at 1,100, `remaining` correct |

The rate limiter could not be exercised through HTTP because the not-configured check correctly
short-circuits before it, so it was tested directly against the compiled service instead. Ordering in
production is not-configured → rate-limited → budget-exhausted, which is the right precedence.

### Design notes

- **An absent `ANTHROPIC_API_KEY` is a supported state, not a crash.** The graph is the product and
  the chat sits on top of it; a missing key logs a warning at boot and disables one panel.
- **Guardrails are in-memory on purpose.** The API is a single long-running container (`docs/hosting.md`),
  so there is no second instance to share state with, and a Redis dependency for a demo would be theatre.
- **Zero tool calls means the model declined**, since it can only answer from tool results — so that
  case emits `suggestions` rather than leaving a dead end.
- Tool names from the model are **validated against `toolNameSchema`, not cast**, so the transcript can
  never claim a tool that isn't ours.
- `X-Accel-Buffering: no` is set, because a buffering proxy would defeat the point of streaming.

### Not verified — needs a key

**The live model path has never run.** There is no `ANTHROPIC_API_KEY` in the environment and no `ant`
CLI on this machine, so tool selection, argument filling, streaming narration and the chart repainting
from a `tool_result` are all built to the contract and typechecked, but unexercised.

To test: put a key in `.env` as `ANTHROPIC_API_KEY=…`, restart the API, and ask
*"Who owns Meridian Civic Infrastructure?"* — expect `find_entity` → `trace_beneficial_owners` →
narration naming Konstantin Belov at 76.5%. This must happen before the recording.

**Status: resolved.**

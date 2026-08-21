# Design the chat tool set and Claude contract

Type: grilling
Status: resolved
Blocked by: 05

## Question

What exactly does the LLM see, and what exactly can it do?

Tool-calling over curated parameterised queries is the locked architecture. This ticket turns that into
a contract precise enough to implement, and it is where the "no string-concatenated Cypher" rule is
actually enforced — the model never emits Cypher, it picks a tool and fills typed parameters.

Consult `/claude-api` before answering. Do not work from memory on model ids, tool-use shape or pricing.

Decisions to settle:

- **The tool set.** One tool per signature query, or fewer tools with richer parameters? Name and
  describe each so the model picks correctly without seeing the schema.
- **Parameter schemas.** Zod on the server, converted to JSON Schema for the tool definitions. How do
  free-text entity names from the user get resolved to actual nodes — a separate `find_entity` lookup
  tool the model calls first, or fuzzy resolution inside each tool?
- **The system prompt.** How much graph schema does the model need? What is its persona, and what does
  it do with a result — narrate it, or hand it straight to the UI?
- **Failure paths.** What happens when no tool matches the question, when a tool returns zero rows, when
  the parameter cannot be resolved to an entity, and when the database is down mid-conversation. Each of
  these will be seen in the recording.
- **Conversation shape.** Streaming or single response? Is there history across turns, and does a
  follow-up like "now show me who owns _that_" work?
- **Which model**, and where the API key lives.
- **Cost and abuse ceiling** on a public hosted demo — rate limiting, max tokens, max turns.

**The answer must record** the tool list with final names and parameter schemas, the system prompt
strategy, the model id, and the defined behaviour for each failure path.

## Answer

The contract is written as **code, not prose** — schemas that the implementation compiles against.
Committed as `4b48ada`. `/claude-api` was consulted first, per the map's Notes, and it corrected two
things memory would have got wrong.

### The tool set — eight tools

| Tool | Wraps | Why the model reaches for it |
|---|---|---|
| `find_entity` | `resolveEntity` | Turns a plain-language name into an id. Called first, always. |
| `trace_beneficial_owners` | `beneficialOwners` | "who really owns X", "who is behind X" |
| `find_hidden_link` | `hiddenLink` | "are these two related", "how is X connected to Y" |
| `find_ownership_cycles` | `ownershipCycles` | "circular ownership", "does this own itself" |
| `list_watchlist_control` | `watchlistControl` | "who is sanctioned", "what do they control" |
| `unmask_nominee` | `nomineeUnmasking` | "who is this nominee acting for" |
| `find_shared_registration` | `sharedRegistration` | "who else uses this address or agent" |
| `expand_neighbours` | `neighbourhood` | explore outward when nothing more specific fits |

One tool per signature query, plus the two primitives. **Entity resolution is its own tool**, not
fuzzy matching hidden inside each query — so an ambiguous name produces a question to the user rather
than a silently wrong pick.

### How the no-concatenation rule is enforced

The model never emits Cypher. It selects a tool name and fills typed parameters; the API runs a
hand-written parameterised query. `apps/api/src/graph/graph.port.ts` is the **only** surface the chat
can reach, so it is not merely discouraged from touching arbitrary Cypher — it has no path to it.
That port is also why the tools are testable without a live database.

### Model and request shape

- **`claude-opus-5`**, adaptive thinking (`{ type: 'adaptive' }`), `output_config.effort: 'low'`.
  Low effort is right here: the work is picking among eight tools and writing two or three sentences
  about the result, and it directly buys back demo latency. One line to raise if answers disappoint.
- **Streaming**, via the SDK Tool Runner — `betaZodTool` from `@anthropic-ai/sdk/helpers/beta/zod`
  plus `client.beta.messages.toolRunner`. Verified present in the installed SDK before being designed
  around. The Zod schemas already in `packages/shared/src/queries.ts` become the tool JSON Schema
  directly, so parameters have exactly one definition across API, chat and UI.
- **`max_tokens` 2048** — a deliberate cost cap, not a lowball. Answers are two to three sentences;
  the ceiling exists so a runaway turn cannot become a runaway bill.
- **Prompt caching**: render order is tools → system → messages, so the tool list and system prompt
  are kept byte-stable and cached, and only the conversation varies.

### The conversation

`chatRequestSchema` carries up to 20 prior turns, so "now show me who owns *that*" resolves. Events
stream as a discriminated union (`chatEventSchema`): `tool_call` → `tool_result` → `text_delta`* →
`done`. **The chart repaints on `tool_result`, before narration begins** — the graph payload rides the
event straight to the browser while the tool returns only a one-line summary to Claude. That is what
hides the ~1s query behind visible progress.

### Failure paths — all defined

| Case | Behaviour |
|---|---|
| No tool matches | Claude declines in one sentence and names what it *can* answer; a `suggestions` event carries the six preset questions, turning a dead end into navigation. |
| Ambiguous name | `find_entity` returns ranked matches and the model asks which was meant, rather than choosing. |
| Zero rows | Reported as a finding, not an error — an empty owner list means the structure never reaches a person. |
| Database unreachable mid-turn | `error` event with `kind: 'database_unreachable'`. Distinct from the pre-request case, which ticket 09 owns. |
| Budget exhausted | `error` with `kind: 'budget_exhausted'`; `/chat/status` reports `available: false` so the UI degrades to the preset questions and the graph stays fully usable. |
| Rate limited | `error` with `kind: 'rate_limited'`. |

### Abuse ceiling for the public demo

The demo runs on a real key and must stay live until Wexa have reviewed it, so: per-IP rate limit,
**max 6 tool turns** per question, capped `max_tokens`, and a **daily token budget**. When the budget
is spent the chat disables itself with an honest message and the six preset questions keep working —
the graph never appears broken, which matters more than the chat being always-on.

### Two things `/claude-api` corrected

1. **`budget_tokens` is gone.** Adaptive thinking plus `output_config.effort` replaces it, and sending
   `budget_tokens` to Opus 5 is a 400. Working from memory would have produced a broken request.
2. **The SDK ships a Tool Runner.** A hand-written `while (stop_reason === 'tool_use')` loop was the
   obvious design; `betaZodTool` + `toolRunner` removes it entirely and validates arguments against
   the Zod schema before the tool runs.

### One supply-chain note

`@anthropic-ai/sdk` is pinned to **0.118.0**, not the latest 0.120.0. pnpm 11's `minimumReleaseAge`
guard holds 0.120.0 back as too recently published; installing it explicitly silently wrote a
`minimumReleaseAgeExclude` bypass into `pnpm-workspace.yaml`. Nothing in 0.120.0 is needed, so the
bypass was removed and the guard left intact. Worth knowing, because the bypass is easy to add by
accident and easy to miss in review.

**Status: resolved.** No design decisions remain on the map.

## Amendment — model changed to Claude Haiku 4.5

The model decision above (`claude-opus-5`, adaptive thinking, effort `low`) is **superseded**: the
user asked for the cheapest model. Now **`claude-haiku-4-5`** at $1/$5 per million tokens, against
Opus 5's $5/$25 — a 5× reduction, and the work is choosing among eight tools and writing three
sentences, which does not need a frontier model.

A DeepSeek switch was explored first and reversed. Worth recording, because the finding stands if it
ever comes up again: DeepSeek exposes an **Anthropic-compatible endpoint** at
`https://api.deepseek.com/anthropic` (models `deepseek-v4-pro` / `deepseek-v4-flash`) which supports
streaming and tool use, so the same SDK and the same tool definitions would work. It does **not**
support `cache_control`, `anthropic-beta` headers, images, or MCP tools. Two SDK facts made it
viable: `beta.messages.create` posts to `/v1/messages?beta=true` — the same path with a query
param — and the `anthropic-beta` header is only sent when `betas` is passed, which this code does
not do. The plumbing was removed rather than left in place for a reversed decision.

### The trap this exposed

**Model capabilities are not uniform, and the failure is a 400 on every request, not a degradation.**
Adaptive thinking and `output_config.effort` arrived with the 4.6 generation; `effort` is *rejected*
by Haiku 4.5 and Sonnet 4.5. Swapping the model string alone would have broken the chat completely —
and since the live path has never run, it would have been discovered during the recording.

`modelFeatures()` in `chat.service.ts` gates both parameters on the model. Verified across eight
model ids: Haiku 4.5, Sonnet 4.5 and Opus 4.5 correctly get neither; Opus 5, Sonnet 5, Opus 4.6/4.8
and Fable 5 correctly get both.

`cache_control` on the system block is kept. It matters *more* on a cheap model, not less: the system
prompt and tool list are most of the input tokens on every turn.

### Cost ceiling

The 300,000-token daily budget is now worth at most ~$1.50/day if every token were output, and
realistically well under a dollar. `ANTHROPIC_MODEL` overrides the model in one env var.

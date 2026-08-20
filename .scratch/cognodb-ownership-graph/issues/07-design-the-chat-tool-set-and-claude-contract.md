# Design the chat tool set and Claude contract

Type: grilling
Status: claimed
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

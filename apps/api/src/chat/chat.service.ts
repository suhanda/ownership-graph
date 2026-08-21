import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import {
  toolNameSchema,
  type ChatEvent,
  type ChatRequest,
  type ChatStatus,
} from '@ownership/shared';
import { loadEnv } from '../config/env';
import { GraphService } from '../graph/graph.service';
import { BudgetService } from './budget.service';
import { buildTools, PRESET_QUESTIONS, SYSTEM_PROMPT } from './tools';

/**
 * Request features vary by model generation, and getting this wrong is a 400 on every call rather
 * than a graceful degradation. Adaptive thinking and `output_config.effort` arrived with the 4.6
 * generation; `effort` is rejected by Haiku 4.5 and Sonnet 4.5 specifically.
 */
function modelFeatures(model: string): { adaptiveThinking: boolean; effort: boolean } {
  const modern = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6)|fable-5|mythos-5)/.test(model);
  return { adaptiveThinking: modern, effort: modern };
}

/**
 * Prefixes the question with what is currently drawn, so the model can reason about the screen the
 * user is looking at. Kept compact — it is re-sent on every turn.
 */
function withCanvas(request: ChatRequest): string {
  const canvas = request.canvas;
  if (!canvas || canvas.nodes.length === 0) return request.message;
  const shown = canvas.nodes
    .map((n) => `${n.label} [${n.kind}${n.watchlisted ? ', sanctioned' : ''}] id=${n.id}`)
    .join('; ');
  const more =
    canvas.totalNodes > canvas.nodes.length
      ? ` (+${canvas.totalNodes - canvas.nodes.length} more)`
      : '';
  return [
    `<canvas title="${canvas.title}">`,
    `${shown}${more}`,
    '</canvas>',
    '',
    request.message,
  ].join('\n');
}

/** Ticket 07: bounded so a single question cannot become an unbounded agent loop. */
const MAX_TOOL_ITERATIONS = 6;
const MAX_TOKENS = 2048;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly graph: GraphService,
    private readonly budget: BudgetService,
  ) {
    const env = loadEnv();
    this.model = env.ANTHROPIC_MODEL;

    // Two ways in, and they differ in more than a URL. Anthropic authenticates with `x-api-key`;
    // gateways that re-expose the Messages API — OpenRouter's "Anthropic Skin", for instance —
    // authenticate with `Authorization: Bearer`, which is the SDK's `authToken` option and not
    // `apiKey`. Passing a key to the wrong option sends the wrong header and fails as a bare 401.
    const gateway = env.LLM_BASE_URL;
    const token = env.LLM_AUTH_TOKEN ?? env.ANTHROPIC_API_KEY;

    // An absent credential is a supported state, not a crash: the graph is the product, the chat is
    // a layer on top of it, and the UI degrades to the preset questions.
    this.client = token
      ? gateway
        ? new Anthropic({ baseURL: gateway, authToken: token })
        : new Anthropic({ apiKey: token })
      : null;

    if (!token) {
      this.logger.warn('No LLM credential set — chat is disabled, graph is unaffected');
    } else {
      this.logger.log(`Chat using ${this.model} via ${gateway ?? 'Anthropic'}`);
    }
  }

  status(): ChatStatus {
    if (!this.client)
      return { available: false, reason: 'not_configured', presetQuestions: PRESET_QUESTIONS };
    if (this.budget.budgetExhausted())
      return { available: false, reason: 'budget_exhausted', presetQuestions: PRESET_QUESTIONS };
    return { available: true, reason: 'ok', presetQuestions: PRESET_QUESTIONS };
  }

  /**
   * Runs one turn and pushes events as they happen. `emit` writes straight to the SSE response, so a
   * tool result reaches the browser — and repaints the chart — before narration has begun.
   */
  async run(
    request: ChatRequest,
    clientKey: string,
    emit: (event: ChatEvent) => void,
  ): Promise<void> {
    if (!this.client) {
      emit({
        type: 'error',
        kind: 'internal',
        message: 'The chat is not configured on this deployment.',
      });
      emit({ type: 'suggestions', questions: PRESET_QUESTIONS });
      return emit({ type: 'done', stopReason: null });
    }
    if (this.budget.rateLimited(clientKey)) {
      emit({
        type: 'error',
        kind: 'rate_limited',
        message: 'Too many questions at once. Give it a moment.',
      });
      return emit({ type: 'done', stopReason: null });
    }
    if (this.budget.budgetExhausted()) {
      emit({
        type: 'error',
        kind: 'budget_exhausted',
        message: 'The chat has used its budget for today. The questions on the left still work.',
      });
      emit({ type: 'suggestions', questions: PRESET_QUESTIONS });
      return emit({ type: 'done', stopReason: null });
    }

    let toolCalls = 0;
    const tools = buildTools(this.graph, (event) => {
      if (event.type === 'tool_result') toolCalls += 1;
      emit(event);
    });

    const features = modelFeatures(this.model);

    const runner = this.client.beta.messages.toolRunner({
      model: this.model,
      max_tokens: MAX_TOKENS,
      // Both are 4.6-and-later features, and `effort` is rejected outright by Haiku 4.5 — sending
      // them unconditionally would 400 every request on the default model.
      ...(features.adaptiveThinking ? { thinking: { type: 'adaptive' as const } } : {}),
      ...(features.effort ? { output_config: { effort: 'low' as const } } : {}),
      // The system prompt and tool list are byte-stable, so only the conversation varies and the
      // prefix caches. Worth more on a cheap model, not less: it is most of the input tokens.
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [
        ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
        // Canvas state goes here, not in the system prompt: the system block is cache_control'd
        // and byte-stable, and injecting something that changes every turn would invalidate the
        // prefix cache on every request.
        { role: 'user' as const, content: withCanvas(request) },
      ],
      tools,
      max_iterations: MAX_TOOL_ITERATIONS,
      stream: true,
    });

    try {
      for await (const stream of runner) {
        stream.on('contentBlock', (block) => {
          if (block.type !== 'tool_use') return;
          // Validate rather than cast: the transcript should never claim a tool that isn't ours.
          const name = toolNameSchema.safeParse(block.name);
          if (!name.success) return;
          emit({
            type: 'tool_call',
            name: name.data,
            args: (block.input ?? {}) as Record<string, unknown>,
          });
        });
        stream.on('text', (delta) => emit({ type: 'text_delta', text: delta }));
        await stream.done();
      }

      const final = await runner.done();
      this.budget.record(final.usage.input_tokens, final.usage.output_tokens);

      // Nothing was looked up, so the model answered from the prompt alone — which for this app means
      // it declined. Offer the questions it can answer rather than leaving a dead end.
      if (toolCalls === 0) emit({ type: 'suggestions', questions: PRESET_QUESTIONS });

      emit({ type: 'done', stopReason: final.stop_reason });
    } catch (error) {
      this.logger.error('chat turn failed', error instanceof Error ? error.stack : String(error));
      const kind =
        error instanceof Anthropic.RateLimitError
          ? 'rate_limited'
          : (error as { code?: string } | null)?.code === 'ServiceUnavailable'
            ? 'database_unreachable'
            : 'internal';
      emit({
        type: 'error',
        kind,
        message:
          kind === 'database_unreachable'
            ? 'Lost the database part-way through answering. The result may be incomplete.'
            : kind === 'rate_limited'
              ? 'The model is rate limited right now. Try again shortly.'
              : 'Something went wrong answering that.',
      });
      emit({ type: 'done', stopReason: null });
    }
  }
}

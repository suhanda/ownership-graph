import { z } from 'zod';

/**
 * Every secret and connection detail is read from the environment and validated here, at the edge.
 * Nothing in this file may ever hold a default that is a real credential.
 */
const envSchema = z.object({
  COGNODB_URI: z.string().min(1, 'COGNODB_URI is required (bolt+s://...)'),
  COGNODB_USER: z.string().min(1).default('cognodb'),
  COGNODB_PASSWORD: z.string().min(1, 'COGNODB_PASSWORD is required'),
  /** Direct Anthropic. Sent as `x-api-key`. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /**
   * Point the Anthropic SDK at a gateway that speaks the Messages API.
   * OpenRouter's "Anthropic Skin": https://openrouter.ai/api
   */
  LLM_BASE_URL: z.string().url().optional(),
  /**
   * Bearer token for that gateway — an OpenRouter key starts `sk-or-`. Gateways authenticate with
   * `Authorization: Bearer`, not `x-api-key`, which is a different SDK option entirely.
   */
  LLM_AUTH_TOKEN: z.string().optional(),
  /**
   * Shared secret the web app's server sends on every call. Optional: unset means no check, so
   * local development needs no ceremony. Set in production, where the browser never talks to this
   * API directly — the Next proxy does, and it holds the secret server-side.
   */
  API_SHARED_SECRET: z.string().optional(),
  /**
   * Claude Haiku 4.5 by default — the cheapest current model at $1/$5 per million tokens, against
   * Opus 5 at $5/$25. The work here is picking one of eight tools and writing three sentences about
   * the result, which does not need a frontier model.
   *
   * Changing this is one env var, but note that model capabilities differ: see CHAT_MODEL_FEATURES
   * in chat.service.ts. Adaptive thinking and output_config.effort are 4.6-and-later features and
   * `effort` is rejected outright by Haiku 4.5.
   */
  ANTHROPIC_MODEL: z.string().min(1).default('claude-haiku-4-5'),
  PORT: z.coerce.number().int().positive().default(3101),
  /**
   * Comma-separated allowed origins. A browser always sends `Origin` with a scheme, and the CORS
   * middleware compares by exact string — so a bare hostname silently blocks every request with no
   * error anywhere on the server. Easy to paste in from a dashboard, so it is normalised here
   * rather than trusted.
   */
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => (/^https?:\/\//.test(origin) ? origin : `https://${origin}`))
        .map((origin) => origin.replace(/\/+$/, '')),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }
  return parsed.data;
}

import { z } from 'zod';

/**
 * Every secret and connection detail is read from the environment and validated here, at the edge.
 * Nothing in this file may ever hold a default that is a real credential.
 */
const envSchema = z.object({
  COGNODB_URI: z.string().min(1, 'COGNODB_URI is required (bolt+s://...)'),
  COGNODB_USER: z.string().min(1).default('cognodb'),
  COGNODB_PASSWORD: z.string().min(1, 'COGNODB_PASSWORD is required'),
  ANTHROPIC_API_KEY: z.string().optional(),
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
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
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

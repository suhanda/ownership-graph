import { z } from 'zod';

/**
 * The three honest states, and no more. Ticket 01 measured that a bad hostname, a refused
 * connection and a network timeout produce a byte-identical `ServiceUnavailable` from the driver —
 * so the API cannot tell the user *why* the database is unreachable, and must not pretend to.
 *
 * `no results` is deliberately absent: an empty result is a finding, not an error, and is returned
 * as 200 with an empty array.
 */
export const apiErrorKindSchema = z.enum([
  /** 503 — the database cannot be reached. Cause is genuinely unknowable from the driver. */
  'database_unreachable',
  /** 500 — credentials or URI are wrong. An operator problem, not the caller's. */
  'database_misconfigured',
  /** 500 — the query reached the database and failed there. */
  'query_failed',
  /** 400 — the request did not satisfy its schema. */
  'invalid_request',
  /** 404 — the id resolved to nothing. */
  'not_found',
]);
export type ApiErrorKind = z.infer<typeof apiErrorKindSchema>;

export const apiErrorSchema = z.object({
  kind: apiErrorKindSchema,
  /** Written for the person reading it, not for a log. */
  message: z.string(),
  /** Present when retrying could plausibly succeed; seconds. */
  retryAfter: z.number().int().positive().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const API_ERROR_STATUS: Record<ApiErrorKind, number> = {
  database_unreachable: 503,
  database_misconfigured: 500,
  query_failed: 500,
  invalid_request: 400,
  not_found: 404,
};

/** Copy lives here so the API and the UI cannot drift into telling different stories. */
export const API_ERROR_MESSAGE: Record<ApiErrorKind, string> = {
  database_unreachable:
    'The database is unreachable. The instance may be paused, or the connection details may be wrong — the driver reports these identically, so we cannot tell you which.',
  database_misconfigured:
    'The database rejected our credentials. This is a configuration problem on our side, not something you can fix.',
  query_failed: 'The database could not complete that query.',
  invalid_request: 'That request was not valid.',
  not_found: 'No entity with that id exists in this graph.',
};

/**
 * Normalises a base URL pasted from a dashboard.
 *
 * A trailing slash is invisible in a settings field and produces `https://host//graph/links`, which
 * the API answers with a bare 404 — surfacing in the UI as "Something went wrong" with no hint that
 * the cause is a configuration character. Kept in its own module because it is needed both by the
 * server-only proxy and by the isomorphic api client, and the proxy imports `next/headers`.
 */
export function normaliseBaseUrl(value: string | undefined, fallback: string): string {
  return (value && value.trim() ? value.trim() : fallback).replace(/\/+$/, '');
}

import neo4j from 'neo4j-driver';

/**
 * Converts driver values into plain JSON. Neo4j `Integer` is a {low, high} pair and `Date`/`DateTime`
 * are structured objects — either will serialise into nonsense if allowed to reach `res.json()`.
 * Everything crossing the HTTP boundary passes through here first.
 */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (neo4j.isInt(value)) {
    const asInt = value as unknown as {
      inSafeRange(): boolean;
      toNumber(): number;
      toString(): string;
    };
    return asInt.inSafeRange() ? asInt.toNumber() : asInt.toString();
  }
  if (neo4j.isDate(value) || neo4j.isDateTime(value) || neo4j.isLocalDateTime(value)) {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]),
    );
  }
  return value;
}

export function toPlainRecord(value: unknown): Record<string, unknown> {
  return toPlain(value) as Record<string, unknown>;
}

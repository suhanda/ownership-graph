/**
 * A signed session cookie for the shared-password gate.
 *
 * Uses Web Crypto rather than node:crypto because the page proxy runs on the Edge runtime, where
 * node:crypto is unavailable. The same helpers then work in route handlers too.
 */
const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The cookie is `issuedAt.signature`, so a stolen value expires rather than lasting forever. */
export async function signSession(secret: string, ttlHours = 12): Promise<string> {
  const expires = Date.now() + ttlHours * 3_600_000;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    encoder.encode(String(expires)),
  );
  return `${expires}.${toHex(signature)}`;
}

export async function verifySession(secret: string, value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expires, signature] = value.split('.');
  if (!expires || !signature) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(expires));
  // Constant-time compare: a byte-by-byte early return leaks the signature one character at a time.
  const a = toHex(expected);
  if (a.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = 'ownership_session';

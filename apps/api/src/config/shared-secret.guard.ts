import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { loadEnv } from './env';

/**
 * Requires a shared secret on data routes. `/health` is deliberately exempt: the platform health
 * check and the "is the database up" indicator must work without a credential.
 *
 * Unset secret means no check at all, so local development and the tests need no setup. That is a
 * deliberate trade: the protection exists in production, where the value is configured.
 */
@Injectable()
export class SharedSecretGuard implements CanActivate {
  private readonly secret = loadEnv().API_SHARED_SECRET;

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (request.path === '/health' || request.method === 'OPTIONS') return true;

    const provided = request.header('x-api-secret');
    if (!provided || !equals(provided, this.secret)) {
      throw new UnauthorizedException('Missing or invalid API credential.');
    }
    return true;
  }
}

/** Constant-time, and length-safe: timingSafeEqual throws on a length mismatch. */
function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

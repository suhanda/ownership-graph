import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import {
  API_ERROR_MESSAGE,
  API_ERROR_STATUS,
  type ApiError,
  type ApiErrorKind,
} from '@ownership/shared';
import type { Response } from 'express';

/** Thrown by the graph layer once a driver error has been classified. */
export class DatabaseError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    override readonly cause?: unknown,
  ) {
    super(API_ERROR_MESSAGE[kind]);
    this.name = 'DatabaseError';
  }
}

/**
 * Classifies a raw driver error into one of the honest states. The mapping comes from errors
 * measured against the live instance in ticket 01, not from the driver's documentation.
 */
export function classifyDriverError(error: unknown): ApiErrorKind {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'Neo.ClientError.Security.Unauthorized') return 'database_misconfigured';
  if (code === 'ServiceUnavailable' || code === 'SessionExpired') return 'database_unreachable';
  // "Server responded HTTP" arrives with code 'N/A' — a Bolt URI pointing at an HTTP port.
  if (code === 'N/A') return 'database_misconfigured';
  if (typeof code === 'string' && code.startsWith('Neo.')) return 'query_failed';
  return 'query_failed';
}

/**
 * The single place a database failure becomes an HTTP response. The stack trace goes to the log;
 * the caller gets a sentence they can act on and nothing else.
 */
@Catch(DatabaseError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(exception: DatabaseError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = API_ERROR_STATUS[exception.kind];

    // Full detail stays server-side and findable; never rendered to a user.
    this.logger.error(
      `${exception.kind}: ${String((exception.cause as Error)?.message ?? '')}`,
      (exception.cause as Error)?.stack,
    );

    const body: ApiError = {
      kind: exception.kind,
      message: API_ERROR_MESSAGE[exception.kind],
      ...(exception.kind === 'database_unreachable' ? { retryAfter: 5 } : {}),
    };
    if (body.retryAfter) response.setHeader('Retry-After', String(body.retryAfter));
    response.status(status).json(body);
  }
}

/** Kept so a stray HttpException still produces the shared error shape. */
@Catch(HttpException)
export class HttpExceptionShapeFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const kind: ApiErrorKind = status === 404 ? 'not_found' : 'invalid_request';
    const body: ApiError = { kind, message: exception.message || API_ERROR_MESSAGE[kind] };
    response.status(status).json(body);
  }
}

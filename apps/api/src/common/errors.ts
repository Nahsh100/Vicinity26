import { HttpException, HttpStatus } from '@nestjs/common';

/** Domain error with a stable machine-readable code. Rendered as { error: { code, message, details } }. */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }
}

export const NotFound = (what = 'Resource') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
export const Forbidden = (message = 'You do not have permission to do that') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const BadRequest = (message: string, code = 'BAD_REQUEST', details?: Record<string, string[]>) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const Conflict = (message: string, code = 'CONFLICT') => new AppError(HttpStatus.CONFLICT, code, message);
export const Unauthorized = (message = 'Sign in to continue', code = 'UNAUTHORIZED') =>
  new AppError(HttpStatus.UNAUTHORIZED, code, message);
export const TooMany = (message: string, code = 'TOO_MANY_REQUESTS') => new AppError(HttpStatus.TOO_MANY_REQUESTS, code, message);
export const Unprocessable = (message: string, code: string, details?: Record<string, string[]>) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const Unavailable = (message: string, code = 'UNAVAILABLE') => new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message);

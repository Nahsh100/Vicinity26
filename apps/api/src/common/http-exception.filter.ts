import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client';
import { ThrottlerException } from '@nestjs/throttler';

interface ErrorShape {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/** Renders every error as { error: { code, message, details? } } and never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json({ error: body });
  }

  private toResponse(e: unknown): { status: number; body: ErrorShape } {
    if (e instanceof ThrottlerException) {
      return { status: 429, body: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' } };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const r = e.getResponse();
      if (typeof r === 'object' && r && 'code' in r) {
        const o = r as ErrorShape;
        return { status, body: { code: o.code, message: o.message, ...(o.details ? { details: o.details } : {}) } };
      }
      const message = typeof r === 'string' ? r : ((r as { message?: string | string[] }).message ?? e.message);
      return {
        status,
        body: { code: HttpStatus[status] ?? 'ERROR', message: Array.isArray(message) ? message.join('; ') : message },
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, body: { code: 'CONFLICT', message: 'That already exists' } };
      if (e.code === 'P2025') return { status: 404, body: { code: 'NOT_FOUND', message: 'Resource not found' } };
      if (e.code === 'P2003') return { status: 400, body: { code: 'INVALID_REFERENCE', message: 'A referenced item does not exist' } };
    }
    return { status: 500, body: { code: 'INTERNAL', message: 'Something went wrong on our side' } };
  }
}

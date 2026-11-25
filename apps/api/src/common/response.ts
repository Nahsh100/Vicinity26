import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Returned by services for paginated lists; the interceptor turns it into { data, meta }. */
export class Page<T> {
  constructor(
    public readonly items: T[],
    public readonly nextCursor: string | null,
    public readonly extra: Record<string, unknown> = {},
  ) {}
}

/** Wraps every successful response as { data } (or { data, meta } for pages). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value instanceof Page) {
          return { data: value.items, meta: { nextCursor: value.nextCursor, hasMore: value.nextCursor !== null, ...value.extra } };
        }
        return { data: value ?? null };
      }),
    );
  }
}

/** Opaque cursor helpers (base64url JSON). */
export function encodeCursor(v: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(v)).toString('base64url');
}

export function decodeCursor<T>(c: string | undefined | null): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Simple (createdAt, id) keyset pagination over Prisma findMany. */
export function keyset(cursor: string | undefined, limit: number) {
  const c = decodeCursor<{ id: string }>(cursor);
  return {
    take: limit + 1,
    ...(c ? { cursor: { id: c.id }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }, R>(rows: T[], limit: number, map: (r: T) => R): Page<R> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return new Page(slice.map(map), hasMore && last ? encodeCursor({ id: last.id }) : null);
}

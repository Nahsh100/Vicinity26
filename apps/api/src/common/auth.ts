import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Forbidden, Unauthorized } from './errors';

export interface AuthUser {
  id: string;
  email: string | null;
  providerId: string | null;
  adminPermissions: Set<string>;
}

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}

const PUBLIC = 'auth:public';
const OPTIONAL = 'auth:optional';
const PERMS = 'auth:permissions';

/** No authentication needed. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Authentication used when present (e.g. to mark saved items), not required. */
export const OptionalAuth = () => SetMetadata(OPTIONAL, true);
/** Requires the signed-in user to hold every listed admin permission (checked against the database). */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMS, perms);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.ip;
});

interface CacheEntry {
  user: AuthUser | null;
  at: number;
}

/**
 * Global guard. Verifies the bearer access token, then loads the user's status, provider id and
 * admin permissions from the database (cached for 30 s) so suspensions and role changes take effect
 * quickly without trusting claims in the token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly cache = new Map<string, CacheEntry>();
  private static readonly TTL_MS = 30_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets);
    const isOptional = this.reflector.getAllAndOverride<boolean>(OPTIONAL, targets);
    const perms = this.reflector.getAllAndOverride<string[]>(PERMS, targets) ?? [];

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (!token) {
      if (isPublic || isOptional) return true;
      throw Unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (payload.typ !== 'access') throw new Error('wrong token type');
    } catch {
      if (isPublic) return true;
      throw Unauthorized('Your session has expired', 'TOKEN_EXPIRED');
    }

    const user = await this.loadUser(payload.sub);
    if (!user) {
      if (isPublic) return true;
      throw Unauthorized('Your account is not active', 'ACCOUNT_INACTIVE');
    }
    req.user = user;

    if (perms.length && !perms.every((p) => user.adminPermissions.has(p) || user.adminPermissions.has('*'))) {
      throw Forbidden('You need administrator access for this');
    }
    return true;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private async loadUser(id: string): Promise<AuthUser | null> {
    const hit = this.cache.get(id);
    if (hit && Date.now() - hit.at < AuthGuard.TTL_MS) return hit.user;

    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        provider: { select: { id: true } },
        adminRoles: { select: { role: { select: { permissions: { select: { permission: { select: { code: true } } } } } } } },
      },
    });
    const user: AuthUser | null =
      u && u.status === 'ACTIVE'
        ? {
            id: u.id,
            email: u.email,
            providerId: u.provider?.id ?? null,
            adminPermissions: new Set(u.adminRoles.flatMap((r) => r.role.permissions.map((p) => p.permission.code))),
          }
        : null;
    this.cache.set(id, { user, at: Date.now() });
    if (this.cache.size > 5000) this.cache.delete(this.cache.keys().next().value!);
    return user;
  }
}

export function requireUser(user: AuthUser | undefined): AuthUser {
  if (!user) throw Unauthorized();
  return user;
}

export function requireProvider(user: AuthUser): string {
  if (!user.providerId) throw Forbidden('Create a provider profile first');
  return user.providerId;
}

import type { CurrentUser } from '@vicinity/shared';
import type { MediaService } from '../media/media.service';

export interface UserRowForMe {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  fullName: string;
  phone: string | null;
  bio: string | null;
  locationName: string | null;
  avatarMediaId: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: Date;
  provider: { id: string } | null;
  adminRoles: { role: { code: string } }[];
}

export const meSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  passwordHash: true,
  fullName: true,
  phone: true,
  bio: true,
  locationName: true,
  avatarMediaId: true,
  status: true,
  createdAt: true,
  provider: { select: { id: true } },
  adminRoles: { select: { role: { select: { code: true } } } },
} as const;

export function toCurrentUser(u: UserRowForMe, media: MediaService): CurrentUser {
  return {
    id: u.id,
    email: u.email,
    emailVerified: !!u.emailVerifiedAt,
    phoneVerified: !!u.phoneVerifiedAt,
    hasPassword: !!u.passwordHash && u.passwordHash !== '!',
    fullName: u.fullName,
    phone: u.phone,
    bio: u.bio,
    locationName: u.locationName,
    avatarUrl: media.url(u.avatarMediaId),
    status: u.status,
    isAdmin: u.adminRoles.length > 0,
    adminRoles: u.adminRoles.map((r) => r.role.code),
    providerId: u.provider?.id ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

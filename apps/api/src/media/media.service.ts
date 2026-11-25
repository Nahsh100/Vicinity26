import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MEDIA_LIMITS, PRIVATE_MEDIA_PURPOSES, type MediaKind, type MediaPurpose, type MediaRef } from '@vicinity/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { BadRequest, Forbidden, NotFound } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStorageDriver, R2StorageDriver, type StorageDriver } from './storage';
import type { AuthUser } from '../common/auth';

export const createUploadSchema = z.object({
  kind: z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']),
  purpose: z.enum([
    'AVATAR',
    'PROVIDER_LOGO',
    'PROVIDER_COVER',
    'PROVIDER_GALLERY',
    'LISTING',
    'PORTFOLIO',
    'REVIEW',
    'CREDENTIAL',
    'ORGANIZATION_LOGO',
    'ORGANIZATION_COVER',
  ]),
  mimeType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'application/pdf': 'pdf',
};

/** Which purposes accept which media kinds. */
const PURPOSE_KINDS: Record<MediaPurpose, MediaKind[]> = {
  AVATAR: ['IMAGE'],
  PROVIDER_LOGO: ['IMAGE'],
  PROVIDER_COVER: ['IMAGE'],
  PROVIDER_GALLERY: ['IMAGE', 'VIDEO'],
  LISTING: ['IMAGE', 'VIDEO'],
  PORTFOLIO: ['IMAGE', 'VIDEO'],
  REVIEW: ['IMAGE'],
  CREDENTIAL: ['DOCUMENT', 'IMAGE'],
  ORGANIZATION_LOGO: ['IMAGE'],
  ORGANIZATION_COVER: ['IMAGE'],
};

type MediaRow = {
  id: string;
  kind: MediaKind;
  storageKey: string;
  isPrivate: boolean;
  width: number | null;
  height: number | null;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger('Media');
  readonly driver: StorageDriver;

  constructor(private readonly prisma: PrismaService) {
    const e = env();
    this.driver = e.STORAGE_DRIVER === 'r2' ? new R2StorageDriver(e) : new LocalStorageDriver(e);
  }

  /** Stable URL for a media item. Bytes are served (or redirected) by GET /media/:id/raw, which enforces privacy. */
  url(id: string | null | undefined): string | null {
    return id ? `${env().API_PUBLIC_URL}/api/v1/media/${id}/raw` : null;
  }

  ref(m: MediaRow): MediaRef {
    return { id: m.id, kind: m.kind, url: this.url(m.id)!, thumbnailUrl: null, width: m.width, height: m.height };
  }

  async createUpload(user: AuthUser, input: z.infer<typeof createUploadSchema>) {
    const limits = MEDIA_LIMITS[input.kind];
    if (!limits.mimeTypes.includes(input.mimeType)) {
      throw BadRequest(`That file type is not allowed for ${input.kind.toLowerCase()} uploads`, 'UNSUPPORTED_MEDIA_TYPE');
    }
    if (input.sizeBytes > limits.maxBytes) {
      throw BadRequest(`File is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB)`, 'FILE_TOO_LARGE');
    }
    if (!PURPOSE_KINDS[input.purpose].includes(input.kind)) {
      throw BadRequest(`A ${input.kind.toLowerCase()} cannot be used as ${input.purpose.toLowerCase()}`, 'INVALID_PURPOSE');
    }
    const pendingCount = await this.prisma.media.count({
      where: { ownerId: user.id, status: 'PENDING', createdAt: { gt: new Date(Date.now() - 3600_000) } },
    });
    if (pendingCount > 50) throw BadRequest('Too many unfinished uploads. Try again later.', 'TOO_MANY_PENDING');

    const isPrivate = PRIVATE_MEDIA_PURPOSES.includes(input.purpose);
    const id = randomUUID();
    const key = `${isPrivate ? 'private' : 'public'}/${input.purpose.toLowerCase()}/${user.id}/${id}.${EXT[input.mimeType] ?? 'bin'}`;

    await this.prisma.media.create({
      data: {
        id,
        ownerId: user.id,
        kind: input.kind,
        purpose: input.purpose,
        storageKey: key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        isPrivate,
      },
    });
    const upload = await this.driver.createUpload(key, input.mimeType, input.sizeBytes, id);
    return { mediaId: id, upload };
  }

  /** Local driver only: receives the bytes for a signed upload URL. */
  async receiveLocalUpload(id: string, q: { exp: string; max: string; sig: string }, body: Buffer, contentType: string) {
    if (!(this.driver instanceof LocalStorageDriver)) throw NotFound();
    const exp = Number(q.exp);
    const max = Number(q.max);
    if (!this.driver.verify(id, exp, max, q.sig ?? '')) throw Forbidden('Upload link is invalid or has expired');
    const m = await this.prisma.media.findUnique({ where: { id } });
    if (!m || m.status !== 'PENDING') throw NotFound('Upload');
    if (!Buffer.isBuffer(body) || body.length === 0) throw BadRequest('Empty upload');
    if (body.length > max) throw BadRequest('File is larger than declared', 'FILE_TOO_LARGE');
    if (contentType && contentType.split(';')[0] !== m.mimeType) throw BadRequest('Content type does not match', 'CONTENT_TYPE_MISMATCH');
    await this.driver.write(m.storageKey, body);
  }

  async complete(user: AuthUser, id: string) {
    const m = await this.prisma.media.findUnique({ where: { id } });
    if (!m || m.ownerId !== user.id) throw NotFound('Upload');
    if (m.status === 'READY') return this.ref(m);
    const obj = await this.driver.head(m.storageKey);
    if (!obj) throw BadRequest('The file has not been uploaded yet', 'UPLOAD_MISSING');
    const limits = MEDIA_LIMITS[m.kind];
    if (obj.sizeBytes > limits.maxBytes) {
      await this.driver.remove(m.storageKey);
      await this.prisma.media.update({ where: { id }, data: { status: 'DELETED' } });
      throw BadRequest('File is too large', 'FILE_TOO_LARGE');
    }
    const updated = await this.prisma.media.update({
      where: { id },
      data: { status: 'READY', sizeBytes: obj.sizeBytes },
    });
    return this.ref(updated);
  }

  /** Ensures each media id belongs to the user, is uploaded, and fits the purpose. Returns ids in order. */
  async assertUsable(userId: string, ids: string[], purposes: MediaPurpose[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const rows = await this.prisma.media.findMany({
      where: { id: { in: unique } },
      select: { id: true, ownerId: true, status: true, purpose: true },
    });
    for (const id of unique) {
      const r = rows.find((x) => x.id === id);
      if (!r || r.ownerId !== userId) throw BadRequest('One of the files could not be found', 'MEDIA_NOT_FOUND');
      if (r.status !== 'READY') throw BadRequest('One of the files has not finished uploading', 'MEDIA_NOT_READY');
      if (!purposes.includes(r.purpose)) throw BadRequest('One of the files was uploaded for a different purpose', 'MEDIA_WRONG_PURPOSE');
    }
    return unique;
  }

  /** Resolves how to serve the bytes for GET /media/:id/raw, enforcing private access. */
  async resolveRead(id: string, user: AuthUser | undefined) {
    const m = await this.prisma.media.findUnique({ where: { id } });
    if (!m || m.status !== 'READY') throw NotFound('File');
    if (m.isPrivate) {
      const allowed = user && (user.id === m.ownerId || user.adminPermissions.has('providers.verify') || user.adminPermissions.has('*'));
      if (!allowed) throw NotFound('File');
    }
    const redirect = await this.driver.directReadUrl(m.storageKey, m.isPrivate);
    if (redirect) return { redirect } as const;
    return { stream: await this.driver.openRead(m.storageKey), mimeType: m.mimeType, size: m.sizeBytes, isPrivate: m.isPrivate } as const;
  }

  /** Removes uploads that were never completed (called by the maintenance job). */
  async purgeAbandoned(olderThanHours = 24): Promise<number> {
    const stale = await this.prisma.media.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - olderThanHours * 3600_000) } },
      select: { id: true, storageKey: true },
      take: 500,
    });
    for (const s of stale) {
      await this.driver.remove(s.storageKey).catch((e) => this.logger.warn(`remove ${s.storageKey}: ${e}`));
    }
    await this.prisma.media.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    return stale.length;
  }
}

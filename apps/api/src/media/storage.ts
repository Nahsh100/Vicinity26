import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';

export interface UploadTarget {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StoredObject {
  sizeBytes: number;
  contentType?: string;
}

export interface StorageDriver {
  readonly name: 'local' | 'r2';
  createUpload(key: string, mimeType: string, sizeBytes: number, mediaId: string): Promise<UploadTarget>;
  head(key: string): Promise<StoredObject | null>;
  /** URL the client can GET directly, or null if bytes must be streamed through the API. */
  directReadUrl(key: string, isPrivate: boolean): Promise<string | null>;
  openRead(key: string): Promise<Readable>;
  remove(key: string): Promise<void>;
}

const UPLOAD_TTL_S = 15 * 60;

export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(private readonly env: Env) {
    this.root = resolve(env.STORAGE_LOCAL_DIR);
  }

  private pathFor(key: string): string {
    const p = resolve(join(this.root, key));
    if (!p.startsWith(this.root + sep)) throw new Error('Invalid storage key');
    return p;
  }

  sign(mediaId: string, exp: number, maxBytes: number): string {
    return createHmac('sha256', this.env.STORAGE_SIGNING_SECRET).update(`${mediaId}.${exp}.${maxBytes}`).digest('base64url');
  }

  verify(mediaId: string, exp: number, maxBytes: number, sig: string): boolean {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(mediaId, exp, maxBytes));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async createUpload(_key: string, mimeType: string, sizeBytes: number, mediaId: string): Promise<UploadTarget> {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_S;
    const sig = this.sign(mediaId, exp, sizeBytes);
    return {
      method: 'PUT',
      url: `${this.env.API_PUBLIC_URL}/api/v1/media/${mediaId}/upload?exp=${exp}&max=${sizeBytes}&sig=${sig}`,
      headers: { 'Content-Type': mimeType },
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  async write(key: string, data: Buffer): Promise<void> {
    const p = this.pathFor(key);
    await fs.mkdir(dirname(p), { recursive: true });
    await fs.writeFile(p, data);
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const s = await fs.stat(this.pathFor(key));
      return { sizeBytes: s.size };
    } catch {
      return null;
    }
  }

  async directReadUrl(): Promise<string | null> {
    return null;
  }

  async openRead(key: string): Promise<Readable> {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }
}

export class R2StorageDriver implements StorageDriver {
  readonly name = 'r2' as const;
  private readonly s3: S3Client;

  constructor(private readonly env: Env) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    });
  }

  async createUpload(key: string, mimeType: string, sizeBytes: number): Promise<UploadTarget> {
    const cmd = new PutObjectCommand({
      Bucket: this.env.R2_BUCKET,
      Key: key,
      ContentType: mimeType,
      ContentLength: sizeBytes,
    });
    const url = await getSignedUrl(this.s3, cmd, { expiresIn: UPLOAD_TTL_S });
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': mimeType },
      expiresAt: new Date(Date.now() + UPLOAD_TTL_S * 1000).toISOString(),
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.env.R2_BUCKET, Key: key }));
      return { sizeBytes: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch {
      return null;
    }
  }

  async directReadUrl(key: string, isPrivate: boolean): Promise<string | null> {
    if (!isPrivate && this.env.R2_PUBLIC_BASE_URL) return `${this.env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.env.R2_BUCKET, Key: key }), {
      expiresIn: isPrivate ? 300 : 3600,
    });
  }

  async openRead(key: string): Promise<Readable> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.env.R2_BUCKET, Key: key }));
    return r.Body as Readable;
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.env.R2_BUCKET, Key: key }));
  }
}

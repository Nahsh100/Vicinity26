import { randomBytes, createHash } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function slugify(s: string): string {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'item'
  );
}

export const uniqueSlug = (s: string) => `${slugify(s)}-${randomBytes(3).toString('hex')}`;

/** Prisma Decimal | null -> number | null */
export function num(v: { toNumber(): number } | number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v);
  return v.toNumber();
}

/** Rounds a coordinate to ~500 m so the public position does not reveal a home address. */
export const approximateCoord = (v: number) => Math.round(v * 200) / 200;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

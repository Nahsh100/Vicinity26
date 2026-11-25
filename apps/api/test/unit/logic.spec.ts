import { qualityScore } from '../../src/listings/listings.service';
import { findPlaces, nearestPlace, resolvePlace } from '../../src/locations/places';
import { quietHoursEnd } from '../../src/notifications/notifications.service';
import { approximateCoord, slugify } from '../../src/common/util';
import { decodeCursor, encodeCursor } from '../../src/common/response';
import { loadEnv } from '../../src/config/env';

describe('quiet hours (Africa/Lusaka, UTC+2)', () => {
  it('defers notifications inside an overnight window until it ends', () => {
    // 21:30 UTC = 23:30 Lusaka, inside 22:00–06:30.
    const end = quietHoursEnd(new Date('2026-11-24T21:30:00Z'), '22:00', '06:30');
    expect(end?.toISOString()).toBe('2026-11-25T04:30:00.000Z');
  });
  it('does nothing outside the window or when unset', () => {
    expect(quietHoursEnd(new Date('2026-11-24T10:00:00Z'), '22:00', '06:30')).toBeNull();
    expect(quietHoursEnd(new Date(), null, null)).toBeNull();
  });
});

describe('listing quality score', () => {
  it('rewards photos, description, price, keywords and location', () => {
    expect(qualityScore({ title: 'Plumbing', mediaCount: 0, priceType: 'QUOTE', keywords: [], hasLocation: false })).toBe(0);
    expect(
      qualityScore({ title: 'Emergency leak repair', description: 'x'.repeat(80), mediaCount: 3, priceType: 'FIXED', price: 100, keywords: ['a', 'b'], hasLocation: true }),
    ).toBe(100);
  });
});

describe('places gazetteer', () => {
  it('resolves neighbourhoods and towns, and labels coordinates', () => {
    expect(resolvePlace('woodlands')?.name).toBe('Woodlands');
    expect(findPlaces('kal').map((p) => p.name)).toContain('Kalingalinga');
    expect(nearestPlace(-12.96, 28.64).name).toBe('Ndola');
  });
});

describe('utilities', () => {
  it('approximates coordinates to ~500 m', () => {
    expect(approximateCoord(-15.4211)).toBe(-15.42);
    expect(Math.abs(approximateCoord(28.3333) - 28.3333)).toBeLessThan(0.003);
  });
  it('slugifies names', () => {
    expect(slugify("Grace's Hair Studio!")).toBe('grace-s-hair-studio');
  });
  it('round-trips opaque cursors and rejects garbage', () => {
    expect(decodeCursor(encodeCursor({ id: 'x', sk: 1.5 }))).toEqual({ id: 'x', sk: 1.5 });
    expect(decodeCursor('%%%')).toBeNull();
  });
  it('refuses insecure configuration', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'short', STORAGE_SIGNING_SECRET: 'x'.repeat(20) })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'x', JWT_ACCESS_SECRET: 'x'.repeat(40), STORAGE_SIGNING_SECRET: 'x'.repeat(20), STORAGE_DRIVER: 'local' }),
    ).toThrow(/development only/);
    // Restore the test configuration for any later imports.
    loadEnv();
  });
});

import { describe, expect, it } from 'vitest';
import { formatDistance, formatPrice, isOpenNow, listingSchema, normalizePhone, phoneSchema, registerSchema } from './index';

describe('phone validation', () => {
  it('normalises Zambian local numbers to E.164', () => {
    expect(normalizePhone('0971 234 567')).toBe('+260971234567');
    expect(normalizePhone('771234567')).toBe('+260771234567');
    expect(phoneSchema.parse('+260 96 123 4567')).toBe('+260961234567');
  });
  it('accepts international numbers and rejects junk', () => {
    expect(phoneSchema.safeParse('+447911123456').success).toBe(true);
    expect(phoneSchema.safeParse('0211234567').success).toBe(false);
    expect(phoneSchema.safeParse('+26012').success).toBe(false);
  });
});

describe('listing validation', () => {
  const base = {
    type: 'SERVICE' as const,
    title: 'Plumbing repairs',
    categoryId: '00000000-0000-4000-8000-000000000001',
  };
  it('requires a price for priced listings', () => {
    expect(listingSchema.safeParse({ ...base, priceType: 'FIXED' }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, priceType: 'FIXED', price: 150 }).success).toBe(true);
    expect(listingSchema.safeParse({ ...base, priceType: 'QUOTE' }).success).toBe(true);
  });
  it('requires max >= min for ranges', () => {
    expect(listingSchema.safeParse({ ...base, priceType: 'RANGE', price: 200, priceMax: 100 }).success).toBe(false);
    expect(listingSchema.safeParse({ ...base, priceType: 'RANGE', price: 100, priceMax: 200 }).success).toBe(true);
  });
  it('requires an organization and group for group visibility', () => {
    expect(
      listingSchema.safeParse({ ...base, priceType: 'QUOTE', visibility: 'GROUP', organizationId: base.categoryId })
        .success,
    ).toBe(false);
  });
});

describe('formatting', () => {
  it('formats prices by type', () => {
    expect(formatPrice({ priceType: 'STARTING_FROM', price: 1500, currency: 'ZMW' })).toBe('From ZMW 1,500');
    expect(formatPrice({ priceType: 'QUOTE', price: null, currency: 'ZMW' })).toBe('Request a quote');
    expect(formatPrice({ priceType: 'PER_UNIT', price: 95, currency: 'ZMW', unit: 'kg' })).toBe('ZMW 95 / kg');
  });
  it('formats distance', () => {
    expect(formatDistance(420)).toBe('400 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(null)).toBeNull();
  });
  it('detects opening hours in Lusaka time', () => {
    // 2026-11-24 is a Tuesday; 08:00 UTC is 10:00 in Lusaka.
    const now = new Date('2026-11-24T08:00:00Z');
    expect(isOpenNow([{ day: 2, open: '08:00', close: '17:00' }], now)).toBe(true);
    expect(isOpenNow([{ day: 2, open: '11:00', close: '17:00' }], now)).toBe(false);
  });
  it('validates registration', () => {
    expect(registerSchema.safeParse({ fullName: 'Ada', email: 'a@b.co', password: 'short' }).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { notificationTarget } from './notificationRoutes';

const href = (data: Record<string, string>) => notificationTarget(data)?.href ?? null;

describe('notificationTarget (push taps and Alerts buttons)', () => {
  it('opens the specific screen for each notification type', () => {
    expect(href({ type: 'booking', bookingId: 'b1' })).toBe('/booking/b1');
    expect(href({ type: 'message', conversationId: 'c1' })).toBe('/messages/c1');
    expect(href({ type: 'enquiry', enquiryId: 'e1' })).toBe('/dashboard/enquiries');
    expect(href({ type: 'review', reviewId: 'r1', providerId: 'p1' })).toBe('/dashboard/reviews');
    expect(href({ type: 'review_response', reviewId: 'r1', providerId: 'p1' })).toBe('/provider/p1');
    expect(href({ type: 'listing', listingId: 'l1', providerId: 'p1' })).toBe('/listing/l1');
    expect(href({ type: 'listing_moderation', listingId: 'l1' })).toBe('/dashboard/listing/l1');
    expect(href({ type: 'invitation', code: 'abc', organizationId: 'o1' })).toBe('/invite/abc');
    expect(href({ type: 'verification', status: 'VERIFIED' })).toBe('/dashboard');
    expect(href({ type: 'provider_status' })).toBe('/dashboard');
    expect(href({ type: 'payment', id: 'pay1' })).toBe('/dashboard/plan');
    expect(href({ type: 'org_member_joined', organizationId: 'o1' })).toBe('/organizations/o1');
  });

  it('falls back to a list when an id is missing', () => {
    expect(href({ type: 'booking' })).toBe('/bookings');
    expect(href({ type: 'message' })).toBe('/messages');
    expect(href({ type: 'listing_moderation' })).toBe('/dashboard/listings');
  });

  it('broadcasts open only in-app paths', () => {
    expect(notificationTarget({ type: 'broadcast', link: '/dashboard/plan', linkLabel: 'See plans' })).toMatchObject({ href: '/dashboard/plan', label: 'See plans' });
    expect(href({ type: 'broadcast' })).toBeNull();
    expect(href({ type: 'broadcast', link: 'https://evil.example' })).toBeNull();
    // Protocol-relative URLs (//host) are other websites, not app paths.
    expect(href({ type: 'broadcast', link: '//evil.example/x' })).toBeNull();
  });

  it('returns null for unknown types (the tap opens the Alerts list)', () => {
    expect(href({ type: 'something-new' })).toBeNull();
    expect(notificationTarget(undefined)).toBeNull();
  });
});

import type { Href } from 'expo-router';

/** In-app paths an admin broadcast may link to: app routes only, never external URLs. */
/** In-app paths only: starts with a single "/" (a "//host" link would be another website). */
export const SAFE_APP_PATH = /^\/(?!\/)[A-Za-z0-9/_\-.?=&%]*$/;

export interface NotificationTarget {
  href: Href;
  /** Button label on the Alerts screen. */
  label: string;
  icon?: string;
  /** Emphasised (dark) button, used for replies. */
  dark?: boolean;
}

/**
 * Where a notification leads, from its `data` (set by the API). Used both when a push
 * notification is tapped and by the buttons on the Alerts screen, so they always agree.
 * Returns null only when there is genuinely nothing more specific than the Alerts list.
 */
export function notificationTarget(data: Record<string, unknown> | null | undefined): NotificationTarget | null {
  const d = (data ?? {}) as Record<string, string | undefined>;
  switch (d.type) {
    case 'booking':
      return d.bookingId ? { href: `/booking/${d.bookingId}`, label: 'View Details', icon: 'arrow_forward' } : { href: '/bookings', label: 'My bookings' };
    case 'message':
      return d.conversationId ? { href: `/messages/${d.conversationId}`, label: 'Reply', icon: 'reply', dark: true } : { href: '/messages', label: 'Messages' };
    case 'enquiry':
      return { href: '/dashboard/enquiries', label: 'Open enquiries', icon: 'arrow_forward' };
    case 'review':
      return { href: '/dashboard/reviews', label: 'See review' };
    case 'review_response':
      return d.providerId ? { href: `/provider/${d.providerId}`, label: 'View' } : null;
    case 'listing':
      return d.listingId ? { href: `/listing/${d.listingId}`, label: 'View' } : null;
    case 'listing_moderation':
      return d.listingId ? { href: `/dashboard/listing/${d.listingId}`, label: 'Open listing' } : { href: '/dashboard/listings', label: 'My listings' };
    case 'invitation':
      return d.code ? { href: `/invite/${d.code}`, label: 'View invitation' } : null;
    case 'verification':
    case 'provider_status':
      return { href: '/dashboard', label: 'Open dashboard' };
    case 'payment':
      return { href: '/dashboard/plan', label: 'Plan & billing' };
    case 'org_member_joined':
      return d.organizationId ? { href: `/organizations/${d.organizationId}`, label: 'View' } : null;
    case 'broadcast':
      return d.link && SAFE_APP_PATH.test(d.link) ? { href: d.link as Href, label: d.linkLabel || 'Open' } : null;
    default:
      return d.organizationId ? { href: `/organizations/${d.organizationId}`, label: 'View' } : null;
  }
}

export const ListingType = { SERVICE: 'SERVICE', PRODUCT: 'PRODUCT' } as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];

export const ListingStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
  REMOVED: 'REMOVED',
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export const PriceType = {
  FIXED: 'FIXED',
  STARTING_FROM: 'STARTING_FROM',
  RANGE: 'RANGE',
  HOURLY: 'HOURLY',
  PER_UNIT: 'PER_UNIT',
  NEGOTIABLE: 'NEGOTIABLE',
  QUOTE: 'QUOTE',
} as const;
export type PriceType = (typeof PriceType)[keyof typeof PriceType];

export const Visibility = { PUBLIC: 'PUBLIC', ORGANIZATION: 'ORGANIZATION', GROUP: 'GROUP' } as const;
export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const ProviderType = { INDIVIDUAL: 'INDIVIDUAL', BUSINESS: 'BUSINESS' } as const;
export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

export const VerificationStatus = {
  UNVERIFIED: 'UNVERIFIED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

export const ServiceMode = { AT_LOCATION: 'AT_LOCATION', MOBILE: 'MOBILE', BOTH: 'BOTH' } as const;
export type ServiceMode = (typeof ServiceMode)[keyof typeof ServiceMode];

export const OrgRole = { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER' } as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const GroupRole = { ADMIN: 'ADMIN', MEMBER: 'MEMBER' } as const;
export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

export const ContactChannel = { PHONE: 'PHONE', WHATSAPP: 'WHATSAPP', EMAIL: 'EMAIL', ENQUIRY: 'ENQUIRY' } as const;
export type ContactChannel = (typeof ContactChannel)[keyof typeof ContactChannel];

export const NotificationCategory = {
  ACCOUNT: 'ACCOUNT',
  BOOKING: 'BOOKING',
  MESSAGE: 'MESSAGE',
  ENQUIRY: 'ENQUIRY',
  REVIEW: 'REVIEW',
  SAVED_PROVIDER: 'SAVED_PROVIDER',
  ORGANIZATION: 'ORGANIZATION',
  DISCOVERY: 'DISCOVERY',
  PROMOTION: 'PROMOTION',
  SYSTEM: 'SYSTEM',
} as const;
export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];

/** Categories a user may switch off. ACCOUNT and SYSTEM are essential and always delivered in-app. */
export const OPTIONAL_NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'BOOKING',
  'MESSAGE',
  'ENQUIRY',
  'REVIEW',
  'SAVED_PROVIDER',
  'ORGANIZATION',
  'DISCOVERY',
  'PROMOTION',
];

export const SearchSort = {
  RELEVANCE: 'relevance',
  DISTANCE: 'distance',
  RATING: 'rating',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  NEWEST: 'newest',
} as const;
export type SearchSort = (typeof SearchSort)[keyof typeof SearchSort];

export const RADIUS_OPTIONS_KM = [1, 2, 5, 10, 20, 50] as const;

export const MediaKind = { IMAGE: 'IMAGE', VIDEO: 'VIDEO', DOCUMENT: 'DOCUMENT' } as const;
export type MediaKind = (typeof MediaKind)[keyof typeof MediaKind];

export const MediaPurpose = {
  AVATAR: 'AVATAR',
  PROVIDER_LOGO: 'PROVIDER_LOGO',
  PROVIDER_COVER: 'PROVIDER_COVER',
  PROVIDER_GALLERY: 'PROVIDER_GALLERY',
  LISTING: 'LISTING',
  PORTFOLIO: 'PORTFOLIO',
  REVIEW: 'REVIEW',
  CREDENTIAL: 'CREDENTIAL',
  ORGANIZATION_LOGO: 'ORGANIZATION_LOGO',
  ORGANIZATION_COVER: 'ORGANIZATION_COVER',
} as const;
export type MediaPurpose = (typeof MediaPurpose)[keyof typeof MediaPurpose];

/** Private purposes are never served from a public URL. */
export const PRIVATE_MEDIA_PURPOSES: MediaPurpose[] = ['CREDENTIAL'];

export const MEDIA_LIMITS: Record<MediaKind, { maxBytes: number; mimeTypes: string[] }> = {
  IMAGE: { maxBytes: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
  VIDEO: { maxBytes: 60 * 1024 * 1024, mimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'] },
  DOCUMENT: { maxBytes: 15 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] },
};

export const ReportTarget = {
  REVIEW: 'REVIEW',
  PROVIDER: 'PROVIDER',
  LISTING: 'LISTING',
  ORGANIZATION: 'ORGANIZATION',
  USER: 'USER',
} as const;
export type ReportTarget = (typeof ReportTarget)[keyof typeof ReportTarget];

export const ReportReason = ['SPAM', 'FAKE', 'OFFENSIVE', 'FRAUD', 'INAPPROPRIATE', 'OTHER'] as const;
export type ReportReason = (typeof ReportReason)[number];

export const OrganizationType = [
  'CHURCH',
  'COMPANY',
  'SCHOOL',
  'CLUB',
  'ASSOCIATION',
  'NEIGHBOURHOOD',
  'COMMUNITY',
  'OTHER',
] as const;
export type OrganizationType = (typeof OrganizationType)[number];

export const StockStatus = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'MADE_TO_ORDER'] as const;
export type StockStatus = (typeof StockStatus)[number];

export const BookingStatus = ['REQUESTED', 'RESCHEDULE_PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED'] as const;
export type BookingStatus = (typeof BookingStatus)[number];

export const BookingLocation = ['AT_PROVIDER', 'AT_CUSTOMER'] as const;
export type BookingLocation = (typeof BookingLocation)[number];

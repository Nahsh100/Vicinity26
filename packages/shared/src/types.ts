import type {
  ContactChannel,
  GroupRole,
  ListingStatus,
  ListingType,
  MediaKind,
  NotificationCategory,
  OrganizationType,
  OrgRole,
  PriceType,
  ProviderType,
  ServiceMode,
  VerificationStatus,
  Visibility,
} from './enums';
import type { WorkingHours } from './schemas';

/** Every successful API response body. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: PageMeta;
}

export interface PageMeta {
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
}

export interface CurrentUser {
  id: string;
  /** Null for accounts created with phone sign-in until an email is added. */
  email: string | null;
  emailVerified: boolean;
  /** True when the phone number was confirmed by SMS code (enables phone sign-in). */
  phoneVerified: boolean;
  /** False for phone sign-in accounts that never set a password. */
  hasPassword: boolean;
  fullName: string;
  phone: string | null;
  bio: string | null;
  locationName: string | null;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  isAdmin: boolean;
  adminRoles: string[];
  providerId: string | null;
  createdAt: string;
}

export interface MediaRef {
  id: string;
  kind: MediaKind;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
}

export interface Category extends CategorySummary {
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  listingCount?: number;
  children?: Category[];
  aliases?: string[];
}

export interface PublicLocation {
  id: string;
  label: string;
  area: string;
  city: string;
  /** Exact only when the provider chose to show it; otherwise rounded to ~500 m. */
  lat: number;
  lng: number;
  isApproximate: boolean;
  addressLine: string | null;
  isPrimary: boolean;
}

export interface ProviderSummary {
  id: string;
  slug: string;
  displayName: string;
  type: ProviderType;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verificationStatus: VerificationStatus;
  ratingAverage: number;
  ratingCount: number;
  area: string | null;
  city: string | null;
  distanceMeters: number | null;
  phone: string | null;
  whatsapp: string | null;
  primaryCategory: CategorySummary | null;
  startingPrice: number | null;
  currency: string;
  isSaved?: boolean;
}

export interface ProviderDetail extends ProviderSummary {
  bio: string | null;
  email: string | null;
  website: string | null;
  socialLinks: Record<string, string>;
  serviceMode: ServiceMode;
  serviceRadiusKm: number | null;
  workingHours: WorkingHours;
  languages: string[];
  locations: PublicLocation[];
  serviceAreas: { id: string; name: string; radiusKm: number }[];
  completedProjects: number;
  joinedAt: string;
  isOwner: boolean;
  sections: {
    services: number;
    products: number;
    portfolio: number;
    reviews: number;
  };
}

export interface ListingSummary {
  id: string;
  type: ListingType;
  title: string;
  description: string | null;
  priceType: PriceType;
  price: number | null;
  priceMax: number | null;
  currency: string;
  unit: string | null;
  status: ListingStatus;
  visibility: Visibility;
  isAvailable: boolean;
  coverUrl: string | null;
  category: CategorySummary;
  provider: Pick<
    ProviderSummary,
    'id' | 'slug' | 'displayName' | 'logoUrl' | 'verificationStatus' | 'ratingAverage' | 'ratingCount' | 'phone' | 'whatsapp'
  > & { serviceMode: ServiceMode };
  area: string | null;
  city: string | null;
  distanceMeters: number | null;
  /** Public (approximate unless the provider chose exact) position, for map pins. */
  position: { lat: number; lng: number } | null;
  isSponsored: boolean;
  isSaved?: boolean;
  createdAt: string;
}

export interface ListingDetail extends ListingSummary {
  keywords: string[];
  media: MediaRef[];
  durationMinutes: number | null;
  stockStatus: string | null;
  pickupAvailable: boolean | null;
  deliveryAvailable: boolean | null;
  deliveryRadiusKm: number | null;
  organization: { id: string; name: string } | null;
  group: { id: string; name: string } | null;
  location: PublicLocation | null;
  updatedAt: string;
}

export interface SearchParams {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  area?: string;
  categoryId?: string;
  listingType?: ListingType;
  minPrice?: number;
  maxPrice?: number;
  organizationId?: string;
  groupId?: string;
  minRating?: number;
  verified?: boolean;
  availableOnly?: boolean;
  providerType?: ProviderType;
  sort?: 'relevance' | 'distance' | 'rating' | 'price_asc' | 'price_desc' | 'newest';
  cursor?: string;
  limit?: number;
}

export interface SearchMeta extends PageMeta {
  appliedRadiusKm: number | null;
  origin: { lat: number; lng: number; label: string | null } | null;
  /** Paid placements matching the same filters, shown separately and labelled "Sponsored" (first page only). */
  sponsored: ListingSummary[];
  /** Categories whose names/aliases matched the text query (e.g. "nail tech" -> Nail Care). */
  matchedCategories: CategorySummary[];
}

export interface SearchResult {
  items: ListingSummary[];
  meta: SearchMeta;
}

export interface PortfolioProject {
  id: string;
  title: string;
  description: string | null;
  locationName: string | null;
  durationText: string | null;
  price: number | null;
  currency: string;
  completedAt: string | null;
  media: MediaRef[];
  createdAt: string;
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  author: { id: string; fullName: string; avatarUrl: string | null };
  listing: { id: string; title: string } | null;
  media: MediaRef[];
  isVerifiedInteraction: boolean;
  response: { body: string; createdAt: string } | null;
  createdAt: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data: Record<string, string>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}

export interface Organization {
  id: string;
  slug: string;
  name: string;
  type: OrganizationType;
  description: string | null;
  isPrivate: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  locationName: string | null;
  memberCount: number;
  groupCount: number;
  myRole: OrgRole | null;
  createdAt: string;
}

export interface Group {
  id: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  isPrivate: boolean;
  memberCount: number;
  myRole: GroupRole | null;
  createdAt: string;
}

export interface Member {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  role: OrgRole | GroupRole;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  code: string;
  organization: { id: string; name: string };
  group: { id: string; name: string } | null;
  email: string | null;
  role: OrgRole;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
}

export interface Enquiry {
  id: string;
  message: string;
  contactPhone: string | null;
  listing: { id: string; title: string } | null;
  customer: { id: string; fullName: string; avatarUrl: string | null };
  status: 'NEW' | 'READ' | 'ARCHIVED';
  createdAt: string;
}

export interface ProviderAnalytics {
  range: { from: string; to: string };
  totals: Record<
    'profileViews' | 'listingViews' | 'searchAppearances' | 'phoneClicks' | 'whatsappClicks' | 'enquiries' | 'favorites' | 'reviews',
    number
  >;
  daily: Array<{
    date: string;
    profileViews: number;
    listingViews: number;
    searchAppearances: number;
    contactClicks: number;
    enquiries: number;
  }>;
}

export interface ContactEventInput {
  channel: ContactChannel;
  listingId?: string | null;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  priceMonthly: number;
  currency: string;
  entitlements: Record<string, number | boolean>;
  isActive: boolean;
}


export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | 'CANCELLED' | 'EXPIRED';

/** A plan purchase paid by mobile money. Status only changes from verified gateway events. */
export interface PaymentSummary {
  id: string;
  purpose: 'SUBSCRIPTION' | 'PROMOTION';
  status: PaymentStatus;
  amount: number;
  currency: string;
  gateway: string;
  /** True when the dev/test simulator handled it: no real money moved. */
  simulated: boolean;
  plan: { code: string; name: string } | null;
  months: number | null;
  /** Masked, e.g. "096•••4567". */
  payerPhone: string | null;
  failureReason: string | null;
  createdAt: string;
  succeededAt: string | null;
  expiresAt: string | null;
}

export interface MySubscription {
  plan: { code: string; name: string };
  status: string | null;
  currentPeriodEnd: string | null;
  entitlements: Record<string, number | boolean>;
  paymentsAvailable: boolean;
  /** Payment in flight, if any (one at a time per provider). */
  pendingPayment: PaymentSummary | null;
}
export interface BookingParty {
  id: string;
  name: string;
  avatarUrl: string | null;
  phone: string | null;
}

export interface Booking {
  id: string;
  status: import('./enums').BookingStatus;
  scheduledAt: string;
  durationMinutes: number;
  location: import('./enums').BookingLocation;
  /** Only returned to the two parties. */
  address: string | null;
  note: string | null;
  quotedPrice: number | null;
  currency: string;
  proposedScheduledAt: string | null;
  proposedByMe: boolean;
  statusReason: string | null;
  listing: { id: string; title: string; priceType: import('./enums').PriceType; price: number | null } | null;
  provider: BookingParty & { slug: string; verified: boolean; ratingAverage: number; ratingCount: number; area: string | null; whatsapp: string | null };
  customer: BookingParty;
  /** Which side the viewer is on. */
  myRole: 'CUSTOMER' | 'PROVIDER';
  conversationId: string | null;
  canReview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeSlot {
  start: string;
  available: boolean;
}

export interface ConversationSummary {
  id: string;
  myRole: 'CUSTOMER' | 'PROVIDER';
  counterpart: { id: string; name: string; avatarUrl: string | null; verified: boolean; providerSlug: string | null; phone: string | null };
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
  activeBooking: { id: string; title: string; scheduledAt: string; status: import('./enums').BookingStatus } | null;
}

export interface ChatMessage {
  id: string;
  kind: 'TEXT' | 'IMAGE' | 'SYSTEM';
  body: string;
  media: MediaRef | null;
  bookingId: string | null;
  mine: boolean;
  senderName: string | null;
  createdAt: string;
}

export interface PublicStats {
  providers: number;
  verifiedProviders: number;
  listings: number;
  categories: number;
  averageRating: number | null;
  reviews: number;
}

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  MySubscription,
  PaymentSummary,
  AppNotification,
  Booking,
  ConversationSummary,
  PublicStats,
  TimeSlot,
  Category,
  CategorySummary,
  ContactChannel,
  Enquiry,
  Group,
  Invitation,
  ListingDetail,
  ListingSummary,
  Member,
  NotificationPreferences,
  Organization,
  PortfolioProject,
  ProviderAnalytics,
  ProviderDetail,
  ProviderSummary,
  RatingSummary,
  Review,
  SearchMeta,
  SubscriptionPlan,
} from '@vicinity/shared';
import { api, cleanParams } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { useSearch } from '@/store/search';

const signedIn = () => useAuth.getState().status === 'signedIn';

// ───────── discovery ─────────

export interface HomeData {
  origin: { lat: number; lng: number; label: string } | null;
  categories: Category[];
  topRated: ProviderSummary[];
  nearby: ProviderSummary[];
  popular: ListingSummary[];
  featured: ListingSummary[];
  newListings: ListingSummary[];
}

export function useHome() {
  const loc = useLocation((s) => s.location);
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['home', loc?.lat, loc?.lng, status],
    queryFn: () => api.get<HomeData>('/discover/home', cleanParams({ lat: loc?.lat, lng: loc?.lng })),
  });
}

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 10 * 60_000 });
}

export function useCategory(idOrSlug: string | undefined) {
  return useQuery({ queryKey: ['category', idOrSlug], queryFn: () => api.get<Category>(`/categories/${idOrSlug}`), enabled: !!idOrSlug });
}

export function useSuggest(q: string) {
  return useQuery({
    queryKey: ['suggest', q],
    queryFn: () =>
      api.get<{ categories: (CategorySummary & { matched: string })[]; listings: string[]; providers: { id: string; slug: string; displayName: string }[] }>(
        '/search/suggest',
        { q },
      ),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
}

export function useRecentSearches() {
  const status = useAuth((s) => s.status);
  return useQuery({ queryKey: ['recent-searches'], queryFn: () => api.get<string[]>('/users/me/recent-searches'), enabled: status === 'signedIn' });
}

/** Runs the search with the current query, filters, location and radius from the stores. */
export function useSearchResults(enabled = true) {
  const { query, filters } = useSearch();
  const { location, radiusKm } = useLocation();
  const { categoryName: _c, organizationName: _o, groupName: _g, ...apiFilters } = filters;
  const params = cleanParams({ q: query.trim() || undefined, lat: location?.lat, lng: location?.lng, radiusKm: location ? radiusKm : undefined, ...apiFilters, limit: 20 });
  return useInfiniteQuery({
    queryKey: ['search', params],
    queryFn: ({ pageParam }) => api.page<ListingSummary>('/search', { ...params, cursor: pageParam }) as unknown as Promise<{ items: ListingSummary[]; meta: SearchMeta }>,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled,
  });
}

// ───────── providers & listings ─────────

export function useProvider(idOrSlug: string | undefined) {
  const loc = useLocation((s) => s.location);
  return useQuery({
    queryKey: ['provider', idOrSlug],
    queryFn: () => api.get<ProviderDetail>(`/providers/${idOrSlug}`, cleanParams({ lat: loc?.lat, lng: loc?.lng })),
    enabled: !!idOrSlug,
  });
}

export function useProviderListings(providerId: string | undefined, type?: 'SERVICE' | 'PRODUCT') {
  return useQuery({
    queryKey: ['provider-listings', providerId, type],
    queryFn: () => api.page<ListingSummary>(`/providers/${providerId}/listings`, cleanParams({ type, limit: 50 })).then((r) => r.items),
    enabled: !!providerId,
  });
}

export function usePortfolio(providerId: string | undefined) {
  return useQuery({ queryKey: ['portfolio', providerId], queryFn: () => api.get<PortfolioProject[]>(`/providers/${providerId}/portfolio`), enabled: !!providerId });
}

export function useGallery(providerId: string | undefined) {
  return useQuery({
    queryKey: ['gallery', providerId],
    queryFn: () => api.get<(import('@vicinity/shared').MediaRef & { caption: string | null })[]>(`/providers/${providerId}/gallery`),
    enabled: !!providerId,
  });
}

export function useCredentials(providerId: string | undefined) {
  return useQuery({
    queryKey: ['credentials', providerId],
    queryFn: () => api.get<{ id: string; title: string; issuer: string | null; issuedAt: string | null }[]>(`/providers/${providerId}/credentials`),
    enabled: !!providerId,
  });
}

export function useListing(id: string | undefined) {
  const loc = useLocation((s) => s.location);
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => api.get<ListingDetail>(`/listings/${id}`, cleanParams({ lat: loc?.lat, lng: loc?.lng })),
    enabled: !!id,
  });
}

// ───────── reviews ─────────

export function useReviews(providerId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['reviews', providerId],
    queryFn: ({ pageParam }) => api.page<Review>(`/providers/${providerId}/reviews`, cleanParams({ cursor: pageParam, limit: 10 })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: !!providerId,
  });
}

export function useRatingSummary(providerId: string | undefined) {
  return useQuery({ queryKey: ['rating-summary', providerId], queryFn: () => api.get<RatingSummary>(`/providers/${providerId}/reviews/summary`), enabled: !!providerId });
}

export function useMyReview(providerId: string | undefined) {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['my-review', providerId],
    queryFn: () => api.get<Review | null>(`/providers/${providerId}/reviews/mine`),
    enabled: !!providerId && status === 'signedIn',
  });
}

// ───────── engagement ─────────

export function useSavedProviders() {
  const status = useAuth((s) => s.status);
  const loc = useLocation((s) => s.location);
  return useQuery({
    queryKey: ['saved-providers'],
    queryFn: () => api.get<(ProviderSummary & { notify: boolean })[]>('/favorites/providers', cleanParams({ lat: loc?.lat, lng: loc?.lng })),
    enabled: status === 'signedIn',
  });
}

export function useSavedListings() {
  const status = useAuth((s) => s.status);
  return useQuery({ queryKey: ['saved-listings'], queryFn: () => api.get<ListingSummary[]>('/favorites/listings'), enabled: status === 'signedIn' });
}

export function useToggleSaveProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, save }: { id: string; save: boolean }) => (save ? api.put(`/favorites/providers/${id}`, { notify: true }) : api.del(`/favorites/providers/${id}`)),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['saved-providers'] });
      void qc.invalidateQueries({ queryKey: ['provider', v.id] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useToggleSaveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, save }: { id: string; save: boolean }) => (save ? api.put(`/favorites/listings/${id}`) : api.del(`/favorites/listings/${id}`)),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['saved-listings'] });
      void qc.invalidateQueries({ queryKey: ['listing', v.id] });
      void qc.invalidateQueries({ queryKey: ['search'] });
    },
  });
}

/** Records contact intent; never blocks opening the dialer/WhatsApp. */
export function recordContact(providerId: string, channel: ContactChannel, listingId?: string) {
  void api.post(`/providers/${providerId}/contact`, { channel, listingId: listingId ?? null }).catch(() => undefined);
}

// ───────── notifications ─────────

export function useNotifications() {
  const status = useAuth((s) => s.status);
  return useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.page<AppNotification>('/notifications', cleanParams({ cursor: pageParam, limit: 20 })),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    enabled: status === 'signedIn',
  });
}

export function useUnreadCount() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['unread-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    enabled: status === 'signedIn',
    refetchInterval: 60_000,
  });
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: ['notification-prefs'], queryFn: () => api.get<NotificationPreferences>('/notifications/preferences'), enabled: signedIn() });
}

// ───────── provider (own) ─────────

export interface MyProvider {
  id: string;
  slug: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  displayName: string;
  tagline: string | null;
  bio: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  serviceMode: 'AT_LOCATION' | 'MOBILE' | 'BOTH';
  serviceRadiusKm: number | null;
  languages: string[];
  logoMediaId: string | null;
  coverMediaId: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'SUSPENDED';
  onboardingStep: number;
  verificationStatus: string;
  ratingAverage: number;
  ratingCount: number;
  publishedAt: string | null;
  workingHours: { day: number; open: string; close: string }[];
  locations: (import('@vicinity/shared').PublicLocation & { exactLat: number; exactLng: number; showExactLocation: boolean })[];
  serviceAreas: { id: string; name: string; radiusKm: number; lat: number; lng: number }[];
  gallery: (import('@vicinity/shared').MediaRef & { caption: string | null })[];
  credentials: { id: string; title: string; issuer: string | null; issuedAt: string | null; isPublic: boolean; hasDocument: boolean }[];
  counts: { listings: number; portfolio: number; reviews: number };
  checklist: Record<'details' | 'photo' | 'description' | 'location' | 'listing' | 'portfolio' | 'contact', boolean>;
  canPublish: boolean;
}

export function useMyProvider() {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({ queryKey: ['my-provider'], queryFn: () => api.get<MyProvider>('/providers/me'), enabled: !!providerId });
}

export function useMyListings(status?: string) {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({
    queryKey: ['my-listings', status],
    queryFn: () => api.page<ListingSummary>('/listings/mine', cleanParams({ status, limit: 50 })).then((r) => r.items),
    enabled: !!providerId,
  });
}

export function useMyPortfolio() {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({ queryKey: ['my-portfolio'], queryFn: () => api.get<PortfolioProject[]>('/providers/me/portfolio'), enabled: !!providerId });
}

export function useAnalytics(days = 30) {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({ queryKey: ['analytics', days], queryFn: () => api.get<ProviderAnalytics>('/providers/me/analytics', { days }), enabled: !!providerId });
}

export function useEnquiries(status?: 'NEW' | 'READ' | 'ARCHIVED') {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({
    queryKey: ['enquiries', status],
    queryFn: () => api.page<Enquiry>('/enquiries/received', cleanParams({ status, limit: 50 })).then((r) => r.items),
    enabled: !!providerId,
  });
}

export function useSubscription() {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<MySubscription>('/subscriptions/me'),
    enabled: !!providerId,
  });
}

export function usePlans() {
  return useQuery({ queryKey: ['plans'], queryFn: () => api.get<SubscriptionPlan[]>('/subscriptions/plans') });
}

// ───────── organizations ─────────

export function useOrganizations(params: { q?: string; mine?: boolean }) {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['organizations', params, status],
    queryFn: () => api.page<Organization>('/organizations', cleanParams({ ...params, mine: params.mine ? 'true' : undefined, limit: 50 })).then((r) => r.items),
    enabled: !params.mine || status === 'signedIn',
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({ queryKey: ['organization', id], queryFn: () => api.get<Organization>(`/organizations/${id}`), enabled: !!id });
}

export function useOrgGroups(orgId: string | undefined) {
  return useQuery({ queryKey: ['org-groups', orgId], queryFn: () => api.get<Group[]>(`/organizations/${orgId}/groups`), enabled: !!orgId });
}

export function useOrgMembers(orgId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['org-members', orgId],
    queryFn: () => api.page<Member>(`/organizations/${orgId}/members`, { limit: 50 }).then((r) => r.items),
    enabled: !!orgId && enabled,
  });
}

export function useOrgInvitations(orgId: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['org-invitations', orgId], queryFn: () => api.get<Invitation[]>(`/organizations/${orgId}/invitations`), enabled: !!orgId && enabled });
}

export function useGroup(id: string | undefined) {
  return useQuery({ queryKey: ['group', id], queryFn: () => api.get<Group>(`/groups/${id}`), enabled: !!id });
}

export function useGroupMembers(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['group-members', id],
    queryFn: () => api.page<Member>(`/groups/${id}/members`, { limit: 50 }).then((r) => r.items),
    enabled: !!id && enabled,
  });
}

export function useMyGroups() {
  const status = useAuth((s) => s.status);
  return useQuery({ queryKey: ['my-groups'], queryFn: () => api.get<Group[]>('/groups/mine'), enabled: status === 'signedIn' });
}

export function useMyInvitations() {
  const status = useAuth((s) => s.status);
  return useQuery({ queryKey: ['my-invitations'], queryFn: () => api.get<Invitation[]>('/organizations/invitations/mine'), enabled: status === 'signedIn' });
}

// --------- bookings ---------

export function useBookings(role: 'customer' | 'provider', scope: 'upcoming' | 'past') {
  const user = useAuth((s) => s.user);
  return useQuery({
    queryKey: ['bookings', role, scope],
    queryFn: () => api.page<Booking>('/bookings', { role, scope, limit: 50 }) as Promise<{ items: Booking[]; meta: { counts?: { upcoming: number; past: number } } }>,
    enabled: !!user && (role === 'customer' || !!user.providerId),
    refetchInterval: 30_000,
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({ queryKey: ['booking', id], queryFn: () => api.get<Booking>(`/bookings/${id}`), enabled: !!id });
}

export function useSlots(providerId: string | undefined, date: string, listingId?: string | null) {
  return useQuery({
    queryKey: ['slots', providerId, date, listingId],
    queryFn: () => api.get<{ date: string; durationMinutes: number; slots: TimeSlot[] }>(`/providers/${providerId}/slots`, cleanParams({ date, listingId: listingId ?? undefined })),
    enabled: !!providerId && !!date,
  });
}

// --------- messaging ---------

export function useConversations(filter: 'all' | 'unread' | 'bookings' = 'all') {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['conversations', filter],
    queryFn: () => api.page<ConversationSummary>('/conversations', { filter, limit: 50 }).then((r) => r.items),
    enabled: status === 'signedIn',
    refetchInterval: 15_000,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({ queryKey: ['conversation', id], queryFn: () => api.get<ConversationSummary>(`/conversations/${id}`), enabled: !!id, refetchInterval: 30_000 });
}

export function useUnreadMessages() {
  const status = useAuth((s) => s.status);
  return useQuery({
    queryKey: ['unread-messages'],
    queryFn: () => api.get<{ count: number }>('/conversations/unread-count'),
    enabled: status === 'signedIn',
    refetchInterval: 20_000,
  });
}

export function usePublicStats() {
  return useQuery({ queryKey: ['public-stats'], queryFn: () => api.get<PublicStats>('/discover/stats'), staleTime: 5 * 60_000 });
}

// ───────── payments ─────────

export function useMyPayments() {
  const providerId = useAuth((s) => s.user?.providerId);
  return useQuery({ queryKey: ['payments'], queryFn: () => api.get<PaymentSummary[]>('/payments/mine'), enabled: !!providerId });
}

/** Polls a payment every 3 s while it waits for the payer's USSD approval. */
export function usePayment(id: string | null) {
  return useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.get<PaymentSummary>(`/payments/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' || !q.state.data ? 3000 : false),
  });
}

/** Sign-in methods offered by the API (phone sign-in only when PHONE_OTP_AUTH is on). */
export function useAuthMethods() {
  return useQuery({ queryKey: ['auth-methods'], queryFn: () => api.get<{ email: boolean; phone: boolean }>('/auth/methods'), staleTime: 5 * 60_000 });
}

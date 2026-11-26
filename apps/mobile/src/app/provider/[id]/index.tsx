import { shareLink, webLink } from '@/lib/share';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  dayName,
  formatDistance,
  formatPrice,
  isOpenNow,
  timeAgo,
  type ListingSummary,
  type PortfolioProject,
  type ProviderDetail,
} from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { BookingPanel, BookingSheet } from '@/components/BookingPanel';
import { callProvider } from '@/components/ContactActions';
import { EnquirySheet } from '@/components/EnquirySheet';
import { NearbyMap } from '@/components/NearbyMap';
import { ReportSheet } from '@/components/ReportSheet';
import { ReviewCard } from '@/components/ReviewCard';
import { BackButton, useWide } from '@/components/Screen';
import { Badge, Button, EmptyState, ErrorState, Icon, IconButton, ListSkeleton, Sheet, Skeleton, Thumb, Txt } from '@/components/ui';
import { WebFooter } from '@/components/WebFooter';
import { useCredentials, useGallery, usePortfolio, useProvider, useProviderListings, useRatingSummary, useReviews, useToggleSaveProvider } from '@/hooks/api';
import { openChat } from '@/lib/chat';
import { useAuth } from '@/store/auth';

type Tab = 'services' | 'products' | 'portfolio' | 'reviews' | 'location';

function useProviderData(id: string | undefined) {
  const q = useProvider(id);
  const p = q.data;
  return {
    q,
    p,
    services: useProviderListings(p?.id, 'SERVICE'),
    products: useProviderListings(p?.id, 'PRODUCT'),
    portfolio: usePortfolio(p?.id),
    gallery: useGallery(p?.id),
    credentials: useCredentials(p?.id),
    reviews: useReviews(p?.id),
    summary: useRatingSummary(p?.id),
  };
}
type Data = ReturnType<typeof useProviderData>;

function groupHours(hours: { day: number; open: string; close: string }[]) {
  const byRange = new Map<string, number[]>();
  for (const h of hours) byRange.set(`${h.open}–${h.close}`, [...(byRange.get(`${h.open}–${h.close}`) ?? []), h.day]);
  return [...byRange.entries()].map(([range, days]) => ({
    range,
    days: days.length > 2 && days[days.length - 1]! - days[0]! === days.length - 1 ? `${dayName(days[0]!)}–${dayName(days[days.length - 1]!)}` : days.map(dayName).join(', '),
  }));
}

function todayHours(p: ProviderDetail) {
  const dow = new Date(Date.now() + 2 * 3600_000).getUTCDay();
  const h = p.workingHours.find((x) => x.day === dow);
  return h ? `${h.open} – ${h.close}` : null;
}

/** Provider storefront (Stitch "Provider Details" + "Web Provider Profile & Booking"). */
export default function ProviderProfile() {
  const { id, book } = useLocalSearchParams<{ id: string; book?: string }>();
  const wide = useWide();
  const data = useProviderData(id);
  const { q, p } = data;
  const [report, setReport] = useState(false);

  if (q.isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <View className="w-full max-w-3xl gap-3 self-center p-margin">
          <Skeleton className="h-48 w-full rounded-panel" />
          <ListSkeleton rows={3} />
        </View>
      </SafeAreaView>
    );
  }
  if (q.isError || !p) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }
  return (
    <>
      {wide ? <WebProvider data={data} p={p} onReport={() => setReport(true)} /> : <MobileProvider data={data} p={p} onReport={() => setReport(true)} openBooking={book === '1'} />}
      <ReportSheet visible={report} onClose={() => setReport(false)} targetType="PROVIDER" targetId={p.id} />
    </>
  );
}

function share(p: ProviderDetail) {
  void shareLink({ title: p.displayName, text: `${p.displayName} on Vicinity:`, url: webLink(`/provider/${p.slug}`) });
}

// ───────────────────────────── Mobile ─────────────────────────────

function MobileProvider({ data, p, onReport, openBooking }: { data: Data; p: ProviderDetail; onReport: () => void; openBooking: boolean }) {
  const save = useToggleSaveProvider();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const initialTab = useLocalSearchParams<{ tab?: string }>().tab;
  const [tab, setTab] = useState<Tab>(initialTab === 'products' ? 'products' : 'services');
  const [booking, setBooking] = useState<{ open: boolean; listingId?: string | null }>({ open: openBooking });
  const [enquiry, setEnquiry] = useState(false);
  const [project, setProject] = useState<PortfolioProject | null>(null);
  const open = isOpenNow(p.workingHours);
  const primary = p.locations[0];
  // Owners see their own storefront as customers do, minus the booking actions (the API refuses self-bookings).
  const canBook = p.sections.services > 0 && !p.isOwner;
  const tabs = useTabs(p, data);
  const activeTab = tabs.find((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'reviews');
  const toggleSave = () => (signedIn ? save.mutate({ id: p.id, save: !p.isSaved }) : router.push('/login'));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="flex-row items-center justify-between bg-white/80 px-margin py-2">
        <BackButton />
        <View className="flex-row gap-2">
          <IconButton icon="share" label="Share provider profile" onPress={() => share(p)} />
          <IconButton icon="favorite" active={p.isSaved} label={p.isSaved ? 'Remove from saved' : 'Save provider'} onPress={toggleSave} />
          <IconButton icon="flag" label="Report provider" onPress={onReport} />
        </View>
      </View>

      <ScrollView contentContainerClassName="w-full max-w-2xl self-center gap-4 px-margin pb-44 pt-1">
        {p.coverUrl ? <Image source={{ uri: p.coverUrl }} style={{ width: '100%', height: 150, borderRadius: 28 }} contentFit="cover" accessibilityLabel="Cover photo" /> : null}

        <View className="gap-4 rounded-panel bg-white p-4 shadow-card">
          <View className="flex-row items-start gap-3">
            <View>
              <Thumb uri={p.logoUrl} name={p.displayName} icon={p.primaryCategory?.icon} size={80} rounded="rounded-full" ring />
              {p.verificationStatus === 'VERIFIED' ? (
                <View className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full bg-primary shadow-soft" accessibilityLabel="Verified">
                  <Icon name="verified" size={14} color="#FFFFFF" fill />
                </View>
              ) : null}
            </View>
            <View className="min-w-0 flex-1">
              <Txt variant="headline-md" accessibilityRole="header" numberOfLines={2}>{p.displayName}</Txt>
              {p.tagline ? <Txt variant="body-md" numberOfLines={1} className="mt-0.5 text-on-surface-variant">{p.tagline}</Txt> : null}
              <View className="mt-1.5 flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
                {p.ratingCount ? (
                  <View className="flex-row items-center gap-0.5">
                    <Icon name="star" size={16} color={colors.amber} fill />
                    <Txt variant="label-md">{p.ratingAverage.toFixed(1)}</Txt>
                    <Txt variant="label-md" className="font-sans text-on-surface-variant">({p.ratingCount})</Txt>
                  </View>
                ) : (
                  <Txt variant="label-md" className="text-on-surface-variant">New on Vicinity</Txt>
                )}
                {primary ? (
                  <>
                    <Txt variant="body-sm" className="text-outline-variant">•</Txt>
                    <View className="flex-row items-center gap-0.5">
                      <Icon name="location_on" size={14} color={colors.primaryDark} />
                      <Txt variant="body-sm" className="text-on-surface-variant">{[formatDistance(p.distanceMeters), `(${primary.area})`].filter(Boolean).join(' ')}</Txt>
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5">
            {p.verificationStatus === 'VERIFIED' ? <TrustPill icon="verified_user" label="Verified Pro" tone="blue" /> : null}
            {p.ratingCount >= 3 && p.ratingAverage >= 4.7 ? <TrustPill icon="workspace_premium" label="Top Rated" tone="mint" /> : null}
            {p.languages.length ? <TrustPill icon="translate" label={p.languages.join(' & ')} /> : null}
            {p.serviceMode !== 'AT_LOCATION' ? <TrustPill icon="commute" label={p.serviceRadiusKm ? `Travels ${p.serviceRadiusKm} km` : 'Home visits'} /> : null}
            <TrustPill icon={p.type === 'BUSINESS' ? 'store' : 'person'} label={p.type === 'BUSINESS' ? 'Business' : 'Independent'} />
            {p.completedProjects ? <TrustPill icon="task_alt" label={`${p.completedProjects} projects`} /> : null}
          </ScrollView>

          <View className="flex-row items-center gap-2 pt-1">
            {canBook ? (
              <Button title="Book Appointment" icon="calendar_add_on" className="flex-1" onPress={() => setBooking({ open: true })} />
            ) : (
              p.isOwner ? (
                <Button title="Edit storefront" icon="edit" className="flex-1" onPress={() => router.push('/dashboard/profile')} />
              ) : (
                <Button title="Send enquiry" icon="forum" className="flex-1" onPress={() => setEnquiry(true)} />
              )
            )}
            {p.phone ? <IconButton icon="call" tone="neutral" size={44} label={`Call ${p.displayName}`} onPress={() => callProvider(p.id, p.phone!)} /> : null}
            {!p.isOwner ? <IconButton icon="chat" tone="tertiary" size={44} label={`Message ${p.displayName}`} onPress={() => void openChat(p.id)} /> : null}
          </View>
        </View>

        {p.workingHours.length ? (
          <View className="flex-row items-center justify-between gap-2 rounded-2xl bg-surface-container-low p-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
              <View className={`h-2.5 w-2.5 rounded-full ${open ? 'bg-tertiary-container' : 'bg-outline-variant'}`} />
              <View className="min-w-0 flex-1">
                <Txt variant="label-md">{open ? `Open now · ${todayHours(p)}` : todayHours(p) ? `Closed now · today ${todayHours(p)}` : 'Closed today'}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>
                  {p.serviceMode === 'MOBILE' ? `Comes to you${p.serviceRadiusKm ? ` (within ${p.serviceRadiusKm} km)` : ''}` : p.serviceMode === 'BOTH' ? `In-studio or home visit${p.serviceRadiusKm ? ` (within ${p.serviceRadiusKm} km)` : ''}` : `At ${primary?.area ?? 'their location'}`}
                </Txt>
              </View>
            </View>
            {canBook ? (
              <Pressable onPress={() => setBooking({ open: true })} className="rounded-full bg-white px-3 py-1.5 shadow-soft">
                <Txt variant="label-sm" className="text-primary-dark">View Slots</Txt>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 rounded-full bg-surface-container-low p-1">
          {tabs.map((t) => (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: activeTab === t.key }} onPress={() => setTab(t.key)} className={`min-w-[92px] items-center rounded-full px-3 py-2 ${activeTab === t.key ? 'bg-white shadow-card' : ''}`}>
              <Txt variant="label-md" className={activeTab === t.key ? 'text-on-surface' : 'text-on-surface-variant'}>{t.label}</Txt>
            </Pressable>
          ))}
        </ScrollView>

        {activeTab === 'services' || activeTab === 'products' ? (
          <OffersSection items={(activeTab === 'services' ? data.services : data.products).data ?? []} loading={(activeTab === 'services' ? data.services : data.products).isLoading} kind={activeTab} owner={p.isOwner} onSelect={(l) => (l.type === 'SERVICE' && !p.isOwner ? setBooking({ open: true, listingId: l.id }) : router.push(`/listing/${l.id}`))} />
        ) : null}
        {activeTab === 'portfolio' ? <PortfolioSection data={data} onOpen={setProject} /> : null}
        {activeTab === 'reviews' ? <ReviewsSection data={data} p={p} /> : null}
        {activeTab === 'location' ? <LocationSection data={data} p={p} /> : null}

        <View className="flex-row items-center gap-3 rounded-panel bg-secondary-container/30 p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-primary shadow-soft"><Icon name="shield" size={24} color="#FFFFFF" /></View>
          <View className="flex-1">
            <Txt variant="headline-sm">Book with confidence</Txt>
            <Txt variant="body-sm" className="text-on-surface-variant">Reviews come from real customers, and you can report anything that seems wrong. Agree prices before work starts.</Txt>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 bg-white/95 px-margin pb-2 pt-3 shadow-up">
        <SafeAreaView edges={['bottom']} className="w-full max-w-2xl flex-row items-center justify-between gap-2 self-center">
          <View>
            <Txt variant="label-sm" className="font-semibold text-on-surface-variant">{p.startingPrice != null ? 'Starting from' : 'Prices'}</Txt>
            <View className="flex-row items-baseline gap-1">
              <Txt variant="headline-md" className="text-primary-dark">{p.startingPrice != null ? `ZMW ${p.startingPrice}` : 'On request'}</Txt>
              {p.startingPrice != null ? <Txt variant="body-sm" className="text-on-surface-variant">/ service</Txt> : null}
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            {!p.isOwner ? <IconButton icon="chat" tone="tertiary" size={44} label="Message" onPress={() => void openChat(p.id)} /> : null}
            {canBook ? (
              <Button title="Request Booking" iconRight="arrow_forward" onPress={() => setBooking({ open: true })} />
            ) : (
              p.isOwner ? (
                <Button title="My dashboard" iconRight="arrow_forward" onPress={() => router.push('/dashboard')} />
              ) : (
                <Button title="Send enquiry" iconRight="arrow_forward" onPress={() => setEnquiry(true)} />
              )
            )}
          </View>
        </SafeAreaView>
      </View>

      {booking.open ? (
        <BookingSheet visible providerId={p.id} providerName={p.displayName} serviceMode={p.serviceMode} initialListingId={booking.listingId} onClose={() => setBooking({ open: false })} />
      ) : null}
      <EnquirySheet visible={enquiry} onClose={() => setEnquiry(false)} providerId={p.id} providerName={p.displayName} />
      <ProjectSheet project={project} onClose={() => setProject(null)} />
    </SafeAreaView>
  );
}

// ───────────────────────────── Desktop web ─────────────────────────────

function WebProvider({ data, p, onReport }: { data: Data; p: ProviderDetail; onReport: () => void }) {
  const save = useToggleSaveProvider();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const initialTab = useLocalSearchParams<{ tab?: string }>().tab;
  const [tab, setTab] = useState<Tab>(initialTab === 'products' ? 'products' : 'services');
  const [selected, setSelected] = useState<string | null>(null);
  const [project, setProject] = useState<PortfolioProject | null>(null);
  const tabs = useTabs(p, data);
  const activeTab = tabs.find((t) => t.key === tab) ? tab : (tabs[0]?.key ?? 'reviews');
  const open = isOpenNow(p.workingHours);
  const primary = p.locations[0];
  const cat = p.primaryCategory;

  return (
    <View className="flex-1 bg-surface">
      <AppHeader />
      <ScrollView contentContainerClassName="pb-0">
        <View className="bg-surface-container-low/60">
          <View className="w-full max-w-[1280px] flex-row items-center justify-between self-center px-10 py-3">
            <View className="flex-row items-center gap-2">
              <Pressable onPress={() => router.push('/')} className="flex-row items-center gap-1">
                <Icon name="home" size={17} color={colors.onSurfaceVariant} />
                <Txt variant="body-md" className="text-on-surface-variant">Home</Txt>
              </Pressable>
              {cat ? (
                <>
                  <Icon name="chevron_right" size={16} color={colors.outline} />
                  <Pressable onPress={() => router.push(`/category/${cat.slug}`)}><Txt variant="body-md" className="text-on-surface-variant">{cat.name}</Txt></Pressable>
                </>
              ) : null}
              <Icon name="chevron_right" size={16} color={colors.outline} />
              <Txt variant="label-lg">{p.displayName}</Txt>
            </View>
            <View className="flex-row items-center gap-2 rounded-full bg-white px-4 py-1.5 shadow-soft">
              <View className={`h-2 w-2 rounded-full ${open ? 'bg-primary-dark' : 'bg-outline-variant'}`} />
              <Txt variant="label-md" className={open ? 'text-primary-dark' : 'text-on-surface-variant'}>{open ? 'Open now' : 'Closed now'}</Txt>
              {todayHours(p) ? <><Txt variant="body-sm" className="text-outline">•</Txt><Txt variant="label-md" className="text-on-surface-variant">Today {todayHours(p)}</Txt></> : null}
            </View>
          </View>
        </View>

        <View className="w-full max-w-[1280px] flex-row items-start gap-8 self-center px-10 pt-8">
          <View className="flex-[1.9] gap-8">
            <View className="gap-6 overflow-hidden rounded-[32px] bg-gradient-to-br from-white via-white to-[#E6F8F5] p-8 shadow-card">
              <View className="flex-row gap-7">
                <View>
                  <Thumb uri={p.logoUrl ?? p.coverUrl} name={p.displayName} icon={cat?.icon} size={128} rounded="rounded-3xl" />
                  {p.verificationStatus === 'VERIFIED' ? (
                    <View className="absolute -bottom-2 -right-2 h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-primary-dark">
                      <Icon name="verified" size={16} color="#FFFFFF" fill />
                    </View>
                  ) : null}
                </View>
                <View className="flex-1 gap-2.5">
                  <View className="flex-row flex-wrap gap-2">
                    {p.ratingCount >= 3 && p.ratingAverage >= 4.7 ? <Badge label="TOP RATED" tone="mint" /> : null}
                    {p.verificationStatus === 'VERIFIED' ? <Badge label="Verified" tone="navy" icon="verified" /> : null}
                    <Badge label={p.type === 'BUSINESS' ? 'Registered business' : 'Independent pro'} tone="navy" />
                  </View>
                  <View className="flex-row items-start justify-between gap-4">
                    <Txt variant="display-sm" className="flex-1">{p.displayName}</Txt>
                    <View className="flex-row gap-2">
                      <IconButton icon="share" label="Share" onPress={() => share(p)} />
                      <IconButton icon="favorite" active={p.isSaved} label="Save" onPress={() => (signedIn ? save.mutate({ id: p.id, save: !p.isSaved }) : router.push('/login'))} />
                      <IconButton icon="flag" label="Report" onPress={onReport} />
                    </View>
                  </View>
                  {p.tagline ? <Txt variant="body-lg" className="text-on-surface-variant" style={{ fontSize: 16 }}>{p.tagline}</Txt> : null}
                  <View className="flex-row flex-wrap items-center gap-x-5 gap-y-1">
                    <View className="flex-row items-center gap-1">
                      <Icon name="star" size={18} color={colors.amber} />
                      <Txt variant="label-lg">{p.ratingCount ? p.ratingAverage.toFixed(1) : 'New'}</Txt>
                      {p.ratingCount ? <Txt variant="body-md" className="text-on-surface-variant">({p.ratingCount} reviews)</Txt> : null}
                    </View>
                    {primary ? (
                      <View className="flex-row items-center gap-1">
                        <Icon name="location_on" size={18} color={colors.onSurfaceVariant} />
                        <Txt variant="body-md" className="text-on-surface-variant">{[primary.addressLine, primary.area, primary.city].filter(Boolean).join(', ')}</Txt>
                      </View>
                    ) : null}
                    {p.distanceMeters != null ? <Txt variant="label-lg" className="text-primary-dark">• {formatDistance(p.distanceMeters)} away</Txt> : null}
                  </View>
                  {p.languages.length ? (
                    <View className="flex-row items-center gap-1">
                      <Icon name="translate" size={18} color={colors.onSurfaceVariant} />
                      <Txt variant="body-md" className="text-on-surface-variant">Speaks {p.languages.join(', ')}</Txt>
                    </View>
                  ) : null}
                </View>
              </View>
              <View className="flex-row rounded-2xl bg-surface-container-low/80 px-6 py-5">
                {[
                  ['Completed projects', String(p.completedProjects || '—'), false],
                  ['Customer reviews', String(p.ratingCount), true],
                  ['Services offered', String(p.sections.services + p.sections.products), true],
                  ['Starting rate', p.startingPrice != null ? `ZMW ${p.startingPrice}` : 'On request', false],
                ].map(([l, v, teal]) => (
                  <View key={String(l)} className="flex-1 gap-1">
                    <Txt variant="eyebrow" className="text-on-surface-variant">{l}</Txt>
                    <Txt variant="headline-md" className={teal ? 'text-primary-dark' : 'text-on-surface'}>{v}</Txt>
                  </View>
                ))}
              </View>
            </View>

            <View className="flex-row flex-wrap gap-2">
              {tabs.map((t) => (
                <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: activeTab === t.key }} className={`h-11 justify-center rounded-full px-5 ${activeTab === t.key ? 'bg-primary-dark' : 'bg-surface-container-low active:bg-surface-container'}`}>
                  <Txt variant="label-lg" className={activeTab === t.key ? 'text-white' : 'text-on-surface'}>{t.label}</Txt>
                </Pressable>
              ))}
            </View>

            {activeTab === 'services' || activeTab === 'products' ? (
              <OffersSection
                web
                items={(activeTab === 'services' ? data.services : data.products).data ?? []}
                loading={(activeTab === 'services' ? data.services : data.products).isLoading}
                kind={activeTab}
                owner={p.isOwner}
                onSelect={(l) => (l.type === 'SERVICE' && !p.isOwner ? setSelected(l.id) : router.push(`/listing/${l.id}`))}
              />
            ) : null}
            {activeTab === 'portfolio' ? <PortfolioSection data={data} onOpen={setProject} web /> : null}
            {activeTab === 'reviews' ? <ReviewsSection data={data} p={p} /> : null}
            {activeTab === 'location' ? <LocationSection data={data} p={p} /> : null}
            {p.bio && activeTab !== 'location' ? (
              <View className="gap-2 rounded-3xl bg-white p-6 shadow-card">
                <Txt variant="headline-sm">About {p.displayName}</Txt>
                <Txt variant="body-lg" className="text-on-surface-variant">{p.bio}</Txt>
              </View>
            ) : null}
          </View>

          <View className="flex-1 gap-4" style={{ position: 'sticky' as never, top: 24 }}>
            <View className="gap-4 rounded-[32px] bg-white p-6 shadow-card">
              <View className="flex-row items-start justify-between">
                <View>
                  <Txt variant="eyebrow" className="text-on-surface-variant">Book online</Txt>
                  <View className="flex-row items-baseline gap-1.5">
                    <Txt variant="display-sm">{p.startingPrice != null ? `ZMW ${p.startingPrice}` : 'On request'}</Txt>
                    {p.startingPrice != null ? <Txt variant="body-md" className="text-on-surface-variant">/ from</Txt> : null}
                  </View>
                </View>
                <View className="flex-row items-center gap-1 rounded-full bg-tertiary-fixed/60 px-2.5 py-1">
                  <Icon name="bolt" size={14} color="#002117" />
                  <Txt variant="label-sm" className="text-on-tertiary-fixed">Provider confirms</Txt>
                </View>
              </View>
              <View className="h-px bg-surface-container" />
              {p.isOwner ? (
                <Txt variant="body-md" className="text-on-surface-variant">This is your storefront. Customers book from here.</Txt>
              ) : p.sections.services ? (
                <BookingPanel key={selected ?? 'default'} providerId={p.id} providerName={p.displayName} serviceMode={p.serviceMode} initialListingId={selected} />
              ) : (
                <Txt variant="body-md" className="text-on-surface-variant">This provider sells products. Message or call them to order.</Txt>
              )}
              <View className="flex-row gap-2">
                {p.phone ? <Button title="Call" kind="soft" icon="call" className="flex-1" onPress={() => callProvider(p.id, p.phone!)} /> : null}
                {!p.isOwner ? <Button title="Message" kind="soft" icon="chat" className="flex-1" onPress={() => void openChat(p.id)} /> : null}
              </View>
            </View>
          </View>
        </View>
        <WebFooter />
      </ScrollView>
      <ProjectSheet project={project} onClose={() => setProject(null)} />
    </View>
  );
}

// ───────────────────────────── Shared sections ─────────────────────────────

function useTabs(p: ProviderDetail, data: Data) {
  return useMemo(() => {
    const t: { key: Tab; label: string }[] = [];
    if (p.sections.services) t.push({ key: 'services', label: 'Services & Rates' });
    if (p.sections.products) t.push({ key: 'products', label: 'Products' });
    if (p.sections.portfolio || (data.gallery.data?.length ?? 0) > 0) t.push({ key: 'portfolio', label: 'Portfolio' });
    t.push({ key: 'reviews', label: `Reviews (${p.sections.reviews})` });
    t.push({ key: 'location', label: 'Location & Hours' });
    return t;
  }, [p, data.gallery.data]);
}

function TrustPill({ icon, label, tone = 'neutral' }: { icon: string; label: string; tone?: 'neutral' | 'blue' | 'mint' }) {
  const box = { neutral: 'bg-surface-container', blue: 'bg-secondary-container/50', mint: 'bg-tertiary-fixed/30' }[tone];
  const fg = { neutral: colors.secondary, blue: colors.primaryDark, mint: colors.tertiary }[tone];
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${box}`}>
      <Icon name={icon} size={14} color={fg} />
      <Txt variant="label-sm" className="text-on-secondary-fixed">{label}</Txt>
    </View>
  );
}

function OffersSection({ items, loading, kind, onSelect, web, owner }: { items: ListingSummary[]; loading: boolean; kind: 'services' | 'products'; onSelect: (l: ListingSummary) => void; web?: boolean; owner?: boolean }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between pt-1">
        <View>
          <Txt variant={web ? 'headline-lg' : 'headline-sm'}>{kind === 'services' ? (web ? 'Services & Transparent Rates' : 'Popular Services') : 'Products'}</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">{kind === 'services' ? 'Request a booking; the provider confirms the time.' : 'Contact the seller to order, pick up or arrange delivery.'}</Txt>
        </View>
        <View className="rounded-full bg-secondary-container px-2.5 py-0.5">
          <Txt variant="label-sm" className="text-on-secondary-fixed">{items.length} {items.length === 1 ? 'Offer' : 'Offers'}</Txt>
        </View>
      </View>
      {loading ? <ListSkeleton rows={2} /> : null}
      {items.map((l, i) =>
        web ? (
          <View key={l.id} className="flex-row items-center gap-5 rounded-3xl bg-white p-5 shadow-card">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-tertiary-fixed/40">
              <Icon name={l.category.icon ?? 'design_services'} size={26} color={colors.tertiary} />
            </View>
            <Pressable className="flex-1 gap-1" onPress={() => router.push(`/listing/${l.id}`)}>
              <View className="flex-row items-center gap-2">
                <Txt variant="headline-sm" style={{ fontSize: 17 }}>{l.title}</Txt>
                {i === 0 && items.length > 1 ? <Badge label="Popular" tone="mint" /> : null}
                {!l.isAvailable ? <Badge label="Unavailable" tone="error" /> : null}
                {l.visibility !== 'PUBLIC' ? <Badge label="Members only" tone="neutral" icon="lock" /> : null}
              </View>
              {l.description ? <Txt variant="body-md" numberOfLines={2} className="text-on-surface-variant">{l.description}</Txt> : null}
              <View className="flex-row items-center gap-3 pt-1">
                <View className="flex-row items-center gap-1"><Icon name="category" size={14} color={colors.onSurfaceVariant} /><Txt variant="label-sm" className="text-on-surface-variant">{l.category.name}</Txt></View>
              </View>
            </Pressable>
            <View className="items-end gap-1.5">
              <Txt variant="headline-md">{formatPrice(l).replace(/^From /, '')}</Txt>
              <Txt variant="label-sm" className="text-on-surface-variant">{l.priceType === 'STARTING_FROM' ? 'starting rate' : l.priceType === 'HOURLY' ? 'per hour' : l.priceType === 'FIXED' ? 'fixed rate' : ''}</Txt>
              <Button title={l.type === 'SERVICE' && !owner ? 'Book This' : 'View'} size="sm" onPress={() => onSelect(l)} />
            </View>
          </View>
        ) : (
          <View key={l.id} className="gap-2 rounded-panel bg-white p-4 shadow-card">
            <View className="flex-row items-start justify-between gap-2">
              <Pressable className="min-w-0 flex-1" onPress={() => router.push(`/listing/${l.id}`)}>
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <Txt variant="headline-sm">{l.title}</Txt>
                  {i === 0 && items.length > 1 ? <Badge label="Popular" tone="teal" /> : null}
                  {!l.isAvailable ? <Badge label="Unavailable" tone="error" /> : null}
                </View>
                {l.description ? <Txt variant="body-sm" className="mt-1 text-on-surface-variant" numberOfLines={3}>{l.description}</Txt> : null}
              </Pressable>
              <View className="items-end">
                <Txt variant="headline-sm" className="text-primary-dark">{formatPrice(l).replace(/^From /, '')}</Txt>
                {l.priceType === 'STARTING_FROM' ? <Txt variant="body-sm" className="text-on-surface-variant">starting</Txt> : null}
              </View>
            </View>
            <View className="flex-row items-center justify-between pt-1">
              <View className="flex-row items-center gap-1">
                <Icon name="check_circle" size={14} color={colors.tertiary} />
                <Txt variant="label-sm" className="text-secondary">{l.category.name}</Txt>
              </View>
              <Button title={l.type === 'SERVICE' && !owner ? 'Select' : 'View'} size="sm" onPress={() => onSelect(l)} />
            </View>
          </View>
        ),
      )}
    </View>
  );
}

function PortfolioSection({ data, onOpen, web }: { data: Data; onOpen: (p: PortfolioProject) => void; web?: boolean }) {
  const projects = data.portfolio.data ?? [];
  const gallery = data.gallery.data ?? [];
  if (!projects.length && !gallery.length) return <EmptyState icon="photo_library" title="No portfolio yet" />;
  return (
    <View className="gap-5">
      {projects.length ? (
        <View className="gap-3">
          <View className="flex-row items-end justify-between">
            <View>
              <Txt variant="headline-sm">Recent Projects</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">Completed work, with photos and details</Txt>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pb-2">
            {projects.map((pr) => (
              <Pressable key={pr.id} onPress={() => onOpen(pr)} accessibilityRole="button" style={{ width: web ? 230 : 176, height: web ? 280 : 224 }} className="overflow-hidden rounded-[32px] shadow-card">
                <Thumb uri={pr.media.find((m) => m.kind === 'IMAGE')?.url} name={pr.title} icon="photo_library" size="100%" height={web ? 280 : 224} rounded="rounded-none" />
                <View className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-on-surface/85 to-transparent p-3 pt-10">
                  <Txt variant="label-md" className="text-white" numberOfLines={1}>{pr.title}</Txt>
                  <Txt variant="body-sm" className="text-surface-variant" numberOfLines={1} style={{ fontSize: 11 }}>{[pr.locationName, pr.durationText].filter(Boolean).join(' · ') || `${pr.media.length} photos`}</Txt>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {gallery.length ? (
        <View className="gap-3">
          <Txt variant="headline-sm">Gallery</Txt>
          <View className="flex-row flex-wrap gap-2">
            {gallery.map((m) => (
              <Pressable key={m.id} onPress={() => m.kind === 'VIDEO' && void Linking.openURL(m.url)} style={{ width: web ? 180 : '31.5%', aspectRatio: 1 }} className="overflow-hidden rounded-2xl bg-surface-container">
                {m.kind === 'VIDEO' ? <View className="flex-1 items-center justify-center"><Icon name="play_circle" size={40} color={colors.secondary} /></View> : <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReviewsSection({ data, p }: { data: Data; p: ProviderDetail }) {
  const s = data.summary.data;
  const items = data.reviews.data?.pages.flatMap((pg) => pg.items) ?? [];
  return (
    <View className="gap-4 rounded-panel bg-white p-5 shadow-card">
      <View className="flex-row items-center justify-between">
        <View>
          <Txt variant="headline-sm">Client Reviews</Txt>
          <Txt variant="body-sm" className="text-on-surface-variant">{p.ratingCount} review{p.ratingCount === 1 ? '' : 's'} from customers</Txt>
        </View>
        <View className="items-end">
          <View className="flex-row items-center gap-1"><Icon name="star" size={22} color={colors.amber} fill /><Txt variant="headline-md">{p.ratingAverage.toFixed(1)}</Txt></View>
          <Txt variant="label-sm" className="font-semibold text-on-surface-variant">out of 5.0</Txt>
        </View>
      </View>
      {s && s.count > 0 ? (
        <View className="gap-1.5 rounded-2xl bg-surface-container-low p-3">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s.distribution[n as 1 | 2 | 3 | 4 | 5];
            return (
              <View key={n} className="flex-row items-center gap-2">
                <Txt variant="label-sm" className="w-3">{n}</Txt>
                <Icon name="star" size={12} color={colors.amber} fill />
                <View className="h-2 flex-1 overflow-hidden rounded-full bg-white"><View className="h-2 rounded-full bg-amber" style={{ width: `${(c / s.count) * 100}%` }} /></View>
                <Txt variant="label-sm" className="w-6 text-right text-on-surface-variant">{c}</Txt>
              </View>
            );
          })}
        </View>
      ) : null}
      {!p.isOwner ? <Button title="Write a review" icon="rate_review" kind="soft" onPress={() => router.push(`/provider/${p.id}/review`)} /> : null}
      {items.map((r) => <ReviewCard key={r.id} r={r} />)}
      {data.reviews.isSuccess && !items.length ? <EmptyState icon="rate_review" title="No reviews yet" message="Have you used this provider? Be the first to review." /> : null}
      {data.reviews.hasNextPage ? <Button title="Read more reviews" kind="soft" loading={data.reviews.isFetchingNextPage} onPress={() => void data.reviews.fetchNextPage()} /> : null}
    </View>
  );
}

function LocationSection({ data, p }: { data: Data; p: ProviderDetail }) {
  const primary = p.locations[0];
  return (
    <View className="gap-4">
      <View className="overflow-hidden rounded-panel bg-white shadow-card">
        {primary ? (
          <View>
            <NearbyMap origin={{ lat: primary.lat, lng: primary.lng, label: primary.area }} radiusKm={Math.max(1, p.serviceRadiusKm ?? 2)} items={[]} height={160} />
            <View className="absolute bottom-3 left-3 flex-row items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 shadow-raised">
              <Icon name="pin_drop" size={16} color={colors.primaryDark} />
              <Txt variant="label-sm">{primary.isApproximate ? `${primary.area} (approximate)` : primary.addressLine ?? primary.area}</Txt>
            </View>
            <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${primary.lat},${primary.lng}`)} className="absolute bottom-3 right-3 flex-row items-center gap-1 rounded-full bg-primary px-3 py-1.5 shadow-raised">
              <Icon name="directions" size={14} color="#FFFFFF" />
              <Txt variant="label-sm" className="text-white">Get Directions</Txt>
            </Pressable>
          </View>
        ) : null}
        <View className="gap-3 p-4">
          {p.locations.map((l) => <InfoRow key={l.id} icon="store" label={l.label} value={[l.addressLine, l.area, l.city].filter(Boolean).join(', ')} />)}
          {groupHours(p.workingHours).map((h) => <InfoRow key={h.days} icon="schedule" label={h.days} value={h.range} />)}
          {!p.workingHours.length ? <InfoRow icon="schedule" label="Working hours" value="Not listed" /> : null}
          {p.serviceAreas.map((a) => <InfoRow key={a.id} icon="commute" label="Serves" value={`${a.name} (${a.radiusKm} km)`} />)}
        </View>
      </View>
      <View className="gap-3 rounded-panel bg-white p-4 shadow-card">
        <Txt variant="headline-sm">Contact & credentials</Txt>
        {p.phone ? <InfoRow icon="call" label="Phone" value={p.phone} /> : null}
        {p.whatsapp ? <InfoRow icon="chat" label="WhatsApp" value={p.whatsapp} /> : null}
        {p.email ? <InfoRow icon="mail" label="Email" value={p.email} /> : null}
        {p.website ? <InfoRow icon="language" label="Website" value={p.website} /> : null}
        {(data.credentials.data ?? []).map((c) => <InfoRow key={c.id} icon="workspace_premium" label={c.title} value={[c.issuer, c.issuedAt?.slice(0, 4)].filter(Boolean).join(' · ')} />)}
        <InfoRow icon="event" label="On Vicinity since" value={timeAgo(p.joinedAt)} />
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={18} color={colors.onSurfaceVariant} />
        <Txt variant="body-md" className="text-on-surface-variant">{label}</Txt>
      </View>
      <Txt variant="label-md" className="flex-shrink text-right">{value}</Txt>
    </View>
  );
}

function ProjectSheet({ project, onClose }: { project: PortfolioProject | null; onClose: () => void }) {
  return (
    <Sheet visible={!!project} onClose={onClose} title={project?.title ?? ''}>
      {project ? (
        <>
          {project.description ? <Txt variant="body-lg" className="text-on-surface-variant">{project.description}</Txt> : null}
          <View className="flex-row flex-wrap gap-2">
            {project.locationName ? <Badge label={project.locationName} tone="neutral" icon="place" /> : null}
            {project.durationText ? <Badge label={project.durationText} tone="neutral" icon="timer" /> : null}
            {project.price != null ? <Badge label={`ZMW ${project.price}`} tone="teal" /> : null}
            {project.completedAt ? <Badge label={`Completed ${project.completedAt.slice(0, 10)}`} tone="neutral" icon="task_alt" /> : null}
          </View>
          {project.media.map((m) =>
            m.kind === 'VIDEO' ? (
              <Button key={m.id} title="Play video" icon="play_circle" kind="soft" onPress={() => void Linking.openURL(m.url)} />
            ) : (
              <Image key={m.id} source={{ uri: m.url }} style={{ width: '100%', aspectRatio: m.width && m.height ? m.width / m.height : 4 / 3, borderRadius: 20 }} contentFit="cover" />
            ),
          )}
        </>
      ) : null}
    </Sheet>
  );
}


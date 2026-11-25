import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, formatDistance, formatPrice } from '@vicinity/shared';
import { AppHeader } from '@/components/AppHeader';
import { BookingSheet } from '@/components/BookingPanel';
import { isWeb, useWide } from '@/components/Screen';
import { callProvider, whatsappProvider } from '@/components/ContactActions';
import { openChat } from '@/lib/chat';
import { EnquirySheet } from '@/components/EnquirySheet';
import { ReportSheet } from '@/components/ReportSheet';
import { Badge, Button, Card, ErrorState, Icon, IconButton, ListSkeleton, Rating, Thumb, Txt, VerifiedBadge } from '@/components/ui';
import { useListing, useToggleSaveListing } from '@/hooks/api';
import { useAuth } from '@/store/auth';

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useListing(id);
  const l = q.data;
  const save = useToggleSaveListing();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [enquiry, setEnquiry] = useState(false);
  const [report, setReport] = useState(false);
  const [booking, setBooking] = useState(false);
  const width = Math.min(useWindowDimensions().width, 768);
  const wide = useWide();

  if (q.isLoading) return <SafeAreaView className="flex-1 bg-surface p-margin"><ListSkeleton rows={3} /></SafeAreaView>;
  if (q.isError || !l) {
    return (
      <SafeAreaView className="flex-1 bg-surface">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        <Button title="Back" kind="ghost" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      {wide && isWeb ? <AppHeader /> : null}
      <View className="w-full max-w-3xl flex-row items-center justify-between self-center px-margin py-2">
        <IconButton icon="arrow_back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View className="flex-row gap-1">
          <IconButton icon={l.isSaved ? 'favorite' : 'favorite_border'} active={l.isSaved} label="Save" onPress={() => (signedIn ? save.mutate({ id: l.id, save: !l.isSaved }) : router.push('/login'))} />
          <IconButton icon="flag" label="Report listing" onPress={() => setReport(true)} />
        </View>
      </View>
      <ScrollView contentContainerClassName="w-full max-w-3xl self-center pb-36 gap-4">
        {l.media.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {l.media.map((m) =>
              m.kind === 'VIDEO' ? (
                <View key={m.id} style={{ width, height: 260 }} className="items-center justify-center bg-surface-container">
                  <Button title="Play video" icon="play_circle" kind="secondary" onPress={() => void Linking.openURL(m.url)} />
                </View>
              ) : (
                <Image key={m.id} source={{ uri: m.url }} style={{ width, height: 260 }} contentFit="cover" />
              ),
            )}
          </ScrollView>
        ) : (
          <View className="px-margin"><Thumb name={l.provider.displayName} icon={l.category.icon} size="100%" height={160} rounded="rounded-3xl" /></View>
        )}

        <View className="gap-2 px-margin">
          <View className="flex-row flex-wrap gap-1.5">
            <Badge label={l.type === 'SERVICE' ? 'Service' : 'Product'} tone="navy" />
            <Badge label={l.category.name} tone="neutral" />
            {l.visibility !== 'PUBLIC' ? <Badge label={l.group ? `${l.group.name} only` : `${l.organization?.name ?? 'Members'} only`} tone="neutral" icon="lock" /> : l.organization ? <Badge label={l.organization.name} tone="neutral" icon="groups" /> : null}
            {!l.isAvailable ? <Badge label="Currently unavailable" tone="error" /> : null}
          </View>
          <Txt variant="headline-lg">{l.title}</Txt>
          <Txt variant="headline-md" className="text-primary-dark">{formatPrice(l)}</Txt>
          {l.durationMinutes ? <Txt variant="body-md" className="text-on-surface-variant">Takes about {l.durationMinutes >= 60 ? `${Math.round((l.durationMinutes / 60) * 10) / 10} h` : `${l.durationMinutes} min`}</Txt> : null}
          {l.type === 'PRODUCT' ? (
            <View className="flex-row flex-wrap gap-1.5">
              {l.stockStatus ? <Badge label={l.stockStatus.replace(/_/g, ' ').toLowerCase()} tone={l.stockStatus === 'OUT_OF_STOCK' ? 'error' : 'teal'} /> : null}
              {l.pickupAvailable ? <Badge label="Pickup" tone="neutral" icon="storefront" /> : null}
              {l.deliveryAvailable ? <Badge label={l.deliveryRadiusKm ? `Delivers within ${l.deliveryRadiusKm} km` : 'Delivery'} tone="neutral" icon="local_shipping" /> : null}
            </View>
          ) : null}
          {l.description ? <Txt variant="body-lg" className="pt-1 text-ink-muted">{l.description}</Txt> : null}
        </View>

        <View className="px-margin">
          <Card onPress={() => router.push(`/provider/${l.provider.slug}`)} className="flex-row items-center gap-3">
            <Thumb uri={l.provider.logoUrl} name={l.provider.displayName} size={52} rounded="rounded-full" />
            <View className="flex-1 gap-0.5">
              <Txt variant="headline-sm">{l.provider.displayName}</Txt>
              <Rating value={l.provider.ratingAverage} count={l.provider.ratingCount} size="sm" />
              <View className="flex-row items-center gap-1">
                <Icon name="location_on" size={13} color={colors.primaryDark} />
                <Txt variant="body-sm" className="text-ink-muted">{[formatDistance(l.distanceMeters), l.area, l.city].filter(Boolean).join(' · ')}</Txt>
              </View>
              {l.provider.verificationStatus === 'VERIFIED' ? <VerifiedBadge /> : null}
            </View>
            <Icon name="chevron_right" size={22} color={colors.outline} />
          </Card>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-surface-container bg-white/95 px-margin py-3">
        <SafeAreaView edges={['bottom']} className="w-full max-w-3xl flex-row items-center gap-2 self-center">
          {l.provider.phone ? <IconButton icon="call" tone="primary" size={48} label="Call" onPress={() => callProvider(l.provider.id, l.provider.phone!, l.id)} /> : null}
          {l.provider.whatsapp ? <IconButton icon="chat" tone="whatsapp" size={48} label="WhatsApp" onPress={() => whatsappProvider(l.provider.id, l.provider.whatsapp!, l.id, `Hi! I saw "${l.title}" on Vicinity.`)} /> : null}
          <IconButton icon="sms" tone="tertiary" size={48} label="Message in app" onPress={() => void openChat(l.provider.id)} />
          {l.type === 'SERVICE' ? (
            <Button title="Book now" icon="event_available" className="flex-1" onPress={() => (signedIn ? setBooking(true) : router.push('/login'))} />
          ) : (
            <Button title="Send enquiry" icon="forum" className="flex-1" onPress={() => setEnquiry(true)} />
          )}
        </SafeAreaView>
      </View>
      <EnquirySheet visible={enquiry} onClose={() => setEnquiry(false)} providerId={l.provider.id} providerName={l.provider.displayName} listing={{ id: l.id, title: l.title }} />
      {l.type === 'SERVICE' ? <BookingSheet visible={booking} onClose={() => setBooking(false)} providerId={l.provider.id} providerName={l.provider.displayName} serviceMode={l.provider.serviceMode} initialListingId={l.id} /> : null}
      <ReportSheet visible={report} onClose={() => setReport(false)} targetType="LISTING" targetId={l.id} />
    </SafeAreaView>
  );
}

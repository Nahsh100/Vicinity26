import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors, formatDistance, formatPrice, type ListingSummary, type ProviderSummary } from '@vicinity/shared';
import { useToggleSaveListing, useToggleSaveProvider } from '@/hooks/api';
import { useAuth } from '@/store/auth';
import { callProvider, whatsappProvider } from './ContactActions';
import { Badge, Button, Icon, IconButton, Thumb, TopRatedBadge, Txt, VerifiedBadge } from './ui';

function requireSignIn(): boolean {
  if (useAuth.getState().status === 'signedIn') return true;
  router.push('/login');
  return false;
}

const isTopRated = (avg: number, count: number) => count >= 3 && avg >= 4.7;

/** "Top Rated Providers" carousel card (Stitch mobile home): 190 px, photo on top, rating chip, call button. */
export function ProviderCard({ p, width = 190 }: { p: ProviderSummary; width?: number }) {
  const save = useToggleSaveProvider();
  return (
    <Pressable
      accessibilityLabel={`${p.displayName}, ${p.primaryCategory?.name ?? ''}`}
      onPress={() => router.push(`/provider/${p.slug}`)}
      style={{ width }}
      className="rounded-2xl bg-white p-2.5 shadow-card active:opacity-95"
    >
      <View>
        <Thumb uri={p.coverUrl ?? p.logoUrl} name={p.displayName} icon={p.primaryCategory?.icon} size={width - 20} height={112} rounded="rounded-xl" />
        {p.ratingCount > 0 ? (
          <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 shadow-soft">
            <Icon name="star" size={13} color={colors.amber} fill />
            <Txt variant="label-sm">{p.ratingAverage.toFixed(1)}</Txt>
          </View>
        ) : null}
        <View className="absolute right-2 top-2">
          <IconButton
            icon="favorite"
            tone="glass"
            size={28}
            active={p.isSaved}
            label={p.isSaved ? `Remove ${p.displayName} from saved` : `Save ${p.displayName}`}
            onPress={() => requireSignIn() && save.mutate({ id: p.id, save: !p.isSaved })}
          />
        </View>
      </View>
      <Txt variant="headline-sm" numberOfLines={1} className="mt-2">{p.displayName}</Txt>
      <Txt variant="body-sm" numberOfLines={1} className="text-on-surface-variant">
        {[p.primaryCategory?.name, formatDistance(p.distanceMeters) ?? p.area].filter(Boolean).join(' • ')}
      </Txt>
      <View className="mt-2.5 flex-row items-center justify-between">
        {p.verificationStatus === 'VERIFIED' ? (
          <Badge label="Verified" tone="teal" />
        ) : isTopRated(p.ratingAverage, p.ratingCount) ? (
          <Badge label="Top Pick" tone="verified" />
        ) : p.startingPrice != null ? (
          <Badge label={`From ZMW ${p.startingPrice}`} tone="navy" />
        ) : (
          <View />
        )}
        {p.phone ? <IconButton icon="call" tone="tertiary" size={32} label={`Call ${p.displayName}`} onPress={() => callProvider(p.id, p.phone!)} /> : null}
      </View>
    </Pressable>
  );
}

/** Desktop grid card (Stitch web "Top Rated Neighborhood Pros"): image header with badges, details, price, contact, CTA. */
export function ProviderTile({ p }: { p: ProviderSummary }) {
  const save = useToggleSaveProvider();
  return (
    <Pressable onPress={() => router.push(`/provider/${p.slug}`)} className="flex-1 overflow-hidden rounded-3xl bg-white shadow-card active:opacity-95">
      <View>
        <Thumb uri={p.coverUrl ?? p.logoUrl} name={p.displayName} icon={p.primaryCategory?.icon} size="100%" height={180} rounded="rounded-none" />
        <View className="absolute left-3 top-3 flex-row gap-1.5">
          {p.verificationStatus === 'VERIFIED' ? <Badge label="Verified" tone="glass" icon="verified" /> : null}
          {isTopRated(p.ratingAverage, p.ratingCount) ? <Badge label="Top Rated" tone="amber" icon="star" /> : null}
        </View>
        <View className="absolute right-3 top-3">
          <IconButton icon="favorite" tone="glass" size={34} active={p.isSaved} label="Save provider" onPress={() => requireSignIn() && save.mutate({ id: p.id, save: !p.isSaved })} />
        </View>
        {p.distanceMeters != null ? (
          <View className="absolute bottom-3 right-3 flex-row items-center gap-1 rounded-full bg-navy/80 px-2.5 py-1">
            <Icon name="near_me" size={13} color="#FFFFFF" />
            <Txt variant="label-sm" className="text-white">{formatDistance(p.distanceMeters)} away</Txt>
          </View>
        ) : null}
      </View>
      <View className="gap-1.5 p-5">
        <View className="flex-row items-center justify-between gap-2">
          <Txt variant="headline-sm" numberOfLines={1} className="flex-1" style={{ fontSize: 17 }}>{p.displayName}</Txt>
          {p.ratingCount ? (
            <View className="flex-row items-center gap-1">
              <Icon name="star" size={15} color={colors.amber} />
              <Txt variant="label-md">{p.ratingAverage.toFixed(1)}</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">({p.ratingCount})</Txt>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          <Icon name="location_on" size={15} color={colors.primaryDark} />
          <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>{[p.area, p.city].filter(Boolean).join(', ') || 'Zambia'}</Txt>
        </View>
        <Txt variant="body-sm" numberOfLines={2} className="min-h-[32px] text-on-surface-variant">{p.tagline ?? p.primaryCategory?.name ?? ''}</Txt>
        <View className="mt-2 flex-row items-end justify-between">
          <View>
            <Txt variant="body-sm" className="text-on-surface-variant">Starting from</Txt>
            <Txt variant="headline-sm" className="text-primary-dark">{p.startingPrice != null ? `ZMW ${p.startingPrice}` : 'On request'}</Txt>
          </View>
          <View className="flex-row gap-2">
            {p.whatsapp ? <IconButton icon="chat" tone="tertiary" size={36} label="WhatsApp" onPress={() => whatsappProvider(p.id, p.whatsapp!)} /> : null}
            {p.phone ? <IconButton icon="call" tone="tertiary" size={36} label="Call" onPress={() => callProvider(p.id, p.phone!)} /> : null}
          </View>
        </View>
        <Button title="Book Service" kind="soft" size="sm" className="mt-3" onPress={() => router.push(`/provider/${p.slug}?book=1`)} />
      </View>
    </Pressable>
  );
}

/** Search result card (Stitch "Search & Results"): thumbnail, rating · distance, badges, snippet, price and contact triggers. */
export function ListingCard({ l, highlight, onBook }: { l: ListingSummary; highlight?: boolean; onBook?: () => void }) {
  const save = useToggleSaveListing();
  const verified = l.provider.verificationStatus === 'VERIFIED';
  return (
    <Pressable
      accessibilityLabel={`${l.title} by ${l.provider.displayName}`}
      onPress={() => router.push(`/listing/${l.id}`)}
      className={`gap-2 rounded-card bg-white p-3 shadow-card active:opacity-95 ${highlight ? 'border-2 border-primary/60' : ''}`}
    >
      <View className="flex-row items-start gap-3">
        <View>
          <Thumb uri={l.coverUrl ?? l.provider.logoUrl} name={l.provider.displayName} icon={l.category.icon} size={80} rounded="rounded-2xl" />
          {verified ? (
            <View className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary">
              <Icon name="verified" size={13} color="#FFFFFF" fill />
            </View>
          ) : null}
        </View>
        <View className="min-w-0 flex-1 pr-7">
          <Txt variant="headline-sm" numberOfLines={1}>{l.title}</Txt>
          <View className="mt-0.5 flex-row flex-wrap items-center gap-x-1">
            {l.provider.ratingCount ? (
              <>
                <Icon name="star" size={15} color={colors.amber} fill />
                <Txt variant="label-md">{l.provider.ratingAverage.toFixed(1)}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">({l.provider.ratingCount})</Txt>
                <Txt variant="body-sm" className="text-outline-variant">•</Txt>
              </>
            ) : null}
            <Txt variant="label-md" className="text-secondary" numberOfLines={1}>
              {l.distanceMeters != null ? `${formatDistance(l.distanceMeters)} away` : (l.area ?? l.provider.displayName)}
            </Txt>
          </View>
          <Txt variant="body-sm" numberOfLines={1} className="text-on-surface-variant">{l.provider.displayName}</Txt>
          <View className="mt-1.5 flex-row flex-wrap gap-1.5">
            {verified ? <VerifiedBadge /> : null}
            {isTopRated(l.provider.ratingAverage, l.provider.ratingCount) ? <TopRatedBadge /> : null}
            {l.area && l.distanceMeters != null ? <Badge label={l.area} tone="navy" /> : null}
            {l.type === 'PRODUCT' ? <Badge label="Product" tone="neutral" icon="shopping_bag" /> : null}
            {!l.isAvailable ? <Badge label="Unavailable" tone="error" /> : null}
            {l.visibility !== 'PUBLIC' ? <Badge label={l.visibility === 'GROUP' ? 'Group only' : 'Members only'} tone="neutral" icon="lock" /> : null}
          </View>
        </View>
        <View className="absolute right-0 top-0">
          <IconButton icon="favorite" tone="plain" size={32} active={l.isSaved} label={l.isSaved ? 'Remove from saved' : 'Save listing'} onPress={() => requireSignIn() && save.mutate({ id: l.id, save: !l.isSaved })} />
        </View>
      </View>
      {l.description ? <Txt variant="body-sm" numberOfLines={1} className="text-on-surface-variant">{l.description}</Txt> : null}
      <View className="flex-row items-center justify-between pt-1">
        <View>
          <Txt variant="label-sm" className="font-semibold text-on-surface-variant">{l.priceType === 'STARTING_FROM' ? 'Starting from' : l.type === 'PRODUCT' ? 'Price' : 'Rate'}</Txt>
          <Txt variant="headline-sm" className="text-primary-dark">{formatPrice(l).replace(/^From /, '')}</Txt>
        </View>
        <View className="flex-row items-center gap-2">
          {l.provider.phone ? <IconButton icon="call" tone="primary" size={40} label={`Call ${l.provider.displayName}`} onPress={() => callProvider(l.provider.id, l.provider.phone!, l.id)} /> : null}
          {l.provider.whatsapp ? <IconButton icon="chat" tone="whatsapp" size={40} label={`WhatsApp ${l.provider.displayName}`} onPress={() => whatsappProvider(l.provider.id, l.provider.whatsapp!, l.id)} /> : null}
          {onBook && l.type === 'SERVICE' ? <Button title="Book Now" kind="brand" size="sm" onPress={onBook} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Compact row (Stitch "Popular Right Now"). */
export function ListingRow({ l }: { l: ListingSummary }) {
  return (
    <Pressable onPress={() => router.push(`/listing/${l.id}`)} className="flex-row items-center justify-between rounded-2xl bg-white p-3 shadow-card active:opacity-95">
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        <Thumb uri={l.coverUrl ?? l.provider.logoUrl} name={l.provider.displayName} icon={l.category.icon} size={64} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Txt variant="headline-sm" numberOfLines={1} className="flex-shrink">{l.title}</Txt>
            {l.provider.verificationStatus === 'VERIFIED' ? <Icon name="verified" size={15} color={colors.tertiary} fill /> : null}
          </View>
          <View className="mt-0.5 flex-row items-center gap-1">
            {l.provider.ratingCount ? (
              <>
                <Icon name="star" size={14} color={colors.amber} fill />
                <Txt variant="label-md">{l.provider.ratingAverage.toFixed(1)}</Txt>
              </>
            ) : null}
            <Txt variant="body-sm" numberOfLines={1} className="flex-shrink text-on-surface-variant">
              {[l.provider.ratingCount ? `(${l.provider.ratingCount})` : l.provider.displayName, formatDistance(l.distanceMeters) ?? l.area].filter(Boolean).join(' • ')}
            </Txt>
          </View>
          <Txt variant="body-sm" className="mt-0.5 font-semibold text-primary-dark">{formatPrice(l)}</Txt>
        </View>
      </View>
      <View className="flex-row items-center gap-1.5 pl-2">
        {l.provider.whatsapp ? <IconButton icon="chat" tone="tertiary" size={36} label={`Message ${l.provider.displayName}`} onPress={() => whatsappProvider(l.provider.id, l.provider.whatsapp!, l.id)} /> : null}
        {l.provider.phone ? <IconButton icon="call" tone="slate" size={36} label={`Call ${l.provider.displayName}`} onPress={() => callProvider(l.provider.id, l.provider.phone!, l.id)} /> : null}
      </View>
    </Pressable>
  );
}

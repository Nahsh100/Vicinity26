import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ListingCard, ProviderCard } from '@/components/Cards';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, ListSkeleton, Segmented } from '@/components/ui';
import { useSavedListings, useSavedProviders } from '@/hooks/api';
import { useAuth } from '@/store/auth';

export default function Saved() {
  const status = useAuth((s) => s.status);
  const [tab, setTab] = useState<'providers' | 'listings'>('providers');
  const providers = useSavedProviders();
  const listings = useSavedListings();

  if (status !== 'signedIn') {
    return (
      <Screen title="Saved">
        <EmptyState icon="favorite_border" title="Save providers you like" message="Sign in to keep a list of trusted providers and get updates when they add something new." action={{ label: 'Sign in', onPress: () => router.push('/login') }} />
      </Screen>
    );
  }

  const q = tab === 'providers' ? providers : listings;
  return (
    <Screen title="Saved" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View className="px-margin pb-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'providers', label: 'Providers', icon: 'storefront' }, { value: 'listings', label: 'Services & products', icon: 'sell' }]} />
      </View>
      {q.isLoading ? (
        <View className="px-margin"><ListSkeleton /></View>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : tab === 'providers' ? (
        providers.data?.length ? (
          <View className="flex-row flex-wrap gap-3 px-margin">
            {providers.data.map((p) => <ProviderCard key={p.id} p={p} width={170} />)}
          </View>
        ) : (
          <EmptyState icon="favorite_border" title="No saved providers yet" message="Tap the heart on a provider to save them here." action={{ label: 'Explore', onPress: () => router.push('/search') }} />
        )
      ) : listings.data?.length ? (
        <View className="gap-2 px-margin">{listings.data.map((l) => <ListingCard key={l.id} l={l} />)}</View>
      ) : (
        <EmptyState icon="favorite_border" title="No saved services or products" message="Tap the heart on a listing to save it." action={{ label: 'Explore', onPress: () => router.push('/search') }} />
      )}
    </Screen>
  );
}

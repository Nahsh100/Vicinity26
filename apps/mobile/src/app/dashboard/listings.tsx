import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { formatPrice } from '@vicinity/shared';
import { confirmAction, notify } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, ListSkeleton, Thumb, Txt } from '@/components/ui';
import { useMyListings } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

const TABS = [
  { key: undefined, label: 'All' },
  { key: 'ACTIVE', label: 'Live' },
  { key: 'DRAFT', label: 'Drafts' },
  { key: 'PAUSED', label: 'Paused' },
  { key: 'ARCHIVED', label: 'Archived' },
] as const;

const TONE = { ACTIVE: 'teal', DRAFT: 'amber', PAUSED: 'neutral', ARCHIVED: 'neutral', REMOVED: 'error' } as const;

export default function MyListings() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const q = useMyListings(status);
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['my-listings'] });
    void qc.invalidateQueries({ queryKey: ['my-provider'] });
  };
  const setStat = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }) => api.post(`/listings/${id}/status`, { status: s }),
    onSuccess: refresh,
    onError: (e) => notify('Could not update', toApiError(e).message),
  });
  const del = useMutation({ mutationFn: (id: string) => api.del(`/listings/${id}`), onSuccess: refresh });

  return (
    <Screen back title="My listings" right={<Button title="New" icon="add" size="sm" onPress={() => router.push('/dashboard/listing/new')} />} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-margin pb-3">
        {TABS.map((t) => <Chip key={t.label} label={t.label} active={status === t.key} onPress={() => setStatus(t.key)} />)}
      </ScrollView>
      <View className="gap-2 px-margin">
        {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data?.length === 0 ? <EmptyState icon="sell" title="No listings here" message="Add a service or product so customers can find you." action={{ label: 'Add listing', onPress: () => router.push('/dashboard/listing/new') }} /> : null}
        {q.data?.map((l) => (
          <Card key={l.id} className="gap-2">
            <View className="flex-row gap-3">
              <Thumb uri={l.coverUrl} name={l.title} icon={l.category.icon} size={64} />
              <View className="flex-1 gap-0.5">
                <Txt variant="headline-sm" numberOfLines={1}>{l.title}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">{l.category.name} · {formatPrice(l)}</Txt>
                <View className="flex-row flex-wrap gap-1.5">
                  <Badge label={l.status.toLowerCase()} tone={TONE[l.status]} />
                  {l.visibility !== 'PUBLIC' ? <Badge label={l.visibility === 'GROUP' ? 'Group only' : 'Members only'} tone="neutral" icon="lock" /> : null}
                  {!l.isAvailable ? <Badge label="Unavailable" tone="error" /> : null}
                </View>
              </View>
            </View>
            {l.status === 'REMOVED' ? (
              <Txt variant="body-sm" className="text-error">Removed by moderators. Contact support if you think this is a mistake.</Txt>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <Button title="Edit" size="sm" kind="secondary" icon="edit" onPress={() => router.push(`/dashboard/listing/${l.id}`)} />
                {l.status === 'ACTIVE' ? <Button title="Pause" size="sm" kind="outline" onPress={() => setStat.mutate({ id: l.id, s: 'PAUSED' })} /> : null}
                {l.status === 'PAUSED' || l.status === 'ARCHIVED' || l.status === 'DRAFT' ? <Button title="Make live" size="sm" kind="outline" onPress={() => setStat.mutate({ id: l.id, s: 'ACTIVE' })} /> : null}
                {l.status !== 'ARCHIVED' ? <Button title="Archive" size="sm" kind="ghost" onPress={() => setStat.mutate({ id: l.id, s: 'ARCHIVED' })} /> : null}
                <Button title="Delete" size="sm" kind="danger" onPress={() => confirmAction('Delete listing?', `"${l.title}" will be removed from your storefront.`, () => del.mutate(l.id), 'Delete')} />
              </View>
            )}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

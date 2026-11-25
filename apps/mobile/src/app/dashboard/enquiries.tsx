import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { timeAgo } from '@vicinity/shared';
import { whatsappUrl } from '@/components/ContactActions';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, ListSkeleton, Thumb, Txt } from '@/components/ui';
import { useEnquiries } from '@/hooks/api';
import { api } from '@/lib/api';

/** Customer enquiries received by the provider. */
export default function Enquiries() {
  const [status, setStatus] = useState<'NEW' | 'READ' | 'ARCHIVED' | undefined>(undefined);
  const q = useEnquiries(status);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'READ' | 'ARCHIVED' }) => api.patch(`/enquiries/received/${id}`, { status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['enquiries'] }),
  });

  return (
    <Screen back title="Enquiries" refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5 px-margin pb-3">
        {([[undefined, 'Inbox'], ['NEW', 'New'], ['READ', 'Read'], ['ARCHIVED', 'Archived']] as const).map(([k, l]) => (
          <Chip key={l} label={l} active={status === k} onPress={() => setStatus(k)} />
        ))}
      </ScrollView>
      <View className="gap-2 px-margin">
        {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data?.length === 0 ? <EmptyState icon="forum" title="No enquiries yet" message="When customers message you through Vicinity they'll appear here, and you'll get a notification." /> : null}
        {q.data?.map((e) => (
          <Card key={e.id} className={`gap-2 ${e.status === 'NEW' ? 'border border-primary' : ''}`}>
            <View className="flex-row items-center gap-2">
              <Thumb uri={e.customer.avatarUrl} name={e.customer.fullName} size={36} rounded="rounded-full" />
              <View className="flex-1">
                <Txt variant="label-lg">{e.customer.fullName}</Txt>
                <Txt variant="body-sm" className="text-on-surface-variant">{timeAgo(e.createdAt)}{e.listing ? ` · ${e.listing.title}` : ''}</Txt>
              </View>
              {e.status === 'NEW' ? <Badge label="New" tone="teal" /> : null}
            </View>
            <Txt variant="body-lg">{e.message}</Txt>
            <View className="flex-row flex-wrap gap-2">
              {e.contactPhone ? <Button title="Call" icon="call" size="sm" onPress={() => void Linking.openURL(`tel:${e.contactPhone}`)} /> : null}
              {e.contactPhone ? <Button title="WhatsApp" icon="chat" size="sm" kind="secondary" onPress={() => void Linking.openURL(whatsappUrl(e.contactPhone!, `Hi ${e.customer.fullName}, thanks for your enquiry on Vicinity.`))} /> : null}
              {e.status === 'NEW' ? <Button title="Mark read" size="sm" kind="outline" onPress={() => m.mutate({ id: e.id, s: 'READ' })} /> : null}
              {e.status !== 'ARCHIVED' ? <Button title="Archive" size="sm" kind="ghost" onPress={() => m.mutate({ id: e.id, s: 'ARCHIVED' })} /> : null}
            </View>
            {!e.contactPhone ? <Txt variant="body-sm" className="text-on-surface-variant">No phone shared — the customer will contact you again, or reply in the app once messaging launches.</Txt> : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

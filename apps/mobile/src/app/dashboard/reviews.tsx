import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { ReviewCard } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Button, EmptyState, ErrorState, InlineError, ListSkeleton, Sheet, TextField, Txt } from '@/components/ui';
import { useMyProvider, useReviews } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

/** Provider's reviews with the ability to reply publicly (one response per review). */
export default function ProviderReviews() {
  const me = useMyProvider();
  const reviews = useReviews(me.data?.id);
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const m = useMutation({
    mutationFn: () => api.post(`/reviews/${replyTo}/response`, { body }),
    onSuccess: () => {
      setReplyTo(null);
      setBody('');
      void qc.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
  const items = reviews.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen back title="Reviews">
      <View className="gap-3 px-margin">
        {me.data ? <Txt variant="headline-md">{me.data.ratingAverage.toFixed(1)} ★ · {me.data.ratingCount} reviews</Txt> : null}
        {reviews.isLoading ? <ListSkeleton /> : reviews.isError ? <ErrorState error={reviews.error} onRetry={() => void reviews.refetch()} /> : null}
        {reviews.isSuccess && !items.length ? <EmptyState icon="rate_review" title="No reviews yet" message="Ask happy customers to review you on Vicinity." /> : null}
        {items.map((r) => <ReviewCard key={r.id} r={r} onRespond={() => setReplyTo(r.id)} />)}
        {reviews.hasNextPage ? <Button title="Load more" kind="secondary" onPress={() => void reviews.fetchNextPage()} /> : null}
      </View>
      <Sheet visible={!!replyTo} onClose={() => setReplyTo(null)} title="Reply publicly" footer={<Button title="Post reply" disabled={body.trim().length < 2} loading={m.isPending} onPress={() => m.mutate()} />}>
        <Txt variant="body-sm" className="text-on-surface-variant">Your reply appears under the review on your profile. Keep it polite and helpful.</Txt>
        <TextField multiline value={body} onChangeText={setBody} maxLength={1000} />
        <InlineError message={m.error ? toApiError(m.error).message : null} />
      </Sheet>
    </Screen>
  );
}

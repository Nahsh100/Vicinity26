import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { MediaRef } from '@vicinity/shared';
import { MediaPicker } from '@/components/MediaPicker';
import { Screen } from '@/components/Screen';
import { Button, EmptyState, InlineError, Notice, Stars, TextField, Txt } from '@/components/ui';
import { useMyReview, useProvider } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

const LABEL = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

export default function WriteReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const provider = useProvider(id);
  const mine = useMyReview(id);
  const qc = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [media, setMedia] = useState<MediaRef[]>([]);

  useEffect(() => {
    if (mine.data) {
      setRating(mine.data.rating);
      setComment(mine.data.comment ?? '');
      setMedia(mine.data.media);
    }
  }, [mine.data]);

  const m = useMutation({
    mutationFn: () => api.put(`/providers/${id}/reviews`, { rating, comment, mediaIds: media.map((x) => x.id) }),
    onSuccess: () => {
      for (const k of ['reviews', 'rating-summary', 'my-review', 'provider']) void qc.invalidateQueries({ queryKey: [k] });
      router.back();
    },
  });

  if (!user) {
    return (
      <Screen back title="Write a review">
        <EmptyState icon="rate_review" title="Sign in to write a review" action={{ label: 'Sign in', onPress: () => router.push('/login') }} />
      </Screen>
    );
  }

  return (
    <Screen back title={mine.data ? 'Edit your review' : 'Write a review'}>
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        <Txt variant="headline-sm">{provider.data?.displayName}</Txt>
        {!(user.emailVerified || user.phoneVerified) ? <Notice tone="warning" message="Confirm your email address before posting reviews." icon="mark_email_unread" /> : null}
        <View className="items-center gap-2 rounded-3xl bg-white p-4">
          <Stars value={rating} size={36} onChange={setRating} />
          <Txt variant="label-md" className="text-ink-muted">{rating ? LABEL[rating] : 'Tap to rate'}</Txt>
        </View>
        <TextField label="Your experience (optional)" multiline value={comment} onChangeText={setComment} maxLength={2000} placeholder="What did they do? Were they on time? Would you recommend them?" />
        <MediaPicker label="Photos (optional)" value={media} onChange={setMedia} purpose="REVIEW" max={4} />
        <Txt variant="body-sm" className="text-on-surface-variant">One review per provider — you can edit it later. Reviews with links are checked by moderators first.</Txt>
        <InlineError message={m.error ? toApiError(m.error).message : null} />
        <Button title={mine.data ? 'Update review' : 'Post review'} disabled={!rating || !(user.emailVerified || user.phoneVerified)} loading={m.isPending} onPress={() => m.mutate()} />
        {!(user.emailVerified || user.phoneVerified) && user.email ? <Button title="Confirm email" kind="ghost" onPress={() => router.push('/verify-email')} /> : null}
      </View>
    </Screen>
  );
}

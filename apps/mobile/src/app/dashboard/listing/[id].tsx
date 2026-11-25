import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { ListingForm, listingToForm } from '@/components/ListingForm';
import { Screen } from '@/components/Screen';
import { ErrorState, ListSkeleton, Notice } from '@/components/ui';
import { useListing, useMyProvider } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

/** Create (id = "new") or edit a listing. */
export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const q = useListing(isNew ? undefined : id);
  const me = useMyProvider();
  const qc = useQueryClient();

  const done = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ['my-listings'] }), qc.invalidateQueries({ queryKey: ['my-provider'] }), qc.invalidateQueries({ queryKey: ['listing', id] })]);
    router.back();
  };

  return (
    <Screen back title={isNew ? 'New listing' : 'Edit listing'}>
      <View className="w-full max-w-xl gap-3 self-center px-margin">
        {me.data?.status === 'DRAFT' ? <Notice tone="info" message="Your storefront isn't published yet. New listings go live when you publish." /> : null}
        {!isNew && q.isLoading ? <ListSkeleton rows={2} /> : null}
        {!isNew && q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {isNew || q.data ? (
          <ListingForm
            key={q.data?.id ?? 'new'}
            lockType={!isNew}
            initial={q.data ? listingToForm(q.data) : undefined}
            initialMedia={q.data?.media}
            submitLabel={isNew ? 'Publish listing' : 'Save changes'}
            onSubmit={async (v) => {
              try {
                if (isNew) await api.post('/listings', v);
                else await api.patch(`/listings/${id}`, v);
              } catch (e) {
                throw toApiError(e);
              }
              await done();
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

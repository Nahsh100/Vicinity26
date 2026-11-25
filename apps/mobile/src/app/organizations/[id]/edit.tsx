import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { OrganizationForm } from '@/components/OrganizationForm';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Button, ErrorState, ListSkeleton } from '@/components/ui';
import { useOrganization } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';

export default function EditOrganization() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useOrganization(id);
  const qc = useQueryClient();
  return (
    <Screen back title="Organization settings">
      <View className="w-full max-w-xl gap-4 self-center px-margin">
        {q.isLoading ? <ListSkeleton rows={2} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data ? (
          <>
            <OrganizationForm
              initial={q.data}
              submitLabel="Save changes"
              onSubmit={async (v) => {
                try {
                  await api.patch(`/organizations/${id}`, v);
                } catch (e) {
                  throw toApiError(e);
                }
                await qc.invalidateQueries({ queryKey: ['organization', id] });
                router.back();
              }}
            />
            {q.data.myRole === 'OWNER' ? (
              <Button
                title="Delete organization"
                kind="danger"
                onPress={() =>
                  confirmAction('Delete organization?', 'Members lose access and member-only listings are paused. This cannot be undone.', () =>
                    void api.del(`/organizations/${id}`).then(() => {
                      void qc.invalidateQueries({ queryKey: ['organizations'] });
                      router.replace('/organizations');
                    }),
                  'Delete')
                }
              />
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

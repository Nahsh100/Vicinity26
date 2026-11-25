import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import type { Organization } from '@vicinity/shared';
import { OrganizationForm } from '@/components/OrganizationForm';
import { Screen } from '@/components/Screen';
import { api, toApiError } from '@/lib/api';

export default function NewOrganization() {
  const qc = useQueryClient();
  return (
    <Screen back title="Create organization">
      <View className="w-full max-w-xl self-center px-margin">
        <OrganizationForm
          submitLabel="Create organization"
          onSubmit={async (v) => {
            try {
              const o = await api.post<Organization>('/organizations', v);
              await qc.invalidateQueries({ queryKey: ['organizations'] });
              router.replace(`/organizations/${o.id}`);
            } catch (e) {
              throw toApiError(e);
            }
          }}
        />
      </View>
    </Screen>
  );
}

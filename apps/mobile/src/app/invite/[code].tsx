import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { colors, type Invitation, type Organization } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Button, ErrorState, Icon, InlineError, ListSkeleton, Notice, Txt } from '@/components/ui';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';

export default function AcceptInvite() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const user = useAuth((s) => s.user);
  const q = useQuery({ queryKey: ['invite', code], queryFn: () => api.get<Invitation>(`/organizations/invitations/${code}`), enabled: !!code });
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post<Organization>(`/organizations/invitations/${code}/accept`),
    onSuccess: (o) => {
      for (const k of ['organizations', 'my-groups', 'my-invitations']) void qc.invalidateQueries({ queryKey: [k] });
      router.replace(`/organizations/${o.id}`);
    },
  });
  const i = q.data;
  return (
    <Screen back title="Invitation">
      <View className="w-full max-w-md gap-4 self-center px-6 pt-4">
        {q.isLoading ? <ListSkeleton rows={1} /> : q.isError ? <ErrorState error={q.error} /> : null}
        {i ? (
          <>
            <View className="h-20 w-20 items-center justify-center self-center rounded-full bg-primary-soft"><Icon name="groups" size={40} color={colors.primaryDark} /></View>
            <Txt variant="headline-md" className="text-center">Join {i.organization.name}{i.group ? ` · ${i.group.name}` : ''}</Txt>
            {i.status !== 'PENDING' ? <Notice tone="warning" message={`This invitation is ${i.status.toLowerCase()}.`} /> : null}
            {i.email && user && i.email !== user.email ? <Notice tone="warning" message={`This invitation was sent to ${i.email}. Sign in with that account to accept it.`} /> : null}
            <InlineError message={m.error ? toApiError(m.error).message : null} />
            {user ? (
              <Button title="Accept invitation" disabled={i.status !== 'PENDING'} loading={m.isPending} onPress={() => m.mutate()} />
            ) : (
              <>
                <Button title="Sign in to accept" onPress={() => router.push('/login')} />
                <Button title="Create an account" kind="outline" onPress={() => router.push('/register')} />
              </>
            )}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

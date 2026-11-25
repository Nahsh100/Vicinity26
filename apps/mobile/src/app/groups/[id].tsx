import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { notify, confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, ErrorState, IconButton, ListSkeleton, Sheet, Thumb, Txt } from '@/components/ui';
import { useGroup, useGroupMembers, useOrganization, useOrgMembers } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSearch } from '@/store/search';

export default function GroupDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const q = useGroup(id);
  const g = q.data;
  const org = useOrganization(g?.organizationId ?? undefined);
  const isOrgAdmin = org.data?.myRole === 'OWNER' || org.data?.myRole === 'ADMIN';
  const isAdmin = g?.myRole === 'ADMIN' || isOrgAdmin;
  const members = useGroupMembers(id, !!g);
  const orgMembers = useOrgMembers(g?.organizationId ?? undefined, isAdmin && !!g?.organizationId);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const refresh = () => {
    for (const k of ['group', 'group-members', 'org-groups', 'my-groups']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const onErr = (e: unknown) => notify('Not allowed', toApiError(e).message);
  const join = useMutation({ mutationFn: () => api.post(`/groups/${id}/join`), onSuccess: refresh, onError: onErr });
  const leave = useMutation({ mutationFn: () => api.post(`/groups/${id}/leave`), onSuccess: refresh, onError: onErr });
  const add = useMutation({ mutationFn: (uid: string) => api.post(`/groups/${id}/members`, { userId: uid }), onSuccess: refresh, onError: onErr });
  const setRole = useMutation({ mutationFn: ({ uid, role }: { uid: string; role: 'ADMIN' | 'MEMBER' }) => api.patch(`/groups/${id}/members/${uid}`, { role }), onSuccess: refresh, onError: onErr });
  const remove = useMutation({ mutationFn: (uid: string) => api.del(`/groups/${id}/members/${uid}`), onSuccess: refresh, onError: onErr });

  if (q.isLoading) return <Screen back><View className="px-margin"><ListSkeleton /></View></Screen>;
  if (q.isError || !g) return <Screen back><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Screen>;

  const inGroup = new Set((members.data ?? []).map((m) => m.userId));
  const candidates = (orgMembers.data ?? []).filter((m) => !inGroup.has(m.userId));

  return (
    <Screen back title={g.name}>
      <View className="gap-4 px-margin">
        <Card className="gap-2 p-4">
          {org.data ? <Txt variant="label-md" className="text-primary-dark">{org.data.name}</Txt> : null}
          <Txt variant="headline-sm">{g.name}</Txt>
          {g.description ? <Txt variant="body-md" className="text-ink-muted">{g.description}</Txt> : null}
          <View className="flex-row flex-wrap gap-1.5">
            <Badge label={`${g.memberCount} members`} tone="neutral" icon="group" />
            {g.isPrivate ? <Badge label="Private" tone="neutral" icon="lock" /> : null}
            {g.myRole ? <Badge label={`You: ${g.myRole.toLowerCase()}`} tone="teal" /> : null}
          </View>
          <View className="flex-row flex-wrap gap-2 pt-1">
            {g.myRole ? (
              <Button
                title="Search within group"
                icon="search"
                size="sm"
                onPress={() => {
                  useSearch.setState((s) => ({ query: '', filters: { ...s.filters, organizationId: g.organizationId ?? undefined, organizationName: org.data?.name, groupId: g.id, groupName: g.name } }));
                  router.push('/search');
                }}
              />
            ) : null}
            {!g.myRole && !g.isPrivate && user ? <Button title="Join group" size="sm" loading={join.isPending} onPress={() => join.mutate()} /> : null}
            {isAdmin && g.organizationId ? <Button title="Add members" icon="person_add" size="sm" kind="secondary" onPress={() => setAddOpen(true)} /> : null}
            {g.myRole ? <Button title="Leave" size="sm" kind="ghost" onPress={() => confirmAction('Leave group?', g.name, () => leave.mutate(), 'Leave')} /> : null}
          </View>
        </Card>

        <Txt variant="headline-sm">Members</Txt>
        {members.isLoading ? <ListSkeleton rows={3} /> : members.isError ? <ErrorState error={members.error} /> : null}
        {members.data?.map((m) => (
          <Card key={m.userId} className="flex-row items-center gap-3">
            <Thumb uri={m.avatarUrl} name={m.fullName} size={40} rounded="rounded-full" />
            <View className="flex-1">
              <Txt variant="label-lg">{m.fullName}{m.userId === user?.id ? ' (you)' : ''}</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{m.role.toLowerCase()}</Txt>
            </View>
            {isAdmin && m.userId !== user?.id ? (
              <View className="flex-row gap-1">
                <Chip label={m.role === 'ADMIN' ? 'Make member' : 'Make admin'} onPress={() => setRole.mutate({ uid: m.userId, role: m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' })} />
                <IconButton icon="person_remove" tone="danger" size={32} label={`Remove ${m.fullName}`} onPress={() => remove.mutate(m.userId)} />
              </View>
            ) : null}
          </Card>
        ))}
      </View>
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add organization members">
        {candidates.length === 0 ? <Txt variant="body-md" className="text-on-surface-variant">Everyone in the organization is already in this group. Invite more people to the organization first.</Txt> : null}
        {candidates.map((m) => (
          <View key={m.userId} className="flex-row items-center gap-3">
            <Thumb uri={m.avatarUrl} name={m.fullName} size={36} rounded="rounded-full" />
            <Txt variant="label-lg" className="flex-1">{m.fullName}</Txt>
            <Button title="Add" size="sm" onPress={() => add.mutate(m.userId)} />
          </View>
        ))}
      </Sheet>
    </Screen>
  );
}

import { shareLink, webLink } from '@/lib/share';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { colors, groupSchema, timeAgo } from '@vicinity/shared';
import { confirmAction, notify } from '@/components/ReviewCard';
import { ReportSheet } from '@/components/ReportSheet';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Icon, IconButton, InlineError, ListSkeleton, Segmented, Sheet, TextField, Thumb, Toggle, Txt } from '@/components/ui';
import { useOrganization, useOrgGroups, useOrgInvitations, useOrgMembers } from '@/hooks/api';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useSearch } from '@/store/search';

type Tab = 'groups' | 'members' | 'invites';

export default function OrganizationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuth((s) => s.user);
  const q = useOrganization(id);
  const o = q.data;
  const isMember = !!o?.myRole;
  const isAdmin = o?.myRole === 'OWNER' || o?.myRole === 'ADMIN';
  const groups = useOrgGroups(o?.id);
  const members = useOrgMembers(o?.id, isMember);
  const invites = useOrgInvitations(o?.id, isAdmin);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('groups');
  const [groupOpen, setGroupOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [report, setReport] = useState(false);

  const refresh = () => {
    for (const k of ['organization', 'org-groups', 'org-members', 'org-invitations', 'organizations', 'my-groups']) void qc.invalidateQueries({ queryKey: [k] });
  };
  const join = useMutation({ mutationFn: () => api.post(`/organizations/${id}/join`), onSuccess: refresh, onError: (e) => notify('Could not join', toApiError(e).message) });
  const leave = useMutation({ mutationFn: () => api.post(`/organizations/${id}/leave`), onSuccess: refresh, onError: (e) => notify('Could not leave', toApiError(e).message) });
  const joinGroup = useMutation({ mutationFn: (gid: string) => api.post(`/groups/${gid}/join`), onSuccess: refresh, onError: (e) => notify('Could not join group', toApiError(e).message) });
  const setRole = useMutation({ mutationFn: ({ uid, role }: { uid: string; role: 'ADMIN' | 'MEMBER' }) => api.patch(`/organizations/${id}/members/${uid}`, { role }), onSuccess: refresh, onError: (e) => notify('Not allowed', toApiError(e).message) });
  const remove = useMutation({ mutationFn: (uid: string) => api.del(`/organizations/${id}/members/${uid}`), onSuccess: refresh, onError: (e) => notify('Not allowed', toApiError(e).message) });
  const revoke = useMutation({ mutationFn: (iid: string) => api.del(`/organizations/${id}/invitations/${iid}`), onSuccess: refresh });

  if (q.isLoading) return <Screen back><View className="px-margin"><ListSkeleton /></View></Screen>;
  if (q.isError || !o) return <Screen back><ErrorState error={q.error} onRetry={() => void q.refetch()} /></Screen>;

  const searchHere = (groupId?: string, groupName?: string) => {
    useSearch.setState((s) => ({ query: '', filters: { ...s.filters, organizationId: o.id, organizationName: o.name, groupId, groupName } }));
    router.push('/search');
  };

  return (
    <Screen back title={o.name} right={o.myRole === 'OWNER' ? undefined : <IconButton icon="flag" label="Report organization" onPress={() => setReport(true)} />}>
      <View className="gap-4 px-margin">
        <Card className="gap-3 p-4">
          <View className="flex-row items-center gap-3">
            <Thumb uri={o.logoUrl} name={o.name} icon="groups" size={64} />
            <View className="flex-1 gap-1">
              <Txt variant="headline-sm">{o.name}</Txt>
              <Txt variant="body-sm" className="text-on-surface-variant">{o.type.toLowerCase()}{o.locationName ? ` · ${o.locationName}` : ''}</Txt>
              <View className="flex-row flex-wrap gap-1.5">
                <Badge label={`${o.memberCount} member${o.memberCount === 1 ? '' : 's'}`} tone="neutral" icon="group" />
                {o.isPrivate ? <Badge label="Invite only" tone="neutral" icon="lock" /> : <Badge label="Public" tone="teal" />}
                {o.myRole ? <Badge label={`You: ${o.myRole.toLowerCase()}`} tone="navy" /> : null}
              </View>
            </View>
          </View>
          {o.description ? <Txt variant="body-md" className="text-ink-muted">{o.description}</Txt> : null}
          <View className="flex-row flex-wrap gap-2">
            {!user ? <Button title="Sign in to join" size="sm" onPress={() => router.push('/login')} /> : null}
            {user && !isMember && !o.isPrivate ? <Button title="Join" icon="group_add" size="sm" loading={join.isPending} onPress={() => join.mutate()} /> : null}
            {isMember ? <Button title="Search within" icon="search" size="sm" onPress={() => searchHere()} /> : null}
            {isAdmin ? <Button title="Invite" icon="person_add" size="sm" kind="secondary" onPress={() => setInviteOpen(true)} /> : null}
            {isAdmin ? <Button title="Settings" icon="settings" size="sm" kind="outline" onPress={() => router.push(`/organizations/${o.id}/edit`)} /> : null}
            {isMember && o.myRole !== 'OWNER' ? <Button title="Leave" size="sm" kind="ghost" onPress={() => confirmAction('Leave organization?', 'You will lose access to members-only listings.', () => leave.mutate(), 'Leave')} /> : null}
          </View>
        </Card>

        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'groups', label: `Groups (${groups.data?.length ?? o.groupCount})` },
            ...(isMember ? [{ value: 'members' as const, label: 'Members' }] : []),
            ...(isAdmin ? [{ value: 'invites' as const, label: 'Invitations' }] : []),
          ]}
        />

        {tab === 'groups' ? (
          <View className="gap-2">
            {isAdmin ? <Button title="Create group" icon="add" size="sm" kind="secondary" onPress={() => setGroupOpen(true)} /> : null}
            {groups.data?.length === 0 ? <EmptyState icon="workspaces" title="No groups yet" message={isAdmin ? 'Create groups like Youth Fellowship, Finance or Media Team.' : undefined} /> : null}
            {groups.data?.map((g) => (
              <Card key={g.id} onPress={() => router.push(`/groups/${g.id}`)} className="flex-row items-center gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-low"><Icon name="workspaces" size={20} color={colors.primaryDark} /></View>
                <View className="flex-1">
                  <Txt variant="label-lg">{g.name}</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{g.memberCount} member{g.memberCount === 1 ? '' : 's'}{g.isPrivate ? ' · private' : ''}</Txt>
                </View>
                {g.myRole ? <Badge label={g.myRole.toLowerCase()} tone="teal" /> : isMember && !g.isPrivate ? <Button title="Join" size="sm" kind="outline" onPress={() => joinGroup.mutate(g.id)} /> : null}
              </Card>
            ))}
          </View>
        ) : null}

        {tab === 'members' ? (
          <View className="gap-2">
            {members.isLoading ? <ListSkeleton rows={3} /> : null}
            {members.data?.map((m) => (
              <Card key={m.userId} className="flex-row items-center gap-3">
                <Thumb uri={m.avatarUrl} name={m.fullName} size={40} rounded="rounded-full" />
                <View className="flex-1">
                  <Txt variant="label-lg">{m.fullName}{m.userId === user?.id ? ' (you)' : ''}</Txt>
                  <Txt variant="body-sm" className="text-on-surface-variant">{m.role.toLowerCase()} · joined {timeAgo(m.joinedAt)}</Txt>
                </View>
                {isAdmin && m.userId !== user?.id && m.role !== 'OWNER' ? (
                  <View className="flex-row gap-1">
                    {o.myRole === 'OWNER' ? <Chip label={m.role === 'ADMIN' ? 'Make member' : 'Make admin'} onPress={() => setRole.mutate({ uid: m.userId, role: m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN' })} /> : null}
                    <IconButton icon="person_remove" tone="danger" size={32} label={`Remove ${m.fullName}`} onPress={() => confirmAction('Remove member?', m.fullName, () => remove.mutate(m.userId), 'Remove')} />
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}

        {tab === 'invites' ? (
          <View className="gap-2">
            <Button title="New invitation" icon="person_add" size="sm" onPress={() => setInviteOpen(true)} />
            {invites.data?.length === 0 ? <EmptyState icon="mail" title="No invitations yet" /> : null}
            {invites.data?.map((i) => (
              <Card key={i.id} className="gap-1">
                <View className="flex-row items-center justify-between">
                  <Txt variant="label-lg">Code: {i.code}</Txt>
                  <Badge label={i.status.toLowerCase()} tone={i.status === 'PENDING' ? 'teal' : 'neutral'} />
                </View>
                <Txt variant="body-sm" className="text-on-surface-variant">{[i.email ?? 'Anyone with the code', i.group ? `joins ${i.group.name}` : null, `as ${i.role.toLowerCase()}`, `expires ${i.expiresAt.slice(0, 10)}`].filter(Boolean).join(' · ')}</Txt>
                {i.status === 'PENDING' ? (
                  <View className="flex-row gap-2">
                    <Button title="Share" size="sm" kind="secondary" icon="share" onPress={() => void shareInvite(o.name, i.code)} />
                    <Button title="Revoke" size="sm" kind="ghost" onPress={() => revoke.mutate(i.id)} />
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        ) : null}
      </View>

      <GroupSheet visible={groupOpen} onClose={() => setGroupOpen(false)} orgId={o.id} onCreated={refresh} />
      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} orgId={o.id} orgName={o.name} groups={groups.data ?? []} isOwner={o.myRole === 'OWNER'} onCreated={refresh} />
      <ReportSheet visible={report} onClose={() => setReport(false)} targetType="ORGANIZATION" targetId={o.id} />
    </Screen>
  );
}

async function shareInvite(orgName: string, code: string) {
  await shareLink({ title: `Join ${orgName}`, text: `Join ${orgName} on Vicinity (code ${code}):`, url: webLink(`/invite/${code}`) });
}

function GroupSheet({ visible, onClose, orgId, onCreated }: { visible: boolean; onClose: () => void; orgId: string; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const m = useMutation({
    mutationFn: () => api.post(`/organizations/${orgId}/groups`, groupSchema.parse({ name, description, isPrivate })),
    onSuccess: () => {
      setName('');
      setDescription('');
      onCreated();
      onClose();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="New group" footer={<Button title="Create group" disabled={name.trim().length < 2} loading={m.isPending} onPress={() => m.mutate()} />}>
      <TextField label="Group name" value={name} onChangeText={setName} placeholder="e.g. Youth Fellowship" />
      <TextField label="Description" multiline value={description} onChangeText={setDescription} />
      <Toggle label="Private group" description="Only people an admin adds or invites can join" value={isPrivate} onChange={setIsPrivate} />
      <InlineError message={m.error ? toApiError(m.error).message : null} />
    </Sheet>
  );
}

function InviteSheet({ visible, onClose, orgId, orgName, groups, isOwner, onCreated }: { visible: boolean; onClose: () => void; orgId: string; orgName: string; groups: { id: string; name: string }[]; isOwner: boolean; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [maxUses, setMaxUses] = useState('20');
  const m = useMutation({
    mutationFn: () =>
      api.post<{ code: string }>(`/organizations/${orgId}/invitations`, {
        email: email.trim() || undefined,
        groupId,
        role,
        maxUses: email.trim() ? 1 : Math.max(1, Math.min(500, Number(maxUses) || 1)),
      }),
    onSuccess: () => onCreated(),
  });
  const close = () => {
    m.reset();
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title="Invite people" footer={m.isSuccess ? <Button title="Share invite" icon="share" onPress={() => void shareInvite(orgName, m.data.code)} /> : <Button title="Create invitation" loading={m.isPending} onPress={() => m.mutate()} />}>
      {m.isSuccess ? (
        <View className="items-center gap-2 py-4">
          <Txt variant="body-md" className="text-on-surface-variant">Invitation code</Txt>
          <Txt variant="headline-lg" selectable>{m.data.code}</Txt>
          <Txt variant="body-sm" className="text-center text-on-surface-variant">{email ? `If ${email} has an account they'll get a notification too.` : 'Anyone with this code can join until it is used up or expires.'}</Txt>
        </View>
      ) : (
        <>
          <TextField label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="Leave empty to create a shareable code" />
          {!email ? <TextField label="How many people can use it" value={maxUses} onChangeText={(t) => setMaxUses(t.replace(/\D/g, ''))} keyboardType="number-pad" /> : null}
          {groups.length ? (
            <View className="gap-2">
              <Txt variant="label-md" className="text-ink-muted">Also add to group</Txt>
              <View className="flex-row flex-wrap gap-2">
                <Chip label="No group" active={!groupId} onPress={() => setGroupId(null)} />
                {groups.map((g) => <Chip key={g.id} label={g.name} active={groupId === g.id} onPress={() => setGroupId(g.id)} />)}
              </View>
            </View>
          ) : null}
          {isOwner ? (
            <View className="flex-row gap-2">
              <Chip label="Member" active={role === 'MEMBER'} onPress={() => setRole('MEMBER')} />
              <Chip label="Administrator" active={role === 'ADMIN'} onPress={() => setRole('ADMIN')} />
            </View>
          ) : null}
          <InlineError message={m.error ? toApiError(m.error).message : null} />
        </>
      )}
    </Sheet>
  );
}


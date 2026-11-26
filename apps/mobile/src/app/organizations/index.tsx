import { plural } from '@/lib/share';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import type { Organization } from '@vicinity/shared';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, EmptyState, ErrorState, ListSkeleton, Segmented, TextField, Thumb, Txt } from '@/components/ui';
import { useMyInvitations, useOrganizations } from '@/hooks/api';
import { useAuth } from '@/store/auth';

export function OrgRow({ o }: { o: Organization }) {
  return (
    <Card onPress={() => router.push(`/organizations/${o.id}`)} className="flex-row items-center gap-3">
      <Thumb uri={o.logoUrl} name={o.name} icon="groups" size={52} />
      <View className="flex-1 gap-0.5">
        <Txt variant="headline-sm" numberOfLines={1}>{o.name}</Txt>
        <Txt variant="body-sm" className="text-on-surface-variant">{o.type.toLowerCase()} · {plural(o.memberCount, 'member')} · {plural(o.groupCount, 'group')}</Txt>
        <View className="flex-row gap-1.5">
          {o.myRole ? <Badge label={o.myRole.toLowerCase()} tone="teal" /> : null}
          {o.isPrivate ? <Badge label="Invite only" tone="neutral" icon="lock" /> : null}
        </View>
      </View>
    </Card>
  );
}

/** Organization discovery and "my organizations". */
export default function Organizations() {
  const params = useLocalSearchParams<{ mine?: string }>();
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const [tab, setTab] = useState<'discover' | 'mine'>(params.mine && signedIn ? 'mine' : 'discover');
  const [q, setQ] = useState('');
  const list = useOrganizations({ q: q.trim() || undefined, mine: tab === 'mine' });
  const invites = useMyInvitations();

  return (
    <Screen back title="Organizations" right={signedIn ? <Button title="Create" icon="add" size="sm" onPress={() => router.push('/organizations/new')} /> : undefined}>
      <View className="gap-3 px-margin">
        <Txt variant="body-md" className="text-on-surface-variant">Churches, companies, schools, clubs and neighbourhood groups. Members can share and find services within their community.</Txt>
        {signedIn ? <Segmented value={tab} onChange={setTab} options={[{ value: 'discover', label: 'Discover' }, { value: 'mine', label: 'My organizations' }]} /> : null}
        {invites.data?.length ? (
          <View className="gap-2">
            <Txt variant="label-md" className="text-ink-muted">INVITATIONS FOR YOU</Txt>
            {invites.data.map((i) => (
              <Card key={i.id} onPress={() => router.push(`/invite/${i.code}`)} className="flex-row items-center justify-between bg-primary-soft">
                <Txt variant="label-lg">{i.organization.name}{i.group ? ` · ${i.group.name}` : ''}</Txt>
                <Badge label="View" tone="teal" />
              </Card>
            ))}
          </View>
        ) : null}
        <TextField icon="search" placeholder="Search organizations" value={q} onChangeText={setQ} />
        {list.isLoading ? <ListSkeleton rows={3} /> : list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : null}
        {list.data?.length === 0 ? (
          <EmptyState icon="groups" title={tab === 'mine' ? "You haven't joined any yet" : 'No organizations found'} message={tab === 'mine' ? 'Join a public organization, accept an invitation, or create your own.' : undefined} action={signedIn ? { label: 'Create an organization', onPress: () => router.push('/organizations/new') } : undefined} />
        ) : null}
        {list.data?.map((o) => <OrgRow key={o.id} o={o} />)}
      </View>
    </Screen>
  );
}

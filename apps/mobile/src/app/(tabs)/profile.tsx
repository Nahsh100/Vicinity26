import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { confirmAction } from '@/components/ReviewCard';
import { Screen } from '@/components/Screen';
import { Badge, Button, Card, Divider, Icon, Thumb, Txt } from '@/components/ui';
import { useMyProvider, useUnreadMessages } from '@/hooks/api';
import { useAuth } from '@/store/auth';

function QuickTile({ icon, label, href, count }: { icon: string; label: string; href: Href; count?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => router.push(href)} className="flex-1 items-center gap-1.5 rounded-3xl bg-white py-4 shadow-card active:opacity-80">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-secondary-fixed/60">
        <Icon name={icon} size={22} color={colors.primaryDark} />
        {count ? (
          <View className="absolute -right-1.5 -top-1.5 min-w-5 items-center rounded-full border-2 border-white bg-primary px-1">
            <Txt variant="label-sm" className="text-white" style={{ fontSize: 10 }}>{count > 99 ? '99+' : count}</Txt>
          </View>
        ) : null}
      </View>
      <Txt variant="label-md">{label}</Txt>
    </Pressable>
  );
}

function Row({ icon, label, sub, href, onPress, danger }: { icon: string; label: string; sub?: string; href?: Href; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress ?? (() => href && router.push(href))} className="flex-row items-center gap-3 py-3 active:opacity-70">
      <View className={`h-9 w-9 items-center justify-center rounded-full ${danger ? 'bg-error-container' : 'bg-surface-container-low'}`}>
        <Icon name={icon} size={18} color={danger ? colors.error : colors.primaryDark} />
      </View>
      <View className="flex-1">
        <Txt variant="label-lg" className={danger ? 'text-error' : ''}>{label}</Txt>
        {sub ? <Txt variant="body-sm" className="text-on-surface-variant">{sub}</Txt> : null}
      </View>
      {!danger ? <Icon name="chevron_right" size={20} color={colors.outline} /> : null}
    </Pressable>
  );
}

export default function Profile() {
  const { status, user, logout } = useAuth();
  const provider = useMyProvider();
  const unread = useUnreadMessages();

  if (status !== 'signedIn' || !user) {
    return (
      <Screen title="Profile">
        <View className="gap-4 px-margin">
          <Card className="items-center gap-3 p-6">
            <Thumb name="Guest" icon="person" size={72} rounded="rounded-full" />
            <Txt variant="headline-md">Welcome to Vicinity</Txt>
            <Txt variant="body-md" className="text-center text-on-surface-variant">Sign in to save providers, write reviews, join your community and create your own storefront.</Txt>
            <Button title="Sign in" className="w-full" onPress={() => router.push('/login')} />
            <Button title="Create an account" kind="outline" className="w-full" onPress={() => router.push('/register')} />
          </Card>
          <Card>
            <Row icon="groups" label="Organizations" sub="Churches, companies, schools and clubs" href="/organizations" />
            <Divider />
            <Row icon="help_outline" label="Help & support" href="/help" />
          </Card>
        </View>
      </Screen>
    );
  }

  const p = provider.data;
  return (
    <Screen title="Profile">
      <View className="gap-4 px-margin">
        <Pressable onPress={() => router.push('/settings/profile')} className="flex-row items-center gap-4 overflow-hidden rounded-panel bg-primary-dark p-5 active:opacity-95">
          <View className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <Thumb uri={user.avatarUrl} name={user.fullName} size={64} rounded="rounded-full" ring />
          <View className="flex-1 gap-0.5">
            <Txt variant="headline-md" className="text-white" numberOfLines={1}>{user.fullName}</Txt>
            <Txt variant="body-sm" className="text-white/80" numberOfLines={1}>{user.email ?? user.phone?.replace(/^\+260/, '0') ?? ''}</Txt>
            {user.email && !user.emailVerified ? <View className="mt-1 self-start"><Badge label="Email not confirmed" tone="amber" icon="mark_email_unread" /></View> : null}
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-white/15"><Icon name="edit" size={18} color="#FFFFFF" /></View>
        </Pressable>

        <View className="flex-row gap-3">
          <QuickTile icon="event_available" label="Bookings" href="/bookings" />
          <QuickTile icon="chat" label="Messages" href="/messages" count={unread.data?.count} />
          <QuickTile icon="favorite" label="Saved" href="/saved" />
        </View>

        {user.email && !user.emailVerified ? (
          <Card className="flex-row items-center gap-3 bg-amber-soft" onPress={() => router.push('/verify-email')}>
            <Icon name="mark_email_unread" size={22} color="#92400E" />
            <Txt variant="body-md" className="flex-1">Confirm your email to write reviews and keep your account secure.</Txt>
            <Icon name="chevron_right" size={20} color="#92400E" />
          </Card>
        ) : null}

        <Card>
          <Txt variant="label-md" className="pb-1 text-on-surface-variant">MY BUSINESS</Txt>
          {user.providerId ? (
            <>
              <Row icon="dashboard" label="Provider dashboard" sub={p ? `${p.displayName} · ${p.status === 'ACTIVE' ? 'Live' : p.status === 'DRAFT' ? 'Not published yet' : p.status.toLowerCase()}` : undefined} href="/dashboard" />
              <Divider />
              <Row icon="sell" label="My listings" href="/dashboard/listings" />
              <Divider />
              <Row icon="photo_library" label="Portfolio" href="/dashboard/portfolio" />
              <Divider />
              <Row icon="storefront" label="View my public profile" href={p ? (`/provider/${p.slug}` as Href) : '/dashboard'} />
            </>
          ) : (
            <Row icon="add_business" label="Become a provider" sub="Free storefront: list services or products and get found nearby" href="/become-provider" />
          )}
        </Card>

        <Card>
          <Txt variant="label-md" className="pb-1 text-on-surface-variant">COMMUNITY</Txt>
          <Row icon="groups" label="My organizations" href="/organizations?mine=1" />
          <Divider />
          <Row icon="explore" label="Discover organizations" href="/organizations" />
        </Card>

        <Card>
          <Txt variant="label-md" className="pb-1 text-on-surface-variant">SETTINGS</Txt>
          <Row icon="person_outline" label="Personal information" href="/settings/profile" />
          <Divider />
          <Row icon="notifications_none" label="Notification preferences" href="/settings/notifications" />
          <Divider />
          <Row icon="lock_outline" label="Privacy" href="/settings/privacy" />
          <Divider />
          <Row icon="manage_accounts" label="Account & security" href="/settings/account" />
          <Divider />
          <Row icon="help_outline" label="Help & support" href="/help" />
          <Divider />
          <Row icon="logout" label="Log out" danger onPress={() => confirmAction('Log out?', 'You will need to sign in again.', () => void logout().then(() => router.replace('/')), 'Log out')} />
        </Card>
        <Txt variant="body-sm" className="pb-6 text-center text-on-surface-variant">Vicinity Zambia · Find. Connect. Support Local.</Txt>
      </View>
    </Screen>
  );
}

import { Link, router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { useUnreadCount, useUnreadMessages } from '@/hooks/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { LocationSheet } from './LocationSheet';
import { useWide } from './Screen';
import { BRAND_INK, BrandMark, type BrandTone } from './brand/Brand';
import { Button, Icon, Thumb, Txt } from './ui';

/**
 * Horizontal logo: the brand symbol plus the spaced VICINITY wordmark from the lockup.
 * `tone="light"` (default) for light surfaces, `"dark"` on dark backgrounds.
 */
export function Logo({ compact, size = 36, tone = 'light' }: { compact?: boolean; size?: number; tone?: BrandTone }) {
  return (
    <Pressable onPress={() => router.push('/')} accessibilityRole="link" accessibilityLabel="Vicinity home" className="flex-row items-center gap-2">
      <BrandMark size={size} tone={tone} />
      {!compact ? (
        <Txt variant="headline-md" style={{ fontSize: size * 0.5, letterSpacing: size * 0.09, color: BRAND_INK[tone] }}>
          VICINITY
        </Txt>
      ) : null}
    </Pressable>
  );
}

const WEB_NAV: { href: Href; label: string; match: string }[] = [
  { href: '/categories', label: 'Explore Categories', match: '/categor' },
  { href: '/search', label: 'Map Explorer', match: '/search' },
  { href: '/help', label: 'How It Works', match: '/help' },
  { href: '/bookings', label: 'My Bookings', match: '/bookings' },
  { href: '/messages', label: 'Messages', match: '/messages' },
];

function UnreadDot({ show }: { show: boolean }) {
  return show ? <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-error" /> : null;
}

/**
 * Top bar. Phones: logo mark, location selector, alerts bell, avatar (Stitch mobile header).
 * Desktop web: logo, location pill, primary navigation, search, alerts, "Become a Provider", avatar (Stitch web header).
 */
export function AppHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation((s) => s.location);
  const user = useAuth((s) => s.user);
  const unread = (useUnreadCount().data?.count ?? 0) + (useUnreadMessages().data?.count ?? 0);
  const wide = useWide();
  const vw = useWindowDimensions().width;
  const path = usePathname();

  if (wide) {
    return (
      <View className="z-10 bg-white/95 shadow-soft">
        <View className="h-[72px] w-full max-w-[1280px] flex-row items-center gap-4 self-center px-10">
          <Logo />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Location: ${location?.label ?? 'not set'}. Change location`}
            onPress={() => setOpen(true)}
            className="ml-2 h-11 flex-row items-center gap-2 rounded-full bg-surface-container-low px-4 active:bg-surface-container"
          >
            <Icon name="location_on" size={18} color={colors.primaryDark} />
            <Txt variant="label-md" numberOfLines={1} className="max-w-[140px]">{location?.label ? `${location.label}` : 'Choose location'}</Txt>
            <Icon name="expand_more" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
          <View className="min-w-0 flex-1 flex-row items-center justify-center gap-0.5 overflow-hidden">
            {WEB_NAV.filter((n) => vw >= 1440 || n.label !== 'How It Works').map((n) => {
              const active = path.startsWith(n.match);
              return (
                <Link key={n.label} href={n.href} asChild>
                  <Pressable className={`rounded-full px-3 py-2 ${active ? 'bg-secondary-fixed/60' : 'active:bg-surface-container-low'}`}>
                    <Txt variant="label-lg" className={active ? 'text-primary-dark' : 'text-on-surface-variant'}>{n.label}</Txt>
                  </Pressable>
                </Link>
              );
            })}
          </View>
          <Pressable accessibilityLabel="Search" onPress={() => router.push('/search')} className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-container-low">
            <Icon name="search" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications')} className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-container-low">
            <Icon name="notifications" size={22} color={colors.onSurfaceVariant} />
            <UnreadDot show={unread > 0} />
          </Pressable>
          {user?.providerId ? (
            <Button title="My Dashboard" kind="primary" size="md" onPress={() => router.push('/dashboard')} />
          ) : (
            <Button title="Become a Provider" kind="primary" size="md" onPress={() => router.push(user ? '/become-provider' : '/register')} />
          )}
          <Pressable accessibilityLabel={user ? 'Profile' : 'Sign in'} onPress={() => router.push(user ? '/profile' : '/login')} className="h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-primary-dark">
            {user?.avatarUrl ? <Thumb uri={user.avatarUrl} name={user.fullName} size={44} rounded="rounded-full" /> : <Icon name="person" size={22} color="#FFFFFF" />}
          </Pressable>
        </View>
        <LocationSheet visible={open} onClose={() => setOpen(false)} />
      </View>
    );
  }

  return (
    <View className="z-10 bg-white/95 shadow-soft">
      <View className="h-16 w-full flex-row items-center justify-between gap-2 px-margin">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Logo compact size={34} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Location: ${location?.label ?? 'not set'}. Change location`}
            onPress={() => setOpen(true)}
            className="h-11 min-w-0 justify-center rounded-full px-1.5 active:bg-surface-container-low"
          >
            <Txt variant="label-sm" className="font-semibold text-on-surface-variant" style={{ lineHeight: 12 }}>Location</Txt>
            <View className="flex-row items-center gap-0.5">
              <Txt variant="label-md" numberOfLines={1} className="max-w-[170px]">{location?.label ?? 'Choose location'}</Txt>
              <Icon name="expand_more" size={16} color={colors.primaryDark} />
            </View>
          </Pressable>
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ''}`} onPress={() => router.push('/notifications')} className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-container-low">
            <Icon name="notifications" size={22} color={colors.onSurfaceVariant} />
            <UnreadDot show={unread > 0} />
          </Pressable>
          <Pressable accessibilityLabel="Profile" onPress={() => router.push('/profile')} className="h-11 w-11 items-center justify-center">
            <Thumb uri={user?.avatarUrl} name={user?.fullName ?? 'Guest'} icon={user ? null : 'person'} size={32} rounded="rounded-full" ring />
          </Pressable>
        </View>
      </View>
      <LocationSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

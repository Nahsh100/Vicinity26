import { Link, router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
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

const WEB_NAV: { href: Href; label: string; match: string; icon: string }[] = [
  { href: '/categories', label: 'Explore Categories', match: '/categor', icon: 'grid_view' },
  { href: '/search', label: 'Map Explorer', match: '/search', icon: 'map' },
  { href: '/help', label: 'How It Works', match: '/help', icon: 'help' },
  { href: '/bookings', label: 'My Bookings', match: '/bookings', icon: 'calendar_month' },
  { href: '/messages', label: 'Messages', match: '/messages', icon: 'chat' },
];

/** Widths (px) at which the desktop header can show its links inline without clipping. */
const INLINE_NAV_MIN = 1360;
const INLINE_HELP_MIN = 1500;

function UnreadDot({ show }: { show: boolean }) {
  return show ? <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-error" /> : null;
}

/**
 * Menu button with every site destination, for widths where the links don't fit inline:
 * a dropdown under the header on desktop, a full-width sheet on phones.
 */
function NavMenu({ top }: { top: number }) {
  const [open, setOpen] = useState(false);
  const user = useAuth((s) => s.user);
  const messages = useUnreadMessages().data?.count ?? 0;
  const alerts = useUnreadCount().data?.count ?? 0;
  const path = usePathname();
  const { width, height } = useWindowDimensions();
  const panelWidth = Math.min(340, width - 24);
  const items: { href: Href; label: string; icon: string; active: boolean; badge?: number }[] = [
    { href: '/', label: 'Home', icon: 'home', active: path === '/' },
    ...WEB_NAV.map((n) => ({ href: n.href, label: n.label, icon: n.icon, active: path.startsWith(n.match), badge: n.href === '/messages' ? messages : undefined })),
    { href: '/notifications', label: 'Alerts', icon: 'notifications', active: path.startsWith('/notifications'), badge: alerts },
    { href: '/saved', label: 'Saved', icon: 'favorite', active: path.startsWith('/saved') },
    user?.providerId
      ? { href: '/dashboard', label: 'My Dashboard', icon: 'storefront', active: path.startsWith('/dashboard') }
      : { href: user ? '/become-provider' : '/register', label: 'Become a Provider', icon: 'storefront', active: path.startsWith('/become-provider') },
    user ? { href: '/profile', label: 'Profile & settings', icon: 'person', active: path.startsWith('/profile') } : { href: '/login', label: 'Sign in', icon: 'login', active: path.startsWith('/login') },
  ];
  const go = (href: Href) => {
    setOpen(false);
    router.push(href);
  };
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Open menu" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} className="h-11 w-11 items-center justify-center rounded-full active:bg-surface-container-low">
        <Icon name="menu" size={24} color={colors.onSurface} />
        <UnreadDot show={messages + alerts > 0} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close menu" onPress={() => setOpen(false)} className="flex-1 bg-navy/20">
          <View
            // Stop taps inside the panel from closing it.
            onStartShouldSetResponder={() => true}
            style={{ position: 'absolute', top, right: 12, width: panelWidth, maxHeight: height - top - 12 }}
            className="overflow-hidden rounded-3xl bg-white shadow-raised"
          >
            <ScrollView contentContainerClassName="p-2">
              {items.map((it) => (
                <Pressable
                  key={it.label}
                  accessibilityRole="link"
                  onPress={() => go(it.href)}
                  className={`h-12 flex-row items-center gap-3 rounded-2xl px-3 ${it.active ? 'bg-secondary-fixed/60' : 'active:bg-surface-container-low'}`}
                >
                  <Icon name={it.icon} size={20} color={it.active ? colors.primaryDark : colors.onSurfaceVariant} fill={it.active} />
                  <Txt variant="label-lg" className={`flex-1 ${it.active ? 'text-primary-dark' : 'text-on-surface'}`}>{it.label}</Txt>
                  {it.badge ? (
                    <View className="min-w-[22px] items-center rounded-full bg-error px-1.5 py-0.5">
                      <Txt variant="label-sm" className="text-white">{it.badge > 99 ? '99+' : it.badge}</Txt>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
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
  const inline = vw >= INLINE_NAV_MIN;

  if (wide) {
    return (
      <View className="z-10 bg-white/95 shadow-soft">
        <View className={`h-[72px] w-full max-w-[1440px] flex-row items-center self-center ${vw >= 1200 ? 'gap-4 px-10' : 'gap-2 px-6'}`}>
          <Logo />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Location: ${location?.label ?? 'not set'}. Change location`}
            onPress={() => setOpen(true)}
            className="ml-2 h-11 flex-row items-center gap-2 rounded-full bg-surface-container-low px-4 active:bg-surface-container"
          >
            <Icon name="location_on" size={18} color={colors.primaryDark} />
            <Txt variant="label-md" numberOfLines={1} className={vw >= 1200 ? 'max-w-[140px]' : 'max-w-[96px]'}>{location?.label ? `${location.label}` : 'Choose location'}</Txt>
            <Icon name="expand_more" size={18} color={colors.onSurfaceVariant} />
          </Pressable>
          {inline ? (
            <View className="min-w-0 flex-1 flex-row items-center justify-center gap-0.5">
              {WEB_NAV.filter((n) => vw >= INLINE_HELP_MIN || n.label !== 'How It Works').map((n) => {
                const active = path.startsWith(n.match);
                return (
                  <Link key={n.label} href={n.href} asChild>
                    <Pressable className={`rounded-full px-3 py-2 ${active ? 'bg-secondary-fixed/60' : 'active:bg-surface-container-low'}`}>
                      <Txt variant="label-lg" numberOfLines={1} className={active ? 'text-primary-dark' : 'text-on-surface-variant'}>{n.label}</Txt>
                    </Pressable>
                  </Link>
                );
              })}
            </View>
          ) : (
            <View className="flex-1" />
          )}
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
          {inline ? null : <NavMenu top={76} />}
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
          {Platform.OS === 'web' ? <NavMenu top={68} /> : null}
        </View>
      </View>
      <LocationSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

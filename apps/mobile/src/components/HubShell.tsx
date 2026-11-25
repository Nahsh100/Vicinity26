import { router, usePathname, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@vicinity/shared';
import { useUnreadCount, useUnreadMessages } from '@/hooks/api';
import { useAuth } from '@/store/auth';
import { useLocation } from '@/store/location';
import { Logo } from './AppHeader';
import { LocationSheet } from './LocationSheet';
import { useWide } from './Screen';
import { Icon, Thumb, Txt } from './ui';

const ITEMS: { href: Href; label: string; icon: string; match: string }[] = [
  { href: '/bookings', label: 'My Bookings', icon: 'event_available', match: '/bookings' },
  { href: '/messages', label: 'Messages Hub', icon: 'chat_bubble', match: '/messages' },
  { href: '/search', label: 'Find Pros', icon: 'explore', match: '/search' },
  { href: '/', label: 'Marketplace', icon: 'storefront', match: '__home' },
];

/**
 * Desktop layout for the Bookings and Messages hubs (Stitch "Web Bookings Dashboard" / "Web Messages Hub"):
 * fixed left sidebar + slim top bar. On phones it simply renders the children.
 */
export function HubShell({ children }: { children: React.ReactNode }) {
  const wide = useWide();
  const path = usePathname();
  const user = useAuth((s) => s.user);
  const location = useLocation((s) => s.location);
  const unread = (useUnreadCount().data?.count ?? 0) + (useUnreadMessages().data?.count ?? 0);
  const [locOpen, setLocOpen] = useState(false);
  if (!wide) return <>{children}</>;

  return (
    <SafeAreaView edges={['top']} className="flex-1 flex-row bg-surface">
      <View className="w-64 gap-2 bg-white px-4 py-6 shadow-soft">
        <View className="mb-6 px-2">
          <Logo size={36} />
        </View>
        {ITEMS.map((it) => {
          const active = it.match === '__home' ? false : path.startsWith(it.match);
          return (
            <Pressable
              key={it.label}
              onPress={() => router.push(it.href)}
              accessibilityRole="link"
              className={`h-12 flex-row items-center gap-3 rounded-full px-4 ${active ? 'bg-primary' : 'active:bg-surface-container-low'}`}
            >
              <Icon name={it.icon} size={22} color={active ? '#FFFFFF' : colors.onSurfaceVariant} />
              <Txt variant="label-lg" className={active ? 'text-white' : 'text-on-surface-variant'} style={{ fontSize: 15 }}>{it.label}</Txt>
            </Pressable>
          );
        })}
      </View>
      <View className="flex-1">
        <View className="h-16 flex-row items-center justify-between bg-white/95 px-8 shadow-soft">
          <Pressable onPress={() => setLocOpen(true)} accessibilityRole="button" className="flex-row items-center gap-2">
            <Icon name="location_on" size={20} color={colors.primaryDark} />
            <Txt variant="label-lg">{location?.label ? `${location.label} & Surrounds` : 'Choose your location'}</Txt>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <Pressable accessibilityLabel="Search" onPress={() => router.push('/search')} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-container-low">
              <Icon name="search" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable accessibilityLabel="Notifications" onPress={() => router.push('/notifications')} className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-container-low">
              <Icon name="notifications" size={22} color={colors.onSurfaceVariant} />
              {unread ? <View className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" /> : null}
            </Pressable>
            <Pressable accessibilityLabel="Profile" onPress={() => router.push('/profile')} className="h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-dark">
              {user?.avatarUrl ? <Thumb uri={user.avatarUrl} name={user.fullName} size={40} rounded="rounded-full" /> : <Icon name="person" size={20} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>
        <View className="flex-1">{children}</View>
      </View>
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </SafeAreaView>
  );
}

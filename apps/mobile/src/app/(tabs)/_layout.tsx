import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { colors } from '@vicinity/shared';
import { useWide } from '@/components/Screen';
import { Icon } from '@/components/ui';
import { useUnreadCount, useUnreadMessages } from '@/hooks/api';
import { prefsStorage } from '@/lib/storage';
import { useAuth } from '@/store/auth';

function TabIcon({ name, color, focused, dot }: { name: string; color: unknown; focused: boolean; dot?: boolean }) {
  return (
    <View>
      <Icon name={name} size={24} color={String(color)} fill={focused} />
      {dot ? <View className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-error" /> : null}
    </View>
  );
}

/**
 * Bottom navigation from the Stitch mobile screens: Home, Search, Bookings, Alerts, Profile.
 * On desktop web the bar is hidden and the top navigation (AppHeader) takes over.
 */
export default function TabsLayout() {
  const wide = useWide();
  const unread = (useUnreadCount().data?.count ?? 0) + (useUnreadMessages().data?.count ?? 0);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const needsName = useAuth((s) => s.status === 'signedIn' && !!s.user && !s.user.fullName);

  useEffect(() => {
    void prefsStorage.get<boolean>('vicinity.onboarded').then((v) => setOnboarded(!!v));
  }, []);

  if (onboarded === null) return null;
  if (!onboarded) return <Redirect href="/welcome" />;
  // Accounts created by phone sign-in start without a name.
  if (needsName) return <Redirect href="/complete-profile" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarLabelStyle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10, letterSpacing: 0.2 },
        tabBarStyle: wide
          ? { display: 'none' }
          : { height: 68, paddingTop: 6, paddingBottom: 8, borderTopWidth: 0, backgroundColor: 'rgba(255,255,255,0.97)', boxShadow: '0 -2px 12px rgba(0,0,0,0.05)' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color, focused }) => <TabIcon name="search" color={color} focused={focused} /> }} />
      <Tabs.Screen name="bookings" options={{ title: 'Bookings', tabBarIcon: ({ color, focused }) => <TabIcon name="calendar_month" color={color} focused={focused} /> }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarIcon: ({ color, focused }) => <TabIcon name="notifications" color={color} focused={focused} dot={unread > 0} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, focused }) => <TabIcon name="person" color={color} focused={focused} /> }} />
    </Tabs>
  );
}

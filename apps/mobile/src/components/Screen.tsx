import { router } from 'expo-router';
import { Platform, Pressable, RefreshControl, ScrollView, useWindowDimensions, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@vicinity/shared';
import { AppHeader } from './AppHeader';
import { Icon, Txt } from './ui';

/** Desktop web layout (Stitch web designs) from 1024 px; phones and tablets use the mobile layout. */
export const useWide = () => useWindowDimensions().width >= 1024;
export const isWeb = Platform.OS === 'web';

/** Page container: safe areas, cool surface background, centred max width on desktop web. */
export function Screen({
  children,
  scroll = true,
  title,
  subtitle,
  back,
  right,
  refreshing,
  onRefresh,
  edges = ['top'],
  contentClassName = '',
  maxWidth = 'max-w-3xl',
  header,
  nav = true,
  ...rest
}: {
  children: React.ReactNode;
  scroll?: boolean;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  edges?: ('top' | 'bottom')[];
  contentClassName?: string;
  maxWidth?: string;
  /** Desktop web: show the site top navigation above the page (default true). */
  nav?: boolean;
  /** Replaces the default page header (e.g. AppHeader). */
  header?: React.ReactNode;
} & Pick<ScrollViewProps, 'onScroll' | 'scrollEventThrottle' | 'keyboardShouldPersistTaps'>) {
  const wide = useWide();
  const top = header ?? (title || back ? <PageHeader title={title} subtitle={subtitle} back={back} right={right} maxWidth={maxWidth} /> : null);
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={`w-full ${maxWidth} self-center pb-28 ${contentClassName}`}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
      {...rest}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`w-full ${maxWidth} flex-1 self-center ${contentClassName}`}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-surface">
      {nav && wide && isWeb && !header ? <AppHeader /> : null}
      {top}
      {body}
    </SafeAreaView>
  );
}

export function BackButton({ tone = 'soft' }: { tone?: 'soft' | 'plain' }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      className={`h-10 w-10 items-center justify-center rounded-full ${tone === 'soft' ? 'bg-surface-container-low' : ''} active:opacity-70`}
    >
      <Icon name="arrow_back" size={22} color={colors.onSurface} />
    </Pressable>
  );
}

export function PageHeader({ title, subtitle, back, right, maxWidth = 'max-w-3xl' }: { title?: string; subtitle?: string; back?: boolean; right?: React.ReactNode; maxWidth?: string }) {
  return (
    <View className={`w-full ${maxWidth} flex-row items-center gap-3 self-center px-margin pb-2 pt-3`}>
      {back ? <BackButton /> : null}
      <View className="min-w-0 flex-1">
        <Txt variant={back ? 'headline-md' : 'headline-lg'} numberOfLines={1} accessibilityRole="header">
          {title ?? ''}
        </Txt>
        {subtitle ? <Txt variant="body-sm" className="text-on-surface-variant" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

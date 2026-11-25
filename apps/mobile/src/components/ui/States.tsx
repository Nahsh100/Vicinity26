import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { colors } from '@vicinity/shared';
import type { ApiError } from '@/lib/api';
import { Button } from './Button';
import { Icon } from './Icon';
import { Txt } from './Text';

/** Pulsing placeholder block for loading skeletons. */
export function Skeleton({ className = '' }: { className?: string }) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity }} className={`rounded-xl bg-surface-container ${className}`} />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View className="gap-3" accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row gap-3 rounded-card bg-white p-3">
          <Skeleton className="h-20 w-20" />
          <View className="flex-1 gap-2 py-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState({ icon = 'search_off', title, message, action }: { icon?: string; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="items-center gap-3 px-6 py-12">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-soft">
        <Icon name={icon} size={30} color={colors.primaryDark} />
      </View>
      <Txt variant="headline-sm" className="text-center">{title}</Txt>
      {message ? <Txt variant="body-md" className="text-center text-on-surface-variant">{message}</Txt> : null}
      {action ? <Button title={action.label} onPress={action.onPress} size="sm" className="mt-2" /> : null}
    </View>
  );
}

/** Error with retry; distinguishes offline from server errors and permission problems. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError | undefined;
  const offline = e?.isNetwork;
  const forbidden = e?.status === 403;
  const notFound = e?.status === 404;
  return (
    <EmptyState
      icon={offline ? 'wifi_off' : forbidden ? 'lock' : notFound ? 'help_outline' : 'error_outline'}
      title={offline ? "You're offline" : forbidden ? 'No access' : notFound ? 'Not found' : 'Something went wrong'}
      message={e?.message}
      action={onRetry && !notFound && !forbidden ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View className="flex-row items-center gap-2 rounded-2xl bg-error-container px-4 py-3" accessibilityRole="alert">
      <Icon name="error_outline" size={18} color={colors.error} />
      <Txt variant="body-md" className="flex-1 text-error">{message}</Txt>
    </View>
  );
}

export function Notice({ icon = 'info', message, tone = 'info' }: { icon?: string; message: string; tone?: 'info' | 'success' | 'warning' }) {
  const bg = { info: 'bg-secondary-fixed', success: 'bg-primary-soft', warning: 'bg-amber-soft' }[tone];
  const fg = { info: colors.secondary, success: colors.tertiary, warning: '#92400E' }[tone];
  return (
    <View className={`flex-row items-center gap-2 rounded-2xl px-4 py-3 ${bg}`}>
      <Icon name={icon} size={18} color={fg} />
      <Txt variant="body-md" className="flex-1" style={{ color: fg }}>{message}</Txt>
    </View>
  );
}

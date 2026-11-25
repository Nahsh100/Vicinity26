import { ActivityIndicator, Pressable, View } from 'react-native';
import { colors } from '@vicinity/shared';
import { Icon } from './Icon';
import { Txt } from './Text';

export type ButtonKind = 'primary' | 'brand' | 'soft' | 'tonal' | 'outline' | 'ghost' | 'danger' | 'white' | 'secondary' | 'onDark';

const STYLES: Record<ButtonKind, { box: string; text: string; icon: string }> = {
  // Teal pill (mobile CTAs) — "Primary Pill Button" in the design system.
  primary: { box: 'bg-primary shadow-glow', text: 'text-white', icon: '#FFFFFF' },
  // Deep teal used for the main web CTAs (Find Pros, Book Now, Confirm booking).
  brand: { box: 'bg-primary-dark', text: 'text-white', icon: '#FFFFFF' },
  soft: { box: 'bg-surface-container-low', text: 'text-on-surface', icon: colors.onSurface },
  secondary: { box: 'bg-surface-container-low', text: 'text-on-surface', icon: colors.onSurface },
  tonal: { box: 'bg-primary-fixed/30', text: 'text-primary-dark', icon: colors.primaryDark },
  outline: { box: 'bg-white border border-surface-container', text: 'text-on-surface', icon: colors.onSurface },
  ghost: { box: 'bg-transparent', text: 'text-primary-dark', icon: colors.primaryDark },
  danger: { box: 'bg-error-container/60', text: 'text-on-error-container', icon: '#93000A' },
  white: { box: 'bg-white', text: 'text-primary-dark', icon: colors.primaryDark },
  onDark: { box: 'bg-white/15', text: 'text-white', icon: '#FFFFFF' },
};

const SIZES = {
  sm: { box: 'h-9 px-4', text: 'label-md' as const, icon: 16 },
  md: { box: 'h-11 px-5', text: 'label-lg' as const, icon: 18 },
  lg: { box: 'h-12 px-6', text: 'label-lg' as const, icon: 20 },
};

/** Pill button (design system "Primary Pill Button": full pill, 44–48 px, semibold). */
export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  size = 'md',
  className = '',
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  accessibilityLabel?: string;
}) {
  const s = STYLES[kind];
  const z = SIZES[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={inactive ? undefined : onPress}
      className={`${z.box} flex-row items-center justify-center rounded-full ${s.box} ${inactive ? 'opacity-50' : 'active:opacity-85 active:scale-[0.98]'} ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={s.icon} />
      ) : (
        <View className="flex-row items-center gap-1.5">
          {icon ? <Icon name={icon} size={z.icon} color={s.icon} /> : null}
          <Txt variant={z.text} className={s.text} numberOfLines={1}>
            {title}
          </Txt>
          {iconRight ? <Icon name={iconRight} size={z.icon} color={s.icon} /> : null}
        </View>
      )}
    </Pressable>
  );
}

export type IconTone = 'neutral' | 'primary' | 'whatsapp' | 'plain' | 'danger' | 'glass' | 'tertiary' | 'slate' | 'solid';

/** Circular icon trigger (call / chat / favourite / back), 40 px default. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'neutral',
  size = 40,
  active,
  fill,
}: {
  icon: string;
  onPress?: () => void;
  label: string;
  tone?: IconTone;
  size?: number;
  active?: boolean;
  fill?: boolean;
}) {
  const bg = {
    neutral: 'bg-surface-container-low',
    primary: 'bg-primary-fixed/30',
    tertiary: 'bg-tertiary-fixed/30',
    whatsapp: 'bg-whatsapp-soft',
    slate: 'bg-surface-container-high',
    plain: 'bg-transparent',
    danger: 'bg-error-container/60',
    glass: 'bg-white/85',
    solid: 'bg-primary',
  }[tone];
  const fg = {
    neutral: colors.onSurface,
    primary: colors.primaryDark,
    tertiary: colors.tertiary,
    whatsapp: '#15803D',
    slate: '#071D30',
    plain: colors.outline,
    danger: '#93000A',
    glass: colors.outline,
    solid: '#FFFFFF',
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={{ width: size, height: size }}
      className={`items-center justify-center rounded-full ${bg} active:opacity-70`}
    >
      <Icon name={icon} size={Math.round(size * 0.48)} color={active ? colors.danger : fg} fill={fill ?? active} />
    </Pressable>
  );
}

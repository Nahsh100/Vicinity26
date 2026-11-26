import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { colors, formatDistance, initials } from '@vicinity/shared';
import { Icon } from './Icon';
import { Txt } from './Text';

/**
 * Stitch filter pill: h-8, no border, pale blue-grey fill (surface-container-low); teal when active.
 * `size="lg"` is the taller web filter-bar pill.
 */
export function Chip({
  label,
  active,
  icon,
  onPress,
  trailing = false,
  onClear,
  size = 'md',
  count,
}: {
  label: string;
  active?: boolean;
  icon?: string;
  onPress?: () => void;
  trailing?: boolean;
  onClear?: () => void;
  size?: 'md' | 'lg';
  count?: number;
}) {
  const fg = active ? '#FFFFFF' : colors.onSurfaceVariant;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityLabel={count !== undefined ? `${label} (${count})` : label}
      onPress={onPress}
      className={`${size === 'lg' ? 'h-10 px-4' : 'h-8 px-3'} flex-row items-center gap-1 rounded-full ${active ? 'bg-primary' : 'bg-surface-container-low active:bg-surface-container'}`}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 17 : 15} color={active ? '#FFFFFF' : colors.primaryDark} /> : null}
      <Txt variant="label-md" className={active ? 'text-white' : 'text-on-surface-variant'} numberOfLines={1}>
        {label}
      </Txt>
      {count !== undefined ? (
        <View className={`ml-0.5 min-w-5 items-center rounded-full px-1.5 ${active ? 'bg-white/25' : 'bg-white'}`}>
          <Txt variant="label-sm" className={active ? 'text-white' : 'text-on-surface-variant'}>{count}</Txt>
        </View>
      ) : null}
      {onClear ? (
        <Pressable accessibilityLabel={`Clear ${label}`} onPress={onClear} hitSlop={8}>
          <Icon name="close" size={14} color={fg} />
        </Pressable>
      ) : trailing ? (
        <Icon name="keyboard_arrow_down" size={16} color={active ? '#FFFFFF' : colors.outline} />
      ) : null}
    </Pressable>
  );
}

type BadgeTone = 'verified' | 'teal' | 'amber' | 'neutral' | 'navy' | 'error' | 'mint' | 'glass';

const BADGE: Record<BadgeTone, { box: string; fg: string }> = {
  verified: { box: 'bg-primary-fixed/40', fg: '#00352E' },
  teal: { box: 'bg-tertiary-fixed/30', fg: colors.tertiary },
  mint: { box: 'bg-tertiary-fixed/60', fg: '#002117' },
  amber: { box: 'bg-amber-soft', fg: '#78350F' },
  neutral: { box: 'bg-surface-container', fg: colors.onSurfaceVariant },
  navy: { box: 'bg-secondary-fixed/60', fg: colors.secondary },
  error: { box: 'bg-error-container/70', fg: '#93000A' },
  glass: { box: 'bg-white/90', fg: colors.onSurface },
};

/** Soft pill badge (h-5, 10 px bold). */
export function Badge({ label, tone = 'teal', icon, fill }: { label: string; tone?: BadgeTone; icon?: string; fill?: boolean }) {
  const t = BADGE[tone];
  return (
    <View className={`h-5 flex-row items-center gap-0.5 self-start rounded-full px-2 ${t.box}`}>
      {icon ? <Icon name={icon} size={12} color={tone === 'verified' ? colors.primaryDark : t.fg} fill={fill} /> : null}
      <Txt variant="label-sm" style={{ color: t.fg }} numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

export function VerifiedBadge({ label = 'Verified' }: { label?: string }) {
  return <Badge label={label} tone="verified" icon="verified" fill />;
}

export function TopRatedBadge() {
  return <Badge label="Top Rated" tone="amber" icon="workspace_premium" />;
}

/** Amber filled star + score + (count). */
export function Rating({ value, count, size = 'md', showEmpty = true }: { value: number; count?: number; size?: 'sm' | 'md'; showEmpty?: boolean }) {
  if (!count) return showEmpty ? <Txt variant="body-sm" className="text-on-surface-variant">New</Txt> : null;
  return (
    <View className="flex-row items-center gap-1" accessibilityLabel={`Rated ${value.toFixed(1)} out of 5 from ${count} reviews`}>
      <Icon name="star" size={size === 'sm' ? 14 : 16} color={colors.amber} fill />
      <Txt variant="label-md">{value.toFixed(1)}</Txt>
      <Txt variant="body-sm" className="text-on-surface-variant">({count})</Txt>
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View className="flex-row gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} disabled={!onChange} onPress={() => onChange?.(i)} accessibilityLabel={onChange ? `${i} star${i > 1 ? 's' : ''}` : undefined} hitSlop={4}>
          <Icon name="star" size={size} color={i <= Math.round(value) ? colors.amber : colors.outlineVariant} fill={i <= Math.round(value)} />
        </Pressable>
      ))}
    </View>
  );
}

export function Distance({ meters, area }: { meters: number | null; area?: string | null }) {
  const d = formatDistance(meters);
  if (!d && !area) return null;
  return (
    <View className="flex-row items-center gap-0.5">
      <Icon name="location_on" size={14} color={colors.primaryDark} />
      <Txt variant="label-md" className="text-secondary">{[d, area].filter(Boolean).join(' · ')}</Txt>
    </View>
  );
}

/** Palette of soft tints used for image placeholders and avatars, chosen from the name for variety. */
const TINTS = [
  { bg: '#E3FCF5', mid: '#B9F3E4', fg: '#006B54' },
  { bg: '#E6F0FF', mid: '#C9DCFB', fg: '#35485E' },
  { bg: '#FFF4E0', mid: '#FDE2B4', fg: '#92400E' },
  { bg: '#FDE8EC', mid: '#F8C8D2', fg: '#93000A' },
  { bg: '#EEEAFE', mid: '#D9D1FC', fg: '#4C3A9E' },
  { bg: '#E5F6FF', mid: '#C2E7FB', fg: '#0B5C83' },
] as const;

export const tintFor = (name: string) => TINTS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length]!;

/**
 * Image with a designed fallback. Most informal providers start without photos, so the placeholder
 * is a soft tint with a decorative circle and the category's outlined icon (or initials for people).
 */
export function Thumb({
  uri,
  name,
  icon,
  size = 64,
  height,
  rounded = 'rounded-thumb',
  className = '',
  ring,
}: {
  uri?: string | null;
  name: string;
  icon?: string | null;
  size?: number | '100%';
  height?: number;
  rounded?: string;
  className?: string;
  ring?: boolean;
}) {
  const t = tintFor(name);
  const h = height ?? (typeof size === 'number' ? size : 120);
  const w = typeof size === 'number' ? size : 160;
  const ref = Math.min(h, w);
  return (
    <View
      style={{ width: size, height: h, backgroundColor: t.bg }}
      className={`items-center justify-center overflow-hidden ${rounded} ${ring ? 'border-2 border-primary-fixed' : ''} ${className}`}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} accessibilityLabel={name} />
      ) : (
        <>
          <View style={{ position: 'absolute', width: ref * 1.1, height: ref * 1.1, borderRadius: ref, backgroundColor: t.mid, opacity: 0.55, right: -ref * 0.35, bottom: -ref * 0.45 }} />
          <View style={{ position: 'absolute', width: ref * 0.5, height: ref * 0.5, borderRadius: ref, backgroundColor: '#FFFFFF', opacity: 0.45, left: -ref * 0.12, top: -ref * 0.12 }} />
          {icon ? (
            <Icon name={icon} size={Math.max(18, Math.min(48, ref * 0.38))} color={t.fg} />
          ) : (
            <Txt variant={ref > 56 ? 'headline-md' : 'label-lg'} style={{ color: t.fg }}>
              {initials(name)}
            </Txt>
          )}
        </>
      )}
    </View>
  );
}

export function SectionHeader({ title, action, onAction, subtitle, eyebrow, live }: { title: string; action?: string; onAction?: () => void; subtitle?: string; eyebrow?: string; live?: boolean }) {
  return (
    <View className="flex-row items-end justify-between px-margin pb-1">
      <View className="flex-1">
        {eyebrow ? (
          <View className="mb-1 flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-primary-dark" />
            <Txt variant="eyebrow" className="text-primary-dark">{eyebrow}</Txt>
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Txt variant="headline-md">{title}</Txt>
          {live ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
        </View>
        {subtitle ? <Txt variant="body-sm" className="text-on-surface-variant">{subtitle}</Txt> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" className="flex-row items-center gap-0.5 py-1">
          <Txt variant="label-lg" className="text-primary-dark">{action}</Txt>
          <Icon name="arrow_forward" size={18} color={colors.primaryDark} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** White card with the design system's ambient shadow (no border). */
export function Card({ children, className = '', onPress }: { children: React.ReactNode; className?: string; onPress?: () => void }) {
  const cls = `rounded-3xl bg-white p-4 shadow-card ${className}`;
  return onPress ? (
    <Pressable onPress={onPress} className={`${cls} active:opacity-90`}>
      {children}
    </Pressable>
  ) : (
    <View className={cls}>{children}</View>
  );
}

export function Divider({ className = '' }: { className?: string }) {
  return <View className={`h-px bg-surface-container ${className}`} />;
}

/** Small "pill with icon + text" used for meta rows (time, location, price notes). */
export function MetaPill({ icon, label, tone = 'neutral' }: { icon: string; label: string; tone?: 'neutral' | 'blue' | 'teal' }) {
  const box = { neutral: 'bg-surface-container-low', blue: 'bg-secondary-fixed/60', teal: 'bg-tertiary-fixed/30' }[tone];
  return (
    <View className={`h-6 flex-row items-center gap-1 self-start rounded-full px-2.5 ${box}`}>
      <Icon name={icon} size={13} color={tone === 'teal' ? colors.tertiary : colors.secondary} />
      <Txt variant="label-md" className="text-on-secondary-fixed" style={{ fontSize: 11 }}>
        {label}
      </Txt>
    </View>
  );
}

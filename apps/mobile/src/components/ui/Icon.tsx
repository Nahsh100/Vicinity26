import { memo } from 'react';
import { Platform, type ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@vicinity/shared';
import { ICON_ALIASES, ICONS } from './icons.generated';

/**
 * Material Symbols Outlined (weight 400) — the icon set used throughout the Stitch designs.
 * `fill` switches to the filled variant (active favourites, rating stars, verified ticks).
 * Icons are compiled from SVG by `pnpm --filter @vicinity/mobile icons`; unknown names fall back to "category".
 */
export const Icon = memo(function Icon({
  name,
  size = 20,
  color = colors.onSurfaceVariant,
  fill = false,
}: {
  name: string;
  size?: number;
  color?: ColorValue | string;
  fill?: boolean;
}) {
  const key = ICON_ALIASES[name] ?? name.replace(/-/g, '_');
  const paths = ICONS[key] ?? ICONS.category!;
  return (
    <Svg width={size} height={size} viewBox="0 -960 960 960" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })} pointerEvents="none">
      <Path d={fill ? paths[1] : paths[0]} fill={(color ?? undefined) as string} />
    </Svg>
  );
});

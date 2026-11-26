import { SvgXml } from 'react-native-svg';
import { LOCKUP_DARK, LOCKUP_LIGHT, SYMBOL_DARK, SYMBOL_LIGHT, SYMBOL_SMALL_DARK, SYMBOL_SMALL_LIGHT } from './marks.generated';

export type BrandTone = 'light' | 'dark';

/** Wordmark colours from the designer's lockups. */
export const BRAND_INK = { light: '#06332E', dark: '#F2FFFC' } as const;
export const BRAND_ACCENT = { light: '#0EA88E', dark: '#1FDDBB' } as const;

/**
 * The hexagon "V" symbol. `light` is for light surfaces (the app's default), `dark` for dark ones.
 * Below 64 px the simplified "small" artwork is used: the clock ticks would turn to noise.
 */
export function BrandMark({ size = 36, tone = 'light' }: { size?: number; tone?: BrandTone }) {
  const small = size < 64;
  const xml = tone === 'dark' ? (small ? SYMBOL_SMALL_DARK : SYMBOL_DARK) : small ? SYMBOL_SMALL_LIGHT : SYMBOL_LIGHT;
  return <SvgXml xml={xml} width={size} height={size} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Stacked lockup: symbol, VICINITY and the "Verified local network" tagline. For hero placements (≥ 160 px wide). */
export function BrandLockup({ width = 220, tone = 'light' }: { width?: number; tone?: BrandTone }) {
  return <SvgXml xml={tone === 'dark' ? LOCKUP_DARK : LOCKUP_LIGHT} width={width} height={(width * 820) / 1000} accessibilityLabel="Vicinity, verified local network" />;
}

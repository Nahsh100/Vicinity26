/**
 * Vicinity design tokens, taken from the Stitch project "Vicinity Local Services Marketplace"
 * (design system "Vicinity Design System"). Mobile (NativeWind) and admin (Tailwind) both
 * build their themes from these values: do not hardcode colours elsewhere.
 */
export const colors = {
  primary: '#00A896',
  primaryDark: '#006B5F',
  primaryContainer: '#00A896',
  onPrimary: '#FFFFFF',
  mint: '#02C39A',
  mintSoft: '#E6F8F5',
  primaryFixed: '#79F7E3',
  tertiary: '#006B54',
  tertiaryFixed: '#65FBCF',
  navy: '#0F2438',
  onSurface: '#0B1C30',
  onSurfaceVariant: '#3C4946',
  secondary: '#4D6077',
  secondaryContainer: '#CDE2FC',
  secondaryFixed: '#D0E4FF',
  surface: '#F8F9FF',
  background: '#F8FAFC',
  card: '#FFFFFF',
  surfaceLow: '#EFF4FF',
  surfaceContainer: '#E5EEFF',
  surfaceHigh: '#DCE9FF',
  surfaceHighest: '#D3E4FE',
  border: '#E2E8F0',
  outline: '#6C7A76',
  outlineVariant: '#BBCAC5',
  muted: '#64748B',
  placeholder: '#94A3B8',
  amber: '#F59E0B',
  amberSoft: '#FEF3C7',
  violetSoft: '#EDE9FE',
  whatsapp: '#25D366',
  whatsappSoft: '#DCFCE7',
  whatsappDark: '#16A34A',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  danger: '#EF4444',
} as const;

export const radii = { sm: 8, md: 12, lg: 16, xl: 24, pill: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const typography = {
  headlineLg: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  headlineMd: { fontSize: 20, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  headlineSm: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  bodyLg: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyMd: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  bodySm: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  labelLg: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  labelSm: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0.2 },
} as const;

export const fontFamily = 'Plus Jakarta Sans';

/** Pastel tile tints for category icons, rotated by category sort order. */
export const categoryTints = [
  { bg: '#E6F8F5', fg: '#006B54' },
  { bg: '#D0E4FF', fg: '#006B5F' },
  { bg: '#D3E4FE', fg: '#4D6077' },
  { bg: '#FFDAD6', fg: '#93000A' },
  { bg: '#DCE9FF', fg: '#071D30' },
  { bg: '#C9FBF2', fg: '#006B5F' },
  { bg: '#EDE9FE', fg: '#35485E' },
  { bg: '#FEF3C7', fg: '#92400E' },
] as const;

export const shadows = {
  card: '0 2px 8px -2px rgba(15, 36, 56, 0.05)',
  raised: '0 8px 24px -4px rgba(15, 36, 56, 0.10)',
} as const;

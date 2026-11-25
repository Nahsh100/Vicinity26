/**
 * Theme from the Stitch "Vicinity Design System" (see packages/shared/src/tokens.ts and DESIGN_SYSTEM.md).
 * Colour names follow the Stitch / Material 3 roles so screens can be transcribed from the designs 1:1.
 * Use these tokens; avoid arbitrary colours and spacing in components.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // Required on web: Expo sets the colour scheme manually, which NativeWind only allows in class mode.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand
        primary: { DEFAULT: '#00A896', dark: '#006B5F', fixed: '#79F7E3', 'fixed-dim': '#59DBC7', soft: '#E6F8F5' },
        'primary-container': '#00A896',
        'on-primary-container': '#00352E',
        mint: '#02C39A',
        tertiary: { DEFAULT: '#006B54', fixed: '#65FBCF', container: '#00A985' },
        'on-tertiary-fixed': '#002117',
        navy: '#0F2438',
        // Text
        ink: { DEFAULT: '#0B1C30', muted: '#3C4946' },
        'on-surface': '#0B1C30',
        'on-surface-variant': '#3C4946',
        // Secondary (slate blue)
        secondary: { DEFAULT: '#4D6077', container: '#CDE2FC', fixed: '#D0E4FF' },
        'on-secondary-container': '#51647B',
        'on-secondary-fixed': '#071D30',
        'on-secondary-fixed-variant': '#35485E',
        // Surfaces (cool off-white canvas, white cards)
        surface: { DEFAULT: '#F8F9FF', low: '#EFF4FF', container: '#E5EEFF', high: '#DCE9FF', highest: '#D3E4FE', variant: '#D3E4FE' },
        'surface-container-lowest': '#FFFFFF',
        'surface-container-low': '#EFF4FF',
        'surface-container': '#E5EEFF',
        'surface-container-high': '#DCE9FF',
        'surface-container-highest': '#D3E4FE',
        card: '#FFFFFF',
        line: '#E2E8F0',
        outline: { DEFAULT: '#6C7A76', variant: '#BBCAC5' },
        muted: '#64748B',
        placeholder: '#94A3B8',
        // Semantic
        amber: { DEFAULT: '#F59E0B', soft: '#FEF3C7', dark: '#92400E' },
        whatsapp: { DEFAULT: '#25D366', soft: '#DCFCE7', dark: '#15803D' },
        error: { DEFAULT: '#BA1A1A', container: '#FFDAD6' },
        'on-error-container': '#93000A',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: ['PlusJakartaSans_400Regular'],
        semibold: ['PlusJakartaSans_600SemiBold'],
        bold: ['PlusJakartaSans_700Bold'],
        extrabold: ['PlusJakartaSans_800ExtraBold'],
      },
      fontSize: {
        display: ['44px', { lineHeight: '50px', letterSpacing: '-1.2px' }],
        'display-sm': ['32px', { lineHeight: '38px', letterSpacing: '-0.8px' }],
        'headline-lg': ['26px', { lineHeight: '34px', letterSpacing: '-0.5px' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.2px' }],
        'headline-sm': ['16px', { lineHeight: '22px', letterSpacing: '-0.1px' }],
        'body-lg': ['15px', { lineHeight: '22px' }],
        'body-md': ['13px', { lineHeight: '18px' }],
        'body-sm': ['12px', { lineHeight: '16px' }],
        'label-lg': ['14px', { lineHeight: '18px' }],
        'label-md': ['12px', { lineHeight: '16px' }],
        'label-sm': ['10px', { lineHeight: '14px', letterSpacing: '0.2px' }],
      },
      spacing: { gutter: '12px', margin: '16px' },
      borderRadius: { card: '16px', tile: '16px', thumb: '12px', panel: '28px' },
      boxShadow: {
        // Stitch: whisper-soft ambient shadows instead of borders.
        card: '0 2px 10px rgba(11, 28, 48, 0.06)',
        soft: '0 1px 8px rgba(0, 0, 0, 0.04)',
        raised: '0 8px 24px -4px rgba(15, 36, 56, 0.10)',
        up: '0 -2px 12px rgba(0, 0, 0, 0.05)',
        glow: '0 4px 12px rgba(0, 168, 150, 0.35)',
      },
    },
  },
  plugins: [],
};

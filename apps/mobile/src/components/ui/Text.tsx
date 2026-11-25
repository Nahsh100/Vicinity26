import { Text, type TextProps } from 'react-native';

export type TextVariant =
  | 'display'
  | 'display-sm'
  | 'headline-lg'
  | 'headline-md'
  | 'headline-sm'
  | 'body-lg'
  | 'body-md'
  | 'body-sm'
  | 'label-lg'
  | 'label-md'
  | 'label-sm'
  | 'eyebrow';

// Full class names (Tailwind only generates classes it can see literally in source).
const CLASS: Record<TextVariant, string> = {
  display: 'text-display font-extrabold',
  'display-sm': 'text-display-sm font-extrabold',
  'headline-lg': 'text-headline-lg font-bold',
  'headline-md': 'text-headline-md font-bold',
  'headline-sm': 'text-headline-sm font-bold',
  'body-lg': 'text-body-lg font-sans',
  'body-md': 'text-body-md font-sans',
  'body-sm': 'text-body-sm font-sans',
  'label-lg': 'text-label-lg font-semibold',
  'label-md': 'text-label-md font-semibold',
  'label-sm': 'text-label-sm font-bold',
  eyebrow: 'text-label-sm font-bold uppercase tracking-widest',
};

/**
 * Typography from the Stitch type scale (Plus Jakarta Sans). Each variant maps to a font file,
 * because native platforms choose weights by file, not by fontWeight.
 */
export function Txt({ variant = 'body-md', className = '', ...props }: TextProps & { variant?: TextVariant; className?: string }) {
  // Default colour only when the caller sets none (conflicting colour classes resolve by CSS order, not class order).
  const hasColor = /(^|\s)text-(?!display|headline|body|label|center|left|right)\S+/.test(className);
  return <Text {...props} className={`${CLASS[variant]} ${hasColor ? '' : 'text-on-surface'} ${className}`} />;
}

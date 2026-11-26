import { Platform, Share } from 'react-native';
import { notify } from '@/components/ReviewCard';

/** Public web address of the app, used in shared links so they open for anyone (with or without the app). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://vicinityzambia.com').replace(/\/+$/, '');

/** Absolute link to a path in the web app. On web it uses the current origin (works on preview deployments too). */
export function webLink(path: string): string {
  const base = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : WEB_URL;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Shares a link. Phones: the system share sheet. Web: the browser share sheet where it exists
 * (mostly mobile browsers), otherwise the link is copied and the user is told so.
 */
export async function shareLink({ title, text, url }: { title: string; text: string; url: string }): Promise<void> {
  if (Platform.OS !== 'web') {
    await Share.share({ title, message: `${text} ${url}` }).catch(() => undefined);
    return;
  }
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title, text, url });
      return;
    } catch (e) {
      // The user closed the sheet: nothing to do.
      if ((e as Error).name === 'AbortError') return;
    }
  }
  try {
    await nav?.clipboard?.writeText(url);
    notify('Link copied', url);
  } catch {
    notify('Copy this link', url);
  }
}

/** "1 member", "3 members". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

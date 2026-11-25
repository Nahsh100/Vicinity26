import { router } from 'expo-router';
import type { ConversationSummary } from '@vicinity/shared';
import { useAuth } from '@/store/auth';
import { api, toApiError } from './api';

/** Opens (or starts) the in-app conversation with a provider. */
export async function openChat(providerId: string): Promise<void> {
  if (useAuth.getState().status !== 'signedIn') {
    router.push('/login');
    return;
  }
  try {
    const c = await api.post<ConversationSummary>('/conversations', { providerId });
    router.push(`/messages/${c.id}`);
  } catch (e) {
    const { notify } = await import('@/components/ReviewCard');
    notify('Could not open chat', toApiError(e).message);
  }
}

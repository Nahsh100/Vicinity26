import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/store/auth';
import { api } from './api';
import { notificationTarget } from './notificationRoutes';
import { queryClient } from './queryClient';

/**
 * Opens the right screen when a push notification is tapped: whether the tap launched the app
 * from closed or brought it back from the background (`useLastNotificationResponse` covers both).
 * `ready` waits until the session is restored and the navigator is mounted.
 */
export function useNotificationTaps(ready: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !response) return;
    // Only the plain tap; action buttons (none yet) would have their own identifiers.
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = response.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;

    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    const signedIn = useAuth.getState().status === 'signedIn';
    if (signedIn && typeof data.notificationId === 'string') {
      void api
        .post(`/notifications/${data.notificationId}/read`)
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          void queryClient.invalidateQueries({ queryKey: ['unread-count'] });
        })
        .catch(() => undefined);
    }
    // Every notification is for a signed-in user; if the session ended, sign in first.
    const href: Href = signedIn ? (notificationTarget(data)?.href ?? '/notifications') : '/login';
    // Let the navigator finish mounting before navigating (cold start).
    const t = setTimeout(() => router.push(href), 0);
    Notifications.clearLastNotificationResponse();
    return () => clearTimeout(t);
  }, [ready, response]);
}

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAuthMethods } from '@/hooks/api';
import { InlineError } from '../ui';
import { OrDivider, useSocialSubmit } from './shared';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleIdApi {
  initialize(options: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: 'popup'; use_fedcm_for_prompt?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, unknown>): void;
}
type WithGoogle = Window & { google?: { accounts?: { id?: GoogleIdApi } } };

let gisLoad: Promise<GoogleIdApi> | null = null;
/** Loads Google Identity Services once. */
function loadGis(): Promise<GoogleIdApi> {
  gisLoad ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const ready = () => {
      const id = (window as WithGoogle).google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('Google sign-in failed to load'));
    };
    if ((window as WithGoogle).google?.accounts?.id) return ready();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = ready;
    s.onerror = () => {
      gisLoad = null;
      reject(new Error('Google sign-in could not load. Check your connection.'));
    };
    document.head.appendChild(s);
  });
  return gisLoad;
}

/**
 * Web: Google's own "Sign in with Google" button (Google Identity Services), which hands back an ID
 * token directly. Apple sign-in on the web needs an Apple Services ID and is not enabled yet.
 */
export function SocialSignIn() {
  const methods = useAuthMethods();
  const { run, error, setError } = useSocialSubmit();
  const host = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const enabled = !!methods.data?.google && !!WEB_CLIENT_ID;
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled || !host.current || !width) return;
    let cancelled = false;
    loadGis()
      .then((id) => {
        if (cancelled || !host.current) return;
        id.initialize({
          client_id: WEB_CLIENT_ID,
          ux_mode: 'popup',
          use_fedcm_for_prompt: true,
          callback: (r) => {
            if (r.credential) void runRef.current('google', async () => ({ idToken: r.credential! }));
          },
        });
        host.current.innerHTML = '';
        id.renderButton(host.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'left', width: Math.min(400, Math.round(width)) });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [enabled, width, setError]);

  if (!enabled) return null;
  return (
    <View className="gap-3" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="min-h-[44px] items-center">
        <div ref={host} />
      </View>
      <InlineError message={error} />
      <OrDivider />
    </View>
  );
}

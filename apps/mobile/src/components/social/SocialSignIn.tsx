import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useAuthMethods } from '@/hooks/api';
import { InlineError } from '../ui';
import { GoogleButton, OrDivider, useSocialSubmit } from './shared';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

/**
 * The native Google module is only in development/store builds, not Expo Go: load it lazily so the
 * app still runs there (the button is simply hidden).
 */
function loadGoogle(): GoogleModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    return null;
  }
}

const googleNativeReady = (() => {
  if (!WEB_CLIENT_ID) return false;
  // iOS also needs the URL scheme added by the config plugin (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID at build time).
  if (Platform.OS === 'ios' && !(Constants.expoConfig?.extra as { googleNativeConfigured?: boolean } | undefined)?.googleNativeConfigured) return false;
  return true;
})();

let configured = false;

/** Phones: "Continue with Google" (Android + iOS) and Sign in with Apple (iOS). Renders nothing when neither is available. */
export function SocialSignIn() {
  const methods = useAuthMethods();
  const { run, busy, error } = useSocialSubmit();
  const [google, setGoogle] = useState<GoogleModule | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (methods.data?.google && googleNativeReady) {
      const g = loadGoogle();
      if (g && !configured) {
        g.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID || undefined });
        configured = true;
      }
      setGoogle(g);
    }
    if (methods.data?.apple && Platform.OS === 'ios') void AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, [methods.data?.google, methods.data?.apple]);

  if (!google && !appleAvailable) return null;

  const signInWithGoogle = () =>
    run('google', async () => {
      const { GoogleSignin, isErrorWithCode, statusCodes } = google!;
      try {
        if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const res = await GoogleSignin.signIn();
        if (res.type !== 'success') return null;
        if (!res.data.idToken) throw new Error('Google did not return a sign-in token. Check the web client ID.');
        return { idToken: res.data.idToken };
      } catch (e) {
        if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) return null;
        throw e;
      }
    });

  const signInWithApple = () =>
    run('apple', async () => {
      try {
        const c = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
        });
        if (!c.identityToken) throw new Error('Apple did not return a sign-in token.');
        // Apple shares the name only on the very first sign-in, and only with the app.
        const fullName = [c.fullName?.givenName, c.fullName?.familyName].filter(Boolean).join(' ') || undefined;
        return { idToken: c.identityToken, fullName };
      } catch (e) {
        if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
        throw e;
      }
    });

  return (
    <View className="gap-3">
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={24}
          style={{ height: 48, width: '100%' }}
          onPress={() => void signInWithApple()}
        />
      ) : null}
      {google ? <GoogleButton busy={busy === 'google'} disabled={!!busy} onPress={() => void signInWithGoogle()} /> : null}
      <InlineError message={error} />
      <OrDivider />
    </View>
  );
}

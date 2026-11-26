// Extends app.json with values that come from environment variables (app.json cannot read them).
//
// GOOGLE_MAPS_ANDROID_API_KEY: Maps SDK for Android key, restricted to package zm.vicinity.app + your signing SHA-1.
//   Without it, Android store builds show the radar view instead of Google Maps (iOS uses Apple Maps, no key).
// EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: Google Sign-In iOS OAuth client ID ("<id>.apps.googleusercontent.com").
//   The native Google Sign-In plugin needs its reversed form as a URL scheme, derived here. Without it,
//   the native Google button is hidden (web uses EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID only).
module.exports = ({ config }) => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const iosUrlScheme = iosClientId ? `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}` : '';

  const plugins = [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: androidKey }], 'expo-apple-authentication'];
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);

  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: true },
    plugins,
    extra: { ...config.extra, androidMapsConfigured: androidKey.length > 0, googleNativeConfigured: iosUrlScheme.length > 0 },
  };
};

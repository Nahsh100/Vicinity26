// Extends app.json. app.json cannot read environment variables, so the Google Maps key is added here.
// GOOGLE_MAPS_ANDROID_API_KEY: Maps SDK for Android key, restricted to package zm.vicinity.app + your signing SHA-1.
// Without it, Android store builds show the radar view instead of Google Maps (iOS uses Apple Maps, no key).
module.exports = ({ config }) => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '';
  return {
    ...config,
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey: androidKey }]],
    extra: { ...config.extra, androidMapsConfigured: androidKey.length > 0 },
  };
};

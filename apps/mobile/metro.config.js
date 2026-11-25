const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo's default config detects the pnpm workspace (packages/shared) automatically.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });

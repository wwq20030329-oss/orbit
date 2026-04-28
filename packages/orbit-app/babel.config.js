module.exports = function (api) {
  // Cache the babel config per environment rather than unconditionally,
  // so that flipping APP_ENV between dev and production invalidates the
  // cached result and the console-stripping plugin is re-evaluated.
  const appEnv = process.env.APP_ENV || 'development';
  api.cache.using(() => appEnv);

  // Determine which worklets plugin to use based on installed versions
  // Reanimated v4+ uses react-native-worklets/plugin
  // Reanimated v3.x uses react-native-reanimated/plugin
  let workletsPlugin = 'react-native-worklets/plugin';
  try {
    const reanimatedVersion = require('react-native-reanimated/package.json').version;
    const majorVersion = parseInt(reanimatedVersion.split('.')[0], 10);

    // For Reanimated v3.x, use the old plugin
    if (majorVersion < 4) {
      workletsPlugin = 'react-native-reanimated/plugin';
    }
  } catch (e) {
    // If reanimated isn't installed, default to newer plugin
    // This won't cause issues since the plugin won't be needed anyway
  }

  // Strip `console.*` from production bundles so that the ~390 debug
  // logs sprinkled throughout the codebase don't ship to end users.
  // `console.error` and `console.warn` are preserved so genuine
  // crash/reporting paths still surface. Dev/preview builds keep
  // every call for debugging.
  const productionOnlyPlugins = appEnv === 'production'
    ? [['transform-remove-console', { exclude: ['error', 'warn'] }]]
    : [];

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['react-native-unistyles/plugin', { root: 'sources' }],
      ...productionOnlyPlugins,
      workletsPlugin // Must be last - automatically selects correct plugin for version
    ],
  };
};
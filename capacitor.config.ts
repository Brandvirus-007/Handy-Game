import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android app configuration.
 * IMPORTANT: `appId` becomes the Play Store package name and can never change after the
 * first upload – pick your final one before publishing (also update android/app/build.gradle).
 */
const config: CapacitorConfig = {
  appId: 'app.lumenloop.game',
  appName: 'LUMEN LOOP',
  webDir: 'dist',
  android: {
    backgroundColor: '#05040c',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#05040c',
      showSpinner: false,
    },
  },
};

export default config;

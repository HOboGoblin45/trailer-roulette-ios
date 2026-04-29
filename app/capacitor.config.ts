import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trailerroulette.ios',
  appName: 'Trailer Roulette',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'always',
    scrollEnabled: true,
    backgroundColor: '#0E1726', // dark navy — matches launch screen
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    handleApplicationNotifications: false,
  },
  server: {
    iosScheme: 'app.trailerroulette',
  },
  plugins: {
    // Note: @capacitor/browser was removed in v1.2.0 — trailers now play
    // inline via the YouTube IFrame Player API instead of in
    // SFSafariViewController.
    App: {},
    Haptics: {},
    Dialog: {},
    Preferences: {
      group: 'NSUserDefaults', // single shared store; future: 'app.trailerroulette.shared' for App Group
    },
  },
};

export default config;

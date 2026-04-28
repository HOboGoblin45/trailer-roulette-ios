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
    Browser: {
      // SFSafariViewController presentation defaults
      presentationStyle: 'fullscreen',
    },
    Haptics: {},
    Dialog: {},
    Preferences: {
      group: 'NSUserDefaults', // single shared store; future: 'app.trailerroulette.shared' for App Group
    },
  },
};

export default config;

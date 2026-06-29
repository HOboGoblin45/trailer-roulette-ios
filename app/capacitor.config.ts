import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.trailerroulette.ios',
  appName: 'Trailer Roulette',
  webDir: 'dist',
  ios: {
    // Full-screen immersive UI: CSS owns all insets via viewport-fit=cover +
    // env(safe-area-inset-*). Don't let WKWebView add its own content inset or
    // bounce-scroll — that double-inset was pushing the bottom buttons off the
    // bottom of the screen.
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#000000', // immersive dark video stage
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    handleApplicationNotifications: false,
  },
  server: {
    // 'https' tells WKWebView to serve the bundled web app from
    // `https://localhost` instead of a custom scheme. YouTube embeds
    // validate the parent-page origin during their load handshake and
    // reject non-http(s) schemes with error 153. We hit that on
    // 'app.trailerroulette://localhost' through v1.3.1; switching to
    // 'https' makes the embed see a normal-looking parent and accept it.
    //
    // Side effect: localStorage keyed by the old scheme is invisible to
    // the new scheme. Existing TestFlight users get a fresh watchlist on
    // first launch after this update — acceptable for a pre-release tester
    // group, and Capacitor Preferences (which the app uses for the real
    // persistence) is unaffected because it stores in NSUserDefaults keyed
    // by bundle id, not by web origin.
    iosScheme: 'https',
  },
  plugins: {
    // v1.5.0: trailers play inline via our Vercel-hosted /embed proxy
    // (workaround for WebKit Bug 169846 + YouTube's referer-required
    // embedder check). No Browser plugin needed — see Player.ios.jsx.
    App: {},
    Haptics: {},
    Dialog: {},
    Preferences: {
      group: 'NSUserDefaults', // single shared store; future: 'app.trailerroulette.shared' for App Group
    },
  },
};

export default config;
